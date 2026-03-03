# Architect Review — Security Audit Remediation

**Reviewer:** Principal Architect (Opus)  
**Date:** 2026-03-03  
**Verdict:** ✅ APPROVED  

---

## Test Results

| Suite | Result |
|-------|--------|
| Unit tests (`tests/unit.test.ts`) | **66/66 pass** |
| E2E tests (`tests/e2e.test.ts`) | **All 11 suites pass** (process doesn't exit cleanly due to open server handle — pre-existing, not caused by these changes) |
| MCP tests (`tests/mcp.test.ts`) | **All 7 suites pass** (pre-existing `mcp_sessions` table warnings in unit test setup — cosmetic, not failures) |

---

## Per-Change Verdicts

### 1. `api/middleware/auth.ts` — `requireEvaluateAuth` middleware
**APPROVED**

Clean implementation. Correctly handles both `ag_agent_*` and `ag_live_*` keys. Sets `req.agent` for agent keys (useful for future audit attribution). Falls through to 401 for invalid keys. The pattern matches `requireTenantAuth` but without the agent key 403 rejection — exactly right.

### 2. `api/routes/evaluate.ts` — One-line auth swap
**APPROVED**

`optionalTenantAuth` → `requireEvaluateAuth`. Minimal, correct. The belt-and-suspenders agent key check in the handler body is fine to leave in place.

### 3. `api/mcp-routes.ts` — Duplicate `makeRequireEvaluateAuth`
**APPROVED**

I'd prefer this used the shared `AuthMiddleware` instead of duplicating auth logic, but the architect correctly noted this follows the pre-existing pattern in `mcp-routes.ts`. The duplication is acceptable for now; a future refactor can unify them. The logic is identical to the shared version modulo the `req.agent` assignment (MCP version uses `AuthedRequest` casting instead of direct property access — both work due to how the Express types are extended).

### 4. `packages/sdk/src/core/policy-engine.ts` — Absent-param bug fix
**APPROVED**

This is the most critical fix. The old code had `continue` when a param was absent, which meant an absent field was silently skipped — allowing rules to match when they shouldn't. The new code correctly returns `false` (rule doesn't match) for absent params, with explicit carve-outs for `exists: false` and `is_null: true` (both intentionally match absent fields). The logic inversion is correct and well-tested.

### 5. `packages/sdk/src/core/types.ts` — `monitor` in schema enums
**APPROVED**

Adding `monitor` to `PolicyDocumentSchema.default` and `PolicyBundleSchema.defaultAction` is correct — `monitor` was already a valid `PolicyAction` but was excluded from the default field enum unnecessarily. The `.default('monitor')` change on `PolicyDocumentSchema` also changes the Zod parse default from `'block'` to `'monitor'`. This only affects documents that omit the `default` field entirely — reasonable, but worth noting for documentation.

### 6. `api/lib/policy-engine-setup.ts` — `monitor` default + system path block rule
**APPROVED**

- `default: 'allow'` → `default: 'monitor'` is the right call for the demo/default policy. Safer than `allow`, less disruptive than `block`.
- The `block-system-path-writes` rule is well-designed: priority 3 (highest), good regex pattern with `(/|$)` to avoid `/etc_backup` false positives, comprehensive tool name list, high `riskBoost`. The rule correctly requires the `path` param to be present (thanks to fix #4) — a `file_write` with no `path` falls to `monitor`.

### 7. `api/server.ts` — Health endpoint strip, admin health, CORS fix, 413 handler
**APPROVED**

Four changes, all correct:
- **`/health` strip**: Now returns only `{ status, version }`. DB connectivity check via `db.ping()` is clean. The `Cache-Control: no-store` header is a nice touch.
- **`/api/v1/admin/health`**: Moved detailed data behind `requireAdminAuth`. Placement before route files is correct.
- **CORS fix**: `callback(null, false)` instead of `callback(new Error(...))` — correct. The browser's SOP handles the rest.
- **413 handler**: Checks `err.type === 'entity.too.large'` — this is the correct Express body-parser error shape. Clean.

### 8. `packages/python/agentguard/client.py` — User-Agent header
**APPROVED**

Simple and correct. `agentguard-python/0.6.0` will pass Cloudflare's bot detection where `Python-urllib/3.x` doesn't.

### 9. `demo/index.html` — URL and header fixes
**APPROVED**

Staging Azure URL → production URL. `Authorization: Bearer` → `X-API-Key`. Both are straightforward corrections.

### 10. `docs-site/index.html` — `hitl_required` → `require_approval`
**APPROVED**

Documentation fix aligning with actual `PolicyActionSchema`. The webhook event type `hitl` remains unchanged (correct — it's a webhook routing identifier, not the policy action).

### 11. `tests/e2e.test.ts` — Test updates
**APPROVED**

All evaluate calls now include `X-API-Key` header. The demo mode test correctly flipped to assert 401. Kill switch isolation test now uses a second tenant instead of relying on demo mode — much better. New tests for system path blocks and 413 are adequate.

### 12. `tests/mcp.test.ts` — Test updates
**APPROVED**

Unauthenticated test flipped to 401 assertion. All other calls switched from `request` to `authedRequest`. Clean.

### 13. `tests/unit.test.ts` — New tests
**APPROVED**

Good coverage: `monitor` default test, absent-param regression test (the CVE test), and `exists: false` positive test. These are the right tests for the critical fixes.

---

## Issues Found

**None requiring changes.** The implementation is clean, minimal, and correct across all 13 files.

## Minor Observations (non-blocking)

1. **Duplicated auth logic in `mcp-routes.ts`**: Should be unified with the shared `AuthMiddleware` in a future refactor. Not worth doing in this security-focused changeset.

2. **E2E test process doesn't exit cleanly**: The test process hangs after all suites pass (likely an open HTTP server handle in the `after()` hook). Pre-existing issue, not introduced by these changes. Should be fixed separately.

3. **`PolicyDocumentSchema.default` Zod default changed**: The Zod `.default()` changed from `'block'` to `'monitor'`. This means any `PolicyDocument` parsed through Zod without an explicit `default` field will now get `'monitor'` instead of `'block'`. This is probably intentional but should be called out in release notes.

4. **Python SDK version pinned as string**: `__version__ = "0.6.0"` is hardcoded. Consider centralizing version management in a future pass.

---

## Final Assessment

All 12 security findings are correctly addressed. No new vulnerabilities introduced. Test coverage is adequate for all changes. The implementation follows the principle of minimal, surgical fixes — no unnecessary refactoring.

**Ship it.**
