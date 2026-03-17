# AgentGuard v0.9.0 — Pre-Launch UX & Product Review

**Reviewer:** Vector (Senior Product Architect)  
**Date:** 2026-03-09  
**Scope:** All user-facing files before public launch  
**Status:** HOLD — 7 P0 blockers, 14 P1s, 11 P2s

---

## Executive Summary

AgentGuard is well-architected and most of the technical substance is solid. The demo, dashboard, and API are cohesive. However, there are **7 P0-level issues that will create immediate friction, confusion, or credibility damage on launch day**. The most dangerous: a license inconsistency (BSL vs Apache vs MIT claimed in three different places), stale version references in the repo README, a signup form documentation error, and two GitHub URLs that will 404 in front of press and HN commenters.

Fix the P0s before shipping. The P1s should be in the first week.

---

## Issue Index

| # | File | Priority | Issue |
|---|------|----------|-------|
| 1 | `landing/index.html` | P0 | License badge says "Apache 2.0" — actual license is BSL 1.1 |
| 2 | `README.md` | P0 | Still says v0.8.0 throughout — must say v0.9.0 |
| 3 | `docs-site/index.html` | P0 | Signup cURL example includes `"password"` field — API doesn't accept it |
| 4 | `docs/SHOW_HN_DRAFT.md` | P0 | GitHub URL is `AgentGuard-tech/agentguard` — doesn't match `0nebot` used everywhere else |
| 5 | `packages/python/agentguard/__init__.py` | P0 | `__version__ = "0.7.2"` — must be `"0.9.0"` |
| 6 | `landing/index.html` | P0 | Hero CTA says "Get Started Free →" links to `docs.agentguard.dev` — should create an account, not go to docs |
| 7 | `landing/index.html` + `self-hosted/README.md` | P0 | Free tier limits inconsistent: landing says 10K evals/month, self-hosted says 100K |
| 8 | `packages/python/README.md` | P1 | Links to `@agentguard/sdk` on npm — should be `@the-bot-club/agentguard` |
| 9 | `README.md` | P1 | CI gate action `uses: agentguard/agentguard-action@v1` — landing/docs use `agentguard-tech/validate@v1` |
| 10 | `landing/index.html` | P1 | Second CTA is "Join the waitlist / Private Beta" — conflicts with instant signup in hero |
| 11 | `about/index.html` | P1 | No ABN, no legal entity name anywhere on the about page |
| 12 | `landing/index.html` + all footers | P1 | Company footer says "AgentGuard © 2026 — Built by Hani Kashi" — no legal entity |
| 13 | `self-hosted/README.md` | P1 | Health check shows `"version":"0.7.x"` — expected response must say `0.9.0` |
| 14 | `landing/index.html` | P1 | Pricing: Pro at `$299/mo` here, but `$149/mo` in `self-hosted/README.md` |
| 15 | `landing/index.html` | P1 | OSS code snippet uses `from agentguard import guard` — incorrect import, should be `AgentGuard` |
| 16 | `docs-site/index.html` | P1 | Docs latency card says "P99 < 1ms" — this is the local engine latency, not the cloud API |
| 17 | `packages/python/README.md` | P1 | Batch evaluate example routes through `crewai_guard` — primary `AgentGuard` client doesn't expose `evaluate_batch` directly per the README |
| 18 | `landing/index.html` | P1 | `README.md` market stat says "$4.4B" but landing says "$6.34B" — pick one and cite it |
| 19 | `docs/SHOW_HN_DRAFT.md` | P1 | Post says "34 API endpoints" — should be 51 |
| 20 | `dashboard/index.html` | P2 | "Add to CI/CD" quick start card shows `${{ secrets.AG_API_KEY }}` but landing/docs use `${{ secrets.AGENTGUARD_KEY }}` |
| 21 | `landing/index.html` | P2 | Social proof stats are technical metrics ("51 API endpoints") not user trust signals |
| 22 | `about/index.html` | P2 | Advisors section is empty dashed box — risk signal pre-launch |
| 23 | `about/index.html` | P2 | Calendly link `calendly.com/agentguard/intro` — verify this exists before launch |
| 24 | `landing/index.html` | P2 | No privacy policy, terms of service, or legal links in footer |
| 25 | `about/index.html` | P2 | Timeline says "5 Compliance Templates shipped" but landing and self-hosted both say "7 policy templates" |
| 26 | `demo/index.html` | P2 | Page title is "AgentGuard — Runtime Security for AI Agents" — should match demo context more specifically |
| 27 | `packages/sdk/README.md` | P2 | GitHub URL is `koshaji/agentguard` — landing uses `0nebot` — inconsistency |
| 28 | `LICENSE` | P2 | License file still says `"Licensed Work: AgentGuard v0.7.2 and later"` — should be updated to v0.9.0 |
| 29 | `docs/LAUNCH_GUIDE.md` | P2 | Contains live PostgreSQL connection string with credentials in plaintext — security risk if file is ever in a public repo |
| 30 | `docs/LAUNCH_GUIDE.md` | P2 | Contains live Cloudflare API token in plaintext — same concern |
| 31 | `dashboard/index.html` | P2 | "Deployment" readiness nav label — slightly vague, consider "Agent Readiness" |
| 32 | `landing/index.html` | P2 | Nav "Get Started Free →" links to `docs.agentguard.dev` — should anchor to `#hero-form` |

---

## 1. Landing Page (`landing/index.html`)

### 1.1 Value Proposition Clarity — PASS ✅

Strong. "Stop deploying unsafe AI agents" + "Like container scanning, but for AI agents" lands in under 3 seconds for a CISO. The hero badge ("EU AI Act enforcement begins August 2026") adds urgency. The three-pillar structure (CI/CD gate, Runtime, Compliance trail) is clear and differentiating.

### 1.2 CTA Hierarchy — PARTIAL PASS ⚠️

The primary action ("Get Your API Key" form in the hero) is prominent and correct. However:

**P0 — Issue #6:** The main nav CTA and hero copy CTAs both say "Get Started Free →" but link to `https://docs.agentguard.dev`. Users expecting to create an account will land on the docs page instead of a signup form. This kills your conversion rate. The mobile CTA (`href="#hero-form"`) is correct — the desktop CTAs need to match.

```html
<!-- CURRENT (wrong) -->
<a href="https://docs.agentguard.dev" class="nav-cta">Get Started Free →</a>
<a href="https://docs.agentguard.dev" style="...">Get Started Free →</a>

<!-- FIX: anchor to the signup form that's already on the page -->
<a href="#hero-form" class="nav-cta">Get Started Free →</a>
<a href="#hero-form" style="...">Get Started Free →</a>
```

**P1 — Issue #10:** The second CTA section (bottom of page) says "Join the waitlist" / "Join the Private Beta →" — this directly contradicts the live instant signup in the hero. It signals the product isn't ready. Either:
- Remove the waitlist form entirely and add a second signup form (preferred), or
- Change the label to "Request a Demo" or "Talk to Sales" for enterprise.

```html
<!-- CURRENT (confusing) -->
<div class="form-card-label">Join the waitlist</div>
<h3>Request Early Access</h3>
<button>Join the Private Beta →</button>

<!-- FIX: replace with -->
<div class="form-card-label">Get Started Now</div>
<h3>Create Your Free Account</h3>
<button>Create Free Account →</button>
```

### 1.3 Social Proof — WEAK ⚠️

**P2 — Issue #21:** The social proof bar ("51 API endpoints", "TypeScript + Python SDKs", "7 policy templates") is technical spec, not social proof. Social proof = named users, companies, testimonials, or meaningful usage numbers. "50,000+ policy evaluations run" from the about page would be better here. 

The existing CISO quote is excellent — it's buried in the comparison table. Consider surfacing it or a variation near the pricing section.

No company logos, no testimonials from named users. This is expected for a v0.9.0 pre-launch, but the "Trusted by teams building AI agents" label above the trust badges creates false implied social proof. Change the label to something honest like "Built for teams that need:" or remove it entirely.

```html
<!-- CURRENT (false implied endorsement) -->
<div class="trust-badges-label">Trusted by teams building AI agents</div>

<!-- FIX -->
<div class="trust-badges-label">Built for compliance-conscious teams</div>
```

### 1.4 Pricing — CRITICAL INCONSISTENCY ⚠️

**P0 — Issue #7:** Free tier limits are inconsistent across the codebase:
- `landing/index.html` pricing: **10,000 evaluations/month**
- `self-hosted/README.md` free tier table: **100,000 events/month**

This is a P0. A user comparing self-hosted vs cloud pricing will see 10x different limits. Pick one number and apply it everywhere.

**P1 — Issue #14:** Pro tier price is **$299/mo** on the landing page but **$149/mo** in `self-hosted/README.md`. This will cause immediate confusion and potential refund demands.

```
self-hosted/README.md line 92: "Pro — $149/mo"
landing/index.html line 978: "$299/mo"
```

Fix both to match. Decision: which is correct? The `LAUNCH_GUIDE.md` says "$149/month recurring" for Stripe setup, suggesting $149 is intended. Landing page needs to be updated:

```html
<!-- CURRENT -->
<div class="pricing-price">$299<span>/mo</span></div>

<!-- FIX (if $149 is correct) -->
<div class="pricing-price">$149<span>/mo</span></div>
```

### 1.5 License Claim — BLOCKER 🚨

**P0 — Issue #1:** The OSS section badge says "Open Source Core — Apache 2.0". The actual `LICENSE` file is **Business Source License 1.1** (BSL 1.1). The SDK `package.json` and SDK README say MIT. These are three different licenses for what appears to be the same product.

This is a legal credibility issue. HN commenters will catch it immediately.

The actual situation (from LICENSE file):
- Full product: BSL 1.1 (converts to Apache 2.0 after 4 years)
- SDK packages: MIT (per package.json)

```html
<!-- CURRENT (incorrect) -->
<div class="oss-badge"><span class="oss-badge-dot"></span>Open Source Core — Apache 2.0</div>
<h2>Transparent by design.</h2>
<p>The core policy engine is open source...</p>

<!-- FIX -->
<div class="oss-badge"><span class="oss-badge-dot"></span>SDKs: MIT · Core: BSL 1.1</div>
<h2>Transparent by design.</h2>
<p>The SDK is open source under MIT. The core product is under BSL 1.1 — read it, audit it, self-host it. Enterprise use grants available.</p>
```

### 1.6 OSS Code Snippet — Incorrect API

**P1 — Issue #15:** The code snippet in the OSS section shows:

```python
from agentguard import guard

agent = guard(my_agent,
  policy="./policy.yaml"
)
```

This `guard()` function and the pattern of wrapping an agent object doesn't exist in the actual SDK. The real API is:

```python
from agentguard import AgentGuard

guard = AgentGuard(api_key="ag_your_key")
decision = guard.evaluate("tool_name", params)
```

The snippet is illustrative but will confuse developers who copy-paste it.

```html
<!-- FIX: replace the code block with accurate code -->
<div class="comment"># Add to your existing agent in 3 lines</div>
<div><span style="color:#c084fc">from</span> <span class="cmd">agentguard</span> <span style="color:#c084fc">import</span> <span class="cmd">AgentGuard</span></div>
<div>&nbsp;</div>
<div><span class="comment"># Wrap every tool call</span></div>
<div><span style="color:#fbbf24">guard</span> <span style="color:var(--text-dim)">= AgentGuard(api_key=</span><span class="str">"ag_..."</span><span style="color:var(--text-dim)">)</span></div>
<div><span style="color:#fbbf24">decision</span> <span style="color:var(--text-dim)">= guard.evaluate(</span><span class="str">"tool_name"</span><span style="color:var(--text-dim)">, params)</span></div>
<div>&nbsp;</div>
<div class="comment"># That's it. Policy enforced.</div>
<div class="comment"># Audit log running. Kill switch ready.</div>
```

### 1.7 Footer — Missing Legal 

**P1 — Issue #12:** Footer says:
```
AgentGuard © 2026 — Built by Hani Kashi · Deployment enforcement for the agentic era.
```

No legal entity name (The Bot Club Pty Ltd), no ABN, no Terms of Service link, no Privacy Policy link. For a security product targeting enterprise CISOs, this is a credibility gap. Enterprise buyers will look for legal terms before signing up.

```html
<!-- FIX -->
<div class="footer-copy">© 2026 The Bot Club Pty Ltd (ABN 99 695 980 226) t/a AgentGuard · All rights reserved</div>
<!-- and add to footer-links: -->
<a href="/legal/terms">Terms</a>
<a href="/legal/privacy">Privacy</a>
```

Note: `/legal/terms` and `/legal/privacy` pages need to exist before launch.

### 1.8 Mobile Responsiveness — PASS ✅

Responsive breakpoints at 900px and 768px look complete. The hamburger menu, single-column hero, and mobile-stacked pricing/steps grids are all handled. No obvious overflow issues.

### 1.9 Minor Issues

- The GitHub links all point to `https://github.com/thebotclub` (a personal profile), not a repo URL. Should link to `https://github.com/thebotclub/AgentGuard` or the actual repo path.
- The hero video (`agentguard-explainer.mp4?v=1`) — verify this file is deployed, or the video element will show a broken placeholder.
- `AutoGen` listed as a supported framework in the hero badge row, but it's not documented in the docs-site or SDK README integrations sections.

---

## 2. Documentation (`docs-site/index.html`)

### 2.1 Accuracy — CRITICAL ISSUE 🚨

**P0 — Issue #3:** The Quick Start section shows a signup request with a `"password"` field:

```json
// docs-site/index.html line 270 and line 693
curl -X POST https://api.agentguard.dev/api/v1/signup \
  -d '{
    "name": "My Company",
    "email": "security@acme.com",
    "password": "your-secure-password"
  }'
```

The actual `SignupRequestSchema` in `api/schemas.ts` only accepts `name` and `email`. Sending `password` won't break the call (extra fields are ignored by Zod's `.parse()` by default), but it's misleading. Developers will think they're setting a password for future login, when in fact the API uses API key auth only.

```javascript
// CORRECT schema (from api/schemas.ts)
{
  "name": "My Company",
  "email": "security@acme.com"
}
```

Fix both occurrences in `docs-site/index.html` (line ~270 and ~693) and update the prose explaining authentication.

**P1 — Issue #16:** The overview stats card says "LATENCY: P99 < 1ms". This is the local `PolicyEngine` latency, not the cloud API. The cloud API is ~200ms. This claim will cause confusion and complaint if users assume the hosted API responds in <1ms.

```html
<!-- CURRENT -->
<div style="font-size:1.1rem;font-weight:700;color:var(--green)">P99 &lt; 1ms</div>

<!-- FIX -->
<div style="font-size:1.1rem;font-weight:700;color:var(--green)">Local: P99 &lt;1ms</div>
<!-- and add a note: Cloud API: ~200ms -->
```

### 2.2 Completeness — PASS ✅

All v0.9.0 features are documented: batch evaluate (line 653), prompt injection, PII detection, OWASP compliance reports, Slack HITL, multi-agent A2A, analytics, SDK telemetry. The sidebar navigation is well-organized with NEW badges on v0.9.0 additions. The deployment enforcement section is prominently featured.

### 2.3 Code Examples Accuracy

The TypeScript and Python quick start examples look correct for the actual SDK API. The `guard.evaluateBatch()` signature in docs matches the SDK README. Batch evaluate response format (`batchId`, `results[]`, `summary`) looks internally consistent.

The cURL example in Quick Start uses `X-API-Key: ag_agent_your_agent_key_here` while the prose above it says to use your `ag_live_*` key. Minor but confusing.

```bash
# CURRENT (cURL tab uses agent key)
-H "X-API-Key: ag_agent_your_agent_key_here"

# FIX: match the prose
-H "X-API-Key: ag_live_your_key_here"
```

### 2.4 Navigation — PASS ✅

Sidebar navigation is comprehensive and logically grouped. Anchor links appear well-structured. Mobile toggle works with the hamburger button.

### 2.5 Version References — PASS ✅

Sidebar shows "v0.9.0 · docs". The stats box shows "v0.9.0". The endpoint count shows "51". All consistent.

---

## 3. Dashboard (`dashboard/index.html`)

### 3.1 Version — PASS ✅

Sidebar footer correctly shows "AgentGuard v0.9.0".

### 3.2 Navigation Coverage — PASS ✅

All expected nav items are present:
- Overview, Live Feed, Evaluate
- Governance: Agents, Deployment, Policies, Webhooks, Rate Limits
- Monitoring: Audit Trail, Costs, Kill Switch
- Insights: Analytics, Compliance, MCP Servers, Alerts
- Integrate: SDK / API
- Account: License, SIEM

This maps well to v0.9.0's feature set.

### 3.3 Onboarding — GOOD ✅

The API Key input bar at top of every page is well-designed. The cold-start warning banner ("API scaling to zero between requests, 10–15 seconds on first load") is an excellent UX touch — proactively addressing the 504 confusion that plagues cold-start APIs.

The quick-start cards (Install SDK, Add to CI/CD, Configure Policy, View Compliance) are clean and actionable.

### 3.4 Minor Issues

**P2 — Issue #20:** The "Add to CI/CD" quick start card uses `$\{{ secrets.AG_API_KEY }}` but the landing page and docs use `${{ secrets.AGENTGUARD_KEY }}`. These should match so users can copy-paste across pages.

```javascript
// CURRENT
pre id="cicd-snippet" ... "api-key: $\{{ secrets.AG_API_KEY }}"

// FIX: pick one env var name sitewide; AGENTGUARD_KEY is used more consistently elsewhere
"api-key: $\{{ secrets.AGENTGUARD_KEY }}"
```

**P2 — Issue #31:** "🚀 Deployment" in the sidebar — the page behind this is "Agent Readiness / Certification". The nav label is ambiguous. Consider "🚀 Agent Readiness" to reduce cognitive load when a user is looking for deployment enforcement features.

---

## 4. About Page (`about/index.html`)

### 4.1 Company Story — STRONG ✅

The founder story is compelling and specific. The anecdote about the financial services agent executing high-privilege operations with no audit trail is exactly the right hook for the target buyer. The "catalyst" framing is strong.

### 4.2 Team Info — PASS ✅

Founder section (Hani Kashi, "HK" avatar, LinkedIn link) is well-presented. The tags (Enterprise Security, AI Governance, etc.) are appropriate.

### 4.3 Contact Details — PASS ✅

`hello@agentguard.dev` is present. The Calendly CTA is prominent.

**P2 — Issue #23:** Verify `https://calendly.com/agentguard/intro` is live before launch. A broken Calendly link on the About page for a security product is a significant trust signal failure.

### 4.4 Legal — MISSING 🚨

**P1 — Issue #11:** No ABN, no registered company name anywhere on the About page. For an enterprise security product — especially one marketing EU AI Act compliance — the absence of a legal entity name is a credibility gap. Enterprise procurement teams check these things.

```html
<!-- ADD to footer of about/index.html -->
<div class="footer-copy">© 2026 The Bot Club Pty Ltd (ABN 99 695 980 226) t/a AgentGuard · All rights reserved</div>
```

Also add to the About hero or company info section:
```html
<p style="font-size:.82rem;color:var(--text-dim);margin-top:16px">
  AgentGuard is a registered business name of The Bot Club Pty Ltd (ABN 99 695 980 226), incorporated in Australia.
</p>
```

### 4.5 Stats — Inconsistency

**P2 — Issue #25:** About page timeline says "5 Compliance Templates Shipped" (Q1 2026 milestone) but the about stats band, landing page, and SDK README all say "7 policy templates". Either update the timeline milestone to say 7, or clarify that 5 were shipped in Q1 and 7 total exist now.

### 4.6 Advisors Section — Perception Risk

**P2 — Issue #22:** The dashed "Advisory board forming" placeholder is honest but risky. For a security product targeting enterprise CISOs, an empty advisory board section signals "very early stage company". Consider either:
- Removing the section entirely until you have advisors, or
- Replacing it with partner logos, integrations, or a "designed for enterprise" trust section.

---

## 5. Demo Page (`demo/index.html`)

### 5.1 Interactive Elements — PASS ✅

The scene-based walkthrough (5 scenes with progress bar) is well-designed. Play/pause/skip controls work. Background canvas animations add polish without overwhelming.

### 5.2 API Accuracy — PASS ✅

The demo represents the v0.9.0 API accurately. The scenarios shown (data exfil, privilege escalation, large transfer, etc.) map to realistic policy blocks. The response format shown is consistent with the actual API output.

### 5.3 Stale Examples — NONE FOUND ✅

No placeholder text or stale scenarios detected.

---

## 6. API Server (`api/server.ts`)

### 6.1 Root Endpoint — PROFESSIONAL ✅

The root `/` endpoint returns a well-structured JSON object with `name`, `version`, `status`, `endpoints`, `docs`, `dashboard`. The endpoint descriptions are clear and accurate. The `docs` URL correctly points to `https://agentguard.dev` (though `docs.agentguard.dev` would be more accurate).

```javascript
// Minor: root endpoint docs URL
docs: 'https://agentguard.dev',  // should be 'https://docs.agentguard.dev'
```

### 6.2 Error Messages — PASS ✅

The error handler middleware, CSRF, rate limiting, brute force protection, and auth middleware are all present. Error handling architecture is clean.

### 6.3 Version Strings — PASS ✅

`api/server.ts` version string (`'0.9.0'`) in the `/health` endpoint matches the dashboard and docs sidebar.

---

## 7. README Files

### 7.1 Root `README.md` — STALE 🚨

**P0 — Issue #2:** The repo README says `v0.8.0` throughout:
- Line 8: `[![Docs-v0.8.0-blue]`
- Line 17: `## What's New in v0.8.0`

This is the first thing GitHub visitors (potential users, investors, press) see. It must say v0.9.0.

```markdown
<!-- CURRENT -->
[![Docs](https://img.shields.io/badge/Docs-v0.8.0-blue)](https://docs.agentguard.dev)
## What's New in v0.8.0

<!-- FIX -->
[![Docs](https://img.shields.io/badge/Docs-v0.9.0-blue)](https://docs.agentguard.dev)
## What's New in v0.9.0
```

**P1 — Issue #9:** The CI gate action in README uses a different action reference than landing/docs:
```yaml
# README.md
uses: agentguard/agentguard-action@v1

# landing/index.html and docs-site/index.html
uses: agentguard-tech/validate@v1
```

These must match. `agentguard-tech/validate@v1` appears more current and is used in more places — use that.

```yaml
# FIX in README.md
uses: agentguard-tech/validate@v1
with:
  api-key: ${{ secrets.AGENTGUARD_KEY }}
  policy: ./policy.yaml
  fail-on-uncovered: true
```

**P1 — Issue #18:** Market stat mismatch:
- `README.md`: "**$4.4B** spent on AI security in 2025 (Gartner)"
- `about/index.html`: "**$6.34B** AI Security Market"

These cite different numbers (possibly different market definitions), but to an external reader who reads both, it looks sloppy. Pick one source/number and use it consistently across README, about page, and SHOW_HN draft.

### 7.2 `packages/sdk/README.md` — GOOD ✅

The npm page README is polished and comprehensive. Coverage of all SDK features is accurate. Code examples match the actual TypeScript API.

**P2 — Issue #27:** GitHub URL:
```markdown
- 📦 [GitHub](https://github.com/koshaji/agentguard)
```
Landing page uses `https://github.com/thebotclub` and `about/` page uses `github.com/thebotclub`. SHOW_HN uses `AgentGuard-tech/agentguard`. Decide the canonical GitHub URL and apply it everywhere. If the repo is currently private/personal, this needs to be resolved before public launch.

### 7.3 `packages/python/README.md` — ISSUES

**P1 — Issue #8:** The Links section says:
```markdown
- 📘 [npm SDK](https://www.npmjs.com/package/@agentguard/sdk)
```
The actual npm package name is `@the-bot-club/agentguard`. Fix:
```markdown
- 📘 [npm SDK](https://www.npmjs.com/package/@the-bot-club/agentguard)
```

**P1 — Issue #17:** The "Batch Evaluate" section routes through `crewai_guard`:
```python
from agentguard.integrations import crewai_guard
batch_guard = crewai_guard(api_key="ag_...")
results = batch_guard.evaluate_batch([...])
```

This is confusing. Batch evaluate should show the primary `AgentGuard` client. Per the `AgentGuard` class description, it doesn't expose `evaluate_batch()` directly — only through integration wrappers. This is a product design gap. Either:
1. Add `evaluate_batch()` to the core `AgentGuard` client (recommended), or
2. Document clearly that batch eval is available via integration wrappers

For the README, at minimum add a clarifying note and show the direct `crewai_guard` API with proper framing. The Python README also lacks a direct batch example for the core `AgentGuard` class.

---

## 8. SDK Content

### 8.1 TypeScript SDK (`packages/sdk/src/`) — PASS ✅

Clean export structure. All major classes exported from root `index.ts`:
- `PolicyEngine`, `AuditLogger`, `KillSwitch` (from core)
- `AgentGuard`, `AgentGuardToolWrapper` (from sdk)
- All framework integrations: `langchainGuard`, `openaiGuard`, `crewaiGuard`, `expressMiddleware`, `fastifyMiddleware`
- `AgentGuardBlockError`
- `autoRegister` utilities

No unexported classes found. `LocalPolicyEngine` is exported (distinct from core `PolicyEngine` — cloud-backed vs local).

The SDK `package.json` has `"version": "0.9.0"` — correct.

### 8.2 Python Package (`packages/python/agentguard/`) — STALE VERSION 🚨

**P0 — Issue #5:** `packages/python/agentguard/__init__.py` contains:
```python
__version__ = "0.7.2"
```

The `pyproject.toml` correctly says `version = "0.9.0"`. But the `__version__` attribute in the package itself (which shows when users run `import agentguard; print(agentguard.__version__)`) says 0.7.2. This is confusing for users and will cause version check tooling to report the wrong version.

```python
# FIX: packages/python/agentguard/__init__.py line 3
__version__ = "0.9.0"
```

Also note: `__init__.py` only exports `AgentGuard` and `AgentGuardBlockError`. The README's `from agentguard.integrations import langchain_guard` pattern requires the user to import from the submodule — which is fine, but could be noted with a comment in `__init__.py` for discoverability.

**P2 — Issue #28 (License file):** `LICENSE` says:
```
Licensed Work: AgentGuard v0.7.2 and later
```
Should be updated to `v0.9.0 and later`.

---

## 9. Self-Hosted (`self-hosted/`)

### 9.1 README — MOSTLY GOOD

The self-hosted setup guide is clear, actionable, and well-structured. Prerequisites are explicit. The step-by-step flow is correct. Troubleshooting section is practical.

**P1 — Issue #13:** The expected health check response in Step 4 shows:
```json
{"status":"ok","version":"0.7.x","db":"connected","redis":"connected"}
```

The actual `/health` endpoint returns (from `api/server.ts`):
```json
{"status":"ok","version":"0.9.0"}
```

It does NOT include `"db"` and `"redis"` keys, and `"version":"0.7.x"` is both wrong and confusing (not a real version string). Update the expected response:

```markdown
Expected response:
```json
{"status":"ok","version":"0.9.0"}
```
```

**P0 / P1 — Issue #7 (reprise):** Free tier table says:
```
| API evaluation events | 100,000 / month |
```
Landing page says 10,000/month for the free tier. The self-hosted free tier being 10x more generous than the cloud tier is actually a reasonable positioning decision (self-hosted = more generous to encourage adoption), but it must be called out explicitly. Currently users comparing the two have no context for why the numbers differ.

Consider adding a note:
```markdown
> **Self-hosted free tier is more generous than cloud free tier.** On self-hosted, you own the infrastructure so we don't meter usage the same way.
```

**P1 — Issue #14 (reprise):** Pro pricing:
```
Pro — $149/mo
```
Landing page says $299/mo. Fix one or the other.

### 9.2 `.env.example` — PASS ✅

Clean and minimal. Only two variables documented:
- `AGENTGUARD_LICENSE_KEY` — with clear explanation
- `PG_PASSWORD` — with strong warning

Appropriate for a self-hosted setup file. The `DATABASE_URL` and `REDIS_URL` are auto-constructed by docker-compose and correctly noted as "auto-set" in the README configuration reference.

### 9.3 Docker Compose — PASS ✅

Solid. Health checks are configured for all three services (agentguard, postgres, redis). `depends_on` uses `condition: service_healthy`. Image pinned to `ghcr.io/0nebot/agentguard:latest`. Named volumes are defined. Redis configured with `--appendonly yes` for persistence.

Minor: `agentguard-data:/data` volume is mounted but not discussed in the "Persistent data" section of the README. Add it:
```markdown
- `agentguard-data` — Application data (license cache, config, SQLite fallback if Postgres unavailable)
```

---

## 10. Strategic Docs

### 10.1 `docs/SHOW_HN_DRAFT.md` — NOT READY 🚨

**P0 — Issue #4:** GitHub URL in the post:
```
GitHub: https://github.com/thebotclub/AgentGuard
```
Landing page uses `github.com/thebotclub`. SDK READMEs use `github.com/koshaji/agentguard`. `about/` uses `github.com/thebotclub`. The Show HN post has a completely different URL. HN users will check this URL immediately. A 404 on the GitHub link in your Show HN post is a credibility killer.

Decide on one canonical GitHub URL before posting. Options:
- `https://github.com/koshaji/agentguard` (existing personal repo)
- Create a new org `AgentGuard-tech` and transfer
- Create `0nebot/agentguard` org and keep it there

**P1 — Issue #19:** Post text says:
> "The whole thing is 34 API endpoints running on Express + PostgreSQL."

Must be updated to 51. The endpoint count is a trust signal.

```markdown
<!-- CURRENT -->
The whole thing is 34 API endpoints running on Express + PostgreSQL.

<!-- FIX -->
The whole thing is 51 API endpoints running on Express + PostgreSQL.
```

Other notes on the post:
- The three enforcement points are clearly explained — good
- The CLI example (`npx @the-bot-club/agentguard validate .`) looks correct
- "Free to use" framing is consistent with the free tier

### 10.2 `docs/LAUNCH_GUIDE.md` — ACCURATE BUT SECURITY RISK

**P2 — Issue #29:** The LAUNCH_GUIDE contains a live production PostgreSQL connection string including credentials:
```
postgresql://agentguardadmin:AG_Secure_a4b7e2c9f1d3@agentguard-db.postgres.database.azure.com:5432/agentguard?sslmode=require
```

**P2 — Issue #30:** It also contains a live Cloudflare API token:
```
iY1YHCutQQrlmnxpV9fwQCbhjafN3xFcb54Z9G0s
```

The LAUNCH_GUIDE is in the `docs/` folder. If this repo ever becomes public (per the guide's own Step 7: "Make GitHub Repo Public"), these credentials will be exposed. Before making the repo public:
1. Rotate the database password
2. Rotate the Cloudflare token  
3. Remove or redact both from `LAUNCH_GUIDE.md`

The guide itself is accurate and well-structured. The revenue path, incorporation advice, and Stripe setup steps are clear.

---

## Summary: Fixes Required Before Launch

### P0 — Fix Before Shipping (7 issues)

| # | File | Fix |
|---|------|-----|
| 1 | `landing/index.html` | Change "Apache 2.0" badge to "SDKs: MIT · Core: BSL 1.1" |
| 2 | `README.md` | Update all v0.8.0 references to v0.9.0 |
| 3 | `docs-site/index.html` | Remove `"password"` field from signup cURL examples (2 occurrences) |
| 4 | `docs/SHOW_HN_DRAFT.md` | Fix GitHub URL to match canonical URL |
| 5 | `packages/python/agentguard/__init__.py` | Change `__version__ = "0.7.2"` to `"0.9.0"` |
| 6 | `landing/index.html` | Change nav and hero "Get Started Free →" links from `docs.agentguard.dev` to `#hero-form` |
| 7 | `landing/index.html` + `self-hosted/README.md` | Align free tier eval limits (10K vs 100K) and Pro pricing ($149 vs $299) |

### P1 — Fix This Week (7 issues)

| # | File | Fix |
|---|------|-----|
| 8 | `packages/python/README.md` | Fix npm link from `@agentguard/sdk` to `@the-bot-club/agentguard` |
| 9 | `README.md` | Change CI action from `agentguard/agentguard-action@v1` to `agentguard-tech/validate@v1` |
| 10 | `landing/index.html` | Change second form from "waitlist/private beta" to live signup |
| 11 | `about/index.html` | Add ABN and legal entity name |
| 12 | All footers | Add "The Bot Club Pty Ltd (ABN 99 695 980 226)" to copyright |
| 13 | `self-hosted/README.md` | Fix expected health check response (version and fields) |
| 14 | `landing/index.html` | Fix market stat — $4.4B (README) vs $6.34B (about page) — pick one |
| 15 | `landing/index.html` | Fix OSS code snippet to use real AgentGuard API |
| 16 | `docs-site/index.html` | Clarify "P99 < 1ms" is local engine, not cloud API latency |
| 17 | `packages/python/README.md` | Batch evaluate section — route through core client not crewai_guard |
| 18 | `docs/SHOW_HN_DRAFT.md` | Update "34 API endpoints" to "51 API endpoints" |
| 19 | `docs-site/index.html` | cURL Quick Start uses `ag_agent_*` key — fix to `ag_live_*` |

### P2 — Nice to Have (11 issues)

| # | File | Fix |
|---|------|-----|
| 20 | `dashboard/index.html` | Align CI secret name `AG_API_KEY` vs `AGENTGUARD_KEY` |
| 21 | `landing/index.html` | Replace "Trusted by teams" with honest trust signal label |
| 22 | `about/index.html` | Remove or replace empty advisors section |
| 23 | `about/index.html` | Verify Calendly link is live before launch |
| 24 | `landing/index.html` | Add Privacy Policy and Terms links to footer |
| 25 | `about/index.html` | Align compliance template count (5 vs 7) |
| 26 | `landing/index.html` | GitHub "View on GitHub" links to personal profile, not repo |
| 27 | `packages/sdk/README.md` | Align GitHub URL with canonical |
| 28 | `LICENSE` | Update "v0.7.2" to "v0.9.0" in Licensed Work line |
| 29 | `docs/LAUNCH_GUIDE.md` | Redact live DB credentials before repo goes public |
| 30 | `docs/LAUNCH_GUIDE.md` | Redact live Cloudflare token before repo goes public |
| 31 | `dashboard/index.html` | Rename "Deployment" nav item to "Agent Readiness" |
| 32 | `landing/index.html` | Fix nav CTA `href` to `#hero-form`, not `docs.agentguard.dev` (duplicate of P0 #6) |

---

## What's Working Well

- **The product narrative is excellent.** "Like container scanning, but for AI agents" is a perfect one-liner. The comparison table (Before/After AgentGuard) is one of the best-designed argument structures I've reviewed.
- **Technical depth is real.** The API, SDK, and docs are internally consistent and genuinely functional. This isn't vaporware — the product exists.
- **The dashboard is polished.** Mobile-responsive, cold-start warning, full feature coverage. An enterprise buyer will be impressed.
- **The CISO quote** ("I have 200 agents deployed across 6 departments...") is devastating and accurate. Keep it, move it higher.
- **Self-hosted setup is genuinely easy.** 4 commands, working Docker Compose, sensible defaults.
- **Docs sidebar navigation** is comprehensive and well-organized. The endpoint table format is professional.
- **Security architecture** (CORS allowlist, helmet, brute force protection, request IDs, trust proxy config) is enterprise-grade. A security-savvy reviewer will notice and appreciate it.

---

*Review generated by Vector — 2026-03-09*
*Time to fix all P0s: ~2 hours. Time to fix P0s + P1s: ~4-6 hours.*
