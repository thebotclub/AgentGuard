# AgentGuard Frontend Audit Report V3

**Date:** 2026-03-09 03:41 UTC  
**Auditor:** Vector (automated)  
**Scope:** All 6 AgentGuard subdomains

---

## Site-by-Site Summary Table

| Site | Status | Load Time | SSL Valid | Security Headers | SEO | Mobile | Favicon | Score |
|------|--------|-----------|-----------|-----------------|-----|--------|---------|-------|
| agentguard.dev | ✅ 200 | 0.71s | ✅ May 29 | ✅ 5/5 | ✅ 9/10 | ✅ | ✅ | **92/100** |
| app.agentguard.dev | ⚠️ Slow/Timeout | >15s | ✅ May 29 | ✅ 5/5 | ✅ noindex (correct) | ✅ | ✅ | **65/100** |
| api.agentguard.dev | ✅ 429 (rate-limited) | 0.16s | ✅ May 29 | ✅ 8/8 | N/A (JSON API) | N/A | N/A | **90/100** |
| docs.agentguard.dev | ✅ 200 | 0.32s | ✅ May 29 | ✅ 5/5 | ✅ 8/10 | ✅ | ✅ | **85/100** |
| status.agentguard.dev | ❌ DNS failure | N/A | N/A | N/A | N/A | N/A | N/A | **0/100** |
| blog.agentguard.dev | ❌ DNS failure | N/A | N/A | N/A | N/A | N/A | N/A | **0/100** |

---

## 1. agentguard.dev (Marketing Site)

### Accessibility
- **Status:** ✅ HTTP 200
- **Load Time:** 0.71s (93.5 KB)
- **Server:** Cloudflare (SYD edge)

### Security Headers ✅ 5/5
| Header | Value | Status |
|--------|-------|--------|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | ✅ |
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src <api-urls>; img-src 'self' data:; frame-ancestors 'none'` | ✅ |
| X-Frame-Options | `DENY` | ✅ |
| X-Content-Type-Options | `nosniff` | ✅ |
| Referrer-Policy | `strict-origin-when-cross-origin` | ✅ |
| Permissions-Policy | `geolocation=(), microphone=(), camera=()` | ✅ Bonus |

### SEO Tags ✅ 9/10
| Tag | Present | Value |
|-----|---------|-------|
| `<title>` | ✅ | "AgentGuard — AI Agent Deployment Enforcement \| CI/CD Gate & Runtime Policy Engine" |
| `<meta description>` | ✅ | Comprehensive description present |
| `<link rel="canonical">` | ✅ | `https://agentguard.dev` |
| `og:title` | ✅ | "AgentGuard — Stop Deploying Unsafe AI Agents" |
| `og:description` | ✅ | Present |
| `og:image` | ✅ | `https://agentguard.dev/social-og.png` (200, 50KB) |
| `og:url` | ✅ | `https://agentguard.dev` |
| `twitter:card` | ✅ | `summary_large_image` |
| `twitter:title` | ✅ | Present |
| **`twitter:site`** | ❌ | **MISSING** — should be `@agentguard` or similar |
| `robots` | ✅ | `index, follow` |
| Keywords | ✅ | Present and relevant |

### robots.txt ✅
- Blocks AI crawlers: ClaudeBot, Google-Extended, GPTBot, meta-externalagent
- Allows general crawlers
- Sitemap reference: `https://agentguard.dev/sitemap.xml`
- Content signals (search/ai-input/ai-train) implemented

### sitemap.xml ✅
- Valid XML, includes:
  - `https://agentguard.dev/` (priority 1.0)
  - `https://docs.agentguard.dev/` (priority 0.9)
  - `https://demo.agentguard.dev/` (priority 0.7) — ⚠️ references demo subdomain

### SSL Certificate ✅
- **Issuer:** Let's Encrypt (E8)
- **Valid:** Feb 28, 2026 → May 29, 2026
- **Wildcard:** `*.agentguard.dev` — covers all subdomains
- **Days remaining:** ~81 days ✅

### Mobile ✅
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` present

### Favicon ✅
- `/favicon.ico` → 200
- `/favicon-32.png` and `/favicon-16.png` referenced

### GitHub Links ⚠️
- Found reference to `github.com/thebotclub` (footer link)
- **`github.com/thebotclub/AgentGuard` → 404** ❌
- No `agentguard-tech` org repos found (both `/agentguard` and `/validate` → 404)

### 404 Behavior ⚠️
- **Returns HTTP 200** for nonexistent paths (soft 404)
- Serves the main page content — SPA-style catch-all
- **Should return HTTP 404 status** for SEO and proper error handling

### Version Strings
- No version visible on marketing site (correct — marketing pages shouldn't show version)

---

## 2. app.agentguard.dev (Dashboard)

### Accessibility ⚠️
- **Status:** Timeout on full page load (>15s), but headers return quickly
- **Issue:** Page likely has heavy JS bundle or blocking API calls on load
- **Server:** Cloudflare (SYD edge)

### Security Headers ✅ 5/5
- Same security header profile as marketing site
- HSTS, CSP, X-Frame-Options (DENY), X-Content-Type-Options, Referrer-Policy all present

### SEO Tags ✅ (appropriate for dashboard)
| Tag | Value | Status |
|-----|-------|--------|
| `<title>` | "AgentGuard — Dashboard" | ✅ |
| `<meta robots>` | `noindex, nofollow` | ✅ Correct for app |
| `<link rel="canonical">` | `https://app.agentguard.dev` | ✅ |
| `og:title` | Not set | ⚠️ Acceptable for noindex page |
| `og:description` | Not set | ⚠️ Acceptable for noindex page |
| `twitter:card` | `summary_large_image` | ✅ |
| `twitter:image` | `https://agentguard.dev/social-og.png` | ✅ |

### robots.txt ✅
- Present (same content signals as main site)

### sitemap.xml ⚠️
- **Returns HTML instead of XML** — serving the SPA catch-all
- Dashboard shouldn't need sitemap (noindex), but should return 404 not HTML

### Mobile ✅
- Viewport meta tag present

### Favicon ✅
- All favicon references present (ico, 32px, 16px, apple-touch-180)
- Web manifest (`/site.webmanifest`) referenced

### 404 Behavior ⚠️
- SPA catch-all — all routes return the dashboard HTML shell

---

## 3. api.agentguard.dev (API)

### Accessibility ✅
- **Status:** 429 (rate-limited) — expected for unauthenticated requests
- **Load Time:** 0.16s (fast)
- **Response:** JSON API info with version, endpoints, and links

### Web UI
- **No web UI** — pure JSON API (correct behavior)
- Root returns API discovery JSON:
  ```json
  {
    "name": "AgentGuard Policy Engine API",
    "version": "0.8.0",
    "status": "online",
    "endpoints": { ... 51 endpoints listed ... }
  }
  ```

### Security Headers ✅ 8/8 (Excellent)
| Header | Value |
|--------|-------|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `SAMEORIGIN` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Cross-Origin-Opener-Policy | `same-origin` |
| Cross-Origin-Resource-Policy | `same-origin` |
| X-DNS-Prefetch-Control | `off` |
| X-Download-Options | `noopen` |
| X-XSS-Protection | `0` (correct — CSP preferred) |
| X-Permitted-Cross-Domain-Policies | `none` |
| Permissions-Policy | `geolocation=(), microphone=(), camera=()` |
| Origin-Agent-Cluster | `?1` |

### Rate Limiting ✅
- `X-RateLimit-Limit: 10`
- `X-RateLimit-Remaining: 0`
- `Retry-After: 60`
- Properly returns 429 with rate limit headers

### SSL Certificate ✅
- Same wildcard cert as other subdomains

### Version String ✅
- `v0.8.0` visible in API root response

---

## 4. docs.agentguard.dev (Documentation)

### Accessibility ✅
- **Status:** HTTP 200
- **Load Time:** 0.32s (142.5 KB)
- **Server:** Cloudflare (SYD edge)

### Security Headers ✅ 5/5
| Header | Value | Status |
|--------|-------|--------|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | ✅ |
| Content-Security-Policy | `default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; img-src 'self' https: data:; font-src 'self' https: data:` | ⚠️ Looser than main site |
| X-Frame-Options | `DENY` | ✅ |
| X-Content-Type-Options | `nosniff` | ✅ |
| Referrer-Policy | `strict-origin-when-cross-origin` | ✅ |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` | ✅ |

**Note:** CSP is more permissive (`'unsafe-eval'`, broad `https:`) than the marketing site. This may be needed for docs rendering but should be tightened if possible.

### SEO Tags ✅ 8/10
| Tag | Present | Value |
|-----|---------|-------|
| `<title>` | ✅ | "AgentGuard Documentation — API Reference & SDK Guide" |
| `<meta description>` | ✅ | Comprehensive |
| `<link rel="canonical">` | ✅ | `https://docs.agentguard.dev` |
| `og:title` | ✅ | Present |
| `og:description` | ✅ | Present |
| `og:image` | ✅ | `https://agentguard.dev/social-og.png` |
| `og:url` | ✅ | `https://docs.agentguard.dev` |
| `twitter:card` | ✅ | `summary_large_image` |
| **`twitter:site`** | ❌ | **MISSING** |
| **`og:site_name`** | ❌ | **MISSING** (present on main site) |
| `robots` | ✅ | `index, follow` |

### robots.txt ✅
- Present with same content signals

### sitemap.xml ❌
- **Returns HTML instead of XML** — serving the docs page as catch-all
- Should either return a valid sitemap or 404

### SSL Certificate ✅
- Same wildcard cert

### Mobile ✅
- Viewport meta tag present

### Favicon ✅
- All references present

### GitHub Links ⚠️
- References `github.com/thebotclub/AgentGuard` → **404**

### 404 Behavior ⚠️
- Returns HTTP 200 with full docs page (soft 404, SPA catch-all)

### Version String ✅
- `v0.8.0` visible in docs content

---

## 5. status.agentguard.dev ❌

- **DNS Resolution Failed** (curl exit code 6)
- No DNS record exists for this subdomain
- **Recommendation:** Either create a status page (e.g., via UptimeRobot, Betterstack, or Instatus) or remove references

---

## 6. blog.agentguard.dev ❌

- **DNS Resolution Failed** (curl exit code 6)
- No DNS record exists for this subdomain
- **Recommendation:** Either create a blog or remove references

---

## Cross-Site Issues

### 🔴 Critical Issues

| # | Issue | Affected Sites | Impact |
|---|-------|---------------|--------|
| 1 | **GitHub repo links → 404** | agentguard.dev, docs.agentguard.dev | `github.com/thebotclub/AgentGuard` returns 404. Breaks open-source credibility. | 
| 2 | **Soft 404s (HTTP 200 for missing pages)** | agentguard.dev, docs.agentguard.dev, app.agentguard.dev | SEO pollution, crawl budget waste, poor error UX |
| 3 | **app.agentguard.dev extremely slow** | app.agentguard.dev | >15s page load — likely unusable for users |

### 🟡 Medium Issues

| # | Issue | Affected Sites | Impact |
|---|-------|---------------|--------|
| 4 | **`twitter:site` meta tag missing** | agentguard.dev, docs.agentguard.dev | Twitter cards won't attribute to the brand account |
| 5 | **docs sitemap.xml returns HTML** | docs.agentguard.dev | Crawlers can't discover docs pages |
| 6 | **app sitemap.xml returns HTML** | app.agentguard.dev | Minor (noindex page), but messy |
| 7 | **Docs CSP uses `'unsafe-eval'`** | docs.agentguard.dev | Wider attack surface than necessary |
| 8 | **Sitemap references `demo.agentguard.dev`** | agentguard.dev | Not tested — may or may not resolve |
| 9 | **status.agentguard.dev doesn't exist** | N/A | No public status page for enterprise customers |
| 10 | **blog.agentguard.dev doesn't exist** | N/A | No content marketing surface |

### 🟢 Minor Issues

| # | Issue | Affected Sites | Impact |
|---|-------|---------------|--------|
| 11 | **`og:site_name` missing on docs** | docs.agentguard.dev | Minor SEO signal missing |
| 12 | **app.agentguard.dev missing `og:title`/`og:description`** | app.agentguard.dev | Low impact since noindex, but affects link previews in Slack/Teams |

---

## What's Working Well ✅

1. **Security headers are excellent** — HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy all present across all accessible sites
2. **SSL wildcard cert** covers all subdomains, valid for 81 more days
3. **SEO fundamentals strong** on marketing site — canonical URLs, OG tags, descriptions, keywords
4. **robots.txt** properly configured with AI crawler blocking and content signals
5. **API rate limiting** working correctly with proper headers
6. **Favicon** present across all sites with multiple sizes
7. **Mobile viewport** meta tag on all HTML sites
8. **noindex on dashboard** — correctly prevents indexing of authenticated content
9. **Marketing site fast** — 0.71s total load, well under 3s target
10. **Docs site fast** — 0.32s total load

---

## Overall Frontend Health Score

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Security Headers | 25% | 95/100 | 23.75 |
| SSL/TLS | 10% | 100/100 | 10.00 |
| SEO (marketing + docs) | 20% | 82/100 | 16.40 |
| Performance | 15% | 65/100 | 9.75 |
| Accessibility & Mobile | 10% | 95/100 | 9.50 |
| Error Handling (404s) | 10% | 30/100 | 3.00 |
| Infrastructure (all sites up) | 10% | 60/100 | 6.00 |

### **Overall Score: 78/100** ⚠️

**Rating: Good — with notable gaps to fix**

The marketing site and API are solid. The biggest concerns are: broken GitHub links (credibility), soft 404s (SEO), and app dashboard timeout (usability). Fixing these would push the score above 90.

---

## Recommended Priority Actions

1. **🔴 Fix GitHub repo links** — either make the repo public or remove/update the links
2. **🔴 Fix app.agentguard.dev load time** — diagnose why full page takes >15s
3. **🔴 Return proper HTTP 404** for missing pages instead of SPA catch-all
4. **🟡 Add `twitter:site` meta tag** to marketing and docs sites
5. **🟡 Create proper sitemap.xml** for docs.agentguard.dev
6. **🟡 Tighten docs CSP** — remove `'unsafe-eval'` if possible
7. **🟢 Add `og:site_name`** to docs
8. **🟢 Consider creating** status.agentguard.dev (Betterstack/UptimeRobot)
9. **🟢 Verify demo.agentguard.dev** referenced in sitemap is live

---

*Report generated automatically. Re-run to check fixes.*
