# AgentGuard — System Architecture

> **Document version:** 3.0  
> **Date:** March 2026  
> **Classification:** Confidential — AgentGuard Internal  
> **Status:** Current — reflects production deployment as of March 2026

---

## Table of Contents

1. [Overview & Design Philosophy](#1-overview--design-philosophy)
2. [System Components](#2-system-components)
3. [Technology Stack](#3-technology-stack)
4. [API Server Architecture](#4-api-server-architecture)
5. [Database Layer](#5-database-layer)
6. [Deployment Topology](#6-deployment-topology)
7. [Authentication & Tenant Isolation](#7-authentication--tenant-isolation)
8. [API Surface](#8-api-surface)
9. [Security Model](#9-security-model)
10. [Implemented vs. Planned](#10-implemented-vs-planned)

---

## 1. Overview & Design Philosophy

AgentGuard is a **runtime security platform for AI agents**. It intercepts every tool call an AI agent makes, evaluates it against a policy, and either allows, blocks, or routes it for human approval — creating a tamper-evident audit trail throughout.

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Fail closed** | Policy evaluation errors default to `block`; no silent pass-throughs |
| **Tenant isolation** | Every query is scoped by `tenant_id` derived from the authenticated API key |
| **Pragmatic MVP** | Express over Hono, raw SQL over ORM — chosen for speed of iteration, not architectural purity |
| **Honest abstraction** | The `IDatabase` interface lets us swap SQLite (dev) for PostgreSQL (prod) without touching route handlers |
| **Audit integrity** | SHA-256 hash chain on every audit event; tamper-evident by design |
| **Open core** | Policy engine, TypeScript SDK, and Python SDK are Apache 2.0 |

---

## 2. System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE EDGE                             │
│           (DNS, Flexible SSL, DDoS mitigation)                      │
│  api.agentguard.dev  app.  demo.  docs.  about.                    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS (Cloudflare → Azure)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AZURE CONTAINER APPS                             │
│                                                                     │
│  ┌─────────────────────┐       ┌──────────────────────────────┐    │
│  │   API Container     │       │   Dashboard / Landing        │    │
│  │   (Express 5.x)     │       │   (Static HTML + Vanilla JS) │    │
│  │   Node.js 22 LTS    │       │   app.agentguard.dev        │    │
│  │   Port 3000         │       └──────────────────────────────┘    │
│  │                     │                                            │
│  │  ┌───────────────┐  │                                            │
│  │  │  Policy       │  │                                            │
│  │  │  Engine       │  │                                            │
│  │  │  (in-process) │  │                                            │
│  │  └───────────────┘  │                                            │
│  │  ┌───────────────┐  │                                            │
│  │  │  MCP          │  │                                            │
│  │  │  Middleware   │  │                                            │
│  │  └───────────────┘  │                                            │
│  └──────────┬──────────┘                                            │
│             │                                                        │
└─────────────┼────────────────────────────────────────────────────── ┘
              │ SSL (Azure-managed)
              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  AZURE DATABASE FOR POSTGRESQL 16                    │
│              agentguard-db.postgres.database.azure.com               │
│              (production); SQLite file for dev/test                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| **API server** | Express 5.x / Node.js 22 | Policy evaluation, audit logging, agent management, MCP middleware |
| **Policy engine** | TypeScript (in-process) | YAML policy parsing, rule evaluation, decision rendering |
| **MCP middleware** | TypeScript (in-process) | Proxy and enforce policy on Model Context Protocol tool calls |
| **Database** | PostgreSQL 16 (prod) / SQLite (dev) | Persistent state — tenants, events, policies, agents, webhooks |
| **Dashboard** | Static HTML + Vanilla JS | Agent management UI, audit log viewer, policy editor |
| **TypeScript SDK** | Node.js HTTP client | SDK for TypeScript/JavaScript integrations |
| **Python SDK** | Python HTTP client | SDK for Python agent integrations (LangChain, etc.) |
| **CI/CD** | GitHub Actions | Build, test, push to ACR, deploy to Azure Container Apps |
| **Container Registry** | Azure Container Registry (ACR) | Docker image hosting |
| **DNS / CDN** | Cloudflare | DNS, Flexible SSL termination, DDoS protection |

---

## 3. Technology Stack

### What's Running in Production

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Web framework** | Express 5.x | See [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) for why |
| **Runtime** | Node.js 22 LTS | ESM modules, TypeScript via `tsx` |
| **Database (prod)** | PostgreSQL 16 on Azure | Direct `pg` pool, no ORM |
| **Database (dev/test)** | SQLite via `better-sqlite3` | File-based; zero infra setup |
| **DB abstraction** | `IDatabase` interface + adapters | `db-sqlite.ts` / `db-postgres.ts` |
| **Schema validation** | Zod 4.x | Partially adopted — 5 schemas; expanding |
| **Auth** | Plaintext API key lookup | `X-API-Key` header; tenant scoping via key→tenant join |
| **Cloud** | Azure Container Apps | See [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) |
| **Container registry** | Azure Container Registry | Images tagged with git SHA |
| **CI/CD** | GitHub Actions | OIDC login to Azure (no stored credentials) |
| **DNS / CDN** | Cloudflare | Flexible SSL; proxy mode |
| **Cache** | None | *(Planned — Redis for hot-path rate limits and policy cache)* |
| **Queue** | None | *(Planned — background workers for webhook delivery)* |
| **Dashboard** | Static HTML + Vanilla JS | `app.agentguard.dev` — no Next.js framework |
| **Policy DSL** | YAML | Loaded at startup from `api/templates/` |
| **SDK (TypeScript)** | HTTP client | `packages/sdk/` |
| **SDK (Python)** | HTTP client | `packages/python/` |

### Key Dependencies (`package.json`)

```json
{
  "express": "^5.2.1",
  "better-sqlite3": "^12.6.2",
  "pg": "^8.19.0",
  "zod": "^4.3.6",
  "js-yaml": "^4.1.1",
  "cors": "^2.8.6"
}
```

---

## 4. API Server Architecture

### Structure

The API server lives at `api/server.ts` (~270 lines) — the orchestrator that wires middleware and mounts route modules. Routes are fully extracted into domain-specific files:

```
api/
├── server.ts              ← App setup, middleware wiring, route mounting (~270 lines)
├── routes/
│   ├── evaluate.ts        ← POST /evaluate
│   ├── agents.ts          ← CRUD /agents
│   ├── audit.ts           ← GET /audit, /audit/verify + shared helpers
│   ├── webhooks.ts        ← CRUD /webhooks
│   ├── auth.ts            ← POST /signup, kill switches, usage, templates
│   └── playground.ts      ← Playground endpoints
├── middleware/
│   ├── auth.ts            ← requireTenantAuth, optionalTenantAuth, requireAdminAuth
│   └── rate-limit.ts      ← IP + signup rate limiting
├── lib/
│   ├── policy-engine-setup.ts  ← PolicyEngine init, template cache
│   └── sessions.ts        ← In-memory session management
├── types.ts               ← Shared types (AuthedRequest, SessionState, etc.)
├── phase2-routes.ts       ← Rate limits, cost attribution
├── mcp-routes.ts          ← MCP proxy routes
├── mcp-middleware.ts      ← MCP middleware engine
├── validation-routes.ts   ← Deployment enforcement (validate, certify, admit)
├── db-interface.ts        ← IDatabase typed interface
├── db-sqlite.ts           ← SQLite adapter (implements IDatabase)
├── db-postgres.ts         ← PostgreSQL adapter (implements IDatabase)
├── db-factory.ts          ← Factory: returns correct adapter based on DB_TYPE
├── schemas.ts             ← Zod schemas (5 validated inputs)
├── routes/                ← Future home of extracted route modules
├── middleware/            ← Future home of extracted middleware
└── templates/             ← YAML policy templates
```

### Request Lifecycle

```
Inbound HTTP
     │
     ▼
CORS middleware (allowlist)
     │
     ▼
Rate limiter (IP-based, in-memory)
     │
     ▼
Auth middleware
  ├── Reads X-API-Key header
  ├── Looks up api_keys table → resolves tenant_id
  └── Attaches tenant context to request
     │
     ▼
Route handler
  ├── Input validation (Zod schema or manual checks)
  ├── Business logic
  ├── IDatabase operations (SQLite or PostgreSQL)
  └── Webhook delivery (fire-and-forget, inline)
     │
     ▼
JSON response
```

### Policy Engine (In-Process)

The `PolicyEngine` class runs entirely in-process — no network calls during evaluation. This is what keeps policy decisions sub-millisecond.

```typescript
// Evaluation is a pure function — no I/O, no side effects
const decision = engine.evaluate(actionRequest, agentContext);
// decision.result: 'allow' | 'block' | 'monitor' | 'hitl_required'
```

Policies are loaded from YAML at startup (from `api/templates/`) and can be customised per tenant via the policy API.

---

## 5. Database Layer

### The IDatabase Abstraction

The core architectural decision for the database is the `IDatabase` typed interface (`api/db-interface.ts`). Both adapters implement this interface, making the database backend completely swappable:

```typescript
export interface IDatabase {
  readonly type: 'sqlite' | 'postgres';

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Raw query escape hatches
  exec(sql: string, params?: unknown[]): Promise<void>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<void>;

  // Domain methods (typed)
  getTenant(id: string): Promise<TenantRow | undefined>;
  createTenant(id: string, name: string, email: string): Promise<void>;
  insertAuditEvent(...): Promise<void>;
  getAgentsByTenant(tenantId: string): Promise<AgentRow[]>;
  // ... 35+ typed methods
}
```

The factory (`api/db-factory.ts`) selects the correct adapter based on environment:

```typescript
// DB_TYPE=postgres → PostgresAdapter (pool, SSL, Azure-compatible)
// DB_TYPE=sqlite (or unset) → SqliteAdapter (better-sqlite3)
```

### SQLite (Development / Test)

- `better-sqlite3` synchronous API wrapped in async methods
- Schema auto-migrated on startup
- Default DB path: `./agentguard.db` (or `AG_DB_PATH` env var)
- WAL mode enabled for concurrent reads
- Used for all local development and CI test runs

### PostgreSQL 16 (Production)

- `pg` connection pool with SSL required (Azure enforces SSL)
- Deployed to: `agentguard-db.postgres.database.azure.com`
- Schema auto-migrated on startup via `IDatabase.initialize()`
- `TIMESTAMPTZ` for all timestamps; `SERIAL` primary keys on audit events
- `TEXT` primary keys (UUIDs) for tenant-scoped entities
- No ORM — raw parameterised SQL throughout

### Schema (Canonical)

All tables are defined once in each adapter's `SCHEMA_SQL` constant and in `server.ts` for the inline SQLite fast-path. Migration from inline schema to adapter-managed schema is complete.

**Core tables:**

| Table | Description |
|-------|-------------|
| `tenants` | Tenant registry; kill switch state |
| `api_keys` | API key → tenant mapping; usage tracking |
| `audit_events` | Immutable evaluation log; SHA-256 hash chain |
| `sessions` | Agent session groupings |
| `agents` | Registered agents with API keys and policy scope |
| `webhooks` | Tenant webhook subscriptions |
| `policies` | Custom policy documents per tenant |
| `rate_limits` | Rate limit configurations per tenant/agent |
| `rate_counters` | Sliding window counters |
| `cost_events` | Per-call cost attribution records |
| `mcp_configs` | MCP server proxy configurations |

**Deployment enforcement tables** (added Phase 4):

| Table | Description |
|-------|-------------|
| `agent_tools` | Declared tool inventory per agent |
| `validation_runs` | History of validate/certify calls |
| `agent_certifications` | Active and historical certifications |
| `agent_status_history` | Lifecycle state transition audit trail |
| `mcp_admission_events` | MCP pre-flight admission audit trail |

### Hash Chain (Audit Integrity)

Every `audit_event` row contains:

- `previous_hash` — the hash of the preceding event in this tenant's chain
- `hash` — SHA-256(`previous_hash + tool + result + created_at + tenant_id`)
- First event uses `GENESIS_HASH = '0'.repeat(64)`

The `GET /api/v1/audit/verify` endpoint re-computes and validates the entire chain. A direct database-level `UPDATE` will break the chain and be detected.

---

## 6. Deployment Topology

### Azure Container Apps

AgentGuard runs on **Azure Container Apps** (not AWS ECS Fargate as earlier documents stated). See [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) for context.

```
GitHub Actions CI/CD
        │
        ├── Build Docker image
        ├── Push to Azure Container Registry (ACR)
        └── Deploy to Azure Container Apps
                │
                ├── agentguard-api  (Express API, Port 3000)
                └── (dashboard served separately or from CDN)
```

**Container spec:**
- Base image: `node:22-alpine`
- Working dir: `/app`
- Command: `node --loader tsx/esm api/server.ts`
- Persistent storage: Azure Files mount at `/data` (SQLite file — being retired)
- Environment variables: `DB_TYPE`, `DATABASE_URL`, `AG_DB_PATH`, `NODE_ENV`, `PORT`

**Health check:** `GET /health` — returns `{ status: "ok", db: "ok" }` with a live DB ping.

### Cloudflare

All five subdomains are proxied through Cloudflare:

| Subdomain | Target | Notes |
|-----------|--------|-------|
| `api.agentguard.dev` | Azure Container App | Flexible SSL; API traffic |
| `app.agentguard.dev` | Azure Container App or CDN | Dashboard |
| `demo.agentguard.dev` | Azure Container App | Public demo playground |
| `docs.agentguard.dev` | Hosted docs | 34 endpoints documented |
| `about.agentguard.dev` | Landing page | Marketing site |

**SSL mode:** Flexible (Cloudflare terminates TLS; backend traffic is HTTP on the Azure private network). Full/Strict SSL is a planned upgrade once an origin certificate is provisioned.

### CI/CD (GitHub Actions)

The deploy pipeline (`deploy-azure.yml`) triggers on push to `main` for relevant paths:

1. **OIDC login** to Azure (no stored credentials)
2. **Change detection** — only rebuild affected components
3. `az acr build` — builds Docker image and pushes to ACR
4. `az containerapp update` — deploys new image to Container App
5. **Health check** — 60s cold-start wait; 12 retry attempts at 5s intervals

TypeScript type checking runs as a non-blocking warning (pragmatic choice while type coverage improves; planned to be made blocking).

---

## 7. Authentication & Tenant Isolation

### API Key Authentication

All API endpoints (except `/health`, `/api/v1/demo/*`, and the public playground) require an `X-API-Key` header.

**Key format:**
- Tenant admin keys: `ag_live_<random>` or `ag_test_<random>`
- Agent keys: `ag_agent_<random>`
- Admin-only keys: `ag_admin_<random>`

**Auth flow:**
```
X-API-Key header
      │
      ▼
  SELECT * FROM api_keys WHERE key = ?
      │
      ├── Not found / inactive → 401
      ├── Agent key on admin endpoint → 403
      └── Valid → resolve tenant_id → attach to request
```

**Current state:** API keys are stored in plaintext in the `api_keys` table. Bcrypt hashing is on the roadmap (see [ROADMAP.md Phase 6](./ROADMAP.md)).

### Tenant Isolation

Every database query that touches tenant data is scoped with `tenant_id = ?` from the authenticated API key's resolved tenant. There is no Row-Level Security at the database layer currently — isolation is enforced at the application layer in every query.

PostgreSQL RLS is a planned enhancement for when the PostgreSQL migration is fully complete.

### Agent Key Restrictions

Agent keys (`ag_agent_*`) are blocked from administrative operations:

- `POST /api/v1/agents` — create agent (blocked)
- `DELETE /api/v1/agents/:id` — deactivate agent (blocked)
- `POST /api/v1/signup` — tenant creation (blocked)
- Kill switch operations (blocked)

Agent keys can call:
- `POST /api/v1/evaluate` — policy evaluation
- `GET /api/v1/audit` — read audit log
- MCP proxy endpoints

---

## 8. API Surface

AgentGuard exposes **34 endpoints** documented at [docs.agentguard.dev](https://docs.agentguard.dev).

### Endpoint Summary by Domain

**Core evaluation:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/evaluate` | Evaluate an agent action against policy |
| `POST` | `/api/v1/demo/evaluate` | Public demo evaluation (no auth) |

**Tenant & auth:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/signup` | Create tenant + initial API key |
| `GET` | `/api/v1/usage` | Usage stats for authenticated tenant |
| `POST` | `/api/v1/killswitch` | Toggle tenant-level kill switch |

**Agents:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/agents` | Register a new agent |
| `GET` | `/api/v1/agents` | List agents for tenant |
| `GET` | `/api/v1/agents/:id` | Get agent detail |
| `DELETE` | `/api/v1/agents/:id` | Deactivate agent |
| `POST` | `/api/v1/agents/:id/validate` | Dry-run policy coverage validation |
| `GET` | `/api/v1/agents/:id/readiness` | Agent readiness status |
| `POST` | `/api/v1/agents/:id/certify` | Certify agent for deployment |
| `POST` | `/api/v1/agents/coverage-check` | Tool coverage check (CLI integration) |

**Audit:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/audit` | Paginated audit event log |
| `GET` | `/api/v1/audit/verify` | Verify SHA-256 hash chain integrity |

**Policies:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/policies` | List policies for tenant |
| `POST` | `/api/v1/policies` | Create / upload policy YAML |
| `GET` | `/api/v1/policies/templates` | List built-in templates |
| `GET` | `/api/v1/policies/:id` | Get policy |
| `DELETE` | `/api/v1/policies/:id` | Delete policy |

**Webhooks:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/webhooks` | List webhooks |
| `POST` | `/api/v1/webhooks` | Create webhook (SSRF-protected) |
| `DELETE` | `/api/v1/webhooks/:id` | Delete webhook |

**Rate limits (Phase 2):**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/rate-limits` | List rate limit configs |
| `POST` | `/api/v1/rate-limits` | Create rate limit |
| `DELETE` | `/api/v1/rate-limits/:id` | Delete rate limit |

**Cost attribution (Phase 2):**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/costs` | Record a cost event |
| `GET` | `/api/v1/costs` | List cost events |
| `GET` | `/api/v1/costs/summary` | Aggregated cost report |

**MCP proxy (Phase 3):**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/mcp/configs` | Register MCP server config |
| `GET` | `/api/v1/mcp/configs` | List MCP configs |
| `POST` | `/api/v1/mcp/proxy` | Proxy MCP tool call with policy enforcement |
| `POST` | `/api/v1/mcp/admit` | Pre-flight admission check for MCP server |

**System:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check with DB ping |
| `GET` | `/api/v1/dashboard/stats` | Dashboard aggregate stats |
| `GET` | `/api/v1/dashboard/feed` | Recent activity feed |

---

## 9. Security Model

### What's Implemented

| Control | Status | Notes |
|---------|--------|-------|
| API key authentication | ✅ | All non-public endpoints |
| Tenant isolation (application layer) | ✅ | Every query scoped by `tenant_id` |
| CORS allowlist | ✅ | Configured per-environment |
| IP rate limiting | ✅ | In-memory sliding window |
| SSRF prevention on webhooks | ✅ | HTTPS-only; blocks private IP ranges; blocks metadata endpoints |
| Audit hash chain | ✅ | SHA-256 chain; tamper-detectable |
| Agent key restrictions | ✅ | Agent keys blocked from admin operations |
| Input validation (Zod) | 🟡 Partial | 5 schemas; expanding. Others use manual checks |
| HTTPS | ✅ | Cloudflare Flexible SSL (origin upgrade planned) |
| No secrets in code | ✅ | All secrets via environment variables |

### What's Planned

| Control | Phase | Notes |
|---------|-------|-------|
| Bcrypt API key hashing | Phase 6 | Currently plaintext storage — migration required |
| PostgreSQL Row-Level Security | Phase 6 | After full PG migration; defence-in-depth |
| Full Zod validation on all inputs | Phase 6 | Replacing manual checks |
| Origin SSL certificate (Cloudflare Full/Strict) | Phase 6 | Upgrade from Flexible |
| HMAC-signed webhook payloads | Planned | For webhook delivery verification |

### Webhook SSRF Prevention

`POST /api/v1/webhooks` validates URLs before storage:

1. Must be syntactically valid
2. Must use `https:` scheme
3. Must not resolve to private IP ranges: `10.x`, `172.16-31.x`, `192.168.x`, `127.x`, `169.254.x`
4. Must not match private hostnames: `localhost`, `*.local`, `*.internal`
5. IPv6 ULA (`fc00::/7`) and loopback (`::1`) blocked

---

## 10. Implemented vs. Planned

This section is intentionally honest about what exists in production versus what is aspirational. Investors and design partners should refer to this as the single source of truth for current capabilities.

### Implemented ✅

| Capability | Notes |
|------------|-------|
| Policy evaluation engine (YAML DSL) | In-process; sub-millisecond evaluation |
| Audit log with hash chain | Tamper-evident; verifiable via API |
| Agent registration and management | With lifecycle status (registered → validated → certified) |
| Webhook alerts on policy decisions | Fire-and-forget delivery |
| Pre-built policy templates | 7 built-in templates (customer-service, code-agent, finance-strict, etc.) |
| Per-tenant rate limiting | Configurable windows and thresholds |
| Cost attribution per tool call | Per-call cost events with aggregation |
| MCP middleware (proxy + enforce) | Policy enforcement on Model Context Protocol servers |
| Deployment enforcement | Validate, certify, and admit (with audit trail) |
| GitHub Action integration | `agentguard-tech/validate@v1` for PR coverage gates |
| PostgreSQL migration | Production now on PostgreSQL 16; SQLite retained for dev/test |
| TypeScript SDK | HTTP client with validation and certification methods |
| Python SDK | HTTP client with validation and certification methods |
| Dashboard | Static HTML; agent list, audit log, policy editor |
| Demo playground | Public; no auth required |
| 34 documented API endpoints | Full reference at docs.agentguard.dev |

### In Progress 🔄

| Capability | Notes |
|------------|-------|
| Server modularisation (Phase 6) | Extracting `server.ts` (~1,700 lines) into route modules |
| Full Zod validation | 5 schemas done; expanding to all 34 endpoints |
| TypeScript type check as CI gate | Currently non-blocking warning |

### Planned 📋

| Capability | Target Phase | Notes |
|------------|-------------|-------|
| Bcrypt API key hashing | Phase 6 | Significant migration; all keys must be re-issued or re-hashed |
| Redis cache | Future | Hot-path rate limits, policy bundle cache |
| Background worker queue | Future | Reliable webhook delivery with retries, SIEM push |
| JWT / RS256 authentication | Future | For enterprise SSO integration |
| Row-Level Security (PostgreSQL) | Future | Defence-in-depth after full PG migration |
| HMAC-signed webhook payloads | Future | `X-AgentGuard-Signature` header |
| Next.js dashboard | Future | Current static dashboard first; framework upgrade when warranted |
| LangChain in-process SDK | Future | Currently HTTP client; in-process bundle evaluation for < 5ms |
| CrewAI / AutoGen integrations | Future | After Python SDK architecture is proven |
| Multi-tenant dashboard (enterprise) | Future | Per-tenant scoped admin views |
| SIEM integrations (Splunk, Sentinel) | Future | Webhook-based initially; native push later |
| Compliance reporting (EU AI Act, HIPAA) | Future | Requires production audit data volume |
| ML anomaly detection | Future | Requires 30+ days of production telemetry |
| On-premises / Helm chart | Future | After SaaS is stable |

---

*Document version: 3.0 — March 2026*  
*Owner: Engineering Lead*  
*Supersedes: ARCHITECTURE.md v2.0 (described intended architecture, not deployed reality)*  
*Next review: End of Phase 6 (server modularisation complete)*  
*Classification: Confidential — AgentGuard Internal*
