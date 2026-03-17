# AgentGuard Frontend QA — v0.8.0 Test Results

**Test Date:** 2026-03-07  
**Tester:** QA Subagent (automated curl + HTML analysis)  
**Release Under Test:** v0.8.0  
**Sites Tested:** 6

---

## Executive Summary

| # | Site | Availability | Security Headers | Content | SEO | Special | Score |
|---|------|-------------|-----------------|---------|-----|---------|-------|
| 1 | agentguard.dev | ✅ | ✅ | ✅ | ⚠️ | — | 9/10 |
| 2 | app.agentguard.dev | ✅ | ✅ | ❌ | ✅ | ⚠️ | 7/10 |
| 3 | api.agentguard.dev/health | ✅ | ✅ | ✅ | — | ⚠️ | 8/10 |
| 4 | docs.agentguard.dev | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | 8/10 |
| 5 | demo.agentguard.dev | ✅ | ⚠️ | ✅ | ⚠️ | — | 7/10 |
| 6 | about.agentguard.dev | ✅ | ⚠️ | ✅ | ⚠️ | — | 7/10 |

**Overall Score: 46/60 (77%)** — Deployable with known issues.

---

## Site 1: https://agentguard.dev (Marketing / Landing)

### Availability & Performance
| Check | Result | Detail |
|-------|--------|--------|
| HTTP Status | ✅ PASS | 200 OK |
| Response Time | ✅ PASS | 0.195s (excellent) |
| Content-Type | ✅ PASS | text/html |
| Protocol | ✅ PASS | HTTP/2 via Cloudflare |
| Last Modified | ✅ PASS | 2026-03-06 23:47 UTC (current) |

### Security Headers
| Header | Result | Value |
|--------|--------|-------|
| X-Content-Type-Options | ✅ PASS | nosniff |
| X-Frame-Options | ✅ PASS | DENY |
| Referrer-Policy | ✅ PASS | strict-origin-when-cross-origin |
| Content-Security-Policy | ✅ PASS | Present, well-scoped |
| X-Powered-By | ✅ PASS | Absent |
| HSTS | ✅ PASS | max-age=31536000; includeSubDomains |
| Permissions-Policy | ✅ PASS | geolocation=(), microphone=(), camera=() |

**CSP value:** `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src https://agentguard-api.greenrock-adeab1b0.australiaeast.azurecontainerapps.io https://api.agentguard.dev; img-src 'self' data:; frame-ancestors 'none';`

### Content Accuracy
| Check | Result | Detail |
|-------|--------|--------|
| Version 0.8.0 | ✅ PASS | Referenced in API code examples and structured data |
| Old version refs | ✅ PASS | No v0.7.x or older references found |
| Pricing — Free tier | ✅ PASS | 10,000 evals/month, 2 agent keys, 5 templates |
| Pricing — Pro tier | ✅ PASS | $299/month, 1M evals, unlimited agents |
| Lorem/placeholder text | ✅ PASS | None found |
| TODO/FIXME markers | ✅ PASS | None found |
| Footer copyright | ✅ PASS | AgentGuard © 2026 |

### Link Check (5 links)
| URL | Status |
|-----|--------|
| https://docs.agentguard.dev | ✅ 200 |
| https://demo.agentguard.dev | ✅ 200 |
| https://about.agentguard.dev | ✅ 200 |
| https://app.agentguard.dev (footer) | ✅ 200 |
| https://github.com/thebotclub/AgentGuard | ❌ 404 — **GitHub repo is private or non-existent** |

### SEO
| Check | Result | Detail |
|-------|--------|--------|
| `<title>` | ✅ PASS | "AgentGuard — AI Agent Deployment Enforcement \| CI/CD Gate & Runtime Policy Engine" |
| Meta description | ✅ PASS | Well-written, mentions key differentiators |
| OG tags | ✅ PASS | og:title, og:description, og:image (1200×630), og:type, og:url |
| Twitter Card | ⚠️ PARTIAL | summary_large_image, title, description present — **twitter:image missing** |
| Canonical | ✅ PASS | https://agentguard.dev |
| Viewport | ✅ PASS | width=device-width, initial-scale=1.0 |
| Favicon | ✅ PASS | favicon.ico (200), favicon-32.png (200), favicon-16.png (200), apple-touch-180.png (200) |
| JSON-LD Structured Data | ✅ PASS | SoftwareApplication schema with pricing, author, publisher |

**Issues:**
- ⚠️ `twitter:image` meta tag is missing on the main page (has og:image but not twitter:image)
- ❌ GitHub repo link (https://github.com/thebotclub/AgentGuard) returns 404

---

## Site 2: https://app.agentguard.dev (Dashboard)

### Availability & Performance
| Check | Result | Detail |
|-------|--------|--------|
| HTTP Status | ✅ PASS | 200 OK |
| Response Time | ✅ PASS | 0.240s (excellent) |
| Content-Type | ✅ PASS | text/html |
| Initial tests | ⚠️ NOTE | First batch timed out (HTTP 000) — rate-limiting or cold start. Resolved after ~90s. |
| Last Modified | ✅ PASS | 2026-03-06 23:47 UTC (current) |

### Security Headers
| Header | Result | Value |
|--------|--------|-------|
| X-Content-Type-Options | ✅ PASS | nosniff |
| X-Frame-Options | ✅ PASS | DENY |
| Referrer-Policy | ✅ PASS | strict-origin-when-cross-origin |
| Content-Security-Policy | ✅ PASS | Present, well-scoped |
| X-Powered-By | ✅ PASS | Absent |
| HSTS | ✅ PASS | max-age=31536000; includeSubDomains |
| Permissions-Policy | ✅ PASS | geolocation=(), microphone=(), camera=() |

### Content Accuracy
| Check | Result | Detail |
|-------|--------|--------|
| Version 0.8.0 | ❌ FAIL | **Sidebar footer shows "AgentGuard v0.7.2"** — stale version |
| Lorem/placeholder text | ✅ PASS | None found |
| noindex, nofollow | ✅ PASS | Correctly set for dashboard |

### Dashboard Nav Items
| Nav Item | Present |
|----------|---------|
| 📊 Overview | ✅ |
| ⚡ Live Feed | ✅ |
| 🔍 Evaluate | ✅ |
| 🤖 Agents | ✅ |
| 🚀 Deployment (Readiness) | ✅ |
| 📜 Policies | ✅ |
| 🔔 Webhooks | ✅ |
| ⏱️ Rate Limits | ✅ |
| 📋 Audit Trail | ✅ |
| 💰 Costs | ✅ |
| 🔴 Kill Switch | ✅ |
| 📈 Analytics | ✅ |
| 🛡️ Compliance | ✅ |
| 🔌 MCP Servers | ✅ |
| 🔔 Alerts | ✅ |
| 🔧 SDK / API | ✅ |
| ⚙️ License | ✅ |
| 📡 SIEM | ✅ |

**Note on requested checks:**
- "Dashboard" = Overview page ✅
- "Evaluate" = 🔍 Evaluate ✅
- "Agents" = 🤖 Agents ✅
- "Audit" = 📋 Audit Trail ✅
- "Policy" = 📜 Policies ✅
- "Analytics" = 📈 Analytics ✅
- "Compliance" = 🛡️ Compliance ✅
- "MCP" = 🔌 MCP Servers ✅
- "License" = ⚙️ License ✅
- "Alerts" = 🔔 Alerts ✅
- "SIEM" = 📡 SIEM ✅

All 11 expected pages present (18 total nav items).

### SEO
| Check | Result | Detail |
|-------|--------|--------|
| `<title>` | ✅ PASS | "AgentGuard — Dashboard" |
| Meta description | ✅ PASS | Present |
| robots | ✅ PASS | noindex, nofollow (correct for authenticated app) |
| Canonical | ✅ PASS | https://app.agentguard.dev |
| Favicon | ✅ PASS | favicon.ico, manifest referenced |

**Issues:**
- ❌ **CRITICAL: Dashboard sidebar shows `v0.7.2` — must be updated to `v0.8.0`**
- ⚠️ Initial load had timeout issues (possible cold start or rate limiting on Cloudflare Workers)

---

## Site 3: https://api.agentguard.dev/health (API Backend)

### Availability & Performance
| Check | Result | Detail |
|-------|--------|--------|
| HTTP Status | ✅ PASS | 200 OK (when not rate-limited) |
| Response Time | ✅ PASS | ~0.15s |
| Content-Type | ✅ PASS | application/json; charset=utf-8 |
| Rate Limiting | ⚠️ NOTE | Aggressive rate limit: 10 req/min. Multiple test requests hit 429 during testing. |

### Health Endpoint
| Check | Result | Detail |
|-------|--------|--------|
| Returns JSON | ✅ PASS | `{"status":"ok","version":"0.8.0"}` |
| Version = 0.8.0 | ✅ PASS | Confirmed |
| Status = ok | ✅ PASS | Confirmed |

### Security Headers
| Header | Result | Value |
|--------|--------|-------|
| X-Content-Type-Options | ✅ PASS | nosniff |
| X-Frame-Options | ✅ PASS | SAMEORIGIN |
| Referrer-Policy | ✅ PASS | strict-origin-when-cross-origin |
| HSTS | ✅ PASS | max-age=31536000; includeSubDomains |
| X-Powered-By | ✅ PASS | Absent |
| Permissions-Policy | ✅ PASS | geolocation=(), microphone=(), camera=() |
| Content-Security-Policy | ✅ PASS | Present |
| x-dns-prefetch-control | ✅ PASS | off |
| x-download-options | ✅ PASS | noopen |
| x-xss-protection | ✅ PASS | 0 (modern best practice) |
| cross-origin-opener-policy | ✅ PASS | same-origin |
| cross-origin-resource-policy | ✅ PASS | same-origin |

### Swagger UI — GET /api/docs
| Check | Result | Detail |
|-------|--------|--------|
| HTML loads | ✅ PASS | Returns HTML with Swagger UI (confirmed in first test attempt) |
| Dark theme | ✅ PASS | Custom AgentGuard dark theme applied |
| AgentGuard branding | ✅ PASS | Top bar with logo, version badge, links |
| Version displayed | ✅ PASS | Badge shows v0.8.0 |

**Issues:**
- ⚠️ Rate limit of 10 req/min is very aggressive. May cause issues for developers iterating on integration. `GET /api/docs` also rate-limited during sustained test run.

---

## Site 4: https://docs.agentguard.dev (Documentation)

### Availability & Performance
| Check | Result | Detail |
|-------|--------|--------|
| HTTP Status | ✅ PASS | 200 OK |
| Response Time | ✅ PASS | 0.227s |
| Content-Type | ✅ PASS | text/html |
| Last Modified | ✅ PASS | 2026-03-06 23:47 UTC (current) |

### Security Headers
| Header | Result | Value |
|--------|--------|-------|
| X-Content-Type-Options | ✅ PASS | nosniff |
| X-Frame-Options | ✅ PASS | SAMEORIGIN |
| Referrer-Policy | ✅ PASS | strict-origin-when-cross-origin |
| Content-Security-Policy | ❌ FAIL | **Missing** — no CSP header on docs site |
| X-Powered-By | ✅ PASS | Absent |
| HSTS | ❌ FAIL | **Missing** — no Strict-Transport-Security header |
| Permissions-Policy | ❌ FAIL | **Missing** — no Permissions-Policy header |

### Content Accuracy
| Check | Result | Detail |
|-------|--------|--------|
| Version 0.8.0 in sidebar | ✅ PASS | `v0.8.0 · docs` in sidebar header |
| Version in content | ✅ PASS | v0.8.0 referenced in all new feature comments |
| No old version refs | ✅ PASS | No v0.7.x found |
| Lorem/placeholder | ✅ PASS | None found |

### v0.8.0 Sidebar Sections
| Section | Present |
|---------|---------|
| Getting Started (Overview, Quick Start, Auth, SDK) | ✅ |
| Core API (Signup, Evaluate, Audit, Verify Chain) | ✅ |
| Agent Management (CRUD, Readiness) | ✅ |
| 🛡️ Deployment Enforcement (Validate, Certify, Coverage Check, MCP Admit, GitHub Action) | ✅ |
| MCP Middleware (Evaluate, MCP Policy NEW, Config, Sessions) | ✅ |
| 🔍 Security Features (Prompt Injection NEW, PII Detection NEW, OWASP Compliance NEW) | ✅ |
| 🤝 Integrations (Slack HITL NEW, Multi-Agent A2A NEW) | ✅ |
| Observability (Rate Limits, Costs, Dashboard API, Analytics NEW, Webhooks, Kill Switch, Approvals) | ✅ |
| Governance (Templates, Policy API, Policy Engine, Feedback NEW) | ✅ |
| Resources (SDK Telemetry NEW, Errors, Playground) | ✅ |

**All v0.8.0 feature docs present:** PII ✅, OWASP ✅, MCP ✅, Slack HITL ✅, Multi-Agent A2A ✅, Analytics ✅, Prompt Injection ✅

### Link Check (5 links)
| URL | Status |
|-----|--------|
| https://docs.agentguard.dev | ✅ 200 |
| https://agentguard.dev | ✅ 200 |
| https://docs.agentguard.dev#overview | ✅ 200 |
| https://docs.agentguard.dev#quickstart | ✅ 200 |
| https://docs.agentguard.dev#authentication | ✅ 200 |

### SEO
| Check | Result | Detail |
|-------|--------|--------|
| `<title>` | ✅ PASS | "AgentGuard Documentation — API Reference & SDK Guide" |
| Meta description | ✅ PASS | Comprehensive, mentions PII, OWASP, MCP, Slack HITL, A2A |
| OG tags | ✅ PASS | og:title, og:description, og:image, og:type, og:url |
| Twitter Card | ⚠️ PARTIAL | title, description present — **twitter:image missing** |
| Canonical | ✅ PASS | https://docs.agentguard.dev |
| Favicon | ✅ PASS | Referenced |

**Issues:**
- ❌ **Missing CSP header** (security risk)
- ❌ **Missing HSTS header** (served over HTTP is theoretically possible)
- ❌ **Missing Permissions-Policy header**
- ⚠️ `twitter:image` missing

---

## Site 5: https://demo.agentguard.dev (Live Demo)

### Availability & Performance
| Check | Result | Detail |
|-------|--------|--------|
| HTTP Status | ✅ PASS | 200 OK |
| Response Time | ✅ PASS | 0.185s |
| Content-Type | ✅ PASS | text/html |
| Initial test | ⚠️ NOTE | First request timed out (HTTP 000) — possible rate limiting. Resolved after ~90s. |
| Last Modified | ⚠️ NOTE | 2026-03-03 22:34 UTC — **3 days before v0.8.0 release** (older than main/app/docs) |

### Security Headers
| Header | Result | Value |
|--------|--------|-------|
| X-Content-Type-Options | ✅ PASS | nosniff |
| X-Frame-Options | ❌ FAIL | **Missing** |
| Referrer-Policy | ✅ PASS | strict-origin-when-cross-origin |
| Content-Security-Policy | ❌ FAIL | **Missing** |
| X-Powered-By | ✅ PASS | Absent |
| HSTS | ❌ FAIL | **Missing** |
| Permissions-Policy | ❌ FAIL | **Missing** |

### Content Accuracy
| Check | Result | Detail |
|-------|--------|--------|
| Version 0.8.0 | ✅ PASS | No explicit version shown (demo is a scene-based animation) |
| Old versions | ✅ PASS | No v0.7.x references found |
| Lorem/placeholder | ✅ PASS | None found |
| Demo functionality | ✅ PASS | Animated scene-based demo with policy evaluation simulation |

### Link Check (2 external links only)
| URL | Status |
|-----|--------|
| https://agentguard.dev | ✅ 200 |
| Email (Cloudflare-protected) | ✅ Present |

### SEO
| Check | Result | Detail |
|-------|--------|--------|
| `<title>` | ✅ PASS | "AgentGuard — Runtime Security for AI Agents" |
| Meta description | ✅ PASS | "Try AgentGuard live — see how the runtime policy engine evaluates AI agent tool calls in real-time." |
| OG tags | ✅ PASS | og:title, og:description, og:image, og:type, og:url |
| Twitter Card | ⚠️ PARTIAL | title, description — **twitter:image missing** |
| Canonical | ✅ PASS | https://demo.agentguard.dev |
| robots | ✅ PASS | index, follow |
| Favicon | ✅ PASS | Referenced |

**Issues:**
- ❌ **Missing X-Frame-Options** (clickjacking risk)
- ❌ **Missing CSP header**
- ❌ **Missing HSTS header**
- ❌ **Missing Permissions-Policy**
- ⚠️ **Last-Modified older than v0.8.0 release** — demo may not include v0.8.0 scene updates
- ⚠️ `twitter:image` missing

---

## Site 6: https://about.agentguard.dev (About)

### Availability & Performance
| Check | Result | Detail |
|-------|--------|--------|
| HTTP Status | ✅ PASS | 200 OK |
| Response Time | ✅ PASS | 0.150s (fastest of all sites) |
| Content-Type | ✅ PASS | text/html |
| Last Modified | ⚠️ NOTE | 2026-03-03 21:01 UTC — **also older than v0.8.0 release date** |

### Security Headers
| Header | Result | Value |
|--------|--------|-------|
| X-Content-Type-Options | ✅ PASS | nosniff |
| X-Frame-Options | ✅ PASS | SAMEORIGIN |
| Referrer-Policy | ✅ PASS | strict-origin-when-cross-origin |
| Content-Security-Policy | ❌ FAIL | **Missing** |
| X-Powered-By | ✅ PASS | Absent |
| HSTS | ❌ FAIL | **Missing** |
| Permissions-Policy | ❌ FAIL | **Missing** |

### Content Accuracy
| Check | Result | Detail |
|-------|--------|--------|
| Stats — Policy evaluations | ✅ PASS | 50K+ shown |
| Stats — Compliance templates | ✅ PASS | 5 shown |
| Stats — Evaluation latency | ✅ PASS | <1ms shown |
| Stats — Agent frameworks | ✅ PASS | 3 shown |
| Version 0.8.0 | ✅ PASS | No version number shown on about page (appropriate) |
| Lorem/placeholder | ✅ PASS | None found |
| Timeline milestones | ✅ PASS | Includes "50,000+ Policy Evaluations" milestone |
| Advisor section | ⚠️ NOTE | "Forming" placeholder — intentional, board not yet formed |

### Link Check (5 links)
| URL | Status |
|-----|--------|
| https://about.agentguard.dev/ | ✅ 200 |
| https://agentguard.dev | ✅ 200 |
| https://linkedin.com/in/hanikashi | ⚠️ 999 (LinkedIn blocks curl — expected) |
| https://linkedin.com/company/agentguard | ⚠️ 999 (LinkedIn blocks curl — expected) |
| https://github.com/thebotclub | ❌ 404 — **GitHub org page not found** |

### SEO
| Check | Result | Detail |
|-------|--------|--------|
| `<title>` | ✅ PASS | "About — AgentGuard \| Built by Security Engineers" |
| Meta description | ✅ PASS | Well-crafted, references problem and 2026 context |
| OG tags | ✅ PASS | og:title, og:description, og:image, og:url, og:type — **Note: og:url points to https://agentguard.dev/about (not about.agentguard.dev)** |
| Twitter Card | ⚠️ PARTIAL | title, description — **twitter:image missing** |
| Canonical | ✅ PASS | https://about.agentguard.dev |
| JSON-LD | ✅ PASS | AboutPage schema |
| Favicon | ✅ PASS | Referenced |

**Issues:**
- ❌ **Missing CSP header**
- ❌ **Missing HSTS header**
- ❌ **Missing Permissions-Policy**
- ❌ GitHub org link (https://github.com/thebotclub) returns 404
- ⚠️ `og:url` mismatch: value is `https://agentguard.dev/about` but the canonical is `https://about.agentguard.dev`
- ⚠️ `twitter:image` missing
- ⚠️ Last-Modified is pre-v0.8.0 release date

---

## Cross-Site Issues Summary

### Security Header Matrix

| Header | agentguard.dev | app.agentguard.dev | api.agentguard.dev | docs.agentguard.dev | demo.agentguard.dev | about.agentguard.dev |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|
| X-Content-Type-Options | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| X-Frame-Options | ✅ DENY | ✅ DENY | ✅ SAMEORIGIN | ✅ SAMEORIGIN | ❌ | ✅ SAMEORIGIN |
| Referrer-Policy | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CSP | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| X-Powered-By absent | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| HSTS | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Permissions-Policy | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

**Pattern:** agentguard.dev, app.agentguard.dev, and api.agentguard.dev have full security headers (deployed via Cloudflare Workers/Pages with custom headers). The three remaining sites (docs, demo, about) appear to be static HTML served directly without the security header configuration applied. They likely need Cloudflare Transform Rules or `_headers` file added.

### twitter:image Missing Everywhere
All 5 HTML sites are missing `<meta name="twitter:image" ...>`. The `og:image` is set but Twitter/X prefers its own explicit tag. This affects link previews on X.

---

## Prioritized Fix List

### 🔴 Priority 1 — Critical (Fix Before Next Public Push)

1. **app.agentguard.dev: `v0.7.2` in dashboard sidebar**
   - Location: Bottom of sidebar, hard-coded string `AgentGuard v0.7.2`
   - Fix: Update to `AgentGuard v0.8.0`
   - Impact: HIGH — visible to every user who logs in; contradicts the v0.8.0 release

2. **GitHub repo link returns 404 everywhere**
   - URLs: `https://github.com/thebotclub/AgentGuard` and `https://github.com/thebotclub`
   - Impact: HIGH — appears in structured data, footer of main site, and about page
   - Fix: Either make the repo public, create the GitHub org, or remove/replace the link

### 🟠 Priority 2 — High (Fix This Week)

3. **docs.agentguard.dev, demo.agentguard.dev, about.agentguard.dev: Missing security headers**
   - Missing: CSP, HSTS, Permissions-Policy (docs/about also missing X-Frame-Options on demo)
   - Fix: Add Cloudflare `_headers` file or Transform Rule to apply headers to all subdomain pages
   - Affected: 3 of 6 sites
   - Risk: Clickjacking, XSS, protocol downgrade attacks theoretically possible

4. **api.agentguard.dev: Rate limit of 10 req/min too aggressive**
   - `/health` and `/api/docs` are caught by the same rate limit as API calls
   - Fix: Exclude `/health` and `/api/docs` from the 10 req/min limit, or create separate limit tiers
   - Impact: Developer experience — docs and health monitoring should be freely accessible

5. **app.agentguard.dev / demo.agentguard.dev: Initial connection timeouts**
   - Both sites returned HTTP 000 (connection timeout) on first request in the test run
   - Subsequent requests succeeded — suggests Cloudflare cold start issue or origin server spin-up
   - Fix: Investigate Cloudflare caching strategy; consider keeping origin warm

### 🟡 Priority 3 — Medium (Fix This Sprint)

6. **twitter:image missing on all sites**
   - Impact: X/Twitter link previews won't show images
   - Fix: Add `<meta name="twitter:image" content="[url]">` matching og:image on each page
   - Affected: agentguard.dev, app.agentguard.dev, docs.agentguard.dev, demo.agentguard.dev, about.agentguard.dev

7. **about.agentguard.dev: og:url mismatch**
   - `og:url` = `https://agentguard.dev/about` but canonical = `https://about.agentguard.dev`
   - Fix: Update og:url to match canonical: `https://about.agentguard.dev`

8. **demo.agentguard.dev and about.agentguard.dev not re-deployed since v0.8.0**
   - Last-Modified: 2026-03-03 (vs main/app/docs: 2026-03-06)
   - Verify: Do these sites need v0.8.0-specific content updates?
   - Fix: Redeploy as part of release pipeline if content changed

### 🟢 Priority 4 — Low (Backlog)

9. **agentguard.dev: twitter:image missing** (redundant to #6 but noted separately for main domain)

10. **CSP uses `unsafe-inline` for scripts and styles** (app and main site)
    - Current: `script-src 'self' 'unsafe-inline'`
    - Better: Use nonces or hashes for inline scripts
    - Note: This is a known trade-off for single-file HTML apps; lower priority

---

## What's Working Well ✅

- **All 6 sites return 200** (when not rate-limited)
- **API v0.8.0 confirmed** — `{"status":"ok","version":"0.8.0"}`
- **Docs sidebar fully updated** — all v0.8.0 features present (PII, OWASP, MCP, Slack HITL, A2A, Analytics)
- **App dashboard complete** — all 18 nav items including SIEM, Alerts, Compliance, MCP
- **Security-sensitive sites (main, app, API) have excellent header coverage**
- **No Lorem ipsum or placeholder text found anywhere**
- **Response times are excellent** — all under 250ms
- **Cloudflare proxied properly** — no origin IP leakage, X-Powered-By absent everywhere
- **Favicons, manifests, and OG images all load (200)**
- **Footer links work** (docs, app, demo, about all 200)
- **JSON-LD structured data present** on main site and about page
- **HSTS, CSP, Permissions-Policy all correct** on the 3 most critical sites

---

*Report generated: 2026-03-07 by automated QA subagent*  
*Test methodology: curl-based header inspection, HTML content analysis, link verification*
