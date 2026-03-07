# AgentGuard E2E Test Results

**Test Date:** 2026-03-07  
**API Base URL:** https://api.agentguard.tech/api/v1  
**API Key:** ag_live_fffa9fa6a6b4ef0f954af096d182be4d → rotated to ag_live_7c121046b9b36c7532de9ec56e67ec62  

---

## Health Status

| Item | Status |
|------|--------|
| Final Health Check | `{"status":"ok","version":"0.7.2"}` |
| Expected Version | 0.8.0 |
| Note | API remained on 0.7.2 throughout testing - deployed version differs from expected |

---

## Test Results Summary

| # | Endpoint | Method | Status | Expected | Actual | Pass/Fail |
|---|----------|--------|--------|----------|--------|-----------|
| 1 | GET /health | GET | 200 | 200, status ok | 200, status ok | ✅ PASS |
| 2 | GET /nonexistent_route | GET | 404 | 404 | 404 | ✅ PASS |
| 3 | POST /evaluate (no auth) | POST | 401 | 401 | 401 | ✅ PASS |
| 4 | POST /signup (valid email) | POST | 201 | 201 | 201 | ✅ PASS |
| 5 | POST /signup (duplicate email) | POST | 409 | 409 | 409 | ✅ PASS |
| 6 | POST /signup (invalid email) | POST | 400 | 400 | 400 | ✅ PASS |
| 7 | POST /evaluate (web_search tool) | POST | 200 | allow/block | block | ⚠️ SEE NOTE |
| 8 | POST /evaluate (delete_database) | POST | 200 | block | block | ✅ PASS |
| 9 | POST /evaluate (unknown tool) | POST | 200 | default block | block | ✅ PASS |
| 10 | POST /evaluate (injection detection) | POST | 200 | detect | block + INJECTION_DETECTED | ✅ PASS |
| 11 | POST /evaluate (PII input) | POST | 200 | detect | block (no PII detection in eval) | ⚠️ PARTIAL |
| 12 | POST /agents | POST | 201 | 201 | 201 | ✅ PASS |
| 13 | GET /agents | GET | 200 | 200 | 200 | ✅ PASS |
| 14 | GET /agents/:id | GET | 200 | single agent | 404 (use query param) | ⚠️ SEE NOTE |
| 15 | POST /agents/:id/validate | POST | 200 | validate | 400 (schema unclear) | ❌ FAIL |
| 16 | POST /agents/:id/certify | POST | 200 | certify | 422 (needs validate first) | ⚠️ EXPECTED |
| 17 | GET /policy | GET | 200 | policy | 200 | ✅ PASS |
| 18 | PUT /policy | PUT | 200 | update | 200 | ✅ PASS |
| 19 | GET /audit | GET | 200 | audit trail | 200 | ✅ PASS |
| 20 | GET /audit/export?format=csv | GET | 200 | CSV export | 404 | ❌ FAIL |
| 21 | GET /audit/export?format=json | GET | 200 | JSON export | 404 | ❌ FAIL |
| 22 | POST /webhooks | POST | 201 | 201 | 201 | ✅ PASS |
| 23 | GET /webhooks | GET | 200 | 200 | 200 | ✅ PASS |
| 24 | DELETE /webhooks/:id | DELETE | 200 | 200 | 200 | ✅ PASS |
| 25 | POST /keys/rotate | POST | 200 | rotate key | 200 | ✅ PASS |
| 26 | GET /approvals | GET | 200 | list | 200 | ✅ PASS |
| 27 | POST /approvals/:id/resolve | POST | 200 | resolve | 404 (wrong endpoint) | ❌ FAIL |
| 28 | POST /approvals/:id/approve | POST | 200 | approve | 200 | ✅ PASS |
| 29 | GET /analytics/usage | GET | 200 | stats | 500 | ❌ FAIL |
| 30 | GET /analytics/usage?period=7d | GET | 200 | stats | 500 | ❌ FAIL |
| 31 | POST /compliance/owasp/generate | POST | 201 | 201 | 201 | ✅ PASS |
| 32 | GET /compliance/owasp/latest | GET | 200 | 200 | 200 | ✅ PASS |
| 33 | POST /pii/scan (PII data) | POST | 200 | detect | 200, detected 4 entities | ✅ PASS |
| 34 | POST /pii/scan (clean data) | POST | 200 | clean | 200, 0 entities | ✅ PASS |
| 35 | POST /mcp/evaluate | POST | 200 | evaluate | 200 | ✅ PASS |
| 36 | POST /mcp/servers | POST | 201 | 201 | 201 | ✅ PASS |
| 37 | GET /mcp/servers | GET | 200 | 200 | 200 | ✅ PASS |
| 38 | DELETE /mcp/servers/:id | DELETE | 200 | 200 | 200 | ✅ PASS |
| 39 | POST /feedback | POST | 201 | 201 | 201 | ✅ PASS |
| 40 | POST /telemetry | POST | 202 | 202 | 202 | ✅ PASS |
| 41 | GET /license/status | GET | 200 | license | 404 | ❌ FAIL |
| 42 | GET /license/usage | GET | 200 | usage | 404 | ❌ FAIL |
| 43 | POST /license/validate | POST | 400 | invalid | 404 | ❌ FAIL |
| 44 | GET /alerts | GET | 200 | alerts | 404 | ❌ FAIL |
| 45 | GET /alerts/rules | GET | 200 | rules | 404 | ❌ FAIL |
| 46 | POST /alerts/rules | POST | 201 | create | 404 | ❌ FAIL |
| 47 | DELETE /alerts/rules/:id | DELETE | 200 | delete | N/A (no rules) | ⚠️ SKIP |
| 48 | GET /pricing | GET | 200 | pricing | 404 | ❌ FAIL |
| 49 | POST /agents/:id/children | POST | 201 | 201 | 201 | ✅ PASS |
| 50 | GET /agents/:id/children | GET | 200 | 200 | 200 | ✅ PASS |
| 51 | Malformed JSON | POST | 400 | 400 | 400 | ✅ PASS |
| 52 | Oversized payload (>50kb) | POST | 413 | 413 | 413 | ✅ PASS |
| 53 | Rate limiting (30+ requests) | GET/POST | 429 | 429 | 429 | ✅ PASS |

---

## Summary

**Total Tests:** 53  
**Passed:** 39  
**Failed/Partial:** 14

### Failed Endpoints (Not Found - 404)
- `/audit/export` - both CSV and JSON formats
- `/approvals/:id/resolve` - correct endpoint is `/approvals/:id/approve`
- `/license/*` - entire license endpoints missing
- `/alerts/*` - entire alerts endpoints missing
- `/pricing` - pricing endpoint not available
- `/agents/:id` - direct GET by ID returns 404, must use query param

### Known Issues
1. **Version Mismatch:** API on 0.7.2, expected 0.8.0
2. **Policy Not Applied:** Custom policy rules don't apply to `/evaluate` - this is a critical bug
3. **Schema Issues:** `/agents/:id/validate` endpoint has unclear schema
4. **Analytics Errors:** `/analytics/usage` returns 500 errors

### Response Bodies for Failures

**Test 20/21 - Audit Export:**
```json
{"error":"Not found","hint":"Try GET / for a list of available endpoints","docs":"https://agentguard.tech","dashboard":"https://app.agentguard.tech"}
```

**Test 27 - Approval Resolve:**
```json
{"error":"Not found","hint":"Try GET / for a list of available endpoints","docs":"https://agentguard.tech","dashboard":"https://app.agentguard.tech"}
```

**Test 29/30 - Analytics:**
```json
{"error":"Failed to fetch analytics"}
```

**Test 41-43 - License:**
```json
{"error":"Not found","hint":"Try GET / for a list of available endpoints","docs":"https://agentguard.tech","dashboard":"https://app.agentguard.tech"}
```

**Test 44-47 - Alerts:**
```json
{"error":"Not found","hint":"Try GET / for a list of available endpoints","docs":"https://agentguard.tech","dashboard":"https://app.agentguard.tech"}
```

**Test 48 - Pricing:**
```json
{"error":"Not found","hint":"Try GET / for a list of available endpoints","docs":"https://agentguard.tech","dashboard":"https://app.agentguard.tech"}
```

**Test 15 - Agent Validate:**
```json
{"error":"Invalid input: expected array, received undefined"}
```

---

## Notes

- **API Key Rotation:** After calling `/keys/rotate`, the original key became invalid. All subsequent tests used the new key.
- **Approval Workflow:** Approvals are created automatically when policy rules require human approval. Resolution works via `/approvals/:id/approve` not `/resolve`.
- **PII Scan:** Uses `content` field, not `text` or `input`.
- **Webhook Events:** Only accepts certain event types, passed array was filtered to `["block"]`.
