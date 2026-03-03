# AgentGuard — Production Readiness Plan

> **Date:** 2026-03-03
> **Status:** APPROVED — Ready for execution
> **Goal:** Bring AgentGuard from working MVP to production-ready state
> **Estimated effort:** 3 phases, ~5 work sessions

---

## Phase 1: Stabilize & Ship (P0 + P1 fixes)
**Goal:** Everything deployed, tested, and working. No broken code in repo.

### 1.1 — Clean up dead code & fix infrastructure
- [ ] Delete `api/db.ts` (broken PG adapter with credential injection)
- [ ] Delete `packages/{api` directory (artifact from bad mkdir)
- [ ] Remove `DB_TYPE=postgres` env var from Azure container (misleading — we're not using PG yet)
- [ ] Keep `DATABASE_URL` env var for when PG migration is ready
- [ ] Fix `Dockerfile.api`: `node:20-alpine` → `node:22-alpine`
- [ ] Add startup warning if `DB_TYPE=postgres` is set: log that PG migration is pending, falling back to SQLite

### 1.2 — Verify & redeploy
- [ ] Confirm latest commit is deployed (check container image SHA vs git HEAD)
- [ ] If stale, force rebuild + redeploy via `az acr build` + `az containerapp update`
- [ ] Verify all validation endpoints work: `/agents/:id/validate`, `/readiness`, `/certify`, `/mcp/admit`
- [ ] Verify all existing endpoints still work (regression check)
- [ ] CI health check: increase cold-start wait from 30s to 60s

### 1.3 — Write tests for validation endpoints
- [ ] Create `tests/validation.test.ts` covering:
  - Agent validation (declared tools → policy coverage check)
  - Agent readiness lifecycle: registered → validated → certified → expired
  - Agent certification (requires 100% coverage, generates token, 30-day expiry)
  - MCP admission pre-flight (`/mcp/admit`)
  - Error cases: missing agent, missing tools, auth failures

### 1.4 — Security hardening (quick wins)
- [ ] Add webhook URL validation: HTTPS only, block private IPs, block metadata endpoints
- [ ] Add Zod schemas for the 5 most critical request bodies (evaluate, signup, agents create, validate, mcp admit)
- [ ] Remove `DB_TYPE` env var from production until migration is ready

**Exit criteria:** All endpoints working in production, test suite green, no dead code, no security vulnerabilities in active code.

---

## Phase 2: PostgreSQL Migration
**Goal:** Persistent data that survives container restarts.

### 2.1 — Refactor server.ts to use IDatabase interface
This is the big lift. Strategy: **incremental extraction, not big-bang rewrite.**

- [ ] Validate `api/db-interface.ts` — ensure it covers ALL operations used by server.ts
- [ ] Audit every `db.prepare()`, `db.exec()`, `stmt.run/get/all()` call in server.ts
- [ ] Create `api/db-factory.ts` — clean factory that returns `IDatabase` based on `DB_TYPE`
- [ ] Complete `api/db-sqlite.ts` — async wrappers matching `IDatabase`, tested against current schema
- [ ] Refactor server.ts route-by-route:
  1. Auth middleware (`getApiKey`, `getTenant`)
  2. Evaluate endpoint (audit event creation, hash chain)
  3. Agents CRUD
  4. Webhooks CRUD
  5. Phase 2 routes (rate limits, costs)
  6. MCP routes
  7. Validation routes
  8. Dashboard/stats endpoints
- [ ] Run full test suite after each route migration — must stay green
- [ ] Delete inline prepared statements from server.ts as routes migrate

### 2.2 — Complete PostgreSQL adapter
- [ ] Rewrite `api/db-postgres.ts` — proper async `pg` Pool, SSL, connection management
- [ ] Convert SQLite schema to PostgreSQL (AUTOINCREMENT → SERIAL, datetime → TIMESTAMPTZ, TEXT → JSONB where appropriate)
- [ ] Add migration runner (schema versioning)
- [ ] Test against `agentguard-db.postgres.database.azure.com`
- [ ] Add `DB_TYPE` switching in factory: `postgres` → pg Pool, `sqlite` → better-sqlite3

### 2.3 — Deploy & validate
- [ ] Set `DB_TYPE=postgres` on Azure container
- [ ] Verify all endpoints work with PostgreSQL backend
- [ ] Run load test: 100 concurrent evaluations
- [ ] Monitor for connection pool exhaustion, query timeouts
- [ ] Keep SQLite as default for `npm test` and local dev

**Exit criteria:** Production running on PostgreSQL, data persists across restarts, SQLite still works for dev/test, all tests pass on both backends.

---

## Phase 3: Production Polish
**Goal:** Investor-demo-ready. Professional-grade codebase.

### 3.1 — Modularize server.ts
Extract the 1734-line monolith into:
```
api/
├── server.ts              ← App setup, middleware, mount routes (~200 lines)
├── routes/
│   ├── evaluate.ts        ← POST /evaluate
│   ├── agents.ts          ← CRUD /agents
│   ├── audit.ts           ← /audit, /audit/verify
│   ├── webhooks.ts        ← CRUD /webhooks
│   ├── auth.ts            ← /signup, /killswitch, /usage
│   └── dashboard.ts       ← /dashboard/stats, /dashboard/feed
├── middleware/
│   ├── auth.ts            ← requireTenantAuth, requireAdminAuth
│   ├── rate-limit.ts      ← IP rate limiting
│   └── cors.ts            ← CORS config
├── validation-routes.ts   ← Already extracted ✅
├── phase2-routes.ts       ← Already extracted ✅
├── mcp-routes.ts          ← Already extracted ✅
└── mcp-middleware.ts       ← Already extracted ✅
```

### 3.2 — Hash API keys
- [ ] Add bcrypt hashing for new API keys (store hash, return plaintext once)
- [ ] Add key prefix storage for display (`ag_live_xxxx...xxxx`)
- [ ] Migration: hash existing plaintext keys
- [ ] Update auth lookup to bcrypt.compare()

### 3.3 — Update architecture docs
- [ ] Reconcile ARCHITECTURE.md with reality (Express, Azure, SQLite/PG)
- [ ] Update ROADMAP.md to reflect what's been shipped
- [ ] Add IMPLEMENTATION_NOTES.md documenting the divergence and rationale

### 3.4 — CI improvements
- [ ] Make TypeScript type checking blocking (after fixing type errors)
- [ ] Configure `AGENTGUARD_API_KEY` secret for validate workflow
- [ ] Add integration test job that hits deployed API
- [ ] Publish GitHub Action to marketplace

### 3.5 — SDK tests
- [ ] Tests for TypeScript SDK validation methods
- [ ] Tests for Python SDK validation methods
- [ ] Integration test: SDK → live API → validate → certify flow

**Exit criteria:** Clean modular codebase, hashed API keys, docs match reality, full CI coverage, SDKs tested.

---

## Execution Strategy

**Don't rewrite. Iterate.**

Each phase is independently shippable. Phase 1 can be done in one session. Phase 2 is the biggest lift (3-5 sessions with sub-agents). Phase 3 is polish.

**Sub-agent allocation for Phase 2:**
- Agent A: Refactor server.ts routes 1-4 to use IDatabase
- Agent B: Refactor server.ts routes 5-8 to use IDatabase
- Agent C: Complete + test db-postgres.ts against Azure PG
- Integration pass: Main session merges, resolves conflicts, deploys

**Testing strategy:** Run `npm test` after every change. Never merge red tests. Add tests BEFORE migrating each route.

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| PG migration breaks existing endpoints | Medium | High | Migrate one route at a time, full test suite after each |
| Sub-agents create conflicting changes | Medium | Medium | Assign non-overlapping file ownership |
| Azure Files SQLite corruption | Low | High | PG migration eliminates this; ephemeral /tmp is fine for beta |
| CI pipeline deploys broken code | Medium | High | Add blocking type check + integration test before deploy |
| Monolith extraction breaks imports | Low | Medium | Use barrel exports, test after each extraction |

---

*Plan authored 2026-03-03. Execute Phase 1 immediately.*
