# Service Level Objectives & Service Level Agreements

> Last updated: 2025-04-18

## Overview

This document defines the Service Level Objectives (SLOs) and operational guarantees for the AgentGuard API platform. These targets apply to the managed SaaS offering at `api.agentguard.tech`. Self-hosted deployments should use these as reference targets, adjusting for their own infrastructure constraints.

---

## API Availability

| Metric | Target | Measurement |
|--------|--------|-------------|
| **API Availability** | **99.9%** (≤ 8h 45m downtime/month) | Rolling 30-day window |
| **Liveness (`/healthz`)** | 100% uptime | Process must respond within 5s |
| **Readiness (`/readyz`)** | 99.9% | DB + Redis (if configured) must be reachable |

**Definition:** Availability is measured as the percentage of 5-minute intervals where the API returns 200 from `GET /health` (or `GET /api/v1/health/detailed` with status `"ok"`) over a rolling 30-day window.

**Exclusions:** Planned maintenance windows communicated ≥ 24h in advance are excluded from availability calculations.

---

## Policy Evaluation Latency

| Percentile | Target | Scope |
|-----------|--------|-------|
| **p50** | < 10ms | `POST /api/v1/evaluate` |
| **p95** | < 50ms | `POST /api/v1/evaluate` |
| **p99** | < 100ms | `POST /api/v1/evaluate` |
| **p99 batch** | < 500ms | `POST /api/v1/evaluate/batch` (up to 50 items) |

**Measurement:** Server-side latency measured from request receipt to response send, recorded via `http_request_duration_ms` Prometheus histogram. Does not include network round-trip.

**SLI source:** `histogram_quantile(0.99, sum(rate(http_request_duration_ms_bucket{route=~".*evaluat.*"}[5m])) by (le))`

---

## Audit Log Durability

| Property | Guarantee |
|----------|-----------|
| **Write durability** | Write-ahead — audit events are persisted to PostgreSQL before the API response returns |
| **Data loss** | Zero tolerance — acknowledged audit events are never lost |
| **Ordering** | Strictly ordered per-tenant by `created_at` timestamp |
| **Retention** | 90 days (SaaS default), configurable for self-hosted |

**Implementation:** Audit events are inserted synchronously via `storeAuditEvent()` before the evaluate response is sent. The `prev_hash` field provides a tamper-evident chain per tenant.

---

## Rate Limits

Rate limits protect the platform from abuse and ensure fair access. These are the default values; tenant-level overrides are available on Enterprise plans.

| Endpoint | Limit | Window | Authenticated |
|----------|-------|--------|--------------|
| **General API** | 100 req/min | Sliding | Yes (API key / JWT) |
| **General API** | 20 req/min | Sliding | No (IP-based) |
| **`/api/v1/signup`** | 5 req/hour | Fixed | N/A |
| **`/api/v1/evaluate`** | 100 req/min | Sliding | Yes |
| **`/api/v1/evaluate`** | 20 req/min | Sliding | No (brute-force protection) |
| **`/api/v1/auth/*`** | 10 req/min | Fixed | N/A |
| **SCIM (`/api/scim/*`)** | 200 req/min | Sliding | Bearer token |
| **Webhooks** | No rate limit | — | HMAC verified |

**Behavior on limit:** HTTP 429 with `Retry-After` header. Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included on all responses.

**Configuration:** Limits are configurable via environment variables (`RATE_LIMIT_PER_MIN`, `SIGNUP_RATE_LIMIT_PER_HOUR`) and per-tenant in the database.

---

## Incident Response

### Severity Levels

| Severity | Definition | Response Time | Update Cadence |
|----------|-----------|---------------|----------------|
| **SEV1 — Critical** | API down or data loss | 15 minutes | Every 30 minutes |
| **SEV2 — Major** | Degraded performance, partial outage | 1 hour | Every 2 hours |
| **SEV3 — Minor** | Non-critical feature broken, workaround available | 4 hours | Daily |
| **SEV4 — Low** | Cosmetic issues, minor bugs | Next business day | Weekly |

### Contact

- **Security issues:** See [security.txt](/.well-known/security.txt) or email security@thebot.club
- **Status page:** https://status.agentguard.tech
- **Support:** support@agentguard.tech
- **Incident channel:** #incidents on Slack (internal)

### Incident Process

1. **Detect** — Automated alerting via Prometheus/Grafana alerts and health probe failures
2. **Triage** — On-call engineer assesses severity within response time SLA
3. **Communicate** — Status page updated, stakeholders notified
4. **Mitigate** — Apply fix or workaround
5. **Resolve** — Confirm service restored, close incident
6. **Postmortem** — Blameless postmortem within 5 business days for SEV1/SEV2

---

## Monitoring & Observability

### Key Metrics

| Metric Name | Type | Description |
|-------------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests by route, method, status |
| `http_errors_total` | Counter | HTTP 5xx errors by route, method |
| `http_request_duration_ms` | Histogram | Request duration in ms (buckets: 10, 50, 100, 250, 500, 1000, 5000) |
| `http_active_connections` | Gauge | Current active HTTP connections |

### Dashboards

- Pre-built Grafana dashboard: `api/grafana/dashboard.json`
- Import into Grafana via UI or API

### Alerts (Recommended)

- **API down:** `up{job="agentguard-api"} == 0` for 2m
- **High error rate:** `rate(http_errors_total[5m]) / rate(http_requests_total[5m]) > 0.05` for 5m
- **High p99 latency:** `histogram_quantile(0.99, ...) > 100` for 5m
- **Redis down:** Redis health check in `/api/v1/health/detailed` returns error

---

## Self-Hosted Notes

Self-hosted deployments should:

1. Set up Prometheus scraping of `GET /metrics` on the API port
2. Import the Grafana dashboard from `api/grafana/dashboard.json`
3. Configure liveness/readiness probes using `/healthz` and `/readyz`
4. Monitor PostgreSQL and Redis separately (connection pooling, memory, replication lag)
5. Adjust rate limits via environment variables based on capacity
6. Set up log aggregation (structured JSON logs to stdout)

---

## Revision History

| Date | Change |
|------|--------|
| 2025-04-18 | Initial SLO/SLA documentation |
