# FINAL CODE REVIEW — `audit-remediation-squash` vs `main`

**Reviewer:** Senior Code Reviewer (automated)  
**Date:** 2026-04-18  
**Branch:** `audit-remediation-squash`  
**Base:** `main`  
**Commits:** 6 (squashed audit remediation + CX docs + hardening)  
**Changed files:** 139 (+16,463 / -6,880)

---

## Summary

| Check | Status | Notes |
|-------|--------|-------|
| TypeScript compilation | ✅ Pass | Only pre-existing error in `vitest.e2e.config.ts` (unrelated) |
| Test suite | ⚠️ 1 failure | `health.test.ts` — caused by new Redis health check in test env |
| Security review | ✅ Pass | No secrets, no eval(), no dangerous patterns, HMAC properly used |
| Version consistency | ❌ Fail | New file `api/routes/index.ts` uses `0.9.0` (should be `0.10.0`); 5 pre-existing `0.9.0` refs untouched |
| Import paths / moved files | ✅ Pass | No broken imports; SPEC.md move handled with backward-compat re-exports |
| Auth on new routes | ✅ Pass | SCIM has its own bearer auth; policy-git CRUD has role-based auth; webhooks use HMAC |
| New test coverage | ✅ Pass | 8 new test files (compliance, metrics, SCIM, SIEM, stripe-webhook, webhook-signing, rate-limiting); 790 tests pass |
| Dead code / TODOs | ✅ Pass | No TODO/FIXME/HACK in new code |
| New dependencies | ✅ Pass | No new runtime deps; only `vite` added as devDep (was missing) |
| Prometheus metrics | ⚠️ Minor | Histogram implementation correct but `req.path` as label creates high-cardinality risk |
| Code style / indentation | ❌ Fail | Misindented `logger.warn` in `api/middleware/auth.ts` (lines 61-64) |

---

## Issues Found

### ❌ CRITICAL — Version inconsistency in new file

**File:** `api/routes/index.ts` (new file in this branch)  
**Lines:** 82, 151, 175  
**Issue:** Hardcoded `version: '0.9.0'` in three JSON responses. Package.json says `0.10.0`.  
**Impact:** Root endpoint, setup guide, and rate-limit info all advertise wrong version.  
**Fix:** Replace all three `'0.9.0'` with `'0.10.0'`.

**Additional pre-existing `0.9.0` references (not introduced by this branch, but worth noting):**
- `api/routes/health.ts:89` — `version: '0.9.0'`
- `api/routes/health-probes.ts:162` — `version: '0.9.0'`
- `api/routes/docs.ts:208` — `API v0.9.0` badge
- `api/swagger-config.ts:30` — `version: '0.9.0'`
- `api/server.ts:105` — startup log `v0.9.0`

### ❌ CRITICAL — Misindented logger.warn fires for ALL SHA-256 key lookups

**File:** `api/middleware/auth.ts`  
**Lines:** 61-64  
**Issue:** The `logger.warn` for "legacy plaintext key" is misindented at 6 spaces but sits outside the `if (keyRow.key_hash)` block. It executes **unconditionally** in the `if (keyRow)` branch, meaning it logs a "legacy migration" warning for every properly hashed key authentication.  
**Impact:** Log noise in production (every request logs a false warning). Could mask real migration issues.  
**Fix:** Move the `logger.warn` inside the `else` of the `if (keyRow.key_hash)` block:

```typescript
if (keyRow.key_hash) {
  const valid = await bcrypt.compare(apiKey, keyRow.key_hash);
  if (!valid) return null;
} else {
  // key_hash is null → legacy row with sha256 only (migration period), accept it
  logger.warn('[auth] Legacy plaintext key authentication used...', { ... });
}
```

### ⚠️ WARNING — Failing test: health check returns "degraded" instead of "ok"

**File:** `api/tests/routes/health.test.ts:32`  
**Test:** `GET /api/v1/health/detailed > returns 200 with status "ok" when database is healthy`  
**Issue:** New Redis health check returns `status: 'degraded'` when `REDIS_URL` is not set (test env). The overall status logic correctly reports `'degraded'` when Redis is not configured, but the test assertion expects `'ok'`.  
**Fix:** Update test assertion from `expect(res.body.status).toBe('ok')` to `expect(res.body.status).toBe('degraded')`, or update the test to mock Redis as available.

### ⚠️ MINOR — Prometheus label high-cardinality risk

**File:** `api/middleware/index.ts:97`  
**Line:** `const route = req.route?.path || req.path;`  
**Issue:** When Express doesn't match a named route (e.g., 404s, OPTIONS preflight, malformed paths), `req.path` is used as a Prometheus label. Uncontrolled user input in labels can cause metric cardinality explosion.  
**Fix:** Use a fallback like `'<unmatched>'` when `req.route?.path` is undefined:
```typescript
const route = req.route?.path || '<unmatched>';
```

### ⚠️ MINOR — security.txt canonical domain mismatch

**File:** `api/public/.well-known/security.txt`  
**Issue:** `Canonical` and other URLs reference `agentguard.dev` while the codebase and CORS config use `agentguard.tech`. If this is intentional (separate security portal), document it. If not, update to match.  
**Impact:** Low — informational only.

---

## Detailed File Review

### New Service Layer (excellent)

- **`api/services/agent.service.ts`** — Clean extraction from `agents.ts` and `agent-hierarchy.ts`. Proper error types (`AgentNotFoundError`, `AgentValidationError`). Good Dto pattern.
- **`api/services/audit.service.ts`** — Solid extraction from `audit.ts`. Static helpers for backward-compat re-exports. Hash chain verification/repair logic preserved correctly. Webhook delivery now uses `signWebhookPayload` from `webhook-signing.ts` (upgrade from manual HMAC).
- **`api/services/policy.service.ts`** — Clean separation of policy logic. Good error handling for corrupt stored policies.

### New Routes (good)

- **`api/routes/evaluate/batch.ts`** — Well-structured batch evaluation with proper validation, parallel execution, and audit logging. Zod schema validation at the boundary.
- **`api/routes/evaluate/helpers.ts`** — Good extraction of shared evaluation logic.
- **`api/routes/scim/`** — Proper SCIM 2.0 implementation. Separate bearer auth from main API. RBAC on token management. Good schema validation.
- **`api/routes/stripe-webhook/`** — HMAC signature verification, idempotent processing, clean error handling.
- **`api/routes/policy-git-webhook/`** — GitHub HMAC verification on webhook, role-based auth on CRUD operations.

### Infrastructure (good)

- **`api/lib/metrics.ts`** — Zero-dependency Prometheus collector. Correct histogram implementation (cumulative at output time). Clean API.
- **`api/lib/shutdown.ts`** — Proper graceful shutdown with SSE drain, DB close, Redis close, force-exit timeout.
- **`api/lib/webhook-signing.ts`** — HMAC-SHA256 with constant-time comparison (`timingSafeEqual`). Timestamp tolerance. Clean API.
- **`api/middleware/index.ts`** — Good extraction from server.ts. Correct middleware ordering with comments. `scrubTokenFromUrl` at position 1.
- **`api/middleware/versioning.ts`** — Simple, correct API version header middleware.

### SDK Additions (good)

- **`packages/sdk/src/core/local-evaluator.ts`** — Ed25519 bundle signature verification. Offline mode support. Good TTL/cache design.
- **`packages/sdk/src/core/bundle-types.ts`** — Clean type definitions. Key rotation support via `notBefore`/`notAfter`.
- **`packages/sdk/src/__tests__/local-evaluator.test.ts`** — Comprehensive test coverage for the local evaluator.

### Console → Logger Migration (excellent pattern)

All `console.log/warn/error` calls across 15+ files migrated to structured `logger` from `pino`. This is a significant observability improvement. No regressions found in the migration.

### server.ts Refactor (clean)

900-line monolith reduced to ~120 lines. Pre-DB middleware in `app.ts`, route registration in `routes/index.ts`, middleware in `middleware/index.ts`. Clear separation of concerns.

---

## Overall Verdict

## ⚠️ NEEDS FIXES

The branch is **almost ready** to merge. Two code-level issues must be addressed:

1. **`api/middleware/auth.ts`** — Fix the misindented `logger.warn` that fires for every authenticated request (produces false "legacy key" warnings in production).
2. **`api/routes/index.ts`** — Update three `version: '0.9.0'` references to `'0.10.0'`.

The failing test (`health.test.ts`) is a test assertion issue, not a code bug — the health endpoint correctly reports `'degraded'` when Redis is unavailable. Update the test assertion to match.

After these fixes, this branch is ready to merge. The architectural improvements (service layer extraction, server.ts decomposition, console→logger migration, Prometheus metrics, graceful shutdown) are substantial and well-executed.
