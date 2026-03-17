# AgentGuard — Development Roadmap v3.0
## Revised: March 2026 | Confidential

> **Revision note:** This v3.0 roadmap supersedes v2.0. The v2.0 roadmap described a target architecture (Hono, Prisma, AWS ECS, Redis, BullMQ, Next.js) that was never built. This version reflects what has actually been shipped, what is in progress, and what is genuinely planned. See [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) for rationale on the stack divergence, and [ARCHITECTURE.md](./ARCHITECTURE.md) for the current system architecture.

> **North Star:** Ship a runtime security platform that engineers love to integrate, enterprises trust to govern, and regulators accept as evidence. Every decision serves those three masters simultaneously.

---

## Table of Contents

1. [What's Shipped](#whats-shipped)
2. [Phase 6 — Server Modularisation (In Progress)](#phase-6--server-modularisation-in-progress)
3. [Upcoming — Security Hardening](#upcoming--security-hardening)
4. [Future Phases](#future-phases)
5. [Technical Decisions Log (Actual)](#technical-decisions-log-actual)
6. [Definition of Done](#definition-of-done)

---

## What's Shipped

The following capabilities are live in production at `api.agentguard.tech`. Each phase was implemented incrementally, primarily via AI-assisted development.

---

### Phase 1 — Foundation ✅
*Shipped: January–February 2026*

**What was built:**
- Core policy evaluation engine (YAML DSL, in-process, sub-millisecond)
- Tamper-evident audit log with SHA-256 hash chain
- Tenant registration and API key authentication
- Webhook alerts on `block`, `hitl_required`, and `killswitch_active` events (fire-and-forget delivery)
- Pre-built policy templates (7 built-in: `customer-service`, `code-agent`, `finance-strict`, `data-analyst`, `readonly-monitor`, `hr-agent`, `rag-agent`)
- Agent registration and management (create, list, get, deactivate)
- Kill switch (tenant-level and agent-level)
- Static HTML dashboard (agent list, audit log, policy editor)
- Public demo playground (no auth required)
- TypeScript SDK (HTTP client)
- Python SDK (HTTP client)

**Stack used:**
- Express 5.x (not Hono)
- SQLite via `better-sqlite3` (not PostgreSQL / Prisma)
- Azure Container Apps (not AWS ECS)
- GitHub Actions CI/CD
- Cloudflare DNS / Flexible SSL

---

### Phase 2 — Rate Limits & Cost Attribution ✅
*Shipped: February 2026*

**What was built:**
- Per-tenant and per-agent rate limiting (configurable windows: 60s, 3600s, 86400s)
- Rate limit enforcement on the `/evaluate` hot path (in-memory sliding window)
- Cost attribution: per-call cost events with `estimated_cost_cents` and currency
- Cost aggregation API (`GET /api/v1/costs/summary`)
- CRUD API for rate limit configurations

---

### Phase 3 — MCP Middleware ✅
*Shipped: February 2026*

**What was built:**
- MCP (Model Context Protocol) proxy: forward calls to upstream MCP servers while enforcing AgentGuard policies
- `McpMiddleware` class: intercepts every tool call in the MCP session, evaluates against policy, allows/blocks/monitors
- MCP server configuration management (`POST /api/v1/mcp/configs`)
- Full test coverage (`tests/mcp.test.ts`)
- Session tracking for MCP connections

---

### Phase 4 — Deployment Enforcement ✅
*Shipped: March 2026*

**What was built:**
- Agent lifecycle state machine: `registered → validated → certified → deployed`
- `POST /api/v1/agents/:id/validate` — dry-run validation of declared tools against policies; computes coverage score
- `GET /api/v1/agents/:id/readiness` — real-time readiness status without triggering re-validation
- `POST /api/v1/agents/:id/certify` — marks an agent deployment-ready (requires 100% coverage by default); records certifier identity, note, and TTL
- `POST /api/v1/agents/coverage-check` — tool coverage check (used by CLI and GitHub Action)
- `POST /api/v1/mcp/admit` — pre-flight admission check before connecting an MCP server; enumerates tools and blocks connection if any are uncovered
- GitHub Action: `agentguard-tech/validate@v1` — CI gate that scans agent code, checks policy coverage, posts PR comment, blocks merge if coverage below threshold
- Database tables: `agent_tools`, `validation_runs`, `agent_certifications`, `agent_status_history`, `mcp_admission_events`
- Certification expiry: certifications invalidated when governing policies change or TTL expires

---

### Phase 5 — PostgreSQL Migration ✅
*Shipped: March 2026*

**What was built:**
- `IDatabase` typed interface (`api/db-interface.ts`) — 35+ methods covering all domain operations
- `SqliteAdapter` (`api/db-sqlite.ts`) — async wrapper around `better-sqlite3`; used for dev and test
- `PostgresAdapter` (`api/db-postgres.ts`) — `pg` pool with SSL; Azure-compatible; full `IDatabase` implementation
- `db-factory.ts` — selects adapter from `DB_TYPE` env var (`sqlite` | `postgres`)
- `server.ts` refactored to use `IDatabase` throughout — no direct `better-sqlite3` calls remain
- Production deployed to Azure Database for PostgreSQL 16 (`agentguard-db.postgres.database.azure.com`)
- SQLite retained as default for local dev and CI (no infrastructure required)
- Partial Zod validation added to 5 critical request bodies (`EvaluateRequest`, `SignupRequest`, `CreateAgentRequest`, and validation/MCP endpoints)
- Webhook SSRF prevention (`validateWebhookUrl` — HTTPS-only, private IP blocklist, metadata endpoint blocklist)
- Node.js 22 LTS in Dockerfile (was node:20)

---

## Phase 6 — Server Modularisation ✅
*Shipped: March 2026*

**Goal:** Break `server.ts` (~1,700 lines) into cohesive route modules. This is engineering hygiene — no user-visible features. It unblocks faster iteration and easier onboarding for new contributors.

**Planned extraction:**

```
api/
├── server.ts              ← App setup, middleware wiring only (~150 lines)
├── routes/
│   ├── evaluate.ts        ← POST /evaluate, POST /demo/evaluate
│   ├── agents.ts          ← CRUD /agents + lifecycle endpoints
│   ├── audit.ts           ← GET /audit, GET /audit/verify
│   ├── webhooks.ts        ← CRUD /webhooks
│   ├── policies.ts        ← CRUD /policies, GET /policies/templates
│   ├── auth.ts            ← POST /signup, GET /usage, POST /killswitch
│   └── dashboard.ts       ← GET /dashboard/stats, GET /dashboard/feed
├── middleware/
│   ├── auth.ts            ← requireTenantAuth, requireAdminAuth
│   ├── rate-limit.ts      ← IP rate limiting
│   └── cors.ts            ← CORS config
├── validation-routes.ts   ← Already extracted ✅
├── phase2-routes.ts       ← Already extracted ✅
├── mcp-routes.ts          ← Already extracted ✅
└── mcp-middleware.ts      ← Already extracted ✅
```

**Success criteria:**
- `npm test` (all test files) passes green throughout the extraction
- `server.ts` reduced to < 200 lines
- No endpoints removed or behaviour changed
- TypeScript type checking (`tsc --noEmit`) promoted to blocking CI check

---

## Phase 7 — Security Hardening ✅

*Shipped: March 2026*

These items address known gaps identified in [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md):

### Bcrypt API Key Hashing ✅

**Shipped.** API keys are now hashed with bcrypt (cost 10) and looked up via SHA-256 index. Keys are returned once at creation; the database stores only `key_hash`, `key_prefix`, and `key_sha256`. Existing keys were auto-migrated on startup. Auth flow: SHA-256 lookup → bcrypt verify → fallback to legacy plaintext for unmigrated keys.

### Full Zod Validation ✅

**Shipped.** All API endpoints now have Zod schema validation. 17 schemas in `api/schemas.ts` covering signup, evaluate, agents, webhooks, MCP, rate limits, costs, playground, and kill switch endpoints.

### PostgreSQL Row-Level Security ✅

**Shipped.** RLS enabled on 8 tenant-scoped tables (tenants, api_keys, audit_events, sessions, webhooks, agents, rate_limits, cost_events). Application-layer tenant isolation continues as primary enforcement; RLS is defence-in-depth.

### Cloudflare Full/Strict SSL

**Current state:** Flexible SSL (Cloudflare decrypts and re-issues; origin receives HTTP).

**Plan:** Provision an origin certificate; upgrade to Full/Strict mode so the full path is encrypted.

---

## Future Phases

Sprint-level planning for these phases depends on design partner feedback and production usage data. These are directional, not committed.

### Redis Cache & Background Workers

**Trigger:** When inline webhook delivery becomes unreliable at scale, or when policy bundle cache warming is needed for > 100 concurrent tenants.

**What changes:**
- Redis (or Azure Cache for Redis) for: hot-path rate limit counters, policy bundle cache (TTL 60s), kill switch flag propagation
- Background worker process (BullMQ or similar) for: webhook delivery with retries, SIEM event push, cost aggregation
- This removes the synchronous webhook delivery from the evaluate hot path

### LangChain / OpenAI In-Process SDK

**Current state:** Both TypeScript and Python SDKs are HTTP clients — they call the API for every evaluation.

**Target:** In-process policy bundle evaluation (< 5ms) with async telemetry flush. Same architecture as described in DEPLOYMENT_ENFORCEMENT_ARCH.md.

**What changes:**
- SDK downloads compiled `PolicyBundle` on startup; caches in-process (60s refresh)
- `evaluate()` is a local function call, not an HTTP round-trip
- Telemetry batched and flushed async (every 5s or 100 events)
- HTTP calls: only for telemetry, kill switch polling, and HITL gates

### Enterprise Auth (JWT / RS256)

**Current state:** API key lookup (plaintext, then bcrypt after hardening sprint).

**Target:** JWT RS256 for human user sessions; API keys retained for agent-to-API calls.

**What changes:**
- JWT middleware: `Authorization: Bearer <token>` for dashboard and management API
- API keys remain the auth method for `POST /evaluate` and agent endpoints
- `ServiceContext` carries both auth types

### SIEM Integrations

**Trigger:** First enterprise customer with Splunk or Microsoft Sentinel requirement.

**Plan:** Webhook-based initially (tenant configures SIEM HTTP Event Collector endpoint); native push workers later.

### Compliance Reporting

**Trigger:** Design partner in regulated industry (EU AI Act, HIPAA, SOC 2).

**Prerequisite:** 30+ days of production audit data from at least one enterprise tenant.

**What changes:**
- Report templates (EU AI Act Article 11, HIPAA 164.312): queries against audit log + PDF renderer
- Vanta/Drata integration for automated SOC 2 evidence collection

### ML Anomaly Detection

**Trigger:** 30+ days of production telemetry; rule-based scoring insufficient.

**Current state:** Rule-based anomaly scoring (5 rules: velocity, repeated denials, unusual hours, new tool first-use, action count spike). Works for Phase 1.

**Target:** Online learning model (River library); `AnomalyScore.method` changes from `RULE_BASED` to `ML_IFOREST`.

### Multi-Agent Governance

**Trigger:** Design partner with orchestrated multi-agent systems (CrewAI, LangGraph).

**What changes:**
- `parent_agent_id` and `orchestration_id` fields on `audit_events`
- Cross-agent correlation queries
- Agent interaction graph visualisation in dashboard

### On-Premises / Helm Chart

**Trigger:** Enterprise customer requiring data residency or VPC deployment.

**What changes:**
- Docker Compose reference for on-premises (SQLite or customer-managed PostgreSQL)
- Helm chart for Kubernetes (customer-managed)
- Offline licence validation

---

## Technical Decisions Log (Actual)

All decisions below reflect what was actually built and deployed, not what was originally planned. See [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) for full rationale.

---

### Decision 1: Express 5.x (Not Hono)

**Decision:** API server uses Express 5.x.

**What the v2.0 roadmap said:** Hono 4.x.

**Reality:** The initial implementation was generated by an AI sub-agent, which defaulted to Express — the most widely understood Node.js framework. By the time the architecture doc was written with Hono, Express was already deployed and working. Migrating would have taken longer than shipping features.

**Trade-off:** Hono is faster on benchmarks. At current scale (< 1,000 req/s), Express performance is not a bottleneck. Hono migration can happen in a future refactor without changing the API contract.

---

### Decision 2: Raw SQL (Not Prisma)

**Decision:** All database access is raw parameterised SQL via the `IDatabase` typed interface.

**What the v2.0 roadmap said:** Prisma 5.x ORM.

**Reality:** The schema is simple (12 tables, mostly CRUD). Prisma adds migration tooling and type generation on top of raw SQL — genuinely useful at 30+ models, but overhead for this stage. The `IDatabase` interface provides TypeScript type safety without ORM dependency.

**Trade-off:** No automatic migrations. Schema changes require manual SQL. Acceptable at current scale; Prisma or Drizzle could be adopted when the schema complexity justifies it.

---

### Decision 3: Azure (Not AWS)

**Decision:** Deployed on Azure Container Apps, Azure Container Registry, Azure Database for PostgreSQL.

**What the v2.0 roadmap said:** AWS ECS Fargate, ECR, RDS.

**Reality:** Founder preference; Azure has strong presence in Australia (founder's region) and competitive pricing for Container Apps. The product is cloud-agnostic (Docker + PostgreSQL run anywhere). AWS and GCP deployments are possible without code changes.

---

### Decision 4: SQLite for Dev/Test

**Decision:** SQLite (via `better-sqlite3`) is the default database for local development and CI runs.

**What the v2.0 roadmap said:** PostgreSQL everywhere, with Docker Compose for local PG.

**Reality:** Zero-infrastructure local dev is significantly faster for onboarding and iteration. The `IDatabase` abstraction makes this transparent — tests run against SQLite; production runs PostgreSQL. The same test suite validates both adapters.

---

### Decision 5: Static Dashboard (Not Next.js)

**Decision:** Dashboard is static HTML + vanilla JavaScript.

**What the v2.0 roadmap said:** Next.js 14 App Router + shadcn/ui + Tailwind CSS.

**Reality:** A static dashboard serves the current user population (founders, design partners, internal use) without build pipeline complexity. When the product has a user base that warrants a framework, the migration is straightforward — the API contract doesn't change.

---

### Decision 6: No Redis / No BullMQ (Yet)

**Decision:** No Redis cache. No background job queue. Webhooks delivered synchronously (fire-and-forget) from the request handler.

**What the v2.0 roadmap said:** ElastiCache Redis 7, BullMQ for background jobs.

**Reality:** At current scale, synchronous webhook delivery is acceptable. Redis adds infrastructure cost and operational complexity. The `IDatabase` abstraction ensures webhook delivery can be moved to a background worker without changing the route handlers — the coupling is loose.

**Revisit trigger:** Webhook delivery failures at scale, or > 100 concurrent tenants.

---

### Decision 7: Zod Partial Adoption

**Decision:** Zod validates 5 critical request bodies. Other endpoints use manual checks.

**What the v2.0 roadmap said:** Zod schemas as the single source of truth for all API inputs, defined before each route is written.

**Reality:** Zod was added during Phase 5 (security hardening), not upfront. The incremental approach (add Zod schemas during Phase 6 route extraction) achieves the same outcome — every endpoint will eventually have a Zod schema — without blocking feature delivery.

---

## Definition of Done

### Universal Story Standards

A story is **Done** when ALL of the following are true:

1. **Code merged to `main`** via approved PR
2. **Tests written** — new functionality has unit tests in `tests/`; integration paths have test coverage
3. **Linted** — `npm run lint` (TypeScript `tsc --noEmit`) passes without new errors
4. **Reviewed** — at least one review pass (human or careful self-review with checklist)
5. **Zod schema defined** — any new API input has a corresponding Zod schema in `api/schemas.ts`
6. **Tenant-scoped** — any new database query includes `tenant_id` parameter; no cross-tenant access possible
7. **No secrets** — no API keys, tokens, passwords, or internal URLs in code or git history

### Current Phase 6 Definition of Done

Phase 6 (server modularisation) is complete when:
- [ ] `server.ts` is < 200 lines (app setup and middleware only)
- [ ] All extracted routes have `npm test` passing green
- [ ] `tsc --noEmit` passes with zero errors (promoted to blocking CI check)
- [ ] All 34 endpoints have Zod schema validation
- [ ] ARCHITECTURE.md updated to reflect new module structure

---

*Document version: 3.0 — March 2026*  
*Owner: Engineering Lead*  
*Supersedes: ROADMAP.md v2.0 (described intended architecture; superseded by shipped reality)*  
*Next review: End of Phase 6*  
*Classification: Confidential — AgentGuard Internal*
