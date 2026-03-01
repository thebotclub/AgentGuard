/**
 * AgentGuard Error Hierarchy
 *
 * ServiceError/PolicyError factory pattern per ARCHITECTURE.md §3.3.
 * Typed error classes with factory methods for every policy-enforcement outcome.
 * Callers catch a single error type and can switch on `code`.
 */
export declare class ServiceError extends Error {
    readonly code: string;
    readonly httpStatus: number;
    readonly details: unknown;
    constructor(code: string, message: string, httpStatus: number, details?: unknown);
    toJSON(): Record<string, unknown>;
}
export declare class NotFoundError extends ServiceError {
    constructor(resource: string, id: string);
}
export declare class ValidationError extends ServiceError {
    constructor(issues: unknown);
}
export type PolicyErrorCode = 'POLICY_DENIED' | 'RATE_LIMITED' | 'REQUIRES_APPROVAL' | 'SPEND_CAP_EXCEEDED' | 'BUDGET_EXCEEDED' | 'AGENT_HALTED' | 'GLOBAL_HALT' | 'POLICY_NOT_FOUND' | 'APPROVAL_TIMEOUT' | 'APPROVAL_DENIED' | 'POLICY_ERROR';
export interface PolicyErrorDetails {
    /** Tool name that triggered the error */
    tool?: string;
    /** Agent ID the error applies to */
    agentId?: string;
    /** Matched rule identifier */
    matchedRuleId?: string;
    /** Retry after this many milliseconds (rate limited) */
    retryAfterMs?: number;
    /** HITL gate identifier (requires approval) */
    gateId?: string;
    /** Gate timeout in seconds */
    timeoutMs?: number;
    /** Arbitrary key-value context */
    context?: Record<string, unknown>;
}
/**
 * PolicyError — thrown by the policy engine and SDK wrappers.
 *
 * Factory pattern from ARCHITECTURE.md §3.3:
 *   PolicyError.denied()
 *   PolicyError.rateLimited()
 *   PolicyError.requiresApproval()
 */
export declare class PolicyError extends ServiceError {
    readonly policyCode: PolicyErrorCode;
    readonly policyDetails: PolicyErrorDetails;
    constructor(code: PolicyErrorCode, message: string, httpStatus: number, details?: PolicyErrorDetails);
    /**
     * Action was explicitly denied by policy.
     */
    static denied(message: string, details?: PolicyErrorDetails): PolicyError;
    /**
     * Action blocked because the agent exceeded a rate limit.
     * @param retryAfterMs - milliseconds until rate window resets
     */
    static rateLimited(retryAfterMs: number, details?: PolicyErrorDetails): PolicyError;
    /**
     * Action requires human approval before it can proceed.
     * @param gateId - HITL gate identifier to poll for resolution
     * @param timeoutMs - gate timeout in milliseconds
     */
    static requiresApproval(gateId: string, timeoutMs: number, details?: PolicyErrorDetails): PolicyError;
    /**
     * Action would exceed a budget constraint (session action count, API spend, etc.)
     */
    static budgetExceeded(message: string, details?: PolicyErrorDetails): PolicyError;
    /**
     * This specific agent has been individually halted via the kill switch.
     */
    static agentHalted(agentId: string, details?: PolicyErrorDetails): PolicyError;
    /**
     * The global kill switch is active — no agents may proceed.
     */
    static globalHalt(reason?: string, details?: PolicyErrorDetails): PolicyError;
    /**
     * No policy could be found for the requested policy ID.
     */
    static policyNotFound(policyId: string, details?: PolicyErrorDetails): PolicyError;
    /**
     * A HITL approval request expired before a human responded.
     */
    static approvalTimeout(approvalId: string, details?: PolicyErrorDetails): PolicyError;
    /**
     * A human explicitly denied a HITL approval request.
     */
    static approvalDenied(approvalId: string, reason?: string, details?: PolicyErrorDetails): PolicyError;
    /** Returns true if the error represents a temporary block (caller may retry). */
    isRetryable(): boolean;
    /** Returns true if the error represents a hard security block. */
    isSecurityBlock(): boolean;
    toJSON(): Record<string, unknown>;
}
//# sourceMappingURL=errors.d.ts.map