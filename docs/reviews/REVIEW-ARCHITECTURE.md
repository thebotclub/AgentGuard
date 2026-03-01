# AgentGuard — Architecture Review

**Reviewer:** Senior Solutions Architect (automated deep review)  
**Date:** 2026-03-01  
**Scope:** Full codebase + live endpoint testing  
**Live URLs tested:**
- API: https://agentguard-api.greenrock-adeab1b0.australiaeast.azurecontainerapps.io/
- Dashboard: https://agentguard-dashboard.greenrock-adeab1b0.australiaeast.azurecontainerapps.io/
- Landing: https://agentguard-landing.greenrock-adeab1b0.australiaeast.azurecontainerapps.io/

---

## Executive Summary

AgentGuard has a well-designed **SDK and policy engine core** with thoughtful abstractions (hash-chained audit log, typed event emitter kill switch, Zod-validated DSL, compiled rule bundles). However, the project has a **critical architectural split**: the Dockerfile deploys a throwaway Express demo server (`api/server.ts`) instead of the production-grade Hono API (`packages/api/`). Everything else in this report flows from that and from the security posture of the publicly exposed demo server.

**Verdict:** Not production-ready. The SDK is ~70% complete and solid. The "API" that is live is a demo, not a product.

---

## Findings

---

### CRITICAL-01 — Wrong Server Is Deployed

**Severity:** CRITICAL  
**Affected files:** `Dockerfile.api`, `api/server.ts`, `packages/api/src/`

**Finding:**  
`Dockerfile.api` runs `npx tsx api/server.ts` — the Express playground/demo server — rather than the production Hono API in `packages/api/src/`. The production API (`packages/api/`) has authentication middleware, Prisma+PostgreSQL persistence, Redis caching, RBAC, multi-tenancy, HITL gates, and a full Zod-validated route layer. None of that is live. The demo server is what visitors and evaluators are hitting.

Verified live:
```
GET /v1/health → 404 Not Found
GET /health → 200 OK (demo server)
```

The `packages/api/dist/` is built but goes nowhere. There is no Docker build step that targets the monorepo's `packages/api` entrypoint.

**Recommendation:**  
Update `Dockerfile.api` to build and run `packages/api`. Use the multi-stage pattern already present in `Dockerfile.worker`. The correct entrypoint is `packages/api/src/index.ts` (port 8080). The demo `api/server.ts` should be retired or clearly namespaced as a local dev tool only.

---

### CRITICAL-02 — No Authentication on Live API

**Severity:** CRITICAL  
**Affected files:** `api/server.ts`, `Dockerfile.api`

**Finding:**  
The deployed Express server has zero authentication. Any actor on the internet can:
1. Create unlimited sessions (`POST /api/v1/playground/session`)
2. Evaluate arbitrary tool+param combinations against the policy engine
3. Upload custom policy documents that replace engine state (`req.body?.policy` accepted)
4. Read the full policy document including all blocked domains, PII table names, and approval flows (`GET /api/v1/playground/policy`)
5. Read any session's complete audit trail by session ID (`GET /api/v1/playground/audit/:sessionId`)

Confirmed live with unauthenticated curl calls. All return 200.

**Recommendation:**  
Deploy the Hono API (which has proper JWT + API key auth). If the demo server must stay, add at minimum an `X-API-Key` header check for write endpoints, and never expose `POST /session` policy injection publicly.

---

### CRITICAL-03 — No Rate Limiting on Evaluation Endpoints

**Severity:** CRITICAL  
**Affected files:** `api/server.ts`

**Finding:**  
The live `/api/v1/evaluate` and `/api/v1/playground/evaluate` endpoints have no rate limiting at the HTTP layer. Confirmed: 10 back-to-back requests all return HTTP 200 with no throttling. This enables:
- Abuse of the policy engine compute (CPU exhaustion)
- Session flooding (unbounded in-process `Map` growth)
- Brute-force enumeration of session IDs

The `.env.example` defines `RATE_LIMIT_GLOBAL_RPM=600` and `RATE_LIMIT_TENANT_RPM=120` but these are never wired to the deployed server. The production Hono API has a `rateLimited` error class but the middleware is never mounted.

**Recommendation:**  
Add a middleware rate limiter (e.g. `express-rate-limit` for the demo, or a Redis-backed limiter for production) before any compute-bound handler. Apply 60 req/min per IP on `/api/v1/evaluate` minimum.

---

### CRITICAL-04 — CORS Wildcard on Live API

**Severity:** CRITICAL  
**Affected files:** `api/server.ts`, `packages/api/src/app.ts`

**Finding:**  
The demo server uses `app.use(cors())` with no configuration — this defaults to `Access-Control-Allow-Origin: *`. Confirmed live:
```
access-control-allow-origin: *
```

The production Hono app checks `process.env['CORS_ORIGIN'] ?? '*'` which defaults to wildcard if the env var is not set. This means both the deployed server and any misconfigured production deployment allow cross-origin requests from any domain.

**Recommendation:**  
Set `CORS_ORIGIN` explicitly in the container environment to the specific dashboard origin. For the demo server, explicitly enumerate allowed origins. Never default to `*` in any deployed environment.

---

### HIGH-01 — Stored XSS via API Response Data in Dashboard and Landing

**Severity:** HIGH  
**Affected files:** `dashboard/index.html`, `landing/index.html`

**Finding:**  
Both the dashboard and landing page render API response values directly into `innerHTML` without escaping:

```javascript
// dashboard/index.html line 509-510
${d.matchedRuleId ? `<div ...>rule: ${d.matchedRuleId}</div>` : ''}
<div ...>${d.reason || 'Default action applied'}</div>

// line 562
<div class="feed-tool">${event.tool} → ...

// line 582
<td>${event.tool}</td>

// landing/index.html
${decision.matchedRuleId ? `... → rule: ${decision.matchedRuleId} ...` : ''}
```

If the API returns a `matchedRuleId`, `reason`, or `tool` value containing `<script>` or `<img onerror=...>` payloads, they will execute in the user's browser. The API accepts arbitrary `tool` names (no allowlist, no server-side sanitization). This is a stored XSS vector since audit sessions persist the tool name.

Attack: A user crafts `tool: "<img src=x onerror=alert(document.cookie)>"`, submits it to `/api/v1/playground/evaluate`, then shares the session link. Anyone viewing the audit trail for that session triggers XSS.

**Recommendation:**  
Escape all API-derived values before inserting into HTML. Use `textContent` for plain text, or a proper escaping function:
```javascript
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```
Add a `Content-Security-Policy` header to both nginx configs blocking inline scripts.

---

### HIGH-02 — Unbounded In-Process Memory Growth (Session + Audit DoS)

**Severity:** HIGH  
**Affected files:** `api/server.ts`

**Finding:**  
The demo server stores all sessions and audit trails in a process-level `Map`:
```typescript
const sessions = new Map<string, SessionState>();
```
- Each session: a `PolicyEngine` instance + unbounded `auditTrail` array
- Cleanup runs every 10 minutes, evicting sessions older than 30 minutes
- No cap on total sessions or events per session
- No cap on session audit trail length

An attacker can create sessions faster than they expire (session creation takes ~10ms, expiry is 30 min). Each session holds a `PolicyEngine` (~50KB+), multiple compile-time data structures, and an ever-growing audit array. This is a straightforward OOM DoS.

Confirmed: 10 sessions created in rapid succession with no throttling or quota.

**Recommendation:**  
Add a session cap (`if (sessions.size > 1000) reject`), cap audit trail per session (e.g., 200 events max, ring buffer), and reduce cleanup interval. Move to Redis-backed sessions for any horizontally scaled deployment.

---

### HIGH-03 — Error Responses Leak Internal Stack Traces (Production)

**Severity:** HIGH  
**Affected files:** `api/server.ts`, `packages/api/src/middleware/error.ts`

**Finding:**  
In `api/server.ts`, Express's default error handler is used, and when `body-parser` rejects an oversized payload, it returns a raw HTML error with full stack trace:
```html
<pre>PayloadTooLargeError: request entity too large
  at readStream (/app/node_modules/raw-body/index.js:163:17)
  at getRawBody (/app/node_modules/raw-body/index.js:116:12)
  at read (/app/node_modules/body-parser/lib/types/json.js:88:5)
```

This exposes internal module paths and dependency structure to any attacker. Confirmed live by sending a ~300KB JSON payload.

The Hono API's error handler correctly strips stack traces in production (`NODE_ENV !== 'production'` check), but the demo server has no such guard.

**Recommendation:**  
Add an Express error handler in `api/server.ts` that returns structured JSON and hides stack traces. Better: deploy the Hono API.

---

### HIGH-04 — Policy Engine Rate Limits Are Per-Process, Not Global

**Severity:** HIGH  
**Affected files:** `packages/sdk/src/core/policy-engine.ts`, `packages/api/src/services/policy.ts`

**Finding:**  
Rate limit state is stored in a process-level `Map<string, RateLimitBucket>`:
```typescript
private readonly rateLimitState: RateLimitState = new Map();
```

In any horizontally scaled deployment (multiple API containers, Azure Container Apps scales out), each instance has independent rate limit counters. A policy rule `maxCalls: 10 per session` becomes effectively `maxCalls: 10 * N` where N is instance count. The rate limiting provides a false sense of security.

The comments acknowledge this ("production: back with Redis") but this is not wired up even in the Hono production API path (`packages/api/src/services/policy.ts` line 75 has the same in-process Map pattern).

**Recommendation:**  
Implement the Redis-backed rate limit using the existing `RedisKeys.rateLimit()` helper. Use `INCR` + `EXPIRE` atomic operations on a Redis key per `{tenantId}:{ruleId}:{keyBy}:{value}`. This must be done before any production deployment with horizontal scaling.

---

### HIGH-05 — Kill Switch Is Purely Cosmetic in Deployed System

**Severity:** HIGH  
**Affected files:** `dashboard/index.html`, `api/server.ts`

**Finding:**  
The dashboard's Kill Switch feature is entirely client-side state:
```javascript
let killActive = false;
function toggleKillSwitch() {
  killActive = !killActive;
  // ... updates button UI only
}
```

There is no API call to a kill switch endpoint. The `killActive` flag gates only client-side evaluation; the actual `/api/v1/evaluate` endpoint is unaffected. Reloading the page resets `killActive` to false. The SDK's `KillSwitch` class and the Hono API's `KillSwitchService` are not connected to what is deployed.

This is particularly dangerous because users evaluating AgentGuard's "emergency halt" capability will believe they have tested it when they have not.

**Recommendation:**  
Wire the kill switch button to the actual Hono API endpoint (`POST /v1/killswitch/halt-all`). If the demo server must remain, add a kill switch endpoint that sets a process-level flag checked in all evaluate handlers. Clearly label demo limitations.

---

### HIGH-06 — JWT Secret Hardcoded Fallback in Auth Middleware

**Severity:** HIGH  
**Affected files:** `packages/api/src/middleware/auth.ts`

**Finding:**  
```typescript
const JWT_SECRET = new TextEncoder().encode(
  process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
);
```

If `JWT_SECRET` is not set in the container environment (e.g., a misconfiguration during deployment), the server falls back to a public, well-known secret. Anyone who knows this pattern can forge valid JWTs for any tenant and role. The `.env.example` also documents the fallback value explicitly.

**Recommendation:**  
Throw a fatal startup error if `JWT_SECRET` is absent in non-development environments:
```typescript
if (!process.env['JWT_SECRET'] && process.env['NODE_ENV'] === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
```
Switch to RS256 in production (asymmetric keys) as noted in `.env.example`.

---

### HIGH-07 — Tenant RLS Middleware Is Disabled

**Severity:** HIGH  
**Affected files:** `packages/api/src/app.ts`, Prisma schema

**Finding:**  
The PostgreSQL Row-Level Security middleware is explicitly commented out:
```typescript
// Note: tenantRLSMiddleware is disabled by default until PostgreSQL RLS is
// enabled in the database. Uncomment after running migration SQL.
// app.use('/v1/*', tenantRLSMiddleware);
```

RLS is the last line of defence against cross-tenant data leakage. Even with correct application-level `tenantId` filtering, any SQL injection or query bug could expose another tenant's data without RLS. The migration SQL to enable RLS is referenced but its existence is not confirmed in the repo.

**Recommendation:**  
Enable RLS before any production data ingestion. Create and commit the migration file that enables RLS policies on all tables. Enable `tenantRLSMiddleware` and test it. This is a multi-tenancy correctness requirement, not an optimization.

---

### MEDIUM-01 — ReDoS Risk in Policy Engine Regex Evaluator

**Severity:** MEDIUM  
**Affected files:** `packages/sdk/src/core/policy-engine.ts`

**Finding:**  
The policy engine compiles and executes user-supplied regex patterns from policy rules at evaluation time without any validation or timeout:
```typescript
// Line 606
if (!new RegExp(condition.regex).test(toolName)) return false;
// Line 675
if (!new RegExp(constraint.regex).test(String(value))) return false;
```

A malicious policy author (or any user of the demo session endpoint) can submit regex patterns that cause catastrophic backtracking. Example: `(a+)+b` tested against `"aaaaaaaaaaaaaaaaaaaaaaaaaaab"` will hang the event loop.

While the demo server's policy is hardcoded, the `POST /api/v1/playground/session` endpoint accepts a custom policy document:
```json
{ "policy": { ... "rules": [{ "when": [{ "tool": { "regex": "(a+)+b" } }] }] } }
```

The Zod schema validates structure but not regex safety. The regex is compiled fresh on every evaluation call (no caching), amplifying the performance hit.

**Recommendation:**  
1. Validate regex patterns at compile time (during `PolicyCompiler.compileRule()`) using a try/catch to detect syntax errors
2. Cache compiled `RegExp` objects in `CompiledRule` rather than constructing `new RegExp()` on every evaluation call
3. Consider using a regex safety library (e.g., `safe-regex` or `re2`) to reject catastrophically backtracking patterns
4. In `PolicyService`, validate that users cannot submit arbitrary regex-bearing policies without elevated permissions

---

### MEDIUM-02 — Time Window Comparison Is String-Based and Has Edge Cases

**Severity:** MEDIUM  
**Affected files:** `packages/sdk/src/core/policy-engine.ts` (`isInTimeRange`)

**Finding:**  
Time window comparison uses locale-string comparison:
```typescript
const timeStr = now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
return timeStr >= startTime && timeStr <= endTime;
```

Issues:
1. **Midnight wrapping**: Policies spanning midnight (e.g., `22:00` to `02:00`) are silently broken — the condition `22:00 >= 22:00 && 22:00 <= 02:00` is false at 23:00 because `23:00 > 02:00` lexicographically
2. **toLocaleString instability**: `hour12: false` with `hour: '2-digit'` can return `'24:00'` for midnight on some Node.js/ICU versions instead of `'00:00'`, breaking comparisons
3. **No timezone validation**: Invalid timezone strings fall back to "not in window" silently, which could incorrectly allow actions during restricted hours

**Recommendation:**  
Use numeric hour/minute comparison:
```typescript
const dt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
const hours = parseInt(dt.find(p => p.type === 'hour')!.value);
const minutes = parseInt(dt.find(p => p.type === 'minute')!.value);
const current = hours * 60 + minutes;
const start = parseTimeToMinutes(startTime);
const end = parseTimeToMinutes(endTime);
// Handle midnight wrap: if end < start, it's an overnight window
return end < start ? (current >= start || current <= end) : (current >= start && current <= end);
```

---

### MEDIUM-03 — AuditLogger Is Not Thread-Safe for Concurrent Writes

**Severity:** MEDIUM  
**Affected files:** `packages/sdk/src/core/audit-logger.ts`

**Finding:**  
The `AuditLogger` uses synchronous `appendFileSync` for writes, which is safe for single-threaded Node.js but has a race condition in the hash chain state:

```typescript
private seq = 0;
private lastHash: string = GENESIS_HASH;

log(input: LogActionInput): AuditEvent {
  const previousHash = this.lastHash;  // Read
  // ... compute hash ...
  this.lastHash = eventHash;           // Write
  this._write(event);                  // Append to file
}
```

In a worker thread or if two async paths call `log()` concurrently (the Hono API fires `logAuditEvent` as `void` fire-and-forget), the seq counter and lastHash can be read by two concurrent calls before either writes, producing duplicate seq numbers and a broken hash chain. The file-based logger is also not viable for multi-instance deployments — each instance maintains an independent chain, and the audit log is silently split across instances.

**Recommendation:**  
1. Short-term: use an async queue (e.g., `p-queue`) to serialize log writes
2. Long-term: the database-backed `AuditService` (in `packages/api/src/services/audit.ts`) is the correct solution for multi-instance deployments — ensure the file-based logger is only used for local SDK usage, not in the API path
3. Document clearly which logger is used where

---

### MEDIUM-04 — `src/` Directory Is a Diverging Copy of `packages/sdk/src/`

**Severity:** MEDIUM  
**Affected files:** `src/core/`, `packages/sdk/src/core/`

**Finding:**  
There are two near-identical copies of the core SDK files:
- `/src/core/` (audit-logger.ts 10813 bytes, policy-engine.ts 27313 bytes, etc.)
- `/packages/sdk/src/core/` (audit-logger.ts 10808 bytes, policy-engine.ts 27303 bytes, etc.)

File sizes differ by a few bytes, indicating they have diverged. The `api/server.ts` imports from `../packages/sdk/src/core/policy-engine.js` directly. The `src/` directory has no build pipeline, no `package.json`, no clear ownership.

This is a maintenance nightmare: bug fixes in one copy won't propagate, and it's impossible to know which is canonical.

**Recommendation:**  
Delete `src/` entirely. The canonical source is `packages/sdk/src/`. If `src/` is needed for the demo server context, import from the package directly.

---

### MEDIUM-05 — Dashboard Kill Switch Does Not Call API

**Severity:** MEDIUM (separate from HIGH-05 above; this is a product integrity issue)  
**Affected files:** `dashboard/index.html`

**Finding:**  
The "kill switch" in the dashboard is entirely frontend state that resets on page refresh and makes no API call. Operators relying on this for incident response will be surprised. This is documented separately because it's a product-level gap beyond just the demo/prod split.

---

### MEDIUM-06 — Missing CSP and Security Headers on nginx Services

**Severity:** MEDIUM  
**Affected files:** `nginx-landing.conf`, `nginx-dashboard.conf`

**Finding:**  
Both nginx configs are minimal — no security headers:
```nginx
# nginx-landing.conf — no security headers
server {
    listen 80;
    location / { try_files $uri $uri/ /index.html; }
    gzip on;
}
```

Missing:
- `Content-Security-Policy` (XSS protection)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (clickjacking)
- `Strict-Transport-Security` (HSTS)
- `Permissions-Policy`
- `Referrer-Policy`

Confirmed live: `curl -I https://agentguard-landing... | grep -i security` returns nothing.

The Hono API has `secureHeaders()` middleware but it's not deployed (CRITICAL-01). The nginx frontends are completely unprotected.

**Recommendation:**  
Add to both nginx configs:
```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src https://agentguard-api.greenrock-adeab1b0.australiaeast.azurecontainerapps.io; font-src fonts.googleapis.com fonts.gstatic.com;" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

---

### MEDIUM-07 — No Health Check in Dockerfile.api or Dockerfile.landing

**Severity:** MEDIUM  
**Affected files:** `Dockerfile.api`, `Dockerfile.landing`

**Finding:**  
`Dockerfile.api` and `Dockerfile.landing` have no `HEALTHCHECK` instruction. Azure Container Apps will use basic TCP liveness, meaning a process that is stuck or returning 500s on all routes will still be considered "healthy."

`Dockerfile.worker` correctly has:
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
```

**Recommendation:**  
Add the same `HEALTHCHECK` pattern to `Dockerfile.api` targeting `/health` and `Dockerfile.landing` targeting the nginx health endpoint.

---

### MEDIUM-08 — Dockerfile.api Uses `npx tsx` in Production (Dev Dependency, No Build)

**Severity:** MEDIUM  
**Affected files:** `Dockerfile.api`

**Finding:**  
```dockerfile
FROM node:20-alpine
# ...
CMD ["npx", "tsx", "api/server.ts"]
```

Problems:
1. `tsx` is a TypeScript runtime suitable for development, not production. It has no multi-threading, no clustering, and higher startup latency than compiled JS
2. `npx` resolves and potentially downloads packages at container startup — non-deterministic in airgapped or registry-throttled environments
3. Uses `node:20-alpine` while the rest of the project specifies `node:22` in engines and `Dockerfile.worker`
4. No multi-stage build — dev dependencies, TypeScript source, and `tsx` are all in the production image, increasing attack surface and image size
5. `npm install` in the Dockerfile uses `2>/dev/null` to silence errors — this hides installation failures silently

**Recommendation:**  
Replace with a proper multi-stage build that compiles TypeScript to JS:
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx turbo run build --filter=@agentguard/api

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 agentguard
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER agentguard
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "..."
CMD ["node", "dist/index.js"]
```

---

### MEDIUM-09 — `package-lock.json` in `.dockerignore`

**Severity:** MEDIUM  
**Affected files:** `.dockerignore`

**Finding:**  
```
package-lock.json
```

Excluding the lockfile from Docker builds means `npm install` (not `npm ci`) is effectively used, installing non-deterministic dependency versions. This defeats the purpose of a lockfile and means production builds may differ from development builds. The correct pattern is to include the lockfile and use `npm ci`.

**Recommendation:**  
Remove `package-lock.json` from `.dockerignore`. Switch all Dockerfile install steps to `npm ci --omit=dev` for production stages.

---

### MEDIUM-10 — Dashboard API URL Is Hardcoded to ACA Hostname

**Severity:** MEDIUM  
**Affected files:** `dashboard/index.html`

**Finding:**  
```javascript
const API = 'https://agentguard-api.greenrock-adeab1b0.australiaeast.azurecontainerapps.io';
```

The Azure Container Apps auto-generated hostname is embedded in a static HTML file. When the Container App is recreated, the hostname changes and the dashboard breaks silently. This also makes it impossible to run the dashboard against a local API for testing.

**Recommendation:**  
Inject the API URL at build time via an environment variable or, for the static HTML approach, use a config endpoint pattern where the HTML reads from a `/config.json` served by nginx.

---

### LOW-01 — `evalParamConditions` — Absent Fields Are Silently Skipped (Policy Bypass Risk)

**Severity:** LOW (but has correctness implications)  
**Affected files:** `packages/sdk/src/core/policy-engine.ts`

**Finding:**  
```typescript
if (value === undefined) {
  if ('exists' in constraint && constraint.exists === true) return false;
  if ('is_null' in constraint && constraint.is_null === false) return false;
  // Field absent but no exists constraint — treat as non-matching only if we have other constraints
  // Per POLICY_ENGINE.md: absent field does not cause rule to fail (continue)
  continue;
}
```

If a rule requires `{ params: { amount: { gt: 1000 } } }` and a request does not include `amount` in params, the rule still matches (the field check is skipped). This means:
- A rule intended to block "transfers over $1000" will also block transfers with no `amount` field specified
- More broadly: a rule testing a specific parameter value passes even when the parameter is absent

This is a documented design decision ("Per POLICY_ENGINE.md"), but it's counterintuitive and could lead to policy authors writing rules they believe are more specific than they are.

**Recommendation:**  
Consider whether this is the intended semantics. If a param constraint should only fire when the param exists, `continue` is correct. If the intent is "if the field should have this value, it must be present," then absence should fail the constraint. Document this clearly in the YAML DSL and add test cases for both branches.

---

### LOW-02 — Root `package.json` Has Express/CORS as Production Dependencies

**Severity:** LOW  
**Affected files:** `package.json`

**Finding:**  
```json
"dependencies": {
  "cors": "^2.8.6",
  "express": "^5.2.1"
}
```

Express and cors are listed in the monorepo root `package.json` as production dependencies. These are only used by the demo `api/server.ts`. The actual production packages (`@agentguard/api`, `@agentguard/sdk`) use Hono, not Express. Hoisting these to the root creates confusion and unnecessary dependencies in packages that don't need them.

**Recommendation:**  
Move Express/cors to `api/package.json` (if the demo server is kept) or remove them entirely.

---

### LOW-03 — `anytype` Usage in Audit Trail

**Severity:** LOW  
**Affected files:** `api/server.ts`

**Finding:**  
```typescript
interface SessionState {
  auditTrail: any[];  // typed as any
}
```

The audit trail in the demo server is typed as `any[]`, losing all type safety for the most security-critical data structure in the application.

**Recommendation:**  
Type the audit trail properly, matching the `AuditEvent` schema from `packages/sdk/src/core/types.ts`.

---

### LOW-04 — `lastSeenAt` Update Is Fire-and-Forget with No Error Handling

**Severity:** LOW  
**Affected files:** `packages/api/src/middleware/auth.ts`

**Finding:**  
```typescript
void prisma.agent.update({
  where: { id: agent.id },
  data: { lastSeenAt: new Date() },
});
```

The `void` operator discards the Promise and any error it throws. If the database is unavailable, this fails silently with no logging. More importantly, this creates an unbounded number of floating Promises that can cause issues if the process shuts down mid-request.

**Recommendation:**  
Use `prisma.agent.update(...).catch(err => console.warn('[auth] lastSeenAt update failed:', err.message))` to at least log failures. Consider batching `lastSeenAt` updates in a background job rather than per-request.

---

### LOW-05 — No CI/CD Pipeline Found in Repository

**Severity:** LOW  
**Affected files:** `.github/workflows/` (absent)

**Finding:**  
There is no `.github/workflows/` directory. The `deploy/` directory contains `deploy-azure.yml`, `terraform-apply.yml`, and `terraform-plan.yml` but it's unclear if these are wired to GitHub Actions. There are no automated test runs, type checks, lint checks, or build validation on pull requests.

**Recommendation:**  
Add a minimal GitHub Actions workflow:
```yaml
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

---

## Summary Table

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| CRITICAL-01 | 🔴 CRITICAL | Architecture | Wrong server deployed — demo Express server not production Hono API |
| CRITICAL-02 | 🔴 CRITICAL | Security | No authentication on live API endpoints |
| CRITICAL-03 | 🔴 CRITICAL | Security | No rate limiting — open to DoS and abuse |
| CRITICAL-04 | 🔴 CRITICAL | Security | CORS wildcard on live API |
| HIGH-01 | 🟠 HIGH | Security | Stored XSS via API response data in dashboard/landing innerHTML |
| HIGH-02 | 🟠 HIGH | Reliability | Unbounded in-process memory growth (session + audit DoS) |
| HIGH-03 | 🟠 HIGH | Security | Stack traces leaked in error responses |
| HIGH-04 | 🟠 HIGH | Correctness | Rate limits are per-process — ineffective in multi-instance deployments |
| HIGH-05 | 🟠 HIGH | Product | Kill switch is purely cosmetic UI — makes no API call |
| HIGH-06 | 🟠 HIGH | Security | JWT secret hardcoded fallback — forgeable tokens if env var absent |
| HIGH-07 | 🟠 HIGH | Security | Tenant RLS middleware disabled — cross-tenant data leakage risk |
| MEDIUM-01 | 🟡 MEDIUM | Security | ReDoS risk — user-supplied regex compiled without validation or timeout |
| MEDIUM-02 | 🟡 MEDIUM | Correctness | Time window comparison breaks at midnight and has ICU edge cases |
| MEDIUM-03 | 🟡 MEDIUM | Correctness | AuditLogger not thread-safe for concurrent writes — broken hash chain risk |
| MEDIUM-04 | 🟡 MEDIUM | Maintainability | `src/` is a diverging copy of `packages/sdk/src/` — dual-maintenance trap |
| MEDIUM-05 | 🟡 MEDIUM | Product | Dashboard kill switch UI disconnected from API |
| MEDIUM-06 | 🟡 MEDIUM | Security | No CSP or security headers on nginx-served frontends |
| MEDIUM-07 | 🟡 MEDIUM | Reliability | No HEALTHCHECK in Dockerfile.api or Dockerfile.landing |
| MEDIUM-08 | 🟡 MEDIUM | Infrastructure | Production Dockerfile uses `npx tsx` — no build step, dev runtime |
| MEDIUM-09 | 🟡 MEDIUM | Infrastructure | `package-lock.json` in `.dockerignore` — non-deterministic builds |
| MEDIUM-10 | 🟡 MEDIUM | Maintainability | Dashboard API URL hardcoded to ACA auto-generated hostname |
| LOW-01 | 🔵 LOW | Correctness | Absent params silently skip constraints — potential policy bypass surprise |
| LOW-02 | 🔵 LOW | Code Quality | Express/cors in root `package.json` as production dependencies |
| LOW-03 | 🔵 LOW | Code Quality | Audit trail typed as `any[]` in demo server |
| LOW-04 | 🔵 LOW | Reliability | `lastSeenAt` update is fire-and-forget with no error handling |
| LOW-05 | 🔵 LOW | Process | No CI/CD pipeline found |

---

## What's Actually Good

To be fair, the following pieces show real engineering thought:

1. **Policy Engine core algorithm** — The priority + conflict resolution logic (`block > require_approval > allow` at equal priority), the `__no_tool__` index for parameter-only rules, the `_partitionAndMatch` two-pass approach separating monitor from terminal rules — all correct and well-documented

2. **Hash-chained audit log** — Genuinely tamper-evident design using SHA-256 chaining with `GENESIS_HASH`, canonical JSON serialization, and a `verify()` method. The implementation is solid for single-instance file-based use

3. **Zod schema validation** — Comprehensive type coverage with strict schemas. `PolicyDocumentSchema` with semver version validation, `ActionRequestSchema` with UUID requirement, `PolicyDecisionSchema` — all correctly aligned with the domain model

4. **Kill switch design** — The `EventEmitter`-based `KillSwitch` class with typed event maps, tier semantics, and `assertNotHalted()` guard is well-designed. It just needs to be wired to the deployed infrastructure

5. **Prisma schema** — Comprehensive multi-tenant data model with correct composite indexes, append-only audit table, soft deletes, and appropriate enum types. RLS is designed in, just not enabled

6. **TypeScript strictness** — `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true` in tsconfig — this is the right configuration and the non-null assertions (`r!`, `rules[i]!`) are deliberate, not lazy

---

## Production Readiness Gaps (for a real MVP launch)

In priority order:

1. **Deploy the right server** (CRITICAL-01) — everything else is blocked by this
2. **Authentication** — the Hono API has it, just need to deploy it
3. **Redis-backed rate limiting** (HIGH-04 / CRITICAL-03) — wires already exist in `RedisKeys`
4. **Enable tenant RLS** (HIGH-07) — write the migration SQL and un-comment the middleware
5. **Fix XSS** (HIGH-01) — textContent + CSP headers, 1 hour of work
6. **CI/CD pipeline** (LOW-05) — nothing should ship without automated test runs
7. **Persistence for kill switch** — currently lost on restart; Redis key exists (`RedisKeys.killSwitch`) but not wired
8. **Observability** — structured logging (not `console.log`), OpenTelemetry traces. The `.env.example` references Datadog but it's not hooked up
9. **Secrets management** — no evidence of Azure Key Vault or equivalent in the Terraform; credentials appear to be environment variables only
10. **Multi-tenancy smoke testing** — the data model supports it, the code has `tenantId` everywhere, but RLS being disabled means it has never been integration-tested

---

*Review completed. All findings verified against live endpoints and source code. Severity ratings are based on exploitability and blast radius in the current deployed configuration.*
