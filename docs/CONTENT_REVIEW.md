# AgentGuard v0.9.0 — Content Review
**Reviewed by:** Senior Content Strategist  
**Date:** 2026-03-09  
**Scope:** All user-facing copy across landing page, about page, docs, READMEs, API messages, and Show HN draft.

---

## Summary

| Priority | Count | Status |
|----------|-------|--------|
| P0 (Blocking — factually wrong, legal risk, broken links) | 13 | ❌ Fix before launch |
| P1 (High — brand inconsistency, wrong pricing, misleading claims) | 12 | ⚠️ Fix before launch |
| P2 (Medium — polish, clarity, minor inaccuracies) | 9 | 📝 Fix soon after launch |

---

## P0 — BLOCKING (Fix Before Launch)

---

### [1] `landing/index.html` — Line 38–39: Wrong pricing in JSON-LD structured data
**File:** `landing/index.html`  
**Lines:** 38–39  
**Current:**
```json
{ "@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "USD", "description": "10,000 evaluations/month, 2 agent keys, 5 compliance templates" },
{ "@type": "Offer", "name": "Pro", "price": "299", "priceCurrency": "USD", "description": "1M evaluations/month, unlimited agents, webhooks, dashboard" }
```
**Recommended:**
```json
{ "@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "USD", "description": "100,000 evaluations/month, 3 agent seats, 7 compliance templates" },
{ "@type": "Offer", "name": "Pro", "price": "149", "priceCurrency": "USD", "description": "500,000 evaluations/month, unlimited agents, webhooks, dashboard" },
{ "@type": "Offer", "name": "Enterprise", "price": "499", "priceCurrency": "USD", "description": "Custom evaluations, dedicated support, on-prem option" }
```
**Priority:** P0 — Structured data is indexed by Google. Wrong price ($299 vs $149) and wrong free tier (10K vs 100K) will mislead potential customers who see the rich snippet before they even click.

---

### [2] `landing/index.html` — Lines 962–990: Wrong pricing in visible pricing cards
**File:** `landing/index.html`  
**Lines:** ~963, 976, 980  
**Current:**
- Free tier: `10,000 evaluations/month` and `1 tenant key + 2 agent keys`
- Pro price: `$299<span>/mo</span>`
- Pro volume: `1M evaluations/month`

**Recommended:**
- Free tier: `100,000 evaluations/month` and `1 tenant key + 3 agent seats`
- Pro price: `$149<span>/mo</span>`
- Pro volume: `500,000 evaluations/month`
- Enterprise: Add explicit `$499/mo` or keep `Contact Sales` — confirm with Hani

**Priority:** P0 — Visible pricing is wrong. Customers will pay $149 and see $299 on the page. This creates refund requests, support load, and legal exposure.

---

### [3] `landing/index.html` — Line 1020: License badge contradicts LICENSE file
**File:** `landing/index.html`  
**Line:** 1020  
**Current:**
```html
<div class="oss-badge"><span class="oss-badge-dot"></span>Open Source Core — Apache 2.0</div>
```
**Recommended:**
```html
<div class="oss-badge"><span class="oss-badge-dot"></span>Open Source Core — BSL 1.1</div>
```
**Priority:** P0 — The root `README.md` explicitly states `Business Source License 1.1`. Apache 2.0 is a materially different license. Claiming Apache 2.0 on the landing page when the actual license is BSL 1.1 is legally misleading and will cause serious friction with open-source-conscious enterprise buyers. The landing page body copy ("Read it. Audit it. Fork it.") should also be reviewed against actual BSL 1.1 terms.

---

### [4] `packages/sdk/README.md` — Line 537: Wrong GitHub org URL
**File:** `packages/sdk/README.md`  
**Line:** 537  
**Current:**
```markdown
- 📦 [GitHub](https://github.com/koshaji/agentguard)
```
**Recommended:**
```markdown
- 📦 [GitHub](https://github.com/0nebot/agentguard)
```
**Priority:** P0 — This IS the npm page. Every developer who installs the package sees this. `koshaji` is the personal GitHub (Hani's handle), not the org. The org is `0nebot` (zero not O). Wrong link on npm = broken trust for developers.

---

### [5] `packages/sdk/README.md` — Line 542: Wrong license (MIT vs BSL 1.1)
**File:** `packages/sdk/README.md`  
**Line:** 542  
**Current:**
```markdown
## License
MIT
```
**Recommended:**
```markdown
## License
[Business Source License 1.1](https://github.com/0nebot/agentguard/blob/main/LICENSE)
```
**Priority:** P0 — npm page shows MIT. Actual license is BSL 1.1. This is a legal misrepresentation. Enterprise legal teams will immediately flag this as misrepresentation and reject the vendor. Also update the badge on line 6 from `License-MIT` to `License-BSL_1.1`.

---

### [6] `packages/python/README.md` — Line 548: Wrong GitHub org URL
**File:** `packages/python/README.md`  
**Line:** 548  
**Current:**
```markdown
- 📦 [GitHub](https://github.com/koshaji/agentguard)
```
**Recommended:**
```markdown
- 📦 [GitHub](https://github.com/0nebot/agentguard)
```
**Priority:** P0 — This IS the PyPI page. Same issue as npm page above.

---

### [7] `packages/python/README.md` — Line 549: Wrong npm package reference
**File:** `packages/python/README.md`  
**Line:** 549  
**Current:**
```markdown
- 📘 [npm SDK](https://www.npmjs.com/package/@agentguard/sdk)
```
**Recommended:**
```markdown
- 📘 [npm SDK](https://www.npmjs.com/package/@the-bot-club/agentguard)
```
**Priority:** P0 — Points to a non-existent npm package (`@agentguard/sdk` doesn't exist — the real package is `@the-bot-club/agentguard`). Any Python developer who sees this and tries to set up the TypeScript SDK side-by-side gets a 404 from npm.

---

### [8] `packages/python/README.md` — Line 553: Wrong license (MIT vs BSL 1.1)
**File:** `packages/python/README.md`  
**Line:** 553  
**Current:**
```markdown
## License
MIT
```
**Recommended:**
```markdown
## License
[Business Source License 1.1](https://github.com/0nebot/agentguard/blob/main/LICENSE)
```
**Priority:** P0 — Same legal issue as npm SDK README. Also update the badge on line 7.

---

### [9] `docs/SHOW_HN_DRAFT.md` — Line 41: Wrong GitHub org URL
**File:** `docs/SHOW_HN_DRAFT.md`  
**Line:** 41  
**Current:**
```
GitHub: https://github.com/AgentGuard-tech/agentguard
```
**Recommended:**
```
GitHub: https://github.com/0nebot/agentguard
```
**Priority:** P0 — If this is posted as-is, the link is broken. HN readers who try to star/fork the repo get a 404. This kills launch momentum — you only get one shot at Show HN.

---

### [10] `docs/SHOW_HN_DRAFT.md` — Line 36: Stale endpoint count (34 vs 51)
**File:** `docs/SHOW_HN_DRAFT.md`  
**Line:** 36  
**Current:**
```
The whole thing is 34 API endpoints running on Express + PostgreSQL.
```
**Recommended:**
```
The whole thing is 51 API endpoints running on Express + PostgreSQL.
```
**Priority:** P0 — The actual v0.9.0 count is 51 (confirmed in API server, docs, and README). Publishing 34 on HN when the docs and site say 51 looks inconsistent and raises credibility questions in the comments — which is exactly where you don't want that fight.

---

### [11] `README.md` — Lines 8, 17: Version mismatch (v0.8.0 in badge and heading)
**File:** `README.md`  
**Line 8 (badge):**
```markdown
<a href="https://docs.agentguard.tech"><img src="https://img.shields.io/badge/Docs-v0.8.0-blue"></a>
```
**Line 17 (section heading):**
```markdown
## What's New in v0.8.0
```
**Recommended (line 8):**
```markdown
<a href="https://docs.agentguard.tech"><img src="https://img.shields.io/badge/Docs-v0.9.0-blue"></a>
```
**Recommended (line 17):**
```markdown
## What's New in v0.9.0
```
**Priority:** P0 — GitHub README is the first thing developers see. Docs badge and section heading both say v0.8.0 while the launch is v0.9.0. Looks like the README was never updated for this release — undermines trust immediately.

---

### [12] `README.md` — Line 96: Wrong GitHub Action reference
**File:** `README.md`  
**Line:** 96  
**Current:**
```yaml
uses: agentguard/agentguard-action@v1
```
**Recommended:**
```yaml
uses: agentguard-tech/validate@v1
```
**Priority:** P0 — The docs-site (which is accurate per the brief) uses `agentguard-tech/validate@v1`. The README uses a different, incorrect reference (`agentguard/agentguard-action@v1`). Developers copy-paste from README. This broken Action reference will fail immediately in CI — a terrible first experience.

---

### [13] `self-hosted/README.md` — Line 60: Health check shows wrong version
**File:** `self-hosted/README.md`  
**Line:** 60  
**Current:**
```json
{"status":"ok","version":"0.7.x","db":"connected","redis":"connected"}
```
**Recommended:**
```json
{"status":"ok","version":"0.9.0","db":"connected","redis":"connected"}
```
**Priority:** P0 — Self-hosted users run the health check as instructed. If the actual server returns `0.9.0` and the docs say to expect `0.7.x`, users think something is wrong with their install. This triggers unnecessary support tickets immediately post-launch.

---

## P1 — HIGH (Fix Before Launch)

---

### [14] All footers: Missing legal entity name and ABN
**Files:**  
- `landing/index.html` line 1098  
- `about/index.html` line 473  
- `docs-site/index.html` line 2807  

**Current (all three):**
```html
<div class="footer-copy">AgentGuard © 2026 — Built by <a href="...">Hani Kashi</a> · ...</div>
```
**Recommended:**
```html
<div class="footer-copy">© 2026 The Bot Club Pty Ltd. ABN 99 695 980 226. Trading as AgentGuard.</div>
```
**Priority:** P1 — The ABN is required for Australian businesses in customer-facing materials, especially for enterprise buyers (who will check it). The current footer omits the legal entity entirely. The `about/index.html` body text correctly references the ABN and legal name, but the footer across all three pages fails to include it.

---

### [15] `landing/index.html` — Line 686: Wrong GitHub Action reference in CI example
**File:** `landing/index.html`  
**Line:** ~686  
**Current:**
```
- uses: agentguard-tech/validate@v1
```
This one is actually **correct** — matches the docs. No change needed here.  
**Note for cross-reference:** Ensure this stays consistent with the README fix (finding #12 above).

---

### [16] `packages/sdk/README.md` — Lines 195+: `AgentGuardToolWrapper` API is incorrect
**File:** `packages/sdk/README.md`  
**Lines:** ~456–478  
**Current:**
```typescript
const wrapper = new AgentGuardToolWrapper(engine, auditLogger, killSwitch, agentContext);
const guardedTool = wrapper.wrap(emailTool);
```
**Recommended:**
```typescript
const guardedTool = AgentGuardToolWrapper.wrap(emailTool, {
  engine,
  apiKey: 'ag_...',
  agentId: 'my-agent',
});
```
**Priority:** P1 — The actual implementation (`packages/sdk/src/sdk/langchain-wrapper.ts`) exports `AgentGuardToolWrapper` as a plain object with a `.wrap()` static method, NOT a class constructor. The README shows `new AgentGuardToolWrapper(...)` which will throw `TypeError: AgentGuardToolWrapper is not a constructor` at runtime. Any developer following this example gets an immediate error.

---

### [17] `packages/sdk/README.md` — `killSwitch()` method name mismatch
**File:** `packages/sdk/README.md`  
**Lines:** ~53–58 and API reference table (~line 505)  
**Current:**
```typescript
await guard.killSwitch(true);
await guard.killSwitch(false);
```
API table shows: `killSwitch(active)` — Activate or deactivate global kill switch

**Check required:** Verify against `packages/sdk/src/sdk/client.ts` whether the actual method is `killSwitch()` or `setKillSwitch()`. The docs-site (`docs-site/index.html`) uses `guard.setKillSwitch(true)` in the SDK reference section.

**Recommended:** Align the SDK README to use the same method name as the docs-site (likely `setKillSwitch`). Whichever is correct, they must match.
**Priority:** P1 — One of these references is wrong. Developers copying from npm page or docs-site will get `TypeError: guard.killSwitch is not a function` or `guard.setKillSwitch is not a function`.

---

### [18] `packages/sdk/README.md` — Webhook event names inconsistent with API
**File:** `packages/sdk/README.md`  
**Lines:** ~59–67  
**Current:**
```typescript
events: ['action.blocked', 'killswitch.activated'],
```
**Recommended:**
```typescript
events: ['block', 'killswitch'],
```
**Priority:** P1 — The docs-site (`docs-site/index.html` webhook section) and the `api/server.ts` consistently use `block`, `killswitch`, and `hitl` as event type strings — not `action.blocked` / `killswitch.activated`. Developers using the npm page example will create webhooks that never fire.

---

### [19] `packages/python/README.md` — Webhook event names inconsistent with API
**File:** `packages/python/README.md`  
**Lines:** ~161–167  
**Current:**
```python
events=["action.blocked", "killswitch.activated"],
```
**Recommended:**
```python
events=["block", "killswitch"],
```
**Priority:** P1 — Same issue as finding #18. PyPI page shows wrong event names.

---

### [20] `README.md` — Line 96 GitHub Action params are wrong
**File:** `README.md`  
**Lines:** 94–99  
**Current:**
```yaml
uses: agentguard/agentguard-action@v1
with:
  api-key: ${{ secrets.AGENTGUARD_API_KEY }}
  tools: [database_query, http_post, shell_exec]
  fail-on: block
```
**Recommended:**
```yaml
uses: agentguard-tech/validate@v1
with:
  api-key: ${{ secrets.AGENTGUARD_API_KEY }}
  path: './src/agents'
  threshold: '85'
  fail-on: 'high'
```
**Priority:** P1 — In addition to the wrong action name (covered in P0 finding #12), the parameters shown (`tools`, `fail-on: block`) don't match the actual GitHub Action parameters documented in `docs-site/index.html` (`path`, `threshold`, `fail-on: high`, etc.).

---

### [21] `about/index.html` — Footer missing ABN (see finding #14)
Already captured in finding #14 above.

---

### [22] `landing/index.html` line 1020: "Apache 2.0" vs BSL 1.1 in OSS section body copy
**File:** `landing/index.html`  
**Lines:** 1022–1025  
**Current:**
```html
<p>The core policy engine is open source. Read it. Audit it. Fork it. Enterprise features...</p>
```
**Note:** The badge says "Apache 2.0" (P0 finding #3). The body copy says "open source" and implies fork rights that may not be available under BSL 1.1. After fixing the badge to BSL 1.1, review and soften this copy to accurately reflect BSL restrictions (e.g., production use by competing services is restricted). Suggested:

```html
<p>The core policy engine is source-available under BSL 1.1. Read it. Audit it. Contribute to it. Enterprise features...</p>
```
**Priority:** P1 — "Fork it" implies permissive open-source rights that BSL 1.1 explicitly restricts for competing services. This is a legal accuracy issue.

---

### [23] `docs/SHOW_HN_DRAFT.md` — No version mentioned, description of features slightly stale
**File:** `docs/SHOW_HN_DRAFT.md`  
**Lines:** 12–36  
**Current:** Does not mention v0.9.0 anywhere. Lists 3 enforcement points but doesn't mention PII detection, OWASP reports, Slack HITL, or multi-agent features — all of which are strong v0.9.0 differentiators.

**Recommended:** Add version context and at least one or two v0.9.0 features. Suggested addition after the 3 enforcement points:

```
v0.9.0 also adds prompt injection detection (heuristic + Lakera adapter), PII detection and redaction, OWASP Agentic Top 10 compliance reports generated from your live audit trail, and Slack HITL for one-click approval routing.
```
**Priority:** P1 — HN launch copy should showcase the latest capabilities. The current draft undersells v0.9.0.

---

### [24] `landing/index.html` — Enterprise pricing card shows "Contact Sales" not "$499/mo"
**File:** `landing/index.html`  
**Lines:** ~993–1010  
**Current:** `<div class="pricing-price">Contact Sales</div>` — no dollar figure.  
**Note:** The brief states Enterprise is $499/mo. If this is the public price, it should show on the card. If it's genuinely "contact us for pricing", the brief needs to be clarified.

**Recommended (if $499/mo is the actual public price):**
```html
<div class="pricing-price">$499<span>/mo</span></div>
```
**Priority:** P1 — Inconsistency between brief and visible page. Needs resolution before launch.

---

### [25] `about/index.html` — Stat on stats band: "50K+" evaluations (likely stale)
**File:** `about/index.html`  
**Lines:** ~stats-band section  
**Current:** `<div class="stat-number">50<span>K+</span></div>` with label "Policy evaluations run"  
**Note:** Timeline on the same page says "50,000+ evaluations" was crossed as a milestone in Q1 2026, but this is now the "About" page at launch in March 2026 — the number will be stale on day one of launch if real evaluations have occurred since then. If this is a real live stat, make it dynamic. If it's a marketing claim, use a more modest figure that won't look embarrassing.  
**Priority:** P1 — Stale vanity metrics undermine credibility. Either pull from the real API or replace with a general claim like "100K+ evaluations processed in testing."

---

## P2 — MEDIUM (Fix Soon After Launch)

---

### [26] `README.md` — Missing PyPI link / quick install for Python
**File:** `README.md`  
**Lines:** ~SDKs section  
**Current:**
```bash
# Python  
pip install agentguard-tech
```
No link to PyPI. The npm package links to npmjs.com but there's no equivalent PyPI badge or link.  
**Recommended:** Add a PyPI badge alongside the npm badge at the top, and link the install command text:
```markdown
[![PyPI version](https://img.shields.io/pypi/v/agentguard-tech)](https://pypi.org/project/agentguard-tech/)
```
**Priority:** P2 — Not blocking, but Python developers deserve the same treatment as Node.js developers. PyPI page is confirmed as `agentguard-tech`.

---

### [27] `docs-site/index.html` — `scanPII` SDK call uses `text` field, docs say `content`
**File:** `docs-site/index.html`  
**Lines:** PII Detection SDK example (TypeScript section)  
**Current:**
```typescript
await guard.scanPII({ text, policy: 'redact' });
```
**Recommended:**
```typescript
await guard.scanPII({ content: text, mode: 'redact' });
```
**Note:** The PII endpoint documentation (`POST /api/v1/pii/scan`) specifies `content` as the primary field (with `text` accepted for backwards compatibility) and `mode` (not `policy`) for the operation mode. The SDK method call example is inconsistent with the endpoint docs.  
**Priority:** P2 — Functional (the API accepts `text` for backwards compat), but the SDK example should model best practice and use the canonical field names.

---

### [28] `docs-site/index.html` — `submitFeedback` example uses numeric rating, field type says string
**File:** `docs-site/index.html`  
**Lines:** SDK installation section, Python example  
**Current (TypeScript SDK example):**
```typescript
await guard.submitFeedback({ evaluationId: 'evt_...', rating: 5, comment: 'Accurate block' });
```
**Current (Feedback endpoint docs):**
```
rating: "positive" | "negative"
```
The SDK example passes `rating: 5` (a number) but the API field reference says `rating` accepts `"positive"` or `"negative"` (strings). These are contradictory.  
**Recommended (SDK example):**
```typescript
await guard.submitFeedback({ evaluationId: 'evt_...', rating: 'positive', comment: 'Accurate block' });
```
**Priority:** P2 — The example will cause a schema validation error at runtime if the API enforces the string type.

---

### [29] `packages/sdk/README.md` — `setRateLimit` vs `createRateLimit` method name
**File:** `packages/sdk/README.md`  
**Lines:** ~107–113 (Rate Limits section), and ~508 (API reference table shows `setRateLimit`)  
**Current:** README uses `guard.setRateLimit()` but the docs-site SDK reference uses `guard.createRateLimit()`.  
**Recommended:** Verify which method name exists in the SDK source and align both documents. The docs-site should be treated as the authoritative reference.  
**Priority:** P2 — Minor naming inconsistency that will cause a runtime error for developers who use the wrong name.

---

### [30] `packages/sdk/README.md` — `getDashboardFeed({ since: ... })` inconsistent with docs-site
**File:** `packages/sdk/README.md`  
**Lines:** ~147–153  
**Current:**
```typescript
const recent = await guard.getDashboardFeed({ since: '2024-06-01T00:00:00Z' });
```
The docs-site shows `getDashboardFeed({ limit })` only — no `since` parameter in the endpoint definition.  
**Recommended:** Remove the `since` param example if the endpoint doesn't support it, or add it to the docs-site endpoint definition if it does.  
**Priority:** P2 — `since` is either undocumented or non-existent. Either way it's inconsistent.

---

### [31] `about/index.html` — Timeline item: "5 Compliance Templates Shipped" but 7 exist
**File:** `about/index.html`  
**Lines:** Q1 2026 compliance timeline item  
**Current:** "5 Compliance Templates Shipped" with description listing 5 templates (EU AI Act, APRA, SOC 2, OWASP, ISO 42001)  
**Discrepancy:** The policy templates table in `docs-site/index.html` shows 7 templates (including `financial-services` and `customer-service` / `code-agent` beyond the 5 listed).  
**Recommended:** Update timeline to "7 Compliance Templates Shipped" or harmonise the template count across all properties.  
**Priority:** P2 — Minor but the inconsistency (5 vs 7) will be caught by detail-oriented readers.

---

### [32] `docs-site/index.html` — Self-hosted free tier callout correct but slightly inconsistent with `self-hosted/README.md`
**File:** `docs-site/index.html`  
**Lines:** Self-hosted section callout  
**Current:**
```
Free tier included. Self-hosted is free for up to 100,000 evaluation events/month with 3 agent seats.
```
`self-hosted/README.md` correctly shows the same: 100K events, 3 seats. ✅ These match — no change needed.

---

### [33] `landing/index.html` — Hero subheadline mentions "~200ms cloud API" which contradicts docs  
**File:** `landing/index.html`  
**Lines:** ~7 (meta description), and `README.md` line listing cloud latency  
**Current (meta description):**
```
...sub-millisecond local enforcement • ~200ms cloud API...
```
**Current (README.md technical specs table):**
```
Latency (cloud) | ~200ms
```
**Note:** The docs-site prominently features `P99 < 1ms` with no cloud qualification. The "~200ms cloud API" claim is in the meta description and README table. This isn't wrong per se (cloud adds network latency), but "P99 < 1ms" in the hero and "~200ms cloud" buried in meta creates a mixed message.  
**Recommended:** Be explicit: "< 1ms local · < 200ms cloud API" rather than mixing the two without context.  
**Priority:** P2 — Potential trust issue if a sophisticated buyer compares the meta description to the docs hero.

---

### [34] `docs-site/index.html` — Footer missing ABN (already captured in P1 finding #14)
Already captured in finding #14.

---

## Summary of Changes by File

| File | P0 Issues | P1 Issues | P2 Issues |
|------|-----------|-----------|-----------|
| `landing/index.html` | 3 (#1, #2, #3) | 2 (#22, #24) | 1 (#33) |
| `about/index.html` | 0 | 1 (#14) | 1 (#31) |
| `docs-site/index.html` | 0 | 1 (#14) | 2 (#27, #28) |
| `README.md` | 2 (#11, #12) | 1 (#20) | 1 (#26) |
| `packages/sdk/README.md` | 2 (#4, #5) | 3 (#16, #17, #18) | 2 (#29, #30) |
| `packages/python/README.md` | 3 (#6, #7, #8) | 1 (#19) | 0 |
| `self-hosted/README.md` | 1 (#13) | 0 | 0 |
| `docs/SHOW_HN_DRAFT.md` | 2 (#9, #10) | 1 (#23) | 0 |
| `api/server.ts` | 0 | 0 | 0 |

**`api/server.ts`:** Root endpoint and error messages are professional and version-correct (v0.9.0). No issues found.

---

## Quick Wins (Do These First)

These fixes take < 5 minutes each and eliminate the most dangerous issues:

1. **Pricing JSON-LD** (#1) — edit 2 lines of structured data
2. **Visible pricing** (#2) — change 3 numbers: 10,000→100,000, $299→$149, 1M→500K
3. **GitHub links** (#4, #6, #9) — find/replace `koshaji` → `0nebot`, `AgentGuard-tech` → `0nebot`
4. **License badges** (#5, #8) — change MIT → BSL 1.1 in both SDK READMEs
5. **README version** (#11) — change v0.8.0 → v0.9.0 (2 occurrences)
6. **Wrong npm package** (#7) — change `@agentguard/sdk` → `@the-bot-club/agentguard`
7. **HN endpoint count** (#10) — change 34 → 51
8. **Self-hosted version** (#13) — change 0.7.x → 0.9.0 in health check example

---

*Content review complete. Total review covered: landing/index.html, about/index.html, docs-site/index.html, README.md, packages/sdk/README.md, packages/python/README.md, self-hosted/README.md, api/server.ts, docs/SHOW_HN_DRAFT.md.*
