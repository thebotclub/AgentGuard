# AgentGuard — Production Deployment Checklist

Step-by-step guide for deploying AgentGuard to production. Complete every section in order. Check off each item before proceeding to the next phase.

---

## Table of Contents

1. [Pre-Deployment](#1-pre-deployment)
2. [Deployment Steps](#2-deployment-steps)
   - [Docker Compose](#21-docker-compose)
   - [Kubernetes (Helm)](#22-kubernetes-helm)
   - [Manual / Bare-Metal](#23-manual--bare-metal)
3. [Post-Deployment Verification](#3-post-deployment-verification)
4. [Rollback Procedure](#4-rollback-procedure)
5. [Incident Response](#5-incident-response)
6. [Performance Baseline](#6-performance-baseline)

---

## 1. Pre-Deployment

Complete all items before starting deployment. A failed pre-deployment check should block the deployment.

### 1.1 Environment Variables

All required variables must be set in your secrets store (Azure Key Vault, 1Password, Vault) before deployment.

**Required — API:**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/agentguard` |
| `DATABASE_DIRECT_URL` | Direct (non-pooled) URL for migrations | Same host, bypass PgBouncer |
| `REDIS_URL` | Redis connection string | `redis://:pass@host:6379/0` |
| `JWT_SECRET` | JWT signing key (min 64 bytes, random) | `openssl rand -base64 64` |
| `NODE_ENV` | Must be `production` | `production` |
| `PORT` | API listen port | `3000` |

**Required — Auth & Security:**

| Variable | Description |
|----------|-------------|
| `ADMIN_KEY` | Admin API key (controls global kill switch) |
| `CORS_ORIGINS` | Comma-separated allowed origins |

**Optional — Integrations:**

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API key (billing) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook HMAC secret |
| `SLACK_BOT_TOKEN` | Slack HITL integration |
| `SLACK_SIGNING_SECRET` | Slack webhook verification |
| `OPENAI_API_KEY` | PII detection (optional) |
| `SENTRY_DSN` | Error tracking |

**Checklist:**
- [ ] All required variables are set
- [ ] Variables are stored in secrets manager (not plaintext env files)
- [ ] `JWT_SECRET` is at least 64 bytes of random data
- [ ] `ADMIN_KEY` is unique and not reused from staging
- [ ] `NODE_ENV=production` is set

### 1.2 Secrets Verification

```bash
# Verify all required env vars are present (no empty values)
required_vars=(
  DATABASE_URL DATABASE_DIRECT_URL REDIS_URL
  JWT_SECRET ADMIN_KEY NODE_ENV
)
for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "MISSING: $var"
  else
    echo "OK: $var"
  fi
done
```

- [ ] All required secrets verified present
- [ ] Secrets rotation log updated (when secrets were last rotated)

### 1.3 DNS & SSL

- [ ] DNS A/CNAME records created for:
  - `api.agentguard.tech` → API server
  - `app.agentguard.tech` → Dashboard
  - `docs.agentguard.tech` → Docs
- [ ] DNS propagation verified (`dig api.agentguard.tech`)
- [ ] SSL certificate valid (not expired, correct hostname)
- [ ] Cloudflare Full (Strict) SSL mode enabled (see `docs/SECURITY_HARDENING.md`)
- [ ] HSTS preloading configured

### 1.4 Database

- [ ] PostgreSQL is running and reachable from the API server
- [ ] Database `agentguard` exists
- [ ] Application user `agentguard_api` exists with correct grants
- [ ] Full database backup taken (within last 2 hours)
- [ ] Backup verified as restorable
- [ ] All pending Prisma migrations applied:
  ```bash
  npx prisma migrate status
  # Expected: "All migrations have been applied"
  ```
- [ ] Raw SQL migrations applied (if applicable):
  - [ ] `rls-migration.sql`
  - [ ] `wave2-agent-key-bcrypt.sql`
  - [ ] `partition-audit-events.sql`
  - [ ] `partition-maintenance.sql`

### 1.5 Infrastructure

- [ ] Redis is running and reachable
- [ ] Load balancer health check is configured (`/healthz`)
- [ ] Container registry has the target image (verify tag/digest)
- [ ] Firewall rules allow:
  - API → PostgreSQL (port 5432)
  - API → Redis (port 6379)
  - Load balancer → API (port 3000)
  - Public → Load balancer (443)

---

## 2. Deployment Steps

### 2.1 Docker Compose

```bash
# 1. Pull the latest image
docker compose -f docker-compose.prod.yml pull

# 2. Check current state
docker compose -f docker-compose.prod.yml ps

# 3. Deploy with rolling restart (zero-downtime on single host)
docker compose -f docker-compose.prod.yml up -d --no-deps api

# 4. Verify the new container is healthy
docker compose -f docker-compose.prod.yml ps api
docker compose -f docker-compose.prod.yml logs api --tail=50

# 5. Smoke test
curl -f https://api.agentguard.tech/healthz && echo "OK"

# 6. Run database migrations (if needed)
docker compose -f docker-compose.prod.yml exec api \
  npx prisma migrate deploy

# 7. Full stack restart (use only if needed)
docker compose -f docker-compose.prod.yml up -d
```

**Post-deployment verification:**
- [ ] API container running (`docker compose ps`)
- [ ] No error logs in first 2 minutes (`docker logs --tail=100`)
- [ ] `/healthz` returns 200
- [ ] `/readyz` returns 200

### 2.2 Kubernetes (Helm)

```bash
# 1. Add / update the chart repository (if using a Helm registry)
helm repo add agentguard https://charts.agentguard.tech
helm repo update

# 2. Set your values (prefer --values file over --set for secrets)
cp helm/agentguard/values.yaml helm/agentguard/values.production.yaml
# Edit values.production.yaml to set image tag, resource limits, etc.

# 3. Dry-run to preview changes
helm upgrade agentguard ./helm/agentguard \
  --namespace agentguard \
  --values helm/agentguard/values.production.yaml \
  --dry-run

# 4. Deploy
helm upgrade --install agentguard ./helm/agentguard \
  --namespace agentguard \
  --create-namespace \
  --values helm/agentguard/values.production.yaml \
  --set image.tag="v0.9.0" \
  --wait \
  --timeout=5m

# 5. Verify rollout
kubectl rollout status deployment/agentguard -n agentguard

# 6. Check pods
kubectl get pods -n agentguard
kubectl logs -l app.kubernetes.io/name=agentguard -n agentguard --tail=50

# 7. Run migrations as a Kubernetes Job
kubectl create job --from=cronjob/agentguard-migrate agentguard-migrate-$(date +%s) \
  -n agentguard
# or via exec into pod:
kubectl exec -it deploy/agentguard -n agentguard -- npx prisma migrate deploy
```

**Pre-deployment checks:**
```bash
# Verify current Helm release
helm status agentguard -n agentguard

# Get current image tag (know what you're replacing)
kubectl get deployment agentguard -n agentguard \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
```

**Post-deployment:**
- [ ] All pods in `Running` state
- [ ] `kubectl rollout status` returned "successfully rolled out"
- [ ] No CrashLoopBackOff in pod events
- [ ] Ingress endpoint returns 200

### 2.3 Manual / Bare-Metal

```bash
# 1. Connect to the server
ssh agentguard@api-server-hostname

# 2. Navigate to deployment directory
cd /opt/agentguard

# 3. Pull latest code
git fetch origin
git checkout v0.9.0  # replace with target tag

# 4. Install dependencies
npm ci --workspaces --include-workspace-root

# 5. Build
npm run build

# 6. Run database migrations
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy

# 7. Reload the service (using systemd)
sudo systemctl reload agentguard-api

# 8. Verify
sudo systemctl status agentguard-api
curl -f http://localhost:3000/healthz && echo "OK"

# 9. Tail logs
sudo journalctl -u agentguard-api -f
```

**Systemd service file** (`/etc/systemd/system/agentguard-api.service`):

```ini
[Unit]
Description=AgentGuard API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=agentguard
WorkingDirectory=/opt/agentguard
EnvironmentFile=/etc/agentguard/env
ExecStart=/usr/bin/node dist/api/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

---

## 3. Post-Deployment Verification

Run all checks within 15 minutes of deployment. Rollback immediately if any critical check fails.

### 3.1 Health Checks

```bash
BASE_URL="https://api.agentguard.tech"

# Liveness check
curl -f "$BASE_URL/healthz" && echo "✓ Liveness OK"

# Readiness check (DB + Redis + migrations)
curl -f "$BASE_URL/readyz" && echo "✓ Readiness OK"

# Detailed health
curl -s "$BASE_URL/health" | jq .
```

Expected readiness response:
```json
{
  "status": "ok",
  "db": "postgres",
  "redis": "connected",
  "migrations": "current"
}
```

- [ ] `/healthz` returns HTTP 200
- [ ] `/readyz` returns HTTP 200
- [ ] `db` is not `error`
- [ ] `redis` is `connected`

### 3.2 Smoke Tests

```bash
BASE_URL="https://api.agentguard.tech"
API_KEY="ag_live_your_test_key"

# 1. Root endpoint
curl -s "$BASE_URL/" | jq '.status'
# Expected: "online"

# 2. Evaluate (core functionality — unauthenticated)
curl -s -X POST "$BASE_URL/api/v1/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"tool": "read_file", "params": {"path": "/etc/passwd"}}' | jq '.decision'
# Expected: "block" (matches security policy)

# 3. Authenticated evaluate
curl -s -X POST "$BASE_URL/api/v1/evaluate" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool": "read_file", "params": {"path": "/tmp/report.txt"}}' | jq '.decision'
# Expected: "allow" (safe file path)

# 4. Audit trail
curl -s "$BASE_URL/api/v1/audit" \
  -H "X-API-Key: $API_KEY" | jq '.events | length'
# Expected: >= 1 (at least the evaluate above)

# 5. Kill switch status
curl -s "$BASE_URL/api/v1/killswitch" \
  -H "X-API-Key: $API_KEY" | jq '.active'
# Expected: false

# 6. Rate limit headers present
curl -si "$BASE_URL/api/v1/evaluate" \
  -X POST -H "Content-Type: application/json" \
  -d '{"tool": "test"}' | grep -i "x-ratelimit"
# Expected: X-RateLimit-Limit and X-RateLimit-Remaining headers
```

- [ ] Root endpoint returns `status: "online"`
- [ ] Unauthenticated evaluate works (uses default policy)
- [ ] Authenticated evaluate works
- [ ] Audit trail accessible
- [ ] Kill switch is inactive
- [ ] Rate limit headers present

### 3.3 Monitoring Verification

- [ ] APM/metrics receiving data (Datadog, Azure Monitor, etc.)
- [ ] Error rate < 1% (check your metrics dashboard)
- [ ] P99 latency < 500ms (see [Performance Baseline](#6-performance-baseline))
- [ ] No alerts firing
- [ ] Logs streaming to log aggregator (Logtail, Datadog, etc.)
- [ ] Audit chain integrity verified:
  ```bash
  curl -s "$BASE_URL/api/v1/audit/verify" \
    -H "X-API-Key: $API_KEY" | jq '.valid'
  # Expected: true
  ```

---

## 4. Rollback Procedure

Use this procedure if a deployment causes errors or fails smoke tests.

### Decision Criteria — Rollback Now If:

- `/healthz` or `/readyz` returns non-200 after 2 minutes
- Error rate > 5% within 10 minutes of deployment
- Any critical functionality smoke test fails
- Database connectivity lost
- Memory leak causing OOM kills

### 4.1 Docker Compose Rollback

```bash
# Roll back to previous image
docker compose -f docker-compose.prod.yml stop api
docker tag agentguard-api:previous agentguard-api:current
docker compose -f docker-compose.prod.yml up -d api

# If the previous image tag is known
docker compose -f docker-compose.prod.yml \
  up -d api --no-deps \
  --scale api=0  # stop current
docker run -d --name agentguard-api-rollback \
  agentguard-api:v0.8.2  # previous version

# Verify rollback
curl -f https://api.agentguard.tech/healthz && echo "Rollback OK"
```

### 4.2 Kubernetes Rollback

```bash
# Immediate rollback to previous Helm release
helm rollback agentguard -n agentguard

# Or roll back to a specific revision
helm history agentguard -n agentguard  # find revision number
helm rollback agentguard 3 -n agentguard  # roll back to revision 3

# Verify rollback
kubectl rollout status deployment/agentguard -n agentguard
curl -f https://api.agentguard.tech/healthz && echo "Rollback OK"
```

### 4.3 Manual / Bare-Metal Rollback

```bash
cd /opt/agentguard
git checkout v0.8.2  # previous known-good tag
npm ci --workspaces
npm run build
sudo systemctl restart agentguard-api
```

### 4.4 Database Migration Rollback

If the deployment included a database migration that must be undone:

```bash
# Run the appropriate rollback script (see docs/DATABASE_OPS.md)
psql $DATABASE_URL -f packages/api/prisma/rollbacks/rollback-<migration>.sql

# Then redeploy the previous API version
# DO NOT run rollback-rls-migration.sql without security lead approval
```

⚠️ **Never roll back Prisma migrations with `migrate reset`** in production — this destroys all data. Only use rollback SQL scripts.

### 4.5 Rollback Timeline

| Time | Action |
|------|--------|
| T+0 | Deployment starts |
| T+5 min | Health checks / smoke tests |
| T+10 min | Decision point — proceed or rollback |
| T+15 min | Rollback command executed (if needed) |
| T+25 min | Rollback verification complete |
| T+30 min | Incident report opened (if rollback needed) |

---

## 5. Incident Response

### Escalation Path

| Severity | Description | Response Time | Escalate To |
|----------|-------------|---------------|-------------|
| P0 — Critical | Service down, data breach | 15 min | On-call engineer → CTO |
| P1 — High | Partial outage, auth failing | 30 min | On-call engineer |
| P2 — Medium | Degraded performance | 2 hours | Engineering team |
| P3 — Low | Non-critical bug | Next business day | Standard ticket |

### On-Call Contact

- **Primary on-call:** Check your team's PagerDuty/OpsGenie rotation
- **Escalation:** CTO / Head of Engineering
- **Security incidents:** security@agentguard.tech + immediate Slack DM to security lead

### First Response Runbook

When alerted to an incident:

1. **Acknowledge** the alert in PagerDuty/OpsGenie (within 5 minutes)
2. **Triage** — determine severity using the table above
3. **Check health:**
   ```bash
   curl -s https://api.agentguard.tech/healthz | jq .
   curl -s https://api.agentguard.tech/readyz | jq .
   ```
4. **Check logs** (last 100 lines):
   ```bash
   # Docker
   docker logs agentguard-api --tail=100
   # Kubernetes
   kubectl logs -l app=agentguard -n agentguard --tail=100
   ```
5. **Check error rate** in your metrics dashboard
6. **Check recent deployments** — was there a deploy in the last hour?
7. **Decide:** Rollback or fix-forward?
8. **Communicate** status in the incident Slack channel every 15 minutes

### Common Failure Modes

| Symptom | Likely Cause | First Action |
|---------|-------------|-------------|
| `/healthz` returns 503 | DB or Redis down | Check DB/Redis connectivity |
| High 429 rate | Rate limiter mis-configured | Check Redis, check IP source |
| High 500 rate | Application error | Check logs for stack trace |
| Auth failures | JWT_SECRET mismatch | Verify env var matches secrets |
| Slow responses | DB query performance | Check pg_stat_activity, slow query log |
| OOM kills | Memory leak | Roll back to previous version |

### Runbook Links

- [Rate Limiting Runbook](./SECURITY_HARDENING.md#1-rate-limiting)
- [Database Recovery Runbook](./DATABASE_OPS.md#6-point-in-time-recovery)
- [Kill Switch Activation](./LAUNCH_GUIDE.md#kill-switch)
- [SCIM Provisioning Issues](./ARCHITECTURE.md#scim)

### Security Incidents

If a security incident is suspected (data breach, unauthorized access, injection attack):

1. **Do NOT** try to fix silently — escalate immediately
2. Activate the kill switch if agents are affected:
   ```bash
   curl -X POST https://api.agentguard.tech/api/v1/admin/killswitch \
     -H "X-Admin-Key: $ADMIN_KEY" \
     -H "Content-Type: application/json" \
     -d '{"active": true, "reason": "Security incident investigation"}'
   ```
3. Contact security@agentguard.tech
4. Preserve logs — do not rotate or delete
5. Follow your organization's incident response plan

---

## 6. Performance Baseline

Expected performance metrics for a standard production deployment (2 vCPU / 4 GB RAM API, PostgreSQL 16, Redis 7).

### Response Time Targets

| Endpoint | P50 | P95 | P99 | SLA |
|----------|-----|-----|-----|-----|
| `POST /api/v1/evaluate` | 15ms | 50ms | 150ms | < 500ms |
| `POST /api/v1/evaluate/batch` | 40ms | 120ms | 300ms | < 1000ms |
| `GET /api/v1/audit` | 20ms | 80ms | 200ms | < 500ms |
| `GET /healthz` | < 5ms | < 10ms | < 20ms | < 50ms |
| `GET /readyz` | < 20ms | < 50ms | < 100ms | < 200ms |

> **Note:** Evaluate latency depends on policy complexity. Times above assume the default policy template with 5–10 rules.

### Throughput Targets

| Metric | Target |
|--------|--------|
| Evaluate RPS (sustained) | 500 req/s per pod |
| Evaluate RPS (peak burst) | 1,000 req/s per pod |
| Batch evaluate RPS | 50 batches/s per pod |
| DB connections (steady state) | 10–25 per pod |
| Redis ops/s | 200–500 per pod |

### Resource Usage (Per API Pod)

| Resource | Idle | Normal Load | Peak |
|----------|------|-------------|------|
| CPU | 2% | 20–40% | 70% |
| Memory (RSS) | 120 MB | 200–350 MB | 500 MB |
| Memory (heap) | 80 MB | 150–250 MB | 380 MB |
| DB connections | 3 | 10–15 | 25 |

Alert thresholds:
- CPU > 80% sustained for 5 minutes → scale out
- Memory > 600 MB → investigate for leak, consider restart
- P99 latency > 500ms → investigate (DB slow query? Redis timeout?)
- Error rate > 1% → investigate (check 5xx in logs)

### Scaling Guidelines

| Traffic Level | Recommended Pods | DB Connections |
|---------------|-----------------|----------------|
| < 100 req/s | 1–2 pods | 5–10/pod |
| 100–500 req/s | 2–4 pods | 10–15/pod |
| 500–2000 req/s | 4–8 pods | 10–20/pod |
| > 2000 req/s | 8+ pods + read replicas | Use PgBouncer |

### Load Testing

Before production traffic, validate performance with:

```bash
# Install k6
brew install k6

# Run the load test (see docs/LOAD_TESTING.md for full script)
k6 run --vus 50 --duration 60s scripts/load-test.js

# Expected output for healthy system:
# http_req_duration p(95)=45.12ms p(99)=98.23ms
# http_req_failed rate=0.01%
```

---

*Last updated: Wave 12 Production Hardening. See git log for revision history.*
