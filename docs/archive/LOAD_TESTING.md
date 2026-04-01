# AgentGuard Load Testing Guide

## Overview

This guide covers running load tests against AgentGuard, interpreting results, and tuning
the system for enterprise-scale workloads.

**Tools:** [k6](https://k6.io) — open-source load testing framework

**Scripts:** `tests/load/`

---

## Prerequisites

### Install k6

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6
```

### Prepare Test Credentials

```bash
# 1. Get an API key for the test tenant
export API_KEY="ag-your-test-api-key"

# 2. Get a JWT token (sign in to dashboard)
export JWT_TOKEN="your-jwt-token"

# 3. Create a SCIM token (for SCIM tests)
curl -X POST https://api.agentguard.tech/api/scim/v2/tokens \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label": "load-test"}' | jq '.token'
export SCIM_TOKEN="ag-scim-your-scim-token"

# 4. Set base URL
export BASE_URL="https://api.agentguard.tech"
# Or for local: export BASE_URL="http://localhost:3000"
```

---

## Running Tests

### Policy Evaluation Throughput

**Target: 10,000 evaluations/second**

```bash
k6 run tests/load/policy-evaluation.js \
  -e BASE_URL=$BASE_URL \
  -e API_KEY=$API_KEY \
  --out json=results/policy-eval-$(date +%Y%m%d-%H%M%S).json \
  --summary-export=results/policy-eval-summary.json
```

**Expected runtime:** ~7 minutes

**Key metrics to watch:**
- `http_req_duration{p:99}` — must stay < 100ms
- `eval_throughput` (counter) — target: 10,000+ per second
- `eval_errors` — must stay < 0.5%

### SSE Connection Scale

**Target: 5,000 concurrent connections**

```bash
# Increase OS file descriptor limit first!
ulimit -n 65536

k6 run tests/load/sse-connections.js \
  -e BASE_URL=$BASE_URL \
  -e JWT_TOKEN=$JWT_TOKEN \
  --vus 5000 \
  --out json=results/sse-$(date +%Y%m%d-%H%M%S).json
```

**Expected runtime:** ~9 minutes

**Key metrics:**
- `sse_connections_established` — should reach 5,000
- `sse_connection_errors{rate}` — must stay < 2%
- `sse_time_to_first_event_ms{p:95}` — must be < 2,000ms

### Dashboard API Response Time

**Target: P99 < 200ms**

```bash
k6 run tests/load/dashboard-api.js \
  -e BASE_URL=$BASE_URL \
  -e JWT_TOKEN=$JWT_TOKEN \
  --out json=results/dashboard-$(date +%Y%m%d-%H%M%S).json
```

**Expected runtime:** ~7.5 minutes

**Key metrics:**
- `http_req_duration{p:99}` — must be < 200ms
- `dashboard_p99_violations` — count of P99 misses
- `dashboard_api_errors{rate}` — must be < 1%

### Webhook Delivery Throughput

```bash
k6 run tests/load/webhook-delivery.js \
  -e BASE_URL=$BASE_URL \
  -e API_KEY=$API_KEY \
  -e JWT_TOKEN=$JWT_TOKEN \
  --out json=results/webhooks-$(date +%Y%m%d-%H%M%S).json
```

**Expected runtime:** ~5 minutes

### SCIM Provisioning Bulk Operations

```bash
k6 run tests/load/scim-provisioning.js \
  -e BASE_URL=$BASE_URL \
  -e SCIM_TOKEN=$SCIM_TOKEN \
  --out json=results/scim-$(date +%Y%m%d-%H%M%S).json
```

**Expected runtime:** ~5 minutes

---

## Performance Tuning Guide

### 1. Policy Evaluation Throughput

#### Redis Policy Cache
The single biggest performance lever. Caches compiled policy AST for each tenant.

```bash
# Enable Redis
REDIS_URL=redis://your-redis:6379 npm start

# Verify cache hits
curl http://localhost:3000/health | jq .cache
```

**Impact:** Reduces P99 by 60-70% (eliminates policy re-compilation per request)

#### Horizontal Scaling
```yaml
# docker-compose.yml
api:
  deploy:
    replicas: 5  # Scale from 3 → 5 for 10K/s
```

**Impact:** Linear throughput scaling up to ~5 nodes (beyond that, DB becomes bottleneck)

#### PostgreSQL Connection Pool
```bash
# In environment
DB_POOL_MAX=30          # Increase from 20 → 30
DB_IDLE_TIMEOUT=60000   # Keep connections warm
```

**Impact:** Reduces audit insertion latency by 20-30%

#### Async Audit Writes
For maximum throughput, decouple audit logging from the evaluation response:

```typescript
// Enabled via feature flag
ASYNC_AUDIT=true npm start
```

**Impact:** Reduces evaluation P99 by 15-20ms (moves DB write off critical path)

---

### 2. SSE Connection Scale

#### OS-Level Limits
```bash
# /etc/security/limits.conf
* soft nofile 65536
* hard nofile 65536

# Verify
ulimit -n  # Should show 65536
```

#### NGINX Configuration for SSE
```nginx
# nginx.conf
upstream api {
    server api:3000;
    keepalive 500;  # Keep upstream connections alive
}

server {
    location /api/v1/audit/stream {
        proxy_pass http://api;
        proxy_buffering off;          # Critical for SSE
        proxy_cache off;              # No caching for SSE
        proxy_read_timeout 3600s;     # Long timeout for SSE
        proxy_send_timeout 3600s;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;

        # SSE headers
        add_header 'Cache-Control' 'no-cache';
        add_header 'X-Accel-Buffering' 'no';
    }
}
```

#### Node.js Server Configuration
```bash
# Increase libuv thread pool for concurrent connections
UV_THREADPOOL_SIZE=64 npm start

# Set maximum connections per process
MAX_CONNECTIONS=10000 npm start
```

---

### 3. Dashboard API Response Time

#### Database Indexing
Run these indexes for common dashboard queries:

```sql
-- Audit events: tenant + time range (most common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_tenant_time
  ON audit_events(tenant_id, created_at DESC);

-- Agents: active agents per tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_tenant_active
  ON agents(tenant_id, active);

-- Compliance: latest report per tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compliance_tenant_created
  ON compliance_reports(tenant_id, created_at DESC);

-- Alerts: unresolved alerts per tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_tenant_resolved
  ON alerts(tenant_id, resolved_at);
```

#### Response Caching (Redis)
For read-heavy dashboard endpoints, enable short-TTL caching:

```bash
DASHBOARD_CACHE_TTL=5  # 5 second TTL for summary/stats endpoints
ANALYTICS_CACHE_TTL=60 # 60 second TTL for analytics (less real-time need)
```

#### Query Optimization for Analytics
```sql
-- Pre-aggregate usage stats (run as cron job every 5 minutes)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_tenant_stats AS
SELECT
  tenant_id,
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS total,
  SUM(CASE WHEN result = 'allow' THEN 1 ELSE 0 END) AS allowed,
  SUM(CASE WHEN result = 'block' THEN 1 ELSE 0 END) AS blocked,
  AVG(duration_ms) AS avg_duration_ms
FROM audit_events
GROUP BY tenant_id, DATE_TRUNC('hour', created_at);

CREATE INDEX ON mv_tenant_stats(tenant_id, hour DESC);

-- Refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_stats;
```

---

### 4. Webhook Delivery Throughput

#### Worker Pool Sizing
```bash
# Scale worker processes
WEBHOOK_WORKERS=10     # Default: 5
WEBHOOK_QUEUE_SIZE=10000  # Max queue depth
WEBHOOK_RETRY_DELAY=1000  # ms between retries
WEBHOOK_TIMEOUT=5000   # ms per delivery attempt
```

#### Async Queue (Redis-backed)
For high throughput, switch from in-memory queue to Redis-backed:

```bash
WEBHOOK_QUEUE=redis     # Default: memory
REDIS_URL=redis://your-redis:6379
```

---

### 5. SCIM Provisioning

#### Bulk Import Strategy
For initial enterprise sync (10K+ users), use sequential batching:

```bash
# Use startIndex pagination
for page in $(seq 1 10 10000); do
  curl -X GET "$BASE_URL/api/scim/v2/Users?startIndex=$page&count=100" \
    -H "Authorization: Bearer $SCIM_TOKEN"
done
```

#### Database Optimization for SCIM
```sql
-- Partial index: only active SCIM users (most queries filter deleted_at IS NULL)
CREATE INDEX CONCURRENTLY idx_scim_users_active
  ON scim_users(tenant_id, user_name)
  WHERE deleted_at IS NULL;

-- External ID lookup optimization
CREATE INDEX CONCURRENTLY idx_scim_users_external_id
  ON scim_users(tenant_id, external_id)
  WHERE external_id IS NOT NULL;
```

---

## Monitoring During Load Tests

### Key Metrics (Prometheus/Grafana)

```yaml
# Metrics to watch during load tests
- agentguard_evaluations_total          # Throughput counter
- agentguard_evaluation_duration_ms     # Latency histogram
- agentguard_audit_events_total         # Audit write throughput
- agentguard_sse_connections_active     # Active SSE connections
- agentguard_webhook_queue_depth        # Webhook backlog
- agentguard_scim_operations_total      # SCIM operation counter
- process_resident_memory_bytes         # Memory usage
- nodejs_eventloop_lag_seconds          # Event loop health
```

### Real-Time Dashboard

```bash
# Stream k6 metrics to Grafana Cloud
k6 run tests/load/policy-evaluation.js \
  -e BASE_URL=$BASE_URL \
  -e API_KEY=$API_KEY \
  --out grafana-cloud=api_key=your-key,url=https://your-stack.grafana.net/api/prom/push
```

### Health Check During Test

```bash
# Monitor in a separate terminal during load test
watch -n 5 'curl -s http://localhost:3000/health | jq .'
```

---

## Interpreting Results

### k6 Summary Output

```
✓ status 200 .................... 99.8%
✓ has result field .............. 99.9%
✓ response time < 100ms ......... 95.2%

http_req_duration............... avg=18ms   min=2ms    med=12ms   max=380ms  p(90)=45ms   p(95)=72ms   p(99)=115ms

eval_throughput................. 8523.4/s   (target: 10000/s)
eval_errors..................... 0.22%      (target: <0.5%)
```

### Pass/Fail Criteria

| Metric | Pass | Warning | Fail |
|--------|------|---------|------|
| Error rate | < 0.5% | 0.5-2% | > 2% |
| P99 latency | < 100ms | 100-200ms | > 200ms |
| SSE error rate | < 1% | 1-3% | > 3% |
| SCIM P99 create | < 500ms | 500ms-1s | > 1s |

---

## Test Result Storage

Results are stored in `tests/load/results/` (gitignored).

```bash
# View JSON results
cat results/policy-eval-summary.json | jq '.metrics.http_req_duration'

# Compare two runs
diff <(cat results/run1-summary.json | jq '.metrics') \
     <(cat results/run2-summary.json | jq '.metrics')
```

---

## CI/CD Integration

Add load tests to your pipeline (runs nightly, not on every PR):

```yaml
# .github/workflows/load-test.yml
name: Load Tests (Nightly)
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC daily
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install k6
        run: |
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 \
            --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
            sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update && sudo apt-get install k6

      - name: Run Policy Evaluation Load Test
        env:
          BASE_URL: ${{ secrets.LOAD_TEST_BASE_URL }}
          API_KEY: ${{ secrets.LOAD_TEST_API_KEY }}
        run: |
          k6 run tests/load/policy-evaluation.js \
            -e BASE_URL=$BASE_URL \
            -e API_KEY=$API_KEY \
            --exit-on-running-error \
            --summary-export=results/policy-eval.json

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: results/
```

---

## Baseline Results

See [`tests/load/baseline-results.md`](../tests/load/baseline-results.md) for detailed
baseline measurements, expected vs. actual metrics, and identified bottlenecks.
