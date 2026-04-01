# AgentGuard Architecture Review

> **Date:** 2026-03-03  
> **Reviewer:** Solutions Architecture (automated review)  
> **Scope:** Full codebase, CI/CD, deployment state, database layer  
> **Classification:** Internal — Confidential

---

## 1. Executive Summary

| Component | Health | Notes |
|-----------|--------|-------|
| **API Server (server.ts)** | 🟡 AMBER | Working but monolithic (1734 lines), hardcoded SQLite, no DB abstraction used |
| **Validation Routes** | 🟢 GREEN | Properly integrated, routes mounted, migrations wired |
| **Phase 2 Routes** | 🟢 GREEN | Working (rate limits, cost attribution) |
| **MCP Middleware** | 🟢 GREEN | Working, tested |
| **Database Abstraction Layer** | 🔴 RED | Created by failed sub-agent. Dead code — not imported or used anywhere |
| **PostgreSQL Migration** | 🔴 RED | Env vars set on Azure (`DB_TYPE=postgres`, `DATABASE_URL`), but server.ts ignores them entirely. Production runs SQLite |
| **CI/CD Pipeline** | 🟡 AMBER | Deploy pipeline works. Validate workflow will fail (missing `AGENTGUARD_API_KEY` secret). Type check is non-blocking (intentional) |
| **TypeScript SDK** | 🟡 AMBER | Basic client exists, validation methods added, but no LangChain/OpenAI integration |
| **Python SDK** | 🟡 AMBER | Basic client exists, thin HTTP wrapper only |
| **GitHub Action** | 🟢 GREEN | Properly structured composite action with `index.js` |
| **Tests** | 🟡 AMBER | Good coverage for existing features. Zero tests for validation/certification endpoints |
| **Documentation** | 🟢 GREEN | Comprehensive ROADMAP and DEPLOYMENT_ENFORCEMENT_ARCH docs |
| **Dockerfile** | 🟡 AMBER | Works but uses Node 20 while package.json requires Node 22 |

**Overall Assessment: AMBER** — The core product works (policy evaluation, audit trail, MCP middleware). However, the database abstraction layer is dead code, the PostgreSQL migration is broken, and there's a significant gap between the architecture docs (Hono, Prisma, AWS ECS) and the actual implementation (Express, raw SQLite, Azure Container Apps).

---

## 2. Critical Issues (Broken RIGHT NOW)

### C1. PostgreSQL env vars are set but completely ignored
**Severity:** P0  
**Details:** Azure Container App has `DB_TYPE=postgres` and `DATABASE_URL` set as environment variables. The `server.ts` file does NOT read these variables — it uses `better-sqlite3` directly with `AG_DB_PATH` or defaults to `/data/agentguard.db`. The `db.ts` factory function (which does check `DB_TYPE`) is never imported by `server.ts`.

**Impact:** Production is running SQLite on Azure Files. This is fragile (SQLite + network filesystem = corruption risk), doesn't scale, and wastes the provisioned PostgreSQL server.

**Fix:** Either (a) wire `db.ts` into `server.ts` and complete the PostgreSQL adapter, or (b) remove the env vars and PostgreSQL infra until migration is actually ready.

### C2. `db.ts` PostgreSQL adapter is non-functional
**Severity:** P0  
**Details:** The `createPgAdapter()` function in `db.ts` attempts to make the async `pg` library work synchronously by shelling out to `psql` via `child_process.execFileSync`. This is:
- **Insecure:** Constructs shell commands with string interpolation of database credentials
- **Broken:** The `get()` method returns `undefined` as a fallback, `all()` always returns `[]`
- **Unusable:** Even the factory function `createDatabase()` has a comment `// TODO: Full PostgreSQL migration. For now, fall through to SQLite`

**Impact:** If someone sets `DB_TYPE=postgres`, the factory still returns SQLite. The PostgreSQL code path literally cannot work.

**Recommendation:** Delete `db.ts` entirely. Start the PostgreSQL migration fresh with the proper async `IDatabase` interface from `db-interface.ts`.

### C3. Node.js version mismatch in Dockerfile
**Severity:** P1  
**Details:** `package.json` declares `"engines": { "node": ">=22.0.0" }`. `Dockerfile.api` uses `FROM node:20-alpine`. This could cause runtime issues with newer JS features.

**Fix:** Change Dockerfile to `FROM node:22-alpine`.

---

## 3. Integration Issues (Sub-agent outputs not properly wired)

### I1. Database abstraction files are dead code
**Files affected:**
- `api/db.ts` — Factory function, never imported
- `api/db-interface.ts` — Interface definition, only imported by db-postgres.ts and db-sqlite.ts
- `api/db-postgres.ts` — PostgreSQL adapter, never imported by server.ts
- `api/db-sqlite.ts` — SQLite adapter, never imported by server.ts

**Root cause:** The sub-agent that created these files (commit `bfd221c`) wrote them but never refactored `server.ts` to use them. `server.ts` still directly instantiates `better-sqlite3` and uses prepared statements throughout its 1734 lines.

**Assessment:** The `db-interface.ts` (typed interface) is well-designed and worth keeping. `db-postgres.ts` and `db-sqlite.ts` implement `IDatabase` but haven't been validated. `db.ts` is garbage — delete it.

### I2. Validation routes successfully integrated ✅
The `validation-routes.ts` file IS properly integrated:
- Import at line 16 of `server.ts`
- `runValidationMigrations(db)` called during startup
- Routes mounted at line 1676 via `app.use(createValidationRoutes(db))`
- This was part of commit `bfd221c` which also modified `server.ts`

**The original concern that validation endpoints return 404 is likely incorrect** — the routes should work. If they don't in production, it's because the deployed image predates commit `bfd221c` (the CI may have deployed `2897751` which didn't have these files yet, but `bfd221c` and later commits `96856be`, `83ac7b6` should have triggered a redeploy).

### I3. SDK validation methods added but untested
Both `packages/sdk/src/sdk/client.ts` and `packages/python/agentguard/client.py` were extended in commit `bfd221c` with validation/certification methods. These additions are syntactically present but there are zero tests covering them.

---

## 4. Dead Code Audit

| File | Status | Action |
|------|--------|--------|
| `api/db.ts` | Dead — never imported. Contains broken psql-shelling PG adapter | **DELETE** |
| `api/db-interface.ts` | Dead — only imported by other dead files. Design is good | **KEEP** for future migration |
| `api/db-postgres.ts` | Dead — never imported. Implements IDatabase but untested | **KEEP** cautiously; needs validation |
| `api/db-sqlite.ts` | Dead — never imported. Duplicates what server.ts does inline | **KEEP** for future migration |
| `api/tsconfig.json` | Created in `bfd221c`. Contains `"paths"` config. Not used by the `npx tsx` dev command | Neutral |
| `api/server.ts.bak` | Created in `bfd221c`, deleted in `96856be`. Shouldn't exist anymore | ✅ Already cleaned up |
| `packages/{api}` (the curly-brace dir) | Artifact from a bad mkdir: `packages/{api` directory exists | **DELETE** |
| `Dockerfile.worker` | Exists but no worker process is defined | Placeholder — fine to keep |

---

## 5. Database Layer Assessment

### Current State: Everything is SQLite
- `server.ts` opens `better-sqlite3` directly (line 22-46)
- Schema is defined inline in `server.ts` via `db.exec()` (lines 49-120)
- All queries use synchronous prepared statements
- Database file stored at `/data/agentguard.db` in Docker (Azure Files mount)

### PostgreSQL Migration State
- **PostgreSQL server exists:** `agentguard-db.postgres.database.azure.com` (provisioned via Terraform)
- **Env vars set:** `DATABASE_URL` and `DB_TYPE=postgres` on Azure Container App
- **Application ignores them:** `server.ts` doesn't reference either env var
- **`db.ts` factory:** Even if imported, it falls through to SQLite with a TODO comment
- **`db-postgres.ts`:** Implements full IDatabase interface but uses async `pg` Pool — incompatible with the sync architecture of `server.ts`
- **`db-sqlite.ts`:** Implements IDatabase as async wrappers around better-sqlite3 — compatible design

### Schema Inconsistencies
The schema is defined in THREE places:
1. `server.ts` lines 49-120 (SQLite — the one that actually runs)
2. `db-postgres.ts` SCHEMA_SQL (PostgreSQL dialect — dead code)
3. `db-sqlite.ts` SCHEMA_SQL (SQLite dialect — dead code)

The `validation-routes.ts` adds its own migration tables via `runValidationMigrations()`, which is at least properly called from `server.ts`.

### Path Forward
The migration to PostgreSQL requires:
1. Refactoring `server.ts` to use the `IDatabase` interface instead of raw `better-sqlite3`
2. This is a **major refactor** — every prepared statement and `db.prepare()` call must be replaced
3. The async nature of `pg` means all route handlers need to become async
4. Estimate: 3-5 days of focused work

---

## 6. CI/CD Assessment

### Deploy Pipeline (`deploy-azure.yml`) — 🟢 Works
- Triggers on push to `main` for relevant paths
- Uses Azure OIDC login (good — no stored credentials)
- Change detection works (API/landing/dashboard components)
- Builds Docker image via `az acr build` and updates Container App
- Health check with 60s cold-start wait and 12 retry attempts
- Type check is **non-blocking** (`|| echo "⚠️ Type check had warnings"`) — intentional, pragmatic

### Validate Pipeline (`agentguard-validate.yml`) — 🟡 Will Fail
- References `./.github/actions/agentguard-validate` (local action — exists)
- Requires `secrets.AGENTGUARD_API_KEY` — likely not configured
- Disabled on push (comment says "until AGENTGUARD_API_KEY secret is configured")
- Only runs on PRs — won't fire on direct pushes to main
- **Not currently blocking anything** — this is fine for now

### Other Pipelines
- `publish-pypi.yml` — Exists for Python SDK publishing on release tags
- `terraform-plan.yml` / `terraform-apply.yml` — Infrastructure as code pipelines

### Deployment State
The latest commits (`83ac7b6`) have been pushed. Given the deploy-azure.yml triggers, the most recent API deploy should include all code through `83ac7b6`, which includes the validation routes. If the last successful deploy was `2897751`, then `bfd221c` (which added validation-routes.ts AND the import in server.ts in a single commit) would have triggered a subsequent deploy.

---

## 7. Test Coverage Gaps

| Feature | Test File | Coverage |
|---------|-----------|----------|
| Core evaluate/audit/killswitch | `unit.test.ts` | ✅ Good |
| Webhooks, templates, agents | `phase1.test.ts` | ✅ Good |
| E2E flows | `e2e.test.ts` | ✅ Good |
| MCP middleware | `mcp.test.ts` | ✅ Good |
| **Validation endpoints** | None | ❌ **Zero tests** |
| **Certification flow** | None | ❌ **Zero tests** |
| **MCP admission (`/mcp/admit`)** | None | ❌ **Zero tests** |
| **Agent readiness endpoint** | None | ❌ **Zero tests** |
| **DB abstraction layer** | None | ❌ **Zero tests** (also dead code) |
| **SDK validation methods** | None | ❌ **Zero tests** |

**Bottom line:** All new features from commit `bfd221c` ship with zero test coverage.

---

## 8. Security Review

### ✅ Good
- API key authentication on all endpoints (header-based `X-API-Key`)
- Tenant isolation: queries scoped by `tenant_id` from API key lookup
- Agent keys (`ag_agent_*`) blocked from admin operations
- Audit trail with hash chain (SHA-256, genesis hash)
- Kill switch properly persisted and checked
- Rate limiting (Phase 2 routes)
- CORS allowlist configured

### ⚠️ Concerns

**S1. API keys stored in plaintext**  
The ROADMAP specifies bcrypt-hashed API keys (DATA_MODEL.md §3.2). Current implementation stores them as plaintext in `api_keys.key`. This is a significant security gap — a database leak exposes all tenant credentials.

**S2. No HTTPS enforcement in application code**  
The app listens on HTTP (port 3000). HTTPS is presumably handled by Azure Container Apps ingress, but the app itself doesn't enforce or verify this.

**S3. Webhook URLs not validated for SSRF**  
`POST /api/v1/webhooks` accepts any URL. No validation against private IP ranges, localhost, or internal Azure metadata endpoints. The ROADMAP explicitly calls out SSRF prevention (ARCHITECTURE.md §7.1).

**S4. SQL injection surface is minimal but not zero**  
Most queries use prepared statements. However, `db.exec()` calls in schema migrations use string concatenation — these are startup-only and not user-controlled, so the risk is low.

**S5. No input validation with Zod**  
Despite `zod` being in `package.json` dependencies, it's not used anywhere in the API. All input validation is manual `if` checks. The ROADMAP mandates Zod schemas as the single source of truth.

**S6. `db.ts` PostgreSQL adapter has credential injection vulnerability**  
The `createPgAdapter()` function constructs `psql` shell commands by embedding the database password directly. If the password contains shell metacharacters, this is exploitable. **This is dead code, but it should be deleted immediately.**

---

## 9. Architecture Drift: Docs vs Reality

The ROADMAP and ARCHITECTURE docs describe a system very different from what's built:

| Aspect | Docs Say | Reality |
|--------|----------|---------|
| Web framework | Hono 4.x | Express 5.x |
| ORM | Prisma 5.x | Raw SQLite (better-sqlite3) |
| Database | PostgreSQL 16 + PgBouncer | SQLite file |
| Cloud | AWS ECS Fargate | Azure Container Apps |
| Job queue | BullMQ on Redis | None (no background workers) |
| Cache | Redis (ElastiCache) | None |
| Schema validation | Zod schemas | Manual if-checks |
| Auth | JWT (RS256) + bcrypt API keys | Plaintext API key lookup |
| Dashboard | Next.js 14 + shadcn/ui | Exists but separate; basic |
| Python SDK | In-process evaluator + telemetry buffer + kill switch watcher | Thin HTTP wrapper (~80 lines) |
| TypeScript SDK | N/A (deferred to Phase 2 per roadmap) | Basic HTTP client exists |

**This is not inherently a problem** — the docs describe the target architecture, and the implementation is a pragmatic MVP. But the gap should be acknowledged. The roadmap was written assuming a greenfield build with 4-6 engineers. The current implementation was built incrementally by AI sub-agents against a single-developer reality.

---

## 10. Recommended Action Plan

### P0 — Fix Immediately (Blocking Production)

**1. Delete `api/db.ts`** — Broken code with credential injection vulnerability. Even though it's dead, it shouldn't exist in the repo.
```
rm api/db.ts
```

**2. Fix Dockerfile Node version** — Change `FROM node:20-alpine` to `FROM node:22-alpine` in `Dockerfile.api` to match engine requirements.

**3. Verify production deployment state** — Confirm whether commit `bfd221c` or later has actually been deployed to Azure. Check the running container's image SHA:
```
az containerapp show --name agentguard-api --resource-group agentguard-rg --query "properties.template.containers[0].image"
```
If the image predates `bfd221c`, the validation endpoints won't exist. Trigger a manual redeploy.

### P1 — Fix This Week (Affecting Reliability)

**4. Write tests for validation endpoints** — Add a `tests/validation.test.ts` covering:
- `POST /api/v1/agents/:id/validate` — dry-run with declared tools
- `GET /api/v1/agents/:id/readiness` — readiness status
- `POST /api/v1/agents/:id/certify` — certification flow
- `POST /api/v1/mcp/admit` — MCP admission check
- Error cases: invalid agent ID, missing tools, uncertified agent

**5. Hash API keys with bcrypt** — Replace plaintext `api_keys.key` storage with bcrypt hash. Store a prefix for display. This requires a migration and changes to all auth lookup code.

**6. Add webhook URL validation** — Before storing webhook URLs, validate:
- Must be HTTPS
- Must not resolve to private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
- Must not point to Azure Instance Metadata Service (169.254.169.254)

**7. Remove or clearly comment the PostgreSQL env vars on Azure** — Until the migration is done, having `DB_TYPE=postgres` and `DATABASE_URL` set is confusing and misleading. Either remove them or add a startup warning in server.ts.

### P2 — Fix This Sprint (Technical Debt)

**8. Refactor server.ts to use IDatabase interface** — This is the prerequisite for PostgreSQL migration:
- Keep `db-interface.ts` as the contract
- Validate and complete `db-sqlite.ts` (async wrapper)
- Wire server.ts to use `IDatabase` methods instead of raw prepared statements
- This is ~3-5 days of work and will touch every route handler

**9. Complete PostgreSQL adapter** — Once server.ts uses `IDatabase`:
- Fix `db-postgres.ts` to use proper async `pg` Pool (it's already mostly there)
- Remove all `psql`/`execFileSync` hacks from `db.ts` (deleted in P0)
- Test against Azure PostgreSQL
- Add `DB_TYPE` switching logic

**10. Add Zod input validation** — The dependency is already installed. Add schemas for at least:
- `POST /api/v1/evaluate` request body
- `POST /api/v1/register` request body
- `POST /api/v1/agents` request body
- `POST /api/v1/agents/:id/validate` request body
- `POST /api/v1/mcp/admit` request body

**11. Delete the `packages/{api` directory** — Artifact from a bad mkdir command.

**12. Consolidate schema definitions** — Schema is defined in 3+ places. Pick one source of truth. If staying on SQLite for now, keep `server.ts` as canonical and delete the SCHEMA_SQL from `db-postgres.ts` and `db-sqlite.ts` until migration is ready.

### P3 — Backlog (Nice to Have)

**13. Extract server.ts into modules** — At 1734 lines, `server.ts` is a monolith. Extract into:
- `api/routes/evaluate.ts`
- `api/routes/agents.ts`
- `api/routes/audit.ts`
- `api/routes/webhooks.ts`
- `api/middleware/auth.ts`
- `api/middleware/rate-limit.ts`

**14. Add CI type checking as blocking** — Currently `tsc --noEmit` failures are non-blocking. Once the type issues are cleaned up, make this a required check.

**15. Add integration tests for SDK clients** — Both TS and Python SDKs have zero test coverage.

**16. Reconcile architecture docs with implementation** — Either update ROADMAP.md to reflect the actual stack (Express, Azure, SQLite) or create an `IMPLEMENTATION_NOTES.md` that explains the divergence and migration plan.

**17. Configure `AGENTGUARD_API_KEY` secret in GitHub** — So the `agentguard-validate.yml` workflow can actually run on PRs.

**18. Add GitHub Action to external marketplace** — Currently it's a local action (`.github/actions/agentguard-validate`). Publishing to the marketplace would let external users consume it.

---

## Appendix: File Map

```
api/
├── server.ts              ← Main API (1734 lines, Express + SQLite) — THE source of truth
├── validation-routes.ts   ← Validation/certification endpoints (516 lines) — INTEGRATED
├── phase2-routes.ts       ← Rate limits, cost attribution — INTEGRATED
├── mcp-routes.ts          ← MCP proxy routes — INTEGRATED
├── mcp-middleware.ts       ← MCP middleware engine — INTEGRATED
├── db.ts                  ← DEAD CODE — broken PG adapter, DELETE
├── db-interface.ts        ← DEAD CODE — good interface design, KEEP
├── db-postgres.ts         ← DEAD CODE — async PG adapter, KEEP for migration
├── db-sqlite.ts           ← DEAD CODE — async SQLite wrapper, KEEP for migration
├── tsconfig.json          ← Added by sub-agent
└── templates/             ← YAML policy templates — USED

tests/
├── unit.test.ts           ← Core tests ✅
├── e2e.test.ts            ← E2E tests ✅
├── phase1.test.ts         ← Phase 1 feature tests ✅
└── mcp.test.ts            ← MCP tests ✅
                           ← validation.test.ts — MISSING ❌
```

---

*Review completed 2026-03-03. No code changes made.*
