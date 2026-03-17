# AgentGuard UX Review
**Reviewer:** Senior UX Designer / Frontend Engineer (subagent)  
**Date:** 2026-03-01  
**Scope:** Landing page, Dashboard, API surface — source files + live deployments  
**Live URLs tested:**
- Landing: https://agentguard-landing.greenrock-adeab1b0.australiaeast.azurecontainerapps.io/
- Dashboard: https://agentguard-dashboard.greenrock-adeab1b0.australiaeast.azurecontainerapps.io/
- API: https://agentguard-api.greenrock-adeab1b0.australiaeast.azurecontainerapps.io/

---

## Executive Summary

AgentGuard's landing page is **notably strong** for an early-stage product — the messaging is sharp, the demo section is genuinely impressive, and the visual design is competent. The dashboard is functional but thin. The critical issues are largely in **trust infrastructure** (broken forms, dead links, fake social proof), **accessibility** (multiple WCAG AA failures, near-zero ARIA support), and **functional bugs** (the stat counter is wrong, the kill switch is client-only theatre, the form submission cannot work as written). Fix the critical and high items before showing this to enterprise prospects.

**Overall grades:**
| Area | Grade | Notes |
|---|---|---|
| Messaging / Copy | A- | Sharp, specific, believable |
| Visual Design | B+ | Polished dark theme, consistent tokens |
| Demo / Playground | A- | Real API working is a differentiator |
| Form UX | D | Broken submission mechanism |
| Accessibility | D | Multiple WCAG failures |
| Mobile / Responsive | C | Sidebar disappears, no mobile nav |
| Trust Signals | C- | All logos are placeholders |
| Dashboard Functionality | C | Several bugs, purely client-side state |
| Performance | B | Fast load, but no caching headers |
| Security Headers | F | No CSP, no HSTS, no X-Frame-Options |

---

## Findings

---

### 🔴 CRITICAL

---

#### [CRITICAL-01] Form submission mechanism is broken — emails will never be received
**File:** `landing/index.html` lines 723, 1144  
**Section:** Hero form, CTA2 form

Both beta signup forms have `action="mailto:hello@agentguard.dev"` as the form action. The JavaScript `handleForm()` function then does `fetch(formEl.action, {...})` — which attempts an AJAX POST to a `mailto:` URI. This will throw a network error in every browser. The `form-error` div will show, but the error message ("Something went wrong. Please try again.") is misleading — the form is fundamentally broken.

Even if JavaScript is disabled and the browser falls back to native form submission, `method="POST"` with a `mailto:` action doesn't open a mail client in modern browsers — it's undefined behavior.

**The `_next` hidden field points to** `https://agentguard.dev/landing/thankyou.html`, which appears to be a FormSpree-style redirect convention, but no FormSpree endpoint is wired up.

**Impact:** You are collecting zero beta signups. Every visitor who fills out your form sees an error. This is the most critical bug in the entire product.

**Recommendation:** Replace `action="mailto:..."` with a real endpoint. Options in order of preference:
1. Wire up a FormSpree endpoint: `action="https://formspree.io/f/YOUR_ID"` — free tier handles this
2. Add a `/api/beta-signup` endpoint to the existing Express API (already deployed)
3. Use a Netlify Forms / Vercel Forms equivalent

Also: add client-side success state that doesn't depend on server redirect (already partially implemented with `form-success` div — just wire it to an actual response).

---

#### [CRITICAL-02] Kill switch is pure client-side theatre — no API integration
**File:** `dashboard/index.html` lines 472–479, 598–607  
**Section:** Kill Switch page

The kill switch toggle only sets a local `killActive` boolean. When active, the `doEvaluate()` function returns a **fake client-side block** without ever calling the API. This means:

1. Opening a second browser tab/window bypasses it entirely
2. A real agent calling `POST /api/v1/evaluate` directly would not be blocked
3. The "All agents blocked" status is false — the API continues accepting requests
4. For a product selling security to CISOs, presenting fake security controls is a reputation-destroying liability

**Evidence:** Line 472: `if (killActive) { const fakeResult = { decision: { result:'block', ... } }; renderResult(fakeResult...); return; }` — the real API is never called.

**Recommendation:** Implement `POST /api/v1/admin/kill-switch` on the backend that sets a persisted flag (Redis or in-memory with process-level scope). The evaluate endpoint checks this flag first. The dashboard calls the real endpoint and shows real state. Until this is implemented, **remove the kill switch UI entirely** or label it clearly as "Demo mode — not production-connected."

---

#### [CRITICAL-03] GitHub link returns 404 — breaks core trust signal
**File:** `landing/index.html` lines 1059, 1184  
**Section:** OSS section, Footer

The GitHub link `https://github.com/koshaji/agentguard` returns HTTP 404. This is linked in the OSS section ("Star on GitHub") and the footer. For a product whose entire trust proposition includes "Open Source Core — Apache 2.0" and "Security tools you can't read are security theatre. We're not that," a broken GitHub link is catastrophic.

A prospect who clicks this immediately thinks: either the repo doesn't exist (you're not actually open source), the repo is private (you lied), or you don't test your own links (you're careless). None of these is good.

**Recommendation:** Create the public GitHub repo immediately, or remove all open-source claims and the GitHub links until it exists.

---

#### [CRITICAL-04] LinkedIn footer link points to agentguard.dev — wrong URL
**File:** `landing/index.html` line 1185  
**Section:** Footer

```html
<a href="https://agentguard.dev">LinkedIn</a>
```

The "LinkedIn" link goes to `https://agentguard.dev` (which is actually a live domain, returning 200). This is either a copy-paste error or a placeholder never updated. Users clicking "LinkedIn" expecting a company page will hit the marketing site — which is confusing and undermines trust.

**Recommendation:** Replace with the actual LinkedIn company page URL, or remove the link until it exists.

---

#### [CRITICAL-05] No security headers — critical for a security product
**File:** Server configuration (nginx/Express)  
**Detected via:** HTTP response header inspection

Both the landing page and dashboard return zero security headers:
- No `Content-Security-Policy` 
- No `X-Frame-Options` (or `frame-ancestors` CSP) — clickjacking vulnerability
- No `X-Content-Type-Options: nosniff`
- No `Strict-Transport-Security`
- No `Referrer-Policy`
- The API returns `access-control-allow-origin: *` — overly permissive for a security product

A product selling runtime security to enterprises that has no security headers on its own web properties is a talking point for every competitor. This will be noticed by technical buyers immediately.

**Recommendation:** Add these headers at the nginx level:
```nginx
add_header X-Frame-Options "DENY";
add_header X-Content-Type-Options "nosniff";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;";
```

Restrict API CORS to known origins rather than `*`.

---

### 🟠 HIGH

---

#### [HIGH-01] Primary CTA button fails WCAG AA contrast (barely)
**File:** `landing/index.html` line 215, `dashboard/index.html` line 66  
**Section:** All primary buttons  
**Contrast ratio measured:** 4.47:1 (AA requires 4.5:1)

`background: #6366f1` (accent) with `color: #fff` (white) yields **4.47:1 contrast ratio** — 0.03 below the WCAG AA threshold of 4.5:1 for normal text. The hover state (`#4f52c8`) passes at 6.23:1.

This is the most-clicked element on the entire landing page. Failing WCAG AA on your primary CTA is a legal exposure for enterprise customers in regulated industries (the exact customers you're targeting with EU AI Act messaging).

**Recommendation:** Darken the base accent by ~5%: `#5254d4` yields ~5.1:1. Or lighten the button text to `#f0f0ff`. Easiest fix: just use the hover color as the default.

---

#### [HIGH-02] "Blocked" stat counter is wrong — off-by-logic bug
**File:** `dashboard/index.html` lines 533–545  
**Section:** Overview stats, Evaluate page

```javascript
// The 'blocked' variable is computed correctly but NEVER used:
let allowed = 0, blocked = 0;
allEvents.forEach(e => { 
  if(e.result==='allow') allowed++; 
  else if(e.result==='block') blocked++;  // <-- tracked but ignored
});
...
// The stat uses this instead:
document.getElementById('stat-blocked').textContent = allEvents.length - allowed;
// This means: 'monitor' and 'require_approval' events count as "Blocked"
```

When a user runs a `llm_query` that results in `monitor`, the Blocked counter increments. The correctly-computed `blocked` variable is computed and immediately discarded. This is a simple variable name collision masked by the wrong computation being used.

Additionally: the landing page playground `stat-flagged` counter tracks `monitor` results separately — the dashboard collapses them all into "blocked", making the two surfaces inconsistent.

**Recommendation:**
```javascript
document.getElementById('stat-blocked').textContent = blocked; // use the correct variable
```
Add a "Flagged/Monitored" stat card to the dashboard for consistency with the landing playground.

---

#### [HIGH-03] Social proof logos are naked placeholders — actively harmful
**File:** `landing/index.html` lines 778–781  
**Section:** Social proof bar

```html
<div class="logo-placeholder">Financial Services</div>
<div class="logo-placeholder">Healthcare AI</div>
<div class="logo-placeholder">Legal Tech</div>
<div class="logo-placeholder">Enterprise SaaS</div>
```

These are styled as grey pill badges reading generic industry names. Any technical or enterprise buyer will immediately recognize these as placeholders — they look like wireframe assets that were never replaced. Combined with the "Design partners from" label, this implies you have design partners from these industries when you may not. This is both a trust killer and a potential misrepresentation.

**Recommendation:** Three options, in order of preference:
1. Get even one real design partner logo and display only that with permission
2. Replace with an honest statement: "Building design partnerships in finance, healthcare, and legal tech"
3. Remove this entire section until you have real logos

---

#### [HIGH-04] Dashboard sidebar disappears on mobile — no replacement navigation
**File:** `dashboard/index.html` line 113  
**Section:** Responsive CSS

```css
@media (max-width:900px) {
  .app { grid-template-columns:1fr; }
  .sidebar { display:none; }  /* ← sidebar just vanishes */
}
```

On mobile and tablet, the entire sidebar navigation disappears with no hamburger menu, no bottom nav, no drawer — nothing. The dashboard becomes completely un-navigable on any screen under 900px wide. No touch targets exist. The main content area renders but with no way to navigate between pages.

**Recommendation:** Implement a mobile navigation pattern. Minimum viable: a hamburger button in the mobile header that toggles sidebar visibility. Better: a bottom tab bar for the 6 primary nav items. The sidebar's `position:sticky` with `height:100vh` is also problematic on mobile (causes scroll issues).

---

#### [HIGH-05] Form submits to broken `mailto:` endpoint with misleading error UX
*(Already covered in CRITICAL-01 for the breakage itself)*

**Additional UX issue:** When the fetch fails (which it always does), the error message shown is:  
> "Something went wrong. Please try again."

This tells the user it's a temporary error and to retry — but there is no retry that will work. Users will fill out the form multiple times, see the error, and leave frustrated or conclude the site is broken. Given the high-intent of a beta signup form, this error messaging compounds the harm of the broken endpoint.

**Recommendation:** Once the endpoint is fixed, the error message should be specific: "We couldn't send your request. Please email us directly at hello@agentguard.dev or try again."

---

#### [HIGH-06] API URL inconsistency — landing and dashboard use raw Azure URLs, SDK docs show custom domain
**File:** `landing/index.html` line 1264, `dashboard/index.html` line 389  
**Section:** JavaScript API configuration

The playground and dashboard hardcode the raw Azure Container Apps URL:
```javascript
const API_BASE = 'https://agentguard-api.greenrock-adeab1b0.australiaeast.azurecontainerapps.io';
```

But the SDK documentation section (both landing and dashboard) shows:
```
POST https://api.agentguard.dev/api/v1/evaluate
```

`api.agentguard.dev` returns **HTTP 404** (tested). So the custom domain shown in all the "copy this to integrate" code snippets doesn't work. A developer who copies the cURL example and runs it gets a 404.

**Recommendation:** Either point `api.agentguard.dev` DNS to the Azure container, or update all documentation to use the working Azure URL. The inconsistency is especially damaging in the cURL/SDK tab which exists specifically for "here's how you integrate this."

---

#### [HIGH-07] No favicon — amateurish browser tab experience
**File:** `landing/index.html`, `dashboard/index.html`  
**Section:** `<head>`

Neither HTML file has a `<link rel="icon">` tag. Browser tabs show a blank page icon. This is immediately noticeable in any multi-tab workflow (which is every enterprise user's workflow).

**Recommendation:** Add a minimal SVG favicon using the shield emoji concept:
```html
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛡</text></svg>">
```
Or generate a proper ICO/PNG favicon from the logo mark.

---

### 🟡 MEDIUM

---

#### [MEDIUM-01] Audit trail hash is `Math.random()` — actively misleading
**File:** `dashboard/index.html` line 539  
**Section:** Audit Trail page

```javascript
hash: Math.random().toString(36).slice(2,10)
```

The audit trail column displays "Hash" with these random strings. The header copy says "Hash-chained · Tamper-evident" — but the hashes are generated with `Math.random()`, have no relationship to the event data, are not chained, and would be different every page reload. Displaying this to a security professional or auditor who examines it will destroy credibility immediately.

**Recommendation:** Either implement real SHA-256 chaining using the Web Crypto API (not hard), or remove the "Hash" column and the "Hash-chained · Tamper-evident" claim from the dashboard until it's real. The landing page's audit trail description is fine since it says "real events from this session" — but the dashboard implies it's a production audit system.

---

#### [MEDIUM-02] Near-zero accessibility implementation across both pages
**File:** Both files  
**Section:** Global

Comprehensive ARIA audit findings:
- Only **one** `aria-label` attribute exists across both files (`<nav aria-label="Main navigation">` in the landing)
- Dashboard sidebar buttons have no `aria-current="page"` for active state
- Tab panels have no `role="tablist"`, `role="tab"`, `role="tabpanel"`, or `aria-selected` 
- Modal/dialog-style kill switch confirmation has no focus trap
- Form errors (`form-error` div) have no `aria-live="polite"` — screen readers won't announce errors
- The live feed section should be `aria-live="polite"` or `"assertive"` for real-time updates
- Icon-only emoji buttons (`▶ Evaluate Action`, `🔴 Kill Switch`) have no accessible names beyond emoji
- No skip-to-main-content link on either page
- Interactive playground textarea and inputs in the demo section have no associated `aria-describedby` for context

**Recommendation (priority order):**
1. Add `aria-live="polite"` to `form-error` divs (one-line fix, high impact)
2. Add `aria-current="page"` to active nav items
3. Add proper ARIA tab semantics to demo tab bar
4. Add skip link: `<a href="#main" class="skip-link">Skip to main content</a>`
5. Full audit pass with axe-core before any enterprise launch

---

#### [MEDIUM-03] Footer contrast failures — text is nearly invisible
**File:** `landing/index.html` lines 608–618  
**Section:** Footer

```css
.footer-copy { color: #3a3a5a; }  /* 1.80:1 contrast on #0a0a1a bg — WCAG FAIL */
.footer-links a { color: #4a4a6a; } /* 2.31:1 contrast — WCAG FAIL */
```

The footer copyright text (`#3a3a5a` on `#0a0a1a`) has a contrast ratio of **1.80:1** — less than half the 4.5:1 minimum. The footer links are **2.31:1** — also failing. These are not invisible, but will be genuinely hard to read in any non-ideal viewing condition (bright room, low-quality display, vision impairment).

Additionally, `#4a4a6a` is used for the "Design partners from" label in the social proof section — same failure.

**Recommendation:** Raise footer colors to at minimum `#6b7280` (gray-500 equivalent):
```css
.footer-copy { color: #6b7280; }  /* ~4.6:1 contrast — passes */
.footer-links a { color: #6b7280; }
```

---

#### [MEDIUM-04] Form trust text uses `::before { content: '🔒' }` pseudo-element — inaccessible
**File:** `landing/index.html` line 286  
**Section:** Form card trust indicator

```css
.form-trust::before { content: '🔒'; font-size: 0.75rem; }
```

The lock emoji is injected via CSS pseudo-element. Screen readers may or may not read CSS `content` (behavior is inconsistent across readers). The text "No spam. Early access + agent security research only" is functional — but the color (`#4a4a6a` on `#111128`) is **2.18:1 contrast**, failing WCAG AA.

**Recommendation:** Move the emoji into the HTML: `<span aria-hidden="true">🔒</span> No spam...`. Fix the color to at least `#6b7280`.

---

#### [MEDIUM-05] Dashboard showPage() relies on deprecated `window.event` pattern
**File:** `dashboard/index.html` line 452  
**Section:** Navigation JS

```javascript
function showPage(id) {
  ...
  event.target.closest('.nav-item')?.classList.add('active');
  // 'event' here is the implicit window.event — not a parameter
}
```

The function signature is `showPage(id)` but it accesses `event.target` without receiving the event as a parameter. This relies on the deprecated `window.event` global. It works in Chrome/Edge but may fail in Firefox or future browsers. More importantly, the `?.classList` optional chaining means silent failures — the active state on the nav item won't update if `event.target` resolves incorrectly (e.g., when called programmatically or from a keyboard shortcut).

**Recommendation:**
```javascript
function showPage(id, evt) {
  ...
  evt?.target.closest('.nav-item')?.classList.add('active');
}
// In HTML: onclick="showPage('overview', event)"
```

---

#### [MEDIUM-06] Demo playground section has no visible section ID / scroll target
**File:** `landing/index.html` line 887  
**Section:** Demo section  

The nav "Try Demo" link scrolls to `#demo` (`<section id="demo">`). This works, but the section has no visible heading at the top — the first thing visible after scroll is a large heading mid-section. The "Test the real engine." h2 is the actual entry point, but on mobile the tab bar and context paragraph require scrolling to discover.

More critically: the "This playground calls the live AgentGuard policy engine deployed on Azure" copy is in a `<p>` with `color:var(--text-dim)` at `font-size:1.05rem`, below the `section-sub` class. This is important trust-building information but is visually de-emphasized.

**Recommendation:** Ensure the demo section's scroll target puts the heading and key trust statement at the top of the viewport, not mid-section. Consider adding a visual `#` anchor indicator or sticky context bar while in the demo section.

---

#### [MEDIUM-07] "0 category leaders in agent runtime security" stat is jarring and unclear
**File:** `landing/index.html` lines 767–769  
**Section:** Social proof bar

```
<strong>0</strong>
category leaders in agent runtime security
```

This reads at first glance as "0 [things]" which triggers a "failure" mental model before the qualifier "leaders" registers. The intent is "the market is empty — be first" but it lands as "no one's winning, not even you." The stat is also unverifiable and self-referential in a way that erodes trust.

**Recommendation:** Reframe as a positive scarcity signal: "No dominant player yet" or "Market open: zero category leaders" in badge/pill format, or replace with an actual market stat from Gartner/IDC if one exists.

---

#### [MEDIUM-08] No pricing page, no docs link, no "Log In" — nav is too sparse
**File:** `landing/index.html` lines 677–685  
**Section:** Navigation

The navigation has exactly two links: "Try Demo" and "Join Private Beta." For a B2B SaaS targeting enterprises:
- No pricing (even "Contact us for pricing" is better than nothing)
- No documentation link
- No "Log In" for existing users
- No "About" or team page
- No "Blog" or resources

Enterprise buyers expect to be able to research a product thoroughly before signup. The lack of any secondary navigation looks incomplete rather than focused.

**Recommendation:** Add at minimum: a "Docs" link (even to a placeholder), and a "Log In" link (even if it redirects to the dashboard demo). These signal maturity. A "Pricing" or "For Enterprise" page is the highest-value missing asset.

---

#### [MEDIUM-09] Landing page has 134 inline style attributes — maintenance problem
**File:** `landing/index.html`  

The landing page has **134 inline `style=` attributes** — nearly one per element on average. The dashboard has 83. While the base design token variables are well-structured (the `:root` CSS variables are clean), the actual HTML is littered with one-off inline styles that:

1. Cannot be overridden with normal CSS specificity
2. Are nearly impossible to audit for consistency
3. Make responsive design changes require editing HTML rather than CSS
4. Resist any future theming or white-labeling

The demo section is particularly bad — nearly every element has a multi-property inline style block, some spanning 5–6 properties.

**Recommendation:** Extract inline styles into named utility classes or extend the existing component CSS. The design tokens are good; the component layer is missing. This won't fix itself — it compounds with every feature added.

---

#### [MEDIUM-10] No OG image — social shares show blank preview
**File:** `landing/index.html` lines 7–9  
**Section:** `<head>` meta

```html
<meta property="og:title" content="AgentGuard — The Firewall for AI Agents">
<meta property="og:description" content="...">
<!-- No og:image defined -->
```

When shared on LinkedIn, Twitter/X, or Slack, the page preview shows no image. For a product targeting security professionals and enterprise buyers, a blank social card looks unpolished. The messaging is strong enough that a well-designed social card could be a meaningful acquisition channel.

**Recommendation:** Create a 1200×630px OG image and add:
```html
<meta property="og:image" content="https://[domain]/og-image.png">
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:image" content="https://[domain]/og-image.png">
```

---

#### [MEDIUM-11] Cold start warning is buried — frustrating first-run experience
**File:** `landing/index.html` line 1388, `dashboard/index.html` line 404  
**Section:** API error state

Both the landing playground and dashboard show this error on cold start:
> "API may be cold-starting. Try again in 10s."

This appears only in the error state — after the user has already clicked "Evaluate" and waited ~5–10 seconds for the request to time out. The user experience is: "I clicked a button, it failed, now I need to wait and try again." For a demo intended to impress, this is a rough first impression.

**Recommendation:** 
1. Add a pre-warming call on page load (`GET /health`) so the API is warm when users reach the demo section
2. Show a visible "API warming up..." indicator if the health check fails, before the user tries to evaluate
3. The dashboard already does a health check on `init()` — surface this more clearly to the user rather than just updating a small status dot

---

### 🔵 LOW

---

#### [LOW-01] Hero section "EU AI Act enforcement begins August 2026" badge uses ⚠️ red aesthetic for deadline — appropriate but slightly alarmist
**File:** `landing/index.html` lines 695–700  
**Section:** Hero badge

The pulsing red dot and "EU AI Act enforcement begins August 2026" badge is effective urgency marketing. However, the red colour and "⚠️" icon pattern will age badly — once August 2026 passes, this becomes either a liability claim or needs updating. Bake in a content management plan for this date.

---

#### [LOW-02] Demo textarea: green text on dark background for JSON params — low semantic value
**File:** `landing/index.html` line 937  
**Section:** Live Playground

```css
color:var(--green)  /* Applied to params textarea */
```

The JSON parameters textarea renders in `var(--green)` (`#22c55e`) which is the "allowed/safe" colour in the risk system. Using it for editable user input creates a misleading association — users might think green means "this is safe" when it's just the input field colour. The approved/safe badge green is semantically loaded in this UI.

**Recommendation:** Use `var(--text)` or `var(--text-bright)` for the textarea text. Reserve green for decision outputs only.

---

#### [LOW-03] Two identical beta signup forms on same page — duplicate success states
**File:** `landing/index.html` lines 723–756, 1144–1177  
**Section:** Hero form, CTA2 form

Both forms use identical fields (Name, Work Email, Company) with identical success messages ("🎉 You're on the list.") and near-identical UX. This is intentional for conversion rate, but:

1. The second form `form_id: "cta2"` differs only in the hidden `form_id` field — good tracking practice
2. But if a user fills in the hero form successfully, they may fill the CTA2 form again not realising they're the same form
3. No de-duplication logic (not feasible client-side, but backend should handle it)

Also: the `_next` redirect URL `https://agentguard.dev/landing/thankyou.html` is never used because the JS intercepts the submit — but it's confusing boilerplate and suggests FormSpree integration that isn't complete.

**Recommendation:** After the hero form succeeds, visually indicate the user is already signed up if they scroll to CTA2. Store a `localStorage` flag and show a "You're already on the list! 🎉" state in the second form.

---

#### [LOW-04] Dashboard: policy-json renders unformatted on page load if API is slow
**File:** `dashboard/index.html` lines 422–426  
**Section:** Policy page

The policy JSON panel initialises with "Loading..." text. If the API is slow or offline, this state persists indefinitely with no timeout, no retry button, and no error message. The policy rules section has the same issue.

**Recommendation:** Add a 5-second timeout after which the loading state changes to "Unable to load policy. [Retry]" with a button to call the API again.

---

#### [LOW-05] `novalidate` attribute on forms with no custom validation for empty fields
**File:** `landing/index.html` lines 723, 1144  
**Section:** Forms

Both forms have `novalidate` (which disables native browser validation) but the `handleForm()` function only validates the email field:
```javascript
const email = formEl.querySelector('input[type=email]');
if (!email.value || !email.value.includes('@')) {
  email.focus();
  return;
}
```

Name and company can be submitted empty. The submit function wouldn't catch a name of "." or a company of "x". If you're trying to qualify leads, empty names/companies are noise.

**Recommendation:** Add validation for all required fields with visible error states (not just focus):
```javascript
const name = formEl.querySelector('input[name=name]');
if (!name.value.trim()) {
  showFieldError(name, 'Please enter your name');
  return;
}
```

---

#### [LOW-06] Dashboard has no page title changes between sections — back button is confusing
**File:** `dashboard/index.html`  
**Section:** SPA navigation

The dashboard is a single-page app with JS-driven page switching (`showPage()`), but `document.title` never changes. All pages show "AgentGuard — Dashboard" regardless of which section is active. Browser history is also not updated (no `history.pushState`), so:

1. The back button doesn't navigate between dashboard pages
2. Deep linking is impossible (can't share a URL to the Audit Trail page)
3. Browser tab label is always the same

**Recommendation:** Add `history.pushState` and `document.title` updates in `showPage()`:
```javascript
function showPage(id, evt) {
  const titles = { overview: 'Dashboard', live: 'Live Feed', evaluate: 'Evaluate', ... };
  document.title = `AgentGuard — ${titles[id] || id}`;
  history.pushState({ page: id }, '', `#${id}`);
  ...
}
```

---

#### [LOW-07] `<code>` element inside `<p>` in the kill switch page has no visual styling
**File:** `dashboard/index.html` line 302  
**Section:** Kill switch description

```html
every evaluation returns <code style="color:var(--red)">BLOCK</code>
```

This inline `<code>` has only a `color` applied — no background, no border-radius, no padding. The `code` element styling in the CSS isn't applied here because it's using an inline style that only sets color. This looks inconsistent with the styled `<code>` elements elsewhere.

**Recommendation:** Apply the `.mono` class or wrap in `<span class="badge badge-block">BLOCK</span>` for visual consistency.

---

#### [LOW-08] `<h1>` in section headers are h2s labelled as section-head — heading hierarchy is broken
**File:** `landing/index.html`, `dashboard/index.html`  
**Section:** Section headings

The landing page has multiple `<h2>` elements across sections, with the hero `<h1>` being the only h1. This is actually correct. However, several dashboard "pages" have `<h1>` as the page title (`<h1>Dashboard</h1>`, `<h1>⚡ Live Feed</h1>`) which is semantically appropriate for a SPA page context — but since all pages exist simultaneously in the DOM (just `display:none`), screen readers will see multiple `<h1>` elements. 

**Recommendation:** Keep page titles as `<h2>` in the dashboard, or use `aria-hidden="true"` on inactive pages.

---

## Competitive Benchmark

### How AgentGuard compares to best-in-class SaaS landing pages

**Strengths vs. competitors (Datadog, Snyk, Wiz):**
- ✅ The interactive playground is genuinely differentiating — most landing pages fake their demos. Working API calls are a major trust signal
- ✅ Copy is unusually specific and technically honest for an early-stage product
- ✅ The persona section is well-executed — real pain, real outcomes
- ✅ Dark theme execution is better than 90% of dev-tool SaaS pages
- ✅ Page load is fast (62KB, no external JS bundles, ~175ms)
- ✅ The CISO quote is specific and believable (even if it's a composite)

**Gaps vs. best-in-class:**
- ❌ No video or animated demo (Snyk, Wiz, Datadog all have homepage videos)
- ❌ No pricing page at all — enterprise buyers expect this, even "Contact us"
- ❌ No customer logos (clearly missing, not just not ready)
- ❌ No team/about credibility signals — who built this? Why should I trust them?
- ❌ No "How it works" technical diagram — architecture-level trust-building
- ❌ The social proof numbers ($6.34B market, "0 category leaders") are market stats, not product validation

**Dashboard vs. competitors (Datadog, Grafana, Sentry):**
- ✅ Clean visual design, appropriate information density for a demo
- ✅ The evaluate-and-see-result flow works well
- ❌ No data persistence — every session starts empty (expected for demo, but limiting)
- ❌ No time-series chart — even a fake sparkline would improve perceived data richness
- ❌ No drill-down on policy violations — why did this trigger? What's the rule logic?
- ❌ No export or share functionality (audit trail is presented as compliance evidence but can't be exported)

---

## Priority Fix List (ordered)

| Priority | Item | Effort | Impact |
|---|---|---|---|
| 1 | Fix form submission (CRITICAL-01) | Low | Critical — zero signups currently |
| 2 | Fix GitHub link or remove OSS claims (CRITICAL-03) | Low | Critical — core trust signal broken |
| 3 | Fix LinkedIn footer link (CRITICAL-04) | Trivial | High — embarrassing to prospects |
| 4 | Add security headers (CRITICAL-05) | Low | Critical — security product with no security headers |
| 5 | Add favicon (HIGH-07) | Trivial | Medium — polish |
| 6 | Fix blocked stat counter (HIGH-02) | Trivial | Medium — data integrity |
| 7 | Fix `api.agentguard.dev` DNS or update docs (HIGH-06) | Low | High — broken copy-paste examples |
| 8 | Fix primary button contrast (HIGH-01) | Trivial | Medium — WCAG compliance |
| 9 | Fix footer text contrast (MEDIUM-03) | Trivial | Medium — WCAG compliance |
| 10 | Add mobile nav to dashboard (HIGH-04) | Medium | High — unusable on mobile |
| 11 | Replace placeholder logos (HIGH-03) | Low | High — credibility |
| 12 | Kill switch backend wiring or honest labelling (CRITICAL-02) | High | Critical — if showing to CISOs |
| 13 | Add `aria-live` to form errors (MEDIUM-02) | Trivial | Medium — accessibility |
| 14 | Cold-start pre-warming (MEDIUM-11) | Low | Medium — demo quality |
| 15 | Fix audit hash to be real or remove claim (MEDIUM-01) | Medium | High — if showing to security auditors |

---

*Report generated from static analysis of source files + live HTTP inspection of deployed services. Contrast ratios calculated using WCAG 2.1 relative luminance formula. No browser automation was used; JavaScript-rendered states were inferred from source code.*
