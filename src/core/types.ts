/**
 * AgentGuard Core Types
 *
 * All types are derived from Zod schemas so runtime validation and static
 * types stay in sync. Import the schemas when you need to parse untrusted
 * input; import the inferred types (re-exported below) for function
 * signatures.
 */
import { z } from 'zod';

// ─── Policy Schema ────────────────────────────────────────────────────────────

export const PolicyVerdictSchema = z.enum(['allow', 'deny', 'require-approval']);
export type PolicyVerdict = z.infer<typeof PolicyVerdictSchema>;

export const ToolPolicySchema = z.object({
  /**
   * Explicit allow list. Supports glob-style wildcards, e.g. "read:*".
   * If present, only listed tools are allowed (unless also in deny list).
   */
  allow: z.array(z.string()).optional(),
  /** Explicit deny list. Takes precedence over allow. */
  deny: z.array(z.string()).optional(),
});
export type ToolPolicy = z.infer<typeof ToolPolicySchema>;

export const DataAccessPolicySchema = z.object({
  /** Permitted data classification levels, e.g. ["public", "internal"] */
  allowedClassifications: z.array(z.string()).optional(),
  /** Labels of specific datasets the agent may read */
  allowedDatasets: z.array(z.string()).optional(),
  /** Labels of datasets the agent may NEVER access */
  deniedDatasets: z.array(z.string()).optional(),
  /** Whether the agent may export / exfiltrate data outside the system */
  allowExport: z.boolean().optional().default(false),
  /** Whether the agent may access PII-classified data */
  allowPII: z.boolean().optional().default(false),
});
export type DataAccessPolicy = z.infer<typeof DataAccessPolicySchema>;

export const RateLimitPolicySchema = z.object({
  /** Max calls per minute, across all tools */
  globalCallsPerMinute: z.number().int().positive().optional(),
  /** Per-tool call-per-minute overrides keyed by tool name */
  perTool: z.record(z.string(), z.number().int().positive()).optional(),
});
export type RateLimitPolicy = z.infer<typeof RateLimitPolicySchema>;

export const SpendingPolicySchema = z.object({
  /** Maximum cumulative spend for this agent's session (USD) */
  maxTotalUsd: z.number().nonnegative().optional(),
  /** Maximum cost allowed for a single action (USD) */
  maxPerActionUsd: z.number().nonnegative().optional(),
  /** ISO 4217 currency code, defaults to "USD" */
  currency: z.string().length(3).optional().default('USD'),
});
export type SpendingPolicy = z.infer<typeof SpendingPolicySchema>;

export const HumanInTheLoopPolicySchema = z.object({
  /** Tool names or glob patterns that always require human approval */
  requireApprovalFor: z.array(z.string()).optional(),
  /** Seconds to wait for human response before auto-denying */
  timeoutSeconds: z.number().int().positive().optional().default(300),
});
export type HumanInTheLoopPolicy = z.infer<typeof HumanInTheLoopPolicySchema>;

export const PolicySchema = z.object({
  /** Machine-readable policy identifier, e.g. "finance-agent-v1" */
  id: z.string().min(1),
  /** Semantic version string */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver e.g. 1.0.0'),
  /** Human-readable description of what this policy governs */
  description: z.string().optional(),
  tools: ToolPolicySchema,
  dataAccess: DataAccessPolicySchema,
  rateLimits: RateLimitPolicySchema.optional(),
  spending: SpendingPolicySchema.optional(),
  humanInTheLoop: HumanInTheLoopPolicySchema.optional(),
  /** Verdict for any action not explicitly matched — defaults to "deny" (safe) */
  defaultAction: PolicyVerdictSchema.optional().default('deny'),
});
export type Policy = z.infer<typeof PolicySchema>;

// ─── Agent ───────────────────────────────────────────────────────────────────

export const AgentSchema = z.object({
  /** Unique stable identifier for this agent instance */
  id: z.string().min(1),
  /** Human-readable display name */
  name: z.string().min(1),
  /** ID of the policy this agent runs under */
  policyId: z.string().min(1),
  /** Arbitrary metadata for auditing / display */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type Agent = z.infer<typeof AgentSchema>;

// ─── AgentContext ─────────────────────────────────────────────────────────────

/**
 * Contextual identity information that flows through every evaluation call.
 * Keeps evaluations traceable back to a specific agent session and policy version.
 */
export const AgentContextSchema = z.object({
  /** Stable agent identifier */
  agentId: z.string().min(1),
  /**
   * Session identifier — unique per agent invocation / conversation thread.
   * Used to scope rate-limit and spend counters.
   */
  sessionId: z.string().min(1),
  /**
   * Version of the policy that was loaded at session start.
   * Captured so audit logs remain accurate even after policy updates.
   */
  policyVersion: z.string(),
});
export type AgentContext = z.infer<typeof AgentContextSchema>;

// ─── Action ──────────────────────────────────────────────────────────────────

export const ActionSchema = z.object({
  /** Unique action ID (UUID generated by caller) */
  id: z.string().uuid(),
  /** Agent performing the action — must match AgentContext.agentId */
  agentId: z.string().min(1),
  /** Tool name being called, e.g. "send_email" or "db:read" */
  tool: z.string().min(1),
  /** Raw parameters passed to the tool (may contain sensitive data) */
  parameters: z.record(z.string(), z.unknown()).optional(),
  /** Data classification hint provided by the calling agent */
  dataClassification: z.string().optional(),
  /** Estimated cost of this action in USD (agent-reported) */
  estimatedCostUsd: z.number().nonnegative().optional(),
  /** ISO 8601 timestamp of when the action was initiated */
  timestamp: z.string().datetime(),
});
export type Action = z.infer<typeof ActionSchema>;

// ─── Evaluation Result ────────────────────────────────────────────────────────

export const EvaluationResultSchema = z.object({
  /** The policy verdict */
  verdict: PolicyVerdictSchema,
  /** Human-readable explanation suitable for logging and error messages */
  reason: z.string(),
  /** Identifier of the specific rule that matched, if any */
  matchedRule: z.string().optional(),
  /**
   * Additional diagnostic context, e.g.:
   *   { currentSpendUsd: 450, limitUsd: 500, remainingUsd: 50 }
   */
  context: z.record(z.string(), z.unknown()).optional(),
  /** Time taken to evaluate the action, in milliseconds */
  latencyMs: z.number().nonnegative(),
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

// ─── Audit Event ─────────────────────────────────────────────────────────────

export const AuditEventSchema = z.object({
  /** Monotonically increasing sequence number for ordering */
  seq: z.number().int().nonnegative(),
  /** ISO 8601 timestamp */
  timestamp: z.string().datetime(),
  /** Agent that attempted the action */
  agentId: z.string(),
  /** Session the action belongs to */
  sessionId: z.string(),
  /** Policy version active when the action was evaluated */
  policyVersion: z.string(),
  /** Tool/action that was attempted */
  tool: z.string(),
  /** Parameters (may be redacted; PII fields replaced with "[REDACTED]") */
  parameters: z.record(z.string(), z.unknown()).optional(),
  /** Verdict from policy evaluation */
  verdict: PolicyVerdictSchema,
  /** Human-readable reason for the verdict */
  reason: z.string(),
  /** Evaluation latency in ms */
  latencyMs: z.number().nonnegative(),
  /** Return value from the tool, if it ran successfully */
  result: z.unknown().optional(),
  /** Error message if the tool threw */
  error: z.string().optional(),
  /**
   * SHA-256 hex digest of this entry's content fields.
   * Computed over: seq + timestamp + agentId + sessionId + tool + verdict + reason
   */
  hash: z.string(),
  /**
   * SHA-256 hex digest of the previous entry's `hash` field.
   * Set to the string "GENESIS" for the very first entry.
   * Forms a hash chain making log tampering detectable.
   */
  chainHash: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

// ─── Kill Switch ─────────────────────────────────────────────────────────────

export const KillSwitchStateSchema = z.object({
  /** If true, ALL agents are halted regardless of per-agent settings */
  globalHalt: z.boolean(),
  /** Agent IDs that are individually halted */
  haltedAgents: z.set(z.string()),
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
  action: ActionSchema,
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
