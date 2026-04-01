# AgentGuard v0.10.0 — Remediation Plan (Final)

**Date:** March 31, 2026 | **Completed:** April 1, 2026
**Status:** ✅ ALL 16 ITEMS COMPLETE — All phases implemented and validated
**Prepared by:** Architecture, Security, DevOps, UX review panel
**Based on:** Architect review + code audit + staff-engineer critique of main branch

---

## Executive Summary

This plan addresses **16 items** in **3 phases** totaling **24 engineering days**:
- **Phase 1 + 2: 19 days** (execution scope — required before design-partner onboarding)
- **Phase 3: 5 days** (feature completeness — after design-partner gate)

The plan was reduced from an initial 28-day proposal after eliminating over-engineering, deferring premature optimizations, and verifying that 8 critical security issues were already resolved in Wave 1.

The codebase is fundamentally sound. All 25 items from the v0.8.0 remediation plan have been verified as complete. All 8 P0 security findings from the architect review have been verified as fixed in Wave 1 (`docs/SECURITY_FIXES_WAVE1.md`). The remaining work focuses on:

1. **Multi-replica safety** — migrate last in-memory state to Redis
2. **Reliability** — stop losing webhook events on failure
3. **Observability** — you can't fix what you can't see (no alerts exist today)
4. **Quality** — Phase 2 routes have zero E2E test coverage
5. **Residual security** — JWT secret in 3 routes, CORS wildcard on docs, Slack HITL race condition
6. **Feature completeness** — compliance PDF, policy DSL, LangGraph integration

### What we cut and why

| Cut Item | Original Estimate | Reason |
|----------|------------------|--------|
| Kill switch pub/sub + SDK long-poll | 1.5 days | Simple Redis cache gives ~100ms propagation — sufficient at <100 tenants |
| BullMQ webhook queue | 1.5 days | DB table + cron achieves same retry reliability with zero new dependencies |
| React dashboard rewrite | 3.5 days | SSE on existing vanilla JS gives real-time without a framework migration |
| OpenTelemetry | 3 days | Correlation headers + structured logging cover debugging at current scale |
| PostgreSQL read replicas | 2 days | No evidence of query bottlenecks; optimize with indexes first when needed |
| Markdown linting | 0.5 days | Cosmetic; not blocking any user or operation |

**Scale triggers for deferred items:**
- **Pub/sub + OTEL:** Revisit at 500+ tenants or when Azure Monitor shows propagation/debugging as bottleneck
- **BullMQ:** Revisit at 5+ replicas when in-process cron isn't sufficient
- **React rewrite:** Revisit post-launch with actual user feedback on dashboard UX
- **Read replicas:** Revisit when audit query latency > 200ms in Azure Monitor

---

## Validated Current State

### Wave 1 Security Fixes (All Verified Complete)

The architect review identified 8 P0 security issues. All were fixed in Wave 1 (`docs/SECURITY_FIXES_WAVE1.md`, 2026-03-21, 24 new tests, 0 regressions):

| Issue | Severity | Status | Evidence |
|-------|----------|--------|----------|
| Slack HITL never fires | CRITICAL | ✅ Fixed | `sendSlackApprovalRequest` called after `createPendingApproval` (`api/routes/evaluate.ts:638-642`) |
| Agent API keys plaintext | HIGH | ✅ Fixed | SHA-256 hash stored as `apiKeyHash` + bcrypt verify (`packages/api/src/services/agent.ts:74,94`) |
| SSRF via webhook URLs | HIGH | ✅ Fixed | `validateWebhookUrl()` blocks private IPs; Slack restricted to `hooks.slack.com` (`api/routes/webhooks.ts:113`) |
| JWT secret fallback | CRITICAL | ⚠️ Partial | Startup guard exists in `packages/api/src/middleware/auth.ts:16-27`, BUT 3 route files bypass it with inline `?? 'dev-secret-change-in-production'`: `audit.ts:24`, `audit-analytics.ts:20`, `events.ts:359`. See item 1.7. |
| PostgreSQL RLS disabled | CRITICAL | ✅ Fixed | `tenantRLSMiddleware` active, RLS policies on 11 tables (`packages/api/src/app.ts:113`, `prisma/rls-migration.sql`) |
| OWASP compliance stale | MEDIUM | ✅ Fixed | All controls query live DB state (`api/lib/compliance-checker.ts:61-89`) |
| Telemetry rate map leak | MEDIUM | ✅ Fixed | `setInterval` cleanup with `.unref()` (`api/routes/telemetry.ts`) |
| No dep vulnerability scan | HIGH | ✅ Fixed | `npm audit --audit-level=high` in CI (`.github/workflows/test-coverage.yml`) |

### Previously Claimed Issues — Verified as Non-Issues

The architect review also flagged these items, which code audit confirmed are incorrect:

| Claim | Verdict | Evidence |
|-------|---------|----------|
| PostgreSQL migration broken | Not a bug | `db-factory.ts` correctly switches on `DB_TYPE` + `DATABASE_URL` |
| Node.js 20 in Dockerfile | Not a bug | `Dockerfile.api` uses `node:22-alpine`, matching `package.json` engines |
| Dead db abstraction code | Not a bug | `db-interface.ts`, `db-postgres.ts`, `db-sqlite.ts` all actively imported |
| Dashboard is 85-line scaffold | Not a bug | 18 functional pages, 2,574 lines of JS with real API calls |
| SSO/SAML missing | Not a bug | Full OIDC + SAML 2.0 implementation (`api/routes/sso.ts`) |
| SCIM missing | Not a bug | RFC 7643/7644 compliant (`api/routes/scim.ts`) |
| Audit export missing | Not a bug | CSV/JSON export endpoint exists (`api/routes/audit.ts`) |
| Per-tenant rate limits missing | Not a bug | Full CRUD for per-tenant/agent limits (`api/routes/rate-limits.ts`) |
| CrewAI integration missing | Not a bug | `crewaiGuard()` exported (`packages/sdk/src/integrations/crewai.ts`) |
| AutoGen integration missing | Not a bug | `createAutoGenGuard()` exported (`packages/sdk/src/integrations/autogen.ts`) |
| Helm chart missing | Not a bug | Complete Helm chart at `deploy/helm/agentguard/` + `helm/agentguard/` |
| Policy Git integration missing | Not a bug | GitHub webhook integration (`api/routes/policy-git-webhook.ts`) |
| HITL approval UI missing | Not a bug | Full approval queue page in dashboard with approve/deny actions |
| CORS wildcard default | Not a bug (main) | `api/server.ts` uses explicit origin allowlist (but see 1.5 below) |
| Audit table not partitioned | Not a bug | Partition maintenance script exists (`packages/api/scripts/partition-maintenance.ts`) |

### Remaining Issues (This Plan)

| Area | Status | Evidence |
|------|--------|----------|
| Signup rate limit | ⚠️ In-memory | `Map<string, SignupBucket>` — not shared across replicas (`api/middleware/rate-limit.ts:33`) |
| Kill switch | ⚠️ DB-only | `getGlobalKillSwitch(db)` per evaluate — 5-20ms per query (`api/routes/evaluate.ts:186`) |
| Webhook delivery | ⚠️ Fire-and-forget | `setTimeout(0)` + single 5s retry, no persistence (`api/routes/audit.ts:140-161`) |
| SDK correlation | ⚠️ Missing | Only sends `X-API-Key` (`packages/sdk/src/sdk/client.ts:113`) |
| CORS on docs routes | ⚠️ Wildcard | `Access-Control-Allow-Origin: *` on 3 Swagger UI routes (`api/routes/docs.ts:300,330,345`) |
| Slack HITL race | ⚠️ TOCTOU | `getApproval` → check status → `resolveApproval` without atomic guard (`api/routes/slack-hitl.ts:326-339`) |
| JWT secret in 3 routes | ⚠️ Bypass | `audit.ts:24`, `audit-analytics.ts:20`, `events.ts:359` use `?? 'dev-secret-change-in-production'` with no startup guard |
| Alerting | ❌ None | No Azure Monitor alerts exist |
| Phase 2 test coverage | ❌ None | Zero E2E tests for rate-limit, cost, SCIM routes |

---

## Phase 1: Production Hardening (7 days)

> **Goal:** Eliminate all blockers for safe multi-replica deployment.
> **Gate:** Complete before scaling to 2+ Container App replicas.

---

### 1.1 Migrate Signup/Recovery Rate Limits to Redis

**Owner:** Security + Backend | **Effort:** 1 day | **Priority:** P1

**Problem:**
General rate limiting uses Redis. But signup and password recovery rate limiters use `Map<string, SignupBucket>` — in-memory, resets on restart, not shared across replicas.

**Solution:**
- Reuse existing `RedisRateLimiter` class for signup and recovery endpoints
- Remove in-memory `Map` and `setInterval` cleanup (Redis handles TTL expiry)
- Fallback to in-memory when `REDIS_URL` is not configured (dev mode only)

**Transition strategy (avoids signup burst on deploy):**
- In-memory rate limit state is lost on deploy — this is acceptable because:
  - Signup rate limits are 5/hour per IP, and a deploy takes <30s
  - Worst case: one IP gets 5 extra signups during the deploy window
  - Redis keys are initialized on first request post-deploy (no pre-seeding needed)
- Canary: deploy to 1 replica first, monitor for rate limit bypass in logs before scaling

**Files:** `api/middleware/rate-limit.ts`, `api/lib/redis-rate-limiter.ts` (no changes expected)

**Acceptance criteria:**
- [x] Signup rate limit enforced across 2 replicas: send 6 requests from replica A + 6 from replica B within same minute, verify exactly 10 succeed (5 per IP limit shared via Redis)
- [x] Graceful degradation when Redis unavailable (falls back to in-memory)
- [x] `setInterval` cleanup removed
- [x] Old SDK versions without Redis still function (dev mode fallback)

---

### 1.2 Kill Switch Redis Cache

**Owner:** Security + Backend | **Effort:** 1.5 days | **Priority:** P1

**Problem:**
Every `POST /api/v1/evaluate` queries PostgreSQL for kill switch status (5-20ms per call). At scale, this adds latency and DB load.

**Design decision — why NOT pub/sub or SDK long-poll:**
At <100 tenants, ~100ms propagation via simple Redis cache is acceptable. Pub/sub adds subscriber reconnection logic, thread-safety concerns, and operational complexity for marginal gain (<10ms vs ~100ms). SDK long-poll conflates SDK concerns with API architecture. Revisit at 500+ tenants if Azure Monitor shows propagation as a bottleneck.

**Solution — Single-tier Redis cache:**
- On kill switch toggle: write to PostgreSQL first, THEN `SET killswitch:{tenantId} 1` (or DEL on deactivation)
- On evaluate: check Redis first (sub-millisecond); if Redis miss or unavailable → fall back to DB
- No TTL (explicit set/delete), no pub/sub, no SDK changes

**Redis downtime behavior (write-side):**
- Toggle request: write PostgreSQL → attempt Redis SET → if Redis fails, log `warn` but **do not fail the toggle**
- The toggle always succeeds (DB is source of truth)
- Next evaluate with Redis miss falls through to DB query (self-healing)
- No retry queue for failed Redis writes — the DB fallback makes it unnecessary

**Files:**
- `api/routes/evaluate.ts` — check Redis before DB
- `api/routes/auth.ts` — write to Redis on kill switch toggle
- New: `api/lib/kill-switch-cache.ts` — thin wrapper (~40 lines)

**Acceptance criteria:**
- [x] Kill switch check < 5ms P99 (Redis hit) instead of 5-20ms (DB)
- [x] Graceful fallback: Redis down → DB query (current behavior preserved)
- [x] Redis down during toggle → toggle succeeds (DB write), next evaluate falls back to DB
- [x] No new failure modes introduced
- [x] E2E test: activate → evaluate → verify blocked

---

### 1.3 Reliable Webhook Delivery with DB-Backed Retry

**Owner:** Backend + DevOps | **Effort:** 2 days | **Priority:** P1

**Problem:**
Webhook delivery is fire-and-forget. Failed events are permanently lost. SIEM integrations require reliable delivery.

**Design decision — why NOT BullMQ:**
BullMQ adds 3+ new dependencies and a separate worker process to deploy, monitor, and restart. At current scale, a DB-backed retry with the existing circuit breaker achieves the same reliability with zero new dependencies and ~100 lines of code. Revisit BullMQ at 5+ replicas when in-process cron isn't sufficient.

**Solution — DB table + cron + existing circuit breaker:**

**Day 1: Failed webhook table + retry cron**
- On delivery failure: INSERT into `failed_webhooks` table
  - Schema: `{ id, webhook_id, event_type, payload, attempt_count, next_retry_at, status, created_at }`
- Retry cron (every 30s via `setInterval` in API process):
  - `SELECT * FROM failed_webhooks WHERE next_retry_at <= NOW() AND status = 'pending' ORDER BY next_retry_at LIMIT 10 FOR UPDATE SKIP LOCKED`
  - The `FOR UPDATE SKIP LOCKED` prevents duplicate retries when multiple replicas run the cron simultaneously — each replica grabs a disjoint set of rows
  - SQLite fallback: `FOR UPDATE SKIP LOCKED` is not supported; single-replica dev mode uses plain `SELECT ... LIMIT 10` (acceptable since SQLite implies single process)
  - 5 attempts, exponential backoff: 30s, 1m, 2m, 5m, 10m
  - After 5 failures: mark as `dead_lettered`
- DB migration script for `failed_webhooks` table

**Day 0.5: Wire circuit breaker + status endpoints**
- Wire existing `CircuitBreaker` class (already at `api/lib/circuit-breaker.ts`) to webhook delivery per destination URL
- Config: 5 failures in 60s → OPEN, 60s cooldown → HALF_OPEN probe
- `GET /api/v1/internal/webhooks/failed` — recent failures and dead letters
- `POST /api/v1/internal/webhooks/:id/retry` — manual retry

**Files:**
- `api/routes/audit.ts` — replace fire-and-forget with DB insert on failure
- New: `api/lib/webhook-retry.ts` — retry cron logic (~100 lines)
- `api/lib/circuit-breaker.ts` — no changes (already production-ready)
- DB migration: `failed_webhooks` table
- `api/routes/webhooks.ts` — add failure status + manual retry endpoints

**Acceptance criteria:**
- [x] Failed webhooks stored in DB, not silently dropped
- [x] Retry with exponential backoff (5 attempts over ~18 minutes)
- [x] Dead-lettered events queryable via API
- [x] Circuit breaker opens after 5 consecutive failures per endpoint
- [x] SSRF protection and HMAC-SHA256 signing preserved
- [x] Integration test: 2 replicas retrying same failed webhook → only 1 processes it (via `FOR UPDATE SKIP LOCKED`)
- [x] Idempotency: customer webhook endpoint receives each event at most once per retry attempt

---

### 1.4 SDK Correlation Headers

**Owner:** Backend | **Effort:** 1 day | **Priority:** P2

**Problem:**
No way to trace an SDK call through to the API request log. The SDK sends only `X-API-Key`.

**Why this replaces OTEL at current scale:**
Correlation headers + structured logging provide 90% of distributed tracing value for a single-service architecture. Full OpenTelemetry becomes necessary at 500+ tenants with multiple service teams. Until then, this is sufficient.

**Solution:**
- SDK generates `traceId` (UUID) per client instance → `X-Trace-ID` on every request
- SDK generates `spanId` (UUID) per API call → `X-Span-ID`
- API logs incoming trace headers alongside existing `requestId`
- Python SDK sends the same headers

**Files:**
- `packages/sdk/src/sdk/client.ts` — add trace/span headers
- `packages/python/agentguard/client.py` — same
- `api/server.ts` — log trace headers in request middleware

**Acceptance criteria:**
- [x] Every SDK HTTP call includes `X-Trace-ID` and `X-Span-ID`
- [x] API logs include trace context from SDK
- [x] Backward compatible: old SDK versions without trace headers still work — API auto-generates IDs when missing and logs `debug` (not `warn`)
- [x] No breaking changes to API contract

---

### 1.5 Remove CORS Wildcard from Docs Routes

**Owner:** Security | **Effort:** 0.5 days | **Priority:** P1

**Problem:**
The main CORS config in `api/server.ts` uses a strict origin allowlist. However, 3 Swagger UI routes in `api/routes/docs.ts` bypass this with hardcoded `Access-Control-Allow-Origin: *` (lines 300, 330, 345). This allows any origin to load the OpenAPI spec and Swagger UI assets, which could leak API structure to untrusted domains.

**Solution:**
- Remove all 3 `res.setHeader('Access-Control-Allow-Origin', '*')` calls from `api/routes/docs.ts`
- These routes are mounted after the global CORS middleware in `server.ts`, so the allowlist already applies
- If Swagger UI needs cross-origin access in dev, add `localhost` to the allowlist (already there)

**Files:** `api/routes/docs.ts` — remove 3 lines

**Acceptance criteria:**
- [x] Zero `Access-Control-Allow-Origin: '*'` in codebase outside test fixtures
- [x] Swagger UI still loads correctly from allowed origins
- [x] `curl -H 'Origin: https://evil.com'` returns no CORS header on docs routes

---

### 1.6 Fix Slack HITL TOCTOU Race Condition

**Owner:** Security + Backend | **Effort:** 0.5 days | **Priority:** P2

**Problem:**
The Slack callback handler at `api/routes/slack-hitl.ts:326-339` has a time-of-check-time-of-use race:
1. `getApproval()` — reads approval, checks `status !== 'pending'`
2. `resolveApproval()` — updates status to approved/denied

If two Slack users click Approve/Reject simultaneously, both threads pass the `pending` check and both call `resolveApproval()`. The second write silently overwrites the first.

**Solution:**
- Replace the two-step read-then-write with an atomic conditional update:
  ```sql
  UPDATE approvals SET status = $1, resolved_by = $2, resolved_at = NOW()
  WHERE id = $3 AND tenant_id = $4 AND status = 'pending'
  RETURNING *
  ```
- If `RETURNING` returns 0 rows → approval was already resolved → show current state
- This eliminates the race window entirely with no additional infrastructure

**Files:** 
- `api/routes/slack-hitl.ts` — replace `getApproval` + `resolveApproval` with atomic update
- DB interface: add `resolveApprovalAtomic()` or modify `resolveApproval()` to return affected row count

**Acceptance criteria:**
- [x] Concurrent approve+reject on same approval: exactly one succeeds, other sees "already resolved"
- [x] Integration test: parallel requests to callback endpoint with same approval ID
- [x] No behavior change for non-concurrent usage
- [x] SQLite compatibility verified (`RETURNING` requires SQLite 3.35+; add version check or fallback query)

---

### 1.7 Consolidate JWT Secret Initialization

**Owner:** Security + Backend | **Effort:** 0.5 days | **Priority:** P1

**Problem:**
The startup guard in `packages/api/src/middleware/auth.ts:16-27` correctly prevents production use of `dev-secret-change-in-production`. However, 3 route files bypass the shared middleware by reading `JWT_SECRET` inline with the same dangerous fallback:

- `packages/api/src/routes/audit.ts:24` — `process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production'`
- `packages/api/src/routes/audit-analytics.ts:20` — same
- `packages/api/src/routes/events.ts:359` — same

These routes do NOT pass through the startup guard, so in a misconfigured production deployment they would sign/verify JWTs with a known-public string.

**Solution:**
- Export the validated `JWT_SECRET` constant from `packages/api/src/middleware/auth.ts` (which has the startup guard)
- Replace the 3 inline `process.env['JWT_SECRET'] ?? '...'` with an import from the shared module
- This ensures every JWT operation shares the guarded, validated secret

**Files:**
- `packages/api/src/middleware/auth.ts` — export `jwtSecret` constant (already validated by startup guard)
- `packages/api/src/routes/audit.ts` — import from shared module
- `packages/api/src/routes/audit-analytics.ts` — import from shared module
- `packages/api/src/routes/events.ts` — import from shared module

**Acceptance criteria:**
- [x] Zero inline `JWT_SECRET` fallback strings outside `auth.ts`
- [x] `grep -r "dev-secret-change-in-production" packages/api/src/routes/` returns 0 results
- [x] Existing JWT integration tests still pass
- [x] Server fails to start in production if `JWT_SECRET` is missing (startup guard unchanged)

---

## Phase 2: Observability, Quality & Real-Time (12 days)

> **Goal:** Production-grade monitoring, comprehensive testing, documentation, and real-time dashboard.
> **Gate:** Complete before onboarding external design partners.

---

### 2.1 Structured Request Logging

**Owner:** DevOps + Backend | **Effort:** 2.5 days | **Priority:** P2

**Problem:**
Pino logger exists with per-request child loggers and token scrubbing, but usage is inconsistent across 35 route files. Not all routes log method, path, status, and duration.

**Solution:**

**Day 1: Request lifecycle middleware**
- New middleware logging on every request completion:
  ```json
  {"level":"info","requestId":"...","traceId":"...","method":"POST","path":"/api/v1/evaluate","status":200,"duration":42,"tenantId":"..."}
  ```
- `warn` for 4xx, `error` for 5xx
- Duration via `process.hrtime.bigint()`

**Day 2: Route-level standardization**
- Audit 35 route files for `req.log.info()` consistency
- Add structured action fields: `{ action: 'policy.create', resourceId: '...' }`
- Migrate all `console.log` and `console.error` calls to `req.log.*` equivalents
- Known files with `console.log`/`console.error` in production routes: `auth.ts`, `stripe-webhook.ts`, `policy-git-webhook.ts`, `sso.ts`, `slack-hitl.ts` (6 `console.error` instances)

**Files:**
- New: `api/middleware/request-logger.ts`
- `api/server.ts` — mount **before** auth middleware (to capture requests with invalid/missing auth)
- Route files in `api/routes/` — only those with inconsistencies

**Acceptance criteria:**
- [x] Every request produces one structured log line on completion (including failed auth)
- [x] Log includes: requestId, traceId, method, path, status, duration, tenantId
- [x] Zero `console.log` / `console.error` calls in `api/routes/` and `api/middleware/` (excludes `scripts/`, test files, and `node_modules`)
- [x] Route audit checklist: all 35 files in `api/routes/` verified against logging pattern

---

### 2.2 Azure Monitor Alerting

**Owner:** DevOps | **Effort:** 2 days | **Priority:** P2

**Problem:**
No alerting exists. No notification when the API goes down, latency spikes, or error rates increase.

**Solution:**

**Day 1: Application Insights + alert rules via Terraform**
- Enable Application Insights on Container Apps
- Alert rules in `infra/monitoring.tf`:
  - **Availability:** health check fails 2+ consecutive checks → Slack/PagerDuty
  - **Error rate:** 5xx > 5% over 5 minutes → Slack
  - **Latency:** P95 > 500ms for 5 minutes → Slack
  - **CPU:** > 80% for 10 minutes → Slack
  - **Redis:** memory > 80%, connection count > 15, replication lag > 500ms → Slack
  - **Webhook failures:** > 10 dead-lettered in 1 hour → Slack
  - **Kill switch propagation:** custom metric: time between DB write and Redis availability > 200ms → log warn (baseline for future pub/sub trigger)

**Day 2: Dashboard + runbook**
- Azure Monitor workbook: request volume, error rate, latency percentiles
- `docs/RUNBOOK.md` — what to do when each alert fires

**Files:**
- New: `infra/monitoring.tf`
- `infra/main.tf` — wire Application Insights to Container Apps
- New: `docs/RUNBOOK.md`

**Acceptance criteria:**
- [x] Alert fires within 2 minutes of health check failure
- [x] Alert fires within 5 minutes of error rate spike
- [x] Redis health monitored (memory, connections, lag)
- [x] Runbook covers all alert scenarios

---

### 2.3 Test Coverage Expansion

**Owner:** Backend + Security | **Effort:** 3.5 days | **Priority:** P2

**Problem:**
Coverage thresholds are 60% lines / 45% functions / 65% branches. Phase 2 routes have zero E2E coverage. No explicit tests verifying v0.8.0 security fixes remain intact.

**Solution:**

**Day 1: Critical path tests + raise thresholds**
- Increase thresholds: 75% lines, 60% functions, 70% branches
- Tests for:
  - Kill switch evaluate flow (activate → evaluate → blocked)
  - Webhook retry (mock failing endpoint → verify retry count from DB)
  - Rate limit Redis fallback (Redis down → in-memory works)

**Day 2: Phase 2 route E2E coverage**
- E2E tests for rate-limit configuration CRUD
- E2E tests for cost/usage tracking endpoints
- E2E tests for SCIM provisioning endpoints
- Assess and fix/skip 20 pre-existing Prisma test failures
  - Each failure: triage → fix (if <30 min) or skip with `it.skip('reason')` + GitHub issue link
  - Track in a Prisma test triage table in this plan's appendix

**Day 3: Security regression tests**
- These explicitly verify v0.8.0 fixes remain intact:
  - `test('Playground routes require authentication')`
  - `test('Webhook blocks IPv6 link-local (fe80::1)')`
  - `test('Webhook blocks CGNAT range (100.64.x.x)')`
  - `test('API key validation is constant-time (bcrypt)')`
  - `test('Agent name rejects HTML/script tags')`
  - `test('Tenant A cannot access tenant B data')`

**Files:**
- `vite.config.ts` — update threshold values
- New tests in `api/tests/`
- New: `api/tests/security/` — security regression suite

**Acceptance criteria:**
- [x] Coverage thresholds raised to 75/60/70 and CI enforces them
- [x] All v0.8.0 security fixes have regression tests
- [x] Phase 2 routes covered by E2E tests
- [x] Prisma failures either fixed or documented

---

### 2.4 OpenAPI Spec Sync Validation

**Owner:** Backend | **Effort:** 1 day | **Priority:** P3

**Problem:**
OpenAPI spec (`api/openapi.yaml`, info.version 0.9.0) has auto-generation but no CI check to verify sync.

**Solution:**
- CI step: run `npm run openapi:generate` → `git diff --exit-code api/openapi.yaml`
- Update info.version to 0.10.0
- Add route-level JSDoc annotations where missing

**Files:**
- `.github/workflows/test-coverage.yml` — add sync check
- `api/openapi.yaml` — regenerate
- Route files missing JSDoc

**Acceptance criteria:**
- [x] CI fails if spec is out of sync
- [x] All routes documented in spec
- [x] Spec version matches package version

---

### 2.5 Documentation Cleanup & Feature Matrix

**Owner:** All teams | **Effort:** 1.5 days | **Priority:** P3

**Problem:**
80+ markdown files in `docs/` including old test results (DX_TEST_RESULTS x4, E2E_TEST_RESULTS x4), superseded plans, and duplicates.

**Solution:**

**Day 1: Archive**
- Create `docs/archive/` — move ~40 historical documents
- Keep current: ARCHITECTURE, ROADMAP, this plan, RUNBOOK

**Day 0.5: Feature matrix**
- New `docs/FEATURE_MATRIX.md`: feature → spec → implementation → test → status
- Link from README

**Files:**
- Move ~40 files to `docs/archive/`
- New: `docs/FEATURE_MATRIX.md`
- `README.md` — link to feature matrix

**Acceptance criteria:**
- [x] `docs/` contains < 20 current documents
- [x] Feature matrix covers all major features
- [x] README links to feature matrix

---

### 2.6 Real-Time Dashboard via SSE

**Owner:** UX + Backend | **Effort:** 1.5 days | **Priority:** P3

**Problem:**
Dashboard (2,574 lines of vanilla JS) requires manual page refresh to see new audit events or kill switch changes.

**Design decision — why NOT a React rewrite:**
The stated problem is "no real-time data push," not "the dashboard framework is wrong." SSE on existing vanilla JS delivers real-time updates in ~80 lines of code (50 server + 30 client) without introducing a build step, new framework, or deployment change. A React rewrite should be driven by user feedback post-launch, not pre-emptive architecture preference.

**Solution:**

**Day 1: SSE endpoint**
- New endpoint: `GET /api/v1/stream/dashboard-events`
- Event types: `audit` (new audit events), `kill_switch` (state changes), `webhook_failure` (delivery failures)
- Standard `text/event-stream` content type, works through corporate proxies
- Auto-reconnection via `EventSource` API

**Day 0.5: Dashboard integration**
- Connect: `const source = new EventSource('/api/v1/stream/dashboard-events')`
- On `audit` event: prepend to audit trail list (same DOM manipulation pattern as existing code)
- On `kill_switch` event: update status indicator immediately
- Fallback: if SSE fails, degrade to current polling behavior

**Files:**
- New: `api/routes/stream.ts` — SSE endpoint (~50 lines)
- `dashboard/dashboard.js` — add EventSource connection (~30 lines)

**Acceptance criteria:**
- [x] Audit trail updates in < 1 second without page refresh
- [x] Kill switch state reflected immediately
- [x] Graceful fallback to polling if SSE unavailable (dashboard detects SSE failure → falls back to `GET /api/v1/audit/recent` every 10s)
- [x] No framework dependencies added
- [x] SSE max connection limit documented (100 per Container App instance)

---

## Phase 3: Feature Completeness (Deferred — Post Design-Partner Gate)

> **Goal:** Close remaining feature gaps identified in architect review. Scoped separately because these are enhancements, not blockers.
> **Gate:** Start after Phase 2 gate cleared and design partner feedback collected.

---

### 3.1 Compliance PDF Export

**Owner:** Backend | **Effort:** 1.5 days | **Priority:** P3

**Problem:**
Compliance reports (OWASP, SOC2, HIPAA, EU AI Act) are JSON-only. Enterprise CISOs need PDF exports for security review packages.

**Solution:**
- Add `GET /api/v1/compliance/:tenantId/report.pdf` endpoint
- Use `pdfkit` (lightweight, zero-dependency PDF generation) — not a headless browser
- Reuse existing `generateComplianceReport()` JSON output as data source
- Headers, tables, status badges, and recommendations in a branded PDF

**Files:**
- `api/routes/compliance.ts` — add PDF endpoint
- New: `api/lib/compliance-pdf.ts` — PDF renderer (~150 lines)

**Acceptance criteria:**
- [x] PDF contains all data from JSON report
- [x] File size < 500KB for typical report
- [x] Works without external services (no Puppeteer/Chrome)

---

### 3.2 Policy DSL Composability (AND/OR/NOT)

**Owner:** Backend | **Effort:** 2 days | **Priority:** P3

**Problem:**
Policy `when:` conditions use implicit AND only. Cannot express `(tool == 'transfer' AND amount > 1000) OR (risk_tier == 'HIGH')`. This limits real-world policy expressiveness for enterprise customers.

**Solution:**
- Extend `WhenCondition` type to support boolean operators:
  ```typescript
  type WhenCondition = SimpleCondition | { AND: WhenCondition[] } | { OR: WhenCondition[] } | { NOT: WhenCondition }
  ```
- Backward compatible: flat array of conditions still works (implicit AND, current behavior)
- Policy engine evaluates recursively with short-circuit evaluation
- Update policy validation endpoint to validate nested conditions

**Files:**
- `packages/sdk/src/core/types.ts` — extend `WhenCondition`
- `api/lib/policy-engine*.ts` — add recursive evaluator
- `api/routes/policy.ts` — update validation

**Acceptance criteria:**
- [x] Existing policies (implicit AND) work without changes
- [x] New AND/OR/NOT operators pass validation and evaluation
- [x] Policy test endpoint (`POST /policies/:id/test`) supports composite rules
- [x] SDK types updated in both TS and Python packages

---

### 3.3 LangGraph Streaming Integration

**Owner:** SDK | **Effort:** 1.5 days | **Priority:** P3

**Problem:**
LangChain integration exists but LangGraph (streaming, multi-step graphs) has no native support. LangGraph is the dominant enterprise orchestration pattern and requires mid-stream evaluation.

**Solution:**
- Add `packages/sdk/src/integrations/langgraph.ts`
- Provide `langGraphGuard()` that wraps graph node execution with pre/post evaluation
- Support streaming: evaluate tool calls as they appear in the stream, not after completion
- Leverage existing `evaluate()` SDK method — this is a wrapper, not a new protocol

**Files:**
- New: `packages/sdk/src/integrations/langgraph.ts`
- `packages/sdk/src/index.ts` — export new integration

**Acceptance criteria:**
- [x] `langGraphGuard()` evaluates tool calls mid-stream
- [x] Works with LangGraph's `StateGraph` and `MessageGraph`
- [x] Example in SDK README (exported from SDK index)
- [x] Integration test with mock LangGraph graph (Python: 586-line test suite)

---

## Timeline

```
Week 1:    Phase 1 — Production Hardening (7 days)
           ├── Mon:     1.1 Signup rate limit → Redis (1 day)
           ├── Tue-Wed: 1.2 Kill switch Redis cache (1.5 days)
           ├── Wed-Fri: 1.3 Webhook retry + circuit breaker wiring (2 days)
           ├── Fri:     1.4 SDK correlation headers (1 day)
           ├── Fri PM:  1.5 Remove CORS wildcard from docs routes (0.5 days)
           ├── Mon W2:  1.6 Fix Slack HITL TOCTOU race (0.5 days)
           └── Mon W2:  1.7 Consolidate JWT secret initialization (0.5 days)
           ✅ GATE: Safe to scale to 2+ replicas

Week 2-3:  Phase 2 — Observability & Quality (12 days)
           ├── 2.1 Structured request logging (2.5 days)
           ├── 2.2 Azure Monitor alerting (2 days) ← AFTER 2.1
           ├── 2.3 Test coverage expansion (3.5 days) ← AFTER Phase 1
           ├── 2.4 OpenAPI sync validation (1 day) ← AFTER Phase 1
           ├── 2.5 Documentation cleanup (1.5 days)
           └── 2.6 Real-time dashboard SSE (1.5 days) ← AFTER 1.3
           ✅ GATE: Safe to onboard design partners

Week 4+:   Phase 3 — Feature Completeness (5 days, post design-partner gate)
           ├── 3.1 Compliance PDF export (1.5 days)
           ├── 3.2 Policy DSL composability (2 days)
           └── 3.3 LangGraph streaming integration (1.5 days)
           ✅ GATE: Feature-complete for enterprise pilot
```

**Parallelism:** Items 1.1, 1.4, 1.5, 1.7 are independent (can run in parallel). Item 1.6 is independent of 1.1-1.5. In Phase 2: 2.5 is fully independent; 2.3 and 2.4 require Phase 1 completion; 2.2 requires 2.1; 2.6 requires 1.3's `failed_webhooks` table. Phase 3 items are fully independent of each other.

---

## Dependency Graph

```
Phase 1 ─────────────────────────────────────────
  1.1 Signup RL → Redis ────┐
  1.2 Kill switch cache  ───┤─→ Multi-replica safe ✅
  1.3 Webhook retry + CB ───┤
  1.4 SDK correlation ──────┘
  1.5 CORS docs fix ────────→ Independent (security hardening)
  1.6 Slack HITL TOCTOU ────→ Independent (security hardening)
  1.7 JWT secret consolidate → Independent (security hardening, P1)

Phase 2 ─────────────────────────────────────────
  2.1 Request logging ──→ 2.2 Azure Monitor (logging feeds alerts) [SEQUENTIAL]
  2.3 Test coverage ────→ Requires Phase 1 done (tests cover new features)
  2.4 OpenAPI sync  ────→ Requires Phase 1 done (routes changed by 1.1-1.3)
  2.5 Doc cleanup   ────→ Independent (can start anytime)
  2.6 Dashboard SSE ────→ Requires 1.3 (reads from failed_webhooks table)

Phase 3 ─────────────────────────────────────────
  3.1 Compliance PDF ───→ Independent
  3.2 Policy DSL    ────→ Independent
  3.3 LangGraph     ────→ Independent
```

---

## Rollback Procedures

| Item | Rollback Strategy |
|------|-------------------|
| 1.1 | Revert to in-memory Map (no Redis dependency) — `rate-limit.ts` single-file revert |
| 1.2 | Remove Redis reads/writes from evaluate + auth routes — kill switch falls back to DB-only (current behavior) |
| 1.3 | Drop `failed_webhooks` table, revert audit.ts to fire-and-forget — failed webhooks lost again but no production break |
| 1.4 | Remove header generation from SDK — trace IDs stop appearing in logs but nothing breaks |
| 1.5 | Revert docs.ts to remove CORS overrides — single-file 3-line revert |
| 1.6 | Revert `resolveApproval` to non-atomic version — race condition returns but no data loss |
| 1.7 | Revert route files to inline `process.env` reads — startup guard in auth.ts still protects the main path |
| 2.1-2.6 | Each is additive; revert the specific files changed |
| 3.1-3.3 | Each is additive; revert the specific files/packages changed |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `failed_webhooks` DB migration in production | Medium | Low | Run via existing migration tooling; table is additive (no schema changes to existing tables) |
| `setInterval` retry cron not shared across replicas | Low | Medium | At 2 replicas: both run cron, use `SELECT ... FOR UPDATE SKIP LOCKED` to avoid duplicate retries |
| Redis cache stale after crash | Low | Low | No TTL means explicit delete. If API crashes between DB write and Redis write, next evaluate falls through to DB (self-healing) |
| SSE connections pile up | Low | Low | Container Apps auto-scales; SSE has low overhead per connection |
| Dashboard eventSource reconnection flood | Low | Low | Built-in backoff in EventSource API; server logs reconnection events |

---

## Success Metrics

| Metric | Current | After Phase 1 | After Phase 2 |
|--------|---------|---------------|---------------|
| Kill switch check latency | 5-20ms (DB) | < 1ms (Redis) | < 1ms |
| Kill switch propagation | 100-500ms | ~100ms | ~100ms (measured in 2.2) |
| Webhook delivery success | ~95% (guess) | 99.5% (5x retry) | 99.5% + monitored |
| Webhook data loss on failure | 100% lost | 0% (DB persisted) | 0% + alerting |
| Rate limit (signup) across replicas | Not enforced | Enforced (Redis) | Enforced + monitored |
| Test coverage (lines) | 60% | 65% | 75% |
| Alert response time | ∞ (no alerts) | N/A | < 5 min (PagerDuty) |
| Dashboard freshness | Manual refresh | Manual refresh | Real-time (SSE) |
| Doc findability | ~50% stale | ~50% stale | < 20 current docs + feature matrix |

---

## Deferred Roadmap

Items consciously deferred with scale triggers:

| Item | Trigger to Revisit | Estimated Effort |
|------|-------------------|-----------------|
| Kill switch Redis pub/sub | 500+ tenants OR Azure Monitor shows >200ms propagation | 1.5 days |
| SDK kill switch long-poll | SDK users report stale kill switch state | 1 day |
| BullMQ webhook queue | 5+ replicas OR webhook volume > 10K/day | 2 days |
| React dashboard rewrite | User feedback shows UX is blocking adoption | 5 days |
| OpenTelemetry | 500+ tenants OR multiple service teams | 3 days |
| PostgreSQL read replicas | Azure Monitor shows audit query latency > 200ms | 2 days |
| Markdown linting | Pre-public-docs-launch | 0.5 days |
| Policy simulation/debugger UI | Dashboard UX feedback from design partners | 2 days |
| Multi-region data residency | First EU/APAC customer commits or GDPR audit requirement | 4-6 weeks |

---

## Cross-Cutting Checklists

### Security (applies to all items)
- [ ] No new routes without authentication middleware
- [ ] All new Redis keys namespaced by tenant ID
- [ ] Webhook retry payloads do not contain raw API keys
- [ ] New endpoints added to OpenAPI spec
- [ ] New test coverage for security-sensitive changes

### DevOps (applies to all items)
- [ ] All new environment variables documented in `.env.example`
- [ ] Docker Compose updated for local development parity
- [ ] Terraform changes reviewed for cost impact
- [ ] CI pipeline updated for new test suites
- [ ] DB migration tested in staging before production

### Database Migration (Item 1.3)
- [ ] `failed_webhooks` table migration script created
- [ ] Migration tested against PostgreSQL AND SQLite (dual-DB support)
- [ ] Rollback script prepared
- [ ] Migration ownership assigned (DevOps or Backend)

---

## Appendix: Key Files Referenced

| File | Role | Items |
|------|------|-------|
| `api/middleware/rate-limit.ts` | In-memory signup rate limiter | 1.1 |
| `api/lib/redis-rate-limiter.ts` | Redis-backed rate limiter (existing) | 1.1 |
| `api/routes/evaluate.ts` | Kill switch check + policy evaluation | 1.2 |
| `api/routes/auth.ts` | Kill switch toggle endpoint | 1.2 |
| `api/routes/audit.ts` | Webhook fire-and-forget delivery | 1.3 |
| `api/lib/circuit-breaker.ts` | Existing circuit breaker (CLOSED/OPEN/HALF_OPEN) | 1.3 |
| `packages/sdk/src/sdk/client.ts` | TypeScript SDK HTTP client | 1.4 |
| `packages/python/agentguard/client.py` | Python SDK client | 1.4 |
| `api/server.ts` | Express app, middleware chain | 2.1 |
| `vite.config.ts` | Test coverage thresholds | 2.3 |
| `api/openapi.yaml` | OpenAPI spec (info.version 0.9.0) | 2.4 |
| `dashboard/dashboard.js` | Vanilla JS dashboard (2,574 lines) | 2.6 |
| `infra/main.tf` | Terraform infrastructure | 2.2 |
| `packages/api/src/middleware/auth.ts` | JWT secret startup guard + shared secret export | 1.7 |
| `packages/api/src/routes/audit.ts` | JWT fallback bypass (to fix) | 1.7 |
| `packages/api/src/routes/audit-analytics.ts` | JWT fallback bypass (to fix) | 1.7 |
| `packages/api/src/routes/events.ts` | JWT fallback bypass (to fix) | 1.7 |
| `api/routes/docs.ts` | Swagger UI with CORS wildcard | 1.5 |
| `api/routes/slack-hitl.ts` | Slack HITL callback handler | 1.6 |
| `api/routes/compliance.ts` | Compliance report generation | 3.1 |
| `packages/sdk/src/core/types.ts` | Policy DSL types | 3.2 |
| `docs/SECURITY_FIXES_WAVE1.md` | Wave 1 security fix documentation | Validated State |

---

- v0.10.0 third draft (19.5 days, 14 items) — critique found 2 blockers (JWT secret bypass, console.log scope), math error; fixed to 15 items, 24 days
## Supersedes

This plan supersedes:
- `docs/REMEDIATION_PLAN.md` (v0.8.0, 2026-03-07) — all 25 items verified complete
- Initial v0.10.0 draft (28 days, 16 items) — simplified after critique to 18 days, 11 items
- v0.10.0 third draft (14 items, 3 phases) — critique found 2 blockers (JWT secret bypass in 3 route files, console.log/error scope too narrow) + math error; fixed to 15 items, 24 days
- v0.10.0 second draft (18 days, 11 items) — expanded after cross-referencing architect review to 14 items, 3 phases
