# AgentGuard Security Review — v0.7.3 Feature Release

**Reviewer:** Senior Security Architect (automated review)
**Date:** 2026-03-06
**Scope:** Batch 1 + Batch 2 new features + analytics/feedback/telemetry endpoints
**Repo:** `/home/vector/.openclaw/workspace/agentguard-project`

---

## Executive Summary

Eight feature areas were reviewed. The code is generally well-structured, uses Zod validation throughout, has proper auth middleware applied, and follows existing codebase patterns. Most new routes are solid. However, there are **two HIGH severity issues** that affect production security and one critical functional gap (Slack HITL never fires). These must be resolved before shipping to production.

---

## Feature: Prompt Injection Detection (`api/lib/detection/`)

### Findings

- **[LOW]** Heuristic patterns like `"act as"`, `"you are now"`, `"instead of"` are high false-positive risks — any legitimate LLM conversation about personas or alternatives will trigger these. Score is 0.85 for jailbreak hits. Consider requiring multiple pattern matches before flagging, or raise the default threshold.
  — `heuristic.ts:36-38` — Fix: tune patterns or use conjunction scoring; document FP rate in README.

- **[LOW]** `extractStrings()` recurses into arbitrary nested objects without depth-bounding. A deeply-nested payload could cause stack overflow.
  — `heuristic.ts:118-124` — Fix: add `maxDepth` guard (e.g., 10 levels).

- **[LOW]** The `patterns.json` file path is resolved via `require.resolve()` — this path traversal is safe (it's a static module path), but loading it synchronously at module init time could delay startup if the FS is slow. Minor.
  — `heuristic.ts:22-25` — Fix: lazy-load or use `import()` async.

- **[INFO]** Detection engine correctly implements fail-open (returns `safe` if both plugins throw). This is the right tradeoff for a non-blocking check but should be monitored.
  — `engine.ts:39-45`

- **[INFO]** `LakeraDetectionPlugin` has a 2-second timeout and falls back to heuristic on failure. Good design.

### Approved: **YES**

---

## Feature: PII Detection & Redaction (`api/lib/pii/`, `api/routes/pii.ts`)

### Findings

- **[MEDIUM]** The PII scan route handler has no `try/catch` around `defaultDetector.scan()` or `storeAuditEvent()`. An unhandled exception propagates to Express's global error handler (500 response). While not a crash risk, it leaks no meaningful error to callers and will be logged as an internal error. Also, the audit event failure is not surfaced.
  — `pii.ts:36-56` — Fix: wrap in `try/catch` and return a structured 500 if scan fails.

- **[LOW]** The Zod validation error response has a confusing pattern: `parsed.data ?? parsed.error.issues[0]!.message`. On parse failure, `parsed.data` is `undefined`, so the `??` fallback works correctly, but this reads as if `parsed.data` is the error message. It's dead code at that branch.
  — `pii.ts:31` — Fix: `return res.status(400).json({ error: parsed.error.issues[0]!.message })`.

- **[INFO]** Raw PII text is correctly stripped from API responses (`text` field omitted from `safeEntities`). The type comment in `types.ts` explicitly marks `text` as "in-memory only, NEVER stored" — good documentation.

- **[INFO]** 50KB content limit (from Zod schema) is appropriate. SHA-256 deterministic placeholders are a good design for consistent redaction.

- **[INFO]** The `RegexPIIDetector` singleton (`defaultDetector`) resets `lastIndex` before each `matchAll` call — correct handling of stateful global regexes.

### Approved: **YES** (with minor fix)

---

## Feature: OWASP Compliance Report (`api/lib/compliance-checker.ts`, `api/routes/compliance.ts`)

### Findings

- **[HIGH]** The `checkPromptInjection` (ASI01) and `checkPiiDetection` (ASI05) functions unconditionally return `status: 'not_covered'` with notes saying "not yet implemented" — **but both features are now live and integrated into the evaluate endpoint**. This means every tenant's compliance dashboard will incorrectly show 0 on two of ten controls, understating their security posture. This will confuse customers and undermine trust in the compliance product.
  — `compliance-checker.ts:59-66, 201-207` — Fix: Update `checkPromptInjection` to check if the detection engine has been used (query audit events for `detection_score IS NOT NULL` or check policy config). Update `checkPiiDetection` to check for PII scan events in the audit log.

- **[MEDIUM]** `generateOWASPReport` iterates all controls sequentially with `await` inside a `for...of` loop. With 10 controls each making 1-3 DB calls, this is 10-30 serial DB round trips per report. At scale this will be slow.
  — `compliance-checker.ts:396-428` — Fix: Use `Promise.all()` to run checks in parallel (they're independent reads).

- **[MEDIUM]** Compliance reports store the full JSON blob in `controls_json`. When retrieved, the stored blob is `JSON.parse`d without schema validation — any corruption or schema migration would break silently.
  — `compliance.ts:73, 98` — Fix: validate the parsed object before spreading into the response.

- **[LOW]** `randomUUID` is imported in `compliance.ts` but never used (was it left over from refactoring?).
  — `compliance.ts:7` — Fix: remove unused import.

- **[INFO]** Auth is correctly `requireTenantAuth` for all three compliance routes. Compliance data is properly scoped to `tenantId`. Good.

### Approved: **YES with conditions** — must fix the stale ASI01/ASI05 check functions before the compliance report is meaningful.

---

## Feature: MCP Policy Enforcement (`api/routes/mcp-policy.ts`, `api/lib/mcp-ssrf.ts`)

### Findings

- **[MEDIUM]** The `POST /api/v1/mcp/servers` endpoint accepts a `url` field validated only as a well-formed URL (Zod `.url()`). There is no SSRF check on this registered URL. While the URL in `mcp-policy.ts` is currently stored as metadata only (not fetched by the policy routes), it is surfaced in API responses and could mislead operators or be used in future code that does connect to it. Given that `mcp-ssrf.ts` already exists, this protection should be applied here.
  — `mcp-policy.ts:133-136` — Fix: call `checkUrl(url)` from `mcp-ssrf.ts` before inserting. If not safe, return 400.

- **[LOW]** The `tenantId ?? 'demo'` fallback on line 35 is dead code: `requireEvaluateAuth` always sets `req.tenantId` or returns 401. The fallback creates a false impression that this endpoint works without auth.
  — `mcp-policy.ts:35` — Fix: use `req.tenantId!` (non-null assertion) consistent with other authenticated routes.

- **[LOW]** The MCP evaluate route catches registry lookup errors silently (`} catch { // Non-blocking }`). If the DB is down, evaluation proceeds without allowlist/blocklist enforcement. This is intentional fail-open but should be logged.
  — `mcp-policy.ts:72` — Fix: add `console.warn('[mcp-policy] registry check failed:', err)` in the catch.

- **[INFO]** SSRF protection in `mcp-ssrf.ts` is comprehensive: blocks all RFC-1918 ranges, loopback, IPv6 ULA/loopback, `file://`, localhost aliases. The URL-like prefix check (`startsWith('http://')`) prevents false positives on non-URL strings. Well done.

- **[INFO]** Blocklist takes priority over allowlist in the tool check — correct precedence.

- **[INFO]** All four MCP policy routes are properly authenticated (`requireEvaluateAuth` for evaluate, `requireTenantAuth` for CRUD). The evaluate endpoint correctly accepts agent keys.

### Approved: **YES with conditions** — SSRF check on server URL registration.

---

## Feature: Slack HITL (`api/routes/slack-hitl.ts`, `api/lib/slack-hitl.ts`, `api/lib/integration-crypto.ts`)

### Findings

- **[CRITICAL]** `sendSlackApprovalRequest()` is exported from `slack-hitl.ts` but is **never called anywhere in the codebase**. Similarly, `getSlackIntegrationConfig()` is exported but unused. When the evaluate endpoint creates a `require_approval` record, it fires webhooks but does NOT notify Slack. Tenants who configure Slack integration will receive no notifications — the feature appears to work (config saves successfully) but silently does nothing. This is a P0 functional bug with security implications (HITL approvals go to webhook only, not Slack).
  — `lib/slack-hitl.ts:43` + `routes/evaluate.ts:493-509` — Fix: In `evaluate.ts`, after `createPendingApproval()`, call `getSlackIntegrationConfig()` for the tenant and if configured, call `sendSlackApprovalRequest()` fire-and-forget.

- **[HIGH]** The Slack `webhookUrl` validation (`refine`) allows any `https://` URL — not just `https://hooks.slack.com/`. An attacker could register `https://169.254.169.254/latest/meta-data/` (AWS IMDS), `https://metadata.google.internal/`, or other SSRF targets. When an approval is triggered, `sendSlackApprovalRequest()` would fetch that URL from the server's network context, exfiltrating cloud metadata.
  — `slack-hitl.ts:24` — Fix: Either (a) restrict `webhookUrl` to only `https://hooks.slack.com/` (remove the `||` fallback), OR (b) run `checkUrl(webhookUrl)` from `mcp-ssrf.ts` before storing. Option (a) is simpler and correct for a Slack integration.

- **[MEDIUM]** The Slack callback (`POST /api/v1/integrations/slack/callback`) performs a database approval lookup **before** HMAC signature verification. An unauthenticated attacker who guesses or observes a valid approval UUID can probe the endpoint to confirm whether that approval exists (differentiated by "Approval not found" 200 vs. later processing). Since approval IDs are UUIDs (128-bit), the practical risk is low, but the pattern violates defense-in-depth.
  — `slack-hitl.ts:279-293` (lookup) vs. `slack-hitl.ts:315-317` (verify) — Fix: Move signature verification before the approval lookup. Since the signing secret requires knowing the tenant, you'd need to either (a) include tenant ID in the Slack payload or (b) accept this ordering as a pragmatic compromise with logging.

- **[MEDIUM]** The `INTEGRATION_ENCRYPTION_KEY` environment variable has a hardcoded dev fallback (`'agentguard-dev-integration-key-fallback'`). If this key is not set in production, all integration configs (Slack signing secrets, webhook URLs) are encrypted with a known, public key derivation. Any code with knowledge of this seed can decrypt any tenant's integration config.
  — `integration-crypto.ts:29-32` — Fix: Add a startup check: if `NODE_ENV === 'production'` and `INTEGRATION_ENCRYPTION_KEY` is not set, throw an error and refuse to start.

- **[LOW]** There is a TOCTOU race in the Slack callback: `getApproval` checks `status === 'pending'`, then `resolveApproval` updates it without an atomic `WHERE status = 'pending'` guard. Two simultaneous Slack button clicks could both read `pending` before either writes.
  — `slack-hitl.ts:327-339` — Fix: Modify `resolveApproval` (or add a new DB method) to use `UPDATE approvals SET status = ? WHERE id = ? AND tenant_id = ? AND status = 'pending'` and check affected rows.

- **[INFO]** The double-encryption of the signing secret (inner `encryptConfig({ secret })`, then stored inside the outer `encryptConfig(storedConfig)`) is by design and implemented correctly. The decrypt path correctly unwraps both layers.

- **[INFO]** Slack HMAC verification uses `crypto.timingSafeEqual` with a length pre-check — correctly prevents timing attacks. The 5-minute replay protection window matches Slack's documented recommendation.

- **[INFO]** The signing secret is never returned in GET responses — correctly redacted. Only `webhookUrl`, `channel`, and `autoRejectMinutes` are exposed.

### Approved: **NO** — Must fix: (1) wire `sendSlackApprovalRequest` into approval creation, (2) restrict `webhookUrl` to `hooks.slack.com`, (3) production startup guard for missing `INTEGRATION_ENCRYPTION_KEY`.

---

## Feature: Multi-Agent A2A (`api/routes/agent-hierarchy.ts`, `api/lib/policy-inheritance.ts`)

### Findings

- **[MEDIUM]** The `GET /api/v1/agents/:agentId/children` and `DELETE /api/v1/agents/:agentId/children/:childId` handlers make multiple DB calls without `try/catch`. If the DB throws, Express propagates an unhandled promise rejection (in Express 4) or crashes (Express 5). The POST handler correctly wraps its DB calls.
  — `agent-hierarchy.ts:150-168, 187-211` — Fix: Wrap both handlers' DB calls in try/catch with appropriate 500 responses.

- **[LOW]** The `GET /children` response sets `name: c.child_agent_id` (the UUID) instead of the actual agent name. This is because `listChildAgents` returns `ChildAgentRow` which doesn't join the `agents` table. The comment `// actual name from agents table` is incorrect — it's returning the ID.
  — `agent-hierarchy.ts:173` — Fix: Either join `agents` in `listChildAgents` DB query, or do a secondary `getAgentById` lookup for each child (better: JOIN).

- **[LOW]** Child agent API keys (`ag_agent_*`) are stored in plaintext in the `agents` table. This is a pre-existing pattern for all agent keys, not specific to this feature, but the new A2A feature spawns keys programmatically and returns them once. The plaintext DB storage means a DB dump leaks all child agent keys.
  — `db-sqlite.ts:753` — Fix (can defer): migrate `agents.api_key` to use SHA-256 lookup (same pattern as `api_keys` table migration). This is a larger refactor.

- **[INFO]** Policy inheritance logic (`computeChildPolicy`) correctly implements monotonic restriction: blocked = union, allowed = intersection, hitl = union. Edge cases (only parent has allowlist, only child has allowlist, neither has allowlist) are all handled.

- **[INFO]** Child agents correctly inherit `tenant_id` from parent — no cross-tenant escalation possible.

- **[INFO]** TTL defaults to 24h if not specified. `maxToolCalls` is optional. Both are reasonable safe defaults.

- **[INFO]** The `generateAgentKey()` function uses 16 random bytes (128-bit entropy) — sufficient.

- **[INFO]** Parent ownership is verified before spawning children and before revocation — correct tenant isolation.

### Approved: **YES with conditions** — Fix missing try/catch in GET and DELETE handlers before shipping.

---

## Feature: Platform Analytics (`api/routes/analytics.ts`)

### Findings

- **[INFO]** `GET /api/v1/analytics/usage` correctly uses `requireTenantAuth` — data is scoped to `tenantId`.

- **[INFO]** `GET /api/v1/analytics/platform` correctly uses `requireAdminAuth` — all-tenant data is admin-only. Good separation.

- **[INFO]** No PII leaked in analytics responses (aggregated counts and tool names only).

- **[LOW]** No per-endpoint rate limiting beyond the global 100 req/min. The platform analytics endpoint may be expensive on large datasets. Consider caching the result or adding a lower rate limit for admin endpoints.
  — `analytics.ts:37` — Fix (can defer): add response caching (5-min TTL) for platform analytics.

### Approved: **YES**

---

## Feature: Feedback & Telemetry (`api/routes/feedback.ts`, `api/routes/telemetry.ts`)

### Findings

- **[MEDIUM]** `telemetryRateMap` (in-memory rate limiter) has no cleanup/eviction. Every unique IP that hits `/api/v1/telemetry` adds an entry that is never removed. In a long-running server with many unique IPs (e.g., after a botnet sweep), this is a memory leak.
  — `telemetry.ts:11` — Fix: Add a `setInterval` cleanup similar to `rate-limit.ts`: periodically evict entries where `windowStart` is older than `TELEMETRY_WINDOW_MS * 2`.

- **[LOW]** The telemetry endpoint silently accepts invalid payloads (`return res.status(202).json({ accepted: true })` even on parse failure). This is intentional to not break SDKs, but means malformed requests from broken SDK versions will never surface. Consider logging at DEBUG level.
  — `telemetry.ts:28-31` — Fix (can defer): add `if (process.env.NODE_ENV !== 'production') console.debug(...)`.

- **[INFO]** `POST /api/v1/feedback` correctly uses `requireTenantAuth`. `GET /api/v1/feedback` correctly uses `requireAdminAuth`. Auth separation is correct.

- **[INFO]** Feedback `comment` field is capped at 2000 chars in Zod schema — correct.

- **[INFO]** Telemetry data collected is minimal: `sdk_version`, `language`, `node_version`, `os_platform`. All capped at reasonable lengths. No PII collected.

- **[INFO]** `db.insertTelemetryEvent()` is fire-and-forget with `.catch()` error logging — correct pattern for telemetry (never block the response).

### Approved: **YES with conditions** — Fix telemetry rate map memory leak.

---

## Pre-existing Finding (not new in this release, noting for completeness)

- **[MEDIUM]** `requireAdminAuth` in `auth.ts` calls `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(ADMIN_KEY))` without first checking that both buffers have the same byte length. `timingSafeEqual` throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` if lengths differ, which propagates as a synchronous exception. Express catches it and returns 500 instead of 401. This creates a **length oracle**: an attacker submitting a key of the correct length gets 401; wrong length gets 500. Not exploitable by itself, but worth fixing.
  — `middleware/auth.ts:157` — Fix: `const provBuf = Buffer.from(provided); const adminBuf = Buffer.from(ADMIN_KEY); if (provBuf.length !== adminBuf.length || !crypto.timingSafeEqual(provBuf, adminBuf))`.

---

## Summary of All Findings

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL | 1 | Slack HITL `sendSlackApprovalRequest` never called |
| HIGH | 3 | SSRF in Slack webhookUrl; stale ASI01/ASI05 compliance checks; missing `INTEGRATION_ENCRYPTION_KEY` startup guard |
| MEDIUM | 7 | MCP server URL no SSRF check; Slack callback lookup-before-verify; TOCTOU in approval resolution; missing try/catch in agent hierarchy GET/DELETE; compliance report serial DB calls; telemetry rate map memory leak; compliance blob not validated on load |
| LOW | 9 | Various (see above) |

---

## Overall Verdict: **SHIP WITH CONDITIONS**

The codebase is solid. Auth is correctly applied. Input validation is thorough (Zod schemas everywhere). Data isolation by tenant_id is consistent. Secrets are properly encrypted at rest. The architecture is clean with good separation of concerns.

**However, the following items MUST be fixed before production deployment:**

---

### 🚫 Must Fix Before Production

1. **Wire Slack HITL notifications** — `sendSlackApprovalRequest()` must be called from `evaluate.ts` when `require_approval` is triggered for a tenant with Slack configured. Currently the entire Slack HITL feature is non-functional despite appearing to configure correctly.

2. **SSRF protection on Slack webhookUrl** — Change the `refine` validation to only allow `https://hooks.slack.com/` (remove the `|| u.startsWith('https://')` fallback). Alternatively, call `checkUrl()` from `mcp-ssrf.ts` before storing. Without this, authenticated tenants can trigger server-side requests to arbitrary HTTPS endpoints including cloud metadata services.

3. **Production startup guard for `INTEGRATION_ENCRYPTION_KEY`** — Add to `integration-crypto.ts`: if running in production (`NODE_ENV === 'production'`) and the env var is absent, throw at startup rather than silently falling back to the public dev seed. This prevents all integration secrets being encrypted with a known key.

4. **Fix stale OWASP compliance checks (ASI01, ASI05)** — `checkPromptInjection` and `checkPiiDetection` report `not_covered` even though both features are live. This makes the compliance product misleading for paying customers.

5. **Add try/catch to agent hierarchy GET and DELETE handlers** — Unhandled DB rejections in Express 4 are unhandled promise rejections; in Express 5 they crash the process.

---

### ✅ Can Fix Later (Post-Ship)

6. **Admin key length oracle** (`auth.ts:157`) — Add same-length guard before `timingSafeEqual`. Low exploitability but clean fix.

7. **Telemetry rate map memory leak** (`telemetry.ts`) — Add cleanup interval. Low impact (entries are small) but correct to fix.

8. **MCP server registration SSRF check** — The URL is stored but not currently fetched by the API. Low immediate risk, but add `checkUrl()` proactively.

9. **Compliance report parallel DB queries** — Replace sequential `for...of` with `Promise.all()`.

10. **TOCTOU in Slack approval resolution** — Add `AND status = 'pending'` guard in `resolveApproval` SQL. SQLite serializes writes so practical risk is minimal; higher risk on PostgreSQL.

11. **Child agent name in GET /children** — Fix to join `agents` table for actual name.

12. **Heuristic detection depth-bounding** — Add `maxDepth` guard to `extractStrings()`.

13. **Agent API key plaintext storage** (pre-existing) — Larger refactor to hash agent keys like tenant keys.

---

*Review completed: 2026-03-06. Re-review recommended after must-fix items are addressed.*
