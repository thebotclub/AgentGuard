/**
 * AgentGuard Core Types
 *
 * All types are derived from Zod schemas so runtime validation and static
 * types stay in sync. Schemas align exactly with DATA_MODEL.md and
 * POLICY_ENGINE.md specifications.
 *
 * Import schemas when parsing untrusted input; import inferred types for
 * function signatures.
 */
import { z } from 'zod';

// ─── Policy DSL Condition Schemas ─────────────────────────────────────────────

export const StringConstraintSchema = z
  .object({
    eq: z.union([z.string(), z.number(), z.boolean()]).optional(),
    not_eq: z.union([z.string(), z.number(), z.boolean()]).optional(),
    in: z.array(z.union([z.string(), z.number()])).optional(),
    not_in: z.array(z.union([z.string(), z.number()])).optional(),
    contains: z.string().optional(),
    contains_any: z.array(z.string()).optional(),
    pattern: z.string().optional(),
    regex: z.string().optional(),
    domain_not_in: z.array(z.string()).optional(),
    exists: z.boolean().optional(),
    is_null: z.boolean().optional(),
  })
  .strict();

export type StringConstraint = z.infer<typeof StringConstraintSchema>;

export const NumericConstraintSchema = z
  .object({
    eq: z.union([z.number(), z.boolean()]).optional(),
    not_eq: z.union([z.number(), z.boolean()]).optional(),
    gt: z.number().optional(),
    gte: z.number().optional(),
    lt: z.number().optional(),
    lte: z.number().optional(),
    in: z.array(z.number()).optional(),
    exists: z.boolean().optional(),
  })
  .strict();

export type NumericConstraint = z.infer<typeof NumericConstraintSchema>;

export const ValueConstraintSchema = z.union([
  StringConstraintSchema,
  NumericConstraintSchema,
]);
export type ValueConstraint = z.infer<typeof ValueConstraintSchema>;

export const ToolConditionSchema = z
  .object({
    in: z.array(z.string()).optional(),
    not_in: z.array(z.string()).optional(),
    matches: z.array(z.string()).optional(),
    regex: z.string().optional(),
  })
  .strict();

export type ToolCondition = z.infer<typeof ToolConditionSchema>;

export const DayOfWeekSchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

export const TimeWindowRangeSchema = z.object({
  days: z.array(DayOfWeekSchema),
  hours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
    tz: z.string(),
  }),
});
export type TimeWindowRange = z.infer<typeof TimeWindowRangeSchema>;

export const TimeWindowSchema = z.object({
  within: TimeWindowRangeSchema.optional(),
  outside: TimeWindowRangeSchema.optional(),
});
export type TimeWindow = z.infer<typeof TimeWindowSchema>;

// When conditions — AND logic: all conditions in a rule's `when` array must match
// Simple (leaf) conditions:
const SimpleWhenConditionSchema = z.union([
  z.object({ tool: ToolConditionSchema }),
  z.object({ params: z.record(z.string(), ValueConstraintSchema) }),
  z.object({ context: z.record(z.string(), ValueConstraintSchema) }),
  z.object({ dataClass: z.record(z.string(), ValueConstraintSchema) }),
  z.object({ timeWindow: TimeWindowSchema }),
]);

// Recursive composite conditions: AND / OR / NOT
export const WhenConditionSchema: z.ZodType<WhenCondition> = z.union([
  SimpleWhenConditionSchema,
  z.object({ AND: z.lazy(() => z.array(WhenConditionSchema)) }),
  z.object({ OR: z.lazy(() => z.array(WhenConditionSchema)) }),
  z.object({ NOT: z.lazy(() => WhenConditionSchema) }),
]);

export type WhenCondition =
  | { tool: z.infer<typeof ToolConditionSchema> }
  | { params: Record<string, z.infer<typeof ValueConstraintSchema>> }
  | { context: Record<string, z.infer<typeof ValueConstraintSchema>> }
  | { dataClass: Record<string, z.infer<typeof ValueConstraintSchema>> }
  | { timeWindow: z.infer<typeof TimeWindowSchema> }
  | { AND: WhenCondition[] }
  | { OR: WhenCondition[] }
  | { NOT: WhenCondition };

// ─── Policy Rule ──────────────────────────────────────────────────────────────

export const PolicyActionSchema = z.enum([
  'allow',
  'block',
  'monitor',
  'require_approval',
]);
export type PolicyAction = z.infer<typeof PolicyActionSchema>;

export const RateLimitSchema = z.object({
  maxCalls: z.number().int().positive(),
  windowSeconds: z.number().int().positive(),
  keyBy: z.enum(['session', 'agent', 'tenant', 'tool']).default('session'),
});
export type RateLimit = z.infer<typeof RateLimitSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  priority: z.number().int().min(1).max(1000).default(100),
  action: PolicyActionSchema,
  when: z.array(WhenConditionSchema).min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tags: z.array(z.string()).default([]),
  riskBoost: z.number().int().min(0).max(500).default(0),
  rateLimit: RateLimitSchema.optional(),
  // require_approval specific
  approvers: z.array(z.string()).optional(),
  timeoutSec: z.number().int().positive().optional(),
  on_timeout: z.enum(['block', 'allow']).default('block').optional(),
  slackChannel: z.string().optional(),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

// ─── Policy Budgets ───────────────────────────────────────────────────────────

export const BudgetsSchema = z.object({
  maxTokensPerSession: z.number().int().positive().optional(),
  maxTokensPerDay: z.number().int().positive().optional(),
  maxApiSpendCentsPerDay: z.number().int().positive().optional(),
  maxActionsPerMinute: z.number().int().positive().optional(),
  maxActionsPerSession: z.number().int().positive().optional(),
});
export type Budgets = z.infer<typeof BudgetsSchema>;

// ─── Policy Targets ───────────────────────────────────────────────────────────

export const TargetsSchema = z.object({
  agentTags: z.array(z.string()).optional(),
  agentIds: z.array(z.string()).optional(),
});
export type Targets = z.infer<typeof TargetsSchema>;

// ─── Policy Document (YAML DSL source) ───────────────────────────────────────

export const PolicyDocumentSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver e.g. 1.0.0'),
  tenantId: z.string().optional(), // Set by Control Plane; may not be in user-authored YAML
  default: z.enum(['allow', 'block', 'monitor']).default('monitor'),
  targets: TargetsSchema.optional(),
  budgets: BudgetsSchema.optional(),
  rules: z.array(PolicyRuleSchema).min(0).max(500),
});
export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>;

// ─── Compiled Policy Bundle (served to SDK evaluator) ────────────────────────

export const CompiledRuleSchema = z.object({
  id: z.string(),
  priority: z.number(),
  action: PolicyActionSchema,
  toolCondition: ToolConditionSchema.optional(),
  paramConditions: z.array(z.record(z.string(), ValueConstraintSchema)).default([]),
  contextConditions: z.array(z.record(z.string(), ValueConstraintSchema)).default([]),
  dataClassConditions: z.array(z.record(z.string(), ValueConstraintSchema)).default([]),
  timeConditions: z.array(TimeWindowSchema).default([]),
  compositeConditions: z.array(z.any()).default([]),
  rateLimit: RateLimitSchema.optional(),
  approvers: z.array(z.string()).optional(),
  timeoutSec: z.number().optional(),
  on_timeout: z.enum(['block', 'allow']).optional(),
  severity: z.string(),
  riskBoost: z.number(),
  tags: z.array(z.string()),
});
export type CompiledRule = z.infer<typeof CompiledRuleSchema>;

export const PolicyBundleSchema = z.object({
  policyId: z.string(),
  tenantId: z.string().optional(),
  version: z.string(),
  compiledAt: z.string().datetime(),
  defaultAction: z.enum(['allow', 'block', 'monitor']),
  budgets: BudgetsSchema.optional(),
  rules: z.array(CompiledRuleSchema),
  // Pre-built O(1) tool lookup index: tool name or "*" → array of rule indices
  toolIndex: z.record(z.string(), z.array(z.number())),
  checksum: z.string(),
  ruleCount: z.number().int(),
});
export type PolicyBundle = z.infer<typeof PolicyBundleSchema>;

// ─── Agent Context ────────────────────────────────────────────────────────────

/**
 * Contextual identity flowing through every evaluation call.
 * Keeps evaluations traceable back to a specific agent session and policy version.
 * Aligns with ARCHITECTURE.md ServiceContext pattern (SDK-side variant).
 */
export const AgentContextSchema = z.object({
  /** Stable agent identifier */
  agentId: z.string().min(1),
  /** Session identifier — unique per agent invocation */
  sessionId: z.string().min(1),
  /** Version of the policy active at session start */
  policyVersion: z.string(),
  /** Optional tenant scoping */
  tenantId: z.string().optional(),
  /** Session-level context values (action count, token usage, flags, etc.) */
  sessionContext: z.record(z.string(), z.unknown()).optional(),
});
export type AgentContext = z.infer<typeof AgentContextSchema>;

// ─── Action Request ───────────────────────────────────────────────────────────

export const ActionRequestSchema = z.object({
  /** Unique action ID (UUID generated by caller) */
  id: z.string().uuid(),
  /** Agent performing the action */
  agentId: z.string().min(1),
  /** Tool name being called, e.g. "send_email" or "db:read" */
  tool: z.string().min(1),
  /** Raw parameters passed to the tool */
  params: z.record(z.string(), z.unknown()).default({}),
  /** Data classification labels on the input */
  inputDataLabels: z.array(z.string()).default([]),
  /** ISO 8601 timestamp of when the action was initiated */
  timestamp: z.string().datetime(),
});
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

// ─── Policy Decision (output of evaluator) ────────────────────────────────────

export const PolicyDecisionSchema = z.object({
  result: PolicyActionSchema,
  matchedRuleId: z.string().nullable(),
  /** All monitor rules that matched (accumulate; never terminate) */
  monitorRuleIds: z.array(z.string()),
  /** Composite risk score 0–1000 */
  riskScore: z.number().int().min(0).max(1000),
  reason: z.string().nullable(),
  /** Set when result === 'require_approval' */
  gateId: z.string().uuid().nullable(),
  gateTimeoutSec: z.number().nullable(),
  policyVersion: z.string(),
  evaluatedAt: z.string().datetime(),
  /** Evaluation latency in ms (for SLA tracking) */
  durationMs: z.number(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

// ─── Audit Event ──────────────────────────────────────────────────────────────

/**
 * Immutable audit event — append-only. Aligns with DATA_MODEL.md AuditEvent schema.
 * Hash chain ensures tamper-evidence: each event hashes the previous event's hash.
 */
export const AuditEventSchema = z.object({
  /** Monotonically increasing sequence number for ordering */
  seq: z.number().int().nonnegative(),
  /** ISO 8601 timestamp */
  timestamp: z.string().datetime(),
  agentId: z.string(),
  sessionId: z.string(),
  tenantId: z.string().optional(),
  policyVersion: z.string(),
  /** Tool/action that was attempted */
  tool: z.string(),
  /** Parameters (may be redacted; PII fields replaced with "[REDACTED]") */
  params: z.record(z.string(), z.unknown()).optional(),
  /** Result from the POLICY_ENGINE.md evaluation algorithm */
  decision: PolicyActionSchema,
  matchedRuleId: z.string().nullable(),
  monitorRuleIds: z.array(z.string()),
  riskScore: z.number().int().min(0).max(1000),
  /** Human-readable reason for the decision */
  reason: z.string(),
  /** Evaluation latency in ms */
  durationMs: z.number().nonnegative(),
  /** Return value from the tool (if it ran successfully) */
  result: z.unknown().optional(),
  /** Error message if the tool threw */
  error: z.string().optional(),
  /**
   * SHA-256 hex digest of this entry's content fields.
   * Computed over a canonical subset of fields.
   */
  eventHash: z.string(),
  /**
   * SHA-256 hex digest of the PREVIOUS entry's `eventHash`.
   * First entry uses GENESIS_HASH = '0'.repeat(64).
   */
  previousHash: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

// ─── Kill Switch State ────────────────────────────────────────────────────────

export const KillSwitchStateSchema = z.object({
  /** If true, ALL agents are halted regardless of per-agent settings */
  globalHalt: z.boolean(),
  /** Agent IDs that are individually halted */
  haltedAgents: z.instanceof(Set) as z.ZodType<Set<string>>,
  /** ISO 8601 timestamp when global halt was activated */
  globalHaltAt: z.string().datetime().optional(),
  /** Operator-supplied reason for the global halt */
  globalHaltReason: z.string().optional(),
});
export type KillSwitchState = z.infer<typeof KillSwitchStateSchema>;

// ─── HITL / Approval ─────────────────────────────────────────────────────────

export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'denied', 'timeout']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z.object({
  /** Unique approval request identifier */
  id: z.string().uuid(),
  /** The action awaiting human approval */
  action: ActionRequestSchema,
  /** Agent context */
  agentId: z.string(),
  sessionId: z.string(),
  matchedRuleId: z.string(),
  approvers: z.array(z.string()),
  /** Current lifecycle status */
  status: ApprovalStatusSchema,
  /** ISO 8601 creation timestamp */
  createdAt: z.string().datetime(),
  /** ISO 8601 expiry — after this the request auto-transitions to "timeout" */
  expiresAt: z.string().datetime(),
  /** Identifier of the human who resolved the request */
  resolvedBy: z.string().optional(),
  /** ISO 8601 resolution timestamp */
  resolvedAt: z.string().datetime().optional(),
  /** Reason the human provided when approving or denying */
  resolveReason: z.string().optional(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

// ─── Rate Limit Counter (in-process state) ───────────────────────────────────

export interface RateLimitBucket {
  count: number;
  windowStart: number; // epoch ms
}

// ─── Hash chain constants ─────────────────────────────────────────────────────

export const GENESIS_HASH = '0'.repeat(64);

// ─── Risk score thresholds (from POLICY_ENGINE.md §4.4) ──────────────────────

export const RISK_TIERS = {
  LOW: { min: 0, max: 99 },
  MEDIUM: { min: 100, max: 299 },
  HIGH: { min: 300, max: 599 },
  CRITICAL: { min: 600, max: 1000 },
} as const;

export type RiskTierLabel = keyof typeof RISK_TIERS;

export function getRiskTier(score: number): RiskTierLabel {
  if (score >= RISK_TIERS.CRITICAL.min) return 'CRITICAL';
  if (score >= RISK_TIERS.HIGH.min) return 'HIGH';
  if (score >= RISK_TIERS.MEDIUM.min) return 'MEDIUM';
  return 'LOW';
}

// ─── Base risk scores per decision (from POLICY_ENGINE.md §4.4) ──────────────

export const BASE_RISK_SCORES: Record<PolicyAction, number> = {
  allow: 0,
  monitor: 10,
  block: 50,
  require_approval: 40,
};
