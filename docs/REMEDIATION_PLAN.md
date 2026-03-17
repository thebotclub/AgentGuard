# AgentGuard v0.8.0 — Remediation Plan

**Created:** 2026-03-07 UTC  
**Based on:** E2E API Tests (58/68, 85%), Pentest (Grade C), Frontend QA (46/60, 77%), DX Test (NPS +34, avg 7.5/10)  
**Sprint Mode:** 4 parallel tracks — A (Security), B (Functional), C (Frontend), D (DX/Docs)

---

## 1. Master Findings Table (Deduplicated & Categorized)

| ID | Finding | Source(s) | Category | Severity |
|----|---------|-----------|----------|----------|
| **F-SEC-01** | Playground endpoints (`/playground/session`, `/playground/evaluate`, `/playground/scenarios`, `/playground/policy`) return 200 with no auth | PENTEST | Security | **CRITICAL** |
| **F-SEC-02** | IPv6 link-local (fe80::/10) bypasses webhook SSRF protection — webhook created with `https://[fe80::1]/` | PENTEST | Security | **CRITICAL** |
| **F-SEC-03** | CGNAT range (100.64.0.0/10) not blocked in webhook URL validation | PENTEST | Security | HIGH |
| **F-SEC-04** | Hostname aliases (`localhost.localdomain`) bypass webhook SSRF protection | PENTEST | Security | HIGH |
| **F-SEC-05** | MCP config endpoint (`PUT /mcp/config`) has no SSRF protection — accepts `http://169.254.169.254/latest/meta-data/` | PENTEST | Security | HIGH |
| **F-SEC-06** | API key timing attack — correct key responds in ~415ms vs ~140ms for wrong key (3x delta) | PENTEST | Security | HIGH |
| **F-SEC-07** | Stored XSS: agent names accept `<script>alert(1)</script>` payload, stored and returned in GET /agents | PENTEST | Security | HIGH |
| **F-SEC-08** | Agent names accept SQL injection payloads (e.g., `' UNION SELECT * FROM tenants--`) without sanitization | PENTEST | Security | MEDIUM |
| **F-SEC-09** | Rate limiting not enforced on `POST /evaluate` — 20+ parallel requests all succeed | PENTEST + E2E | Security | MEDIUM |
| **F-SEC-10** | Rate limiting not enforced on `GET /audit` — 30 rapid requests all succeed | E2E | Security | MEDIUM |
| **F-SEC-11** | Missing CSP header on docs.agentguard.dev, demo.agentguard.dev, about.agentguard.dev | FRONTEND | Security | MEDIUM |
| **F-SEC-12** | Missing HSTS header on docs.agentguard.dev, demo.agentguard.dev, about.agentguard.dev | FRONTEND | Security | MEDIUM |
| **F-SEC-13** | Missing X-Frame-Options on demo.agentguard.dev (clickjacking risk) | FRONTEND | Security | MEDIUM |
| **F-SEC-14** | Missing Permissions-Policy on docs, demo, about subdomains | FRONTEND | Security | LOW |
| **F-BUG-01** | `PUT /policy` changes not propagating to `POST /evaluate` — evaluate engine caches old policy | DX + E2E | Functional Bug | **CRITICAL** |
| **F-BUG-02** | `GET /analytics/usage` returns HTTP 500 `{"error":"Failed to fetch analytics"}` for all periods | E2E + DX | Functional Bug | HIGH |
| **F-BUG-03** | `GET /agents/:id` returns 404 — individual agent lookup by ID not routed | E2E | Functional Bug | HIGH |
| **F-BUG-04** | `POST /pii/scan` with `text` field key returns 400 — API requires `content` key (doc/SDK says `text`) | E2E + DX | Functional Bug | HIGH |
| **F-BUG-05** | `POST /feedback` with `verdict` field fails — API requires `rating` (integer 1–5) | E2E | Functional Bug | MEDIUM |
| **F-BUG-06** | `POST /evaluate` response missing `sessionId` and `hashChain` fields documented in API spec | DX | Functional Bug | LOW |
| **F-BUG-07** | `agentId` in `POST /evaluate` request body silently ignored / not reflected in audit event | DX | Functional Bug | LOW |
| **F-BUG-08** | Dashboard (app.agentguard.dev) shows placeholder usage data (12,450 events) for fresh accounts | DX + FRONTEND | Functional Bug | LOW |
| **F-DX-01** | Signup docs don't include required `name` field — first API call fails for devs following docs | DX | DX Issue | HIGH |
| **F-DX-02** | No self-hosted / Docker / on-prem documentation despite `air_gap` listed as Enterprise feature | DX | DX Issue | HIGH |
| **F-DX-03** | Dashboard sidebar shows `v0.7.2` — stale version string not updated for v0.8.0 release | FRONTEND + DX | DX Issue | HIGH |
| **F-DX-04** | Docs use `text` field for `POST /pii/scan` — mismatches API (already F-BUG-04, docs component) | DX | DX/Docs Gap | MEDIUM |
| **F-DX-05** | Docs show `verdict` field for `POST /feedback` — mismatches API's `rating` field | DX | DX/Docs Gap | MEDIUM |
| **F-DX-06** | Signup docs don't mention `password` field (accepted but entirely undocumented) | DX | DX/Docs Gap | MEDIUM |
| **F-DX-07** | Demo code in docs uses `ag_agent_*` key for evaluate curl example, but quickstart says use `ag_live_*` | DX | DX/Docs Gap | MEDIUM |
| **F-DX-08** | SDK package name vs import name mismatch: npm `@the-bot-club/agentguard` imported as `AgentGuard`; PyPI `agentguard-tech` imported as `agentguard` | DX | DX Issue | LOW |
| **F-CONTENT-01** | GitHub repo link (`https://github.com/thebotclub/AgentGuard`) returns 404 on main site + about | FRONTEND | Content Gap | HIGH |
| **F-CONTENT-02** | GitHub org link (`https://github.com/thebotclub`) returns 404 on about page | FRONTEND | Content Gap | HIGH |
| **F-CONTENT-03** | `twitter:image` meta tag missing on all 5 HTML sites | FRONTEND | Content Gap | MEDIUM |
| **F-CONTENT-04** | `about.agentguard.dev` og:url set to `https://agentguard.dev/about` instead of `https://about.agentguard.dev` | FRONTEND | Content Gap | LOW |
| **F-CONTENT-05** | demo.agentguard.dev and about.agentguard.dev have older Last-Modified dates (2026-03-03) vs v0.8.0 release | FRONTEND | Content Gap | LOW |
| **F-PERF-01** | Rate limit of 10 req/min on `GET /health` and `GET /api/docs` — too aggressive for developer tooling | FRONTEND | DX Issue | MEDIUM |
| **F-PERF-02** | app.agentguard.dev and demo.agentguard.dev timeout on first cold-start request | FRONTEND | DX Issue | LOW |

---

## 2. Expert Debate — CRITICALs and HIGHs

---

### F-SEC-01: Playground Endpoints — Unauthenticated Access

> **🔐 Sam:** This is our most embarrassing finding. Any script kiddie can run `curl /playground/evaluate` without credentials and get policy data + evaluate tool calls. If a competitor discovers this, it becomes a PR problem. In terms of exploitability: RIGHT NOW, fully exploitable. Also a SOC 2 blocker — we can't pass an audit with unauthenticated API endpoints that bypass our entire auth model.

> **🏗️ Alex:** Root cause: playground routes were probably added without the auth middleware being applied. It's a one-liner fix — add the `requireApiKey` middleware to the playground router. Takes 30 minutes to fix, 2 hours to test. No redesign needed. Can run in parallel with everything else.

> **📊 Casey:** Every enterprise POC will hit this. Security teams will run an automated scan on day one and file it as a critical finding. This single issue will kill deals. Fix it before we do another enterprise demo. **Non-negotiable.**

**Verdict:** Fix immediately (Track A, top priority). 1–2 hour effort.

---

### F-SEC-02: IPv6 Link-Local SSRF Bypass

> **🔐 Sam:** SSRF via webhooks means an attacker can proxy requests to our internal infrastructure. IPv6 link-local is commonly used in cloud environments. This is actively exploitable if our backend runs on any infrastructure with IPv6-accessible internal services. Combined with the MCP SSRF gap (F-SEC-05), this represents a serious lateral movement vector.

> **🏗️ Alex:** Root cause: SSRF allowlist is checking against IPv4 private ranges only. IPv6 handling is missing entirely — no normalization, no link-local check. Fix: normalize the URL, resolve the hostname, then validate against a comprehensive blocklist including: fe80::/10, ::1, fc00::/7 (ULA), 100.64.0.0/10, all RFC1918. Use a library like `is-url-private` or implement robust validation. Effort: 2–4 hours including IPv6 test cases.

> **📊 Casey:** Less visible than SEC-01 but equally critical for enterprise. Any SOC 2 or pen test done by a customer will flag this. Blocks us from enterprise contracts that require "no SSRF vulnerabilities."

**Verdict:** Fix in Track A alongside SEC-01. Bundle IPv6 + CGNAT + hostname aliases + MCP into one SSRF hardening PR. 4–6 hour effort.

---

### F-SEC-06: API Key Timing Attack

> **🔐 Sam:** The 3x timing difference (415ms correct vs 140ms wrong) is significant enough to exploit with a modest number of requests. An attacker can confirm whether a guessed key is valid. It doesn't allow brute-force generation from scratch, but it does allow an attacker to confirm leaked partial keys. Real risk, not theoretical.

> **🏗️ Alex:** Root cause: likely a conditional branch — valid key goes to DB lookup + permission check, invalid key short-circuits. Fix: use constant-time comparison (`crypto.timingSafeEqual`) for the key check, and add artificial delay normalization. OR, restructure so the DB lookup always happens (query by key prefix, then constant-time compare). Effort: 2 hours.

> **📊 Casey:** This won't kill a deal on its own, but combined with the other security findings, it contributes to a "Grade C" story. Fix it — low effort, high signal.

**Verdict:** Fix in Track A. 2-hour effort, parallel with SSRF work.

---

### F-SEC-07: Stored XSS in Agent Names

> **🔐 Sam:** Stored XSS means the payload persists and executes for every user who views the agents list. If our dashboard renders agent names unescaped, this is a full account takeover vector — an attacker who can create an agent (requires API key) can hijack sessions of other users on the same tenant. Given that F-SEC-08 (SQL injection) is also present, this suggests input sanitization is entirely absent on agent creation.

> **🏗️ Alex:** Root cause: agent name field has no sanitization layer. Two-part fix: (1) API layer — strip or reject HTML/script tags in agent names; (2) Dashboard layer — ensure agent names are rendered with HTML entity encoding. The API fix is mandatory; the dashboard fix is defense-in-depth. Effort: 3 hours API + 1 hour dashboard.

> **📊 Casey:** The XSS + SQL combo in one place signals "nobody reviewed this endpoint." If a security researcher finds this and publishes a PoC, we're toast. Fix it now, before public launch.

**Verdict:** Fix in Track A. Bundle sanitization for XSS + SQL injection together.

---

### F-BUG-01: Policy Changes Not Propagating to Evaluate

> **📊 Casey:** This is the most product-damaging bug we have. The entire value proposition of AgentGuard is "set a policy, enforce it." If I set a policy and it doesn't work... the product doesn't work. Full stop. This will destroy NPS. Developer does the quickstart, updates their policy, tests it, gets the same block, concludes the product is broken. We lose them at that moment.

> **🏗️ Alex:** Root cause: almost certainly a cache invalidation bug. The evaluate engine is reading policy from an in-memory cache that isn't invalidated when PUT /policy is called. Fix: on PUT /policy success, explicitly clear/update the policy cache for that tenantId. This is probably a 1-2 line fix if we find the right cache invalidation hook, or up to 4 hours if the caching architecture is more complex (distributed cache, worker-level cache, etc.). Need to check if workers have tenant-scoped in-memory state vs shared cache.

> **🔐 Sam:** Security implication: if the cache is sticky, a killswitch activation might also not propagate immediately. Need to verify killswitch also invalidates the same cache.

**Verdict:** Fix immediately (Track B, top priority). Investigate cache layer depth — estimated 2–6 hours depending on architecture.

---

### F-BUG-02: Analytics Endpoint 500

> **🏗️ Alex:** This is a new v0.8.0 feature that shipped broken. Root cause: likely the analytics aggregation query is failing — possibly empty table, uninitialized table, or query syntax error. The error message `"Failed to fetch analytics"` suggests a caught exception with no further detail. Need to look at the analytics service handler and check what DB query it's running.

> **📊 Casey:** Every demo we give will hit this. "Let's look at your usage..." → error. Embarrassing. Not critical in the security sense but critical for demos.

> **🔐 Sam:** Low security impact. Fix for product quality.

**Verdict:** Fix in Track B. Estimate 2–4 hours to debug + fix the analytics query. Add graceful fallback (return empty data, not 500).

---

### F-BUG-03: GET /agents/:id Returns 404

> **🏗️ Alex:** Root cause: route not registered or route parameter collision. The router likely has `/agents` (list) but `/agents/:id` is either not defined or being caught by another pattern. One-line fix to add the route handler. The agent data clearly exists (validate endpoint uses the same ID fine). Effort: 1 hour.

> **📊 Casey:** Any developer building an integration will try to look up a specific agent. Standard REST pattern. This failing looks like we don't know how REST works.

**Verdict:** Fix in Track B. Quick route fix.

---

### F-BUG-04: PII Scan Field Key Mismatch (`text` vs `content`)

> **🏗️ Alex:** The API uses `content`, docs say `text`, SDK uses `text`. The disconnect is in 3 places. Fastest fix: make the API accept both `text` and `content` as aliases (backward-compatible). Then update docs and SDK to prefer `content`. Alternatively, change the API to accept `text` (breaking change, but docs + SDK are already using it). Recommend the alias approach — handles both existing SDKs and current API.

> **📊 Casey:** First time a dev uses PII scan, it silently fails with a confusing error. This is a trust-breaker for a security-critical feature.

**Verdict:** Fix in Track B (API alias) and Track D (docs update). 1–2 hour effort.

---

### F-DX-01: Signup Fails Without `name` Field

> **📊 Casey:** First API call fails. First impression destroyed. This is a one-line docs fix but the impact is enormous — it's the first thing every new developer does.

> **🏗️ Alex:** Fix is purely in the docs — add `name` field to the signup curl example. Could also make `name` optional in the API (reasonable — just generate one). Two-pronged approach: optional in API + documented in docs.

**Verdict:** Fix in Track D (docs) and optionally Track B (make `name` optional). Combined 30-minute effort.

---

### F-DX-03: Dashboard Shows v0.7.2

> **📊 Casey:** Every user who logs in sees this. It's the first thing you notice after the nav. Completely undermines confidence in the release. One character change.

> **🏗️ Alex:** Hard-coded string in the sidebar template. Grep for `v0.7.2` in app source, update to `v0.8.0`. 5-minute fix.

**Verdict:** Fix in Track C. Sub-1-hour effort, high visibility impact.

---

### F-CONTENT-01/02: GitHub Links Return 404

> **📊 Casey:** Developers click GitHub links to see code, star the repo, check activity. 404 means "this company doesn't exist on GitHub" or "private/nonexistent." Kills credibility for technical evaluators.

> **🏗️ Alex:** Either (a) make the org/repo public, or (b) remove the links, or (c) redirect to a coming-soon page. Quickest safe fix: remove links from HTML. Best fix: create the GitHub org page even if repo stays private.

**Verdict:** Fix in Track C. Remove or replace links until repo is ready.

---

## 3. Prioritized Fix List

| Priority | ID | Issue | Root Cause | Fix Approach | Effort | Parallel? |
|----------|----|-------|-----------|-------------|--------|-----------|
| **1** | F-SEC-01 | Playground auth bypass | Missing middleware on playground router | Add `requireApiKey` middleware to playground routes | 1–2h | Yes (A) |
| **2** | F-BUG-01 | Policy not propagating to evaluate | Cache not invalidated on PUT /policy | Clear tenant policy cache on PUT /policy success; verify killswitch does same | 2–6h | Yes (B) |
| **3** | F-SEC-02/03/04/05 | SSRF gaps (IPv6, CGNAT, hostname aliases, MCP) | SSRF blocklist only covers IPv4 RFC1918 | Comprehensive URL validator: normalize, resolve, block all private ranges including IPv6 | 4–6h | Yes (A) |
| **4** | F-SEC-07/08 | Stored XSS + SQL injection in agent names | No input sanitization on agent creation | Strip/reject HTML+script tags; parameterize queries; render with entity encoding in dashboard | 3–4h | Yes (A) |
| **5** | F-SEC-06 | API key timing attack | Conditional branch exposes timing | Use `crypto.timingSafeEqual`; normalize response time | 2h | Yes (A) |
| **6** | F-BUG-02 | Analytics 500 error | Analytics query failing (new v0.8.0 feature) | Debug query, add empty-state handling, return `[]` not 500 | 2–4h | Yes (B) |
| **7** | F-BUG-03 | GET /agents/:id 404 | Route not registered | Add route handler for `/agents/:id` | 1h | Yes (B) |
| **8** | F-DX-03 | Dashboard shows v0.7.2 | Hard-coded version string | Find + replace `v0.7.2` → `v0.8.0` in app source | 30min | Yes (C) |
| **9** | F-CONTENT-01/02 | GitHub links 404 | Repo/org not public | Remove links or create GitHub org; update HTML | 1h | Yes (C) |
| **10** | F-BUG-04 | PII scan `text` vs `content` field | API uses `content`, docs/SDK say `text` | Accept both as aliases in API; update docs and SDK | 2h | Yes (B+D) |
| **11** | F-DX-01 | Signup fails without `name` field | Docs incomplete | Add `name` to quickstart curl; optionally make it optional in API | 30min | Yes (D) |
| **12** | F-BUG-05 | Feedback `verdict` vs `rating` field | Docs use wrong field name | Update docs to show `rating: 5` instead of `verdict`; add `verdict` as deprecated alias | 1h | Yes (B+D) |
| **13** | F-SEC-11/12/13/14 | Missing security headers on docs/demo/about | Static sites lack Cloudflare header config | Add `_headers` file or Cloudflare Transform Rules to all 3 subdomains | 2h | Yes (C) |
| **14** | F-DX-06 | Signup password field undocumented | Docs omit optional field | Add password to docs with "optional, for enterprise SSO" note | 30min | Yes (D) |
| **15** | F-DX-07 | Docs use `ag_agent_*` in evaluate example | Copy error in docs | Update evaluate curl to use `ag_live_*` | 15min | Yes (D) |
| **16** | F-CONTENT-03 | `twitter:image` missing everywhere | Omitted from HTML templates | Add `<meta name="twitter:image">` to all 5 sites | 1h | Yes (C) |
| **17** | F-CONTENT-04 | about.agentguard.dev og:url mismatch | Hard-coded wrong URL | Update og:url to `https://about.agentguard.dev` | 15min | Yes (C) |
| **18** | F-PERF-01 | `/health` and `/api/docs` rate limited aggressively | Same rate limit as API calls | Exclude health + docs from 10 req/min; create separate "infra" tier | 1h | Yes (A/B) |
| **19** | F-BUG-06 | evaluate response missing `sessionId`, `hashChain` | Regression vs docs | Restore fields to evaluate response or remove from docs | 2h | Yes (B) |
| **20** | F-DX-02 | No self-hosted docs | Feature not documented | Add Docker quickstart stub + "contact sales" CTA | 3h | Yes (D) |
| **21** | F-BUG-07 | `agentId` in evaluate silently ignored | agentId not linked to audit | Pass agentId through to audit event logging | 2h | Yes (B) |
| **22** | F-BUG-08 | Dashboard shows placeholder data | Demo data not replaced | Detect fresh account, show empty state instead of demo data | 2h | Yes (C) |
| **23** | F-DX-08 | SDK package vs import name mismatch | Package naming convention | Add note in docs about install vs import name difference | 30min | Yes (D) |
| **24** | F-CONTENT-05 | demo + about not redeployed since v0.8.0 | Release pipeline gap | Trigger redeploy on both; verify content is current | 1h | Yes (C) |
| **25** | F-PERF-02 | Cold-start timeouts on app + demo | Cloudflare Worker cold start | Investigate always-on vs scheduled warm-up | 2h | Yes (ops) |

---

## 4. Four-Track Parallel Sprint Plan

> **Execution Model:** All 4 tracks run simultaneously as independent subagents. No cross-track dependencies except where noted. Each track should run to completion, then report.

---

## 🔐 Track A — Security Fixes (Criticals + Highs)

**Owner:** Security-focused subagent  
**Estimated Duration:** 6–8 hours  
**Scope:** F-SEC-01, F-SEC-02/03/04/05, F-SEC-06, F-SEC-07/08, F-PERF-01

---

### A1 — Fix Playground Auth Bypass (F-SEC-01)
**File to find:** Playground router (likely `src/routes/playground.ts` or `routes/playground.js`)  
**Instructions:**
1. Locate the playground router file. Look for route handlers matching `/playground/session`, `/playground/evaluate`, `/playground/scenarios`, `/playground/policy`.
2. Identify the auth middleware used elsewhere (likely called `requireApiKey`, `authMiddleware`, or `validateKey` — grep codebase for where it's applied to protected routes).
3. Apply that same middleware to ALL playground routes before the route handlers.
4. Alternatively, if playground routes are mounted on a sub-router, apply the middleware to the entire sub-router.
5. Test: `curl -X POST https://api.agentguard.dev/api/v1/playground/session -H "Content-Type: application/json" -d '{}'` should return 401.

**Code pattern (Express example):**
```js
// Before fix:
router.post('/playground/session', playgroundSessionHandler);

// After fix:
router.post('/playground/session', requireApiKey, playgroundSessionHandler);
// OR apply to entire playground router at mount point:
app.use('/api/v1/playground', requireApiKey, playgroundRouter);
```

---

### A2 — SSRF Hardening: Webhooks + MCP Config (F-SEC-02/03/04/05)
**Files to find:** Webhook URL validation (likely `src/validators/webhook.ts` or `src/middleware/ssrf.ts`)  
**Instructions:**
1. Locate existing SSRF/private IP blocklist for webhooks. It currently blocks 127.0.0.1, 10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12.
2. Extend the blocklist to include:
   - IPv6 link-local: `fe80::/10`
   - IPv6 loopback: `::1`
   - IPv6 ULA: `fc00::/7`
   - CGNAT: `100.64.0.0/10`
   - Cloud metadata: `169.254.169.254` (AWS/GCP/Azure)
3. Add hostname resolution: before accepting a URL, resolve the hostname to IP(s) via DNS, then check ALL resolved IPs against the blocklist (prevents `localhost.localdomain` bypass).
4. Find the MCP config handler (`PUT /mcp/config` or `POST /mcp/servers`). Apply the SAME SSRF validation used for webhooks to the `serverUrl` field.
5. Reject any URL where DNS resolution fails or resolves to a blocked range.

**Code pattern:**
```js
const BLOCKED_RANGES = [
  // Existing IPv4
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8',
  // New additions
  '100.64.0.0/10',       // CGNAT
  '169.254.0.0/16',      // Link-local IPv4
  // IPv6
  '::1/128',             // Loopback
  'fe80::/10',           // Link-local
  'fc00::/7',            // ULA
];

// Before accepting webhook URL:
const resolvedIPs = await dns.resolve(hostname);
for (const ip of resolvedIPs) {
  if (isInBlockedRange(ip, BLOCKED_RANGES)) {
    return res.status(400).json({ error: 'URL resolves to a private/internal address' });
  }
}
```

---

### A3 — Fix API Key Timing Attack (F-SEC-06)
**File to find:** API key validation middleware (where the key is looked up in DB)  
**Instructions:**
1. Find where `X-API-Key` header is validated (grep for `X-API-Key` or `apiKey` lookup in middleware).
2. Identify the fast-fail path that returns early for invalid keys.
3. Implement one of:
   - **Option A (preferred):** Always perform the full DB lookup, then use `crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(storedKey))` for comparison. Add a minimum response time floor (e.g., `await sleep(Math.max(0, TARGET_MS - elapsed))`).
   - **Option B:** Use a HMAC of the key as the lookup key in the database, so all lookups take the same time regardless of validity.
4. Verify: time 50 requests with correct key, 50 with wrong key — standard deviation should be similar, mean should be within 20% of each other.

---

### A4 — Input Sanitization: XSS + SQL Injection in Agent Names (F-SEC-07/08)
**Files to find:** Agent creation handler (`POST /agents`) and agent name schema validator  
**Instructions:**
1. Find the agent creation route handler and its input schema (Zod, Joi, or similar).
2. Add a sanitization step for the `name` field:
   - Strip HTML tags: use `DOMPurify` (if available) or a simple regex `/(<([^>]+)>)/gi`
   - If the name contains `<script`, `<img`, `onerror=`, `javascript:`, `' OR`, `UNION SELECT`, `--` — return a 400 with `{"error":"Agent name contains invalid characters"}`
   - Alternative: use a whitelist — only allow alphanumeric, spaces, hyphens, underscores, periods (recommended for clean data)
3. Ensure the database query for agent creation uses parameterized queries (not string interpolation). Check the ORM/query builder being used.
4. If the dashboard renders agent names, ensure they're HTML-entity-encoded in templates.

**Whitelist regex:** `/^[a-zA-Z0-9 \-_.]+$/` (adjust as needed for your agent naming conventions)

---

### A5 — Rate Limiting on /evaluate and /audit (F-SEC-09/10)
**File to find:** Rate limiting middleware configuration  
**Instructions:**
1. Find where rate limits are configured (likely a middleware setup file or route-level middleware).
2. Verify that `/evaluate` and `/audit` endpoints have rate limiting applied. The current config appears to apply only to `/signup` (10 req/min works) but not other endpoints.
3. Apply limits: POST /evaluate → 60 req/min per API key. GET /audit → 120 req/min per API key.
4. While here: create a separate rate limit tier for `/health` and `/api/docs` with a higher limit (600 req/min or unlimited) — see F-PERF-01.

---

## 🏗️ Track B — Functional Bug Fixes (500s, 404s, Field Mismatches)

**Owner:** Backend-focused subagent  
**Estimated Duration:** 8–10 hours  
**Scope:** F-BUG-01, F-BUG-02, F-BUG-03, F-BUG-04, F-BUG-05, F-BUG-06, F-BUG-07, F-BUG-08

---

### B1 — Fix Policy Cache Invalidation (F-BUG-01) ⚠️ HIGHEST PRIORITY IN TRACK B
**File to find:** `PUT /policy` handler and evaluate engine's policy loading code  
**Instructions:**
1. Find the `PUT /policy` endpoint handler.
2. Find where the evaluate engine (`POST /evaluate`) loads policy — look for a cache variable, Redis lookup, or in-memory Map.
3. After a successful `PUT /policy` write to the database, trigger cache invalidation:
   - If in-memory cache: `policyCache.delete(tenantId)` or `policyCache.set(tenantId, newPolicy)`
   - If Redis: `await redis.del(\`policy:\${tenantId}\`)` or `await redis.set(\`policy:\${tenantId}\`, JSON.stringify(newPolicy))`
   - If worker-level cache: you may need to broadcast a cache invalidation event if using multiple workers
4. Also verify that `POST /killswitch` triggers the same cache invalidation (security requirement from Sam).
5. Test: PUT /policy → GET /policy (confirm 1 rule) → POST /evaluate with matching tool → expect `allow` result.

**Code pattern:**
```js
// In PUT /policy handler, after successful DB write:
await policyCache.invalidate(tenantId);
// OR for Redis:
await redis.del(`policy:cache:${tenantId}`);
logger.info({ tenantId }, 'Policy cache invalidated after update');
```

---

### B2 — Fix Analytics 500 Error (F-BUG-02)
**File to find:** Analytics handler (`GET /analytics/usage`)  
**Instructions:**
1. Find the analytics endpoint handler. Look in `src/routes/analytics.ts` or similar.
2. Add verbose error logging around the failing query: `console.error('Analytics query failed:', err)` to get the actual error in logs.
3. Common causes to check:
   - Table `analytics` or `usage_events` doesn't exist yet (migration not run?)
   - Query uses a time-range function that fails on empty data
   - Missing index causes timeout
4. Add graceful fallback: if query fails or returns empty, return `{ "period": "7d", "events": [], "total": 0, "breakdown": {} }` with HTTP 200 — never return 500 for expected empty states.
5. For `?period=7d` and `?period=30d` params — ensure the query correctly filters by the period parameter.

---

### B3 — Fix GET /agents/:id 404 (F-BUG-03)
**File to find:** Agents router (likely `src/routes/agents.ts`)  
**Instructions:**
1. Check the agents router for a `GET /:id` handler. It's either missing or incorrectly ordered.
2. If missing, add:
   ```js
   router.get('/:id', requireApiKey, async (req, res) => {
     const agent = await db.agent.findFirst({
       where: { id: req.params.id, tenantId: req.tenant.id }
     });
     if (!agent) return res.status(404).json({ error: 'Agent not found' });
     return res.json(agent);
   });
   ```
3. Ensure this route is defined BEFORE any catch-all or wildcard routes.
4. Test: `GET /api/v1/agents/:id` with a valid agent ID → expect 200 with agent object.

---

### B4 — Fix PII Scan Field Mismatch: Accept Both `text` and `content` (F-BUG-04)
**File to find:** PII scan endpoint handler (`POST /pii/scan`)  
**Instructions:**
1. Find the PII scan handler and its input schema.
2. Modify the schema to accept either `content` OR `text` as the input field:
   ```js
   const schema = z.object({
     content: z.string().optional(),
     text: z.string().optional(),   // alias for content
   }).refine(data => data.content || data.text, {
     message: 'Either content or text field is required'
   });
   // In handler:
   const inputText = body.content ?? body.text;
   ```
3. This is backward-compatible — existing `content` users unaffected, new `text` users now work.
4. Note: Track D will update docs/SDK to use `content` going forward, deprecating `text`.

---

### B5 — Fix Feedback Field: Accept Both `verdict` and `rating` (F-BUG-05)
**File to find:** Feedback endpoint handler (`POST /feedback`)  
**Instructions:**
1. Find the feedback handler. It currently requires `rating` (integer 1–5).
2. Also accept `verdict` field: map `"positive"` → 5, `"negative"` → 1, `"neutral"` → 3.
3. Schema update:
   ```js
   const schema = z.object({
     rating: z.number().int().min(1).max(5).optional(),
     verdict: z.enum(['positive', 'negative', 'neutral']).optional(),
     comment: z.string().optional()
   }).refine(data => data.rating !== undefined || data.verdict !== undefined, {
     message: 'rating or verdict is required'
   });
   const ratingValue = data.rating ?? verdictToRating(data.verdict);
   ```
4. Track D will update docs to show `rating` as primary field.

---

### B6 — Restore `sessionId` and `hashChain` to Evaluate Response (F-BUG-06)
**File to find:** Evaluate response builder  
**Instructions:**
1. Find where `POST /evaluate` builds its JSON response.
2. Check if `sessionId` and `hashChain` were previously included (git log / diff).
3. If the hash chain is being computed but not returned, add it to the response.
4. If not computed, either: (a) generate a session UUID per evaluation and include it, or (b) remove these fields from the docs (Track D).
5. Recommended: add `sessionId: uuidv4()` to each evaluate response for traceability.

---

### B7 — Link `agentId` from Evaluate to Audit Log (F-BUG-07)
**File to find:** Evaluate handler and audit log writer  
**Instructions:**
1. In `POST /evaluate`, find where the request body's `agentId` is (likely `req.body.agentId`).
2. Find where the audit event is written after evaluation.
3. Pass `agentId` from the request body into the audit event's `agent_id` field.
4. Test: POST /evaluate with `agentId: "my-agent"` → GET /audit → confirm `agent_id: "my-agent"` in audit event.

---

### B8 — Dashboard Placeholder Data for Fresh Accounts (F-BUG-08)
**File to find:** Dashboard app source, likely `app.agentguard.dev` frontend code  
**Instructions:**
1. Find where the overview stats (e.g., "12,450 / 25,000 events") are rendered in the dashboard.
2. If the data is hard-coded as demo data, replace with an API call to `/analytics/usage` or `/license/usage`.
3. Add an empty state: if `event_count === 0`, show "No evaluations yet — make your first API call!" instead of placeholder numbers.
4. Note: This is partially blocked on B2 (analytics fix). If analytics still broken, use `/license/usage` which works.

---

## 🖥️ Track C — Frontend & Content Fixes

**Owner:** Frontend-focused subagent  
**Estimated Duration:** 3–4 hours  
**Scope:** F-DX-03, F-SEC-11/12/13/14, F-CONTENT-01/02/03/04/05, F-PERF-01 (rate limits for /health and /docs)

---

### C1 — Fix Dashboard Version String (F-DX-03) ⚠️ HIGHEST PRIORITY IN TRACK C
**File:** `app.agentguard.dev` source — sidebar/navigation component  
**Instructions:**
1. In the dashboard source, search for `v0.7.2`.
2. Replace all occurrences with `v0.8.0`.
3. If the version is set in a config file (e.g., `config.js`, `.env`, `package.json`), update there and ensure the sidebar reads from it dynamically.
4. Redeploy the dashboard.
5. Test: load app.agentguard.dev, check sidebar footer → should show `AgentGuard v0.8.0`.

---

### C2 — Add Security Headers to docs/demo/about Subdomains (F-SEC-11/12/13/14)
**Files:** Cloudflare `_headers` file or Cloudflare Transform Rules for docs.agentguard.dev, demo.agentguard.dev, about.agentguard.dev  
**Instructions:**
1. For each subdomain, add the following headers. If deployed via Cloudflare Pages, create/update `_headers` file in the site root:
   ```
   /*
     Strict-Transport-Security: max-age=31536000; includeSubDomains
     Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none';
     X-Frame-Options: DENY
     X-Content-Type-Options: nosniff
     Referrer-Policy: strict-origin-when-cross-origin
     Permissions-Policy: geolocation=(), microphone=(), camera=()
   ```
2. If using Cloudflare Transform Rules (dashboard approach): create a rule matching `(http.host eq "docs.agentguard.dev") or (http.host eq "demo.agentguard.dev") or (http.host eq "about.agentguard.dev")` and add the response headers.
3. Note: `X-Frame-Options: DENY` should be applied especially to demo.agentguard.dev (currently missing, clickjacking risk).
4. Test with `curl -I https://docs.agentguard.dev` — verify all headers present.

---

### C3 — Fix GitHub Links (F-CONTENT-01/02)
**Files:** 
- `agentguard.dev` HTML — footer section (remove or replace GitHub org link and repo link)
- `about.agentguard.dev` HTML — team/footer section  
**Instructions:**
1. Search for `github.com/thebotclub` in all HTML source files.
2. Choose one of:
   - **Option A (quick):** Remove all GitHub links entirely until repo is public.
   - **Option B (best):** Create the GitHub org at `github.com/thebotclub` (free, 5 minutes) and pin a public repo or set a public profile. Then the link works.
   - **Option C:** Replace with a coming-soon message: `<a href="/roadmap">Open source coming soon</a>`
3. In JSON-LD structured data on agentguard.dev, also remove the GitHub URL from `sameAs` or `url` fields if present.
4. Test: click all GitHub-referencing links, confirm no 404s.

---

### C4 — Add `twitter:image` Meta Tag to All Sites (F-CONTENT-03)
**Files:** HTML `<head>` of all 5 sites: agentguard.dev, app.agentguard.dev, docs.agentguard.dev, demo.agentguard.dev, about.agentguard.dev  
**Instructions:**
1. For each site, find the existing `og:image` meta tag value.
2. Add directly after it:
   ```html
   <meta name="twitter:image" content="[SAME VALUE AS og:image]" />
   ```
3. Confirm og:image value exists (it does on all sites per the test results).
4. Test: paste URLs into https://cards-dev.twitter.com/validator (or check meta tags manually with curl).

---

### C5 — Fix about.agentguard.dev og:url Mismatch (F-CONTENT-04)
**File:** `about.agentguard.dev` HTML  
**Instructions:**
1. Find `<meta property="og:url" content="https://agentguard.dev/about">` in the HTML.
2. Change to: `<meta property="og:url" content="https://about.agentguard.dev">`.
3. This should match the canonical URL already set correctly.

---

### C6 — Redeploy demo and about Subdomains (F-CONTENT-05)
**Instructions:**
1. Trigger redeploy for `demo.agentguard.dev` (Last-Modified was 2026-03-03, pre-release).
2. Trigger redeploy for `about.agentguard.dev` (also pre-release).
3. If these sites have v0.8.0 content changes (e.g., new demo scenes, updated team bios), ensure those changes are included in the redeploy.
4. After redeploy, verify Last-Modified headers update to current date.
5. Verify all demo scenes load correctly and reference v0.8.0 features if applicable.

---

### C7 — Rate Limit Exclusion for /health and /api/docs (F-PERF-01)
**File:** API rate limiting configuration (may be Cloudflare WAF rules or backend middleware)  
**Instructions:**
1. Find where the 10 req/min rate limit is applied to the API.
2. Exclude these paths from the strict limit:
   - `GET /health`
   - `GET /api/docs` (and `/api/docs/*` for Swagger assets)
3. Set a separate, higher limit for these infra endpoints: 600 req/min or no limit.
4. This can be done via Cloudflare WAF custom rules: add a bypass rule for matching paths before the rate limit rule.

---

## 📚 Track D — DX & Documentation Fixes

**Owner:** Docs-focused subagent  
**Estimated Duration:** 3–4 hours  
**Scope:** F-DX-01, F-DX-02, F-DX-04, F-DX-05, F-DX-06, F-DX-07, F-DX-08, F-BUG-06 (docs component)

All doc changes apply to the docs.agentguard.dev source HTML/markdown.

---

### D1 — Fix Signup Quickstart: Add `name` Field (F-DX-01) ⚠️ HIGHEST PRIORITY IN TRACK D
**File:** docs.agentguard.dev — Quickstart / Getting Started / Signup section  
**Instructions:**
1. Find the signup curl example in the quickstart. Currently shows:
   ```bash
   curl -X POST https://api.agentguard.dev/api/v1/signup \
     -H "Content-Type: application/json" \
     -d '{"email": "you@example.com"}'
   ```
2. Update to include `name`:
   ```bash
   curl -X POST https://api.agentguard.dev/api/v1/signup \
     -H "Content-Type: application/json" \
     -d '{"email": "you@example.com", "name": "Your Name"}'
   ```
3. Also update any TypeScript/Python SDK examples in the signup section.
4. Add a note: `name` is required. `password` is optional (for SSO/enterprise integrations).

---

### D2 — Fix PII Scan Docs: Use `content` Field (F-DX-04)
**File:** docs.agentguard.dev — PII Detection section  
**Instructions:**
1. Find all occurrences of `"text":` in PII scan examples. Update to `"content":`.
2. Update TypeScript SDK example:
   ```ts
   // Before:
   const result = await agentguard.scanPii({ text: 'My SSN is 123-45-6789' });
   // After:
   const result = await agentguard.scanPii({ content: 'My SSN is 123-45-6789' });
   ```
3. Update Python SDK example:
   ```python
   # Before:
   result = agentguard.scan_pii(text="My SSN is 123-45-6789")
   # After:
   result = agentguard.scan_pii(content="My SSN is 123-45-6789")
   ```
4. Add a deprecation note: "`text` was used in early v0.8.0 pre-release docs. The correct field is `content`. The API accepts both for backward compatibility."

---

### D3 — Fix Feedback Docs: Use `rating` Field (F-DX-05)
**File:** docs.agentguard.dev — Feedback / HITL section  
**Instructions:**
1. Find where feedback is documented. Currently shows `{"verdict": "positive"}`.
2. Update to:
   ```json
   {
     "rating": 5,
     "comment": "Tool action was appropriate"
   }
   ```
3. Add field table:
   | Field | Type | Required | Description |
   |-------|------|----------|-------------|
   | rating | integer (1–5) | Yes | 1=poor, 5=excellent |
   | comment | string | No | Free-text feedback |
   | verdict | enum | Deprecated | Use rating instead |

---

### D4 — Document `password` Field in Signup (F-DX-06)
**File:** docs.agentguard.dev — Authentication / Signup section  
**Instructions:**
1. Add to the signup field table:
   | Field | Type | Required | Description |
   |-------|------|----------|-------------|
   | email | string | Yes | Account email |
   | name | string | Yes | Display name |
   | password | string | No | Optional; for organizations using SSO |
2. Note: `password` is accepted but passwordless auth (API key only) is the default for developer usage.

---

### D5 — Fix Evaluate Docs: Correct API Key Type in Examples (F-DX-07)
**File:** docs.agentguard.dev — Evaluate section  
**Instructions:**
1. Find any evaluate curl examples that use `ag_agent_*` keys.
2. Replace with `ag_live_*` (tenant key) format for the evaluate endpoint.
3. Add a clear note: evaluate endpoint accepts BOTH `ag_live_*` (tenant key) and `ag_agent_*` (scoped agent key). Show both examples if space allows.

---

### D6 — Add Self-Hosted Stub Section (F-DX-02)
**File:** docs.agentguard.dev — new section "Self-Hosted / On-Premises"  
**Instructions:**
1. Add a new sidebar section "Self-Hosted" between SDK Telemetry and Resources.
2. Content template:
   ```markdown
   ## Self-Hosted Deployment (Enterprise)
   
   AgentGuard Enterprise supports air-gapped and on-premises deployment.
   
   **Requirements:** Docker, Kubernetes (optional), PostgreSQL 15+, Redis 7+
   
   **Quick Start (Docker):**
   \`\`\`bash
   docker pull agentguard/api:0.8.0
   docker run -e DATABASE_URL=... -e REDIS_URL=... -p 3000:3000 agentguard/api:0.8.0
   \`\`\`
   
   **For full Helm chart, Terraform modules, and air-gap bundle:**
   [Contact our solutions team →](https://agentguard.dev/enterprise)
   
   *Available on Enterprise plan. Includes SLA, dedicated onboarding, and security review.*
   ```
3. Even if self-hosted isn't fully implemented yet, the stub prevents "no documentation" objections from enterprise buyers.

---

### D7 — Document SDK Package vs Import Name (F-DX-08)
**File:** docs.agentguard.dev — SDK Installation section  
**Instructions:**
1. Add a callout note after install commands:
   ```markdown
   > **Note:** The npm package name is `@the-bot-club/agentguard` but it is imported as `AgentGuard`:
   > ```js
   > import { AgentGuard } from '@the-bot-club/agentguard';
   > ```
   > Similarly, the PyPI package `agentguard-tech` is imported as `agentguard`:
   > ```python
   > import agentguard
   > ```
   ```
2. This eliminates "module not found" confusion for developers.

---

### D8 — Update or Remove `sessionId`/`hashChain` from Evaluate Docs (F-BUG-06 docs component)
**File:** docs.agentguard.dev — Evaluate section, response schema  
**Coordination:** Check with Track B (B6) — if they restore these fields to the API, docs are correct as-is. If they decide to not restore them, update docs to remove `sessionId` and `hashChain` from the response examples.  
**Instructions (if fields removed from API):**
1. Remove `sessionId` and `hashChain` from the evaluate response example.
2. Update the response schema table to remove those fields.
3. Add a note: "Audit traceability is available via GET /audit with hash chain verification."

---

## Sprint Summary

| Track | Owner | Priority Issues | Est. Duration | Parallel? |
|-------|-------|----------------|---------------|-----------|
| **A — Security** | Security subagent | SEC-01 (playground auth), SSRF gaps, timing attack, XSS/SQLi | 6–8h | ✅ Yes |
| **B — Functional** | Backend subagent | Policy cache (CRITICAL), analytics 500, agents 404, field mismatches | 8–10h | ✅ Yes |
| **C — Frontend** | Frontend subagent | v0.7.2 string, security headers, GitHub 404, twitter:image | 3–4h | ✅ Yes |
| **D — Docs/DX** | Docs subagent | Signup name field, pii field, feedback field, self-hosted stub | 3–4h | ✅ Yes |

**Total wall-clock time (parallel):** ~10 hours  
**Total effort (sequential equivalent):** ~28 hours

---

## Cross-Track Coordination Points

| Issue | Track B action | Track D action | Coordination |
|-------|---------------|---------------|--------------|
| PII `text` vs `content` | B4: API accepts both | D2: Update docs to `content` | B should merge first; D updates after |
| `sessionId`/`hashChain` | B6: Restore to API | D8: Update docs if NOT restored | D must wait for B6 decision |
| Feedback `verdict` vs `rating` | B5: API accepts both | D3: Update docs to `rating` | B should merge first |
| Analytics fix | B2: Fix 500 | — | C7 (dashboard empty state) depends on B2 |

---

## Post-Sprint Validation Checklist

After all 4 tracks complete, run these verification tests:

- [ ] `curl /playground/session` without auth → 401 (A1 fix)
- [ ] `curl -X POST /webhooks -d '{"url":"https://[fe80::1]/","events":["*"]}'` → 400 (A2 fix)
- [ ] `curl -X POST /webhooks -d '{"url":"https://localhost.localdomain/","events":["*"]}'` → 400 (A2 fix)
- [ ] Timing: correct vs wrong API key response times within 20% of each other (A3 fix)
- [ ] `curl -X POST /agents -d '{"name":"<script>alert(1)</script>"}'` → 400 (A4 fix)
- [ ] PUT /policy → POST /evaluate → verify rule applied (B1 fix — most important)
- [ ] `GET /analytics/usage` → 200 with data or empty state, NOT 500 (B2 fix)
- [ ] `GET /agents/:id` → 200 with agent data (B3 fix)
- [ ] `POST /pii/scan` with `text` field → 200 (B4 fix)
- [ ] `app.agentguard.dev` sidebar shows `v0.8.0` (C1 fix)
- [ ] `curl -I https://docs.agentguard.dev` → CSP, HSTS, Permissions-Policy headers present (C2 fix)
- [ ] All GitHub links removed or return 200 (C3 fix)
- [ ] Signup docs include `name` field in example (D1 fix)
- [ ] PII docs show `content` field (D2 fix)
- [ ] NPS re-estimate: target NPS +50 after fixes

---

*Plan authored by Vector — Expert Planning Session, 2026-03-07 UTC*  
*Experts: Sam (Security), Alex (Architect), Casey (Product/PM)*
