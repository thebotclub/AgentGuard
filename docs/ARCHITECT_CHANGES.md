# AgentGuard — Security Audit Remediation

**Prepared by:** Senior Architect review pass  
**Date:** 2026-03-03  
**Status:** Changes in working tree — pending architect review before commit/push  
**Branch:** `main` (uncommitted, on top of `c297379`)

---

## Overview

This document details every change made to remediate the 12 security and quality issues identified in the security audit. All changes are surgical and minimal — no refactoring of unrelated code.

**Total files changed:** 13  
**Lines added:** ~349  **Lines removed:** ~76

---

## Changes by File

---

### 1. `api/middleware/auth.ts`

**Why changed:** Issues #1 and #9 (auth on evaluate endpoints)

**What changed:**

- Added `requireEvaluateAuth` to the `AuthMiddleware` interface and its factory implementation.

`requireEvaluateAuth` differs from the existing `requireTenantAuth` in one key way: it **accepts both tenant API keys (`ag_live_*`) and scoped agent keys (`ag_agent_*`)**. This is necessary because AI agents call `/api/v1/evaluate` and `/api/v1/mcp/evaluate` using their scoped keys, not the tenant master key. The existing `requireTenantAuth` explicitly rejects agent keys with 403 — appropriate for admin operations, wrong for evaluation.

**Behaviour:**
- No `X-API-Key` header → `401 X-API-Key header required`
- `ag_agent_*` key, not found or inactive → `401 Invalid or inactive agent key`
- `ag_agent_*` key, valid → populates `req.agent`, `req.tenant`, `req.tenantId`
- Regular key, not found → `401 Invalid or inactive API key`
- Regular key, valid → populates `req.tenant`, `req.tenantId`

---

### 2. `api/routes/evaluate.ts`

**Why changed:** Issue #1 (POST /api/v1/evaluate unauthenticated)

**What changed:**

- Line 29: Changed `auth.optionalTenantAuth` → `auth.requireEvaluateAuth` on the `POST /api/v1/evaluate` route.

This is a **one-line change** that gates the core product endpoint behind authentication. Previously any unauthenticated request was processed as `tenantId = 'demo'` and evaluated fully.

The `ag_agent_` pre-check inside the handler body (lines 47–49) is now unreachable for the invalid-agent-key case since `requireEvaluateAuth` already handles it, but it's left in place as a belt-and-suspenders guard for forward compatibility.

---

### 3. `api/mcp-routes.ts`

**Why changed:** Issue #9 (POST /api/v1/mcp/evaluate unauthenticated)

**What changed:**

- Added `makeRequireEvaluateAuth(db)` factory function (mirrors the pattern from `auth.ts` but as a local closure since `mcp-routes.ts` uses its own auth helpers rather than the shared middleware).
- Changed the `/api/v1/mcp/evaluate` route from `optionalAuth` to `requireEvaluateAuth`.
- Wired up `const requireEvaluateAuth = makeRequireEvaluateAuth(db)` in the router factory.

**Note for reviewer:** `mcp-routes.ts` has its own local auth helpers (`makeRequireTenantAuth`, `makeOptionalAuth`) that don't use the shared `AuthMiddleware` interface. This was pre-existing; I've followed the same pattern rather than refactoring to use the shared middleware, keeping the change minimal.

---

### 4. `packages/sdk/src/core/policy-engine.ts`

**Why changed:** Issues #2 (fail-open default) and #4 (absent-param bug)

#### Change A — Absent-param bug fix (Issue #4)

The `evalParamConditions` function had this logic:

```typescript
// BEFORE (BUGGY):
if (value === undefined) {
  if ('exists' in constraint && constraint.exists === true) return false;
  if ('is_null' in constraint && constraint.is_null === false) return false;
  // Field absent but no exists constraint — treat as non-matching only if we have other constraints
  // Per POLICY_ENGINE.md: absent field does not cause rule to fail (continue)
  continue;  // <-- BUG: skips to next field, leaving rule able to match
}
```

When a param field (e.g., `table`) is absent from the request, the `continue` statement skips to evaluating the next field in the condition map. If there are no more fields, the function returns `true` — meaning the rule **matches** even though the required param is missing. This is a security bug: a rule like `when: [{ tool: file_write }, { params: { path: { regex: '^/etc/' } } }]` would match `file_write` with **no params at all** because `path` is absent → `continue` → no more fields → rule matches → block fires.

**Fix:**

```typescript
// AFTER (CORRECT):
if (value === undefined) {
  if ('exists' in constraint && constraint.exists === false) continue; // exists:false explicitly checks for absence
  if ('is_null' in constraint && constraint.is_null === true) continue; // is_null:true also matches absent
  // Field absent — rule cannot match; absent field must NOT satisfy param conditions
  return false;
}
```

The two `continue` cases preserve semantics for `exists: false` (rule requires field to be absent) and `is_null: true` (rule requires field to be null/absent) — both are explicit "this field should not be present" conditions.

#### Change B — `monitor` default reason string (Issue #2 support)

Added a branch in the `_evaluate` decision assembly:

```typescript
reason = result === 'block'
  ? 'No matching rule — default action is block (fail-closed)'
  : result === 'monitor'
    ? 'No matching rule — default action is monitor (unknown tool flagged for review)'
    : 'No matching rule — default action is allow (fail-open)';
```

---

### 5. `packages/sdk/src/core/types.ts`

**Why changed:** Issue #2 (fail-open default → monitor)

**What changed:**

- `PolicyDocumentSchema.default`: `z.enum(['allow', 'block'])` → `z.enum(['allow', 'block', 'monitor'])`
- `PolicyBundleSchema.defaultAction`: `z.enum(['allow', 'block'])` → `z.enum(['allow', 'block', 'monitor'])`

`monitor` is a valid `PolicyAction` (it's in the `PolicyActionSchema`). The schema restriction to only `allow`/`block` for the document-level default was unnecessarily narrow. Adding `monitor` allows policies to say "unknown tools should be logged and flagged but not blocked" — safer than `allow` without being as disruptive as `block`.

**Note:** The TypeScript-generated `PolicyDocument` type will now reflect `'allow' | 'block' | 'monitor'` for the `default` field. Any callers that switch-exhaustively on `defaultAction` may need updating (none found in the current codebase).

---

### 6. `api/lib/policy-engine-setup.ts`

**Why changed:** Issues #2 and #10

#### Change A — Fail-open default → monitor (Issue #2)

```typescript
// BEFORE:
default: 'allow',

// AFTER:
default: 'monitor',
```

The `DEFAULT_POLICY` is what all `demo` and tenant requests evaluate against when no custom policy is configured. Changing from `allow` to `monitor` means unknown tools are now **logged and flagged** (risk score computed, audit event written) rather than silently allowed. Existing users with explicit `allow` rules for their tools are unaffected — those rules still fire first.

#### Change B — Block writes to system paths (Issue #10)

Added a new rule `block-system-path-writes` with priority 3 (highest priority in the default policy):

```typescript
{
  id: 'block-system-path-writes',
  description: 'Block file writes to sensitive system paths (/etc/, /usr/, /bin/, /sbin/, /boot/, /sys/, /proc/)',
  priority: 3,
  action: 'block',
  severity: 'critical',
  when: [
    {
      tool: {
        in: ['file_write', 'write_file', 'create_file', 'overwrite_file', 'append_file'],
      },
    },
    {
      params: {
        path: {
          regex: '^/(etc|usr|bin|sbin|boot|sys|proc|lib|lib64)(/|$)',
        },
      },
    },
  ],
  tags: ['security', 'system-integrity'],
  riskBoost: 400,
},
```

**Design decisions:**
- Priority 3 puts this above privilege escalation (priority 5), ensuring it fires first.
- The regex `^/(etc|usr|bin|sbin|boot|sys|proc|lib|lib64)(/|$)` matches the root of each protected directory and any path under it, but not paths like `/etc_backup/`.
- Tool list includes the common variants (`file_write`, `write_file`, `create_file`, `overwrite_file`, `append_file`).
- `riskBoost: 400` gives high risk scores to these events.
- **Note:** This rule only fires when `path` param is present (thanks to the absent-param fix in Change #4 above). A `file_write` with no `path` param falls through to `default: 'monitor'`.

---

### 7. `api/server.ts`

**Why changed:** Issues #5, #7, #8, #11

#### Change A — Strip sensitive data from `/health` (Issue #5)

```typescript
// BEFORE: returned engine, version, uptime, killSwitch, db, templates, tenants, activeAgents
// AFTER: returns only { status, version }
app.get('/health', async (_req, res) => {
  let dbOk = false;
  try { dbOk = await db.ping(); } catch { }
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    version: '0.6.0',
  });
});
```

The old response leaked: DB type (fingerprinting), tenant count (business intelligence), active agent count, internal uptime, kill switch state. All of these are useful to an attacker performing reconnaissance.

#### Change B — New `GET /api/v1/admin/health` (Issue #5)

The detailed health data has been moved to a new endpoint that requires the `ADMIN_KEY`:

```
GET /api/v1/admin/health
Header: X-API-Key: <ADMIN_KEY>
```

Returns the full original response: `status, engine, version, uptime, killSwitch, db, templates, tenants, activeAgents`.

This is registered directly on `app` before the route files are loaded, using `adminAuth.requireAdminAuth` middleware.

#### Change C — CORS crash fix (Issue #7)

```typescript
// BEFORE (crashes with 500 on disallowed origin):
callback(new Error('CORS: origin not allowed'));

// AFTER (silently omits CORS headers):
callback(null, false);
```

When `cors()` receives `callback(new Error(...))`, Express propagates it as an unhandled error → 500. Passing `callback(null, false)` instructs the `cors` library to omit CORS response headers entirely for that origin — the browser's same-origin policy then blocks the cross-origin request naturally. No crash, no 500.

#### Change D — Payload-too-large error handler (Issue #11)

Added a catch in the global error handler for Express's `entity.too.large` error type:

```typescript
if (err instanceof Error && 'type' in err && err.type === 'entity.too.large') {
  return res.status(413).json({ error: 'Request body too large. Maximum size is 50kb.' });
}
```

The body limit was already set to `50kb` (`express.json({ limit: '50kb' })`). The missing piece was the error handler — without it, the `PayloadTooLargeError` fell through to the catch-all 500 handler.

---

### 8. `packages/python/agentguard/client.py`

**Why changed:** Issue #3 (Python SDK blocked by Cloudflare)

**What changed:**

```python
# Added module-level version constant
__version__ = "0.6.0"

# Added User-Agent to _request() headers dict
"User-Agent": f"agentguard-python/{__version__}",
```

`urllib` defaults to `User-Agent: Python-urllib/3.x` which Cloudflare's bot detection flags and blocks. The new header `agentguard-python/0.6.0` identifies the client correctly.

---

### 9. `demo/index.html`

**Why changed:** Issue #6 (staging Azure URL in production demo page)

**What changed (2 locations):**

1. **JavaScript constant** (line ~1113):
   ```javascript
   // BEFORE:
   const API_BASE = 'https://agentguard-api.greenrock-adeab1b0.australiaeast.azurecontainerapps.io';
   // AFTER:
   const API_BASE = 'https://api.agentguard.dev';
   ```

2. **curl example in HTML** (line ~994):
   ```html
   <!-- BEFORE: multi-line Azure URL + wrong auth header -->
   https://agentguard-api.greenrock-adeab1b0.australiaeast.azurecontainerapps.io/api/v1/evaluate
   -H "Authorization: Bearer ag_live_sk_..."
   
   <!-- AFTER: correct URL + correct auth header -->
   https://api.agentguard.dev/api/v1/evaluate
   -H "X-API-Key: ag_live_sk_..."
   ```

AgentGuard uses `X-API-Key` header, not `Authorization: Bearer`. The staging Azure URL would cause demo page API calls to hit the staging environment rather than production.

---

### 10. `docs-site/index.html`

**Why changed:** Issue #12 (webhook event name mismatch)

**What changed (2 locations):**

The docs stated the policy decision result was `hitl_required` but the actual code returns `require_approval` (defined in `PolicyActionSchema`). Fixed both references:

```html
<!-- BEFORE: -->
<td style="color:var(--amber)">hitl_required</td>
<!-- AFTER: -->
<td style="color:var(--amber)">require_approval</td>

<!-- BEFORE: -->
An evaluation returns <code>hitl_required</code> (human-in-the-loop)
<!-- AFTER: -->
An evaluation returns <code>require_approval</code> (human-in-the-loop)
```

The webhook event type `hitl` (used in `fireWebhooksAsync`) is distinct from the decision result `require_approval` — the event type is a short identifier for webhook routing, the decision result is the full policy action name. The docs were conflating the two.

---

### 11. `tests/e2e.test.ts`

**Why changed:** Test updates required by auth changes (Issues #1, #5, #10, #11)

**What changed:**

- **Policy Evaluation suite** (all `POST /api/v1/evaluate` calls): Added `{ 'X-API-Key': apiKey }` header to every call that was previously unauthenticated. The `apiKey` variable is populated in the preceding Signup Flow suite.

- **`works without auth (demo mode)` test**: Renamed and inverted to `returns 401 without auth (auth required)` — now asserts `status === 401` instead of `status === 200`.

- **Kill switch isolation test**: Previously relied on demo mode (no API key). Replaced with a second tenant signup + their API key to properly test cross-tenant isolation.

- **`GET /health` test**: Updated assertions to match the stripped response — removed checks for `engine`, `uptime`, `db`; now asserts those fields are **absent** and that `version` is present.

- **Input Validation suite**: Added `X-API-Key` header to all evaluate calls (they previously hit auth before body validation, so they got 401 instead of 400).

- **Security Headers `rate limit headers` test**: Added `X-API-Key` header.

- **Playground default assertion**: `['allow', 'block']` → `['allow', 'block', 'monitor']`.

- **New tests added:**
  - `POST /api/v1/evaluate blocks file_write to /etc/passwd` (Issue #10)
  - `POST /api/v1/evaluate blocks write_file to /usr/bin/` (Issue #10)
  - `POST /api/v1/evaluate with oversized payload returns 413` (Issue #11)

---

### 12. `tests/mcp.test.ts`

**Why changed:** Test updates required by auth change on `/api/v1/mcp/evaluate` (Issue #9)

**What changed:**

- Replaced the `evaluates an allowed MCP tool call (unauthenticated/demo)` test with `returns 401 without auth (auth required)` — now asserts `status === 401`.
- Changed all remaining `request(...)` calls in the MCP evaluate test suite to `authedRequest(...)` so they use the tenant API key established in the Signup suite.
- The `works with tenant API key` test was already using `authedRequest` — no change needed there.

---

### 13. `tests/unit.test.ts`

**Why changed:** New tests for Issues #2 and #4

**What changed (additions only):**

- Added `monitors unknown tool when default is monitor` test in the "Default action" suite — verifies that a `PolicyDocument` with `default: 'monitor'` produces `result === 'monitor'` for unknown tools with a matching reason string.

- Added new suite **`PolicyEngine absent-param security fix`** with two tests:
  - `absent param does NOT match a rule that requires it` — creates a rule requiring `params.table in ['users', 'customers']` and verifies that `db_query` with **no params** does NOT trigger the block. This is the regression test for the CVE.
  - `absent param with exists:false constraint matches` — verifies that `exists: false` still works correctly (rule fires when the param is intentionally absent).

---

## Issue-to-File Matrix

| # | Severity | Issue | Files Changed |
|---|----------|-------|---------------|
| 1 | CRITICAL | `/evaluate` unauthenticated | `api/middleware/auth.ts`, `api/routes/evaluate.ts`, `tests/e2e.test.ts` |
| 2 | CRITICAL | Fail-open default | `api/lib/policy-engine-setup.ts`, `packages/sdk/src/core/types.ts`, `packages/sdk/src/core/policy-engine.ts`, `tests/e2e.test.ts`, `tests/unit.test.ts` |
| 3 | CRITICAL | Python SDK User-Agent | `packages/python/agentguard/client.py` |
| 4 | CRITICAL | Absent-param bug | `packages/sdk/src/core/policy-engine.ts`, `tests/unit.test.ts` |
| 5 | CRITICAL | `/health` data leakage | `api/server.ts`, `tests/e2e.test.ts` |
| 6 | CRITICAL | Demo staging Azure URL | `demo/index.html` |
| 7 | HIGH | CORS crash on bad origin | `api/server.ts` |
| 8 | HIGH | Rate limiting on unauthenticated endpoints | Already covered by existing `rateLimitMiddleware` (100 req/min global) + Fix #1 removes unauthenticated evaluate |
| 9 | HIGH | `/mcp/evaluate` unauthenticated | `api/mcp-routes.ts`, `tests/mcp.test.ts` |
| 10 | HIGH | `file_write /etc/passwd` allows | `api/lib/policy-engine-setup.ts`, `tests/e2e.test.ts` |
| 11 | MEDIUM | 1MB payload → 500 | `api/server.ts`, `tests/e2e.test.ts` |
| 12 | MEDIUM | Webhook event name mismatch | `docs-site/index.html` |

---

## Issue #8 Note — Rate Limiting

Issue #8 states "no rate limiting on unauthenticated endpoints." The global `rateLimitMiddleware` (100 req/min per IP) is applied at line 92 of `server.ts` — **before** all auth middleware — and covers every route including `/health` and `/api/v1/signup`. The signup endpoint additionally has a tighter 5-per-hour limit via `signupRateLimit`.

The real exposure was that `/api/v1/evaluate` was callable without auth and would process requests against the policy engine, audit DB, and webhooks. Fix #1 (requiring auth) eliminates unauthenticated access entirely — the rate limiter now applies on top of that.

No code changes were required for Issue #8 beyond Fix #1.

---

## Test Results

```
Unit tests:  66/66 pass  (npx tsx --test tests/unit.test.ts)
E2E tests:   All 11 suites pass (npx tsx --test tests/e2e.test.ts)
```

---

## Reviewer Checklist

Before committing, please verify:

- [ ] `requireEvaluateAuth` properly handles all agent key edge cases (expired, revoked)
- [ ] The `block-system-path-writes` regex covers all required system paths and doesn't over-match
- [ ] Confirm `monitor` is the right default for `DEFAULT_POLICY` vs `block` (tenant preference)
- [ ] `/api/v1/admin/health` placement in `server.ts` is before or after route files (currently before — correct)
- [ ] Demo page fetch calls at lines ~1457 and ~1655 don't need `X-API-Key` (they use `X-Demo: true` — confirmed correct for demo flow)
- [ ] MCP route auth pattern consistency — consider unifying local auth helpers in `mcp-routes.ts` with shared `AuthMiddleware` in a future refactor (out of scope for this audit)
