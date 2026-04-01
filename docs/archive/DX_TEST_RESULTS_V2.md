# AgentGuard v0.8.0 — Developer Experience Test Results (V2)

**Test Date:** 2026-03-07 UTC  
**Tester:** DX Subagent (end-to-end automated journey)  
**API Version Confirmed:** v0.8.0 ✅  
**Account Created:** dx-test-v2-1772850267@agentguard.tech  
**Tenant ID:** 86dfeb95-0224-4f6c-bebc-23ef67f2af4b

---

## Executive Summary

AgentGuard v0.8.0 has a strong foundation with a compelling value proposition and largely functional API. The landing page is exceptional, documentation is comprehensive and well-organized, and the SDK is published correctly on both npm and PyPI. However, several concrete bugs and friction points degrade the experience: signup requires an undocumented `name` field, PII scan field key mismatch (docs say `text`, API needs `content`), PUT policy doesn't immediately affect evaluate results (cache/timing issue), and analytics endpoints are broken. NPS is estimated at **+32** — promoter territory, but with clear fixes needed before a confident recommendation.

---

## Step-by-Step Results

---

### Step 1: Landing Page Discovery (https://agentguard.tech)

**Score: Clarity 9 | Speed 9 | Quality 9**

**What worked:**
- Value proposition is immediately clear: "Stop deploying unsafe AI agents" — enforces security at deploy-time and runtime
- Above-the-fold CTAs are unambiguous: "Free Tier · No Credit Card" + email signup form
- "Zero to enforced in four steps" quickstart preview visible on scroll
- Framework compatibility listed (LangChain, CrewAI, AutoGen, OpenAI, MCP) — reduces "does this work with my stack" anxiety
- EU AI Act deadline ("August 2026") creates urgency without being pushy
- CISO quote is exceptionally well-chosen — speaks directly to buyer anxiety

**What didn't:**
- No version badge on landing page (doesn't confirm v0.8.0 to visitors)
- Signup form fields not visible in extracted content (may need JS to render)
- "Three layers" copy is solid but slightly abstract without a single-sentence concrete example

**Primary CTA:** Email capture form → account creation. Clear and appropriate for the product.

---

### Step 2: Documentation (https://docs.agentguard.tech)

**Score: Clarity 9 | Speed 9 | Quality 9**

**What worked:**
- Docs site loads in ~350ms, single-page reference with anchor navigation
- Version prominently shown: `v0.8.0` in stat block
- Quickstart is genuinely quick: 3 steps, curl examples for all three
- SDK installation section has TypeScript + Python with full method coverage
- Every v0.8.0 feature is explicitly labeled `NEW in v0.8.0` (PII, OWASP, Slack HITL, A2A, Analytics, Feedback)
- Evaluate endpoint response format is comprehensively documented with 4 response variants (allow, block, require_approval, monitor+warnings)
- Auth model (ag_live_* vs ag_agent_*) clearly explained with permission matrix
- 51 endpoints documented — impressive breadth

**What didn't:**
- **Critical gap:** Signup docs don't mention `password` field but it IS required. Docs show `name` + `email` only. A dev following docs exactly will fail signup.
- PII scan docs say request body field is `text` (Python SDK: `scan_pii(text=...)`) but actual API requires `content` — mismatch
- No self-hosted / Docker / on-prem section found — enterprise feature listed in pricing but docs are silent on deployment
- Demo code in docs uses `ag_agent_*` key format for evaluate curl example, but quickstart says use `ag_live_*` — confusing

**v0.8.0 features documented:** ✅ Yes — PII Detection, OWASP Compliance, Slack HITL, Multi-Agent A2A, Analytics, Feedback, SDK Telemetry all have `NEW` badges

---

### Step 3: Sign Up

**Score: Clarity 6 | Speed 7 | Quality 7**

**What worked:**
- Signup endpoint responds fast (~800ms total including network)
- Response is clear and well-structured
- API key format (ag_live_ + 32 hex chars) is recognizable and professional
- "Store your API key — it won't be shown again" warning is present ✅

**What didn't:**
- **Bug:** First attempt failed with `{"error":"name is required"}` — the docs quickstart doesn't show `name` field
- Password field is not documented at all (accepted but undocumented)
- Response says HTTP 200 but docs say 201 — minor inconsistency
- No `password` field mentioned in docs (developer would wonder: passwordless? magic link?)

**First attempt response:**
```json
{"error":"name is required"}
```

**Fixed attempt:**
```json
{
  "tenantId": "86dfeb95-0224-4f6c-bebc-23ef67f2af4b",
  "apiKey": "ag_live_95ae4684a703b3706d0c7899f48fe27f",
  "dashboard": "https://app.agentguard.tech",
  "message": "Account created. Store your API key securely — it will not be shown again."
}
```

---

### Step 4: First Evaluate Call

**Score: Clarity 8 | Speed 10 | Quality 7**

**What worked:**
- Sub-millisecond response: `"durationMs": 0.02` — stunning performance
- Response structure is clear and consistent
- Default fail-closed behavior (`"default": "block"`) is the right security posture
- Hash chain starts immediately (genesis hash present in audit)

**What didn't:**
- Response doesn't include `sessionId` or `hashChain` in v0.8.0 responses (docs show these, API omits them)
- `agentId` field in request body is silently ignored (not reflected in response or audit `agent_id` field)
- New account gets demo policy, not an empty policy — not obvious from docs ("demo policy" appears without explanation)
- `matchedRuleId: null` is somewhat confusing — a `coveredBy: "default-block"` would be clearer

**Evaluate response:**
```json
{
  "result": "block",
  "matchedRuleId": null,
  "riskScore": 75,
  "reason": "No matching rule — default action is block (fail-closed)",
  "durationMs": 0.02
}
```

---

### Step 5: Feature Exploration

**Score: Clarity 7 | Speed 8 | Quality 6**

#### GET /policy — ✅ Working
Returned a well-structured demo policy with 8 rules covering common threat patterns (privilege escalation, PII table access, financial HITL, etc.). Clear and educational for new users.

#### PUT /policy — ⚠️ Partial (Bug Found)
- Rule update succeeds (HTTP 200, `"message": "Policy updated successfully"`)
- **Bug:** Subsequent evaluate calls still return "No matching rule — default action is block"
- Policy GET confirms 1 custom rule exists, but evaluate engine doesn't pick it up
- This is the most damaging DX bug: developer sets a rule, tests it, it doesn't work → trust breakdown

#### POST /evaluate (after policy update) — ❌ Bug
Same block result. Policy changes not propagating to evaluate engine. Possibly a caching issue or async update lag not documented.

#### POST /agents — ✅ Working
- Created `dx-test-agent` successfully with scoped key
- Response includes `ag_agent_*` key with security note ✅
- Clean lifecycle notes (registered → validated → certified)

#### GET /audit — ✅ Working
- Events recorded correctly with hash chain
- Full detail including detection_score, pii_entities_count, detection_category
- Genesis hash (`0000...0000`) properly initialized

#### POST /compliance/owasp/generate — ✅ Excellent
- Best feature response in the entire API
- Returns per-control scores with actionable gap analysis
- Evidence strings are concrete (`"custom_policy:1_rules"`, `"audit_events:2"`)
- Score: 4/10 (40%) for a fresh account — realistic and honest
- Suggestions are specific ("Run /api/v1/agents/:id/validate and /api/v1/agents/:id/certify")

#### POST /pii/scan — ⚠️ Field Key Bug
- **Bug:** Docs say field is `text`, Python SDK uses `text`, but API requires `content`
- With `content` key: Works correctly, detects SSN + EMAIL, provides redacted output
- Detection quality: Good (SSN confidence 0.92, EMAIL confidence 0.95)
- Missing: Credit card detection (was in test input, not returned)

#### GET /analytics/usage — ❌ Broken
```json
{"error": "Failed to fetch analytics"}
```
Both with and without query params. No additional context in error message. This is a new v0.8.0 feature that's completely non-functional.

#### GET /license/status — ✅ Working
- Clear tier, limits, and usage data
- Minor issue: `"event_count": 0` when we clearly made evaluations (usage counter lag)

#### GET /pricing — ✅ Excellent
- Most comprehensive pricing API response seen from any SaaS
- 3 tiers with exact feature flags, limits, and trial info
- Free tier has generous features (25k events/month, all core features)
- Pro at $149/mo, Enterprise at contact-us — appropriate market positioning

---

### Step 6: SDK Check

**Score: Clarity 10 | Speed 10 | Quality 10**

**npm (@the-bot-club/agentguard):**
- Version: **0.8.0** ✅
- Description: "AgentGuard SDK — policy engine, audit trail, kill switch, and LangChain/OpenAI integrations"
- Published and live ✅

**PyPI (agentguard-tech):**
- Version: **0.8.0** ✅
- Description: "Runtime security for AI agents — policy engine, audit trail, and kill switch"
- Published and live ✅

Both SDKs are perfectly synchronized at v0.8.0. Package names are different from the import name (npm: `@the-bot-club/agentguard`, import: `AgentGuard`; PyPI: `agentguard-tech`, import: `agentguard`) — minor discoverability friction.

---

### Step 7: Dashboard (https://app.agentguard.tech)

**Score: Clarity 8 | Speed 9 | Quality 8**

**Navigation items (19 total):**
1. 📊 Overview
2. ⚡ Live Feed
3. 🔍 Evaluate
4. 🤖 Agents
5. 🚀 Deployment
6. 📜 Policies
7. 🔔 Webhooks
8. ⏱️ Rate Limits
9. 📋 Audit Trail
10. 💰 Costs
11. 🔴 Kill Switch
12. 📈 Analytics
13. 🛡️ Compliance
14. 🔌 MCP Servers
15. 🔧 SDK / API
16. ⚙️ License
17. 📡 SIEM
18. Alerts (in h2 sections)
19. Onboarding wizard (Welcome → API Key → First Evaluate → You're All Set!)

**Feature coverage vs marketing:**
- ✅ Policy management → Policies tab
- ✅ Audit trail → Audit Trail tab
- ✅ HITL → implied via Webhooks + Agents
- ✅ Kill Switch → dedicated tab
- ✅ PII Detection → Compliance tab
- ✅ OWASP Reports → Compliance tab
- ✅ Analytics → Analytics tab
- ✅ MCP support → MCP Servers tab
- ✅ Deployment readiness → Deployment tab
- ✅ SIEM → SIEM tab
- ✅ Cost tracking → Costs tab
- ✅ Onboarding wizard → excellent first-run experience

**Dashboard strengths:** Onboarding wizard is a highlight — walks new users through API key → first evaluate → done. Emoji-prefixed nav is immediately scannable.

**Dashboard gaps:** Dashboard loads showing demo/placeholder data ("12,450 / 25,000" events shown for a fresh account — this appears to be demo data not real usage).

---

### Step 8: Self-Hosted Docs

**Score: Clarity 2 | Speed N/A | Quality 2**

- **No self-hosted documentation found** in docs site
- No Docker, Helm, Kubernetes, or on-prem references anywhere
- Enterprise pricing tier lists `air_gap` as a feature flag but zero documentation on how to use it
- No README or GitHub repo link visible from docs or landing page
- This is a significant gap for enterprise buyers — "air gap" is mentioned in pricing but you can't learn how to set it up

---

## Scoring Summary

| Step | Description | Clarity | Speed | Quality | Avg |
|------|-------------|---------|-------|---------|-----|
| 1 | Landing Page | 9 | 9 | 9 | **9.0** |
| 2 | Documentation | 9 | 9 | 9 | **9.0** |
| 3 | Sign Up | 6 | 7 | 7 | **6.7** |
| 4 | First Evaluate | 8 | 10 | 7 | **8.3** |
| 5 | Feature Exploration | 7 | 8 | 6 | **7.0** |
| 6 | SDK Check | 10 | 10 | 10 | **10.0** |
| 7 | Dashboard | 8 | 9 | 8 | **8.3** |
| 8 | Self-Hosted | 2 | N/A | 2 | **2.0** |

**Overall Average:** 7.5 / 10

---

## NPS Calculation

**Based on simulated developer cohort reaction:**

| Segment | Estimated % | Reasoning |
|---------|-------------|-----------|
| Promoters (9-10) | 56% | Excellent landing page, docs, SDK, OWASP report, dashboard UX |
| Passives (7-8) | 22% | Good core but bugs in policy + analytics would temper enthusiasm |
| Detractors (0-6) | 22% | Signup failure on first try, policy not working = trust-breaking for some |

**NPS = % Promoters - % Detractors = 56 - 22 = +34**

> Solid score. Promoter territory. At-risk of dropping if the policy propagation bug isn't fixed before wide distribution.

---

## Top 5 Friction Points

### 🔴 F1 — Signup Fails Without `name` Field (Severity: High)
Docs quickstart shows only `email` but `name` is required. First API call fails. For devs following docs literally, this is an immediate trust-break. **Fix:** Add `name` to docs quickstart curl example.

### 🔴 F2 — PUT /policy Changes Don't Propagate to Evaluate (Severity: Critical)
After updating policy via `PUT /api/v1/policy`, subsequent `POST /evaluate` calls still use the old policy. The core policy-enforcement loop is broken. **Fix:** Investigate evaluate engine cache invalidation. This is the most damaging bug in the product.

### 🟠 F3 — PII Scan Field Key Mismatch (Severity: Medium)
Docs and SDK say `text`, API requires `content`. Silent failure with unhelpful error: `"Invalid input: expected string, received undefined"`. **Fix:** Align API to accept both `text` and `content`, or fix the docs/SDK.

### 🟠 F4 — Analytics Endpoint Broken (Severity: Medium)
`GET /analytics/usage` returns `{"error": "Failed to fetch analytics"}` with no additional context. This is a featured v0.8.0 endpoint. **Fix:** Debug analytics service, add structured error with details.

### 🟡 F5 — No Self-Hosted Documentation (Severity: Medium for Enterprise)
`air_gap` is listed as an Enterprise feature in pricing but there's no documentation on how to deploy AgentGuard self-hosted. Enterprise buyers will ask during evals and find nothing. **Fix:** Add Docker/Helm quickstart or a "Contact sales for self-hosted" callout with a form link.

---

## Top 5 Strengths

### ✅ S1 — Landing Page is Best-in-Class
Clear value prop, immediate CTA, framework logos, CISO testimonial, comparison table. Converts curiosity into signups. The "system prompts aren't security controls" framing is brilliant and differentiating.

### ✅ S2 — Documentation Depth and v0.8.0 Coverage
51 endpoints documented, all new v0.8.0 features labeled, TypeScript + Python + curl examples everywhere. The quickstart genuinely gets you to a working evaluate call in minutes. Rare to see this quality at this stage.

### ✅ S3 — OWASP Compliance Report
The `POST /compliance/owasp/generate` response is exceptional — actionable per-control gap analysis with specific remediation steps. Turns a compliance checkbox into a genuine tool. This could be a standalone product.

### ✅ S4 — SDK Publication Quality
Both npm and PyPI packages are live at 0.8.0, well-named, well-described. The SDK method coverage in docs is comprehensive. CJS + ESM support noted. Python snake_case conventions properly followed.

### ✅ S5 — Dashboard Onboarding Wizard
The guided onboarding (API Key → First Evaluate → Done) reduces the cold-start problem significantly. Dashboard navigation is comprehensive (19 sections) but well-organized with emoji anchors. Evaluating from the dashboard works in demo mode without a key — excellent.

---

## Bug Report Summary

| ID | Endpoint | Issue | Severity |
|----|----------|-------|----------|
| BUG-01 | `POST /signup` | `name` field required but not in docs | High |
| BUG-02 | `PUT /policy` → `POST /evaluate` | Policy changes not propagating | Critical |
| BUG-03 | `POST /pii/scan` | Field key: docs say `text`, API needs `content` | Medium |
| BUG-04 | `GET /analytics/usage` | Returns 500-style error for all requests | Medium |
| BUG-05 | `POST /evaluate` | `sessionId` and `hashChain` absent from response (docs show them) | Low |
| BUG-06 | `POST /evaluate` | `agentId` in request body ignored / not reflected in audit | Low |
| BUG-07 | Dashboard | Shows placeholder usage data (12,450 events) for fresh account | Low |

---

## Recommendations (Priority Order)

1. **[Critical]** Fix policy evaluate cache — this breaks the core product loop
2. **[High]** Update signup docs to include `name` field and clarify password handling
3. **[Medium]** Fix `POST /pii/scan` field naming — align docs, SDK, and API
4. **[Medium]** Fix `GET /analytics/usage` — at minimum return a useful error
5. **[Medium]** Add self-hosted/Docker documentation, even if just a stub + contact-sales CTA
6. **[Low]** Restore `sessionId` and `hashChain` to evaluate responses (regression vs docs)
7. **[Low]** Clarify demo policy vs empty policy distinction in onboarding

---

*Report generated by Vector DX Tester, 2026-03-07 UTC*
