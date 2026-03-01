/**
 * Policy Zod schemas — the core DSL types for the policy engine.
 * Extracted from sdk/core/types.ts and POLICY_ENGINE.md §9.
 */
import { z } from 'zod';
// ─── Constraint Schemas ───────────────────────────────────────────────────────
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
export const ValueConstraintSchema = z.union([
    StringConstraintSchema,
    NumericConstraintSchema,
]);
// ─── Tool Condition ───────────────────────────────────────────────────────────
export const ToolConditionSchema = z
    .object({
    in: z.array(z.string()).optional(),
    not_in: z.array(z.string()).optional(),
    matches: z.array(z.string()).optional(),
    regex: z.string().optional(),
})
    .strict();
// ─── Time Window ──────────────────────────────────────────────────────────────
export const DayOfWeekSchema = z.enum([
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
]);
export const TimeWindowRangeSchema = z.object({
    days: z.array(DayOfWeekSchema),
    hours: z.object({
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
        tz: z.string(),
    }),
});
export const TimeWindowSchema = z.object({
    within: TimeWindowRangeSchema.optional(),
    outside: TimeWindowRangeSchema.optional(),
});
// ─── When Conditions ──────────────────────────────────────────────────────────
export const WhenConditionSchema = z.union([
    z.object({ tool: ToolConditionSchema }),
    z.object({ params: z.record(z.string(), ValueConstraintSchema) }),
    z.object({ context: z.record(z.string(), ValueConstraintSchema) }),
    z.object({ dataClass: z.record(z.string(), ValueConstraintSchema) }),
    z.object({ timeWindow: TimeWindowSchema }),
]);
// ─── Policy Rule ──────────────────────────────────────────────────────────────
export const PolicyActionSchema = z.enum([
    'allow',
    'block',
    'monitor',
    'require_approval',
]);
export const RateLimitSchema = z.object({
    maxCalls: z.number().int().positive(),
    windowSeconds: z.number().int().positive(),
    keyBy: z.enum(['session', 'agent', 'tenant', 'tool']).default('session'),
});
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
    approvers: z.array(z.string()).optional(),
    timeoutSec: z.number().int().positive().optional(),
    on_timeout: z.enum(['block', 'allow']).default('block').optional(),
    slackChannel: z.string().optional(),
});
// ─── Policy Budgets ───────────────────────────────────────────────────────────
export const BudgetsSchema = z.object({
    maxTokensPerSession: z.number().int().positive().optional(),
    maxTokensPerDay: z.number().int().positive().optional(),
    maxApiSpendCentsPerDay: z.number().int().positive().optional(),
    maxActionsPerMinute: z.number().int().positive().optional(),
    maxActionsPerSession: z.number().int().positive().optional(),
});
// ─── Policy Targets ───────────────────────────────────────────────────────────
export const TargetsSchema = z.object({
    agentTags: z.array(z.string()).optional(),
    agentIds: z.array(z.string()).optional(),
});
// ─── Policy Document (YAML DSL source) ───────────────────────────────────────
export const PolicyDocumentSchema = z.object({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver e.g. 1.0.0'),
    tenantId: z.string().optional(),
    default: z.enum(['allow', 'block']).default('block'),
    targets: TargetsSchema.optional(),
    budgets: BudgetsSchema.optional(),
    rules: z.array(PolicyRuleSchema).min(0).max(500),
});
// ─── Compiled Rule ────────────────────────────────────────────────────────────
export const CompiledRuleSchema = z.object({
    id: z.string(),
    priority: z.number(),
    action: PolicyActionSchema,
    toolCondition: ToolConditionSchema.optional(),
    paramConditions: z.array(z.record(z.string(), ValueConstraintSchema)).default([]),
    contextConditions: z.array(z.record(z.string(), ValueConstraintSchema)).default([]),
    dataClassConditions: z.array(z.record(z.string(), ValueConstraintSchema)).default([]),
    timeConditions: z.array(TimeWindowSchema).default([]),
    rateLimit: RateLimitSchema.optional(),
    approvers: z.array(z.string()).optional(),
    timeoutSec: z.number().optional(),
    on_timeout: z.enum(['block', 'allow']).optional(),
    severity: z.string(),
    riskBoost: z.number(),
    tags: z.array(z.string()),
});
// ─── Policy Bundle (served to SDK) ───────────────────────────────────────────
export const PolicyBundleSchema = z.object({
    policyId: z.string(),
    tenantId: z.string().optional(),
    version: z.string(),
    compiledAt: z.string().datetime(),
    defaultAction: z.enum(['allow', 'block']),
    budgets: BudgetsSchema.optional(),
    rules: z.array(CompiledRuleSchema),
    toolIndex: z.record(z.string(), z.array(z.number())),
    checksum: z.string(),
    ruleCount: z.number().int(),
});
// ─── Policy Decision ──────────────────────────────────────────────────────────
export const PolicyDecisionSchema = z.object({
    result: PolicyActionSchema,
    matchedRuleId: z.string().nullable(),
    monitorRuleIds: z.array(z.string()),
    riskScore: z.number().int().min(0).max(1000),
    reason: z.string().nullable(),
    gateId: z.string().uuid().nullable(),
    gateTimeoutSec: z.number().nullable(),
    policyVersion: z.string(),
    evaluatedAt: z.string().datetime(),
    durationMs: z.number(),
});
// ─── API Input Schemas ────────────────────────────────────────────────────────
export const CreatePolicySchema = z.object({
    name: z.string().min(1).max(200).trim(),
    description: z.string().max(2000).optional(),
    yamlContent: z.string().min(10).max(200_000),
    changelog: z.string().max(1000).optional(),
    activate: z.boolean().default(false),
});
export const UpdatePolicySchema = z.object({
    name: z.string().min(1).max(200).trim().optional(),
    description: z.string().max(2000).nullable().optional(),
    yamlContent: z.string().min(10).max(200_000).optional(),
    changelog: z.string().max(1000).optional(),
    activate: z.boolean().optional(),
});
export const ActivatePolicyVersionSchema = z.object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
});
export const TestPolicySchema = z.object({
    tests: z.array(z.object({
        name: z.string().min(1).max(200),
        input: z.object({
            tool: z.string().min(1).max(100),
            params: z.record(z.string(), z.unknown()).default({}),
            context: z.record(z.string(), z.unknown()).default({}),
        }),
        expected: z.object({
            decision: PolicyActionSchema,
            matchedRule: z.string().optional(),
            minRiskScore: z.number().int().min(0).max(1000).optional(),
            maxRiskScore: z.number().int().min(0).max(1000).optional(),
        }),
    })).min(1).max(500),
});
//# sourceMappingURL=policy.js.map