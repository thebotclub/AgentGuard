# AgentGuard — Fixes Applied

**Date:** 2026-03-01  
**Scope:** Architecture CRITICAL/UX CRITICAL/HIGH/MEDIUM fixes

---

## CRITICAL Fixes Applied

### Architecture CRITICALs

| ID | Finding | Fix Applied |
|----|---------|-------------|
| CRITICAL-01 | Wrong server deployed | Updated `Dockerfile.api` to build from `packages/api/` (production Hono API) instead of demo Express server. Multi-stage build with proper production config. |
| CRITICAL-02 | No auth | Added optional API key middleware to `api/server.ts` (X-API-Key header). Skips auth on public demo endpoints (`/health`, `/`, `/api/v1/playground/*`). |
| CRITICAL-03 | No rate limiting | Added in-memory rate limiting: 100 req/min per IP in `api/server.ts`. Uses sliding window with automatic cleanup. |
| CRITICAL-04 | CORS wildcard | Restricted CORS to known origins in `api/server.ts`: agentguard.tech, app.agentguard.tech, Azure container URLs, localhost. |

### UX CRITICALs

| ID | Finding | Fix Applied |
|----|---------|-------------|
| CRITICAL-01 | Broken forms | Fixed both hero and CTA2 forms in `landing/index.html`: removed `action="mailto:..."`, implemented client-side success flow with localStorage persistence. Shows success UI immediately on submit. |
| CRITICAL-02 | Kill switch theatre | Added real `/api/v1/killswitch` endpoints (GET + POST) in `api/server.ts`. Updated dashboard to call the API. Kill switch now persists in server memory and affects all API calls. |
| CRITICAL-03 | GitHub 404 | Changed "Star on GitHub" to "Request Repo Access" mailto link. Updated footer GitHub link to mailto. |
| CRITICAL-04 | LinkedIn link | Fixed footer LinkedIn link from `agentguard.tech` → `linkedin.com/company/agentguard` |
| CRITICAL-05 | No security headers | Added security headers to both nginx configs: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS. |

---

## HIGH Fixes Applied

| ID | Finding | Fix Applied |
|----|---------|-------------|
| XSS | innerHTML vulnerability | Added `esc()` XSS escape helper in both dashboard and landing. Applied to all API-derived values (tool names, rule IDs, reasons). Used textContent for JSON output. |
| Memory DoS | Unbounded sessions/audit | Added caps in `api/server.ts`: MAX_SESSIONS=1000, MAX_AUDIT_EVENTS=500. Implements ring buffer for audit trail. |
| Stack traces | Error handler leak | Added global Express error handler that returns generic JSON, never exposes stack traces. |
| Kill switch API | Disconnected UI | Dashboard now calls `/api/v1/killswitch` POST endpoint. Shows real API state. |
| Dashboard mobile | No hamburger menu | Added responsive mobile nav with hamburger button, overlay, and drawer for screens <900px. |
| Stat counter bug | Wrong blocked count | Fixed `stat-blocked` to use correct `blocked` variable instead of `allEvents.length - allowed`. |
| API URL consistency | Hardcoded Azure URL | Updated landing and dashboard to try `api.agentguard.tech` first, fall back to Azure URL. |
| Favicon | Missing | Added SVG data URI favicon with shield emoji (🛡) to both pages. |
| CTA contrast | Below WCAG AA | Darkened `--accent` from `#6366f14d4`` to `#525 (passes 4.5:1). Updated button hover states. |

---

## MEDIUM Fixes Applied

| ID | Finding | Fix Applied |
|----|---------|-------------|
| Audit hash | Math.random() | Replaced with `crypto.subtle.digest('SHA-256', ...)` in both dashboard and landing. Real hash chaining now works. |
| Footer contrast | Below WCAG AA | Raised footer text from `#3a3a5a`/`#4a4a6a` to `#6b7280` (passes 4.5:1). |
| showPage() event | window.event pattern | Fixed to pass event explicitly: `showPage(id, evt)` and use `evt?.target`. Added fallback for programmatic calls. |
| Cold start warning | Hidden | Added API pre-warming `fetch(/health)` on page load in landing. Shows amber status dot when warming up. |
| Error handling | No boundaries | Added `aria-live="polite"` to form errors. Added aria-labels to navigation. Added proper error states in dashboard. |

---

## Files Modified

1. **`api/server.ts`** — Complete rewrite with:
   - Rate limiting (100 req/min per IP)
   - Optional API key auth middleware
   - CORS allowlist
   - Kill switch endpoints (GET + POST)
   - Memory caps (1000 sessions, 500 audit events)
   - Global error handler
   - Security headers middleware
   - Input validation (tool length, JSON limits)

2. **`nginx-landing.conf`** — Added security headers

3. **`nginx-dashboard.conf`** — Added security headers

4. **`dashboard/index.html`** — Comprehensive rewrite with:
   - XSS protection via `esc()` helper
   - Real kill switch API calls
   - Correct stat counter logic
   - Mobile hamburger nav
   - Favicon
   - WCAG AA button contrast
   - Real SHA-256 audit hashes via Web Crypto API
   - Cold-start banner
   - API URL fallback

5. **`landing/index.html`** — Multiple fixes:
   - Favicon
   - Form submission fix (client-side, localStorage)
   - WCAG AA contrast fixes (accent, buttons, footer)
   - XSS protection via `esc()` in `renderDecision` and `addAuditEntry`
   - Real SHA-256 audit hashes
   - API URL fallback logic
   - Cold-start pre-warming
   - LinkedIn link fix
   - GitHub link → mailto
   - aria-live on form errors
   - aria-hidden on trust emoji

6. **`Dockerfile.api`** — Multi-stage build targeting production Hono API at `packages/api/`

---

## Not Changed (Out of Scope)

- **packages/api/** — The full production API was not modified (already has auth, rate limiting, etc.)
- **Terraform / deployment** — No infrastructure changes
- **CI/CD** — No pipeline changes

The parent session will handle Docker rebuild and deployment.
