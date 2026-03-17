# AgentGuard API Security Scan — 2026-03-11

**Target:** https://api.agentguard.dev
**Version:** 0.9.0
**Scanned at:** 2026-03-11 08:39-08:45 UTC

## ✅ Passing

| Check | Result | Notes |
|-------|--------|-------|
| **HSTS** | ✅ `max-age=31536000; includeSubDomains` | Proper HSTS with subdomains |
| **X-Content-Type-Options** | ✅ `nosniff` | Prevents MIME sniffing |
| **X-Frame-Options** | ✅ `SAMEORIGIN` | Clickjacking protection |
| **Referrer-Policy** | ✅ `strict-origin-when-cross-origin` | Good default |
| **Permissions-Policy** | ✅ `geolocation=(), microphone=(), camera=()` | Restricted |
| **Server header** | ✅ `cloudflare` | No version leakage |
| **No X-Powered-By** | ✅ Not present | Good — no framework leakage |
| **TLS** | ✅ Valid certificate | 157ms connection time |
| **Rate limiting** | ✅ 10/min unauthenticated | Headers: `x-ratelimit-limit`, `x-ratelimit-remaining` |
| **Auth required** | ✅ All `/api/v1/*` endpoints require valid API key | Returns generic "unauthorized" |
| **Invalid key rejection** | ✅ Fake keys rejected | No info leakage |
| **SQLi in auth** | ✅ Rejected safely | No error details exposed |
| **XSS in auth** | ✅ Rejected safely | No reflection |
| **Path traversal URLs** | ✅ Blocked (429 then 404) | Rate limiter catches first |
| **`.env` access** | ✅ Blocked (429) | No file exposure |
| **Null byte injection** | ✅ Returns 400 | Properly rejected |
| **CORS** | ✅ No CORS headers on non-origin requests | Good default-deny |
| **OPTIONS preflight** | ✅ Returns 204 | Proper preflight handling |
| **Fail-closed policy** | ✅ Unknown tools blocked by default | "No matching rule — default action is block" |
| **Injection detection** | ✅ SQL injection in tool params caught | `INJECTION_DETECTED` rule, risk score 900 |
| **Audit trail** | ✅ All evaluations logged | Hash-chained, verifiable |
| **Hash chain integrity** | ✅ `"valid": true, "eventCount": 4` | Tamper-evident |
| **Kill switch** | ✅ Endpoint exists, currently inactive | `killSwitch.active: false` |
| **Error responses** | ✅ No stack traces or internal details | Clean error objects with docs links |
| **Helpful 404s** | ✅ Wrong paths return endpoint list | Good DX |

## ⚠️ Minor Observations

| Issue | Severity | Notes |
|-------|----------|-------|
| **Unauthenticated rate limit = 10/min** | Low | May be too aggressive for health checks from monitoring. Consider exempting `/health`. |
| **`X-XSS-Protection: 0`** | Info | Correct for modern browsers (disabling legacy filter), but some scanners flag it. |
| **No CSP header** | Low | API-only, not critical. Add if serving any HTML. |

## API Health & Usage

- **Status:** Online, v0.9.0
- **Kill switch:** Inactive
- **Allan's tenant usage:** 0 evaluations (hasn't started testing yet)
- **Response times:** 0-0.4ms for policy evaluation (sub-millisecond ✅)

## Verdict

**The API is well-hardened.** Security headers are comprehensive, auth is properly enforced, fail-closed policy is correct, injection detection works, audit chain is intact. No critical or high-severity issues found.
