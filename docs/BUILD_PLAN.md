# AgentGuard — Product Build Plan
## Technical Program Manager Document v1.0 — March 2026

> **Purpose:** This document bridges the gap between the existing prototype SDK (which runs locally, in-memory) and a working product deployed on Azure. It answers: *what exactly do we build, in what order, and how does it all connect?* An engineering team — or a set of AI sub-agents — should be able to pick up Week 1 tasks and start building immediately.

> **Note on Infrastructure:** The architecture documents specify AWS (ECS Fargate, RDS, ElastiCache). This build plan adapts that to **Azure Container Apps + Azure Database for PostgreSQL + Azure Cache for Redis**, as specified in the build brief. All service-level architecture decisions remain identical; only the hosting primitives change.

---

## Table of Contents

1. [Current State vs Target State](#1-current-state-vs-target-state)
2. [System Components to Build](#2-system-components-to-build)
3. [Build Sequence — Critical Path](#3-build-sequence--critical-path)
4. [API Specification](#4-api-specification)
5. [Database Migration Plan](#5-database-migration-plan)
6. [End-to-End Demo Script](#6-end-to-end-demo-script)
7. [What We Can Build with AI Agents](#7-what-we-can-build-with-ai-agents)
8. [Risk Register](#8-risk-register)

---

## 1. Current State vs Target State

### What Exists Today

The prototype is a **TypeScript monorepo** living in `src/`. It is runnable locally, has no persistent storage, no authentication, and no network boundary. It proves the core algorithm works — nothing more.

| Layer | What Exists Now |
|---|---|
| **Policy Engine** | `src/core/policy-engine.ts` — full `PolicyEngine` + `PolicyCompiler` class. Parses YAML DSL, compiles to `PolicyBundle`, evaluates requests with correct priority/conflict resolution. **This is the most valuable existing artefact.** ~800 lines, well-tested. |
| **Audit Logger** | `src/core/audit-logger.ts` — in-memory, append-only `AuditLogger`. No persistence, no hash chain, no DB. Loses data on process exit. |
| **Kill Switch** | `src/core/kill-switch.ts` — in-memory `KillSwitch` class. No Redis, no propagation to external SDKs. Useful as a reference implementation only. |
| **LangChain Wrapper** | `src/sdk/langchain-wrapper.ts` — `AgentGuardToolWrapper` + `GuardedTool`. Wraps LangChain tools; calls policy engine, audit logger, kill switch, HITL approval bus. Working prototype. |
| **HITL Approval Bus** | `src/sdk/langchain-wrapper.ts` — `ApprovalEventBus` using Node `EventEmitter`. In-process only; resolving requires programmatic calls. No human UI. |
| **Types & Schemas** | `src/core/types.ts` — Zod schemas for `PolicyDocument`, `PolicyBundle`, `CompiledRule`, `ActionRequest`, `PolicyDecision`, `AgentContext`. Source of truth for the policy engine. |
| **Error Classes** | `src/core/errors.ts` — `PolicyError`, `AgentGuardError`. Usable as-is. |
| **Demo** | `src/examples/demo.ts` — end-to-end demo that runs locally. Shows the system working but nothing is persisted or deployed. |
| **Example Policies** | `src/examples/policies/*.yaml` — 3 example policies: `support-agent.yaml`, `finance-agent.yaml`, `devops-agent.yaml`. These are real, tested inputs to the compiler. |
| **Tests** | `src/core/__tests__/policy-engine.test.ts` — unit tests for the policy engine. Should be extended, not replaced. |
| **Health Route** | `src/routes/health.ts` — minimal Hono health check. Scaffolding only. |

### What the MVP Needs

| Dimension | Current (Prototype) | Target (MVP) |
|---|---|---|
| **SDK distribution** | Local file import | Published to **npm** (`@agentguard/sdk`) and **PyPI** (`agentguard`); semver versioned |
| **API server** | None (no server runs) | **Hono** control plane API deployed on **Azure Container Apps**; HTTPS, JWT auth |
| **Database** | None (all in-memory) | **PostgreSQL** via Prisma (Azure Database for PostgreSQL Flexible Server); all data persisted |
| **Cache / real-time state** | None | **Redis** (Azure Cache for Redis); kill switch flags, HITL state, policy bundle cache |
| **Audit log** | In-memory array, lost on exit | DB-persisted, **hash-chained** `AuditEvent` table; append-only trigger; tamper-evident |
| **Kill switch** | In-process flag | Redis-backed flag; **propagates to all connected SDKs** via long-poll within 15s |
| **HITL gates** | EventEmitter (programmatic only) | DB-persisted `HITLGate`; human resolves via **dashboard UI**; Slack/email notifications |
| **Policy storage** | YAML files on disk | Stored in PostgreSQL (`PolicyVersion.yamlContent`); compiled bundle cached in Redis |
| **Agent integration** | Tool wrapping only (TypeScript) | **LangChain callback handler** (Python SDK) + **OpenAI SDK wrapper** (Python); talks to control plane |
| **Authentication** | None | **API keys** (agent SDK auth, bcrypt-hashed) + **JWT** (human dashboard auth); multi-tenant |
| **Multi-tenancy** | None | `tenantId` on every DB record; PostgreSQL Row-Level Security; ServiceContext pattern throughout |
| **Dashboard** | None | **Next.js 14** app: agent fleet, real-time event stream, policy editor (YAML), kill switch UI, HITL queue, audit log viewer |
| **Anomaly detection** | Risk score formula exists in evaluator | **Rule-based anomaly flags** computed on every ingested event; 5+ detection rules |
| **SIEM integrations** | None | **Splunk HEC** + **Microsoft Sentinel** push via BullMQ background workers |
| **CI/CD** | None | GitHub Actions → build/test → push to **Azure Container Registry** → deploy to **Azure Container Apps** |
| **Observability** | None | OpenTelemetry → **Azure Monitor** (or Datadog); traces, metrics, logs; `traceId` on every log line |

---

## 2. System Components to Build

### Component Overview

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                          AGENTGUARD MVP — COMPONENT MAP                            │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │  AZURE CONTAINER APPS                                                        │  │
│  │                                                                              │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │  │
│  │  │  Control Plane API (Hono / Node.js 22)                               │    │  │
│  │  │                                                                      │    │  │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────┐  │    │  │
│  │  │  │ AgentService │ │PolicyService │ │ AuditService  │ │ HITL /   │  │    │  │
│  │  │  │              │ │+ Compiler    │ │+ HashChain    │ │KillSwitch│  │    │  │
│  │  │  └──────────────┘ └──────────────┘ └───────────────┘ └──────────┘  │    │  │
│  │  │                              │                                       │    │  │
│  │  │  ┌────────────────────── Prisma ORM ──────────────────────────────┐ │    │  │
│  │  │  └───────────────────────────────────────────────────────────────-┘ │    │  │
│  │  └──────────────────────────────────┬───────────────────────────────────┘    │  │
│  │                                     │                                         │  │
│  │  ┌──────────────────┐   ┌──────────-┴───────────┐   ┌──────────────────┐    │  │
│  │  │  Dashboard        │   │  Background Workers    │   │  Azure Database  │    │  │
│  │  │  (Next.js 14)     │   │  (BullMQ/Redis)        │   │  PostgreSQL 16   │    │  │
│  │  │  Port 3000        │   │  - telemetry-ingest    │   │  (Prisma schema) │    │  │
│  │  │  WebSocket feed   │   │  - siem-publisher      │   └──────────────────┘    │  │
│  │  │  Policy editor    │   │  - policy-distributor  │                           │  │
│  │  │  HITL queue       │   │  - alert-notifier      │   ┌──────────────────┐    │  │
│  │  └──────────────────┘   └───────────────────────-┘   │  Azure Cache     │    │  │
│  │                                                        │  for Redis       │    │  │
│  └────────────────────────────────────────────────────────┤  (kill switch,   │    │  │
│                                                            │  HITL state,     │    │  │
│                                                            │  bundle cache,   │    │  │
│                                                            │  BullMQ queues)  │    │  │
│                                                            └──────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────┘
        │
        │  HTTPS / REST API
        │  (policy bundle fetch, telemetry push, kill switch poll)
        │
┌───────▼──────────────────────────────────────────────────┐
│  DEVELOPER'S ENVIRONMENT (inside customer's AI agent)     │
│                                                           │
│  Python SDK (pip install agentguard)                      │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  AgentGuard(api_key="ag_...")                        │  │
│  │  ├─ PolicyBundle (in-process LRU cache, 60s TTL)    │  │
│  │  ├─ TelemetryBuffer (async, batched every 5s)       │  │
│  │  ├─ KillSwitchWatcher (background thread, 10s poll) │  │
│  │  └─ HITLGate (blocking poll on require_approval)    │  │
│  │                                                      │  │
│  │  AgentGuardCallbackHandler (LangChain)              │  │
│  │  AgentGuardOpenAI (OpenAI SDK wrapper)              │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

---

### Component a — Control Plane API

**What it does:** The Hono server is the brain of AgentGuard. It exposes REST endpoints for everything: agent registration, policy CRUD, action evaluation (for SDK), telemetry ingest, audit queries, kill switch, and HITL gate management.

**Key files to create:**
```
packages/api/src/
├── server.ts                    # Hono entry point, middleware stack
├── middleware/
│   ├── auth.ts                  # JWT → ServiceContext; API key → ServiceContext
│   ├── tenant-rls.ts            # SET LOCAL app.current_tenant_id
│   └── error-handler.ts         # ServiceError → HTTP response
├── services/
│   ├── base.service.ts          # BaseService abstract class + ServiceContext type
│   ├── agent/agent.service.ts
│   ├── policy/policy.service.ts
│   ├── policy/policy.compiler.ts  ← PORT from src/core/policy-engine.ts
│   ├── policy/policy.evaluator.ts ← PORT from src/core/policy-engine.ts
│   ├── audit/audit.service.ts
│   ├── audit/hash-chain.ts       ← NEW (no equivalent in prototype)
│   ├── kill-switch/kill-switch.service.ts ← REPLACE src/core/kill-switch.ts
│   ├── hitl/hitl.service.ts
│   └── siem/splunk.service.ts
├── routes/
│   ├── agents.ts
│   ├── policies.ts
│   ├── events.ts
│   ├── hitl.ts
│   ├── kill-switch.ts
│   └── siem.ts
└── schemas/                     # Zod schemas (z.infer<> for types)
    ├── agent.schema.ts
    ├── policy.schema.ts         ← EXTEND from src/core/types.ts
    ├── audit-event.schema.ts
    ├── telemetry.schema.ts
    └── hitl.schema.ts
```

**What to PORT from prototype:**
- `PolicyCompiler` and `PolicyEngine` classes from `src/core/policy-engine.ts` — the core evaluation algorithm. This is battle-tested; adapt to use DB-backed bundle storage.
- Zod schemas from `src/core/types.ts` — `PolicyDocumentSchema`, `PolicyBundleSchema`, etc.
- `PolicyError` from `src/core/errors.ts` — extend with HTTP status codes.

**External dependencies:** `hono`, `@prisma/client`, `@prisma/adapter-pg`, `ioredis`, `bullmq`, `jose` (JWT), `bcryptjs`, `zod`, `js-yaml`, `micromatch`

**API endpoints it exposes:** See Section 4 — all endpoints.

**Database tables:** All tables (it's the sole writer).

**Estimated effort:** 8–10 days (1 senior backend dev).

---

### Component b — Database Layer

**What it does:** The Prisma schema defines the entire data model. Multi-tenant from day one: `tenantId` on every table, composite unique constraints, PostgreSQL Row-Level Security as defence-in-depth.

**Key files to create:**
```
packages/api/prisma/
├── schema.prisma               # Full schema per DATA_MODEL.md §2
└── migrations/
    ├── 001_tenants_users_api_keys.sql
    ├── 002_agents_sessions.sql
    ├── 003_policies_versions.sql
    ├── 004_audit_events.sql     # Includes append-only trigger + RLS
    └── 005_anomaly_killswitch_hitl.sql
```

**What's new vs prototype:** Everything. The prototype has zero persistence. The Prisma schema from `DATA_MODEL.md §2` is the complete spec.

**External dependencies:** `@prisma/client`, `@prisma/adapter-pg`, `pg`, PostgreSQL 16 (Azure)

**Database tables:** All 12 tables — see Section 5 for migration order.

**Estimated effort:** 2–3 days (schema + migrations + seed data).

---

### Component c — Policy Engine Service

**What it does:** Wraps the existing prototype policy engine (`PolicyCompiler` + `PolicyEngine`) with DB persistence (stores compiled bundles in `PolicyVersion.compiledBundle`), Redis caching (TTL 60s), and hot-reload propagation to connected SDKs.

**Key files to create:**
```
packages/api/src/services/policy/
├── policy.service.ts      # CRUD + activate + test + version history
├── policy.compiler.ts     # PORTED from src/core/policy-engine.ts (PolicyCompiler)
├── policy.evaluator.ts    # PORTED from src/core/policy-engine.ts (evaluation logic)
└── policy-distributor.ts  # BullMQ worker: push compiled bundle to Redis on activate
```

**What to PORT:** `PolicyCompiler.compile()`, all condition evaluators (`evalToolCondition`, `evalParamConditions`, `evalValueConstraint`, `evalTimeWindow`, `extractDomain`). The entire core evaluation path is ready; this sprint is wiring it to DB + Redis.

**External dependencies:** `js-yaml`, `zod`, `micromatch`, `ioredis` (cache), `bullmq` (distributor worker)

**API endpoints it exposes:**
- `POST /policies` — parse YAML, compile, store `PolicyVersion`
- `POST /policies/:id/activate` — set active version, push to Redis, invalidate SDK caches
- `POST /policies/:id/test` — run test fixtures through evaluator (no persistence)
- `GET /sdk/bundle` — serve compiled bundle from Redis cache (agent API key auth)

**Database tables:** `Policy`, `PolicyVersion`

**Estimated effort:** 4–5 days (porting + DB wiring + Redis cache + test endpoint).

---

### Component d — Audit Service

**What it does:** Ingests telemetry batches from the Python SDK, persists every action as an immutable `AuditEvent` with a hash chain linking each event to the previous in the session. Provides query and export APIs for the dashboard and HITL service. Integrity verification endpoint allows auditors to prove no tampering.

**Key files to create:**
```
packages/api/src/services/audit/
├── audit.service.ts       # ingestBatch(), queryEvents(), getSession(), verifyChain()
└── hash-chain.ts          # computeEventHash(), GENESIS_HASH constant
```

**What's new vs prototype:** The prototype's `AuditLogger` (`src/core/audit-logger.ts`) is a simple in-memory append. The production version adds:
- SHA-256 hash chaining (each event includes `previousHash` + `eventHash`)
- DB persistence via Prisma (`AuditEvent` model)
- Append-only enforcement via PostgreSQL trigger (cannot UPDATE or DELETE)
- `AnomalyScore` computed and stored alongside each event

**Hash chain algorithm** (from `DATA_MODEL.md §8`):
```typescript
import { createHash } from 'node:crypto';
export const GENESIS_HASH = '0'.repeat(64);
export function computeEventHash(previousHash: string, event: HashableEvent): string {
  const payload = JSON.stringify(
    Object.fromEntries(Object.entries(event).sort(([a], [b]) => a.localeCompare(b)))
  );
  return createHash('sha256').update(previousHash + '|' + payload).digest('hex');
}
```

**External dependencies:** `node:crypto` (stdlib), Prisma, BullMQ (for async SIEM fan-out)

**API endpoints it exposes:**
- `POST /sdk/telemetry/batch` — ingest SDK telemetry; creates `AuditEvent` + `AnomalyScore`
- `GET /events` — paginated, filterable event query
- `GET /events/:id` — single event
- `GET /events/verify-chain?sessionId=` — cryptographic integrity check
- `POST /events/export` — async bulk export to Azure Blob Storage

**Database tables:** `AuditEvent`, `AnomalyScore`, `AgentSession`

**Estimated effort:** 4–5 days (hash chain implementation, DB wiring, integrity endpoint, anomaly scoring).

---

### Component e — Kill Switch Service

**What it does:** Issues and propagates kill commands to running agents. The Redis flag is the real-time mechanism — the Python SDK polls it every 10 seconds via long-poll. The DB record (`KillSwitchCommand`) is the audit trail. Soft kills let the current action finish; hard kills interrupt immediately.

**Key files to create:**
```
packages/api/src/services/kill-switch/
└── kill-switch.service.ts  # issueKill(), checkKillSwitch(), resumeAgent()
packages/api/src/routes/
└── kill-switch.ts          # POST /agents/:id/kill, POST /agents/:id/resume, GET /sdk/kill-switch
```

**What to REPLACE from prototype:** `src/core/kill-switch.ts` is in-process only. The production service uses Redis: `SET killswitch:{tenantId}:{agentId} "hard" EX 86400`. The Python SDK polls `GET /sdk/kill-switch` (long-poll endpoint, 10s server timeout).

**External dependencies:** `ioredis`

**API endpoints it exposes:**
- `POST /agents/:id/kill` — sets Redis flag + creates `KillSwitchCommand` record
- `POST /agents/:id/resume` — clears Redis flag + updates `Agent.status`
- `GET /sdk/kill-switch` — long-poll by SDK; returns `{ killed: bool, tier: string | null }`
- `GET /agents/:id/kill-status` — current state (reads Redis)

**Database tables:** `KillSwitchCommand`, `Agent` (status update)

**Estimated effort:** 2–3 days (straightforward Redis + DB; complexity is the long-poll endpoint).

---

### Component f — HITL Gate Service

**What it does:** When the policy engine returns `require_approval`, the SDK calls `POST /hitl/gates` to create a gate record. It then blocks the agent thread by long-polling `GET /hitl/gates/:id/poll`. An operator approves or rejects in the dashboard. The gate also has a timeout — if no decision is made before `timeoutAt`, the `on_timeout` action (usually `block`) is applied automatically via a BullMQ delayed job.

**Key files to create:**
```
packages/api/src/services/hitl/
└── hitl.service.ts   # createGate(), resolveGate(), getPendingGates(), pollGateStatus()
packages/api/src/routes/
└── hitl.ts           # GET /hitl/pending, POST /hitl/:id/approve, POST /hitl/:id/reject, GET /hitl/:id/poll
packages/api/src/workers/
└── hitl-timeout.ts   # BullMQ delayed job: expire gate on timeoutAt
```

**What to REPLACE from prototype:** `ApprovalEventBus` in `src/sdk/langchain-wrapper.ts` is in-process EventEmitter. Production uses Redis for gate state + HTTP long-poll. The gate concept is the same; the plumbing is entirely new.

**External dependencies:** `ioredis` (gate state), `bullmq` (timeout job), `@aws-sdk/client-ses` / `fetch` (notifications)

**Notification flow:** On gate creation → email via Azure Communication Services (or SendGrid) + Slack webhook. `HITLGate.notifiedViaSlack` and `notifiedViaEmail` track delivery.

**API endpoints it exposes:**
- `GET /hitl/pending` — operator queue of pending gates (uses partial index `idx_hitl_pending`)
- `GET /hitl/:id` — gate detail
- `POST /hitl/:id/approve` — resolve with APPROVED; SDK poll unblocks
- `POST /hitl/:id/reject` — resolve with REJECTED
- `GET /hitl/:id/poll` — long-poll endpoint used by Python SDK (10s timeout)

**Database tables:** `HITLGate`, `AuditEvent` (updated with HITL outcome)

**Estimated effort:** 3–4 days (gate lifecycle, timeout job, notifications).

---

### Component g — Anomaly Detection (Rule-Based)

**What it does:** Computes a risk score and flags for every ingested `AuditEvent`. Phase 1 is purely rule-based (no ML). Five detection rules fire when thresholds are exceeded, producing flag labels stored on the `AnomalyScore` record.

**Key files to create:**
```
packages/api/src/services/audit/
└── anomaly-scorer.ts   # computeAnomalyScore(event, sessionContext) → AnomalyScore
```

**Detection rules (Phase 1):**

| Rule | Condition | Flag Label |
|---|---|---|
| High velocity | >30 tool calls in 60s window | `HIGH_VELOCITY` |
| Repeated denials | >5 BLOCK decisions in current session | `REPEATED_DENIALS` |
| Unusual hours | Action outside business hours (configurable per policy) | `UNUSUAL_HOURS` |
| New tool first use | Tool name never seen before from this agent | `NEW_TOOL_FIRST_USE` |
| Action count spike | Session `actionCount` > 200 | `ACTION_COUNT_SPIKE` |

**Risk score formula** (already in prototype, make production-grade):
```
base_score = { allow: 0, monitor: 10, block: 50, require_approval: 40 }[decision]
monitor_boost = sum(riskBoost for matched monitor rules)
context_multiplier = { low: 1.0, medium: 1.5, high: 2.0, critical: 3.0 }[riskTier]
final_score = min(1000, (base_score + monitor_boost) * context_multiplier)
```

**External dependencies:** None beyond Prisma (reads session counters, writes `AnomalyScore`)

**Database tables:** `AnomalyScore` (written), `AgentSession` (read for context)

**Estimated effort:** 2 days (the formula exists; it's implementing the 5 rules + DB write).

---

### Component h — SDK (TypeScript + Python)

**What it does:** The client SDK is what developers install. It wraps their agent framework, evaluates actions against a locally-cached policy bundle (no network call on hot path), and reports telemetry to the control plane asynchronously. Phase 1 ships Python SDK; TypeScript SDK follows in Phase 2.

**Python SDK architecture (`pip install agentguard`):**
```
packages/sdk-python/agentguard/
├── __init__.py
├── sdk.py               # AgentGuard class — entry point, init, background threads
├── policy/
│   ├── bundle.py        # PolicyBundle dataclass + in-process LRU cache
│   ├── evaluator.py     # PORT evaluation logic from src/core (Python translation)
│   └── loader.py        # Fetch + refresh bundle from GET /sdk/bundle
├── integrations/
│   ├── langchain/
│   │   └── callback.py  # AgentGuardCallbackHandler (extends BaseCallbackHandler)
│   └── openai/
│       └── wrapper.py   # AgentGuardOpenAI (wraps openai.OpenAI)
├── telemetry/
│   ├── buffer.py        # Thread-safe queue; disk fallback on API failure
│   └── emitter.py       # Daemon thread: batch push every 5s or 100 events
├── kill_switch/
│   └── watcher.py       # Daemon thread: long-poll kill switch status every 10s
├── hitl/
│   └── gate.py          # Blocking poll: wait() until APPROVED/REJECTED/timeout
├── errors.py            # PolicyViolationError, AgentGuardError
└── models.py            # Dataclasses: ActionEvent, PolicyDecision, etc.
```

**What to PORT from prototype:**
- `AgentGuardToolWrapper` / `GuardedTool` logic from `src/sdk/langchain-wrapper.ts` → translate to Python `AgentGuardCallbackHandler`. The decision-handling logic (block→raise, HITL→wait, monitor→log) is identical.
- All condition evaluators (`evalToolCondition`, `evalValueConstraint`, etc.) → translate to Python. These must produce **identical decisions** to the TypeScript version for the same bundle.

**TypeScript SDK (npm package `@agentguard/sdk`):** A lighter wrapper for Week 5–6 — primarily the `AgentGuard` client class that connects to the control plane, fetches bundles, and pushes telemetry. The evaluation logic can be ported from `src/core/policy-engine.ts` directly (it's TypeScript already).

**External dependencies (Python):** `httpx`, `pydantic`, `langchain-core`, `openai`, `pyyaml`

**API endpoints it consumes:**
- `GET /sdk/bundle` — fetch compiled policy bundle on start + 60s refresh
- `POST /sdk/telemetry/batch` — push buffered events every 5s
- `GET /sdk/kill-switch` — long-poll kill switch status
- `POST /hitl/gates` — create gate when `require_approval` decision
- `GET /hitl/:id/poll` — wait for gate resolution

**Estimated effort:** 8–10 days (Python SDK is the most effort; TS SDK is ~3 days on top).

---

### Component i — Dashboard

**What it does:** The Next.js 14 dashboard gives operators real-time visibility and control. It's the human interface for everything: watching agents run, editing policies, approving HITL gates, hitting the kill switch, and verifying audit trails.

**Pages to build:**
```
apps/dashboard/app/
├── (auth)/
│   └── login/page.tsx
├── agents/
│   ├── page.tsx           # Agent fleet: status badges, risk scores, last seen
│   └── [id]/
│       ├── page.tsx       # Agent detail: event log, risk chart, kill switch button
│       └── sessions/[sessionId]/page.tsx  # Session replay
├── events/
│   └── page.tsx           # Global event log: filterable, real-time WebSocket feed
├── policies/
│   ├── page.tsx           # Policy list
│   ├── new/page.tsx       # Create policy (YAML editor)
│   └── [id]/page.tsx      # Policy detail: version history, test runner, activate
├── hitl/
│   └── page.tsx           # Pending approvals queue with countdown timers
└── audit/
    └── page.tsx           # Audit log with chain verification
```

**Key UI components:**
- **Real-time event feed** — WebSocket connection to `wss://api.agentguard.io/v1/events/stream`; events push as agents run
- **YAML policy editor** — Monaco Editor or CodeMirror with YAML syntax highlighting; shows compile errors from API inline
- **Kill switch button** — red button with confirmation modal; calls `POST /agents/:id/kill`; shows soft vs hard tier selection
- **HITL approval queue** — countdown timer per gate; approve/reject buttons with note field; auto-refreshes via WebSocket when new gate arrives
- **Audit chain verifier** — calls `GET /events/verify-chain?sessionId=`; shows green/red chain validity indicator

**External dependencies:** `next`, `react`, `shadcn/ui`, `tailwindcss`, `swr`, `recharts`, `ws` (WebSocket client), `monaco-editor` (YAML editor)

**API endpoints it consumes:** Essentially all management endpoints. See Section 4.

**Estimated effort:** 7–9 days (UI heavy; each page is 0.5–1 day; real-time feed adds complexity).

---

### Component j — Auth & Multi-tenancy

**What it does:** Two auth schemes co-exist. Human operators authenticate with JWT (RS256, 1-hour expiry) issued after login. AI agents authenticate with API keys (bcrypt-hashed, prefix stored for display). Every authenticated request injects a `ServiceContext` that carries `{ tenantId, userId, role, traceId }` — this is the source of truth for tenant isolation.

**Key files to create:**
```
packages/api/src/
├── middleware/auth.ts            # JWT validation → ServiceContext injection
├── middleware/tenant-rls.ts      # SET LOCAL app.current_tenant_id per request
├── services/base.service.ts      # BaseService: withTransaction(), assertRole(), tenantScope()
└── lib/api-key.ts                # generateApiKey(), hashApiKey(), lookupByHash()
```

**Multi-tenancy enforcement layers:**
1. **JWT claims** — `tenantId` extracted from token, never from request body
2. **ServiceContext** — flows through every service method; all Prisma queries use `tenantId: this.ctx.tenantId`
3. **PostgreSQL RLS** — `SET LOCAL app.current_tenant_id` enforced per-request; DB rejects cross-tenant queries even if application code is wrong
4. **Composite indexes** — `(tenantId, id)` on every table ensures efficient tenant-scoped lookups

**API key lifecycle:**
- Generated: `ag_live_` prefix + 48 random bytes (hex) = 104 char key
- Stored: bcrypt hash in `Agent.apiKeyHash`; first 16 chars in `Agent.apiKeyPrefix` for display
- Auth: SDK sends in `Authorization: Bearer ag_live_...` header; middleware does bcrypt compare
- Rotation: deregister + re-register agent (Phase 2: key rotation endpoint)

**External dependencies:** `jose` (JWT RS256), `bcryptjs`, `crypto` (key generation)

**Estimated effort:** 2–3 days (auth is plumbing; the patterns are well-defined).

---

## 3. Build Sequence — Critical Path

```
Week 1-2: Foundation
    │
    ▼
Week 3-4: Core API (Agents + Policies)
    │
    ├──────────────────────────────┐
    ▼                              ▼
Week 5-6: SDK + Integration    (parallel) Dashboard scaffolding begins
    │
    ▼
Week 7-8: Monitoring + Safety (Audit, Kill Switch, HITL)
    │
    ▼
Week 9-10: Dashboard (complete)
    │
    ▼
Week 11-12: Polish + Launch
```

---

### Week 1–2: Foundation

**Goal:** Any engineer clones the repo, runs one command, has a working local dev environment. CI/CD pipeline is live. Empty API deployed to Azure.

**Deliverables:**

1. **Monorepo setup with Turborepo**
   - Structure: `packages/api`, `packages/sdk-python`, `packages/sdk-ts`, `apps/dashboard`, `packages/shared`
   - `packages/shared` contains: Zod schemas, TypeScript types (ported from `src/core/types.ts`)
   - ESLint + Prettier enforced; named exports only; `import type` for type-only imports
   - Vitest 2.x configured; `npm test` runs all unit tests

2. **Prisma schema — initial definition**
   - Full schema from `DATA_MODEL.md §2` written in `packages/api/prisma/schema.prisma`
   - `prisma generate` produces typed client
   - Docker Compose: PostgreSQL 16 + Redis 7 + pgAdmin (dev only)

3. **Basic Hono API scaffold**
   - `packages/api/src/server.ts` — Hono app with health check
   - Auth middleware skeleton (JWT validation wire-up, ServiceContext injection)
   - Error handler middleware (maps `ServiceError` to JSON)
   - `GET /health` returns `{ status: "ok", version, timestamp }`

4. **Azure Container Apps deployment (empty)**
   - Azure Container Apps environment provisioned (via Bicep / Terraform)
   - Azure Database for PostgreSQL Flexible Server (initially empty schema)
   - Azure Cache for Redis (Standard tier, at least 1 replica)
   - GitHub Actions CI: PR → lint/test/build; merge to `main` → push to Azure Container Registry → deploy to Container Apps
   - All secrets in Azure Key Vault; referenced via managed identity (no plaintext secrets)

5. **OpenTelemetry wiring**
   - `@opentelemetry/sdk-node` configured
   - Traces + logs → Azure Monitor (Application Insights) or Datadog
   - `traceId` on every log line (structured JSON logging)

**Dependencies:** None — this is the foundation.

**Key decisions for Week 1:**
- Pin Node.js version (`.nvmrc` + Dockerfile `FROM node:22-slim`)
- Choose Azure region (e.g., `eastus2`) — must be consistent across all resources
- Set up Azure AD app registration for JWT issuer

---

### Week 3–4: Core API

**Goal:** Agent CRUD works. Policy CRUD works. Policy YAML can be uploaded, compiled, stored, and retrieved as a compiled bundle. API key auth works.

**Deliverables:**

1. **Prisma migrations 1–3** run against Azure PostgreSQL:
   - Migration 1: `tenants`, `users`, `api_keys` foundation
   - Migration 2: `agents`, `agent_sessions`
   - Migration 3: `policies`, `policy_versions`
   - PostgreSQL RLS policies enabled on all tenant-scoped tables
   - Append-only trigger on `audit_events` (ready for Migration 4)

2. **BaseService + ServiceContext pattern** (`packages/api/src/services/base.service.ts`)
   - `withTransaction()`, `assertRole()`, `tenantScope()` implemented
   - Cross-tenant isolation integration test: Tenant A's JWT + Tenant B's agent ID → 404

3. **AgentService** — full CRUD with API key management
   - `POST /agents` — creates agent, generates `ag_live_...` API key (shown once, bcrypt-hashed)
   - `GET /agents`, `GET /agents/:id`, `PATCH /agents/:id`, `DELETE /agents/:id`

4. **PolicyService + PolicyCompiler**
   - PORT `PolicyCompiler` from `src/core/policy-engine.ts` into `packages/api/src/services/policy/policy.compiler.ts`
   - `POST /policies` — accept YAML body, compile, store `PolicyVersion`, return compile warnings
   - `POST /policies/:id/activate` — set active version, push compiled bundle to Redis (TTL 60s)
   - `POST /policies/:id/test` — run evaluator against test fixtures; return pass/fail
   - `GET /sdk/bundle` — API-key authenticated; return compiled bundle from Redis (or PostgreSQL on miss)

5. **API key auth middleware**
   - SDK requests: `Authorization: Bearer ag_live_...` → bcrypt lookup → `ServiceContext { role: 'AGENT' }`
   - Human requests: `Authorization: Bearer eyJ...` → RS256 JWT verify → `ServiceContext { role: UserRole }`

**Block:** Nothing can proceed without this sprint. SDK development (Week 5) requires `GET /sdk/bundle` to be live.

---

### Week 5–6: SDK + Integration

**Goal:** A developer can `pip install agentguard`, add 3 lines to their LangChain agent, and have policy enforcement working end-to-end against the deployed API. 30-minute integration target must be achievable.

**Deliverables:**

1. **Python SDK core** (`packages/sdk-python/agentguard/`)
   - `AgentGuard(api_key="ag_live_...")` — initialises everything, starts background threads
   - `PolicyBundle` cache: in-process LRU, fetched from `GET /sdk/bundle`, refreshed every 60s
   - `TelemetryBuffer`: thread-safe queue, daemon thread flushes to `POST /sdk/telemetry/batch` every 5s; local disk fallback on 3x API failure
   - `KillSwitchWatcher`: daemon thread polls `GET /sdk/kill-switch` every 10s; result cached 5s in-process

2. **Python policy evaluator** (`packages/sdk-python/agentguard/policy/evaluator.py`)
   - PORT entire evaluation algorithm from `src/core/policy-engine.ts` to Python
   - Must produce **identical decisions** to the TypeScript evaluator for same bundle + request
   - Cross-language test fixture (200 cases) run in CI — both evaluators must produce identical output
   - p95 < 10ms benchmark enforced in CI

3. **LangChain integration** (`AgentGuardCallbackHandler`)
   - PORT `AgentGuardToolWrapper` / `GuardedTool` logic from `src/sdk/langchain-wrapper.ts` into Python `BaseCallbackHandler`
   - `on_tool_start`: evaluate policy → BLOCK raises `PolicyViolationError`; HITL creates gate + blocks; ALLOW/MONITOR logs and proceeds
   - `on_tool_end`, `on_llm_start`, `on_llm_end`: non-blocking telemetry emission

4. **OpenAI SDK integration** (`AgentGuardOpenAI`)
   - Drop-in wrapper for `openai.OpenAI()`; intercepts `chat.completions.create`
   - Intercepts tool calls in function-calling responses before tool execution

5. **End-to-end integration test**
   - LangChain ReAct agent with `AgentGuardCallbackHandler` → SDK → deployed Azure API → policy eval → ALLOW/BLOCK
   - All three decision paths exercised (ALLOW, BLOCK, HITL)
   - p99 overhead measured < 50ms (CI benchmark artefact)

6. **TypeScript SDK** (`packages/sdk-ts/`)
   - `AgentGuard` client class: connects to API, fetches bundle, pushes telemetry
   - `@agentguard/sdk` published to npm (alpha)

**Block:** Requires Week 3–4 API to have `GET /sdk/bundle` and `POST /sdk/telemetry/batch` live.

---

### Week 7–8: Monitoring + Safety

**Goal:** Every action is logged with a tamper-evident hash chain. Kill switch halts an agent within 15 seconds. HITL gates pause agents and notify humans. Anomaly flags fire on suspicious patterns.

**Deliverables:**

1. **Prisma migrations 4–5**
   - Migration 4: `audit_events` with hash chain columns + append-only trigger + partial indexes
   - Migration 5: `anomaly_scores`, `kill_switch_commands`, `hitl_gates`

2. **AuditService + hash chain**
   - `ingestBatch()`: validate `TelemetryBatchSchema`, create `AuditEvent` + `AnomalyScore` in single transaction with hash chain
   - Session serialisation: concurrent batch inserts for same session are serialised (pessimistic lock on `sessionId`)
   - `GET /events/verify-chain?sessionId=` — re-computes hash chain; reports first broken link
   - Rule-based anomaly scorer: 5 detection rules → `AnomalyScore` flags

3. **KillSwitchService**
   - `POST /agents/:id/kill` — sets Redis key `killswitch:{tenantId}:{agentId}`, creates `KillSwitchCommand` record
   - `GET /sdk/kill-switch` — long-poll endpoint (10s timeout); returns current kill state
   - Integration test: kill → agent halts within 15s (CI artefact)

4. **HITLService**
   - `POST /hitl/gates` — create gate, store in Redis + DB, start BullMQ timeout job
   - `GET /hitl/:id/poll` — long-poll endpoint; SDK blocks here until decision
   - `POST /hitl/:id/approve` / `/reject` — resolve gate, emit to WebSocket, unblock SDK
   - Timeout BullMQ job: on expiry, apply `onTimeout` action, update DB, push to WebSocket

5. **Event streaming (WebSocket)**
   - `wss://.../v1/events/stream` — authenticated WebSocket endpoint
   - On each `AuditEvent` insert, fan-out to all connected dashboard clients for that tenant
   - Dashboard subscribes on load; events appear in real-time feed

6. **SIEM integration scaffolding**
   - `SIEMIntegration` CRUD endpoints (configure Splunk/Sentinel)
   - `siem-publisher` BullMQ worker: on HIGH/CRITICAL events, push to configured SIEM
   - `POST /integrations/siem/:id/test` — send test event

**Block:** Requires SDK (Week 5–6) to be sending telemetry batches.

---

### Week 9–10: Dashboard

**Goal:** A non-technical CISO can open the dashboard, see their agent fleet, understand what's happening in real time, approve HITL gates, and hit the kill switch — all from a browser.

**Deliverables:**

1. **Next.js 14 App Router scaffold**
   - Authentication flow: login → JWT issued → stored in HttpOnly cookie
   - Protected layout: sidebar nav (Agents, Events, Policies, HITL, Audit)
   - WebSocket context provider: single connection per session, fan-out to page components

2. **Agent Fleet page** (`/agents`)
   - Table of agents: name, status badge (ACTIVE/KILLED/QUARANTINED), risk tier, last seen
   - Real-time status updates via WebSocket (no page refresh needed)
   - Kill switch button (red, with confirmation modal — "Hard kill" / "Soft kill" options)

3. **Real-time Event Log** (`/events`)
   - Live feed of `AuditEvent` rows as they come in via WebSocket
   - Filter controls: agent, time range, decision (ALLOW/BLOCK/MONITOR/HITL), risk tier
   - Click event → detail panel showing tool name, params, matched rule, risk score

4. **Policy Editor** (`/policies/:id`)
   - YAML editor with syntax highlighting (Monaco or CodeMirror)
   - "Validate" button → `POST /policies/:id/test` → inline pass/fail results
   - "Activate" button → `POST /policies/:id/activate` → shows propagation warning ("Updates agents within 60s")
   - Version history table with diff view between versions

5. **HITL Approval Queue** (`/hitl`)
   - Card for each pending gate: agent name, tool called, params, matched rule, countdown timer
   - "Approve" / "Reject" buttons with optional note field
   - Real-time: new gate cards appear via WebSocket push (sound notification optional)
   - Auto-updates when timer expires (gate moves to TIMED_OUT)

6. **Audit Trail viewer** (`/audit`)
   - Session selector → view all events in a session in chronological order
   - "Verify Chain" button → calls `GET /events/verify-chain?sessionId=`; shows ✅ or ❌ with broken link position
   - Export button → `POST /events/export` → provides Azure Blob Storage download link

**Performance target:** Agent Fleet page (primary monitoring view) must render in < 2s p95.

---

### Week 11–12: Polish + Launch

**Goal:** End-to-end demo is flawless for investors. Security is hardened. OSS SDK released. Design partners can onboard in < 30 minutes.

**Deliverables:**

1. **End-to-end demo flow** — rehearse and harden the demo script from Section 6. Fix all rough edges.

2. **Error handling sweep**
   - All API endpoints: proper 400/401/403/404/429/500 responses with structured `{ error: { code, message } }`
   - SDK: graceful degradation when API is unreachable (fail-closed by default, disk buffer for telemetry)
   - Dashboard: loading states, empty states, error boundaries

3. **Rate limiting**
   - Per-tenant, per-IP rate limits on all endpoints (Redis sliding window)
   - SDK telemetry batch: max 1,000 events per batch; max 10 batches/minute per agent
   - SIEM test endpoint: max 10 requests/hour per tenant

4. **Input validation sweep**
   - Every endpoint has a Zod schema; unknown keys stripped
   - Webhook URL registration: HTTPS only, private IP ranges blocked (SSRF prevention)
   - Policy YAML: max 200KB; max 500 rules; semver version required

5. **Docs site**
   - API reference (auto-generated from Zod schemas)
   - Quickstart guide (LangChain integration in < 30 minutes)
   - Policy YAML reference (all DSL constructs with examples, ported from `POLICY_ENGINE.md`)
   - 10 policy templates published as a GitHub repository

6. **OSS release**
   - Apache 2.0 license headers on Python SDK, TypeScript SDK, policy engine, schema definitions
   - Public GitHub repository with README, CONTRIBUTING.md, SECURITY.md
   - `pip install agentguard` stable v0.1.0 on PyPI
   - `npm install @agentguard/sdk` stable v0.1.0 on npm

7. **Security hardening**
   - Penetration test checklist (manual): auth bypass attempts, cross-tenant enumeration, SSRF, SQL injection (Prisma + parameterised queries should prevent this, but verify)
   - CSP headers on dashboard
   - Rotate all credentials (DB password, JWT signing key, API key salts)

8. **Design partner onboarding guide**
   - Step-by-step: create tenant, invite user, register agent, upload policy, integrate SDK
   - Video walkthrough (screen recording of demo flow)
   - Dedicated Slack channel for design partner support

---

## 4. API Specification

**Base URL:** `https://api.agentguard.io/v1`

**Auth:** `Authorization: Bearer <token>` — JWT for humans, API key for SDK agents.

**Response format:**
- Success: `{ data: T }` or `{ data: T[], pagination: { cursor: string, hasMore: bool } }`
- Error: `{ error: { code: string, message: string, details?: unknown } }`

---

### Auth Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/login` | None | Email + password → JWT + refresh token |
| `POST` | `/auth/refresh` | Refresh token | Rotate access JWT |
| `POST` | `/auth/logout` | JWT | Invalidate refresh token |
| `POST` | `/tenants` | Admin JWT | Create tenant (platform admin only) |
| `POST` | `/tenants/:id/users` | Owner JWT | Invite user to tenant |
| `GET` | `/tenants/:id` | JWT | Tenant detail |

---

### Agent Endpoints

| Method | Path | Auth | Request Body | Response |
|---|---|---|---|---|
| `GET` | `/agents` | JWT | — | `AgentResponse[]` paginated |
| `POST` | `/agents` | JWT (owner/admin) | `CreateAgentSchema` | `AgentCreatedResponse` (includes API key — shown once) |
| `GET` | `/agents/:agentId` | JWT | — | `AgentResponse` |
| `PATCH` | `/agents/:agentId` | JWT (admin+) | `UpdateAgentSchema` | `AgentResponse` |
| `DELETE` | `/agents/:agentId` | JWT (admin+) | — | `204 No Content` |
| `GET` | `/agents/:agentId/events` | JWT | Query params: `decision`, `riskTier`, `from`, `to`, `cursor`, `limit` | `AuditEventResponse[]` paginated |
| `GET` | `/agents/:agentId/sessions` | JWT | — | `AgentSessionResponse[]` paginated |
| `GET` | `/agents/:agentId/sessions/:sessionId` | JWT | — | `AuditSessionResponse` (full event chain) |

---

### Policy Endpoints

| Method | Path | Auth | Request Body | Response |
|---|---|---|---|---|
| `GET` | `/policies` | JWT | — | `PolicyResponse[]` |
| `POST` | `/policies` | JWT (admin+) | `{ yamlContent: string, activate?: bool }` | `{ policy: PolicyResponse, version: PolicyVersionResponse, warnings: string[] }` |
| `GET` | `/policies/:id` | JWT | — | `PolicyResponse` + compiled metadata |
| `PUT` | `/policies/:id` | JWT (admin+) | `{ yamlContent, changelog }` | New `PolicyVersionResponse` |
| `DELETE` | `/policies/:id` | JWT (admin+) | — | `204` (soft delete) |
| `POST` | `/policies/:id/activate` | JWT (admin+) | `{ version?: string }` | `{ activatedVersion, propagationEstimateSec: 60 }` |
| `POST` | `/policies/:id/test` | JWT | `TestPolicySchema` | `{ summary: {total, passed, failed}, results: TestResult[] }` |
| `GET` | `/policies/:id/versions` | JWT | — | `PolicyVersionResponse[]` |
| `GET` | `/policies/:id/versions/:v` | JWT | — | `PolicyVersionResponse` + YAML |
| `GET` | `/policies/:id/coverage` | JWT | — | `{ rules: { ruleId, coveredByTests, recentMatchRate }[] }` |
| `GET` | `/policies/templates` | JWT | — | Available template names + descriptions |
| `POST` | `/policies/from-template` | JWT (admin+) | `{ template: string, customise?: Record<string, unknown> }` | `PolicyResponse` |

---

### Action / SDK Endpoints (Agent API key auth)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/sdk/bundle` | API key | Fetch compiled policy bundle for this agent; served from Redis (TTL 60s) |
| `POST` | `/sdk/telemetry/batch` | API key | Ingest batch of action events from SDK; creates `AuditEvent` records |
| `GET` | `/sdk/kill-switch` | API key | Long-poll (10s timeout); returns `{ killed: bool, tier: 'soft' \| 'hard' \| null }` |

---

### Kill Switch Endpoints

| Method | Path | Auth | Request Body | Response |
|---|---|---|---|---|
| `POST` | `/agents/:id/kill` | JWT (operator+) | `{ tier: 'soft' \| 'hard', reason?: string }` | `{ command: KillSwitchCommandResponse }` |
| `POST` | `/agents/:id/resume` | JWT (operator+) | `{ reason?: string }` | `AgentResponse` (status: ACTIVE) |
| `GET` | `/agents/:id/kill-status` | JWT | — | `{ killed: bool, tier: string \| null, issuedAt: string \| null }` |

---

### HITL Gate Endpoints

| Method | Path | Auth | Request Body | Response |
|---|---|---|---|---|
| `GET` | `/hitl/pending` | JWT (operator+) | — | `HITLGateResponse[]` (sorted by `createdAt ASC`) |
| `GET` | `/hitl/:id` | JWT | — | `HITLGateResponse` |
| `POST` | `/hitl/:id/approve` | JWT (operator+) | `{ note?: string }` | `HITLGateResponse` (status: APPROVED) |
| `POST` | `/hitl/:id/reject` | JWT (operator+) | `{ note?: string }` | `HITLGateResponse` (status: REJECTED) |
| `GET` | `/hitl/:id/poll` | API key | — | Long-poll (10s); returns gate status when resolved |

---

### Audit / Event Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/events` | JWT | Paginated event query; filter by `agentId`, `sessionId`, `decision`, `riskTier`, `actionType`, `toolName`, `fromDate`, `toDate` |
| `GET` | `/events/:id` | JWT | Single event detail |
| `GET` | `/events/verify-chain` | JWT | `?sessionId=` — re-computes hash chain; returns `{ chainValid, eventCount, firstBrokenAt? }` |
| `POST` | `/events/export` | JWT (auditor+) | `{ filter: QueryAuditEventsSchema }` — async job; returns presigned Azure Blob URL |

---

### SIEM / Webhook Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/integrations/siem` | JWT | List SIEM integrations |
| `POST` | `/integrations/siem/splunk` | JWT (admin+) | Configure Splunk HEC (URL + token + index + minSeverity) |
| `POST` | `/integrations/siem/sentinel` | JWT (admin+) | Configure Sentinel workspace (workspaceId + key) |
| `DELETE` | `/integrations/siem/:id` | JWT (admin+) | Remove integration |
| `POST` | `/integrations/siem/:id/test` | JWT (admin+) | Send test event to SIEM |
| `GET` | `/alerts/webhooks` | JWT | List webhooks |
| `POST` | `/alerts/webhooks` | JWT (admin+) | Create webhook (HTTPS URL, events filter, minSeverity) |
| `DELETE` | `/alerts/webhooks/:id` | JWT (admin+) | Remove webhook |
| `POST` | `/alerts/webhooks/:id/test` | JWT (admin+) | Send test payload |

---

### WebSocket (Dashboard Real-time Feed)

| Endpoint | Auth | Events pushed |
|---|---|---|
| `wss://.../v1/events/stream` | JWT (query param `?token=`) | `{ type: 'audit_event', data: AuditEventResponse }` on every ingest; `{ type: 'hitl_gate', data: HITLGateResponse }` on gate creation/resolution; `{ type: 'kill_switch', data: KillSwitchStatus }` on kill/resume |

---

## 5. Database Migration Plan

Run in order. Each migration is idempotent (safe to re-run). Use `prisma migrate deploy` in CI.

---

### Migration 1: Tenants, Users, API Keys Foundation

**New tables:** `Tenant`, `User`

```sql
-- Key decisions:
-- tenant.slug is globally unique (URL-safe; reserved for future subdomain routing)
-- user.email is unique per tenant (not globally)
-- Soft deletes: deletedAt nullable column (never hard-delete tenants or users)
```

**What it enables:** Tenant creation (seed script), user invite flow, JWT issuance.

**Seed data after migration:**
- 1 default tenant (`agentguard-internal`) for dog-fooding
- 1 owner user (initial admin)

---

### Migration 2: Agents and Sessions

**New tables:** `Agent`, `AgentSession`

**New enums:** `AgentStatus`, `RiskTier`, `FailBehavior`, `AgentFramework`, `SessionStatus`

```sql
-- Key constraints:
-- Agent: UNIQUE(tenantId, id) for RLS composite
-- Agent: UNIQUE(apiKeyHash) — lookup on auth
-- Agent: INDEX(tenantId, status) — dashboard fleet view
-- AgentSession: INDEX(tenantId, agentId, startedAt DESC) — session history
```

**What it enables:** Agent registration, API key issuance, session tracking.

---

### Migration 3: Policies and Versions

**New tables:** `Policy`, `PolicyVersion`

```sql
-- Key constraints:
-- PolicyVersion: UNIQUE(policyId, version) — semver uniqueness
-- PolicyVersion: yamlContent TEXT — raw YAML stored as-is
-- PolicyVersion: compiledBundle JSONB — pre-compiled bundle served to SDK
-- PolicyVersion: bundleChecksum TEXT — SHA-256 for integrity verification
```

**What it enables:** Policy upload, compilation, versioning, activation, bundle distribution.

---

### Migration 4: Audit Events (Most Critical)

**New tables:** `AuditEvent`

**Special SQL (not expressible in Prisma schema — add as raw SQL in migration):**

```sql
-- 1. Append-only enforcement trigger
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: modifications not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- 2. PostgreSQL Row-Level Security on all tenant tables
ALTER TABLE "Tenant"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Agent"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AuditEvent"
  USING (tenant_id = current_setting('app.current_tenant_id')::text);
-- (Repeat for all tenant-scoped tables)

-- 3. Partial indexes for common queries
CREATE INDEX idx_agents_active ON "Agent" (tenant_id, id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_hitl_pending ON "HITLGate" (tenant_id, created_at)
  WHERE status = 'PENDING';
CREATE INDEX idx_policies_active ON "Policy" (tenant_id, id)
  WHERE deleted_at IS NULL;
```

**Key AuditEvent fields:**
- `previousHash TEXT` — hash of previous event in session chain (or `GENESIS_HASH` for first)
- `eventHash TEXT` — SHA-256(`previousHash` + canonical JSON of this event)
- `actionParams JSONB` — sanitised (PII redacted before SDK sends)
- `planningTraceSummary TEXT` — truncated chain-of-thought (max 1KB)

**What it enables:** Tamper-evident audit log; session replay; chain verification endpoint.

---

### Migration 5: Anomaly Scores, Kill Switch, HITL Gates

**New tables:** `AnomalyScore`, `KillSwitchCommand`, `HITLGate`

**New enums:** `ScoringMethod`, `KillSwitchTier`, `HITLStatus`

```sql
-- Key constraints:
-- AnomalyScore: UNIQUE(auditEventId) — 1:1 with AuditEvent
-- KillSwitchCommand: INDEX(tenantId, agentId, issuedAt DESC)
-- HITLGate: UNIQUE(auditEventId) — one gate per event
-- HITLGate: INDEX(tenantId, status, createdAt ASC) — pending queue ordering
```

**Also adds:** `SIEMIntegration`, `AlertWebhook` tables (straightforward, no special triggers).

**What it enables:** Kill switch audit trail; HITL gate lifecycle; anomaly scoring; SIEM configuration.

---

## 6. End-to-End Demo Script

**Audience:** Investor demo — 15 minutes. Shows the full lifecycle.

**Prerequisites:**
- Deployed Azure instance running
- Demo tenant created with a fresh API key
- LangChain demo agent ready (Python script)
- Dashboard open in browser on secondary screen
- Slack workspace configured for HITL notifications

---

**Step 1 — Create tenant + API key (1 min)**

*Open dashboard. Show login screen.*
```
POST /auth/login  { email: "demo@agentguard.io", password: "..." }
→ JWT issued
```

*Navigate to Agents → "Register New Agent".*
```
POST /agents  { name: "Invoice Processing Agent", riskTier: "high", framework: "langchain" }
→ { apiKey: "ag_live_a8f3b2...", apiKeyPrefix: "ag_live_a8f3" }
```

*"This API key is shown once. The agent will use this to authenticate all calls."*

---

**Step 2 — Register the agent (30 sec)**

*Show the agent key in the dashboard — prefix only visible. Status: ACTIVE.*

*"The agent is registered. No policy assigned yet — defaults to fail-closed: all actions blocked."*

---

**Step 3 — Upload a policy (2 min)**

*Navigate to Policies → "New Policy". Open the YAML editor.*

*Paste a simplified version of `src/examples/policies/finance-agent.yaml`:*
```yaml
id: "pol_invoice_demo"
name: "Invoice Agent — Demo Policy"
version: "1.0.0"
default: block
rules:
  - id: "allow_lookups"
    priority: 10
    action: allow
    when:
      - tool: { in: ["get_invoice", "list_invoices", "get_customer"] }

  - id: "hitl_payment"
    priority: 20
    action: require_approval
    approvers: ["role:operator"]
    timeoutSec: 300
    on_timeout: block
    when:
      - tool: { in: ["approve_payment", "create_payment"] }
      - params:
          amount_cents: { gt: 10000 }

  - id: "block_large_payments"
    priority: 15
    action: block
    when:
      - tool: { in: ["approve_payment", "create_payment"] }
      - params:
          amount_cents: { gt: 1000000 }
    severity: critical
```

*Click "Validate" → API compiles and returns `{ warnings: [], ruleCount: 3 }`. Click "Activate".*

*"Policy is now live. The SDK will pick up the new bundle within 60 seconds."*

---

**Step 4 — Run LangChain agent with AgentGuard SDK (2 min)**

*Show the Python script:*
```python
from agentguard import AgentGuard
from langchain.agents import create_react_agent, AgentExecutor
from langchain_openai import ChatOpenAI

ag = AgentGuard(api_key="ag_live_a8f3b2...")  # same key from Step 1

llm = ChatOpenAI(model="gpt-4o")
tools = [get_invoice, list_invoices, get_customer, approve_payment]

executor = AgentExecutor(
    agent=create_react_agent(llm, tools),
    tools=tools,
    callbacks=[ag.langchain_handler()],  # ← One line added
)

executor.invoke({"input": "Look up invoice #4521 and approve payment if under $100"})
```

*Run the script. Switch to dashboard.*

---

**Step 5 — Dashboard shows actions in real-time (1 min)**

*The Events page is open. Watch events appear as the agent runs:*
- `get_invoice` → `ALLOW` (green) — matched `allow_lookups`
- `list_invoices` → `ALLOW` (green)
- `approve_payment (amount_cents: 8500)` → `HITL_PENDING` (yellow)

*"The agent is trying to approve an $85 payment. Our policy says anything over $100 requires human approval. The agent is now paused, waiting."*

---

**Step 6 — Agent tries a blocked action (30 sec)**

*Modify the script to try a large payment first:*
```python
executor.invoke({"input": "Approve payment of $15,000 for invoice #4521"})
```

*Watch the dashboard:*
- `approve_payment (amount_cents: 1500000)` → `BLOCK` (red) — matched `block_large_payments`

*"$15,000 is above our $10,000 threshold. Blocked immediately. The agent received a `PolicyViolationError`. Zero chance of that payment going through."*

---

**Step 7 — HITL approval (2 min)**

*Go back to the $85 payment scenario. Navigate to HITL queue.*

*Show the pending gate card:*
```
Agent: Invoice Processing Agent
Tool: approve_payment
Parameters: { invoice_id: "4521", amount_cents: 8500, vendor: "Acme Corp" }
Matched rule: hitl_payment
Timeout: 4:32 remaining
```

*Check Slack — notification already arrived with the same details and "Approve / Reject" buttons.*

*Click "Approve" in dashboard. Add note: "Verified with accounting."*

*Switch back to terminal — the agent script continues execution.*

```
✓ Payment approved by human operator
Tool result: { payment_id: "pay_abc123", status: "processed" }
```

*"The agent was unblocked in real time. The full decision trail — who approved, when, and why — is now in the audit log."*

---

**Step 8 — Kill switch (1 min)**

*Run a new agent script that's doing something suspicious (rapid repeated calls).*

*Navigate to Agent detail page. Click the red "Kill Switch" button.*
```
⚠ Kill Agent?
[ Soft kill — finish current action ]   [ Hard kill — stop immediately ]
```

*Click "Hard kill". Within 10 seconds, the terminal shows:*
```
AgentGuardError: Agent ag_... is in kill switch state (tier: hard)
```

*"Dead stop. The agent received the kill command on its next action. For a hard kill, that propagates in under 15 seconds."*

---

**Step 9 — Show audit trail + hash chain verification (2 min)**

*Navigate to Audit → select the session from this demo.*

*Show the full event chain in chronological order: `AGENT_START` → `ALLOW` → `ALLOW` → `HITL_PENDING` → `HITL_APPROVED` → `KILL_SWITCH`.*

*Click "Verify Chain".*

```
✅ Chain Valid
47 events | SHA-256 hash chain intact | Verified at 2026-03-01T12:47:00Z
```

*"Every single action is linked cryptographically. If anyone — including us — deletes or modifies a record, the chain breaks and the verification fails. This is what compliance teams need."*

*Simulate a tamper (pre-staged DB update with superuser). Click "Verify Chain" again:*
```
❌ Chain Broken
First broken at: event 23 of 47
Expected hash: a3f2c1...  Actual: b4d9e2...
```

*"Tamper detected. You know exactly which record was touched and when."*

---

## 7. What We Can Build with AI Agents

Since AgentGuard is a platform for governing AI agents, it's fitting to use AI sub-agents to build parts of it. Here's a practical split between what sub-agents can safely handle vs what needs human engineering judgment.

### Sub-agents CAN Build (Low Judgment, High Repeatability)

| Component | What to hand to a sub-agent | Prompt pattern |
|---|---|---|
| **Prisma schema** | Generate full `schema.prisma` from `DATA_MODEL.md §2`; create migration files | "Read DATA_MODEL.md §2. Generate a complete Prisma schema matching every model. Add composite unique constraints and indexes from §7. Output as a single schema.prisma file." |
| **Zod schemas** | Generate all schemas in `src/schemas/` from DATA_MODEL.md §4 | "Read DATA_MODEL.md §4. For each Zod schema defined there, output the TypeScript file. Use z.infer<> for types. No separate type definitions." |
| **API route scaffolding** | Generate Hono route handlers (CRUD + auth) from endpoint spec | "Here is the API spec. Generate Hono route handlers for all agent endpoints. Use the ServiceContext pattern from base.service.ts. Validate with Zod. Return correct HTTP codes." |
| **Test generation** | Generate Vitest unit tests for policy engine from POLICY_ENGINE.md §3 examples | "Read the 11 example policies. For each policy and rule, generate a Vitest test case that exercises the evaluation algorithm. Include adversarial cases." |
| **Python evaluator** | Translate TypeScript evaluator to Python | "Here is src/core/policy-engine.ts. Translate the evaluation logic to Python. Match every function exactly. Output agentguard/policy/evaluator.py." |
| **Docs generation** | Generate API reference from Zod schemas | "Read all schemas in src/schemas/. Generate OpenAPI 3.0 YAML. For each endpoint in the API spec, add the Zod-derived request/response schemas." |
| **Seed data** | Generate Prisma seed script for demo tenant | "Generate a Prisma seed script that creates: 1 tenant, 1 user (owner), 3 agents, 1 policy (from the support-agent.yaml example), 50 sample audit events with valid hash chains." |
| **React page scaffolding** | Generate Next.js page skeletons with shadcn/ui | "Here is the Agent Fleet page spec. Generate a Next.js 14 App Router page using shadcn/ui Table. Fetch from GET /agents. Add status badge colors matching AgentStatus enum." |
| **Policy templates** | Generate the 10 policy templates from POLICY_ENGINE.md §3 | "Read the policy examples in POLICY_ENGINE.md §3. For each, output a standalone .yaml file with 5 test cases. Ensure they all compile against the PolicyDocumentSchema." |

### Humans MUST Do (High Judgment, Security-Critical)

| Component | Why human engineering is required |
|---|---|
| **Security architecture decisions** | Hash chain design, RLS policy SQL, API key bcrypt settings — these are irreversible choices with compliance implications. A sub-agent generating "secure" patterns may not account for all attack vectors. |
| **Cross-tenant isolation testing** | The integration test that verifies Tenant A's JWT cannot access Tenant B's data needs a human to reason about the test completeness. This is a security gate; a sub-agent generating the test might not cover all manipulation vectors. |
| **Kill switch propagation** | The 10s poll → 15s propagation tradeoff is an architectural decision with SLA implications. A sub-agent should not make this call. |
| **Hash chain verification algorithm** | The `computeEventHash` function must be deterministic, canonical, and collision-resistant. The choice of key sort order and separator (`|`) is a protocol decision — not a code generation task. |
| **Performance tuning** | The < 50ms p99 SLA requires profiling under realistic load. A sub-agent cannot reason about process contention, GC pauses, or network latency variance. |
| **HITL timeout logic** | The choice of BullMQ delayed jobs (vs. polling vs. Redis TTL expiry) has failure mode implications. Human engineering judgment required. |
| **Auth middleware correctness** | The ServiceContext injection pattern (never trust tenantId from body) is a security invariant. Human review required for auth code; sub-agent may produce functional-but-insecure code. |
| **Incident response design** | What happens when the control plane is unreachable? The fail-closed default and disk buffer design are human-level decisions. |

### Practical Sub-agent Workflow for Week 1

```
Main agent (TPM):
  1. Read all design docs → produce BUILD_PLAN.md (this document) ← done
  2. Spawn: "Schema agent" → generate Prisma schema from DATA_MODEL.md
  3. Spawn: "Zod agent" → generate all schemas from DATA_MODEL.md §4
  4. Spawn: "Test fixture agent" → generate 200 policy test cases from POLICY_ENGINE.md §3

Human engineer:
  5. Review all generated code (30 min review each)
  6. Merge accepted files; reject/edit anything security-adjacent
  7. Write auth middleware manually (never delegate)
  8. Write hash-chain module manually (never delegate)

Spawn for Week 2:
  9. "API scaffold agent" → generate Hono route handlers from Week 3-4 spec
  10. "Python translator agent" → translate TypeScript evaluator to Python
```

---

## 8. Risk Register

### Risk 1 — Policy Evaluator Divergence (TypeScript vs Python)

**Probability:** Medium. **Impact:** Critical.

**Description:** The Python SDK evaluates policies in-process; the TypeScript control plane evaluates for the `/policies/:id/test` endpoint and HITL context. If these two evaluators produce different decisions for the same bundle + request, the test results in the dashboard will not reflect actual runtime behaviour. This is a hidden correctness bug that could cause false confidence ("our policy blocks that" → it doesn't).

**Root cause:** Two implementations of the same algorithm in two languages, maintained independently.

**Mitigation:**
1. Cross-language test fixture in CI: 200 hand-crafted `{bundle, request} → expected_decision` cases. Both evaluators must produce identical output. CI fails if they diverge.
2. The TypeScript evaluator is the reference implementation (`src/core/policy-engine.ts`). The Python evaluator is derived from it; every function maps 1:1.
3. Any change to the evaluation algorithm requires updating both evaluators simultaneously and re-running the cross-language fixture.
4. Add a `durationMs` assertion: if Python evaluator p95 exceeds 10ms, CI fails. This prevents "slow but correct" drift.

**Detection:** Cross-language CI fixture; production SDK version mismatch alerts (send SDK version in every telemetry batch).

---

### Risk 2 — Hash Chain Race Condition

**Probability:** Medium. **Impact:** High.

**Description:** The hash chain requires each `AuditEvent` to reference the `eventHash` of its predecessor in the session. If two SDK telemetry batches arrive concurrently for the same `sessionId`, they may both read the same `previousHash` and produce two events with the same chain link — creating a fork or duplicate hash. The chain verification then reports a broken chain for a session that was never tampered with.

**Root cause:** The hash chain is a sequential structure written by a concurrent system.

**Mitigation:**
1. Serialise writes per `sessionId`: use a PostgreSQL advisory lock (`SELECT pg_advisory_xact_lock(hashtext(sessionId))`) at the start of each `ingestBatch()` transaction. This ensures only one batch for a given session writes at a time.
2. Accept the latency cost: advisory locks add ~2–5ms per batch for hot sessions. For Phase 1 volumes, this is acceptable.
3. Integration test: fire 10 concurrent batch requests for the same sessionId; verify chain is valid and no events are lost.
4. Monitor: alert on `verify-chain` failures in production. Any failure in production is either a bug in the serialisation or a genuine tamper — both warrant immediate investigation.

**Detection:** Integration test in CI (concurrent writes → chain verification); production alert on `chainValid: false`.

---

### Risk 3 — Kill Switch Propagation Delay

**Probability:** Low. **Impact:** High.

**Description:** The Python SDK polls `GET /sdk/kill-switch` every 10 seconds and caches the result for 5 seconds. In the worst case, an agent can execute for up to 15 seconds after a kill switch is issued before it sees the halt command. In a high-risk scenario (runaway finance agent making payments), 15 seconds may be too long.

**Root cause:** The 10s poll interval + 5s local cache = 15s maximum propagation time. A true push architecture (WebSocket or SSE from server to SDK) would reduce this to <1s but adds complexity.

**Mitigation:**
1. Document the 15s propagation SLA clearly. This is the Phase 1 design decision from `ARCHITECTURE.md §4.4`.
2. Rate-limit kill switch checks at the API: max 6 per minute per agent (to prevent thundering herd if many agents check simultaneously on the same Redis key).
3. For Phase 1 design partners: make the poll interval configurable (`AGENTGUARD_KILL_POLL_INTERVAL_SEC`, default 10). High-risk agents can poll every 3 seconds at the cost of more API calls.
4. Implement **optimistic kill**: the SDK checks kill status at the START of `on_tool_start` (before policy eval). Even with a 15s delay, the kill is guaranteed before the next tool call starts. For BLOCK-tier tools, this is sufficient.
5. Phase 2: replace long-poll with WebSocket/SSE push from control plane to SDK. Reduces propagation to <1s.

**Detection:** CI integration test: measure time from `POST /agents/:id/kill` to first `KILLED` decision in SDK (must be < 20s); alert if production p99 exceeds 15s.

---

### Risk 4 — PostgreSQL Performance at Audit Event Volume

**Probability:** Medium (Month 3+). **Impact:** Medium.

**Description:** `AuditEvent` is append-only and will grow very large very quickly. A moderately active agent doing 60 tool calls/minute generates 86,400 events/day. With 10 design partners each running 5 agents, that's 4.3M events/day at peak. PostgreSQL can handle this for Phase 1 volumes, but dashboard queries (time-range scans, risk tier filters) will start slowing down as the table grows past ~50M rows.

**Root cause:** OLTP database (PostgreSQL) used for OLAP workloads (dashboard analytics). The indexes help, but table scans are unavoidable for some query shapes.

**Mitigation:**
1. Phase 1 indexes are already designed for the most common query patterns (see `DATA_MODEL.md §7.1`). These cover: agent event history, session replay, time-range queries, violation queries.
2. **Table partitioning**: partition `AuditEvent` by `(tenantId, occurredAt)` monthly. This limits scan range for time-bounded queries. Add this in Migration 4 before the table grows.
3. **TTL / archival**: after 90 days, move `AuditEvent` rows to Azure Blob Storage (JSONL format). Compliance-required retention without DB bloat. Build the archival BullMQ worker in Week 11-12.
4. **Monitor slow queries**: `log_min_duration_statement = 1000ms` in PostgreSQL config. Alert on slow queries > 2s.
5. **Phase 2 trigger**: if `AuditEvent` rows/day exceeds 5M per tenant, migrate hot telemetry to ClickHouse. The schema is designed to be ClickHouse-compatible (`DATA_MODEL.md §9`).

**Detection:** Dashboard query latency in Application Insights; slow query log; weekly row count report.

---

### Risk 5 — Python SDK Threading Safety

**Probability:** Medium. **Impact:** Medium.

**Description:** The Python SDK uses daemon threads for telemetry emission, kill switch polling, and bundle refresh. Python's GIL means these threads share the interpreter. If any daemon thread blocks (e.g., network timeout on telemetry push), it could delay the other threads. In the worst case, the kill switch watcher thread blocks behind a slow telemetry flush, delaying kill switch propagation.

**Root cause:** Python threading + GIL + shared network I/O in daemon threads.

**Mitigation:**
1. Use independent `httpx` clients for each daemon thread (telemetry emitter, kill switch watcher, bundle loader). No shared HTTP connection state.
2. Set aggressive timeouts on all HTTP calls: telemetry push → 5s timeout; kill switch poll → 12s timeout (server holds for 10s); bundle fetch → 8s timeout.
3. Kill switch watcher thread has the highest priority: use `threading.Thread(daemon=True)` with a dedicated event loop. Never share its connection with the telemetry thread.
4. Integration test: simulate slow API (artificial 8s delay on telemetry endpoint) → verify kill switch watcher still checks within 15s.
5. Document: recommend `asyncio`-based agents set `AGENTGUARD_THREAD_MODEL=process` to use `multiprocessing` for daemon tasks instead of threads (Phase 2 enhancement).

**Detection:** SDK integration tests with network fault injection (simulated timeouts); production SDK telemetry includes thread health metrics (`last_kill_check_ms`, `last_bundle_refresh_ms`).

---

## Appendix: Quick Reference for Week 1 Engineers

### Repository Structure (Target)

```
agentguard/
├── packages/
│   ├── api/                    # Hono control plane (Node.js 22, TypeScript)
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── server.ts
│   │       ├── middleware/
│   │       ├── services/
│   │       ├── routes/
│   │       ├── schemas/
│   │       ├── db/
│   │       └── workers/
│   ├── sdk-python/             # Python SDK (pip install agentguard)
│   │   └── agentguard/
│   ├── sdk-ts/                 # TypeScript SDK (npm install @agentguard/sdk)
│   │   └── src/
│   └── shared/                 # Shared types + Zod schemas
│       └── src/
│           └── schemas/        # Port from src/core/types.ts
├── apps/
│   └── dashboard/              # Next.js 14 App Router
│       └── app/
├── src/                        # EXISTING PROTOTYPE — reference only
│   └── core/                   # policy-engine.ts, audit-logger.ts, etc.
├── .github/workflows/
│   ├── ci.yml                  # PR: lint + test + build
│   └── deploy.yml              # main: push to ACR → deploy to Container Apps
├── infra/                      # Bicep / Terraform for Azure
│   ├── container-apps.bicep
│   ├── postgres.bicep
│   └── redis.bicep
├── docker-compose.yml          # Local dev: PostgreSQL + Redis + pgAdmin
└── turbo.json                  # Turborepo pipeline config
```

### Day 1 Checklist for First Engineer

- [ ] Clone repo, run `docker compose up -d`, confirm PostgreSQL + Redis healthy
- [ ] Run `npm install && npm run build` — must succeed clean
- [ ] Run `npm test` — existing tests from `src/core/__tests__/policy-engine.test.ts` must pass
- [ ] Read `src/core/policy-engine.ts` — this is your core algorithm, understand it
- [ ] Read `src/core/types.ts` — these Zod schemas move to `packages/shared/src/schemas/`
- [ ] Create `packages/api/prisma/schema.prisma` from `DATA_MODEL.md §2` (or spawn a sub-agent)
- [ ] Run `prisma migrate dev --name init` against local PostgreSQL — must succeed clean
- [ ] Create `src/server.ts` Hono scaffold with `GET /health` endpoint
- [ ] Push to `main` — CI pipeline must pass

### Environment Variables (Week 1)

```bash
# packages/api/.env.local (never commit)
DATABASE_URL="postgresql://agentguard:password@localhost:5432/agentguard_dev"
DATABASE_DIRECT_URL="postgresql://agentguard:password@localhost:5432/agentguard_dev"
REDIS_URL="redis://localhost:6379"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
NODE_ENV="development"
PORT="3001"
SERVICE_NAME="agentguard-api"
```

### Key Files to PORT from Prototype (not rewrite)

| Prototype File | Target Location | Port Notes |
|---|---|---|
| `src/core/policy-engine.ts` (PolicyCompiler) | `packages/api/src/services/policy/policy.compiler.ts` | Adapt to use Prisma types for PolicyDocument; keep algorithm identical |
| `src/core/policy-engine.ts` (condition evaluators) | `packages/api/src/services/policy/policy.evaluator.ts` | Keep as pure functions; no changes needed |
| `src/core/types.ts` | `packages/shared/src/schemas/policy.schema.ts` | Direct copy; these Zod schemas are the production schemas |
| `src/core/errors.ts` | `packages/api/src/errors/service-error.ts` | Extend with HTTP status codes; add `NotFoundError`, `ValidationError` |
| `src/examples/policies/*.yaml` | `packages/api/prisma/seed/policies/` | Use as seed data + test fixtures |
| `src/core/__tests__/policy-engine.test.ts` | `packages/api/src/__tests__/policy-engine.test.ts` | Extend; don't discard existing passing tests |

---

*Document version: 1.0 — March 2026*
*Author: Technical Program Manager (AgentGuard Build Plan sub-agent)*
*Based on: VISION_AND_SCOPE.md, ARCHITECTURE.md v2.0, POLICY_ENGINE.md v1.0, DATA_MODEL.md v1.0, ROADMAP.md v2.0*
*Classification: Confidential — Internal Engineering*
*Next review: End of Week 2 (confirm Azure infrastructure matches plan)*
