/**
 * Audit event schemas — aligned with DATA_MODEL.md AuditEvent
 */
import { z } from 'zod';
export const AuditEventSchema = z.object({
    seq: z.number().int().nonnegative(),
    timestamp: z.string().datetime(),
    agentId: z.string(),
    sessionId: z.string(),
    tenantId: z.string().optional(),
    policyVersion: z.string(),
    tool: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
    decision: z.enum(['allow', 'block', 'monitor', 'require_approval']),
    matchedRuleId: z.string().nullable(),
    monitorRuleIds: z.array(z.string()),
    riskScore: z.number().int().min(0).max(1000),
    reason: z.string(),
    durationMs: z.number().nonnegative(),
    result: z.unknown().optional(),
    error: z.string().optional(),
    eventHash: z.string(),
    previousHash: z.string(),
});
/** Query params for GET /v1/audit */
export const QueryAuditEventsSchema = z.object({
    agentId: z.string().optional(),
    sessionId: z.string().optional(),
    decision: z.enum([
        'ALLOW', 'BLOCK', 'MONITOR', 'HITL_PENDING',
        'HITL_APPROVED', 'HITL_REJECTED', 'HITL_TIMEOUT', 'KILLED', 'ERROR',
    ]).optional(),
    riskTier: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    actionType: z.string().optional(),
    toolName: z.string().optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
});
/** Kill switch schemas */
export const IssueKillSwitchSchema = z.object({
    tier: z.enum(['SOFT', 'HARD']),
    reason: z.string().max(500).optional(),
});
/** HITL decision schema */
export const HITLDecisionSchema = z.object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().max(1000).optional(),
});
//# sourceMappingURL=audit.js.map