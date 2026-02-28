# AgentGuard — System Architecture
## Engineering Document v2.0 — February 2026
### Revised to align with Vision & Scope v1.0

---

> **Revision note (v2.0):** This document replaces the previous v1.0 draft, which was produced without reference to the Vision & Scope document. The prior draft over-specified Phase 2/3 capabilities (ML anomaly detection, ClickHouse, NATS JetStream, Rust data plane, compliance modules, incident playbook engine) and used a tech stack inconsistent with the team's established patterns. This revision aligns architecture to the Phase 1 MVP scope and the team's TypeScript / Prisma / Zod / PostgreSQL standards. Phase 2/3 capabilities are noted where relevant but not designed in detail.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Phase 1 MVP Architecture](#2-phase-1-mvp-architecture)
3. [Control Plane — Phase 1](#3-control-plane--phase-1)
4. [Data Plane — Phase 1 (Python SDK)](#4-data-plane--phase-1-python-sdk)
5. [Data Architecture — Phase 1](#5-data-architecture--phase-1)
6. [Technology Stack](#6-technology-stack)
7. [Security of AgentGuard Itself](#7-security-of-agentguard-itself)
8. [API Design — Phase 1](#8-api-design--phase-1)
9. [Deployment — Phase 1](#9-deployment--phase-1)
10. [Phase 2 / Phase 3 Roadmap (Architectural Intent)](#10-phase-2--phase-3-roadmap-architectural-intent)

---

## 1. System Overview

AgentGuard is a **runtime security platform** — not a model safety tool, not an API gateway, not a SIEM. It intercepts AI agent actions before execution, evaluates them against declared policies, records everything with tamper-evident integrity, and provides human operators with visibility and control.

### 1.1 What AgentGuard Is and Is Not (Phase 1)

| IS (Phase 1) | IS NOT (Phase 1) |
|---|---|
| Policy enforcement layer for agent tool calls | ML-based behavioural anomaly detection (Phase 2) |
| Tamper-evident audit log for compliance | Compliance report generation / EU AI Act reports (Phase 2) |
| Kill switch and human-in-the-loop gates | Multi-agent governance / cross-agent correlation (Phase 2) |
| Basic risk scoring (rule-based) | ONNX/ML inference on hot path (Phase 2) |
| LangChain + OpenAI SDK integrations | CrewAI, AutoGen, LlamaIndex integrations (Phase 2) |
| SaaS + Python SDK | On-premises / VPC deployment (Phase 2) |
| Splunk + Sentinel basic SIEM push | Full compliance modules / regulatory reports (Phase 2) |
| API-key agent identity | mTLS cryptographic identity (Phase 2) |

### 1.2 Core Design Principles

Drawn directly from VISION_AND_SCOPE.md §4 Product Principles:

| Principle | Phase 1 Implementation |
|---|---|
| **< 50ms p99 overhead** | Hybrid in-process + async path; policy eval is in-process with cached bundle; telemetry is non-blocking async |
| **Policy as Code** | YAML policy files, Git-native workflow, dashboard is read/visualise layer on top |
| **Framework Agnostic** | Python SDK with LangChain callback handler and OpenAI SDK wrapper in Phase 1; REST API for custom frameworks |
| **Open Core** | Policy engine + logging OSS (Apache 2.0); SIEM integrations + advanced features commercial |
| **Defence in Depth** | Policy enforcement layer → rule-based risk scoring → kill switch → audit log; each layer independently operable |
| **Fail-Closed by Default** | Policy evaluation failure blocks agent action by default; configurable fail-open per agent |
| **Tenant Isolation** | `tenantId` on every database record; composite indexes; PostgreSQL RLS; ServiceContext pattern throughout |

### 1.3 Multi-Tenancy Model

AgentGuard is a multi-tenant SaaS. Tenant isolation is enforced at every layer:

- **Database:** `tenantId` on every Prisma model, composite indexes `(tenantId, id)`, PostgreSQL Row-Level Security
- **Application:** `ServiceContext` carries `{ tenantId, userId, role }` through every service operation — never inferred from request context, always extracted from validated JWT
- **API keys:** Agent API keys are scoped to a single tenant; cross-tenant operations are structurally impossible
- **Storage:** S3 paths prefixed `tenant/{tenantId}/...`
- **Telemetry:** Event records include `tenantId`; all queries filter by it as the first index key

---

## 2. Phase 1 MVP Architecture

### 2.1 High-Level Topology

```
╔══════════════════════════════════════════════════════════════════════════╗
║                       AGENTGUARD PHASE 1 MVP                            ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   DEVELOPER'S ENVIRONMENT                                                ║
║   ┌────────────────────────────────────────────────────────────────┐    ║
║   │   Agent Process (Python)                                        │    ║
║   │   ┌──────────────────────────────────────────────────────┐    │    ║
║   │   │   Agent Framework (LangChain / OpenAI SDK)           │    │    ║
║   │   │          │  tool_call hooks / completions wrapper    │    │    ║
║   │   │   ┌──────▼────────────────────────────────────────┐  │    │    ║
║   │   │   │         agentguard Python SDK                  │  │    │    ║
║   │   │   │                                                │  │    │    ║
║   │   │   │  ┌──────────────┐   ┌───────────────────────┐ │  │    │    ║
║   │   │   │  │ Policy Bundle│   │  Telemetry Buffer     │ │  │    │    ║
║   │   │   │  │ (local cache)│   │  (async, batched)     │ │  │    │    ║
║   │   │   │  └──────┬───────┘   └──────────┬────────────┘ │  │    │    ║
║   │   │   │         │ evaluate()            │ emit()       │  │    │    ║
║   │   │   │  ┌──────▼───────────────────────▼────────────┐ │  │    │    ║
║   │   │   │  │           Policy Evaluator (in-process)   │ │  │    │    ║
║   │   │   │  │  ALLOW / BLOCK / HITL_REQUIRED / MONITOR  │ │  │    │    ║
║   │   │   │  └────────────────────────────────────────────┘ │  │    │    ║
║   │   │   │                                                │  │    │    ║
║   │   │   │  ┌────────────────┐   ┌──────────────────────┐ │  │    │    ║
║   │   │   │  │  Kill Switch   │   │   HITL Gate          │ │  │    │    ║
║   │   │   │  │  Listener      │   │   (pause + await)    │ │  │    │    ║
║   │   │   │  └────────────────┘   └──────────────────────┘ │  │    │    ║
║   │   │   └────────────────────────┬───────────────────────┘  │    │    ║
║   │   └────────────────────────────┼───────────────────────────┘    │    ║
║   └────────────────────────────────┼────────────────────────────────┘    ║
║                                    │                                      ║
║                      HTTPS + REST API (TLS 1.3)                          ║
║                      - Policy bundle fetch (on start + refresh)          ║
║                      - Telemetry batch push (async, every 5s or 100 evts)║
║                      - Kill switch polling (long-poll, 10s interval)     ║
║                      - HITL gate callbacks                               ║
║                                    │                                      ║
╠════════════════════════════════════▼═════════════════════════════════════╣
║                                                                          ║
║   AGENTGUARD CONTROL PLANE (TypeScript / Node.js — AWS us-east-1)       ║
║                                                                          ║
║   ┌────────────────────────────────────────────────────────────────┐    ║
║   │   API Layer (Hono, REST, HTTPS)                                 │    ║
║   │   Auth middleware: JWT validation → ServiceContext injection    │    ║
║   └──────────┬──────────────────────────────────────────────────────┘    ║
║              │                                                            ║
║   ┌──────────▼───────────────────────────────────────────────────────┐  ║
║   │   Service Layer (BaseService + ServiceContext pattern)            │  ║
║   │                                                                   │  ║
║   │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │  ║
║   │  │ PolicyService  │  │ AgentService   │  │ AuditService       │ │  ║
║   │  │ (CRUD, compile,│  │ (register,     │  │ (ingest telemetry, │ │  ║
║   │  │  version, test)│  │  creds, status)│  │  query, export)    │ │  ║
║   │  └────────┬───────┘  └───────┬────────┘  └────────┬───────────┘ │  ║
║   │           │                  │                     │             │  ║
║   │  ┌────────▼──────────────────▼─────────────────────▼───────────┐ │  ║
║   │  │              KillSwitchService  │  HITLService               │ │  ║
║   │  └───────────────────────────────────────────────────────────--┘ │  ║
║   └──────────────────────────────┬──────────────────────────────────┘  ║
║                                  │                                       ║
║   ┌──────────────────────────────▼──────────────────────────────────┐   ║
║   │   Data Layer                                                     │   ║
║   │                                                                  │   ║
║   │   ┌─────────────────────────────────────────────────────────┐  │   ║
║   │   │  PostgreSQL 16 (AWS RDS Multi-AZ)                        │  │   ║
║   │   │  Prisma ORM + pg adapter + PgBouncer connection pooling  │  │   ║
║   │   │  Row-Level Security for tenant isolation                  │  │   ║
║   │   │  Tables: Agent, Policy, PolicyVersion, AuditEvent,        │  │   ║
║   │   │          AnomalyScore, HITLGate, KillSwitchCommand,       │  │   ║
║   │   │          SIEMIntegration, Tenant, User                    │  │   ║
║   │   └─────────────────────────────────────────────────────────┘  │   ║
║   │                                                                  │   ║
║   │   ┌──────────────────────┐   ┌──────────────────────────────┐  │   ║
║   │   │  Redis 7 (ElastiCache│   │  S3 (forensic blobs,         │  │   ║
║   │   │  Sentinel, 3-node)   │   │   exported logs, policy YAMLs│  │   ║
║   │   │  Kill switch flags,  │   │   compliance evidence)       │  │   ║
║   │   │  HITL gate state,    │   └──────────────────────────────┘  │   ║
║   │   │  rate limit counters,│                                      │   ║
║   │   │  policy bundle cache │                                      │   ║
║   │   └──────────────────────┘                                      │   ║
║   └──────────────────────────────────────────────────────────────---┘   ║
║                                                                          ║
║   ┌──────────────────────────────────────────────────────────────────┐  ║
║   │   Dashboard (Next.js 14, App Router, React)                       │  ║
║   │   Agent activity feed, policy violations, risk scores,            │  ║
║   │   kill switch, HITL approvals, audit log viewer                   │  ║
║   └──────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   SIEM INTEGRATIONS (Phase 1 basic push)                                ║
║   ┌──────────────────┐   ┌─────────────────────────────────────────┐   ║
║   │ Splunk HEC       │   │ Microsoft Sentinel (Log Analytics API)  │   ║
║   │ (HTTPS push)     │   │ (HTTPS push, CEF/JSON schema)           │   ║
║   └──────────────────┘   └─────────────────────────────────────────┘   ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### 2.2 Phase 1 Request Flow: LangChain Tool Call

```
Developer Agent Code
─────────────────────────────────────────────────────────────
agent.run("Send a refund email for order #1234")
         │
         ▼
LangChain decides to invoke tool: send_email(to=..., body=...)
         │
         ▼ (AgentGuard LangChain callback intercepts)
┌─────────────────────────────────────────────────────────┐
│ agentguard.before_tool_call(tool="send_email",          │
│   params={to, body}, session_id, agent_id)              │
│                                                         │
│ Step 1: Load policy bundle from local cache (<1ms)      │
│ Step 2: Evaluate rules against action (<5ms)            │
│   → matches rule: email.external_domain.block           │
│   → decision: BLOCK                                     │
│ Step 3: Create AuditEvent record (async, non-blocking)  │
│ Step 4: Return PolicyDecision.BLOCK to interceptor      │
└─────────────────────────────────────────────────────────┘
         │
         ▼
LangChain raises PolicyViolationError("Email to external
domain blocked by policy email.external_domain.block")
         │
         ▼
Agent handles error → logs → escalates or stops

Meanwhile (async, out of band):
─────────────────────────────────────────────────────────────
AuditEvent buffered → batch pushed to Control Plane API
Control Plane persists to PostgreSQL with hash chain
SIEM integration picks up high-severity events → pushes to Splunk
Dashboard receives WebSocket notification → updates feed
Alert webhook fires → Slack/PagerDuty notification
```

### 2.3 Phase 1 Request Flow: HITL Gate

```
Agent attempts high-risk action: approve_payment(amount=75000)

before_tool_call intercept
         │
         ▼
Policy evaluation: matches rule payment.large.require_approval
         │
decision = HITL_REQUIRED
         │
         ▼
SDK polls Control Plane: POST /hitl/gates (creates gate record)
SDK blocks agent thread: polls GET /hitl/gates/{id} every 2s
         │
         ▼ (Control Plane)
AuditEvent created with status=HITL_PENDING
WebSocket push to Dashboard
Email/Slack alert to configured approvers
         │
         ▼ (Human approver via Dashboard or Slack callback)
POST /hitl/gates/{id}/approve (or /reject)
         │
         ▼ (SDK poll returns APPROVED)
SDK returns ALLOW decision to LangChain
Tool executes
AuditEvent updated with HITL_APPROVED outcome
```

---

## 3. Control Plane — Phase 1

The Control Plane is a TypeScript / Node.js application following the team's BaseService + ServiceContext pattern. All database access via Prisma ORM. All input validation via Zod schemas.

### 3.1 Service Decomposition

All services are in a single deployable TypeScript application (monolith) in Phase 1. Services are separated by module boundary with strict interfaces. Phase 2 can extract services to separate deployables if scale requires it.

```
src/
├── server.ts                    # Hono app entry point
├── middleware/
│   ├── auth.ts                  # JWT → ServiceContext extraction
│   ├── tenant-rls.ts            # Set PostgreSQL session variable for RLS
│   └── error-handler.ts        # ServiceError → HTTP response mapping
├── services/
│   ├── base.service.ts          # BaseService + ServiceContext (team standard)
│   ├── policy/
│   │   ├── policy.service.ts    # PolicyService extends BaseService
│   │   ├── policy.compiler.ts   # YAML DSL → compiled PolicyBundle
│   │   └── policy.evaluator.ts  # In-process rule evaluation engine
│   ├── agent/
│   │   └── agent.service.ts     # AgentService extends BaseService
│   ├── audit/
│   │   ├── audit.service.ts     # AuditService extends BaseService
│   │   └── hash-chain.ts        # Tamper-evident chaining
│   ├── kill-switch/
│   │   └── kill-switch.service.ts
│   ├── hitl/
│   │   └── hitl.service.ts
│   └── siem/
│       ├── splunk.service.ts    # Splunk HEC push
│       └── sentinel.service.ts  # Microsoft Sentinel push
├── routes/
│   ├── agents.ts
│   ├── policies.ts
│   ├── events.ts
│   ├── hitl.ts
│   ├── kill-switch.ts
│   └── siem.ts
├── schemas/                     # Zod schemas (source of truth for types)
│   ├── agent.schema.ts
│   ├── policy.schema.ts
│   ├── audit-event.schema.ts
│   └── hitl.schema.ts
├── db/
│   ├── client.ts                # Prisma client + connection pool config
│   └── slow-query.ts            # Slow query logging >1000ms
└── workers/
    ├── telemetry-ingest.ts      # Process buffered SDK telemetry batches
    ├── siem-publisher.ts        # Background SIEM push worker (BullMQ)
    └── policy-distributor.ts    # Push policy bundle updates to Redis
```

### 3.2 BaseService + ServiceContext Pattern

The team standard pattern, used consistently across all services:

```typescript
// services/base.service.ts
import type { PrismaClient, Prisma } from '@prisma/client';

export interface ServiceContext {
  readonly tenantId: string;
  readonly userId:   string;
  readonly role:     UserRole;
  readonly traceId:  string;
}

export type UserRole = 'owner' | 'admin' | 'analyst' | 'operator' | 'auditor' | 'agent';

export abstract class BaseService {
  constructor(
    protected readonly db: PrismaClient,
    protected readonly ctx: ServiceContext,
  ) {}

  protected async withTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn, {
      maxWait:        5_000,
      timeout:        10_000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }

  protected assertRole(...allowed: UserRole[]): void {
    if (!allowed.includes(this.ctx.role)) {
      throw PolicyError.denied(
        `Role '${this.ctx.role}' cannot perform this operation`,
      );
    }
  }

  protected tenantScope() {
    return { tenantId: this.ctx.tenantId };
  }
}
```

### 3.3 ServiceError Factory Pattern

```typescript
// errors/service-error.ts

export class ServiceError extends Error {
  constructor(
    readonly code:       string,
    readonly message:    string,
    readonly httpStatus: number,
    readonly details?:   unknown,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class PolicyError extends ServiceError {
  static denied(message: string, details?: unknown): PolicyError {
    return new PolicyError('POLICY_DENIED', message, 403, details);
  }

  static rateLimited(retryAfterMs: number): PolicyError {
    return new PolicyError('RATE_LIMITED', 'Rate limit exceeded', 429, {
      retryAfterMs,
    });
  }

  static requiresApproval(gateId: string, timeoutMs: number): PolicyError {
    return new PolicyError('REQUIRES_APPROVAL', 'Action requires human approval', 202, {
      gateId,
      timeoutMs,
    });
  }
}

export class NotFoundError extends ServiceError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} '${id}' not found`, 404);
  }
}

export class ValidationError extends ServiceError {
  constructor(issues: unknown) {
    super('VALIDATION_ERROR', 'Request validation failed', 400, issues);
  }
}
```

### 3.4 Policy Compiler

The compiler transforms YAML DSL policy documents into a `PolicyBundle` — a serialisable, pre-indexed structure that the Python SDK caches locally for in-process evaluation.

```typescript
// services/policy/policy.compiler.ts
import { z } from 'zod';
import type { PolicyDocument, PolicyBundle, CompiledRule } from '../../schemas/policy.schema.ts';

export class PolicyCompiler {
  compile(doc: PolicyDocument): PolicyBundle {
    const rules = doc.rules.map(rule => this.compileRule(rule));
    return {
      policyId:       doc.id,
      tenantId:       doc.tenantId,
      version:        doc.version,
      compiledAt:     new Date().toISOString(),
      rules,
      defaultAction:  doc.default ?? 'block',
      // Pre-built lookup indexes for fast evaluation
      toolIndex:      this.buildToolIndex(rules),
      domainIndex:    this.buildDomainIndex(rules),
      ruleCount:      rules.length,
    };
  }

  private compileRule(rule: PolicyRule): CompiledRule {
    return {
      id:         rule.id,
      priority:   rule.priority ?? 100,
      action:     rule.action,  // 'allow' | 'block' | 'monitor' | 'require_approval'
      conditions: rule.when.map(c => this.compileCondition(c)),
      metadata:   {
        description: rule.description,
        tags:        rule.tags ?? [],
        severity:    rule.severity ?? 'medium',
      },
    };
  }
  // ... condition compilation (glob matchers, regex, numeric comparisons)
}
```

### 3.5 Kill Switch Service

```typescript
// services/kill-switch/kill-switch.service.ts
import type { Redis } from 'ioredis';
import { BaseService } from '../base.service.ts';

const KILL_SWITCH_KEY = (tenantId: string, agentId: string) =>
  `killswitch:${tenantId}:${agentId}`;

export class KillSwitchService extends BaseService {
  constructor(
    db: PrismaClient,
    ctx: ServiceContext,
    private readonly redis: Redis,
  ) {
    super(db, ctx);
  }

  async issueKill(agentId: string, tier: 'soft' | 'hard'): Promise<void> {
    this.assertRole('owner', 'admin', 'operator');

    await this.withTransaction(async (tx) => {
      // Verify agent belongs to this tenant
      const agent = await tx.agent.findUniqueOrThrow({
        where: { id_tenantId: { id: agentId, tenantId: this.ctx.tenantId } },
      });

      await tx.killSwitchCommand.create({
        data: {
          tenantId:  this.ctx.tenantId,
          agentId,
          issuedBy:  this.ctx.userId,
          tier,
          issuedAt:  new Date(),
        },
      });

      // Write Redis flag — SDK polls this on every action
      await this.redis.set(
        KILL_SWITCH_KEY(this.ctx.tenantId, agentId),
        tier,
        'EX',
        86_400,  // 24h TTL — agent must be explicitly resumed
      );
    });
  }

  async checkKillSwitch(agentId: string): Promise<string | null> {
    return this.redis.get(KILL_SWITCH_KEY(this.ctx.tenantId, agentId));
  }
}
```

### 3.6 Audit Hash Chain

Tamper-evident chaining — each audit event records the SHA-256 hash of the previous event in the session, creating a detectable chain if any record is deleted or modified.

```typescript
// services/audit/hash-chain.ts
import { createHash } from 'node:crypto';

export function computeEventHash(
  previousHash: string,
  eventPayload: {
    eventId:    string;
    agentId:    string;
    tenantId:   string;
    occurredAt: string;
    actionType: string;
    decision:   string;
  },
): string {
  const canonical = JSON.stringify(eventPayload, Object.keys(eventPayload).sort());
  return createHash('sha256').update(previousHash + canonical).digest('hex');
}

export const GENESIS_HASH = '0'.repeat(64); // First event in chain
```

---

## 4. Data Plane — Phase 1 (Python SDK)

The data plane is the Python SDK (`agentguard` on PyPI). It runs inside the customer's Python process — no sidecar, no proxy, no Rust binary required in Phase 1. This is the key architectural decision that enables the "pip install + 3 lines" developer experience mandated by Vision & Scope.

### 4.1 SDK Internal Architecture

```
agentguard/
├── __init__.py              # Public API: AgentGuard class, decorators
├── sdk.py                   # AgentGuard SDK entry point (init, config)
├── policy/
│   ├── bundle.py            # PolicyBundle dataclass, local cache
│   ├── evaluator.py         # In-process rule evaluation (<5ms budget)
│   └── loader.py            # Fetch + refresh bundle from Control Plane API
├── integrations/
│   ├── langchain/
│   │   └── callback.py      # AgentGuardCallbackHandler (LangChain BaseCallbackHandler)
│   └── openai/
│       └── wrapper.py       # AgentGuardOpenAI (wraps openai.OpenAI client)
├── telemetry/
│   ├── buffer.py            # Thread-safe async event buffer
│   └── emitter.py           # Background thread: batch push to Control Plane
├── kill_switch/
│   └── watcher.py           # Background thread: long-poll kill switch status
├── hitl/
│   └── gate.py              # Blocking poll for HITL gate decisions
├── errors.py                # PolicyViolationError, AgentGuardError
└── models.py                # Dataclasses: ActionEvent, PolicyDecision, etc.
```

### 4.2 LangChain Integration

```python
# agentguard/integrations/langchain/callback.py
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult
from agentguard.policy.evaluator import PolicyEvaluator
from agentguard.telemetry.buffer import TelemetryBuffer
from agentguard.errors import PolicyViolationError

class AgentGuardCallbackHandler(BaseCallbackHandler):
    """
    Drop-in LangChain callback handler. Intercepts tool calls, LLM calls,
    and chain executions. Evaluates policy before tool execution.

    Usage:
        from agentguard import AgentGuard
        ag = AgentGuard(api_key="ag_...")
        agent = create_react_agent(llm, tools, callbacks=[ag.langchain_handler()])
    """

    def __init__(
        self,
        evaluator: PolicyEvaluator,
        buffer:    TelemetryBuffer,
        session_id: str,
        agent_id:   str,
    ) -> None:
        self._evaluator = evaluator
        self._buffer    = buffer
        self._session   = session_id
        self._agent_id  = agent_id

    def on_tool_start(
        self,
        serialized: dict,
        input_str: str,
        **kwargs,
    ) -> None:
        """Called BEFORE tool execution. Blocking — can raise to prevent execution."""
        tool_name = serialized.get("name", "unknown")
        decision = self._evaluator.evaluate_tool_call(
            tool=tool_name,
            params=input_str,
            session_id=self._session,
            agent_id=self._agent_id,
        )
        self._buffer.enqueue(decision.to_event())

        if decision.result == "block":
            raise PolicyViolationError(
                tool=tool_name,
                rule_id=decision.matched_rule_id,
                reason=decision.reason,
            )
        if decision.result == "require_approval":
            # Blocking wait for HITL gate resolution
            from agentguard.hitl.gate import HITLGate
            approved = HITLGate(decision.gate_id).wait(timeout_sec=300)
            if not approved:
                raise PolicyViolationError(
                    tool=tool_name,
                    rule_id=decision.matched_rule_id,
                    reason="HITL gate rejected or timed out",
                )

    def on_tool_end(self, output: str, **kwargs) -> None:
        """Called AFTER tool execution. Logs result, non-blocking."""
        self._buffer.enqueue_tool_result(output=output, session_id=self._session)

    def on_llm_start(self, serialized: dict, prompts: list[str], **kwargs) -> None:
        """Log LLM call start for chain-of-thought capture."""
        self._buffer.enqueue_llm_start(prompts=prompts, session_id=self._session)

    def on_llm_end(self, response: LLMResult, **kwargs) -> None:
        """Log LLM call result."""
        self._buffer.enqueue_llm_end(response=response, session_id=self._session)
```

### 4.3 OpenAI SDK Integration

```python
# agentguard/integrations/openai/wrapper.py
from openai import OpenAI
from openai.types.chat import ChatCompletion
from agentguard.policy.evaluator import PolicyEvaluator
from agentguard.telemetry.buffer import TelemetryBuffer
from agentguard.errors import PolicyViolationError

class AgentGuardOpenAI:
    """
    Transparent wrapper around openai.OpenAI that instruments all calls.

    Usage:
        from agentguard import AgentGuard
        ag = AgentGuard(api_key="ag_...")
        client = ag.openai_client()   # Drop-in for openai.OpenAI()
        # All calls through client are intercepted and policy-checked
    """

    def __init__(
        self,
        openai_client: OpenAI,
        evaluator:     PolicyEvaluator,
        buffer:        TelemetryBuffer,
        agent_id:      str,
    ) -> None:
        self._client    = openai_client
        self._evaluator = evaluator
        self._buffer    = buffer
        self._agent_id  = agent_id
        self.chat       = _ChatCompletionsWrapper(self)

class _ChatCompletionsWrapper:
    def create(self, **kwargs) -> ChatCompletion:
        # Intercept tool calls in the request
        tools = kwargs.get("tools", [])
        session_id = kwargs.pop("agentguard_session_id", None)

        # Pre-call policy check on declared tool use
        decision = self._sdk._evaluator.evaluate_llm_call(
            model=kwargs.get("model"),
            tool_names=[t["function"]["name"] for t in tools],
            session_id=session_id,
        )
        self._sdk._buffer.enqueue(decision.to_event())

        if decision.result == "block":
            raise PolicyViolationError(reason=decision.reason)

        response = self._sdk._client.chat.completions.create(**kwargs)

        # Post-call: intercept tool_call results in response
        if response.choices[0].finish_reason == "tool_calls":
            for tool_call in response.choices[0].message.tool_calls or []:
                call_decision = self._sdk._evaluator.evaluate_tool_call(
                    tool=tool_call.function.name,
                    params=tool_call.function.arguments,
                    session_id=session_id,
                    agent_id=self._sdk._agent_id,
                )
                self._sdk._buffer.enqueue(call_decision.to_event())
                if call_decision.result == "block":
                    raise PolicyViolationError(
                        tool=tool_call.function.name,
                        reason=call_decision.reason,
                    )

        return response
```

### 4.4 Policy Evaluation — Latency Budget

The <50ms p99 SLA from VISION_AND_SCOPE.md §5 is met through this architecture:

```
┌────────────────────────────────────────────────────────────┐
│         POLICY EVALUATION LATENCY BUDGET (Phase 1)         │
│                Target: < 50ms p99 overhead                  │
├─────────────────────────────────┬──────────────────────────┤
│ Step                            │ Budget     │ Mechanism    │
├─────────────────────────────────┼────────────┼──────────────┤
│ 1. Kill switch pre-check        │ < 0.5ms    │ Redis GET    │
│    (Redis, local SDK hot flag)  │            │ (cached 5s)  │
├─────────────────────────────────┼────────────┼──────────────┤
│ 2. Load policy bundle           │ < 0.5ms    │ In-process   │
│    (in-process, refreshed 60s)  │            │ LRU cache    │
├─────────────────────────────────┼────────────┼──────────────┤
│ 3. Tool name index lookup       │ < 0.5ms    │ Dict lookup  │
│    (compiled index in bundle)   │            │ O(1)         │
├─────────────────────────────────┼────────────┼──────────────┤
│ 4. Rule condition evaluation    │ < 5ms      │ Python eval  │
│    (glob / regex / numeric)     │            │ (no I/O)     │
├─────────────────────────────────┼────────────┼──────────────┤
│ 5. Risk scoring (rule-based)    │ < 1ms      │ Rule lookup  │
│    (no ML inference in P1)      │            │ + arithmetic │
├─────────────────────────────────┼────────────┼──────────────┤
│ 6. Audit event create (async)   │ ~0ms       │ Non-blocking │
│    (buffered, background push)  │            │ queue append │
├─────────────────────────────────┼────────────┼──────────────┤
│ TOTAL (fast path, cache hit)    │ ~8ms p50   │              │
│ TOTAL (cold start, bundle miss) │ ~30ms p95  │ HTTP fetch   │
│ TOTAL (HITL gate, synchronous)  │ unbounded  │ Human wait   │
└─────────────────────────────────┴────────────┴──────────────┘

NOTE: HITL gate wait time is excluded from the 50ms SLA — it is
explicitly a human-in-the-loop pause, not an overhead measurement.
The 50ms SLA applies to ALLOW and BLOCK decisions.
```

**Key architectural decisions enabling this budget:**
1. Policy bundle is compiled server-side and cached in-process in the SDK. No network call on the hot path.
2. Kill switch state is cached for 5 seconds locally; background thread refreshes it. Acceptable tradeoff: agent may execute 1-2 actions after kill switch before it propagates.
3. No ML inference on the hot path in Phase 1. Rule-based risk scoring only.
4. Telemetry is fire-and-forget buffered emission — the hot path returns immediately after recording to the buffer.

### 4.5 Telemetry Buffer and Background Emission

```
SDK hot path: enqueue_event(event) → in-memory queue (thread-safe)
                                                │
                        Background thread (daemon):
                        ┌─────────────────────────────────┐
                        │ every 5 seconds OR 100 events:  │
                        │   flush queue → batch payload   │
                        │   POST /internal/telemetry/batch│
                        │   retry up to 3x on failure     │
                        │   on persistent failure:        │
                        │     write to local disk buffer  │
                        │     (crash-safe, picked up next │
                        │      process start)             │
                        └─────────────────────────────────┘
```

This is the "log completeness under failure conditions" mitigation from VISION_AND_SCOPE.md §7 technical risks: events are never silently dropped — they fall back to a local disk buffer if the Control Plane is unreachable.

---

## 5. Data Architecture — Phase 1

Phase 1 uses **PostgreSQL exclusively** for all structured data. This aligns with the team standard (Prisma ORM, PostgreSQL). ClickHouse is deferred to Phase 2 when telemetry volumes warrant it (>5M events/day). Redis is used for real-time state only.

### 5.1 Storage Responsibilities

| Data Type | Storage | Rationale |
|---|---|---|
| Agents, policies, users, tenants | **PostgreSQL (Prisma)** | Team standard; ACID; RLS for tenant isolation |
| Audit events, action telemetry | **PostgreSQL (Prisma)** | Sufficient for Phase 1 volumes (<500K events/day per tenant); migrate to ClickHouse in Phase 2 at scale |
| Kill switch flags, HITL state, rate counters | **Redis** | Sub-millisecond; TTL semantics; pub/sub for real-time state |
| Policy bundle cache | **Redis** (server) + in-process (SDK) | TTL-based refresh; SDK fetches on miss or expiry |
| Policy YAML files (source of truth) | **S3** (or Git webhook, YAML stored as text in PostgreSQL for Phase 1) | Simpler in Phase 1 to store YAML text in DB; S3 for Phase 2 Git-native workflow |
| Forensic session blobs (large) | **S3** | Cheap; content-addressed; presigned URL access |
| SIEM event queue | **BullMQ (Redis-backed)** | Reliable background job processing; retry logic |

### 5.2 Phase 2 Data Scaling Path

When Phase 1 telemetry volumes grow beyond PostgreSQL's cost-effective range (~5M events/day), Phase 2 will introduce:
- **ClickHouse** for telemetry event storage and aggregation queries
- **NATS JetStream** for replacing polling-based kill switch / HITL with push-based event streaming
- PostgreSQL retained for structured control plane data (agents, policies, users)

This migration is designed in. The `AuditEvent` schema in PostgreSQL uses a structure compatible with ClickHouse's MergeTree engine. Migration tooling (Prisma → ClickHouse ETL) is a Phase 2 deliverable.

### 5.3 Connection Pooling (Team Standard)

```typescript
// db/client.ts
import { Pool }        from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg }    from '@prisma/adapter-pg';
import { logger }      from '../lib/logger.ts';

const pool = new Pool({
  connectionString:       process.env.DATABASE_URL,
  max:                    20,        // Per service instance
  idleTimeoutMillis:      30_000,
  connectionTimeoutMillis: 5_000,
  application_name:       process.env.SERVICE_NAME ?? 'agentguard-api',
});

// Slow query logging — team standard: log queries > 1000ms
pool.on('connect', (client) => {
  client.query(`SET log_min_duration_statement = 1000`);
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'warn'  },
    { emit: 'event', level: 'error' },
  ],
});

prisma.$on('query', (e) => {
  if (e.duration > 1_000) {
    logger.warn('slow_query', {
      duration: e.duration,
      query:    e.query,
      params:   e.params,
    });
  }
});
```

---

## 6. Technology Stack

### 6.1 Control Plane (Phase 1)

| Component | Technology | Version | Rationale |
|---|---|---|---|
| Runtime | **Node.js** | 22 LTS | Team standard; TypeScript 5.x strict |
| Language | **TypeScript** | 5.x strict, ESM modules | Team standard |
| Web framework | **Hono** | 4.x | Fast; edge-compatible; first-class TS; middleware composable |
| ORM | **Prisma** | 5.x | Team standard; type-safe migrations; pg adapter |
| DB adapter | **pg + PrismaPg** | — | Team standard; connection pooling |
| Schema validation | **Zod** | 3.x | Team standard; z.infer<> for type derivation; API input validation |
| Auth (JWT) | **jose** | 5.x | RFC-compliant JWT; RS256/HS256; no native deps |
| Background jobs | **BullMQ** | 5.x | Redis-backed; TypeScript-native; reliable queue |
| Testing | **Vitest** | 2.x | Fast; ESM-native; TypeScript-native |
| Linting | **ESLint** + **Prettier** | — | Team standard config |

### 6.2 Python SDK (Phase 1 Data Plane)

| Component | Technology | Version | Rationale |
|---|---|---|---|
| Language | **Python** | 3.11+ | Agent developer ecosystem standard |
| HTTP client | **httpx** | 0.27+ | Async-capable; modern API; retry support |
| LangChain integration | **langchain-core** | 0.2.x / 0.3.x | BaseCallbackHandler interface (stable) |
| OpenAI integration | **openai** | 1.x | Official SDK; function calling support |
| Schema validation | **pydantic** | 2.x | Python standard for data validation |
| Async threading | **threading** (stdlib) | — | Background daemon threads for buffer + kill switch watcher; avoids async event loop dependency for developer convenience |
| Test coverage | **pytest** + **pytest-asyncio** | — | Standard Python testing |

### 6.3 Frontend (Dashboard)

| Component | Technology | Rationale |
|---|---|---|
| Framework | **Next.js** | 14 (App Router) | React 18; server components; streaming |
| UI library | **shadcn/ui** | — | Accessible; Tailwind-based; composable |
| Real-time | **WebSocket** (native) | — | Dashboard activity feed; kill switch status |
| Data fetching | **SWR** | — | Stale-while-revalidate; simple; cache |
| Charts | **Recharts** | — | React-native charting; risk score visualisation |

### 6.4 Infrastructure (Phase 1 SaaS — AWS)

| Component | Technology | Notes |
|---|---|---|
| Compute | **AWS ECS Fargate** | Simpler than EKS for Phase 1; move to EKS in Phase 2 |
| Database | **AWS RDS PostgreSQL 16** | Multi-AZ; automated backups; slow query log enabled |
| Cache | **AWS ElastiCache Redis 7** | Sentinel mode; 3-node for HA |
| Storage | **AWS S3** | Forensic blobs; policy YAML; exported logs |
| CDN / WAF | **AWS CloudFront + WAF** | DDoS; rate limiting at edge |
| Secrets | **AWS Secrets Manager** | Rotated DB credentials; API key storage (hashed) |
| CI/CD | **GitHub Actions** | Build; test; deploy to ECS |
| Observability | **OpenTelemetry → Datadog** | Traces, metrics, logs; single pane |
| Email (alerts) | **AWS SES** | HITL gate notifications; alert emails |

### 6.5 Named Exports, Type-Only Imports (Team Standard)

All TypeScript modules follow the team convention:

```typescript
// ✅ Correct: named exports, type-only imports
export { PolicyService }         from './policy.service.ts';
export { AgentService  }         from './agent.service.ts';
export type { ServiceContext }   from './base.service.ts';
export type { PolicyBundle }     from '../schemas/policy.schema.ts';

// ❌ Never: default exports, value imports for type-only usage
export default PolicyService;    // Not allowed
import { PolicyBundle } from ...; // Should be: import type { PolicyBundle }
```

---

## 7. Security of AgentGuard Itself

We are a security product. If AgentGuard is compromised, we compromise every customer using it. This section is non-negotiable and applies to Phase 1.

### 7.1 Application Security

- **Input validation:** Every API endpoint validates all inputs with Zod schemas before any processing. TypeScript strict mode — no implicit `any`. Unknown Zod keys stripped by default.
- **SQL injection prevention:** Prisma ORM with parameterised queries throughout. No raw query string concatenation. Explicit `$queryRaw` calls reviewed in PR.
- **Authentication:** All human-facing APIs require JWT (RS256, 1-hour expiry). Agent SDK authenticates with API keys (hashed in DB with bcrypt, never stored plaintext). No unauthenticated endpoints.
- **Rate limiting:** Per-tenant, per-IP, per-API-key limits on all endpoints. Redis sliding window via BullMQ rate limiter.
- **SSRF prevention:** Webhook URL registration validated against allowlist of schemes (https only) and blocked private IP ranges.
- **Audit log integrity:** `AuditEvent` records include hash-chain field (SHA-256). Audit records are never updated after insertion. Tampering produces a broken chain detectable by the `verify_audit_chain` endpoint.
- **Secrets management:** No secrets in source code, environment variables (in plaintext), or Helm values. AWS Secrets Manager for all credentials. DB password auto-rotated every 7 days.

### 7.2 Tenant Data Isolation (Defence in Depth)

```
Layer 1: JWT claims    — tenantId extracted from token, validated on every request
Layer 2: ServiceContext — tenantId flows through every BaseService DB query
Layer 3: PostgreSQL RLS — SET LOCAL app.current_tenant_id enforced by middleware
Layer 4: API keys      — scoped to tenantId at issuance; cannot cross-tenant
Layer 5: S3 paths      — bucket policy requires tenant/{tenantId}/ prefix match
Layer 6: Redis keys    — namespaced with tenantId; no cross-namespace access
```

Integration tests explicitly verify cross-tenant isolation: a request with Tenant A's JWT must not return Tenant B's data, even with a manipulated body `tenantId`.

### 7.3 Compliance of AgentGuard Itself (Phase 1 Targets)

- **SOC 2 Type II:** Audit programme initiated in Month 3; audit window opens Month 6. AgentGuard monitors its own internal agents (eats own dog food).
- **Penetration testing:** Quarterly third-party pentest from Month 6. Results published in customer-facing security page.
- **Vulnerability disclosure:** security@agentguard.io, PGP key published. 90-day responsible disclosure. HackerOne private program launched at OSS release.
- **Incident disclosure policy:** Immediate notification to affected customers for data incidents. Public post-mortem within 30 days of any P0 resolution.

---

## 8. API Design — Phase 1

### 8.1 API Surface Overview

| Interface | Protocol | Consumers | Auth |
|---|---|---|---|
| Management API | REST (HTTPS) | Dashboard, CLI | JWT (human roles) |
| SDK Ingest API | REST (HTTPS) | Python SDK (telemetry + bundle fetch) | API key (agent) |
| Webhook / Alerting | REST outbound | Slack, PagerDuty, SIEM | HMAC-SHA256 signed |
| Dashboard WebSocket | WSS | Dashboard real-time feed | JWT |
| HITL callback | REST (HTTPS) | Slack interactivity, dashboard | JWT + HMAC |

*Phase 2: gRPC data plane API with mTLS replaces the REST SDK Ingest API for performance and cryptographic identity.*

### 8.2 REST API — Phase 1 Endpoints

Base URL: `https://api.agentguard.io/v1`

All responses: `Content-Type: application/json`
All errors: `{ "error": { "code": string, "message": string, "details"?: unknown } }`
All lists: `{ "data": T[], "pagination": { "cursor": string, "hasMore": boolean } }`

```
── Agents ──────────────────────────────────────────────────
GET    /agents                     List agents (tenant-scoped)
POST   /agents                     Register agent + get API key
GET    /agents/:agentId            Agent detail + current status
PATCH  /agents/:agentId            Update agent config
DELETE /agents/:agentId            Deregister (soft delete)

GET    /agents/:agentId/events     Agent's audit event history
GET    /agents/:agentId/sessions   Agent sessions list
GET    /agents/:agentId/sessions/:sessionId   Full session event chain

── Kill Switch ─────────────────────────────────────────────
POST   /agents/:agentId/kill       Issue kill switch { tier: soft|hard }
POST   /agents/:agentId/resume     Resume after kill/quarantine
GET    /agents/:agentId/kill-status  Current kill switch state

── HITL Gates ──────────────────────────────────────────────
GET    /hitl/pending               Pending approvals (operator role)
GET    /hitl/:gateId               Gate detail (action, context, timeout)
POST   /hitl/:gateId/approve       Approve blocked action
POST   /hitl/:gateId/reject        Reject action
GET    /hitl/:gateId/poll          SDK polling endpoint (long-poll, 10s timeout)

── Policies ────────────────────────────────────────────────
GET    /policies                   List policies
POST   /policies                   Create policy (YAML body or JSON)
GET    /policies/:policyId         Policy detail + compiled metadata
PUT    /policies/:policyId         Replace policy (creates new version)
DELETE /policies/:policyId         Archive policy

GET    /policies/:policyId/versions      Version history
GET    /policies/:policyId/versions/:v   Specific version
POST   /policies/:policyId/activate      Set active version
POST   /policies/:policyId/test          Dry-run against sample action

── SDK Internal (agent API key auth) ───────────────────────
GET    /sdk/bundle                  Fetch compiled policy bundle for agent
POST   /sdk/telemetry/batch         Ingest telemetry batch from SDK
GET    /sdk/kill-switch             Poll kill switch status (long-poll)

── Audit & Events ──────────────────────────────────────────
GET    /events                      Query events (filterable, paginated)
GET    /events/:eventId             Single event detail
POST   /events/export               Request bulk export (async job → S3 presigned URL)

── SIEM Integrations ───────────────────────────────────────
GET    /integrations/siem           List configured SIEM integrations
POST   /integrations/siem/splunk    Configure Splunk HEC endpoint
POST   /integrations/siem/sentinel  Configure Sentinel workspace
DELETE /integrations/siem/:id       Remove integration
POST   /integrations/siem/:id/test  Send test event

── Alerts (webhooks) ───────────────────────────────────────
GET    /alerts/webhooks             List webhooks
POST   /alerts/webhooks             Create webhook (Slack/PagerDuty/custom)
DELETE /alerts/webhooks/:id         Remove webhook
POST   /alerts/webhooks/:id/test    Send test event
```

### 8.3 Zod Schema Example (Input Validation)

```typescript
// schemas/agent.schema.ts
import { z } from 'zod';

export const CreateAgentSchema = z.object({
  name:         z.string().min(1).max(100),
  description:  z.string().max(500).optional(),
  policyId:     z.string().uuid().optional(),
  failBehavior: z.enum(['closed', 'open']).default('closed'),
  riskTier:     z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  metadata:     z.record(z.string(), z.string()).optional(),
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const AgentResponseSchema = z.object({
  id:           z.string().uuid(),
  tenantId:     z.string().uuid(),
  name:         z.string(),
  description:  z.string().nullable(),
  policyId:     z.string().uuid().nullable(),
  failBehavior: z.enum(['closed', 'open']),
  riskTier:     z.enum(['low', 'medium', 'high', 'critical']),
  status:       z.enum(['active', 'killed', 'quarantined', 'inactive']),
  createdAt:    z.string().datetime(),
  updatedAt:    z.string().datetime(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;
```

### 8.4 API SLA Targets — Phase 1

| Endpoint | p50 | p95 | p99 |
|---|---|---|---|
| `GET /sdk/bundle` (cache hit) | 10ms | 25ms | 40ms |
| `GET /sdk/bundle` (cache miss) | 30ms | 60ms | 90ms |
| `POST /sdk/telemetry/batch` | 20ms | 50ms | 80ms |
| `GET /sdk/kill-switch` (long-poll) | up to 10s (long-poll timeout) | — | — |
| Management API reads | 50ms | 150ms | 300ms |
| Management API writes | 80ms | 200ms | 400ms |
| Dashboard WebSocket event latency | < 500ms end-to-end | — | — |

**SDK → total agent overhead p99: < 50ms (policy eval + async telemetry)** — the contractual SLA.

---

## 9. Deployment — Phase 1

### 9.1 SaaS Topology (AWS)

```
Internet
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│  CloudFront + WAF                                                 │
│  - TLS 1.3 termination                                           │
│  - DDoS protection                                               │
│  - Rate limiting at edge                                         │
└──────────────────────────┬───────────────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              │            │                │
     ┌────────▼──────┐  ┌──▼──────────┐  ┌──▼──────────────┐
     │  API Service  │  │  Dashboard  │  │  Background     │
     │  (ECS Fargate)│  │  (Next.js,  │  │  Workers        │
     │  3+ tasks     │  │  ECS Fargate│  │  (ECS Fargate)  │
     │  Node.js      │  │  2+ tasks)  │  │  - SIEM push    │
     └───────┬───────┘  └─────────────┘  │  - Telemetry    │
             │                            │    ingest       │
             │                            └─────────────────┘
             │
    ┌────────┴──────────────────────────────────────────────┐
    │                 AWS Private Subnet                     │
    │                                                        │
    │  ┌─────────────────┐  ┌───────────────┐  ┌─────────┐ │
    │  │  RDS PostgreSQL  │  │ ElastiCache   │  │   S3    │ │
    │  │  (Multi-AZ)      │  │ Redis 7       │  │ Buckets │ │
    │  │  + PgBouncer     │  │ (Sentinel)    │  │         │ │
    │  └─────────────────┘  └───────────────┘  └─────────┘ │
    └────────────────────────────────────────────────────────┘
```

### 9.2 Developer Integration (5-minute setup)

From VISION_AND_SCOPE.md §5 — the 30-minute integration target:

```python
# 1. Install
# pip install agentguard

# 2. LangChain (3 lines of change)
from agentguard import AgentGuard
from langchain.agents import AgentExecutor

ag = AgentGuard(api_key="ag_live_...")   # Set via env: AGENTGUARD_API_KEY

agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    callbacks=[ag.langchain_handler()],   # <- One line added
)

# 3. OpenAI SDK (1 line of change)
from agentguard import AgentGuard
import openai

ag = AgentGuard(api_key="ag_live_...")
client = ag.openai_client()              # <- Replaces openai.OpenAI()
# All client.chat.completions.create() calls are now instrumented
```

---

## 10. Phase 2 / Phase 3 Roadmap (Architectural Intent)

The following capabilities are **explicitly deferred** from Phase 1 per VISION_AND_SCOPE.md §5. They are noted here for architectural continuity — Phase 1 design decisions deliberately preserve migration paths.

### Phase 2 (Months 7–12)

| Capability | Architectural Notes |
|---|---|
| **Multi-agent governance** | Requires cross-agent event correlation. Enabled by adding `parentAgentId` + `orchestrationId` to `AuditEvent`. Correlation engine queries PostgreSQL (or ClickHouse if migrated). |
| **ClickHouse for telemetry at scale** | `AuditEvent` PostgreSQL schema is compatible with ClickHouse MergeTree. ETL pipeline + dual-write during migration window. |
| **NATS JetStream for real-time signals** | Replaces Redis pub/sub and long-polling for kill switch and policy updates. SDK subscribes to NATS stream. |
| **CrewAI, AutoGen, LlamaIndex integrations** | Same SDK architecture; new framework-specific callback/wrapper modules. |
| **ML anomaly detection (rules-based → ML)** | Phase 1 risk scoring is rule-based. Phase 2 introduces River online learning model. ONNX export + in-process inference. Requires 30+ days of telemetry data to train. |
| **Compliance reporting modules** | EU AI Act, HIPAA, DORA report templates. Built on top of Phase 1 audit log. PostgreSQL queries + PDF renderer (Puppeteer). |
| **mTLS agent identity** | Replace API key with Vault-issued short-lived mTLS certificates. SDK handles cert rotation. |
| **On-premises / VPC deployment** | Helm chart for Kubernetes. All dependencies (PostgreSQL, Redis, S3-compatible) customer-managed. Licence validation via offline key. |
| **Additional SIEM integrations** | Chronicle, IBM QRadar, Elastic SIEM. Same pattern as Splunk/Sentinel. |

### Phase 3 (Months 12–24)

| Capability | Architectural Notes |
|---|---|
| **Supply chain security** (SBOM, model version pinning) | Requires agent fingerprinting at registration. Model hash checked on policy update. |
| **MCP (Model Context Protocol) security** | Monitor MCP specification stability before investing. Likely a new integration module alongside LangChain/OpenAI. |
| **Cloud marketplace listings** | AWS Bedrock, Azure AI, GCP Vertex distribution. |
| **Advanced forensic replay** | Session reconstruction with full chain-of-thought. Requires S3 blob storage of full prompt/response pairs (Phase 1 stores only structured summaries). |
| **Red team as a service** | Professional services offering. Needs product and team maturity. |
| **Agent ASPM scoring** | Continuous security posture management for entire agent fleet. Requires multi-agent data at scale. |

---

*Document version: 2.0 — February 2026*
*Owners: CTO, Head of Engineering*
*Revised: aligned to Vision & Scope v1.0, team engineering standards*
*Classification: Confidential — Internal Engineering*