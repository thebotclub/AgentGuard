# Audit Fixes — Applied Summary

**Date:** 2026-03-02  
**Based on:** `docs/AUDIT_REPORT.md`

---

## Critical Fixes

### C1 — Fix `/api/v1/cost/summary` → `/api/v1/costs/summary`
- **File:** `packages/sdk/src/sdk/client.ts` (line ~176, `getCostSummary`)
- Changed URL path from `/api/v1/cost/summary` to `/api/v1/costs/summary`

### C2 — Fix `/api/v1/cost/agents` → `/api/v1/costs/agents`
- **File:** `packages/sdk/src/sdk/client.ts` (line ~187, `getAgentCosts`)
- Changed URL path from `/api/v1/cost/agents` to `/api/v1/costs/agents`

### C3 — Fix `/api/v1/dashboard/activity` → `/api/v1/dashboard/agents`
- **File:** `packages/sdk/src/sdk/client.ts` (line ~207, `getAgentActivity`)
- Changed URL path from `/api/v1/dashboard/activity` to `/api/v1/dashboard/agents`

### C4 — Fix Python `/api/v1/cost/summary` → `/api/v1/costs/summary`
- **File:** `packages/python/agentguard/client.py` (line ~170, `get_cost_summary`)
- Changed URL path to `/api/v1/costs/summary`

### C5 — Fix Python `/api/v1/cost/agents` → `/api/v1/costs/agents`
- **File:** `packages/python/agentguard/client.py` (line ~180, `get_agent_costs`)
- Changed URL path to `/api/v1/costs/agents`

### C6 — Fix Python `/api/v1/dashboard/activity` → `/api/v1/dashboard/agents`
- **File:** `packages/python/agentguard/client.py` (line ~196, `get_agent_activity`)
- Changed URL path to `/api/v1/dashboard/agents`

### C7 — Fix Python SDK `policyScope` → `policy_scope` field name
- **File:** `packages/python/agentguard/client.py` (`create_agent` method)
- Changed `body["policyScope"]` to `body["policy_scope"]`
- Changed type hint from `dict` to `list`

### C8 — Fix TypeScript SDK `policyScope` → `policy_scope` field name + type
- **File:** `packages/sdk/src/sdk/client.ts` (`createAgent` method)
- Changed type from `Record<string, any>` to `string[]`
- Now sends `policy_scope` (snake_case) in request body instead of `policyScope`

### C9 — Move Phase 2 routes before error handler
- **File:** `api/server.ts` (around line 1630)
- Moved `app.use(createPhase2Routes(db))` to **before** the global error handler
- Order is now: Phase 1 routes → Phase 2 routes → Error handler → 404 handler

### C10 — Add DELETE to CORS methods
- **File:** `api/server.ts` (line ~321, CORS config)
- Added `'DELETE'` to `methods: ['GET', 'POST', 'DELETE', 'OPTIONS']`

---

## Important Fixes

### I2 — Wire rate limit enforcement into evaluate endpoint
- **File:** `api/server.ts` (`POST /api/v1/evaluate` handler)
- Added `checkPhase2RateLimit(db, tenantId, req.agent?.id)` check after auth, returns 429 if exceeded
- Added `incrementRateCounter(db, tenantId, req.agent?.id)` after successful evaluation
- Both calls skipped for `demo` tenant (unauthenticated requests)

### I5 — Fix Dockerfile to use lockfile for reproducible builds
- **File:** `Dockerfile.api`
- Replaced `npm install express cors better-sqlite3 js-yaml` with:
  - `COPY package.json package-lock.json ./`
  - `RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev`

### I7 — Audit timestamp consistency
- **File:** `api/server.ts` (`storeAuditEvent` function, line ~672)
- Already correctly implemented: `const createdAt = new Date().toISOString()` used for both hash input and `created_at` DB column. No change needed.

### I11 — Fix README project structure
- **File:** `README.md` (Project Structure section)
- Removed references to `packages/api/` (Prisma-based, legacy) and `packages/dashboard/` (Next.js)
- Added accurate entries for `api/phase2-routes.ts`, `packages/python/`, `tests/phase1.test.ts`, `demo/`

### I12 — Fix README env var documentation
- **File:** `README.md` (Environment Variables table)
- Removed `RATE_LIMIT_PER_MIN` and `SIGNUP_RATE_LIMIT_PER_HOUR` (not actually read from env)
- Added `AG_DB_PATH` and `CORS_ORIGINS` which are actually used by `server.ts`

### I14 — Fix phase1 tests to use memory DB
- **File:** `tests/phase1.test.ts` (`before` hook, server spawn)
- Added `AG_DB_PATH: ':memory:'` to the spawn env to prevent disk writes and test state bleed

---

## Missing SDK Method Added

### `trackCost()` — TypeScript SDK
- **File:** `packages/sdk/src/sdk/client.ts` (added after `getAgentCosts`)
- Signature: `async trackCost(data: { tool: string; agentId?: string; estimatedCostCents?: number }): Promise<any>`
- POSTs to `/api/v1/costs/track`

### `track_cost()` — Python SDK
- **File:** `packages/python/agentguard/client.py` (added after `get_agent_costs`)
- Signature: `def track_cost(self, tool: str, agent_id: str = None, estimated_cost_cents: int = None) -> dict`
- POSTs to `/api/v1/costs/track`

---

## Version Bumps (0.2.0 → 0.2.1)

| File | Change |
|------|--------|
| `packages/sdk/package.json` | `"version": "0.2.1"` |
| `packages/python/pyproject.toml` | `version = "0.2.1"` |
| `packages/python/agentguard/__init__.py` | `__version__ = "0.2.1"` |

---

## Build Results

| Build | Status |
|-------|--------|
| TypeScript SDK (`cd packages/sdk && npx tsc --build`) | ✅ Success (no errors) |
| Python dist (`python3 -m build`) | ✅ Success — `agentguard_tech-0.2.1.tar.gz` + `agentguard_tech-0.2.1-py3-none-any.whl` |

---

## Skipped / Not Applicable

| Issue | Reason |
|-------|--------|
| I7 (timestamp consistency) | Already correctly implemented in `storeAuditEvent` — single `createdAt` used for both hash and DB insert |
| I1 (Phase 2 auth agent key block) | Not in task scope |
| I3 (Phase 2 test coverage) | Not in task scope |
| I4 (dead code) | Not in task scope |
| I6 (hardcoded dashboard URL) | Not in task scope |
| I8 (show dashboard URL on signup) | Not in task scope |
| I9 (unnecessary API key on public endpoints) | Not in task scope |
| I10 (cost track rate limit) | Not in task scope |
| I13 (CI/CD demo pipeline) | Not in task scope |
| M1-M9 (minor issues) | Not in task scope |
