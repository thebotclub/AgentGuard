# AgentGuard — Data Model
## Engineering Document v1.0 — February 2026

---

## Table of Contents

1. [Overview & Database Selection Rationale](#1-overview--database-selection-rationale)
2. [Prisma Schema — Full Definition](#2-prisma-schema--full-definition)
3. [Schema Design Notes — Model by Model](#3-schema-design-notes--model-by-model)
4. [Zod Validation Schemas (API Input)](#4-zod-validation-schemas-api-input)
5. [TypeScript Interfaces (Derived Types)](#5-typescript-interfaces-derived-types)
6. [Multi-Tenant Isolation Patterns](#6-multi-tenant-isolation-patterns)
7. [Indexing Strategy](#7-indexing-strategy)
8. [Audit Log Integrity — Hash Chain](#8-audit-log-integrity--hash-chain)
9. [Phase 2 Data Migration Path](#9-phase-2-data-migration-path)

---

## 1. Overview & Database Selection Rationale

### 1.1 Database Selection: PostgreSQL 16

**Why PostgreSQL — aligned with team standards:**

| Requirement | PostgreSQL Capability |
|---|---|
| **Team standard** | Prisma ORM is our ORM; it pairs with PostgreSQL natively via `@prisma/adapter-pg` |
| **ACID compliance** | Full transaction support; required for audit log integrity and HITL gate state transitions |
| **Multi-tenant isolation** | Row-Level Security (RLS) at the database layer — second enforcement line after application-level `tenantId` filters |
| **JSON support** | `jsonb` for flexible event metadata and policy parameters without separate tables |
| **Full-text search** | `tsvector` / `tsquery` for audit log search (Phase 1 dashboard) without a separate search engine |
| **Scale (Phase 1)** | Up to ~5M `AuditEvent` rows/day per tenant; PostgreSQL handles this on adequate hardware |
| **Connection pooling** | pg adapter + PgBouncer; team standard config |
| **Slow query logging** | `log_min_duration_statement = 1000ms` as per team standard |
| **Operational familiarity** | Team has established patterns, migration tooling, backup procedures |

**Not ClickHouse (Phase 1):** ClickHouse is purpose-built for >100M rows/day analytics queries. At Phase 1 volumes (<500K actions/day per tenant for early design partners), PostgreSQL is more operationally appropriate — it reduces infrastructure complexity and leverages existing team expertise. The schema is designed for a clean migration to ClickHouse in Phase 2 when telemetry volume warrants it (see §9).

**Not MongoDB/DynamoDB:** Relational model is the right fit. Agents, policies, sessions, and audit events have clear relationships. The compliance use case requires queryable, auditable, relational data — not document bags.

### 1.2 Storage Overview (Phase 1)

| Store | What | Why |
|---|---|---|
| **PostgreSQL** | All structured data — agents, policies, audit events, HITL gates, kill switch commands, users, tenants | ACID, relational, team standard |
| **Redis** | Kill switch flags, HITL gate state (real-time), policy bundle cache, rate limit counters | Sub-ms latency; TTL semantics |
| **S3** | Forensic session blobs, policy YAML exports, bulk audit exports, compliance evidence | Cheap durable object storage |
| **BullMQ (Redis-backed)** | SIEM push queue, alert notification queue | Reliable async job processing |

### 1.3 Prisma Configuration

```
// prisma/schema.prisma — datasource and generator blocks

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // directUrl for Prisma Migrate (bypasses PgBouncer in transaction mode)
  directUrl = env("DATABASE_DIRECT_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]  // For PrismaPg adapter (team standard)
}
```

---

## 2. Prisma Schema — Full Definition

```prisma
// prisma/schema.prisma
// AgentGuard — Phase 1 MVP Data Model
// All models: tenantId on every table, composite indexes (tenantId, id)
// PostgreSQL Row-Level Security enabled on all tables (see migration SQL)

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_DIRECT_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

// ─────────────────────────────────────────────────────────────────────
// TENANT
// ─────────────────────────────────────────────────────────────────────

model Tenant {
  id                   String    @id @default(cuid())
  name                 String
  slug                 String    @unique               // URL-safe identifier
  plan                 TenantPlan @default(FREE)
  dataResidencyRegion  String    @default("us-east-1") // For SaaS multi-region
  failBehaviorDefault  FailBehavior @default(CLOSED)   // Org-wide default
  maxAgents            Int       @default(3)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  deletedAt            DateTime? // Soft delete

  // Relations
  users      User[]
  agents     Agent[]
  policies   Policy[]
  auditEvents AuditEvent[]
  siemConfigs SIEMIntegration[]
  webhooks   AlertWebhook[]

  @@index([slug])
}

enum TenantPlan {
  FREE
  TEAM
  BUSINESS
  ENTERPRISE
}

// ─────────────────────────────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────────────────────────────

model User {
  id           String    @id @default(cuid())
  tenantId     String
  email        String
  name         String?
  role         UserRole  @default(ANALYST)
  passwordHash String?   // Null if SSO-only
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime? // Soft delete

  // Relations
  tenant    Tenant  @relation(fields: [tenantId], references: [id])
  // Actions this user has taken (for audit trail)
  killSwitchCommands KillSwitchCommand[]
  hitlDecisions      HITLDecision[]

  @@unique([tenantId, email])
  @@index([tenantId, id])
  @@index([tenantId, email])
}

enum UserRole {
  OWNER     // All operations, billing, member management
  ADMIN     // All security operations, policy management
  ANALYST   // Read-only: events, anomalies
  OPERATOR  // Execute kill switches, approve HITL gates
  AUDITOR   // Read-only: audit logs, compliance exports
  AGENT     // Machine role: SDK authentication only
}

// ─────────────────────────────────────────────────────────────────────
// AGENT
// ─────────────────────────────────────────────────────────────────────

model Agent {
  id             String      @id @default(cuid())
  tenantId       String
  name           String
  description    String?
  status         AgentStatus @default(ACTIVE)
  riskTier       RiskTier    @default(MEDIUM)
  failBehavior   FailBehavior @default(CLOSED)   // Per-agent override
  framework      AgentFramework?                  // LangChain, OpenAI, etc.
  frameworkVersion String?
  tags           String[]    @default([])         // For policy targeting

  // Active policy assignment
  policyId       String?
  policyVersion  String?                          // Pinned version (null = latest)

  // API key auth (Phase 1); mTLS in Phase 2
  apiKeyHash     String      @unique              // bcrypt hash; never store plaintext
  apiKeyPrefix   String                           // First 8 chars for display ("ag_live_abcd1234")
  apiKeyExpiresAt DateTime?

  // Metadata
  metadata       Json?       @db.JsonB            // Arbitrary key-value from registration
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  deletedAt      DateTime?   // Soft delete (deregistered)
  lastSeenAt     DateTime?

  // Relations
  tenant         Tenant      @relation(fields: [tenantId], references: [id])
  policy         Policy?     @relation(fields: [policyId], references: [id])
  auditEvents    AuditEvent[]
  sessions       AgentSession[]
  killSwitchCommands KillSwitchCommand[]
  hitlGates      HITLGate[]

  @@unique([tenantId, id])                        // Composite for RLS
  @@index([tenantId, id])
  @@index([tenantId, status])
  @@index([tenantId, policyId])
  @@index([apiKeyHash])                           // Lookup on auth
}

enum AgentStatus {
  ACTIVE
  KILLED       // Kill switch issued; not accepting actions
  QUARANTINED  // Suspicious activity; held for review
  INACTIVE     // Deregistered by operator
}

enum RiskTier {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum FailBehavior {
  CLOSED  // Block all actions if AgentGuard unreachable (default, safer)
  OPEN    // Allow all actions if AgentGuard unreachable (use with caution)
}

enum AgentFramework {
  LANGCHAIN
  OPENAI_SDK
  CREWAI        // Phase 2
  AUTOGEN       // Phase 2
  LLAMAINDEX    // Phase 2
  CUSTOM
}

// ─────────────────────────────────────────────────────────────────────
// AGENT SESSION
// ─────────────────────────────────────────────────────────────────────

model AgentSession {
  id           String    @id @default(cuid())
  tenantId     String
  agentId      String
  startedAt    DateTime  @default(now())
  endedAt      DateTime?
  actionCount  Int       @default(0)
  blockCount   Int       @default(0)
  tokensUsed   Int       @default(0)
  spendCents   Int       @default(0)
  riskScoreMax Int       @default(0)           // Highest risk score seen in session
  status       SessionStatus @default(ACTIVE)
  metadata     Json?     @db.JsonB             // Framework-specific session context

  // Relations
  agent        Agent     @relation(fields: [agentId], references: [id])
  auditEvents  AuditEvent[]
  hitlGates    HITLGate[]

  @@index([tenantId, id])
  @@index([tenantId, agentId, startedAt(sort: Desc)])
  @@index([tenantId, startedAt(sort: Desc)])
}

enum SessionStatus {
  ACTIVE
  COMPLETED
  KILLED       // Ended by kill switch
  ERROR        // Ended by unhandled error
}

// ─────────────────────────────────────────────────────────────────────
// POLICY
// ─────────────────────────────────────────────────────────────────────

model Policy {
  id             String   @id @default(cuid())
  tenantId       String
  name           String
  description    String?
  activeVersion  String?  // Points to a PolicyVersion.version string
  defaultAction  String   @default("block")    // 'allow' | 'block'
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  // Relations
  tenant    Tenant @relation(fields: [tenantId], references: [id])
  versions  PolicyVersion[]
  agents    Agent[]

  @@unique([tenantId, id])
  @@index([tenantId, id])
  @@index([tenantId, deletedAt])
}

model PolicyVersion {
  id             String   @id @default(cuid())
  tenantId       String
  policyId       String
  version        String                         // Semver string: "1.3.0"
  yamlContent    String   @db.Text             // Raw YAML source (source of truth)
  compiledBundle Json     @db.JsonB            // Compiled PolicyBundle (served to SDK)
  bundleChecksum String                        // SHA-256 of compiledBundle for integrity
  ruleCount      Int
  createdAt      DateTime @default(now())
  createdByUserId String?                      // Who deployed this version
  changelog      String?  @db.Text            // Optional change description

  // Relations
  policy    Policy @relation(fields: [policyId], references: [id])

  @@unique([policyId, version])
  @@index([tenantId, policyId, version])
  @@index([tenantId, policyId, createdAt(sort: Desc)])
}

// ─────────────────────────────────────────────────────────────────────
// AUDIT EVENT
// Core immutable record of every agent action.
// append-only: NO UPDATE or DELETE ever applied after insert.
// ─────────────────────────────────────────────────────────────────────

model AuditEvent {
  id             String   @id @default(cuid())   // UUIDv7 preferred for time-ordering
  tenantId       String
  agentId        String
  sessionId      String

  // Timing
  occurredAt     DateTime @default(now())        // When the action was attempted
  processingMs   Int                             // AgentGuard overhead (SLA tracking)

  // Action
  actionType     ActionType
  toolName       String?                         // Populated for TOOL_CALL actions
  toolTarget     String?                         // URL, table, path — classified/redacted
  actionParams   Json?    @db.JsonB              // Sanitised parameters (PII redacted)
  actionResult   Json?    @db.JsonB              // Sanitised result (populated after execution)
  executionMs    Int?                            // Time for the actual tool call

  // Policy decision
  policyDecision PolicyDecision
  policyId       String?                         // Policy that evaluated (null if no policy)
  policyVersion  String?                         // Version that evaluated
  matchedRuleId  String?                         // Primary matched rule
  matchedRuleIds String[]  @default([])          // All matched rules (including monitor)
  blockReason    String?                         // Human-readable for BLOCK decisions

  // Risk
  riskScore      Int       @default(0)           // 0–1000
  riskTier       RiskTier  @default(LOW)
  anomalyFlags   String[]  @default([])          // Rule-based flag labels

  // Data classification
  inputDataLabels  String[] @default([])         // PII, PHI, PCI, SECRET, etc.
  outputDataLabels String[] @default([])

  // Chain-of-thought capture (stripped to essentials for storage)
  planningTraceSummary  String?                  // Truncated reasoning (max 1KB)
  ragSourceIds          String[] @default([])    // Document IDs used (for RAG agents)
  priorEventIds         String[] @default([])    // Last N event IDs in session

  // Tamper-evident hash chain
  previousHash   String                          // Hash of previous event in session chain
  eventHash      String                          // SHA-256(previousHash + canonical payload)

  // Relations
  tenant         Tenant    @relation(fields: [tenantId], references: [id])
  agent          Agent     @relation(fields: [agentId], references: [id])
  session        AgentSession @relation(fields: [sessionId], references: [id])
  hitlGate       HITLGate? // Set if this event triggered a HITL gate

  @@index([tenantId, id])
  @@index([tenantId, agentId, occurredAt(sort: Desc)])
  @@index([tenantId, sessionId, occurredAt(sort: Asc)])   // Session replay
  @@index([tenantId, occurredAt(sort: Desc)])              // Time-range queries
  @@index([tenantId, policyDecision, occurredAt(sort: Desc)]) // Violation queries
  @@index([tenantId, riskTier, occurredAt(sort: Desc)])    // Risk dashboard
}

enum ActionType {
  TOOL_CALL        // Agent invoked a tool
  LLM_INFERENCE    // Agent made an LLM API call
  MEMORY_READ      // Agent read from memory/vector store
  MEMORY_WRITE     // Agent wrote to memory/vector store
  AGENT_START      // Session started
  AGENT_END        // Session ended
  KILL_SWITCH      // Kill switch applied
  POLICY_CHECK     // Explicit policy check (not tied to action)
}

enum PolicyDecision {
  ALLOW
  BLOCK
  MONITOR          // Allowed with elevated logging
  HITL_PENDING     // Awaiting human approval
  HITL_APPROVED    // Human approved; action proceeded
  HITL_REJECTED    // Human rejected; action blocked
  HITL_TIMEOUT     // HITL gate timed out; applied on_timeout action
  KILLED           // Agent was in kill switch state
  ERROR            // AgentGuard internal error; applied fail_behavior
}

// ─────────────────────────────────────────────────────────────────────
// ANOMALY SCORE
// Rule-based risk scoring in Phase 1.
// Phase 2: populated by ML anomaly detection service.
// Stored separately from AuditEvent to allow async enrichment.
// ─────────────────────────────────────────────────────────────────────

model AnomalyScore {
  id             String   @id @default(cuid())
  tenantId       String
  agentId        String
  auditEventId   String   @unique              // 1:1 with AuditEvent
  sessionId      String

  score          Int                           // 0–1000
  tier           RiskTier
  method         ScoringMethod @default(RULE_BASED)
  flags          String[] @default([])         // Labels: "HIGH_VELOCITY", "UNUSUAL_TOOL", etc.
  details        Json?    @db.JsonB            // Scoring breakdown

  scoredAt       DateTime @default(now())

  @@index([tenantId, agentId, scoredAt(sort: Desc)])
  @@index([tenantId, tier, scoredAt(sort: Desc)])
  @@index([tenantId, auditEventId])
}

enum ScoringMethod {
  RULE_BASED     // Phase 1: deterministic rules
  ML_IFOREST     // Phase 2: Isolation Forest ML model
  COMPOSITE      // Phase 2: weighted combination
}

// ─────────────────────────────────────────────────────────────────────
// KILL SWITCH COMMAND
// ─────────────────────────────────────────────────────────────────────

model KillSwitchCommand {
  id             String   @id @default(cuid())
  tenantId       String
  agentId        String
  tier           KillSwitchTier
  reason         String?
  issuedByUserId String?                     // Null for automated triggers
  issuedAt       DateTime @default(now())
  acknowledgedAt DateTime?                   // When SDK confirmed receipt
  resumedAt      DateTime?                   // When agent was resumed

  // Relations
  agent      Agent @relation(fields: [agentId], references: [id])
  issuedBy   User? @relation(fields: [issuedByUserId], references: [id])

  @@index([tenantId, agentId, issuedAt(sort: Desc)])
  @@index([tenantId, issuedAt(sort: Desc)])
}

enum KillSwitchTier {
  SOFT    // Finish current action, reject new ones
  HARD    // Interrupt immediately
}

// ─────────────────────────────────────────────────────────────────────
// HITL GATE
// Created when a policy decision is HITL_REQUIRED.
// SDK polls for resolution; Dashboard shows pending gates to operators.
// ─────────────────────────────────────────────────────────────────────

model HITLGate {
  id             String   @id @default(cuid())
  tenantId       String
  agentId        String
  sessionId      String
  auditEventId   String?  @unique            // The event that triggered this gate

  // The blocked action (duplicated from AuditEvent for gate display)
  toolName       String?
  toolParams     Json?    @db.JsonB
  matchedRuleId  String

  status         HITLStatus @default(PENDING)
  timeoutAt      DateTime                    // When the gate expires
  onTimeout      String   @default("block")  // 'allow' | 'block'

  // Resolution
  decision       HITLDecision?
  decidedAt      DateTime?
  decidedByUserId String?
  decisionNote   String?

  createdAt      DateTime @default(now())

  // Notifications sent
  notifiedViaSlack  Boolean @default(false)
  notifiedViaEmail  Boolean @default(false)

  // Relations
  agent    Agent        @relation(fields: [agentId], references: [id])
  session  AgentSession @relation(fields: [sessionId], references: [id])
  decidedBy User?       @relation(fields: [decidedByUserId], references: [id])

  @@index([tenantId, status, createdAt(sort: Asc)])    // Pending gates queue
  @@index([tenantId, agentId, createdAt(sort: Desc)])
  @@index([tenantId, id])
}

enum HITLStatus {
  PENDING
  APPROVED
  REJECTED
  TIMED_OUT
  CANCELLED    // Agent killed before decision
}

// Note: HITLDecision is referenced on User model above;
// actual decision data is on HITLGate.status + decidedByUserId.
// The User.hitlDecisions relation is a back-reference for audit purposes.

// ─────────────────────────────────────────────────────────────────────
// SIEM INTEGRATION
// ─────────────────────────────────────────────────────────────────────

model SIEMIntegration {
  id             String    @id @default(cuid())
  tenantId       String
  name           String
  provider       SIEMProvider
  enabled        Boolean   @default(true)
  config         Json      @db.JsonB         // Encrypted connection config (Splunk HEC URL, Sentinel workspace ID, etc.)
  minSeverity    RiskTier  @default(HIGH)    // Only send events at or above this severity
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  lastPushAt     DateTime?
  lastPushStatus String?   // "ok" | error message

  tenant    Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, id])
  @@index([tenantId, provider])
}

enum SIEMProvider {
  SPLUNK
  SENTINEL
  // Phase 2: CHRONICLE, ELASTIC, QRADAR
}

// ─────────────────────────────────────────────────────────────────────
// ALERT WEBHOOK
// ─────────────────────────────────────────────────────────────────────

model AlertWebhook {
  id             String    @id @default(cuid())
  tenantId       String
  name           String
  url            String                      // HTTPS only; validated at creation
  signingSecret String                       // HMAC-SHA256 signing key (stored encrypted)
  events         String[]  @default([])      // Event types to deliver (empty = all)
  enabled        Boolean   @default(true)
  minSeverity    RiskTier  @default(MEDIUM)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  tenant    Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, id])
}
```

---

## 3. Schema Design Notes — Model by Model

### 3.1 Tenant

- `slug` is globally unique (URL-safe identifier for API routes like `api.agentguard.io/v1/` — not exposed in Phase 1 but reserved)
- `failBehaviorDefault` sets the org-wide default; individual agents can override with their own `failBehavior`
- `dataResidencyRegion` drives which AWS region stores this tenant's data — critical for GDPR/EU customers

### 3.2 Agent

**API Key storage pattern:**
- `apiKeyHash`: bcrypt hash of the full key. Never store the plaintext. The plaintext is shown once at creation.
- `apiKeyPrefix`: First 8 chars stored plaintext for human identification in the dashboard ("which key is this?")
- `apiKeyExpiresAt`: Optional expiry; null = no expiry (tenant-configurable)

**Why no separate `AgentCredential` table?** Phase 1 has one key per agent. Phase 2 mTLS will use `AgentCertificate` table with cert chain, fingerprint, and expiry. The separation is a Phase 2 migration.

**`policyVersion` pinning:** Allows an agent to stay on an older policy version while a new version is being tested. `null` = always use the latest active version.

### 3.3 AuditEvent

This is the most important table in the system. Design decisions:

**Append-only semantics:** No `UPDATE` or `DELETE` permitted via the application. Prisma never calls these on `AuditEvent`. The migration SQL includes a PostgreSQL trigger that raises an error on UPDATE/DELETE (defence in depth):

```sql
-- Migration: enforce append-only on audit_events
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: modifications are not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
```

**`actionParams` and `actionResult` as JsonB:** Tool parameters are highly variable. JsonB gives flexibility + indexing capability. PII redaction happens in the SDK before these are sent to the Control Plane — the stored data never contains raw PII.

**`planningTraceSummary`:** Truncated chain-of-thought (max 1KB). Full chain-of-thought is an optional feature where the SDK captures `agent.plan` or LangChain's verbose trace and truncates to a summary. The full text is stored in S3 (Phase 2 forensic replay).

**`eventHash` and `previousHash`:** Tamper-evident chaining. See §8 for full algorithm.

### 3.4 AnomalyScore

Stored separately from `AuditEvent` to allow:
1. **Async enrichment:** Rule-based scoring happens synchronously in the SDK (Phase 1). ML scoring (Phase 2) will run asynchronously as a background enrichment job, updating `AnomalyScore` after the fact without touching the immutable `AuditEvent`.
2. **Score model versioning:** When the scoring model changes, scores can be recomputed without altering the immutable event log.

Phase 1: `AnomalyScore` is created in the same transaction as `AuditEvent` for every event. Method is always `RULE_BASED`.

Phase 2: `AnomalyScore` will be updated asynchronously by the ML service with method `ML_IFOREST` or `COMPOSITE`.

### 3.5 HITLGate

The HITL gate is a short-lived record. Lifecycle:
1. `PENDING`: Created when policy decision is `HITL_REQUIRED`; agent SDK is blocked polling `GET /sdk/hitl-gates/{id}/poll`
2. `APPROVED` / `REJECTED`: Human decides via Dashboard or Slack
3. `TIMED_OUT`: If no decision before `timeoutAt`; `onTimeout` action applied
4. `CANCELLED`: Agent killed before decision was reached

The gate record is NOT deleted after resolution — it forms part of the audit trail.

---

## 4. Zod Validation Schemas (API Input)

These schemas validate all API inputs. `z.infer<typeof Schema>` provides the TypeScript type — no separate type definition needed.

```typescript
// schemas/agent.schema.ts
import { z } from 'zod';

export const CreateAgentSchema = z.object({
  name:           z.string().min(1).max(100).trim(),
  description:    z.string().max(500).optional(),
  policyId:       z.string().min(1).optional(),
  failBehavior:   z.enum(['closed', 'open']).default('closed'),
  riskTier:       z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  framework:      z.enum(['langchain', 'openai_sdk', 'crewai', 'autogen', 'llamaindex', 'custom']).optional(),
  frameworkVersion: z.string().max(20).optional(),
  tags:           z.array(z.string().max(50)).max(20).default([]),
  metadata:       z.record(z.string(), z.string().max(500)).optional(),
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = z.object({
  name:           z.string().min(1).max(100).trim().optional(),
  description:    z.string().max(500).optional(),
  policyId:       z.string().min(1).nullable().optional(),
  policyVersion:  z.string().optional(),
  failBehavior:   z.enum(['closed', 'open']).optional(),
  riskTier:       z.enum(['low', 'medium', 'high', 'critical']).optional(),
  tags:           z.array(z.string().max(50)).max(20).optional(),
  metadata:       z.record(z.string(), z.string().max(500)).optional(),
});

export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;

// ── Policy schemas ──────────────────────────────────────────────────

// schemas/policy.schema.ts
export const CreatePolicySchema = z.object({
  name:         z.string().min(1).max(200).trim(),
  description:  z.string().max(2000).optional(),
  yamlContent:  z.string().min(10).max(200_000),  // Raw YAML (validated by compiler)
  changelog:    z.string().max(1000).optional(),
  activate:     z.boolean().default(false),         // Immediately activate on create
});

export type CreatePolicyInput = z.infer<typeof CreatePolicySchema>;

export const ActivatePolicySchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(), // null = activate latest
});

export const TestPolicySchema = z.object({
  tests: z.array(z.object({
    name:     z.string().min(1).max(200),
    input: z.object({
      tool:      z.string().min(1).max(100),
      params:    z.record(z.string(), z.unknown()).default({}),
      context:   z.record(z.string(), z.unknown()).default({}),
    }),
    expected: z.object({
      decision:     z.enum(['allow', 'block', 'monitor', 'require_approval']),
      matchedRule:  z.string().optional(),
      minRiskScore: z.number().int().min(0).max(1000).optional(),
      maxRiskScore: z.number().int().min(0).max(1000).optional(),
    }),
  })).min(1).max(500),
});

export type TestPolicyInput = z.infer<typeof TestPolicySchema>;

// ── Audit event query schema ────────────────────────────────────────

// schemas/audit-event.schema.ts
export const QueryAuditEventsSchema = z.object({
  agentId:    z.string().optional(),
  sessionId:  z.string().optional(),
  decision:   z.enum(['allow', 'block', 'monitor', 'hitl_pending', 'hitl_approved', 'hitl_rejected', 'killed']).optional(),
  riskTier:   z.enum(['low', 'medium', 'high', 'critical']).optional(),
  actionType: z.string().optional(),
  toolName:   z.string().optional(),
  fromDate:   z.string().datetime().optional(),
  toDate:     z.string().datetime().optional(),
  cursor:     z.string().optional(),
  limit:      z.number().int().min(1).max(500).default(50),
});

export type QueryAuditEventsInput = z.infer<typeof QueryAuditEventsSchema>;

// ── SDK telemetry ingest schema ─────────────────────────────────────

// schemas/telemetry.schema.ts
export const TelemetryBatchSchema = z.object({
  agentId:    z.string().min(1),
  events:     z.array(z.object({
    clientEventId:  z.string().min(1).max(100),  // Client-generated ID for dedup
    sessionId:      z.string().min(1),
    occurredAt:     z.string().datetime(),
    processingMs:   z.number().int().min(0).max(60_000),
    actionType:     z.string().max(50),
    toolName:       z.string().max(200).optional(),
    toolTarget:     z.string().max(500).optional(),
    actionParams:   z.record(z.string(), z.unknown()).optional(),
    decision:       z.string().max(50),
    matchedRuleId:  z.string().max(200).optional(),
    matchedRuleIds: z.array(z.string().max(200)).default([]),
    blockReason:    z.string().max(1000).optional(),
    riskScore:      z.number().int().min(0).max(1000).default(0),
    executionMs:    z.number().int().min(0).optional(),
    policyVersion:  z.string().max(20).optional(),
    inputDataLabels:  z.array(z.string().max(50)).default([]),
    outputDataLabels: z.array(z.string().max(50)).default([]),
    planningTraceSummary: z.string().max(1024).optional(),
    ragSourceIds:   z.array(z.string().max(200)).default([]),
    priorEventIds:  z.array(z.string()).max(10).default([]),
  })).min(1).max(1000),
});

export type TelemetryBatchInput = z.infer<typeof TelemetryBatchSchema>;

// ── Kill switch schema ──────────────────────────────────────────────

// schemas/kill-switch.schema.ts
export const IssueKillSwitchSchema = z.object({
  tier:   z.enum(['soft', 'hard']),
  reason: z.string().max(500).optional(),
});

export type IssueKillSwitchInput = z.infer<typeof IssueKillSwitchSchema>;

// ── HITL gate schemas ───────────────────────────────────────────────

// schemas/hitl.schema.ts
export const HITLDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note:     z.string().max(1000).optional(),
});

export type HITLDecisionInput = z.infer<typeof HITLDecisionSchema>;

// ── SIEM integration schema ─────────────────────────────────────────

// schemas/siem.schema.ts
export const CreateSplunkIntegrationSchema = z.object({
  name:        z.string().min(1).max(100),
  hecUrl:      z.string().url().startsWith('https://'),
  hecToken:    z.string().min(10),
  index:       z.string().default('agentguard'),
  minSeverity: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  enabled:     z.boolean().default(true),
});

export const CreateSentinelIntegrationSchema = z.object({
  name:          z.string().min(1).max(100),
  workspaceId:   z.string().uuid(),
  workspaceKey:  z.string().min(10),               // Primary key (encrypted at rest)
  tableName:     z.string().default('AgentGuardEvents'),
  minSeverity:   z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  enabled:       z.boolean().default(true),
});

// ── Webhook schema ──────────────────────────────────────────────────

export const CreateWebhookSchema = z.object({
  name:         z.string().min(1).max(100),
  url:          z.string().url().startsWith('https://'),
  events:       z.array(z.string()).default([]),
  minSeverity:  z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  enabled:      z.boolean().default(true),
});
```

---

## 5. TypeScript Interfaces (Derived Types)

All TypeScript types for response shapes are derived from Zod schemas where possible, or defined as explicit interfaces for database-sourced data.

```typescript
// types/agent.types.ts
import type { Agent, AgentStatus, RiskTier, FailBehavior, AgentFramework } from '@prisma/client';

// What the API returns for an agent (omits sensitive fields)
export interface AgentResponse {
  id:              string;
  tenantId:        string;
  name:            string;
  description:     string | null;
  status:          AgentStatus;
  riskTier:        RiskTier;
  failBehavior:    FailBehavior;
  framework:       AgentFramework | null;
  frameworkVersion: string | null;
  tags:            string[];
  policyId:        string | null;
  policyVersion:   string | null;
  apiKeyPrefix:    string;           // "ag_live_abcd1234" — prefix only, never full key
  apiKeyExpiresAt: string | null;
  metadata:        Record<string, string> | null;
  createdAt:       string;           // ISO 8601
  updatedAt:       string;
  lastSeenAt:      string | null;
}

// Returned only on agent creation (only time full API key is shown)
export interface AgentCreatedResponse extends AgentResponse {
  apiKey: string;   // Full key: "ag_live_..." — shown ONCE, never stored
}

// ── Audit event response ────────────────────────────────────────────

// types/audit.types.ts
import type { ActionType, PolicyDecision, RiskTier } from '@prisma/client';

export interface AuditEventResponse {
  id:             string;
  tenantId:       string;
  agentId:        string;
  sessionId:      string;
  occurredAt:     string;
  processingMs:   number;
  actionType:     ActionType;
  toolName:       string | null;
  toolTarget:     string | null;      // May be "[redacted]" if sensitive
  policyDecision: PolicyDecision;
  policyId:       string | null;
  policyVersion:  string | null;
  matchedRuleId:  string | null;
  blockReason:    string | null;
  riskScore:      number;
  riskTier:       RiskTier;
  inputDataLabels: string[];
  outputDataLabels: string[];
  // Hash chain fields (for integrity verification)
  previousHash:   string;
  eventHash:      string;
}

export interface AuditSessionResponse {
  sessionId:    string;
  agentId:      string;
  startedAt:    string;
  endedAt:      string | null;
  actionCount:  number;
  blockCount:   number;
  riskScoreMax: number;
  events:       AuditEventResponse[];
}

// ── HITL gate response ──────────────────────────────────────────────

// types/hitl.types.ts
import type { HITLStatus } from '@prisma/client';

export interface HITLGateResponse {
  id:            string;
  tenantId:      string;
  agentId:       string;
  sessionId:     string;
  toolName:      string | null;
  toolParams:    Record<string, unknown> | null;
  matchedRuleId: string;
  status:        HITLStatus;
  timeoutAt:     string;
  onTimeout:     string;
  createdAt:     string;
  decidedAt:     string | null;
  decisionNote:  string | null;
}

// ── Policy response ─────────────────────────────────────────────────

// types/policy.types.ts
export interface PolicyResponse {
  id:            string;
  tenantId:      string;
  name:          string;
  description:   string | null;
  activeVersion: string | null;
  defaultAction: string;
  createdAt:     string;
  updatedAt:     string;
}

export interface PolicyVersionResponse {
  id:            string;
  policyId:      string;
  version:       string;
  ruleCount:     number;
  changelog:     string | null;
  createdAt:     string;
  bundleChecksum: string;
}

// ── SDK API response types ──────────────────────────────────────────

// types/sdk.types.ts
// Returned by GET /sdk/bundle — consumed by Python SDK
export interface PolicyBundleResponse {
  policyId:       string;
  tenantId:       string;
  version:        string;
  compiledAt:     string;
  defaultAction:  'allow' | 'block';
  budgets?: {
    maxTokensPerSession?:    number;
    maxApiSpendCentsPerDay?: number;
    maxActionsPerMinute?:    number;
    maxActionsPerSession?:   number;
  };
  rules:          CompiledRule[];
  toolIndex:      Record<string, number[]>;   // tool_name → [rule_index]
  checksum:       string;
}

export interface CompiledRule {
  id:            string;
  priority:      number;
  action:        'allow' | 'block' | 'monitor' | 'require_approval';
  toolCondition?: ToolCondition;
  paramConditions: ParamCondition[];
  timeConditions:  TimeCondition[];
  rateLimit?:    RateLimitConfig;
  approvers?:    string[];
  timeoutSec?:   number;
  onTimeout?:    'allow' | 'block';
  severity:      string;
  riskBoost:     number;
}

export interface TelemetryBatchResponse {
  accepted:  number;   // Events successfully processed
  rejected:  number;   // Events rejected (validation error)
  errors:    Array<{ clientEventId: string; reason: string }>;
}
```

---

## 6. Multi-Tenant Isolation Patterns

### 6.1 ServiceContext Pattern (Source of Truth for tenantId)

`tenantId` is never taken from the request body. It is always extracted from the validated JWT and injected into `ServiceContext`. Every service method receives a `ServiceContext` and uses `this.ctx.tenantId` for all database operations.

```typescript
// middleware/auth.ts
import { verifyJwt } from '../lib/jwt.ts';
import type { ServiceContext } from '../services/base.service.ts';

export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) throw new UnauthorizedError();

  const claims = await verifyJwt(token);

  // ServiceContext is set once from JWT claims — never from request body
  const ctx: ServiceContext = {
    tenantId: claims.tenantId,    // From JWT — cannot be forged by request body
    userId:   claims.sub,
    role:     claims.role,
    traceId:  c.req.header('X-Trace-Id') ?? crypto.randomUUID(),
  };

  c.set('ctx', ctx);
  await next();
}
```

### 6.2 PostgreSQL Row-Level Security

RLS is a defence-in-depth control. Even if application code omits the `tenantId` filter, the database rejects the query.

```sql
-- Applied in Prisma migration SQL
-- (Prisma doesn't manage RLS natively; added as raw SQL in migration)

-- Enable RLS on all tables
ALTER TABLE "Agent"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HITLGate"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KillSwitchCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnomalyScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SIEMIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlertWebhook" ENABLE ROW LEVEL SECURITY;

-- RLS policy: filter by current_setting (set per-session by app)
CREATE POLICY tenant_isolation ON "Agent"
  USING (tenant_id = current_setting('app.current_tenant_id')::text);

-- (Same policy applied to all tenant-scoped tables)

-- Superuser role bypasses RLS (for migrations and admin tooling)
-- Application role 'agentguard_app' is subject to RLS
```

```typescript
// middleware/tenant-rls.ts
// Set PostgreSQL session-level variable for RLS BEFORE any query

export async function tenantRLSMiddleware(c: Context, next: Next): Promise<void> {
  const ctx = c.get('ctx') as ServiceContext;
  // Use a raw query to set the session variable
  await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true)`;
  await next();
}
```

### 6.3 Prisma Query Pattern — Always Include tenantId

Every Prisma query in a service method must include `tenantId` from `this.ctx.tenantId`. The composite indexes `(tenantId, id)` ensure these are efficient.

```typescript
// services/agent/agent.service.ts — correct pattern

export class AgentService extends BaseService {

  async getAgent(agentId: string): Promise<Agent> {
    return this.db.agent.findUniqueOrThrow({
      where: {
        // Composite unique constraint: tenantId + id
        tenantId_id: {             // ← ALWAYS scope to tenant
          tenantId: this.ctx.tenantId,
          id:       agentId,
        },
      },
    });
  }

  async listAgents(status?: AgentStatus): Promise<Agent[]> {
    return this.db.agent.findMany({
      where: {
        tenantId:  this.ctx.tenantId,   // ← ALWAYS
        status:    status,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take:    100,
    });
  }

  async createAgent(input: CreateAgentInput): Promise<{ agent: Agent; apiKey: string }> {
    this.assertRole('owner', 'admin');

    const apiKey    = generateApiKey();          // "ag_live_..." full key
    const apiKeyHash = await bcrypt.hash(apiKey, 12);
    const apiKeyPrefix = apiKey.slice(0, 16);    // First 16 chars for display

    const agent = await this.db.agent.create({
      data: {
        ...input,
        tenantId:     this.ctx.tenantId,         // ← From ServiceContext
        apiKeyHash,
        apiKeyPrefix,
        status:       'ACTIVE',
      },
    });

    return { agent, apiKey };   // apiKey returned once and never stored
  }
}
```

---

## 7. Indexing Strategy

### 7.1 Index Rationale by Table

**`Agent`**
```
(tenantId, id)          — all single-agent lookups
(tenantId, status)      — dashboard: filter active agents
(tenantId, policyId)    — policy coverage queries
(apiKeyHash)            — SDK authentication (hot path)
```

**`AuditEvent`**
```
(tenantId, id)                          — single event lookup
(tenantId, agentId, occurredAt DESC)    — agent event history (most common query)
(tenantId, sessionId, occurredAt ASC)   — session replay (time-ordered)
(tenantId, occurredAt DESC)             — time-range queries (dashboard)
(tenantId, policyDecision, occurredAt DESC) — violation queries
(tenantId, riskTier, occurredAt DESC)   — risk dashboard
```

**`HITLGate`**
```
(tenantId, status, createdAt ASC)       — pending gates queue (most critical query)
(tenantId, agentId, createdAt DESC)     — agent's gate history
```

**`KillSwitchCommand`**
```
(tenantId, agentId, issuedAt DESC)      — agent kill history
```

### 7.2 Partial Indexes (PostgreSQL-specific)

```sql
-- Partial index: only index non-deleted agents (common filter)
CREATE INDEX idx_agents_active ON "Agent" (tenant_id, id)
  WHERE deleted_at IS NULL;

-- Partial index: only pending HITL gates (small working set)
CREATE INDEX idx_hitl_pending ON "HITLGate" (tenant_id, created_at)
  WHERE status = 'PENDING';

-- Partial index: only non-deleted policies
CREATE INDEX idx_policies_active ON "Policy" (tenant_id, id)
  WHERE deleted_at IS NULL;
```

---

## 8. Audit Log Integrity — Hash Chain

Every `AuditEvent` forms a cryptographic chain within its session. Tampering with any record (deletion, modification) is detectable.

### 8.1 Hash Computation

```typescript
// services/audit/hash-chain.ts
import { createHash } from 'node:crypto';

export interface HashableEvent {
  eventId:    string;
  agentId:    string;
  tenantId:   string;
  occurredAt: string;       // ISO 8601 — must be deterministic
  actionType: string;
  toolName:   string | null;
  decision:   string;
  riskScore:  number;
}

export function computeEventHash(
  previousHash: string,
  event: HashableEvent,
): string {
  // Canonical JSON: keys sorted alphabetically for determinism
  const payload = JSON.stringify(
    Object.fromEntries(
      Object.entries(event).sort(([a], [b]) => a.localeCompare(b))
    )
  );
  return createHash('sha256')
    .update(previousHash + '|' + payload)
    .digest('hex');
}

// First event in a session has no predecessor
export const GENESIS_HASH = '0'.repeat(64);

// For a new session: previousHash = GENESIS_HASH
// For subsequent events: previousHash = previousEvent.eventHash
```

### 8.2 Chain Verification Endpoint

```
GET /events/verify-chain?sessionId={id}

Response:
{
  "sessionId":  "sess_abc123",
  "eventCount": 47,
  "chainValid": true,
  "verifiedAt": "2026-02-28T12:00:00Z"
}

If tampered:
{
  "sessionId":  "sess_abc123",
  "eventCount": 47,
  "chainValid": false,
  "firstBrokenAt": {
    "eventId":   "evt_xyz",
    "position":  23,
    "expected":  "a3f2...",
    "actual":    "b4c1..."
  }
}
```

### 8.3 Chain Verification Algorithm

```typescript
// services/audit/audit.service.ts

async verifySessionChain(sessionId: string): Promise<ChainVerificationResult> {
  const events = await this.db.auditEvent.findMany({
    where:   { sessionId, tenantId: this.ctx.tenantId },
    orderBy: { occurredAt: 'asc' },
    select:  {
      id: true, agentId: true, tenantId: true, occurredAt: true,
      actionType: true, toolName: true, policyDecision: true, riskScore: true,
      previousHash: true, eventHash: true,
    },
  });

  let previousHash = GENESIS_HASH;
  for (const [i, event] of events.entries()) {
    if (event.previousHash !== previousHash) {
      return { chainValid: false, firstBrokenAt: { eventId: event.id, position: i } };
    }
    const expected = computeEventHash(previousHash, {
      eventId:    event.id,
      agentId:    event.agentId,
      tenantId:   event.tenantId,
      occurredAt: event.occurredAt.toISOString(),
      actionType: event.actionType,
      toolName:   event.toolName,
      decision:   event.policyDecision,
      riskScore:  event.riskScore,
    });
    if (event.eventHash !== expected) {
      return { chainValid: false, firstBrokenAt: { eventId: event.id, position: i, expected, actual: event.eventHash } };
    }
    previousHash = event.eventHash;
  }

  return { chainValid: true, eventCount: events.length };
}
```

---

## 9. Phase 2 Data Migration Path

Phase 1 stores all telemetry in PostgreSQL. Phase 2 migrates high-volume telemetry to ClickHouse while keeping structured data in PostgreSQL.

### 9.1 ClickHouse-Compatible AuditEvent Schema

The Prisma `AuditEvent` table maps cleanly to ClickHouse's MergeTree engine. The migration path:

```
Phase 1: PostgreSQL AuditEvent (all data)
         │
Phase 2: Dual-write (write to both PostgreSQL + ClickHouse during migration window)
         │
Phase 2: Read from ClickHouse for analytics/dashboard queries
         │
Phase 2: PostgreSQL AuditEvent TRUNCATED or archived (keep 7-day hot window only)
         │
Phase 3: PostgreSQL keeps only recent 7-day window; ClickHouse is primary

ClickHouse MergeTree equivalent:
CREATE TABLE audit_events (
    id            String,
    tenant_id     String,
    agent_id      String,
    session_id    String,
    occurred_at   DateTime64(6, 'UTC'),
    action_type   LowCardinality(String),
    tool_name     LowCardinality(String),
    tool_target   String,
    decision      LowCardinality(String),
    risk_score    UInt16,
    risk_tier     LowCardinality(String),
    event_hash    String,
    previous_hash String,
    raw_event     String    -- Full JSON for column not modelled above
) ENGINE = MergeTree()
  PARTITION BY (tenant_id, toYYYYMM(occurred_at))
  ORDER BY (tenant_id, agent_id, occurred_at);
```

### 9.2 Phase 2 Schema Additions (Noted, Not Designed)

The following tables will be added in Phase 2 without breaking Phase 1 data:

- `AgentCertificate` — mTLS cert storage (replaces/augments API key model)
- `ComplianceReport` — Generated compliance evidence packages
- `MLModel` — ONNX model version tracking for anomaly detection
- `AgentInteraction` — Cross-agent communication records (multi-agent governance)
- `IncidentPlaybook` + `IncidentExecution` — Automated IR playbook tracking

---

*Document version: 1.0 — February 2026*
*Owner: CTO / Data Architecture Lead*
*Scope: Phase 1 MVP — PostgreSQL primary data model*
*Classification: Confidential — Internal Engineering*
