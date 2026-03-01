/**
 * AgentGuard — Shared TypeScript types
 * All types are derived from Zod schemas (z.infer) where possible.
 * Re-exported from schema files; this file adds types that are
 * not schema-derived (e.g. response shapes, service interfaces).
 */
export type { PolicyAction, PolicyRule, PolicyDocument, PolicyBundle, CompiledRule, RateLimit, Budgets, Targets, WhenCondition, ToolCondition, StringConstraint, NumericConstraint, ValueConstraint, DayOfWeek, TimeWindow, TimeWindowRange, PolicyDecision, ActionRequest, AgentContext, AuditEvent, } from './schemas/index.js';
export type UserRole = 'owner' | 'admin' | 'analyst' | 'operator' | 'auditor' | 'agent';
export interface ServiceContext {
    readonly tenantId: string;
    readonly userId: string;
    readonly role: UserRole;
    readonly traceId: string;
}
export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        cursor: string | null;
        hasMore: boolean;
        total?: number;
    };
}
export interface ApiError {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}
export interface AgentResponse {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    status: 'ACTIVE' | 'KILLED' | 'QUARANTINED' | 'INACTIVE';
    riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    failBehavior: 'CLOSED' | 'OPEN';
    framework: string | null;
    frameworkVersion: string | null;
    tags: string[];
    policyId: string | null;
    policyVersion: string | null;
    apiKeyPrefix: string;
    apiKeyExpiresAt: string | null;
    metadata: Record<string, string> | null;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string | null;
}
/** Returned only on agent creation — only time full API key is shown */
export interface AgentCreatedResponse extends AgentResponse {
    apiKey: string;
}
export interface PolicyResponse {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    activeVersion: string | null;
    defaultAction: string;
    createdAt: string;
    updatedAt: string;
}
export interface PolicyVersionResponse {
    id: string;
    policyId: string;
    version: string;
    ruleCount: number;
    changelog: string | null;
    createdAt: string;
    bundleChecksum: string;
}
export interface AuditEventResponse {
    id: string;
    tenantId: string;
    agentId: string;
    sessionId: string;
    occurredAt: string;
    processingMs: number;
    actionType: string;
    toolName: string | null;
    toolTarget: string | null;
    policyDecision: string;
    policyId: string | null;
    policyVersion: string | null;
    matchedRuleId: string | null;
    blockReason: string | null;
    riskScore: number;
    riskTier: string;
    inputDataLabels: string[];
    outputDataLabels: string[];
    previousHash: string;
    eventHash: string;
}
export interface HITLGateResponse {
    id: string;
    tenantId: string;
    agentId: string;
    sessionId: string;
    toolName: string | null;
    toolParams: Record<string, unknown> | null;
    matchedRuleId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'TIMED_OUT' | 'CANCELLED';
    timeoutAt: string;
    onTimeout: string;
    createdAt: string;
    decidedAt: string | null;
    decisionNote: string | null;
}
export interface KillSwitchStatusResponse {
    agentId: string;
    isKilled: boolean;
    tier: 'SOFT' | 'HARD' | null;
    issuedAt: string | null;
    reason: string | null;
}
export interface HealthResponse {
    status: 'ok' | 'degraded' | 'down';
    version: string;
    timestamp: string;
    checks: {
        database: 'ok' | 'error';
        redis: 'ok' | 'error';
    };
}
//# sourceMappingURL=types.d.ts.map