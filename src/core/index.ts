/**
 * AgentGuard Core — Public API
 *
 * Named exports only. No default exports.
 */
export {
  PolicyEngine,
  PolicyCompiler,
  evalToolCondition,
  evalParamConditions,
  evalValueConstraint,
  evalTimeWindow,
  extractDomain,
} from '@/core/policy-engine.js';

export { AuditLogger, computeEventHash, verifyEventChain } from '@/core/audit-logger.js';
export type { AuditLoggerOptions, LogActionInput, VerificationResult, HashablePayload } from '@/core/audit-logger.js';

export { KillSwitch } from '@/core/kill-switch.js';
export type { KillSwitchTier, HaltEvent, ResumeEvent, KillSwitchEvents } from '@/core/kill-switch.js';

export { ServiceError, PolicyError, NotFoundError, ValidationError } from '@/core/errors.js';
export type { PolicyErrorCode, PolicyErrorDetails } from '@/core/errors.js';

export type {
  // Policy DSL
  PolicyDocument,
  PolicyRule,
  PolicyAction,
  PolicyBundle,
  CompiledRule,
  WhenCondition,
  ToolCondition,
  ValueConstraint,
  StringConstraint,
  NumericConstraint,
  TimeWindow,
  TimeWindowRange,
  DayOfWeek,
  Budgets,
  Targets,
  RateLimit,
  // Agent / context
  AgentContext,
  ActionRequest,
  PolicyDecision,
  // Audit
  AuditEvent,
  KillSwitchState,
  // HITL
  ApprovalStatus,
  ApprovalRequest,
  // Rate limiting
  RateLimitBucket,
  // Risk
  RiskTierLabel,
} from '@/core/types.js';

export {
  PolicyDocumentSchema,
  PolicyRuleSchema,
  PolicyActionSchema,
  PolicyBundleSchema,
  AgentContextSchema,
  ActionRequestSchema,
  PolicyDecisionSchema,
  AuditEventSchema,
  GENESIS_HASH,
  BASE_RISK_SCORES,
  RISK_TIERS,
  getRiskTier,
} from '@/core/types.js';
