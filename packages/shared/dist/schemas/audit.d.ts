/**
 * Audit event schemas — aligned with DATA_MODEL.md AuditEvent
 */
import { z } from 'zod';
export declare const AuditEventSchema: z.ZodObject<{
    seq: z.ZodNumber;
    timestamp: z.ZodString;
    agentId: z.ZodString;
    sessionId: z.ZodString;
    tenantId: z.ZodOptional<z.ZodString>;
    policyVersion: z.ZodString;
    tool: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    decision: z.ZodEnum<["allow", "block", "monitor", "require_approval"]>;
    matchedRuleId: z.ZodNullable<z.ZodString>;
    monitorRuleIds: z.ZodArray<z.ZodString, "many">;
    riskScore: z.ZodNumber;
    reason: z.ZodString;
    durationMs: z.ZodNumber;
    result: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodString>;
    eventHash: z.ZodString;
    previousHash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    policyVersion: string;
    tool: string;
    matchedRuleId: string | null;
    monitorRuleIds: string[];
    riskScore: number;
    reason: string;
    durationMs: number;
    decision: "allow" | "block" | "monitor" | "require_approval";
    agentId: string;
    timestamp: string;
    sessionId: string;
    seq: number;
    eventHash: string;
    previousHash: string;
    params?: Record<string, unknown> | undefined;
    tenantId?: string | undefined;
    result?: unknown;
    error?: string | undefined;
}, {
    policyVersion: string;
    tool: string;
    matchedRuleId: string | null;
    monitorRuleIds: string[];
    riskScore: number;
    reason: string;
    durationMs: number;
    decision: "allow" | "block" | "monitor" | "require_approval";
    agentId: string;
    timestamp: string;
    sessionId: string;
    seq: number;
    eventHash: string;
    previousHash: string;
    params?: Record<string, unknown> | undefined;
    tenantId?: string | undefined;
    result?: unknown;
    error?: string | undefined;
}>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
/** Query params for GET /v1/audit */
export declare const QueryAuditEventsSchema: z.ZodObject<{
    agentId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
    decision: z.ZodOptional<z.ZodEnum<["ALLOW", "BLOCK", "MONITOR", "HITL_PENDING", "HITL_APPROVED", "HITL_REJECTED", "HITL_TIMEOUT", "KILLED", "ERROR"]>>;
    riskTier: z.ZodOptional<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "CRITICAL"]>>;
    actionType: z.ZodOptional<z.ZodString>;
    toolName: z.ZodOptional<z.ZodString>;
    fromDate: z.ZodOptional<z.ZodString>;
    toDate: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    riskTier?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    cursor?: string | undefined;
    decision?: "KILLED" | "ALLOW" | "BLOCK" | "MONITOR" | "HITL_PENDING" | "HITL_APPROVED" | "HITL_REJECTED" | "HITL_TIMEOUT" | "ERROR" | undefined;
    agentId?: string | undefined;
    sessionId?: string | undefined;
    actionType?: string | undefined;
    toolName?: string | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
}, {
    riskTier?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
    decision?: "KILLED" | "ALLOW" | "BLOCK" | "MONITOR" | "HITL_PENDING" | "HITL_APPROVED" | "HITL_REJECTED" | "HITL_TIMEOUT" | "ERROR" | undefined;
    agentId?: string | undefined;
    sessionId?: string | undefined;
    actionType?: string | undefined;
    toolName?: string | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
}>;
export type QueryAuditEventsInput = z.infer<typeof QueryAuditEventsSchema>;
/** Kill switch schemas */
export declare const IssueKillSwitchSchema: z.ZodObject<{
    tier: z.ZodEnum<["SOFT", "HARD"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    tier: "SOFT" | "HARD";
    reason?: string | undefined;
}, {
    tier: "SOFT" | "HARD";
    reason?: string | undefined;
}>;
export type IssueKillSwitchInput = z.infer<typeof IssueKillSwitchSchema>;
/** HITL decision schema */
export declare const HITLDecisionSchema: z.ZodObject<{
    decision: z.ZodEnum<["approve", "reject"]>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    decision: "approve" | "reject";
    note?: string | undefined;
}, {
    decision: "approve" | "reject";
    note?: string | undefined;
}>;
export type HITLDecisionInput = z.infer<typeof HITLDecisionSchema>;
//# sourceMappingURL=audit.d.ts.map