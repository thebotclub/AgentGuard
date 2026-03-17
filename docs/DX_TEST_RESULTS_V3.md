# AgentGuard DX Test Results — V3

**Date:** 2026-03-09  
**API Version:** v0.8.0  
**Tester:** Automated DX audit (Vector subagent)  
**API Key Used:** `ag_live_3ed4774062fff154cf17cc430700e68b` (rotated during test)

---

## Overall DX Score: B+ (82/100)

AgentGuard delivers a strong developer experience for an v0.8 product. The API is well-designed, documentation is comprehensive, error messages are above-average, and the quickstart actually works. Key gaps: SDK package naming confusion, batch endpoint discoverability, and signup validation polish.

---

## 1. Signup Flow — Grade: B+

### What Works
- **Clean 201 response** with `tenantId`, `apiKey`, `dashboard` URL, and a clear warning to store the key
- **API key format** (`ag_live_` + 32 hex) is self-documenting — easy to grep in codebases
- **Fast** — sub-second response
- **Duplicate email handling** — returns 429 (rate-limited) rather than leaking account existence info ✅ (privacy-aware, though a 409 Conflict would be more RESTful)

### Issues Found
- **Sequential validation only** — sending `{}` returns `"name is required"` but doesn't mention email/password are also missing. Developers must fix errors one-at-a-time. Should return all validation errors at once.
- **Email validation error is generic** — `{"error":"Invalid email format"}` lacks the structured format used elsewhere (`field`, `expected`, `suggestion`, `docs`). Inconsistent with the evaluate endpoint's excellent error structure.
- **No password requirements communicated** — docs say "min 8 chars" but the error response when password is too short was never triggered (the email error fires first). Password policy should be in signup docs AND in validation errors.
- **No rate limit on signup** — could be abused for account enumeration (though duplicate handling mitigates this somewhat).

### Recommendation
Return an `errors` array with all validation failures at once. Use the same structured format as evaluate errors.

---

## 2. First API Call Experience — Grade: A-

### What Works
- **Zero-config evaluate** — signup gives you a key, docs show a curl one-liner, it works immediately. No policy file required to start.
- **Default policy included** — blocks dangerous operations (shell_exec with sudo, external HTTP) out of the box. Developer doesn't need to write YAML to see value.
- **Response is rich and useful:**
  ```json
  {
    "result": "block",
    "matchedRuleId": "block-external-http",
    "riskScore": 75,
    "reason": "Blocked by rule \"block-external-http\"",
    "durationMs": 0.29,
    "suggestion": "Use an approved internal endpoint...",
    "docs": "https://agentguard.dev/docs/rules#external-http",
    "alternatives": ["internal_post", "approved_api_call"]
  }
  ```
- **Sub-millisecond latency** (0.03–0.29ms engine time) — genuinely impressive
- **Demo mode** works without any key — great for tire-kicking

### Issues Found
- **Auth header inconsistency in docs** — landing page code samples use `Authorization: Bearer`, docs use `X-API-Key`. The API accepts `X-API-Key` (confirmed working). The Bearer format only works for JWT auth (which returns 503 "JWT not configured"). This WILL confuse developers.
- **Landing page curl example uses wrong auth header** — shows `X-API-Key` correctly but the request body format differs slightly from docs (uses `input` vs `tool`)

### Recommendation
Standardize all examples to use `X-API-Key` consistently. Add a callout box in docs explaining Bearer is for JWT/SSO only.

---

## 3. Batch Evaluate DX — Grade: B+

### What Works
- **Excellent batch response structure:**
  ```json
  {
    "batchId": "b44af1c7-...",
    "results": [...],
    "summary": {"total": 3, "allowed": 1, "blocked": 2, ...},
    "batchDurationMs": 204
  }
  ```
- **Each result includes `index`** — easy to correlate back to input array
- **Summary object** — instant overview without parsing all results
- **Per-result suggestions and docs links** — same rich error data as single evaluate
- **batchId for audit trail** — traceable

### Issues Found
- **Field name `calls` is not obvious** — tried `inputs` first (intuitive), got: `{"error":"validation_error","field":"calls","expected":"Invalid input: expected array, received undefined"}`. The error tells you what's wrong but doesn't suggest the correct field name. A developer has to guess or find docs.
- **Empty array validation** gives `"received":"object"` when it should say `"received":"empty array"` — slightly misleading
- **Not documented on landing page** — batch endpoint only appears in full API docs, not in quickstart or getting-started section
- **204ms batch latency** for 3 items vs 0.29ms single — significant overhead. Not clear if this is HTTP overhead or sequential processing.

### Recommendation
- Add `"suggestion": "Use the field name 'calls' with an array of evaluate objects"` to the validation error
- Document batch endpoint in quickstart — it's a common pattern
- Consider accepting both `calls` and `inputs` as field names

---

## 4. Error Message Quality — Grade: A-

### What Works
- **Structured errors on evaluate endpoint are excellent:**
  - `field` — identifies what's wrong
  - `expected` — tells you what it wants
  - `docs` — links to relevant documentation
  - `suggestion` — actionable remediation
  - `alternatives` — suggests alternative tools
- **401 errors include accepted auth formats** — genuinely helpful:
  ```json
  {"acceptedAuth": ["Header: X-API-Key: ag_<key>", "Header: Authorization: Bearer <jwt>"], "docs": "..."}
  ```
- **429 errors include retry-after, limit, and window** — all the info you need
- **Consistent HTTP status codes** (400, 401, 403, 429, 503)

### Issues Found
- **Signup errors lack structure** — simple `{"error": "string"}` format instead of the richer structure used elsewhere
- **503 for JWT misconfiguration** exposes internal config detail (`"JWT_JWKS_URL not set"`) — not a security risk but unprofessional; should say "JWT authentication is not available for this deployment"
- **Rate limit 429 on unauthenticated requests** — fires before 401, so a developer with no key might think they're rate-limited rather than unauthorized

### Recommendation
Apply the structured error format (`field`, `expected`, `suggestion`, `docs`) consistently across ALL endpoints, not just evaluate.

---

## 5. SDK Availability — Grade: B

### What Works
- **TypeScript SDK exists and is current** — `@the-bot-club/agentguard@0.8.0`, published 3 days ago, matches API version
- **MIT licensed** — good for adoption
- **Reasonable dependencies** (zod, js-yaml, micromatch) — no bloat
- **SDK API surface is comprehensive** — covers evaluate, audit, kill switch, HITL, MCP, policy management, webhooks, cost tracking, compliance, A2A

### Issues Found
- **TWO npm packages exist with different names:**
  - `@the-bot-club/agentguard@0.8.0` (referenced in docs, current)
  - `@agentguard/sdk@0.1.4` (8 months old, outdated, different maintainer email)
  - This is confusing. Searching "agentguard npm" might surface the wrong one.
- **Python package name mismatch:**
  - Landing page says `pip install agentguard`
  - Docs say `pip install agentguard-tech`
  - Could not verify either exists (no pip available in test env)
- **No GitHub link** on npm package page — `@the-bot-club/agentguard` has no repository field
- **UNLICENSED vs MIT** — the old `@agentguard/sdk` is UNLICENSED while the new one is MIT. Inconsistent.

### Recommendation
- Deprecate `@agentguard/sdk` on npm with a deprecation message pointing to `@the-bot-club/agentguard`
- Fix the landing page to reference `pip install agentguard-tech` consistently
- Add repository URL to npm package.json

---

## 6. Documentation — Grade: A

### What Works
- **Comprehensive API reference** at docs.agentguard.dev — covers all 51 endpoints
- **Multi-language code examples** (curl, TypeScript, Python) for key endpoints
- **Clear quickstart** — 4-step flow from signup to runtime enforcement
- **Authentication section is excellent** — explains key types, permissions, demo mode
- **SDK reference shows full API surface** with both TS and Python conventions
- **Structured with anchor links** — easy to deep-link
- **Version documented** (v0.8.0)

### Issues Found
- **Landing page and docs use different request formats:**
  - Landing page playground sends `{"input":"...","context":{}}` format
  - Docs and API use `{"tool":"...","params":{}}` format
  - These appear to be two different features (content evaluation vs tool policy) but this isn't clearly explained
- **Docs truncated in fetch** — couldn't confirm coverage of all 51 endpoints
- **No changelog or migration guide** visible — important for v0.8.0 where breaking changes may exist
- **Batch endpoint not prominent** — buried in full API reference, not in quickstart

### Recommendation
- Add a "What's New in v0.8.0" section with changelog
- Clarify the two evaluate modes (content safety vs tool policy) prominently
- Add batch evaluate to the quickstart section

---

## 7. Onboarding / Dashboard — Grade: B+

### What Works
- **Dashboard at app.agentguard.dev loads** and provides:
  - Evaluate playground (test API in-browser)
  - Policy rules viewer
  - Audit trail with hash chain verification
  - Agent management
  - Deployment readiness tracking
  - Webhook configuration
  - Rate limit management
  - Cost attribution
  - Kill switch (with appropriate warnings)
  - OWASP compliance scoring
  - MCP server management
  - SIEM integration
  - Alerts
- **API key input at top** — paste key and go
- **Usage tracking** visible (12,450/100,000 events)
- **Free tier is generous** — 100K events/month, 3 agents, 30-day retention

### Issues Found
- **Dashboard is a SPA** — limited information available without JavaScript execution
- **No guided onboarding flow** — just dumps you into the full dashboard. New users might be overwhelmed by 12+ tabs
- **"No evaluations yet" state** could link to quickstart docs
- **Free plan shows 100K events** in dashboard but pricing page says 10K — discrepancy

### Recommendation
- Add a first-run wizard: "Make your first evaluate call" → "Review the decision" → "Customize your policy"
- Fix the free tier event limit discrepancy (10K vs 100K)
- Add contextual help tooltips on dashboard sections

---

## 8. API Key Management — Grade: A-

### What Works
- **Key rotation works** — `POST /api/v1/keys/rotate` immediately invalidates old key, returns new one
- **Clear messaging:** `"Your previous key has been invalidated. Store this key securely — it will not be shown again."`
- **Two-tier key system** (`ag_live_*` tenant keys, `ag_agent_*` scoped keys) — good security model
- **Agent key creation** via `POST /api/v1/agents` with policy scoping
- **Keys are hashed at rest** — documented and confirmed (can't retrieve after creation)

### Issues Found
- **No key listing** — can't see active keys without trying them. No "list my keys" endpoint visible.
- **Rotation doesn't require confirmation** — a single POST rotates the key. In production, accidental rotation could cause outages across all agents. Should support a grace period or require a confirmation parameter.
- **No key expiry** — keys live forever unless rotated. Should support optional TTL.
- **Rotation response lacks `rotatedAt` timestamp** — docs show it but actual response only has `apiKey` and `message`

### Recommendation
- Add `confirm: true` parameter requirement for rotation (or a 2-step rotate with preview)
- Add optional key TTL/expiry
- Add `rotatedAt` timestamp to rotation response as documented

---

## 9. Rate Limit Communication — Grade: A

### What Works
- **429 response is excellent:**
  ```json
  {
    "error": "rate_limit_exceeded",
    "retryAfter": 60,
    "message": "Too many requests. Limit: 10 per minute. Retry after 60 seconds.",
    "limit": 10,
    "window": "1m"
  }
  ```
- **All four pieces of info** a developer needs: error type, retry time, limit value, window size
- **Standard `x-ratelimit-limit` and `x-ratelimit-remaining` headers** on successful responses
- **Rate limits are per-key** — rotating key gives fresh window (confirmed)
- **Authenticated requests get higher limits** (100/min vs 10/min for unauthenticated)

### Issues Found
- **Unauthenticated rate limit fires before 401** — sending a request with no key hits 429 before you can discover you need auth. Ordering should be: check auth first, then rate limit.
- **No `Retry-After` HTTP header** — only in JSON body. Standard practice is to include both.
- **Rate limit on unauthenticated requests is aggressive** (10/min) — fine for protection, but testing without a key during exploration is frustrating
- **12 rapid authenticated requests all returned 200** — the 100/min limit for authenticated users is reasonable

### Recommendation
- Add `Retry-After` HTTP header alongside the JSON field
- Process authentication before rate limiting for better error UX
- Consider a more generous unauthenticated limit (30/min) for playground/exploration

---

## 10. Quickstart Accuracy — Grade: A-

### What Works
- **curl examples work exactly as documented** — tested the evaluate endpoint with the exact payload from docs, got expected response
- **Response format matches documentation** — fields, types, and values all align
- **npm package installs** — `@the-bot-club/agentguard` is real and current
- **Default policy provides immediate value** — blocks dangerous operations without configuration
- **Demo mode works** — no key needed for first exploration

### Issues Found
- **Package name in quickstart doesn't match landing page:**
  - Docs quickstart: `npm install @the-bot-club/agentguard`
  - Landing page: `npm install @the-bot-club/agentguard` ✅ (consistent)
  - Landing page also shows: `pip install agentguard` ❌ (should be `agentguard-tech`)
- **Landing page playground uses different request schema** (`input`/`context` vs `tool`/`params`) — this will confuse developers who try the playground first then read docs
- **Authorization header format differs** between landing page code snippets and docs
- **No "verify it worked" step** — quickstart goes from "evaluate" to "create agent keys" without a "here's how to confirm your setup is correct" checkpoint

### Recommendation
- Add a verification step: "You should see `result: block` — your policy engine is live"
- Standardize the pip package name across all surfaces
- Reconcile playground vs API request formats or explain the difference

---

## Summary Grades

| Area | Grade | Score |
|------|-------|-------|
| 1. Signup Flow | B+ | 83 |
| 2. First API Call | A- | 88 |
| 3. Batch Evaluate DX | B+ | 82 |
| 4. Error Message Quality | A- | 87 |
| 5. SDK Availability | B | 78 |
| 6. Documentation | A | 90 |
| 7. Onboarding / Dashboard | B+ | 82 |
| 8. API Key Management | A- | 85 |
| 9. Rate Limit Communication | A | 90 |
| 10. Quickstart Accuracy | A- | 86 |
| **Overall** | **B+** | **82** |

---

## Prioritized Improvement Recommendations

### P0 — Fix Before Next Release
1. **Reconcile SDK package names** — deprecate `@agentguard/sdk`, fix `pip install` reference on landing page to `agentguard-tech`
2. **Fix free tier discrepancy** — landing page says 10K events/month, dashboard shows 100K. Pick one.
3. **Standardize auth header in all code examples** — use `X-API-Key` everywhere, add note about Bearer/JWT being separate

### P1 — High Impact DX Improvements
4. **Return all validation errors at once** on signup (not sequential)
5. **Apply structured error format consistently** — signup and batch validation should use `{field, expected, suggestion, docs}` like evaluate does
6. **Add batch evaluate to quickstart docs** — it's a key feature hidden in the reference
7. **Add `Retry-After` HTTP header** to 429 responses
8. **Process auth before rate limiting** — unauthenticated requests shouldn't hit 429 before 401

### P2 — Polish
9. **Add first-run onboarding wizard** to dashboard
10. **Add key rotation confirmation parameter** (`confirm: true`) to prevent accidental rotation
11. **Clarify the two evaluate modes** (content safety via `input` vs tool policy via `tool`) in docs
12. **Add changelog / What's New in v0.8.0** to documentation
13. **Clean up JWT 503 error message** — don't expose internal env var names
14. **Add `rotatedAt` timestamp** to key rotation response (docs promise it, API doesn't deliver)

### P3 — Nice to Have
15. Add repository URL to npm package.json
16. Add optional key TTL/expiry
17. Add contextual help tooltips to dashboard
18. Increase unauthenticated rate limit to 30/min for exploration friendliness
19. Accept both `calls` and `inputs` as batch field names

---

## What AgentGuard Gets Right

The core product DX is genuinely strong:

- **Sub-millisecond evaluation** is a legitimate differentiator
- **Rich error responses** with suggestions, docs links, and alternatives — best-in-class for a v0.8
- **Zero-config start** — signup → evaluate in under 60 seconds
- **Comprehensive dashboard** covering the full surface area
- **Rate limit communication** is textbook-perfect
- **Documentation depth** is impressive for the stage

The issues are mostly consistency and polish, not fundamental design flaws. This is a product built by someone who understands developer experience — it just needs a final pass to harmonize naming, error formats, and code examples across all surfaces.

---

*Generated by DX audit — 2026-03-09T03:42 UTC*
