# Database Consolidation Analysis — Sprint 2, Task 2.1

**Date:** 2026-04-17
**Status:** Analysis complete — awaiting team decision on action

---

## Executive Summary

The codebase has **two completely independent database systems** that share zero code, zero tables, and zero runtime connections. They are NOT alternatives for the same data — they manage different subsets of the product with different schemas.

**The critical finding: E2E tests validate the WRONG server.** Tests run against the Hono/Prisma API (`packages/api/`), but production deploys the Express/raw-SQL API (`api/`). This means E2E test results provide **zero confidence** in the production system.

---

## System 1: `api/` — Express + Raw SQL (PRODUCTION)

| Attribute | Detail |
|-----------|--------|
| **Framework** | Express.js |
| **Database** | Raw SQL via `IDatabase` interface |
| **Adapters** | `db-sqlite.ts` (SQLite via better-sqlite3), `db-postgres.ts` (PostgreSQL via pg) |
| **Factory** | `db-factory.ts` — selects adapter based on `DB_TYPE` env var |
| **Startup** | `api/server.ts` → `CMD ["node", "dist/api/server.js"]` in Dockerfile.api |
| **Deployed** | Yes — Azure Container Apps via `deploy-azure.yml` |
| **Route prefix** | `/api/v1/`, `/health` |
| **Tables** | **37 tables** (see full list below) |

### Tables managed by IDatabase (37 total)

| # | Table | Purpose |
|---|-------|---------|
| 1 | `tenants` | Tenant accounts |
| 2 | `api_keys` | API key auth |
| 3 | `audit_events` | Tamper-evident audit trail |
| 4 | `sessions` | Agent sessions (basic) |
| 5 | `settings` | Key-value config |
| 6 | `webhooks` | Outbound webhooks |
| 7 | `agents` | Agent registrations |
| 8 | `rate_limits` | Per-tenant rate limit config |
| 9 | `rate_counters` | Rate limit counters |
| 10 | `cost_events` | Cost tracking |
| 11 | `mcp_proxy_configs` | MCP proxy configuration |
| 12 | `mcp_configs` | MCP server config (migration) |
| 13 | `mcp_sessions` | MCP session tracking |
| 14 | `mcp_audit_events` | MCP-specific audit |
| 15 | `approvals` | HITL approvals |
| 16 | `tenant_policies` | Per-tenant policy (JSON blob) |
| 17 | `compliance_reports` | Compliance reports |
| 18 | `feedback` | User feedback |
| 19 | `telemetry_events` | SDK telemetry |
| 20 | `mcp_servers` | MCP server registry |
| 21 | `agent_hierarchy` | Child agents (A2A) |
| 22 | `integrations` | Slack/Teams integrations |
| 23 | `sso_configs` | SSO provider configs |
| 24 | `sso_states` | OAuth PKCE state |
| 25 | `sso_users` | SSO-provisioned users |
| 26 | `anomaly_rules` | Anomaly detection rules |
| 27 | `alerts` | Anomaly alerts |
| 28 | `siem_configs` | SIEM integration configs |
| 29 | `license_keys` | License management |
| 30 | `license_events` | License audit events |
| 31 | `license_usage` | Monthly license usage |
| 32 | `stripe_processed_events` | Stripe webhook idempotency |
| 33 | `policy_versions` | Policy version history |
| 34 | `team_members` | Team member RBAC |
| 35 | `evaluation_jobs` | Job queue |
| 36 | `scim_tokens` | SCIM provisioning tokens |
| 37 | `scim_users` | SCIM-provisioned users |
| 38 | `scim_groups` | SCIM groups |
| 39 | `scim_group_members` | SCIM group membership |
| 40 | `failed_webhooks` | Webhook retry queue |
| 41 | `git_webhook_configs` | Git-based policy sync config |
| 42 | `git_sync_logs` | Git sync audit |

---

## System 2: `packages/api/` — Hono + Prisma (E2E TESTS ONLY)

| Attribute | Detail |
|-----------|--------|
| **Framework** | Hono |
| **Database** | Prisma ORM (PostgreSQL only) |
| **Schema** | `packages/api/prisma/schema.prisma` |
| **Client** | `packages/api/src/lib/prisma.ts` |
| **Startup** | `packages/api/src/index.ts` — `serve()` from `@hono/node-server` |
| **Deployed** | **NO** — no Dockerfile exists for this service |
| **Route prefix** | `/v1/` |
| **Tables** | **13 models** (see below) |
| **Used by** | E2E test suite only (CI workflow line 114: `tsx packages/api/src/index.ts`) |

### Models managed by Prisma (13 total)

| # | Model | Purpose |
|---|-------|---------|
| 1 | `Tenant` | Tenant accounts (with plan enum, data residency) |
| 2 | `User` | **No IDatabase equivalent** — proper user model with roles |
| 3 | `ApiKey` | API keys (similar to IDatabase `api_keys`) |
| 4 | `Agent` | Agents (richer: risk tier, framework, fail behavior) |
| 5 | `AgentSession` | **No IDatabase equivalent** — sessions with token counts, spend |
| 6 | `Policy` | **No IDatabase equivalent** — proper policy entity (IDatabase uses JSON blob) |
| 7 | `PolicyVersion` | Policy versions (richer: YAML content, compiled bundle, checksum) |
| 8 | `AuditEvent` | Audit events (much richer: 20+ fields vs IDatabase's ~12) |
| 9 | `AnomalyScore` | **No IDatabase equivalent** — ML-ready scoring |
| 10 | `KillSwitchCommand` | **No IDatabase equivalent** — structured kill switch |
| 11 | `HITLGate` | **No IDatabase equivalent** — structured HITL with timeout, Slack/Email |
| 12 | `SIEMIntegration` | SIEM configs (similar to IDatabase `siem_configs`) |
| 13 | `AlertWebhook` | Webhooks (similar to IDatabase `webhooks` but different structure) |

---

## Gap Analysis: What Exists Where

### Tables in IDatabase with NO Prisma equivalent (30 tables)

These exist only in the production system:

```
settings, rate_limits, rate_counters, cost_events, mcp_proxy_configs,
mcp_configs, mcp_sessions, mcp_audit_events, feedback, telemetry_events,
mcp_servers, agent_hierarchy, integrations, sso_configs, sso_states,
sso_users, anomaly_rules, alerts, license_keys, license_events,
license_usage, stripe_processed_events, team_members, evaluation_jobs,
scim_tokens, scim_users, scim_groups, scim_group_members,
git_webhook_configs, git_sync_logs
```

### Models in Prisma with NO IDatabase equivalent (5 models)

These exist only in the test/E2E system:

```
User, AgentSession, Policy (as entity), AnomalyScore, KillSwitchCommand, HITLGate
```

### Overlapping but structurally different (4 areas)

| Concept | IDatabase | Prisma | Key Differences |
|---------|-----------|--------|-----------------|
| **Audit Events** | `audit_events` (12 cols) | `AuditEvent` (20+ cols) | Prisma has action types, policy decision enums, matched rules, PII labels, planning trace |
| **Sessions** | `sessions` (4 cols) | `AgentSession` (10 cols) | Prisma tracks tokens, spend, risk score |
| **HITL/Approvals** | `approvals` (simple) | `HITLGate` (rich) | Prisma has timeout, Slack/Email notification tracking |
| **Webhooks** | `webhooks` (6 cols) | `AlertWebhook` (9 cols) | Prisma adds signing_secret, event filter, min severity |

---

## Deployment & CI Evidence

### Production uses Express/raw-SQL
- `Dockerfile.api` line 76: `CMD ["node", "dist/api/server.js"]`
- Builds `api/` TypeScript, NOT `packages/api/`
- `docker-compose.yml` uses `Dockerfile.api`
- `docker-compose.prod.yml` uses `Dockerfile.api`
- Azure `deploy-azure.yml` uses `Dockerfile.api`
- Production health check hits `/health` (Express route)

### E2E tests use Hono/Prisma
- `.github/workflows/e2e.yml` line 114: `PORT=3001 ./node_modules/.bin/tsx packages/api/src/index.ts`
- E2E tests hit `http://localhost:3001/v1/health` (Hono route)
- E2E seed (`tests/e2e/seed.ts`) uses `PrismaClient` directly
- E2E test setup imports from `packages/api/src/routes/`

### No cross-dependencies
- Zero imports from `packages/api` in `api/` code
- Zero Prisma imports in `api/` code
- The two systems are completely isolated at runtime

---

## Decision Options

### Option A: Keep raw SQL as canonical, deprecate packages/api (Recommended)

**Rationale:**
- Raw SQL `api/` is what runs in production
- IDatabase has 3x more tables covering all production features
- Prisma schema covers only a subset and has been diverging
- Removing packages/api eliminates the Hono dependency (Task 1.3)

**Impact:**
- E2E tests must be REWRITTEN to target the Express API
- Prisma dependencies can be removed from root `package.json`
- `prisma generate` steps removed from CI
- Simpler dependency tree

**Risk:**
- Current E2E tests become invalid immediately (they already are)
- Some Prisma models (User, AgentSession, HITLGate) represent a more mature data model that should inform future IDatabase evolution

### Option B: Keep packages/api, migrate to it as canonical

**Rationale:**
- Prisma provides type-safe queries, migrations, and schema evolution
- Hono is lighter than Express
- The Prisma schema represents a cleaner, more normalized data model

**Impact:**
- Must migrate 30+ tables from IDatabase into Prisma schema
- Must rewrite ALL Express routes as Hono routes
- Must rewrite all middleware
- Massive effort — essentially a full rewrite of the production server

**Risk:**
- Extremely high risk — every production feature must be reimplemented
- Estimated effort: 15-20 person-days minimum
- Not practical in Sprint 2 timeline

### Option C: Keep both, document clearly (Status Quo with docs)

**Rationale:**
- Zero-risk — no code changes
- Teams can incrementally converge

**Impact:**
- Dual systems remain a source of confusion
- E2E tests still validate the wrong server
- Doesn't meet Sprint 2 acceptance criteria ("Single database access pattern")

---

## Recommendation

**Option A** with phased execution:

1. **Now (Sprint 2):** Mark `packages/api/` as deprecated with a clear README. Keep code intact. Rewrite E2E tests to target the Express API.
2. **Sprint 3:** Remove `packages/api/` code entirely after E2E migration is confirmed.
3. **Future:** Extract the best ideas from the Prisma schema (User model, AgentSession, HITLGate) into the IDatabase system as it evolves.

### Why NOT delete packages/api immediately

- It contains test data and seed scripts that may inform the E2E rewrite
- The Prisma schema serves as a design reference for future IDatabase improvements
- Team may have plans for it that aren't captured here
- Safer to deprecate first, delete after team confirmation

---

## E2E Test Gap — Critical Bug

The current E2E test setup is **architecturally invalid**:

```
Production:  Express API (api/server.ts) → raw SQL (IDatabase)
E2E Tests:   Hono API (packages/api/src/index.ts) → Prisma ORM
```

These are two completely different code paths. E2E tests passing tells us nothing about production behavior. This must be fixed regardless of the consolidation decision.

---

## Files to Modify (if Option A is chosen)

1. `packages/api/README.md` — Add deprecation notice (NEW)
2. `tests/e2e/setup.ts` — Point to Express API
3. `tests/e2e/seed.ts` — Use IDatabase instead of Prisma
4. `tests/e2e/*.e2e.test.ts` — Adjust routes to match Express API
5. `.github/workflows/e2e.yml` — Start Express server instead of Hono
6. `package.json` — Remove `pretest` Prisma generation step
7. `.github/workflows/deploy-azure.yml` — Remove Prisma generate step
8. `.github/workflows/test-coverage.yml` — Remove Prisma generate step
