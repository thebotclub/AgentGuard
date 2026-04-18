# AgentGuard — Deployment Guide

Deploy AgentGuard on your terms: managed cloud, self-hosted Docker, or Kubernetes.

---

## Table of Contents

1. [Deployment Options Overview](#deployment-options-overview)
2. [Cloud (Managed)](#cloud-managed)
3. [Self-Hosted (Docker Compose)](#self-hosted-docker-compose)
4. [Self-Hosted (Kubernetes)](#self-hosted-kubernetes)
5. [Environment Variables Reference](#environment-variables-reference)
6. [Production Checklist](#production-checklist)

---

## Deployment Options Overview

| Option | Best for | Data residency | Maintenance |
|---|---|---|---|
| **Cloud (managed)** | Teams that want zero ops | Shared infrastructure | Handled by us |
| **Docker Compose** | Self-hosting on a single server | Your infrastructure | You manage |
| **Kubernetes** | Enterprise-scale self-hosting | Your infrastructure | You manage |

All options use the same API surface, SDKs, and dashboard. Policies, agents, and audit logs work identically regardless of deployment method.

---

## Cloud (Managed)

The fastest way to get started. Sign up and you're live.

### Sign Up

```bash
curl -X POST https://api.agentguard.tech/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"name": "My Agent"}'
```

Returns an API key. Use it with the SDK:

```typescript
import { AgentGuard } from '@agentguard/sdk';
const guard = new AgentGuard({ apiKey: 'agkey_...' });
```

### Managed Dashboard

The web dashboard is available at `app.agentguard.tech` after sign-up. Manage agents, policies, audit logs, and webhooks through the UI.

### Try the Demo

No sign-up required. Visit `demo.agentguard.tech` for a fully interactive playground.

---

## Self-Hosted (Docker Compose)

Run the full stack — API, Dashboard, Worker, PostgreSQL, Redis — on a single host.

### Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 100 GB (audit logs) |
| Docker | 24.0+ | Latest |
| Docker Compose | v2.20+ | Latest |

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/thebotclub/agentguard.git
cd agentguard

# 2. Run the interactive setup script
bash scripts/self-hosted-setup.sh

# 3. Open the dashboard
open http://localhost:3001
```

The setup script generates all secrets, builds images, starts services in dependency order, and runs database migrations.

### Manual Setup

If you prefer to configure things yourself:

```bash
# 1. Create environment file
cp .env.example .env

# 2. Edit .env — set at minimum:
#    POSTGRES_PASSWORD, JWT_SECRET, INTEGRATION_ENCRYPTION_KEY, ADMIN_KEY

# 3. Build and start
docker compose build
docker compose up -d

# 4. Check health
curl http://localhost:3000/health
```

### Ports

| Port | Service | Configurable? |
|---|---|---|
| 3000 | API | ✅ `API_PORT` |
| 3001 | Dashboard | ✅ `DASHBOARD_PORT` |
| 5432 | PostgreSQL | Internal only |
| 6379 | Redis | Internal only |

PostgreSQL and Redis are only accessible within the Docker network — they are not exposed to the host.

### Production Docker Compose

For production deployments, use `docker-compose.prod.yml` which includes additional hardening (resource limits, restart policies, non-root containers).

```bash
docker compose -f docker-compose.prod.yml up -d
```

### TLS / SSL

AgentGuard itself runs plain HTTP inside Docker. Terminate TLS at a reverse proxy:

- **Nginx** — see the self-hosted guide's [TLS section](/docs/SELF_HOSTED.md#tls--ssl-setup)
- **Caddy** — automatic HTTPS with zero configuration

> The managed cloud deployment uses Cloudflare SSL Full (Strict).

---

## Self-Hosted (Kubernetes)

For teams running Kubernetes clusters, AgentGuard can be deployed as a set of standard Kubernetes resources.

### Architecture

```
┌─────────────────────────────────────────────┐
│              Kubernetes Cluster              │
│                                              │
│  ┌───────────┐  ┌──────────┐  ┌───────────┐ │
│  │ API (3x)  │  │ Dashboard│  │ Worker(2x)│ │
│  │ :3000     │  │ :3001    │  │ :3002     │ │
│  └─────┬─────┘  └────┬─────┘  └─────┬─────┘ │
│        │              │              │       │
│  ┌─────┴──────────────┴──────────────┴─────┐ │
│  │            Service (ClusterIP)          │ │
│  └──────────────────┬──────────────────────┘ │
│                     │                        │
│  ┌──────────┐  ┌───┴─────┐                  │
│  │PostgreSQL│  │  Redis  │                  │
│  │(Stateful)│  │ (3x)    │                  │
│  └──────────┘  └─────────┘                  │
└─────────────────────────────────────────────┘
```

### Deployment Steps

1. **Create namespace and secrets:**

```bash
kubectl create namespace agentguard

kubectl -n agentguard create secret generic agentguard-secrets \
  --from-literal=jwt-secret="$(openssl rand -base64 64)" \
  --from-literal=integration-encryption-key="$(openssl rand -base64 32)" \
  --from-literal=admin-key="$(openssl rand -hex 24)" \
  --from-literal=postgres-password="$(openssl rand -hex 16)"
```

2. **Deploy PostgreSQL and Redis** (use your preferred operators or charts — see the Docker Compose file for image versions and configuration).

3. **Deploy AgentGuard services** — build images from the repo and deploy as Deployments. Each service needs the secrets mounted as environment variables (see the [Environment Variables Reference](#environment-variables-reference)).

4. **Create Ingress** to expose the API and Dashboard:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: agentguard
  namespace: agentguard
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
    - hosts:
        - agentguard.your-domain.com
      secretName: agentguard-tls
  rules:
    - host: agentguard.your-domain.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: agentguard-api
                port:
                  number: 3000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: agentguard-dashboard
                port:
                  number: 3001
```

5. **Run database migrations:**

```bash
kubectl -n agentguard exec -it deployment/agentguard-api -- npx prisma migrate deploy
```

### Scaling

| Component | Recommended Replicas | Notes |
|---|---|---|
| API | 3+ | Stateless — scale with HPA |
| Dashboard | 2+ | Static assets served by Next.js |
| Worker | 2+ | Background jobs — scale based on queue depth |
| PostgreSQL | 1 (StatefulSet) | Use managed DB if available |
| Redis | 3 (Sentinel) or managed | Use managed Redis if available |

### Persistence

- **PostgreSQL:** Use a PersistentVolumeClaim with `ReadWriteOnce` access mode. `pg-data` volume.
- **Redis:** Enable AOF persistence (`appendonly yes`). `redis-data` volume.
- **API:** Local `/data` mount for temporary files (no persistent state required).

> For detailed Kubernetes manifests and Helm charts, see the `self-hosted/` directory in the repository.

---

## Environment Variables Reference

### Required

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/agentguard` |
| `REDIS_URL` | Redis connection string | `redis://:pass@host:6379/0` |
| `JWT_SECRET` | JWT signing key (min 64 bytes, random) | `openssl rand -base64 64` |
| `INTEGRATION_ENCRYPTION_KEY` | Encryption key for stored secrets (32 bytes) | `openssl rand -base64 32` |
| `ADMIN_KEY` | Admin API key (global kill switch) | `openssl rand -hex 24` |
| `NODE_ENV` | Must be `production` for production deployments | `production` |
| `PORT` | API listen port | `3000` |

### Optional — Auth & SSO

| Variable | Description |
|---|---|
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `JWT_JWKS_URL` | JWKS endpoint for SSO token verification |
| `JWT_AUDIENCE` | Expected `aud` claim in JWT tokens |
| `JWT_ISSUER` | Expected `iss` claim in JWT tokens |

### Optional — Integrations

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe API key (billing) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook HMAC secret |
| `SLACK_BOT_TOKEN` | Slack HITL integration |
| `SLACK_SIGNING_SECRET` | Slack webhook verification |
| `SLACK_CHANNEL_ID` | Default Slack channel for HITL |
| `OPENAI_API_KEY` | PII detection (optional, uses OpenAI) |
| `SENTRY_DSN` | Error tracking |

### Optional — Rate Limiting

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_PER_MIN` | `100` | Per-tenant requests per minute |
| `SIGNUP_RATE_LIMIT_PER_HOUR` | `5` | Signup rate limit (anti-abuse) |

### Optional — Observability

| Variable | Description |
|---|---|
| `LOG_LEVEL` | Log verbosity (`debug`, `info`, `warn`, `error`) |
| `AGENTGUARD_NO_TELEMETRY` | Set to `1` to disable anonymous usage telemetry |
| `SENTRY_DSN` | Sentry error tracking |

---

## Production Checklist

Before going live, work through the full production deployment checklist:

👉 **[Production Checklist](/docs/PRODUCTION_CHECKLIST.md)**

Key items:
- [ ] All required environment variables set in secrets manager (not plaintext)
- [ ] TLS termination configured with valid certificates
- [ ] Database backups automated and tested
- [ ] Health endpoints (`/health`) monitored
- [ ] Rate limits configured for expected traffic
- [ ] CORS origins restricted to your domains
- [ ] Admin key rotated from default and stored securely
- [ ] Docker images pinned to specific versions (not `latest`)

---

## Next Steps

- **Self-hosted deep dive:** [Self-Hosted Guide](/docs/SELF_HOSTED.md) — TLS, backup, upgrade, monitoring
- **Production checklist:** [Production Checklist](/docs/PRODUCTION_CHECKLIST.md)
- **Architecture overview:** [Architecture](/docs/architecture.md)
- **Security hardening:** [Security Hardening](/docs/SECURITY_HARDENING.md)
