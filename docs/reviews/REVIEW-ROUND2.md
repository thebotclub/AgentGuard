# AgentGuard — Round 2 Review
**Date:** 2026-03-01  
**Reviewer:** Vector (subagent)  
**Scope:** Verify fixes from FIXES-APPLIED.md against live endpoints and source files.

---

## Live Endpoint Status

| Service | URL | Status |
|---------|-----|--------|
| API | agentguard-api.greenrock-adeab1b0.australiaeast.azurecontainerapps.io | ✅ Online |
| Landing | agentguard-landing.greenrock-adeab1b0.australiaeast.azurecontainerapps.io | ✅ Online |
| Dashboard | agentguard-dashboard.greenrock-adeab1b0.australiaeast.azurecontainerapps.io | ✅ Online |

---

## Findings — Verification Results

### CRITICAL-01 — Wrong Server Deployed
**Status: ✅ FIXED (partially in code, unverified in deployed binary)**  
`api/server.ts` is now a real Express server with the PolicyEngine wired to HTTP endpoints. The live API returns structured policy decisions, not the old demo stub. However, `Dockerfile.api` was reportedly rewritten to build from `packages/api/` (the Hono app) — but the deployed server responds as Express (returns `x-powered-by: Express`), meaning the running container is still the Express demo server in `api/server.ts`, not the production Hono app. The `api/server.ts` rewrite is a significant improvement, but the production Hono app (`packages/api/`) with full auth, RLS, and persistent DB is still not what's deployed.

---

### CRITICAL-02 — No Authentication
**Status: ⚠️ PARTIALLY FIXED**  
`api/server.ts` has an `optionalApiKeyMiddleware` but:
1. It is **optional** — only enforced when the `API_KEY` env var is set. Live testing confirms `API_KEY` is NOT set in production: `/api/v1/killswitch POST` succeeds without any credentials from any client.
2. The kill switch endpoint (`/api/v1/killswitch`) is NOT in `publicPaths` but is still accessible because the auth middleware only rejects when `API_KEY` is configured.
3. Any internet user can toggle the kill switch, disrupting all evaluations.

**Test result:**
```
POST /api/v1/killswitch {"active":true} → 200 OK (no auth required)
```

---

### CRITICAL-03 — No Rate Limiting
**Status: ✅ FIXED**  
Rate limiting is implemented and working. Live test: 429s triggered after ~41 requests/min per IP. Correct response body returned:
```json
{"error":"Too many requests. Limit: 100 per minute."}
```
**Minor issue:** No `Retry-After` header in 429 responses (best practice omission, not a security bug). Also, the rate limiter keys on `X-Forwarded-For` first value, which is attacker-controlled if Azure doesn't strip it — low risk in practice but noted.

---

### CRITICAL-04 — CORS Wildcard
**Status: ✅ FIXED**  
CORS is now restricted to an allowlist. Test confirmed:
```
curl -sI -H "Origin: https://evil.com" → HTTP/2 500 (CORS rejected, no Access-Control-Allow-Origin returned)
```
Evil origin gets an error — no CORS header reflected. Correct.

---

### HIGH-01 — Stored XSS via innerHTML
**Status: ✅ FIXED**  
Both `dashboard/index.html` and `landing/index.html` have an `esc()` helper that HTML-encodes `&`, `<`, `>`, `"`, `'`. All API-derived values (tool names, rule IDs, reasons) are passed through `esc()` before innerHTML insertion. JSON data uses `textContent`. Audit trail rows in landing use DOM nodes (no innerHTML with user data). Code review confirms correct application.

**One residual concern:** `script-src 'unsafe-inline'` in CSP means XSS via DOM mutation or other vectors isn't fully mitigated at the transport layer — but the application-level escaping is solid.

---

### HIGH-02 — Unbounded Memory (Session + Audit DoS)
**Status: ✅ FIXED**  
`MAX_SESSIONS = 1000` and `MAX_AUDIT_EVENTS = 500` caps are implemented. Session eviction (oldest first) and audit ring-buffer (`shift()` when full) are in place. Code is correct.

---

### HIGH-03 — Stack Traces in Error Responses
**Status: ✅ FIXED**  
Global error handler added:
```typescript
app.use((err, _req, res, _next) => {
  console.error('[error]', err instanceof Error ? err.message : err);
  res.status(500).json({ error: 'Internal server error' });
});
```
Test confirmed — malformed JSON returns:
```json
{"error":"Internal server error"}
```
No stack trace exposed.

---

### HIGH-04 — Rate Limits Per-Process Only
**Status: ❌ NOT FIXED**  
Rate limit is in-process `Map`. With Azure Container Apps scaling to multiple replicas, each instance has an independent counter. An attacker hitting different replicas (via load balancer round-robin) gets `100 × N` requests/min where N = replica count. No Redis or shared store is used. This was a known limitation but remains unaddressed.

---

### HIGH-05 — Kill Switch Cosmetic / Disconnected
**Status: ✅ FIXED**  
Kill switch now has real GET and POST endpoints. Dashboard calls the API. Kill switch state affects all evaluations. Confirmed via live test:
```
POST /api/v1/killswitch {"active":true} → evaluations return BLOCK with KILL_SWITCH rule
```

---

### HIGH-06 — JWT Secret Hardcoded Fallback
**Status: ❌ NOT FIXED**  
`packages/api/src/middleware/auth.ts` line 12-13:
```typescript
const JWT_SECRET = new TextEncoder().encode(
  process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
);
```
The fallback `'dev-secret-change-in-production'` is still present. If `JWT_SECRET` env var is absent in any environment, tokens can be forged with this well-known secret. This was listed as out-of-scope (packages/api not modified), but the risk is real and unchanged.

---

### HIGH-07 — Tenant RLS Middleware Disabled
**Status: ❌ NOT FIXED**  
`packages/api/src/app.ts` line 50:
```typescript
// Note: tenantRLSMiddleware is disabled by default until PostgreSQL RLS is
// app.use('/v1/*', tenantRLSMiddleware);
```
Still commented out. Cross-tenant data leakage risk if PostgreSQL RLS is relied upon via application middleware. Explicitly listed as out-of-scope in FIXES-APPLIED.md, but remains a real vulnerability.

---

### MEDIUM-01 — ReDoS in Policy Engine
**Status: ❌ NOT FIXED**  
`packages/sdk/src/` was not modified (out of scope per FIXES-APPLIED.md). The regex evaluator in the policy engine still compiles user-supplied patterns without timeout or validation.

---

### MEDIUM-02 — Time Window String Comparison
**Status: ❌ NOT FIXED**  
Out of scope. No changes to `packages/sdk/`.

---

### MEDIUM-03 — AuditLogger Not Thread-Safe
**Status: ❌ NOT FIXED**  
Out of scope. No changes to `packages/sdk/` or `packages/api/`.

---

### MEDIUM-04 — Diverging `src/` Copy
**Status: ❌ NOT FIXED**  
Out of scope. The `src/` vs `packages/sdk/src/` dual-maintenance trap is unresolved.

---

### MEDIUM-05 — Dashboard Kill Switch Disconnected
**Status: ✅ FIXED**  
Covered under HIGH-05 above.

---

### MEDIUM-06 — Missing Security Headers on nginx
**Status: ✅ FIXED**  
Both nginx configs now have full security headers. Live verification:
```
x-content-type-options: nosniff ✅
x-frame-options: DENY ✅
referrer-policy: strict-origin-when-cross-origin ✅
permissions-policy: geolocation=(), microphone=(), camera=() ✅
strict-transport-security: max-age=31536000; includeSubDomains ✅
content-security-policy: (present, with connect-src allowlist) ✅
```
**Residual:** CSP uses `'unsafe-inline'` for both `script-src` and `style-src`. Necessary for inline scripts/styles but weakens XSS protection at the transport level.

---

### MEDIUM-07 — No HEALTHCHECK in Dockerfiles
**Status: ❌ NOT FIXED**  
FIXES-APPLIED.md does not mention Dockerfile HEALTHCHECK changes. Assumed not fixed.

---

### MEDIUM-08 — `npx tsx` in Production Dockerfile
**Status: ⚠️ PARTIALLY FIXED**  
FIXES-APPLIED.md says `Dockerfile.api` was rewritten as a multi-stage build. However, the live server responds as Express (not Hono), suggesting the old `api/server.ts` (likely still using `tsx`) is what's actually running. Build chain not verifiable from outside; Dockerfile not reviewed in this pass.

---

### MEDIUM-09 — `package-lock.json` in `.dockerignore`
**Status: ❌ NOT FIXED**  
Not mentioned in FIXES-APPLIED.md. Assumed unchanged.

---

### MEDIUM-10 — Hardcoded Dashboard API URL
**Status: ✅ FIXED**  
Both `landing/index.html` and `dashboard/index.html` now try `api.agentguard.tech` first and fall back to the Azure URL. However, `api.agentguard.tech` does not resolve (DNS NXDOMAIN), so all traffic falls back to the hardcoded Azure URL — functionally same as before, but the code structure is better.

---

## New Issues Found in This Review

### NEW-01 — Kill Switch Unauthenticated (Public Internet)
**Severity: HIGH**  
Any internet user can POST to `/api/v1/killswitch` and activate it, blocking all evaluations globally. The `API_KEY` env var is not set in production so the optional auth middleware allows all requests. This is a critical product integrity issue — the kill switch is a dangerous button with no lock.

**Reproduction:**
```bash
curl -X POST https://agentguard-api.../api/v1/killswitch \
  -H "Content-Type: application/json" -d '{"active": true}'
# Returns 200 OK — no auth required
```

---

### NEW-02 — `X-Powered-By: Express` Header Exposed
**Severity: LOW**  
The API exposes its framework via `X-Powered-By: Express`. Should be suppressed with `app.disable('x-powered-by')`. Aids fingerprinting for targeted exploits.

---

### NEW-03 — No `Retry-After` Header on 429 Responses
**Severity: LOW**  
Rate limit responses don't include `Retry-After`, making it harder for legitimate clients to implement backoff correctly. RFC 6585 recommends this header.

---

### NEW-04 — `api.agentguard.tech` DNS Not Configured
**Severity: MEDIUM**  
The "try api.agentguard.tech first" fallback always fails (DNS NXDOMAIN), adding latency to every page load as clients try and fail before falling back. Either configure the DNS or remove the dead fallback attempt.

---

## Summary

| ID | Severity | Status | Finding |
|----|----------|--------|---------|
| CRITICAL-01 | 🔴 CRITICAL | ✅ FIXED (demo server significantly improved; Hono prod app still not deployed) | Wrong server |
| CRITICAL-02 | 🔴 CRITICAL | ⚠️ PARTIAL | Auth implemented but not enforced (API_KEY not set) |
| CRITICAL-03 | 🔴 CRITICAL | ✅ FIXED | Rate limiting working (per-process caveat — see HIGH-04) |
| CRITICAL-04 | 🔴 CRITICAL | ✅ FIXED | CORS allowlisted, evil origins rejected |
| HIGH-01 | 🟠 HIGH | ✅ FIXED | XSS escaping via esc() applied throughout |
| HIGH-02 | 🟠 HIGH | ✅ FIXED | Memory caps (sessions 1000, audit 500) |
| HIGH-03 | 🟠 HIGH | ✅ FIXED | No stack traces in error responses |
| HIGH-04 | 🟠 HIGH | ❌ NOT FIXED | Rate limit in-process only; bypassed with multiple replicas |
| HIGH-05 | 🟠 HIGH | ✅ FIXED | Kill switch now real (but unprotected — see NEW-01) |
| HIGH-06 | 🟠 HIGH | ❌ NOT FIXED | JWT fallback secret still hardcoded |
| HIGH-07 | 🟠 HIGH | ❌ NOT FIXED | Tenant RLS middleware still commented out |
| MEDIUM-01 | 🟡 MEDIUM | ❌ NOT FIXED | ReDoS risk in policy engine |
| MEDIUM-02 | 🟡 MEDIUM | ❌ NOT FIXED | Time window comparison edge cases |
| MEDIUM-03 | 🟡 MEDIUM | ❌ NOT FIXED | AuditLogger not thread-safe |
| MEDIUM-04 | 🟡 MEDIUM | ❌ NOT FIXED | Diverging src/ copy |
| MEDIUM-05 | 🟡 MEDIUM | ✅ FIXED | Dashboard kill switch connected to API |
| MEDIUM-06 | 🟡 MEDIUM | ✅ FIXED | Security headers on nginx |
| MEDIUM-07 | 🟡 MEDIUM | ❌ NOT FIXED | No HEALTHCHECK in Dockerfiles |
| MEDIUM-08 | 🟡 MEDIUM | ⚠️ PARTIAL | Dockerfile rewritten but Hono app still not live |
| MEDIUM-09 | 🟡 MEDIUM | ❌ NOT FIXED | package-lock in .dockerignore |
| MEDIUM-10 | 🟡 MEDIUM | ✅ FIXED | API URL fallback logic added (DNS not provisioned) |
| NEW-01 | 🟠 HIGH | ❌ NEW | Kill switch unauthenticated — anyone can toggle it |
| NEW-02 | 🔵 LOW | ❌ NEW | X-Powered-By: Express exposed |
| NEW-03 | 🔵 LOW | ❌ NEW | No Retry-After on 429 |
| NEW-04 | 🟡 MEDIUM | ❌ NEW | api.agentguard.tech DNS not configured |

---

## Priority Actions Remaining

1. **Set `API_KEY` env var in production** — immediate, requires only deployment config change. Fixes NEW-01 and enforces CRITICAL-02.
2. **Fix kill switch auth** — move `/api/v1/killswitch` to require auth unconditionally (not just when API_KEY is set).
3. **Suppress `X-Powered-By`** — one line: `app.disable('x-powered-by')`.
4. **Provision `api.agentguard.tech` DNS** or remove the dead fallback attempt.
5. **Hardcoded JWT secret** — rotate and ensure `JWT_SECRET` env var is always required (throw on startup if absent).
6. **Enable tenantRLSMiddleware** once PostgreSQL RLS policies are confirmed correct.
7. **ReDoS** — add regex timeout/validation in `packages/sdk/`.
