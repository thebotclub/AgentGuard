# AgentGuard — Development Roadmap v2.0
## Revised: February 2026 | Confidential

> **Revision note:** This v2.0 roadmap supersedes v1.0. The prior roadmap was written without reference to the system architecture. This version is fully traced to ARCHITECTURE.md v2.0, POLICY_ENGINE.md v1.0, DATA_MODEL.md v1.0, and VISION_AND_SCOPE.md v1.0. Every sprint deliverable references a specific module, schema, or API decision. If something isn't in those documents, it isn't in this roadmap.

> **North Star:** Ship a runtime security platform that engineers love to integrate, enterprises trust to govern, and regulators accept as evidence. Every decision serves those three masters simultaneously.

---

## Table of Contents

1. [Phase 1 Overview & Critical Path](#phase-1-overview--critical-path)
2. [Sprint 1 — Project Scaffolding & Infrastructure](#sprint-1-weeks-12-project-scaffolding--infrastructure)
3. [Sprint 2 — Control Plane Core & Data Model](#sprint-2-weeks-34-control-plane-core--data-model)
4. [Sprint 3 — Policy Engine: Compiler & Evaluator](#sprint-3-weeks-56-policy-engine-compiler--evaluator)
5. [Sprint 4 — Python SDK & LangChain Integration](#sprint-4-weeks-78-python-sdk--langchain-integration)
6. [Sprint 5 — Audit Service, Hash Chain & Kill Switch](#sprint-5-weeks-910-audit-service-hash-chain--kill-switch)
7. [Sprint 6 — Dashboard, HITL, SIEM & Design Partner Readiness](#sprint-6-weeks-1112-dashboard-hitl-siem--design-partner-readiness)
8. [Phase 2 Direction (Months 7–12)](#phase-2-direction-months-712)
9. [Phase 3 Direction (Months 13–24)](#phase-3-direction-months-1324)
10. [Technical Decisions Log](#technical-decisions-log)
11. [Team Structure](#team-structure)
12. [Definition of Done](#definition-of-done)

---

## Phase 1 Overview & Critical Path

**Phase Goal:** Deliver a product that a developer can integrate in 30 minutes, that a platform engineer trusts in production, and that a CISO can point to in a security review. Land 5 design partners actively using AgentGuard in staging or production by end of Month 6. (Source: VISION_AND_SCOPE.md §5 Phase 1 Success Criteria)

### Architecture Commitments Driving This Roadmap

All sprint deliverables are direct implementations of decisions made in ARCHITECTURE.md v2.0:

| Architectural Decision | Impact on Roadmap |
|---|---|
| **TypeScript monolith** (not microservices) — all services in one deployable | Sprint 2 builds the full service layer together; no service-extraction work needed in Phase 1 |
| **Prisma ORM + PostgreSQL** (not raw SQL, not Drizzle, not MongoDB) | Every data story references a Prisma schema model; migrations are Prisma migrations |
| **Zod validation** as the single source of schema truth | Every API story requires a Zod schema defined in `src/schemas/`; TypeScript types are derived via `z.infer<>` |
| **In-process Python SDK** (not sidecar, not proxy) | SDK sprint ships a Python package that runs inside the agent's process; no infrastructure to stand up |
| **Hono** web framework (not Express, not Fastify) | API routes are Hono handlers; middleware composability is the pattern |
| **Redis for real-time state only** (kill switch, HITL, rate limits, policy cache) | PostgreSQL is the system of record; Redis is never the primary store |
| **BullMQ** for background jobs (SIEM push, telemetry ingest) | Async fan-out goes through BullMQ queues, not raw Redis pub/sub |
| **AWS ECS Fargate** for Phase 1 compute (not EKS) | Simpler ops for the phase; Kubernetes deferred |
| **Hybrid evaluation**: in-process bundle + async telemetry | This is how the 50ms p99 SLA is achieved; any story that adds synchronous I/O to the hot path is a regression |

### What Is OUT of Phase 1

The following items appear in the old roadmap or business case but are **explicitly deferred** per VISION_AND_SCOPE.md §5:

| Item | Deferred To | Reason |
|---|---|---|
| Multi-agent governance (cross-agent correlation, collusion detection) | Phase 2 | Requires `parentAgentId` + `orchestrationId` on AuditEvent; infrastructure not needed for single-agent MVP |
| ML anomaly detection (Isolation Forest, ONNX inference) | Phase 2 | Requires 30+ days of production data to train; Phase 1 is rule-based only |
| Compliance reporting modules (EU AI Act, HIPAA, DORA reports) | Phase 2 | Phase 1 audit log is the prerequisite; report templates built on top in Phase 2 |
| CrewAI, AutoGen, LlamaIndex integrations | Phase 2 | Phase 1 covers the two highest-adoption frameworks (LangChain + OpenAI SDK) |
| mTLS agent identity / JWT-based identity | Phase 2 | API key sufficient for design partner phase; cryptographic identity deferred |
| On-premises / VPC deployment (Helm chart) | Phase 2–3 | SaaS must be stable first |
| NATS JetStream event bus | Phase 2 | Redis + BullMQ covers Phase 1 real-time needs; NATS replaces long-polling at scale |
| Supply chain security (SBOM, model version pinning) | Phase 3 | Critical long-term, not a blocker for initial enterprise adoption |
| ClickHouse for telemetry at scale | Phase 2 | PostgreSQL sufficient for <500K events/day per tenant in Phase 1 |
| TypeScript/Node.js SDK | Phase 2 | Python is the agent developer ecosystem; TS SDK follows once Python SDK is validated |
| NATS JetStream, gRPC data plane | Phase 2 | REST + long-polling is sufficient; gRPC replaces REST SDK path at scale |
| Red team as a service | Phase 3 | Needs product maturity before service delivery |

### Phase 1 Critical Path

```
Sprint 1 (infra/scaffold)
    │
    ▼
Sprint 2 (control plane: BaseService + ServiceContext + Prisma schema)
    │  ← BLOCKER for all subsequent sprints
    ▼
Sprint 3 (policy compiler + evaluator)     Sprint 4 (Python SDK)
    │  ← BLOCKER for Sprint 4 bundle fetch     ← depends on Sprint 2 API server running
    └─────────────────┬────────────────────────┘
                      ▼
Sprint 5 (audit service + hash chain + kill switch)
    │  ← both Sprint 3 (policy decisions) and Sprint 4 (SDK telemetry) must exist
    ▼
Sprint 6 (dashboard + HITL + SIEM + OpenAI SDK + design partner launch)
    ← all prior sprints required; this is the integration sprint
```

**Longest pole:** Sprint 2 → Sprint 3 (policy engine correctness) → Sprint 5 (audit integrity). Policy engine must be bulletproof before SDK ships because the SDK caches a compiled `PolicyBundle` — errors in the compiler affect every downstream agent.

### Phase 1 Success Criteria (from VISION_AND_SCOPE.md §5)

All three must be met by end of Month 6:

| Criterion | Target | Measurement |
|---|---|---|
| **Design Partners** | 5 organisations actively using AgentGuard in staging or production | Signed agreements; bi-weekly check-ins; telemetry confirming active usage |
| **GitHub Stars** | 1,000 stars on OSS policy engine repository | GitHub API |
| **p99 Latency SLA** | < 50ms overhead per agent action (policy eval + logging) | CI load test against reference workloads (1K, 10K, 100K actions/hour); documented in SLA |

---

## Sprint 1 (Weeks 1–2): Project Scaffolding & Infrastructure

**Sprint Goal:** Any engineer on the team can clone the repo, run one command, and have a fully working local dev environment. The project structure, CI/CD pipeline, and development toolchain are established so that all future work has a clean, consistent home.

**Dependency:** None — this is the foundation for everything.

---

### Epic 1.1 — Repository & Toolchain

| Story | Description | Acceptance Criteria |
|---|---|---|
| 1.1.1 | Bootstrap project with TypeScript 5.x strict mode, ESM modules, and Node.js 22 LTS | `npm install && npm run build` succeeds clean; `tsc --noEmit` passes with zero errors; ESM imports work throughout |
| 1.1.2 | Configure `src/` directory structure matching ARCHITECTURE.md §3.1 file layout | `src/server.ts`, `src/services/`, `src/routes/`, `src/schemas/`, `src/middleware/`, `src/db/`, `src/workers/` all exist with placeholder modules |
| 1.1.3 | Set up ESLint (named exports enforced, no default exports, `import type` for type-only imports per ARCHITECTURE.md §6.5) + Prettier with pre-commit hooks | `npm run lint` passes; commit blocked if lint fails; named export rule catches violations |
| 1.1.4 | Configure Vitest 2.x as test runner (ESM-native, TypeScript-native per ARCHITECTURE.md §6.1) | `npm test` runs all unit tests; coverage report generated; watch mode works |
| 1.1.5 | Configure Python project structure under `sdk/python/` for `agentguard` PyPI package (matching ARCHITECTURE.md §4.1 SDK layout) | `sdk/python/agentguard/` with `__init__.py`, `sdk.py`, `policy/`, `integrations/`, `telemetry/`, `kill_switch/`, `hitl/`, `errors.py`, `models.py` all stubbed |

---

### Epic 1.2 — CI/CD Pipeline

| Story | Description | Acceptance Criteria |
|---|---|---|
| 1.2.1 | GitHub Actions: PR checks (lint, test, build, `tsc --noEmit`, Python pytest) | All checks required to pass before merge; total CI time < 8 min |
| 1.2.2 | GitHub Actions: Docker image build + push to ECR on merge to `main` | Image tagged with git SHA; pushed to AWS ECR; used by ECS deployment |
| 1.2.3 | GitHub Actions: PyPI publish on release tag (`v*`) for `agentguard` Python package | `git tag v0.1.0` triggers PyPI publish via Trusted Publisher (no API key in secrets) |
| 1.2.4 | Docker Compose dev environment: PostgreSQL 16, Redis 7, LocalStack (S3) | `docker compose up -d` starts all dependencies; health checks pass; `npm run dev` connects cleanly |
| 1.2.5 | Latency benchmark CI artifact: policy evaluation p50/p95/p99 tracked per commit | Benchmark results stored as CI artifact; regression (p99 > 15ms component budget per ARCHITECTURE.md §4.4) fails CI |

---

### Epic 1.3 — Infrastructure as Code

| Story | Description | Acceptance Criteria |
|---|---|---|
| 1.3.1 | AWS ECS Fargate task definitions for API service, dashboard, and background workers (per ARCHITECTURE.md §9.1) | Task definitions created via Terraform or CloudFormation; deployable to staging environment |
| 1.3.2 | RDS PostgreSQL 16 Multi-AZ with PgBouncer connection pooling (per ARCHITECTURE.md §9.1 and DATA_MODEL.md §1.3) | Database provisioned; `DATABASE_URL` and `DATABASE_DIRECT_URL` (for Prisma Migrate) configured in AWS Secrets Manager |
| 1.3.3 | ElastiCache Redis 7 Sentinel mode, 3-node cluster (per ARCHITECTURE.md §6.4) | Redis cluster provisioned; `REDIS_URL` in Secrets Manager; ioredis client connects cleanly |
| 1.3.4 | AWS Secrets Manager for all credentials; no plaintext secrets in environment variables or code | `npm run dev` loads all credentials from Secrets Manager or `.env.local` (never committed); `git secrets` scan clean |
| 1.3.5 | OpenTelemetry → Datadog instrumentation wired (per ARCHITECTURE.md §6.4) | Traces, metrics, and logs flowing to Datadog staging environment; `traceId` on every log line |

**Sprint 1 Definition of Done:**
- Project builds clean from scratch on a fresh machine
- CI pipeline green on first commit to `main`
- All team members have working local dev environment (`docker compose up -d && npm run dev`)
- Python SDK skeleton installs cleanly (`pip install -e sdk/python/`)
- AWS staging environment accessible

---

## Sprint 2 (Weeks 3–4): Control Plane Core & Data Model

**Sprint Goal:** Establish the Prisma data model, the `BaseService` + `ServiceContext` pattern, and the core API server. By end of this sprint, the control plane can register agents, manage tenants and users, and authenticate API requests. Every other service sprint depends on this foundation.

**Dependency:** Sprint 1 complete (infrastructure running; project builds clean).

---

### Epic 2.1 — Prisma Schema & Migrations

The full schema is defined in DATA_MODEL.md §2. This sprint implements it exactly.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 2.1.1 | Implement full Prisma schema (`prisma/schema.prisma`) covering all Phase 1 models: `Tenant`, `User`, `Agent`, `AgentSession`, `Policy`, `PolicyVersion`, `AuditEvent`, `AnomalyScore`, `KillSwitchCommand`, `HITLGate`, `SIEMIntegration`, `AlertWebhook` (DATA_MODEL.md §2) | `prisma migrate dev` runs clean; `prisma generate` produces typed client; all enums match DATA_MODEL.md |
| 2.1.2 | PostgreSQL Row-Level Security migration: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + tenant isolation policy for all tenant-scoped tables (DATA_MODEL.md §6.2) | RLS enabled on all 10 tenant-scoped tables; integration test: Tenant A's JWT cannot return Tenant B's data even with manipulated body |
| 2.1.3 | Append-only trigger for `AuditEvent` (DATA_MODEL.md §3.3): PostgreSQL trigger raising exception on `UPDATE` or `DELETE` | Trigger created via raw SQL in Prisma migration; test confirms any UPDATE/DELETE attempt raises `audit_events is append-only` |
| 2.1.4 | Partial indexes for common query patterns (DATA_MODEL.md §7.2): `idx_agents_active`, `idx_hitl_pending`, `idx_policies_active` | Raw SQL in migration; `EXPLAIN ANALYZE` confirms partial index used for soft-deleted-agent queries |
| 2.1.5 | Prisma client setup with PgBouncer adapter (`db/client.ts` matching ARCHITECTURE.md §5.3): connection pool max=20, slow query logging > 1000ms | Slow queries logged at WARN level; pool size configurable via env; `prisma.$on('query')` handler active |

---

### Epic 2.2 — BaseService + ServiceContext Pattern

The team standard pattern from ARCHITECTURE.md §3.2 and §3.3.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 2.2.1 | Implement `BaseService` abstract class (`src/services/base.service.ts`) with `ServiceContext`, `withTransaction()`, `assertRole()`, and `tenantScope()` (ARCHITECTURE.md §3.2) | Code matches ARCHITECTURE.md §3.2 exactly; Vitest unit tests confirm `assertRole` throws for unauthorized roles; transaction wraps correctly |
| 2.2.2 | Implement `ServiceError`, `PolicyError`, `NotFoundError`, `ValidationError` factory pattern (`src/errors/service-error.ts`) (ARCHITECTURE.md §3.3) | Error factory methods produce correct HTTP status codes; error handler middleware maps `ServiceError` to JSON `{ error: { code, message, details } }` |
| 2.2.3 | Implement Hono server entry point (`src/server.ts`) with auth middleware, tenant RLS middleware, and error handler middleware (ARCHITECTURE.md §3.1) | JWT → `ServiceContext` extraction in `auth.ts`; `tenantRLSMiddleware` sets `app.current_tenant_id` via `SET LOCAL`; error handler returns correct JSON shape |
| 2.2.4 | Implement all Zod schemas for Phase 1 API inputs in `src/schemas/` (ARCHITECTURE.md §8.3, DATA_MODEL.md §4): `CreateAgentSchema`, `UpdateAgentSchema`, `CreatePolicySchema`, `TestPolicySchema`, `QueryAuditEventsSchema`, `TelemetryBatchSchema`, `IssueKillSwitchSchema`, `HITLDecisionSchema`, SIEM and webhook schemas | All schemas pass Vitest unit tests; `z.infer<>` derives TypeScript types; no separate type definitions duplicating schema fields |
| 2.2.5 | Implement `AgentService` (`src/services/agent/agent.service.ts`) extending `BaseService`: `createAgent()`, `getAgent()`, `listAgents()`, `updateAgent()`, `deleteAgent()` (soft delete) with API key bcrypt hashing (DATA_MODEL.md §3.2, §6.3) | API key is bcrypt-hashed before storage; prefix stored for display; full key returned once on create and never stored; all queries include `tenantId: this.ctx.tenantId` |
| 2.2.6 | Wire Agent CRUD routes (`src/routes/agents.ts`) against `AgentService`: `GET /agents`, `POST /agents`, `GET /agents/:id`, `PATCH /agents/:id`, `DELETE /agents/:id` (ARCHITECTURE.md §8.2) | All endpoints return correct HTTP codes (200/201/204/400/403/404); Zod validation rejects invalid inputs with 400 + field-level detail; authentication required |

---

### Epic 2.3 — Tenant & Auth Foundation

| Story | Description | Acceptance Criteria |
|---|---|---|
| 2.3.1 | Implement JWT authentication middleware (`src/middleware/auth.ts`): RS256 validation, `ServiceContext` extraction, never trusting `tenantId` from request body (ARCHITECTURE.md §6.2, DATA_MODEL.md §6.1) | Requests without valid JWT → 401; `tenantId` extracted from token claim only; cross-tenant manipulation test: Tenant A's token + Tenant B's agentId → 404 (not 403, to avoid enumeration) |
| 2.3.2 | Tenant and User CRUD (minimal, for design partner onboarding): `POST /tenants` (admin only), `POST /tenants/:id/users`, `GET /tenants/:id` | Tenant creation restricted to `OWNER` role; user creation restricted to `OWNER`/`ADMIN`; `UserRole` enum enforced |
| 2.3.3 | Agent API key authentication for SDK endpoints (`/sdk/*`): lookup by bcrypt hash against `Agent.apiKeyHash`, inject `ServiceContext` with `role: 'AGENT'` (DATA_MODEL.md §3.2) | SDK endpoints reject invalid API keys with 401; valid key resolves correct tenant; `AGENT` role cannot call management endpoints |
| 2.3.4 | Integration test: cross-tenant isolation — Tenant A's JWT must not return Tenant B's agents, even with correct agent ID in path | Test creates two tenants, two agents; asserts 404 on cross-tenant access; verifies RLS is active at DB layer |

**Sprint 2 Definition of Done:**
- `prisma migrate dev` runs clean; all models exist in DB
- Agent CRUD endpoints pass all unit and integration tests
- BaseService pattern is established and documented; all subsequent services must extend it
- Cross-tenant isolation test passes — this is a security gate, not a nice-to-have
- RLS confirmed working at DB layer via direct `psql` query with different `app.current_tenant_id` values

---

## Sprint 3 (Weeks 5–6): Policy Engine — Compiler & Evaluator

**Sprint Goal:** Build the policy compiler and in-process evaluator. A developer should be able to write a YAML policy, upload it via API, and have it compiled into a `PolicyBundle` that the SDK can cache locally for sub-10ms evaluation. This is the highest-criticality component in the system.

**Dependency:** Sprint 2 complete (`PolicyService` foundation, Prisma schema for `Policy` and `PolicyVersion`).

---

### Epic 3.1 — Policy Service & Compiler

The compiler specification is in POLICY_ENGINE.md §2 (YAML DSL) and ARCHITECTURE.md §3.4.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 3.1.1 | Implement `PolicyService` (`src/services/policy/policy.service.ts`) extending `BaseService`: `createPolicy()`, `activatePolicy()`, `getPolicy()`, `listPolicies()`, `deletePolicy()` — YAML stored as `PolicyVersion.yamlContent`, compiled bundle stored as `PolicyVersion.compiledBundle` (DATA_MODEL.md §3.4, ARCHITECTURE.md §3.1) | Policy stored in `PolicyVersion` with semver; `activeVersion` pointer on `Policy` model; deactivated versions retained for history |
| 3.1.2 | Implement `PolicyCompiler` (`src/services/policy/policy.compiler.ts`): parse YAML DSL → validate against `PolicyDocumentSchema` (Zod) → produce `PolicyBundle` with pre-built `toolIndex` and `domainIndex` (ARCHITECTURE.md §3.4, POLICY_ENGINE.md §9) | Compiler rejects invalid YAML with line-number error; valid policy produces `PolicyBundle` with `toolIndex` Dict for O(1) rule lookup; `bundleChecksum` (SHA-256) computed and stored in `PolicyVersion.bundleChecksum` |
| 3.1.3 | Implement all DSL condition types in compiler: `tool` (in/not_in/matches/regex), `params` (all value constraints from POLICY_ENGINE.md §2.2), `context`, `timeWindow`, `dataClass` | 50+ YAML policy fixtures from POLICY_ENGINE.md §3 compile without error; Zod schemas from POLICY_ENGINE.md §9 used for validation |
| 3.1.4 | Implement conflict detection at compile time (POLICY_ENGINE.md §6.2): warn when rule A's conditions overlap with lower-priority rule B producing a shadow effect | Compiler returns `{ bundle, warnings: [{ type: 'SHADOW_CONFLICT', ruleA, ruleB }] }`; API returns warnings in response; does not reject policy |
| 3.1.5 | Policy routes (`src/routes/policies.ts`): `GET /policies`, `POST /policies`, `GET /policies/:id`, `PUT /policies/:id`, `POST /policies/:id/activate`, `POST /policies/:id/test`, `GET /policies/:id/versions`, `GET /policies/:id/coverage` (ARCHITECTURE.md §8.2) | All endpoints authenticated; `POST /policies` validates YAML and returns compile errors with 400 if invalid; `PUT` creates new `PolicyVersion` (does not overwrite) |

---

### Epic 3.2 — Policy Evaluator (TypeScript + Python)

The evaluation algorithm is specified in POLICY_ENGINE.md §4.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 3.2.1 | Implement TypeScript `PolicyEvaluator` for Control Plane use (policy test endpoint, HITL context validation): pure function `evaluate(bundle: PolicyBundle, request: ActionRequest): PolicyDecision` | Pure function — no I/O, no side effects; Vitest unit tests for all decision types (`allow`/`block`/`monitor`/`require_approval`); conflict resolution (POLICY_ENGINE.md §6.1) passes test suite |
| 3.2.2 | Implement Python `PolicyEvaluator` (`sdk/python/agentguard/policy/evaluator.py`): same algorithm as TypeScript, matching POLICY_ENGINE.md §4.3 Python implementation exactly | Python and TypeScript evaluators produce identical decisions for the same bundle + request; cross-language test fixture (100 cases) run in CI |
| 3.2.3 | Implement Python `PolicyBundle` cache (`sdk/python/agentguard/policy/bundle.py`) and loader (`loader.py`): in-process LRU cache, refreshed every 60s, fetched from `GET /sdk/bundle` (ARCHITECTURE.md §4.1, §4.4) | Bundle refresh is non-blocking (background thread); cache miss triggers synchronous fetch (< 30ms on cold start per ARCHITECTURE.md §4.4 latency budget); stale bundle never served after 60s |
| 3.2.4 | Implement SDK bundle route (`GET /sdk/bundle`): API-key authenticated, returns compiled `PolicyBundle` from Redis cache (TTL 60s) or recompiled from PostgreSQL on miss (ARCHITECTURE.md §3.1 `policy-distributor` worker, DATA_MODEL.md §1.2) | Redis cache hit < 5ms; Redis miss → PostgreSQL read + Redis set; `bundleChecksum` included in response for SDK integrity check |
| 3.2.5 | Policy unit test framework (POLICY_ENGINE.md §8): `POST /policies/:id/test` accepts test suite YAML/JSON, runs evaluator against fixtures, returns pass/fail with actual decision vs expected | Test suite from POLICY_ENGINE.md §8.1 passes; `GET /policies/:id/coverage` reports which rules have test coverage and production match rates |

---

### Epic 3.3 — Policy Templates

Four built-in templates from POLICY_ENGINE.md §7 / VISION_AND_SCOPE.md §5.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 3.3.1 | Implement 4 built-in policy templates: `customer-service`, `code-agent`, `data-analyst`, `readonly-monitor` (POLICY_ENGINE.md §7, VISION_AND_SCOPE.md §5) | Templates available at `GET /policies/templates`; each template compiles without warnings; each has at least 5 test fixtures that pass |
| 3.3.2 | `POST /policies/from-template`: create a new policy pre-populated from a named template with optional customisation parameters | Template instantiates as a real `Policy` + `PolicyVersion` in the tenant's account; customisation parameters (e.g., `maxRefundCents`) applied at compile time |

**Sprint 3 Definition of Done:**
- Policy compiler handles all 11 example policies from POLICY_ENGINE.md §3 without error
- Policy evaluator passes 200+ test cases including conflict resolution and adversarial inputs
- Python and TypeScript evaluators produce identical decisions on shared test fixture (cross-language CI test)
- Latency benchmark: TypeScript evaluator p95 < 10ms on 1000-rule bundle (CI artifact); Python evaluator p95 < 10ms
- CTO sign-off: adversarial policy test suite (priority bypass, condition confusion, default override attempts) passes with zero bypasses found

---

## Sprint 4 (Weeks 7–8): Python SDK & LangChain + OpenAI SDK Integration

**Sprint Goal:** Ship the Python SDK that developers actually use. A developer should be able to `pip install agentguard`, add 1–3 lines to their LangChain or OpenAI SDK code, and immediately have policy enforcement and telemetry. The 30-minute integration target from VISION_AND_SCOPE.md §5 is the acceptance criterion for this sprint.

**Dependency:** Sprint 2 complete (API server running, agent API key auth working); Sprint 3 complete (bundle endpoint live, policy evaluator in Python).

---

### Epic 4.1 — SDK Core

Based on ARCHITECTURE.md §4.1 SDK internal architecture.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 4.1.1 | Implement `AgentGuard` SDK entry point (`sdk/python/agentguard/sdk.py`): `AgentGuard(api_key=...)` initialises bundle loader, telemetry buffer, kill switch watcher, and background threads (ARCHITECTURE.md §4.1) | `AgentGuard(api_key="ag_live_...")` starts background threads; `ag.langchain_handler()` and `ag.openai_client()` return configured integration objects; `AGENTGUARD_API_KEY` env var supported |
| 4.1.2 | Implement `TelemetryBuffer` (`sdk/python/agentguard/telemetry/buffer.py`): thread-safe in-memory queue; background daemon thread flushes every 5 seconds or 100 events via `POST /sdk/telemetry/batch`; local disk fallback on persistent API failure (ARCHITECTURE.md §4.5) | Events never dropped silently; disk buffer written to `~/.agentguard/buffer/` on 3x retry failure; buffer picked up on next process start; `enqueue_event()` is non-blocking (appends to queue, returns immediately) |
| 4.1.3 | Implement `KillSwitchWatcher` (`sdk/python/agentguard/kill_switch/watcher.py`): background daemon thread, long-polls `GET /sdk/kill-switch` every 10s; caches result for 5s locally for hot-path check (ARCHITECTURE.md §3.5, §4.4 latency budget) | Kill switch status cached in-process (< 0.5ms lookup per ARCHITECTURE.md §4.4 latency budget); background thread updates every 10s; agent halted within < 15s of kill switch issuance (acceptable Phase 1 propagation per ARCHITECTURE.md §4.4 note) |
| 4.1.4 | Implement `HITLGate` (`sdk/python/agentguard/hitl/gate.py`): blocking poll `GET /hitl/:gateId/poll` (long-poll, 10s server timeout); blocks agent thread until `APPROVED`, `REJECTED`, or timeout (ARCHITECTURE.md §2.3 HITL flow) | `HITLGate(gate_id).wait(timeout_sec=300)` blocks thread; returns `True` on APPROVED, raises `PolicyViolationError` on REJECTED or timeout; HITL wait is explicitly excluded from the 50ms SLA (ARCHITECTURE.md §4.4) |
| 4.1.5 | Implement `PolicyViolationError` and `AgentGuardError` (`sdk/python/agentguard/errors.py`) with `tool`, `rule_id`, and `reason` fields | `PolicyViolationError` is a subclass of `Exception`; contains `tool`, `rule_id`, `reason`; agent code can catch it to handle gracefully |
| 4.1.6 | Telemetry ingest worker (`src/workers/telemetry-ingest.ts`): BullMQ worker processing `POST /sdk/telemetry/batch`; validates batch with `TelemetryBatchSchema`; creates `AuditEvent` + `AnomalyScore` records in PostgreSQL with hash chain (DATA_MODEL.md §2, §8) | Batch of 100 events processed in < 500ms; idempotent by `clientEventId`; `AnomalyScore` created with `method: RULE_BASED` in same transaction as `AuditEvent`; telemetry endpoint `POST /sdk/telemetry/batch` authenticated by agent API key |

---

### Epic 4.2 — LangChain Integration

Based on ARCHITECTURE.md §4.2.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 4.2.1 | Implement `AgentGuardCallbackHandler` (`sdk/python/agentguard/integrations/langchain/callback.py`) extending `BaseCallbackHandler`: `on_tool_start` (blocking, can raise), `on_tool_end`, `on_llm_start`, `on_llm_end` (ARCHITECTURE.md §4.2) | Exact implementation from ARCHITECTURE.md §4.2 code sample; `on_tool_start` calls `evaluator.evaluate_tool_call()`; BLOCK raises `PolicyViolationError`; HITL calls `HITLGate.wait()`; `on_tool_end`, `on_llm_start`, `on_llm_end` emit telemetry non-blocking |
| 4.2.2 | Integration test: LangChain ReAct agent with `AgentGuardCallbackHandler` — ALLOW policy lets tool run; BLOCK policy prevents tool and raises `PolicyViolationError`; HITL policy pauses and resumes on mock approval | Test runs against real LangChain v0.3.x; no mock of AgentGuard internals; all three decision paths exercised |
| 4.2.3 | Integration test: 30-minute onboarding time target — engineer following README can go from `pip install agentguard` to first policy check logged in < 30 minutes (VISION_AND_SCOPE.md §5 Integration Time metric) | Timed in user research session with engineer not on AgentGuard team; result < 30 minutes; friction points documented and addressed |
| 4.2.4 | LangChain SDK tested against LangChain v0.2.x and v0.3.x (VISION_AND_SCOPE.md §5 Framework Coverage) | CI runs integration tests against both LangChain versions; compatibility matrix documented in README |

---

### Epic 4.3 — OpenAI SDK Integration

Based on ARCHITECTURE.md §4.3.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 4.3.1 | Implement `AgentGuardOpenAI` wrapper (`sdk/python/agentguard/integrations/openai/wrapper.py`): wraps `openai.OpenAI`; intercepts `chat.completions.create`; evaluates tool calls in function calling and Assistants tool use (ARCHITECTURE.md §4.3) | `ag.openai_client()` returns an `AgentGuardOpenAI` instance that is a drop-in for `openai.OpenAI()`; tool call interception happens before tool execution; BLOCK raises `PolicyViolationError` |
| 4.3.2 | Integration test: OpenAI function-calling agent with AgentGuard wrapper — ALLOW, BLOCK, and HITL paths all work | Test uses real `openai` Python SDK v1.x; mock OpenAI API or real API key in CI secret store |
| 4.3.3 | SDK performance test: p99 policy evaluation overhead < 50ms measured in Python integration test (VISION_AND_SCOPE.md §5, ARCHITECTURE.md §4.4) | Load test: 1,000 sequential `on_tool_start` calls against cached policy bundle; p99 < 50ms measured; result stored as CI artifact; regression gate: any commit increasing p99 > 50ms fails CI |

**Sprint 4 Definition of Done:**
- `pip install agentguard` works; LangChain quickstart from README produces first policy check logged < 30 minutes
- Both LangChain and OpenAI SDK integrations pass integration tests
- p99 latency overhead < 50ms confirmed in CI benchmark; this is the contractual SLA
- SDK published to PyPI (alpha release)
- Kill switch: agent halts within 15s of `POST /agents/:id/kill` in integration test (within Phase 1 acceptable propagation window)

---

## Sprint 5 (Weeks 9–10): Audit Service, Hash Chain & Kill Switch

**Sprint Goal:** Every agent action intercepted by AgentGuard generates a tamper-evident, append-only log entry that can be verified cryptographically. The kill switch halts an agent in under 500ms when issued from the dashboard or API. Both of these capabilities must be production-grade from day one — they are the compliance and governance foundation.

**Dependency:** Sprint 3 (policy decisions exist to log), Sprint 4 (SDK telemetry batch endpoint exists; kill switch watcher in SDK).

---

### Epic 5.1 — Audit Service & Hash Chain

Based on ARCHITECTURE.md §3.6, DATA_MODEL.md §8.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 5.1.1 | Implement `AuditService` (`src/services/audit/audit.service.ts`) extending `BaseService`: `ingestBatch()`, `queryEvents()`, `getSession()`, `exportEvents()`, `verifySessionChain()` | `ingestBatch()` creates `AuditEvent` + `AnomalyScore` records in a single transaction; `AuditEvent` is never updated after insert (DB trigger from Sprint 2.1.3 enforces this) |
| 5.1.2 | Implement hash chain computation (`src/services/audit/hash-chain.ts`): `computeEventHash(previousHash, event)` using SHA-256 with canonical JSON serialisation (DATA_MODEL.md §8.1, ARCHITECTURE.md §3.6) | Exact implementation from DATA_MODEL.md §8.1; `GENESIS_HASH = '0'.repeat(64)` for first event in session; canonical JSON: keys sorted alphabetically |
| 5.1.3 | Hash chain wired into `ingestBatch()`: each event's `previousHash` is the `eventHash` of the previous event in the session (or `GENESIS_HASH` for first); computed `eventHash` stored on the record | Concurrent batch inserts for the same session are serialised (pessimistic lock on sessionId); hash chain is never broken by race condition |
| 5.1.4 | `GET /events/verify-chain?sessionId={id}` endpoint: re-computes hashes for all events in session order, returns `{ chainValid, eventCount, firstBrokenAt? }` (DATA_MODEL.md §8.2 + §8.3) | Simulated tamper (direct `UPDATE` on DB with superuser) detected and reported with `firstBrokenAt` position; unmodified chain returns `chainValid: true` |
| 5.1.5 | Audit event query routes (`src/routes/events.ts`): `GET /events`, `GET /events/:id`, `POST /events/export`, `GET /agents/:id/events`, `GET /agents/:id/sessions`, `GET /agents/:id/sessions/:sessionId` (ARCHITECTURE.md §8.2) | `GET /events` filtered by `tenantId` (enforced by `ServiceContext`); paginated with cursor; `POST /events/export` creates async S3 export job via BullMQ |
| 5.1.6 | Rule-based `AnomalyScore` computation: `method: RULE_BASED`; five detection rules (velocity, repeated denials, unusual hours, new tool first-use, action count spike) computed from session context at ingest time (DATA_MODEL.md §3.4, POLICY_ENGINE.md §4.4 risk score) | Each rule produces a risk flag label (e.g., `HIGH_VELOCITY`, `REPEATED_DENIALS`); `AnomalyScore.tier` maps to risk tier per POLICY_ENGINE.md §4.4 thresholds; score stored in `AnomalyScore` table |
| 5.1.7 | Alert fanout: BullMQ `siem-publisher` worker (`src/workers/siem-publisher.ts`) queues HIGH/CRITICAL events for SIEM push; BullMQ `alert-notifier` worker sends webhook/email for configured `AlertWebhook` records (ARCHITECTURE.md §3.1 workers, DATA_MODEL.md §2) | Workers process queued events within 5s of ingest; dead-letter queue on 3x retry failure; alerts not duplicated for same event |

---

### Epic 5.2 — Kill Switch Service

Based on ARCHITECTURE.md §3.5.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 5.2.1 | Implement `KillSwitchService` (`src/services/kill-switch/kill-switch.service.ts`) extending `BaseService`: `issueKill(agentId, tier)`, `checkKillSwitch(agentId)`, `resumeAgent(agentId)` (ARCHITECTURE.md §3.5) | Exact implementation from ARCHITECTURE.md §3.5; Redis key `killswitch:{tenantId}:{agentId}` set with 24h TTL; `KillSwitchCommand` record created in same transaction; `assertRole('owner', 'admin', 'operator')` enforced |
| 5.2.2 | Kill switch routes (`src/routes/kill-switch.ts`): `POST /agents/:id/kill`, `POST /agents/:id/resume`, `GET /agents/:id/kill-status` (ARCHITECTURE.md §8.2) | Kill endpoint sets Redis flag AND creates `KillSwitchCommand` record; resume endpoint clears Redis flag AND updates `Agent.status`; `GET /kill-status` reads from Redis (fast path) |
| 5.2.3 | Kill switch polling endpoint for SDK: `GET /sdk/kill-switch` (long-poll, 10s timeout) — returns `{ killed: bool, tier: 'soft' | 'hard' | null }` (ARCHITECTURE.md §8.2) | Long-poll returns within 10s; agent API key authenticated; used by `KillSwitchWatcher` background thread in SDK |
| 5.2.4 | Kill switch audit event: `KillSwitchCommand` record includes `issuedByUserId`, `issuedAt`, `tier`, `reason`; corresponding `AuditEvent` with `actionType: KILL_SWITCH` created (DATA_MODEL.md §2) | Kill command fully audited; `AUDITOR` role can view kill history; kill event appears in session audit trail |
| 5.2.5 | Integration test: kill switch roundtrip < 500ms from `POST /agents/:id/kill` to SDK `on_tool_start` receiving KILLED decision (VISION_AND_SCOPE.md §5 Kill Switch RTC metric) | Timed end-to-end in integration test; fails if > 500ms; result stored as CI artifact |

---

### Epic 5.3 — Session Management

| Story | Description | Acceptance Criteria |
|---|---|---|
| 5.3.1 | `AgentSession` lifecycle: session created on first telemetry batch for a new `sessionId`; `AgentSession.actionCount`, `blockCount`, `tokensUsed`, `riskScoreMax` updated atomically on each batch ingest (DATA_MODEL.md §2, `AgentSession` model) | Concurrent updates use PostgreSQL `UPDATE ... SET count = count + 1` (no read-modify-write race); `riskScoreMax` uses `GREATEST(current, new)` |
| 5.3.2 | Session budget enforcement: when `AgentSession.actionCount >= policy.budgets.maxActionsPerSession`, telemetry ingest returns `{ budgetExceeded: true }`; SDK raises `PolicyViolationError` with `reason: 'Session action budget exceeded'` (POLICY_ENGINE.md §4.1 pre-checks) | Budget counter checked at ingest time; counter from `AgentSession` table; SDK receives budget violation in telemetry response and raises error |

**Sprint 5 Definition of Done:**
- Tamper-evident audit log verified: simulated DB-level tamper detected by `verify-chain` endpoint
- Kill switch roundtrip < 500ms in integration test (CI artifact)
- AnomalyScore computed for every ingested event with at least 5 detection rules active
- Log completeness test: 10,000 events ingested; 0 lost (including disk buffer recovery scenario)
- AUDITOR role can view audit log but not call kill switch (role-based access test)

---

## Sprint 6 (Weeks 11–12): Dashboard, HITL, SIEM & Design Partner Readiness

**Sprint Goal:** Complete the Phase 1 feature set. Ship the dashboard, HITL approval workflow, and SIEM integrations. Reach design partner readiness: a CISO can open the dashboard, see all their agents, browse the event log, approve a pending HITL gate, and push high-severity events to Splunk — all from a browser. This is the sprint that makes Phase 1 success criteria measurable.

**Dependency:** All prior sprints complete.

---

### Epic 6.1 — Next.js Dashboard

Based on ARCHITECTURE.md §2.1 (dashboard component) and §6.3 (frontend tech stack).

| Story | Description | Acceptance Criteria |
|---|---|---|
| 6.1.1 | Next.js 14 App Router dashboard (`apps/dashboard`) with shadcn/ui components, Tailwind CSS, SWR for data fetching, Recharts for risk visualisation (ARCHITECTURE.md §6.3) | `npm run dev` starts dashboard; authentication flow works (JWT); protected routes redirect to login |
| 6.1.2 | Agent List view: all registered agents with status indicators, risk tier badges, last-seen timestamp, kill switch button; real-time status updates via WebSocket (ARCHITECTURE.md §2.1 dashboard component) | Shows `AgentStatus` enum values (ACTIVE/KILLED/QUARANTINED/INACTIVE); WebSocket connected to `wss://api.agentguard.io/v1/events/stream`; status updates without page refresh |
| 6.1.3 | Agent Detail view: event log (paginated, filterable), risk score chart, policy summary, kill switch button | Event log uses `GET /agents/:id/events` with cursor pagination; risk score chart uses Recharts; kill switch triggers `POST /agents/:id/kill` with confirmation modal |
| 6.1.4 | Event Log view: global event feed filterable by agent, time range, `policyDecision`, `riskTier`, `actionType`; real-time updates via WebSocket; session replay for selected session | Filters map to `QueryAuditEventsSchema` parameters; `GET /agents/:id/sessions/:sessionId` powers session replay view showing full event chain |
| 6.1.5 | Policy Editor: create/edit policies with YAML syntax highlighting; inline compile errors from API; test runner UI using `POST /policies/:id/test`; version history via `GET /policies/:id/versions` | YAML editor validates against `PolicyDocumentSchema` on the client; compile errors shown at the correct line; test results show pass/fail per test case |
| 6.1.6 | HITL Pending queue: operators see pending gates with action context (tool name, params, matched rule, timeout countdown); approve/reject via `POST /hitl/:gateId/approve` and `/reject` (DATA_MODEL.md §3.5, ARCHITECTURE.md §2.3 HITL flow) | Real-time update when new gate arrives (WebSocket); countdown timer shows `timeoutAt - now`; approve/reject recorded with `decidedByUserId` and `decisionNote` |
| 6.1.7 | Dashboard load time: primary monitoring view (Agent List) p95 < 2s (VISION_AND_SCOPE.md §6 Dashboard Load Time metric) | Measured with Playwright; result stored as CI artifact; regression gate |

---

### Epic 6.2 — HITL Service

Based on ARCHITECTURE.md §2.3 HITL flow, DATA_MODEL.md §3.5.

| Story | Description | Acceptance Criteria |
|---|---|---|
| 6.2.1 | Implement `HITLService` (`src/services/hitl/hitl.service.ts`) extending `BaseService`: `createGate()`, `resolveGate(approve/reject)`, `getPendingGates()`, `pollGateStatus()` | Gate created when SDK sends `HITL_REQUIRED` decision in telemetry batch; Redis stores gate state (real-time poll); PostgreSQL stores full record |
| 6.2.2 | HITL routes (`src/routes/hitl.ts`): `GET /hitl/pending`, `GET /hitl/:id`, `POST /hitl/:id/approve`, `POST /hitl/:id/reject`, `GET /hitl/:id/poll` (long-poll, ARCHITECTURE.md §8.2) | `GET /hitl/pending` uses partial index `idx_hitl_pending` (DATA_MODEL.md §7.2); `POST /hitl/:id/approve` requires `OPERATOR` role; `GET /hitl/:id/poll` long-polls Redis state |
| 6.2.3 | HITL timeout enforcement: BullMQ delayed job created on gate creation with `delay: timeoutSec * 1000`; on fire, sets gate to `TIMED_OUT` and applies `onTimeout` action via Redis | Gate always resolves; no hanging gates; `TIMED_OUT` state logged as `HITL_TIMEOUT` `policyDecision` in `AuditEvent` |
| 6.2.4 | HITL notifications: on gate creation, send email via AWS SES and Slack webhook (if configured) with tool name, parameters, matched rule, approve/reject links; `HITLGate.notifiedViaSlack` and `notifiedViaEmail` updated (DATA_MODEL.md §2) | Email and Slack messages sent within 5s of gate creation; links use `POST /hitl/:id/approve` with auth token in URL (one-time use) |
| 6.2.5 | Integration test: HITL full cycle — policy with `require_approval` action → SDK blocks → gate appears in dashboard → operator approves via API → SDK unblocks → tool executes (ARCHITECTURE.md §2.3 HITL flow diagram) | Test exercises exact flow from ARCHITECTURE.md §2.3; total roundtrip (block → approve → unblock) < 30s in automated test with mock human approval |

---

### Epic 6.3 — SIEM Integrations

Based on ARCHITECTURE.md §3.1 (`splunk.service.ts`, `sentinel.service.ts`), DATA_MODEL.md §2 (`SIEMIntegration` model).

| Story | Description | Acceptance Criteria |
|---|---|---|
| 6.3.1 | Implement `SplunkService` (`src/services/siem/splunk.service.ts`): HTTPS push to Splunk HEC endpoint; event schema maps to Splunk CIM (ARCHITECTURE.md §3.1) | `POST /integrations/siem/splunk` stores encrypted HEC token in `SIEMIntegration.config`; `siem-publisher` BullMQ worker pushes HIGH/CRITICAL events within 5s; `POST /integrations/siem/:id/test` sends test event |
| 6.3.2 | Implement `SentinelService` (`src/services/siem/sentinel.service.ts`): HTTPS push to Log Analytics workspace via Data Connector API; CEF/JSON schema (ARCHITECTURE.md §3.1) | `POST /integrations/siem/sentinel` stores workspace ID and encrypted workspace key; same BullMQ worker pattern as Splunk; test event endpoint works |
| 6.3.3 | SIEM routes (`src/routes/siem.ts`): `GET /integrations/siem`, `POST /integrations/siem/splunk`, `POST /integrations/siem/sentinel`, `DELETE /integrations/siem/:id`, `POST /integrations/siem/:id/test` (ARCHITECTURE.md §8.2) | Encrypted storage of SIEM credentials (AWS Secrets Manager or encrypted JsonB); `minSeverity` filter (only send events at or above threshold) |
| 6.3.4 | Alert webhook routes (`src/routes/siem.ts`): `GET /alerts/webhooks`, `POST /alerts/webhooks`, `DELETE /alerts/webhooks/:id`, `POST /alerts/webhooks/:id/test` — HMAC-SHA256 signed payloads (ARCHITECTURE.md §8.1, DATA_MODEL.md §2 `AlertWebhook`) | Webhook URLs validated: HTTPS only, no private IP ranges (SSRF prevention per ARCHITECTURE.md §7.1); HMAC signature in `X-AgentGuard-Signature` header |

---

### Epic 6.4 — OSS Launch Readiness

Per VISION_AND_SCOPE.md §5 (1,000 GitHub stars success criterion) and ARCHITECTURE.md §1.2 (Open Core principle).

| Story | Description | Acceptance Criteria |
|---|---|---|
| 6.4.1 | Apache 2.0 license headers on all OSS files: Python SDK (`agentguard` PyPI package), policy schema, and policy evaluator (ARCHITECTURE.md §1.2 Open Core principle) | `git ls-files | xargs grep -l 'Apache' ` confirms headers present on all public-facing source files; README states Apache 2.0 |
| 6.4.2 | Public GitHub repository: README with architecture diagram, 5-minute quickstart (ARCHITECTURE.md §9.2 developer setup), CONTRIBUTING.md, SECURITY.md (security@agentguard.io, 90-day disclosure), CODE_OF_CONDUCT.md | External engineer not on team completes quickstart in < 30 minutes from README alone |
| 6.4.3 | PyPI package `agentguard` stable release (v0.1.0): `pip install agentguard` installs LangChain + OpenAI SDK integrations; `agentguard --version` works | PyPI page has full description; examples in README work against staging API |
| 6.4.4 | 10 curated policy templates published in repository (VISION_AND_SCOPE.md §6 Policy Templates metric): customer-service, code-agent, data-analyst, readonly-monitor, finance-strict, hr-agent, rag-agent, infra-restricted, hipaa-clinical, enterprise-baseline (all from POLICY_ENGINE.md §3) | Each template compiles without warnings; each has at least 3 test fixtures; templates are importable via `GET /policies/templates` |
| 6.4.5 | SOC 2 Type II evidence collection automated: AgentGuard's own internal agents are monitored by AgentGuard (dog-fooding); audit window starts Month 6 (ARCHITECTURE.md §7.3) | Vanta/Drata connected; automated evidence collection for access controls, audit logging, monitoring; CTO sign-off on SOC 2 readiness checklist |

---

### Phase 1 Final Acceptance Gate

Before declaring Phase 1 complete and proceeding to Phase 2:

**Functional Gates (all must pass):**
- [ ] End-to-end demo flow works without errors: register agent → upload policy → run LangChain agent → policy blocks an action → audit log verified → kill switch halts agent → session chain integrity confirmed
- [ ] p99 latency overhead < 50ms: confirmed in CI load test at 1K, 10K, and 100K actions/hour; SLA documented in product spec
- [ ] Kill switch roundtrip < 500ms: confirmed in integration test (CI artifact)
- [ ] Log completeness > 99.9%: tested via 10,000-event ingest + intentional API outage during ingest; disk buffer recovery confirmed
- [ ] False positive rate < 2%: measured against 1,000-action test suite with known-good agent behaviour
- [ ] Cross-tenant isolation: Tenant A's JWT returns zero results for Tenant B's data (integration test)
- [ ] Audit chain tamper detection: direct DB UPDATE detected by `verify-chain` endpoint

**Design Partner Gate:**
- [ ] 5 organisations signed as design partners (per VISION_AND_SCOPE.md §5)
- [ ] At least 2 design partners actively using in staging or production (telemetry confirms active usage)

**Community Gate:**
- [ ] GitHub repository public
- [ ] PyPI v0.1.0 published
- [ ] 100+ weekly active OSS users (defined as ≥1 policy check in trailing 7 days)

---

## Phase 2 Direction (Months 7–12)

Phase 2 planning is deferred to Month 5 and should be driven by design partner feedback. The following are the architectural commitments already made in ARCHITECTURE.md §10 that Phase 2 will implement. **Sprint-level planning happens in Month 5, not now.**

### Sprint-Level Planning Gate: Month 5

Before writing Phase 2 sprints, the team must answer:
1. Which 3 design partners have the most urgent Phase 2 requirements? (compliance modules vs. multi-agent vs. on-prem?)
2. Have Phase 1 latency SLAs held at design partner production load? (ClickHouse migration trigger)
3. Which Phase 2 framework integrations (CrewAI, AutoGen, LlamaIndex) have been requested most?

### Phase 2 Architectural Roadmap (from ARCHITECTURE.md §10)

| Capability | Architecture Notes | Prerequisite |
|---|---|---|
| **Compliance reporting modules** (EU AI Act, HIPAA, DORA) | Report templates built on Phase 1 audit log + PostgreSQL queries + PDF renderer (Puppeteer); new `ComplianceReport` table in Prisma schema | Phase 1 audit log volume from design partners |
| **Multi-agent governance** | Add `parentAgentId` + `orchestrationId` to `AuditEvent` Prisma schema; correlation engine queries PostgreSQL; new `AgentInteraction` table | Phase 1 single-agent data model stable |
| **CrewAI, AutoGen, LlamaIndex integrations** | New framework-specific modules in `sdk/python/agentguard/integrations/`; same `AgentGuardCallbackHandler` interface; framework compatibility matrix in CI | Python SDK architecture from Sprint 4 proven stable |
| **ML anomaly detection** (Phase 1 is rule-based) | River online learning model; ONNX export + in-process inference; `AnomalyScore.method` changes to `ML_IFOREST`; requires 30+ days of training data | 30+ days of Phase 1 production telemetry |
| **mTLS agent identity** | Vault-issued short-lived mTLS certs; `AgentCertificate` Prisma model; SDK handles cert rotation; replaces bcrypt API key auth | Phase 1 API key auth validated at design partner scale |
| **ClickHouse for telemetry at scale** | Dual-write to PostgreSQL + ClickHouse during migration window; PostgreSQL retained for 7-day hot window; ClickHouse for analytics | Trigger: >5M AuditEvent rows/day per tenant |
| **NATS JetStream** | Replaces Redis long-polling for kill switch + policy updates; SDK subscribes to NATS stream; push-based not pull-based | Phase 1 Redis-based polling validated; volume growth justifies push architecture |
| **On-premises / VPC deployment** | Helm chart for Kubernetes; all deps (PostgreSQL, Redis, S3-compatible) customer-managed; licence validation via offline key | SaaS version stable; at least 1 design partner requesting on-prem |
| **Additional SIEM integrations** | Chronicle, IBM QRadar, Elastic SIEM; same `SIEMService` pattern as Sprint 6 Splunk/Sentinel | Design partner demand signal |

---

## Phase 3 Direction (Months 13–24)

Detailed sprint planning deferred. High-level milestones from VISION_AND_SCOPE.md §6 and ARCHITECTURE.md §10:

| Milestone | Target Month | Key Architectural Work |
|---|---|---|
| Supply chain security (SBOM, model version pinning) | M13–14 | Agent fingerprinting at registration; model hash in policy |
| MCP (Model Context Protocol) security | M14–15 | Monitor spec stability; new integration module alongside LangChain |
| Cloud marketplace listings (AWS Bedrock, Azure AI, GCP Vertex) | M15–18 | Distribution channel; no architectural change to core |
| Advanced forensic replay | M16–18 | S3 blob storage of full prompt/response pairs (Phase 1 stores only structured summaries) |
| Agent ASPM scoring | M18–20 | Continuous posture management across fleet; requires multi-agent data at scale |
| Red team as a service | M20–24 | Professional services; product and team maturity prerequisite |
| Series A readiness | M14–15 | $1.5–2.5M ARR; 8–15 referenceable enterprise customers; NRR > 120%; SOC 2 Type II issued |

---

## Technical Decisions Log

All decisions below are **made** (not hypothetical). They are documented in ARCHITECTURE.md v2.0 and bind the roadmap. No decision here is open for re-debate in Phase 1 sprints without CTO sign-off and a written ADR update.

---

### Decision 1: TypeScript Monolith (Not Microservices)

**Decision (ARCHITECTURE.md §3.1):** All services (`PolicyService`, `AgentService`, `AuditService`, `KillSwitchService`, `HITLService`, `SIEMService`) are modules within a single TypeScript / Node.js 22 deployable. No separate service processes in Phase 1.

**Rationale:** 4–6 person team. Microservices coordination overhead (inter-service auth, distributed tracing, separate deploy pipelines) would consume 30–40% of engineering time with no offsetting benefit at this scale. Module boundaries within the monolith enforce separation; Phase 2 can extract services if ECS scaling requires it.

**Roadmap impact:** Sprint 2 builds the full control plane in one codebase. No "which service owns this?" conversations. Shared `ServiceContext`, shared Prisma client, shared Zod schemas.

**Revisit trigger:** Any single service consuming > 50% of API server CPU under production load. Phase 2 EKS migration provides the infrastructure to extract.

---

### Decision 2: Prisma ORM (Not Drizzle, Not Raw SQL)

**Decision (ARCHITECTURE.md §6.1, DATA_MODEL.md §1.1):** All database access via Prisma 5.x with `@prisma/adapter-pg` (PrismaPg). No Drizzle ORM. No raw SQL except for RLS setup and partial indexes in migrations.

**Rationale:** Prisma is the team standard. Type-safe migrations, `prisma generate` produces fully typed client from schema, `z.infer<>` derives TypeScript types from Zod schemas that mirror Prisma models. The alternative (Drizzle, used in the old roadmap) was specified without reference to team standards and would require rebuilding existing patterns.

**Roadmap impact:** Every data story in Sprint 2+ references Prisma models from DATA_MODEL.md §2, not raw SQL or Drizzle table definitions. The `prisma/schema.prisma` file in DATA_MODEL.md §2 is the implementation spec.

**Trade-off accepted:** Prisma's query builder is less flexible than raw SQL for complex analytical queries. Mitigated by: (a) Phase 1 volumes fit Prisma well; (b) `$queryRaw` available for edge cases, reviewed in PR; (c) ClickHouse migration in Phase 2 for high-volume analytics.

---

### Decision 3: In-Process Python SDK (Not Sidecar, Not Proxy)

**Decision (ARCHITECTURE.md §4, §1.1):** The data plane is the `agentguard` Python package that runs inside the customer's Python process. No sidecar container. No HTTP proxy. No Rust binary in Phase 1.

**Rationale:** The "pip install + 3 lines" developer experience (VISION_AND_SCOPE.md §5 Integration Time metric) is structurally impossible with a sidecar or proxy architecture for Phase 1. In-process evaluation enables the < 50ms p99 SLA: no network hop for policy evaluation (bundle is cached in-process). The sidecar/proxy architecture is a Phase 2 enterprise deployment option for customers who cannot modify agent code.

**Roadmap impact:** SDK sprint (Sprint 4) ships a PyPI package, not a Docker image. Kill switch is long-poll from inside the agent process, not a sidecar listening on a port. This is the key architectural decision that makes the developer experience work.

**Trade-off accepted:** In-process SDK means policy updates propagate on a 60-second refresh cycle (not instant). Acceptable for Phase 1 design partners; NATS-based push in Phase 2 reduces this.

---

### Decision 4: Zod as Single Schema Source of Truth

**Decision (ARCHITECTURE.md §6.1, §8.3, DATA_MODEL.md §4):** All API input validation uses Zod 3.x schemas defined in `src/schemas/`. TypeScript types are derived via `z.infer<typeof Schema>`. No separate type definitions that duplicate schema fields.

**Rationale:** Type-safe at runtime (Zod validation) and at compile time (`z.infer<>` derivation) with a single source. The old roadmap referenced "JSON Schema" and "API types" as separate packages — this creates drift between validation schema and TypeScript types.

**Roadmap impact:** Every API story in Sprint 2+ must have a corresponding Zod schema defined in `src/schemas/` before the route handler is written. Schemas from DATA_MODEL.md §4 are the implementation spec.

**Trade-off accepted:** Zod schemas are verbose compared to TypeScript interfaces. Accepted: the verbosity is the validation logic, not boilerplate.

---

### Decision 5: Redis for Real-Time State Only (Not Primary Store)

**Decision (ARCHITECTURE.md §5.1, DATA_MODEL.md §1.2):** Redis (ElastiCache 7, Sentinel mode) is used exclusively for: kill switch flags, HITL gate state (real-time), rate limit counters, policy bundle cache. PostgreSQL is the system of record for all structured data.

**Rationale:** The old roadmap used NATS JetStream as a primary event bus in Phase 1. NATS adds operational complexity (another process to run, another failure domain) for capabilities that BullMQ (Redis-backed) covers adequately at Phase 1 scale. NATS is architecturally intended for Phase 2 when push-based real-time signals replace long-polling.

**Roadmap impact:** Kill switch is Redis-flag + long-poll (not NATS subscribe). Policy bundle cache is Redis TTL (not NATS stream). SIEM push is BullMQ queue worker (not NATS consumer). All of these are simpler to operate and reason about in Phase 1.

**Revisit trigger:** Phase 2, when SDK agent fleet size makes long-polling unscalable (> 10,000 concurrent agents).

---

### Decision 6: Hono Web Framework (Not Fastify, Not Express)

**Decision (ARCHITECTURE.md §6.1):** API server uses Hono 4.x as the web framework.

**Rationale:** Hono is fast (benchmarks above Fastify on Node.js 22), edge-compatible (no lock-in to Node.js-only APIs), has first-class TypeScript support, and has composable middleware via `app.use()`. The old roadmap referenced Fastify — Hono was chosen in ARCHITECTURE.md v2.0 as the team standard upgrade.

**Roadmap impact:** All route implementations in Sprint 2+ use Hono handlers. `c.req`, `c.json()`, `c.set()`, `c.get()` are the API. No Express `req`/`res` patterns.

---

### Decision 7: AWS ECS Fargate for Phase 1 (Not EKS)

**Decision (ARCHITECTURE.md §6.4, §9.1):** Phase 1 compute is AWS ECS Fargate. No Kubernetes in Phase 1.

**Rationale:** EKS operational overhead (cluster upgrades, node group management, networking CNI configuration) consumes 2–4 days/month of engineering time that Phase 1 cannot afford. Fargate abstracts instance management entirely. The monolith architecture means there are only 3 task types: API, Dashboard, Workers — not 15 microservices that would justify Kubernetes complexity.

**Roadmap impact:** Sprint 1 infrastructure stories use ECS task definitions, not Kubernetes manifests. On-premises Helm chart is deferred to Phase 2 per VISION_AND_SCOPE.md §5.

**Revisit trigger:** Phase 2 when on-premises deployment requires a Kubernetes reference architecture for customer Helm chart.

---

### Decision 8: Apache 2.0 for OSS Core

**Decision (ARCHITECTURE.md §1.2, VISION_AND_SCOPE.md §4 Open Core principle):** Apache 2.0 for the policy engine, Python SDK, and LangChain/OpenAI integrations. Commercial license for SIEM integrations, compliance modules, and multi-tenant dashboard.

**Rationale:** Apache 2.0 maximises community trust and adoption. Enterprise legal teams accept Apache 2.0 without review. BSL (Business Source Licence) was considered and rejected: Elastic's BSL shift created significant community backlash; our moat is community and integration breadth, not licence restriction.

**Roadmap impact:** Sprint 6 OSS launch stories confirm Apache 2.0 headers on all public-facing files. The commercial/OSS boundary is: OSS = SDK + policy engine + framework integrations; Commercial = SIEM push workers, compliance report generation, multi-tenant management features.

---

### Decision 9: Policy Evaluation Location — Hybrid In-Process + Async

**Decision (ARCHITECTURE.md §4.4, VISION_AND_SCOPE.md §7 Key Decisions Still Needed #1):** Hybrid approach. Policy evaluation runs **in-process** in the SDK using a locally-cached compiled `PolicyBundle`. Telemetry, kill switch polling, and HITL gates run **out-of-process** via async HTTP to the Control Plane.

**Rationale:** This resolves the open question from VISION_AND_SCOPE.md §7 in favour of the in-process path for the hot path (ALLOW/BLOCK decisions) and out-of-process for everything that doesn't need to be synchronous. In-process evaluation eliminates the network hop that would add 10–50ms to every agent action, making the < 50ms p99 SLA achievable. Policy bundles refresh every 60 seconds from Redis cache.

**Roadmap impact:** Sprint 3 ships both the TypeScript compiler (server-side) and Python evaluator (in-process). Sprint 4 wires the bundle cache and refresh loop. The key constraint: any story that proposes adding a synchronous network call to the policy evaluation hot path is a regression against this decision.

---

### Decisions Still Pending (Must Resolve by Month 2)

These were flagged as open questions in VISION_AND_SCOPE.md §7 and are not yet resolved in ARCHITECTURE.md:

| Decision | Owner | Deadline | Impact |
|---|---|---|---|
| **Design partner selection criteria** — which 5 organisations, which industries | CEO + Head of Sales | Month 1 | Determines which compliance use cases to prioritise in Phase 2 planning |
| **Data residency architecture** — S3 region strategy for EU GDPR customers | CTO + Legal | Month 1 | Affects Sprint 1 AWS infrastructure; eu-west-1 tenant data plane |
| **Incident disclosure policy** — responsible disclosure timeline, post-mortem SLA | CTO + Legal | Month 2 | Required before first enterprise sales conversation |
| **SOC 2 audit firm selection** | CEO + CTO | Month 3 | Evidence window opens Month 6 (Sprint 6 story 6.4.5) |

---

## Team Structure

### Phase 1 Team (4–6 people)

The team structure matches the actual work decomposition across the 6 sprints:

```
CEO / Technical Co-Founder
    │
    ├── Product vision and roadmap prioritisation
    ├── Design partner discovery and relationship management
    ├── Public-facing content (blog, conference talks)
    └── Fundraising process

CTO / Security Architect
    │
    ├── Architecture decisions (binds this roadmap)
    ├── Security review gate at each sprint (mandatory DoD)
    ├── Policy engine correctness sign-off (Sprint 3 DoD)
    ├── Threat model for AgentGuard itself (ARCHITECTURE.md §7)
    └── Performance SLA validation (latency benchmarks in CI)

Backend Engineer (Senior) — Sprints 2, 3, 5, 6 primary
    │
    ├── Control plane API server (Hono, TypeScript)
    ├── Prisma schema and migrations (DATA_MODEL.md §2)
    ├── BaseService + ServiceContext pattern (ARCHITECTURE.md §3.2)
    ├── PolicyService and compiler (ARCHITECTURE.md §3.4)
    ├── AuditService and hash chain (ARCHITECTURE.md §3.6)
    ├── KillSwitchService (ARCHITECTURE.md §3.5)
    └── HITLService + SIEM integrations
    Hiring criteria: 5+ years TypeScript/Node.js; PostgreSQL and Redis expertise;
    security-adjacent experience; has used Prisma in production

SDK Engineer (Senior) — Sprints 4, 3 (Python evaluator)
    │
    ├── Python SDK architecture (ARCHITECTURE.md §4.1)
    ├── LangChain callback handler (ARCHITECTURE.md §4.2)
    ├── OpenAI SDK wrapper (ARCHITECTURE.md §4.3)
    ├── Telemetry buffer + background threads (ARCHITECTURE.md §4.5)
    ├── Kill switch watcher (ARCHITECTURE.md §3.5)
    ├── Python policy evaluator (POLICY_ENGINE.md §4.3)
    └── PyPI packaging and SDK performance benchmarks
    Hiring criteria: Python and TypeScript; has built and shipped SDKs/libraries;
    familiar with LangChain; understands sync/async threading patterns

Full-Stack Engineer (Mid) — Sprint 6 primary, Sprint 1 support
    │
    ├── Next.js 14 App Router dashboard (ARCHITECTURE.md §6.3)
    ├── shadcn/ui component library
    ├── WebSocket real-time event feed
    ├── Policy YAML editor with inline validation
    └── HITL approval UI
    Hiring criteria: React + TypeScript; real-time UIs (WebSocket/SSE); comfortable
    in Next.js App Router

DevRel / Engineer (Month 7 hire, per VISION_AND_SCOPE.md business case)
    │
    ├── OSS community (GitHub, Discord)
    ├── Developer documentation and tutorials
    ├── Example agents and policy templates
    └── Conference talks and blog posts
    Hiring criteria: has shipped a developer community before; writes code;
    measures community health metrics
```

### Hiring Priority & Timing

**Day 1 (before Sprint 1):**
1. **Senior Backend Engineer** — critical path for Sprints 2, 3, 5. Policy engine and data model are the core product. Nothing ships without this hire.
2. **Senior SDK Engineer** — critical path for Sprint 4. LangChain integration is the developer wedge that drives design partner adoption.

**Month 2 (enables Sprint 3 + 4 in parallel):**
3. **Full-Stack Engineer** — dashboard work (Sprint 6) can begin in Sprint 4 timeframe in parallel with SDK work if budget allows.

**Month 7 (per business case burn trajectory):**
4. **DevRel Engineer** — OSS launch readiness; community before GitHub star count matters.

**Month 8 (first enterprise AE):**
5. **Account Executive** — 5+ years selling security SaaS to CISOs; $500K+ quota; existing CISO relationships. CTO + CEO handle pre-sales in Phase 1.

### What NOT to Hire Yet

- **Data Scientist / ML Engineer** — anomaly detection is rule-based in Phase 1 (`RULE_BASED` scoring method in `AnomalyScore`); ML requires 30+ days of production data (Phase 2 trigger)
- **Sales Engineer** — AE + CTO handle pre-sales through Phase 2
- **Customer Success Manager** — first 5 design partners managed directly by CEO/CTO
- **Security Analyst** — red team is one-time engagement with external firm (Phase 3)

---

## Definition of Done

### Universal Story Standards

A story is **Done** when ALL of the following are true:

1. **Code merged to `main`** via approved PR
2. **Tests written** — new functionality has Vitest unit tests; integration paths have integration tests
3. **Coverage maintained** — package coverage doesn't drop below 80%
4. **Type-safe** — `tsc --noEmit` passes with zero errors; no `any` without `// eslint-disable` comment with justification
5. **Linted** — `npm run lint` passes zero warnings; named exports only; `import type` for type-only imports (ARCHITECTURE.md §6.5)
6. **Reviewed** — at least one other engineer has approved the PR (CTO reviews any story touching policy evaluation, auth, or audit log)
7. **Zod schema defined** — any new API input has a corresponding `src/schemas/` Zod schema before route handler is written
8. **tenantId scoped** — any new Prisma query in a service method includes `tenantId: this.ctx.tenantId`; no cross-tenant data access possible
9. **No secrets** — no API keys, tokens, passwords, or internal URLs in code or git history (`git secrets` scan clean)
10. **Changelog entry** — PR description references the sprint story ID

### Phase 1 Security Review Checklist

Run at each sprint close AND for any story touching auth, policy evaluation, audit log, or cryptographic operations. **CTO sign-off required.**

**Authentication & Authorisation:**
- [ ] Every API endpoint requires JWT (human) or API key (agent) auth — no unauthenticated endpoints except `/health`
- [ ] `tenantId` extracted from JWT claims only, never from request body (ARCHITECTURE.md §6.2)
- [ ] `ServiceContext` injected via middleware; `assertRole()` called in service methods for write operations
- [ ] API keys bcrypt-hashed before storage; prefix stored for display; plaintext returned once on creation and never stored (DATA_MODEL.md §3.2)
- [ ] Cross-tenant isolation integration test passes: Tenant A's JWT + Tenant B's resource ID → 404

**Policy Engine:**
- [ ] Policy evaluator is a pure function — no side effects, no I/O during evaluation (ARCHITECTURE.md §3.4)
- [ ] Adversarial test suite passes: priority bypass, condition confusion, default-override attempts
- [ ] Default action is `block` for all production policies; `allow` default only for `pol_observability_only` template
- [ ] Policy changes require authentication; every activation logged in `PolicyVersion.createdByUserId`

**Audit Log:**
- [ ] Append-only DB trigger verified (`UPDATE` attempt raises exception)
- [ ] Hash chain verified: simulated tamper detected by `GET /events/verify-chain`
- [ ] `AuditEvent` records include `tenantId`; RLS confirmed via `psql` direct query
- [ ] Log export endpoint (`POST /events/export`) is rate-limited per tenant

**SDK Security:**
- [ ] SDK does not log API keys or full parameters that may contain secrets
- [ ] TLS certificate verification enabled (`httpx` default — never `verify=False`)
- [ ] Fail-closed is the default (`FailBehavior.CLOSED` per ARCHITECTURE.md §1.2)
- [ ] Kill switch check occurs before policy evaluation on every `on_tool_start`

**Infrastructure:**
- [ ] All inter-component communication is TLS 1.3 (CloudFront → ECS, ECS → RDS, ECS → Redis)
- [ ] DB credentials in AWS Secrets Manager; not in environment variables or `.env` files in production
- [ ] No debug endpoints or admin backdoors in ECS production task definition
- [ ] SSRF prevention: webhook URLs validated (HTTPS only; private IP ranges blocked) (ARCHITECTURE.md §7.1)
- [ ] AgentGuard monitors its own internal agents (dog-fooding) (ARCHITECTURE.md §7.3)

### Phase 1 Definition of Done (End of Month 6)

Phase 1 is complete when:
- [ ] All 6 sprint acceptance criteria are met
- [ ] End-to-end demo: register agent → upload policy → run LangChain agent → action blocked → audit log verified → kill switch < 500ms → chain integrity confirmed
- [ ] p99 latency SLA < 50ms confirmed at 100K actions/hour (CI load test artifact)
- [ ] `pip install agentguard` → first policy check logged in < 30 minutes (timed user research)
- [ ] 5 design partner agreements signed (VISION_AND_SCOPE.md §5)
- [ ] 1,000 GitHub stars on OSS repository (VISION_AND_SCOPE.md §5)
- [ ] 100+ weekly active OSS users (VISION_AND_SCOPE.md §6)
- [ ] Zero known critical security vulnerabilities (quarterly pentest scheduled for Month 6)
- [ ] SOC 2 Type II evidence collection automated; audit window open
- [ ] Phase 1 retrospective complete; Phase 2 sprint planning begun with design partner input

### Phase 2 Definition of Done (End of Month 12)

Phase 2 is complete when:
- [ ] At least one compliance report module live (EU AI Act or HIPAA — determined by design partner input in Month 5)
- [ ] Multi-agent governance: `parentAgentId` + `orchestrationId` in `AuditEvent`; cross-agent correlation queries working
- [ ] At least two additional framework integrations shipped (CrewAI, AutoGen, or LlamaIndex — per design partner demand)
- [ ] ML anomaly detection in production (requires 30+ days of Phase 1 production data)
- [ ] mTLS agent identity shipped (replaces API key for enterprise tier)
- [ ] First paying enterprise customer signed
- [ ] ARR on path to $150K by Month 12 (VISION_AND_SCOPE.md §6 Revenue Metrics)
- [ ] NRR > 110% (VISION_AND_SCOPE.md §6)
- [ ] p99 < 50ms SLA maintained at Phase 2 design partner load

---

## Appendix: Module Map

The canonical source structure from ARCHITECTURE.md §3.1, reproduced for sprint planning reference:

```
agentguard/
├── src/                               # TypeScript control plane
│   ├── server.ts                      # Hono app entry point
│   ├── middleware/
│   │   ├── auth.ts                    # JWT → ServiceContext
│   │   ├── tenant-rls.ts              # SET LOCAL app.current_tenant_id
│   │   └── error-handler.ts           # ServiceError → HTTP response
│   ├── services/
│   │   ├── base.service.ts            # BaseService + ServiceContext
│   │   ├── policy/
│   │   │   ├── policy.service.ts      # Sprint 2 (CRUD), Sprint 3 (compile/activate)
│   │   │   ├── policy.compiler.ts     # Sprint 3
│   │   │   └── policy.evaluator.ts    # Sprint 3
│   │   ├── agent/
│   │   │   └── agent.service.ts       # Sprint 2
│   │   ├── audit/
│   │   │   ├── audit.service.ts       # Sprint 5
│   │   │   └── hash-chain.ts          # Sprint 5
│   │   ├── kill-switch/
│   │   │   └── kill-switch.service.ts # Sprint 5
│   │   ├── hitl/
│   │   │   └── hitl.service.ts        # Sprint 6
│   │   └── siem/
│   │       ├── splunk.service.ts      # Sprint 6
│   │       └── sentinel.service.ts    # Sprint 6
│   ├── routes/
│   │   ├── agents.ts                  # Sprint 2
│   │   ├── policies.ts                # Sprint 3
│   │   ├── events.ts                  # Sprint 5
│   │   ├── hitl.ts                    # Sprint 6
│   │   ├── kill-switch.ts             # Sprint 5
│   │   └── siem.ts                    # Sprint 6
│   ├── schemas/                       # Zod schemas — source of truth for types
│   │   ├── agent.schema.ts            # Sprint 2
│   │   ├── policy.schema.ts           # Sprint 3
│   │   ├── audit-event.schema.ts      # Sprint 5
│   │   └── hitl.schema.ts             # Sprint 6
│   ├── db/
│   │   ├── client.ts                  # Prisma + PgBouncer config
│   │   └── slow-query.ts              # >1000ms logging
│   └── workers/
│       ├── telemetry-ingest.ts        # Sprint 4 (BullMQ)
│       ├── siem-publisher.ts          # Sprint 6 (BullMQ)
│       └── policy-distributor.ts      # Sprint 3 (push bundle to Redis)
├── prisma/
│   └── schema.prisma                  # Sprint 2 (DATA_MODEL.md §2)
├── sdk/python/agentguard/             # Python data plane (PyPI)
│   ├── __init__.py
│   ├── sdk.py                         # Sprint 4
│   ├── policy/
│   │   ├── bundle.py                  # Sprint 3/4
│   │   ├── evaluator.py               # Sprint 3
│   │   └── loader.py                  # Sprint 4
│   ├── integrations/
│   │   ├── langchain/callback.py      # Sprint 4
│   │   └── openai/wrapper.py          # Sprint 4
│   ├── telemetry/
│   │   ├── buffer.py                  # Sprint 4
│   │   └── emitter.py                 # Sprint 4
│   ├── kill_switch/watcher.py         # Sprint 4
│   ├── hitl/gate.py                   # Sprint 4
│   ├── errors.py                      # Sprint 4
│   └── models.py                      # Sprint 4
└── apps/dashboard/                    # Next.js 14 App Router
    └── (Next.js app structure)        # Sprint 6
```

---

*Document version: 2.0 — February 2026*
*Owner: Product & Engineering Lead*
*Revised: Fully traced to ARCHITECTURE.md v2.0, POLICY_ENGINE.md v1.0, DATA_MODEL.md v1.0, VISION_AND_SCOPE.md v1.0*
*Previous version: ROADMAP.md v1.0 (written without architecture reference — superseded)*
*Next review: End of Sprint 2 (Week 4) — confirm Prisma schema matches design partner onboarding requirements*
*Classification: Confidential — AgentGuard Internal*