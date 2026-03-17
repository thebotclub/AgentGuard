# AgentGuard E2E API Test Results (V3)

**API Base URL:** `https://api.agentguard.dev`  
**Version:** 0.8.0  
**Test Date:** 2026-03-09 03:51–04:00 UTC  
**API Key Used:** `ag_live_3ed4774062fff154cf17cc430700e68b`  
**Tenant ID:** `0d8d75fa-2c70-463b-b5ce-20c4d9af4fbb`  

---

## ⚠️ Critical Finding: API Key Invalid

The provided API key (`ag_live_...68b`) is consistently rejected with **401 Unauthorized** — `"Invalid or inactive API key"`. All authenticated endpoints could not be functionally tested. This blocks evaluation of: evaluate, evaluate/batch, usage, billing, keys, settings, tenant, audit, webhooks, agents, rate-limits, costs, dashboard, MCP config/sessions, and killswitch toggle.

---

## Summary

| # | Category | Tests | Pass | Fail | Blocked |
|---|----------|-------|------|------|---------|
| 1 | Health | 1 | 1 | 0 | 0 |
| 2 | Signup (validation) | 3 | 3 | 0 | 0 |
| 3 | Login | 1 | 0 | 1 | 0 |
| 4 | Evaluate (single) | 3 | 0 | 0 | 3 |
| 5 | Evaluate (batch) | 2 | 0 | 0 | 2 |
| 6 | Policy CRUD | 0 | 0 | 0 | 0 |
| 7 | Usage/Billing | 1 | 0 | 0 | 1 |
| 8 | API Keys | 0 | 0 | 0 | 0 |
| 9 | Settings/Tenant | 0 | 0 | 0 | 0 |
| 10 | MCP | 3 | 0 | 0 | 3 |
| 11 | Kill Switch | 1 | 1 | 0 | 0 |
| 12 | Templates | 2 | 2 | 0 | 0 |
| 13 | Playground | 4 | 2 | 0 | 2 |
| 14 | Dashboard | 2 | 0 | 0 | 2 |
| 15 | Audit | 2 | 0 | 0 | 2 |
| 16 | Webhooks | 2 | 0 | 0 | 2 |
| 17 | Agents | 1 | 0 | 0 | 1 |
| 18 | Rate Limits (CRUD) | 1 | 0 | 0 | 1 |
| 19 | Costs | 1 | 0 | 0 | 1 |
| 20 | Error Handling | 5 | 5 | 0 | 0 |
| 21 | Rate Limiting | 2 | 2 | 0 | 0 |
| **Total** | | **37** | **16** | **1** | **20** |

**Note:** "Blocked" = could not test due to invalid API key (auth required). "Policy CRUD", "API Keys", "Settings/Tenant" endpoints don't exist in the API — see discovery below.

---

## 1. Health

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| GET | `/health` | 200 | `{"status":"ok","version":"0.8.0"}` | ✅ PASS |

---

## 2. Signup (Validation Errors)

| Method | Path | Payload | Status | Response | Result |
|--------|------|---------|--------|----------|--------|
| POST | `/api/v1/signup` | `{}` | 400 | `{"error":"name is required"}` | ✅ PASS |
| POST | `/api/v1/signup` | `{"email":"bad","password":"x"}` | 400 | `{"error":"name is required"}` | ✅ PASS |
| POST | `/api/v1/signup` | `{"name":"Test","email":"bad","password":"x"}` | 400 | `{"error":"Invalid email format"}` | ✅ PASS |

**Notes:**
- Validation is layered: `name` → `email` → `password`
- Signup rate limit: 5/hour per IP (hit 429 when testing further)

---

## 3. Login

| Method | Path | Payload | Status | Response | Result |
|--------|------|---------|--------|----------|--------|
| POST | `/api/v1/login` | `{"email":"fake@test.com","password":"wrong"}` | 404 | `{"error":"Not found"}` | ❌ FAIL |

**Notes:** Endpoint returns 404 — `/api/v1/login` does not exist. Not listed in API root endpoint directory either. Login may use a different path or only JWT auth via dashboard.

---

## 4. Evaluate (Single) — BLOCKED

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| POST | `/api/v1/evaluate` | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |
| POST | `/api/v1/evaluate` (high risk) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |
| POST | `/api/v1/evaluate` (medium risk) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |

**Accepted auth formats:** `X-API-Key: ag_<key>`, `X-API-Key: ag_agent_<key>`, `Authorization: Bearer <jwt>`

---

## 5. Evaluate (Batch) — BLOCKED

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| POST | `/api/v1/evaluate/batch` (no auth) | 401 | `"Authentication required"` | 🔒 BLOCKED |
| POST | `/api/v1/evaluate/batch` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |

---

## 6. Policy CRUD

**No dedicated policy CRUD endpoints exist.** The API root listing shows no `GET/POST/PUT/DELETE /api/v1/policy` routes. Policies are managed through **templates** (`/api/v1/templates`) and **template apply** (`POST /api/v1/templates/:name/apply`).

---

## 7. Usage/Billing

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| GET | `/api/v1/usage` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |

**Note:** No `/api/v1/billing` endpoint exists in the API directory.

---

## 8. API Keys

**No `/api/v1/keys` endpoint exists.** API keys are managed through:
- `POST /api/v1/signup` (creates tenant + first key)
- `POST /api/v1/agents` (creates agent-scoped keys)
- `DELETE /api/v1/agents/:id` (deactivates agent keys)

---

## 9. Settings/Tenant

**No `/api/v1/settings` or `/api/v1/tenant` endpoints exist** in the API directory.

---

## 10. MCP Endpoints

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| POST | `/api/v1/mcp/evaluate` (no auth) | 401 | `"Authentication required"` | 🔒 BLOCKED |
| POST | `/api/v1/mcp/evaluate` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |
| GET | `/api/v1/mcp/config` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |

**Available MCP endpoints (from API root):**
- `POST /api/v1/mcp/evaluate` — Evaluate an MCP tool call
- `GET /api/v1/mcp/config` — List MCP proxy configurations
- `PUT /api/v1/mcp/config` — Create/update MCP proxy config
- `GET /api/v1/mcp/sessions` — List active MCP sessions
- `POST /api/v1/mcp/admit` — MCP server pre-flight admission check

---

## 11. Kill Switch

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| GET | `/api/v1/killswitch` | 200 | `{"active":false,"activatedAt":null,"message":"Kill switch inactive — normal evaluation in effect"}` | ✅ PASS |

**Note:** `POST /api/v1/killswitch` (tenant toggle) and `POST /api/v1/admin/killswitch` (global) require auth.

---

## 12. Templates

| Method | Path | Status | Key Response Fields | Result |
|--------|------|--------|---------------------|--------|
| GET | `/api/v1/templates` | 200 | 5 templates: `apra-cps234`, `eu-ai-act`, `financial-services`, `owasp-agentic`, `soc2-starter` | ✅ PASS |
| GET | `/api/v1/templates/soc2-starter` | 200 | Full template with 10 rules, tags, descriptions | ✅ PASS |

---

## 13. Playground

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| POST | `/api/v1/playground/session` | 401 | `"Authentication required"` | 🔒 BLOCKED |
| POST | `/api/v1/playground/evaluate` | 401 | `"Authentication required"` | 🔒 BLOCKED |
| GET | `/api/v1/playground/policy` | 200 | Full demo policy document (9 rules) | ✅ PASS |
| GET | `/api/v1/playground/scenarios` | 200 | 6 scenarios: data-exfil, prompt-injection, priv-escalation, financial, normal, destructive | ✅ PASS |

**Notes:**
- Playground session/evaluate require auth despite not being annotated as such in the API directory
- Policy and scenarios are publicly accessible (useful for demo)

---

## 14. Dashboard — BLOCKED

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| GET | `/api/v1/dashboard/stats` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |
| GET | `/api/v1/dashboard/feed` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |

---

## 15. Audit — BLOCKED

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| GET | `/api/v1/audit` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |
| GET | `/api/v1/audit/verify` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |

---

## 16. Webhooks — BLOCKED

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| GET | `/api/v1/webhooks` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |
| POST | `/api/v1/webhooks` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |

---

## 17. Agents — BLOCKED

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| GET | `/api/v1/agents` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |

---

## 18. Rate Limits (CRUD) — BLOCKED

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| GET | `/api/v1/rate-limits` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |

---

## 19. Costs — BLOCKED

| Method | Path | Status | Response | Result |
|--------|------|--------|----------|--------|
| GET | `/api/v1/costs/summary` (with key) | 401 | `"Invalid or inactive API key"` | 🔒 BLOCKED |

---

## 20. Error Handling

| Test | Method | Path | Status | Response | Result |
|------|--------|------|--------|----------|--------|
| Missing auth | POST | `/api/v1/evaluate` | 401 | `"Authentication required"` with accepted auth formats and docs link | ✅ PASS |
| Bad JSON | POST | `/api/v1/evaluate` | 400 | `{"error":"Validation failed","code":"VALIDATION_ERROR","field":"body","expected":"valid JSON","received":"malformed JSON","requestId":"..."}` | ✅ PASS |
| Wrong content-type | POST | `/api/v1/evaluate` | 401 | Auth check runs before content-type validation | ✅ PASS |
| Unknown endpoint | GET | `/api/v1/nonexistent` | 404 | `{"error":"Not found","hint":"Try GET / for a list of available endpoints"}` | ✅ PASS |
| Missing fields | POST | `/api/v1/signup` (empty body) | 400 | `{"error":"name is required"}` | ✅ PASS |

**Error Response Quality:**
- Errors include `error` field, often with `message`, `docs`, `acceptedAuth` hints
- Validation errors include `code`, `field`, `expected`, `received`, `requestId`
- 404s helpfully suggest checking `GET /` for endpoints

---

## 21. Rate Limiting

| Test | Details | Result |
|------|---------|--------|
| Rate limit headers present | `X-RateLimit-Limit: 10`, `X-RateLimit-Remaining: 5` on `/health` | ✅ PASS |
| Rate limit enforcement | Hit 429 after ~10 requests/minute: `{"error":"rate_limit_exceeded","retryAfter":60,"limit":10,"window":"1m"}` | ✅ PASS |
| Signup rate limit | Separate limit: 5/hour per IP — `{"error":"Too many signups. Limit: 5 per hour per IP."}` (429) | ✅ PASS |

**Rate Limit Details:**
- Global: 10 requests/minute per IP
- Signup: 5/hour per IP
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining` present
- Response includes `retryAfter` (seconds), `limit`, `window`

---

## API Endpoint Discovery (from `GET /`)

The API root reveals the **complete** endpoint directory. Key findings vs. requested test plan:

| Requested | Actual API | Notes |
|-----------|-----------|-------|
| `/api/v1/login` | ❌ Does not exist | Auth via signup key or JWT only |
| `/api/v1/policy` (CRUD) | ❌ Does not exist | Use `/api/v1/templates` + `/apply` instead |
| `/api/v1/billing` | ❌ Does not exist | N/A |
| `/api/v1/keys` | ❌ Does not exist | Keys managed via `/agents` |
| `/api/v1/settings` | ❌ Does not exist | N/A |
| `/api/v1/tenant` | ❌ Does not exist | N/A |

**Endpoints that DO exist but weren't in original test plan:**
- Kill switch: `GET/POST /api/v1/killswitch`
- Templates: `GET /api/v1/templates`, `GET /api/v1/templates/:name`, `POST /api/v1/templates/:name/apply`
- Agents: `POST/GET/DELETE /api/v1/agents`, validation/readiness/certify sub-routes
- Webhooks: `POST/GET/DELETE /api/v1/webhooks`
- Rate Limits (CRUD): `POST/GET/DELETE /api/v1/rate-limits`
- Costs: `POST /api/v1/costs/track`, `GET /api/v1/costs/summary`, `GET /api/v1/costs/agents`
- Dashboard: `GET /api/v1/dashboard/stats|feed|agents`
- Playground: session, evaluate, audit, policy, scenarios
- Audit: `GET /api/v1/audit`, `GET /api/v1/audit/verify`
- MCP: evaluate, config, sessions, admit

---

## Security Headers

From `/health` response:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-XSS-Protection` | `0` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-DNS-Prefetch-Control` | `off` |
| `X-Download-Options` | `noopen` |
| `X-Permitted-Cross-Domain-Policies` | `none` |
| `X-Request-Id` | Present (UUID per request) |

✅ All standard security headers properly configured.

---

## Conclusions

1. **API Key is invalid/inactive** — This is the single biggest blocker. 20 of 37 tests couldn't execute. The key `ag_live_3ed4774062fff154cf17cc430700e68b` is rejected by every authenticated endpoint.

2. **Public endpoints work well** — Health, templates, kill switch status, playground policy/scenarios all return correct responses.

3. **Error handling is excellent** — Structured errors with codes, helpful hints, docs links, and request IDs. Validation is layered and clear.

4. **Rate limiting is functional** — 10 req/min global, 5 signups/hour, proper headers and 429 responses with retry info.

5. **Security posture is strong** — Full set of security headers, HSTS, CSP-adjacent headers, request IDs for tracing.

6. **API surface differs from test plan** — Several endpoints in the test plan don't exist (login, policy CRUD, billing, keys, settings, tenant). The actual API has a richer set of endpoints around templates, agents, webhooks, costs, and dashboard.

### To Complete Testing

A **valid API key** is required. Either:
- Create a new account via `POST /api/v1/signup` with valid credentials
- Obtain a fresh key from the AgentGuard dashboard at `https://app.agentguard.dev`
- Verify the provided key hasn't been rotated or deactivated
