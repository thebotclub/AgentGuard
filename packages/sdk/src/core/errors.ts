/**
 * AgentGuard Error Hierarchy
 *
 * ServiceError/PolicyError factory pattern per ARCHITECTURE.md §3.3.
 * Typed error classes with factory methods for every policy-enforcement outcome.
 * Callers catch a single error type and can switch on `code`.
 */

// ─── ServiceError Base ────────────────────────────────────────────────────────

export class ServiceError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly details: unknown;

  constructor(code: string, message: string, httpStatus: number, details?: unknown) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      details: this.details,
    };
  }
}

// ─── NotFoundError ────────────────────────────────────────────────────────────

export class NotFoundError extends ServiceError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} '${id}' not found`, 404);
    this.name = 'NotFoundError';
  }
}

// ─── ValidationError ──────────────────────────────────────────────────────────

export class ValidationError extends ServiceError {
  constructor(issues: unknown) {
    super('VALIDATION_ERROR', 'Request validation failed', 400, issues);
    this.name = 'ValidationError';
  }
}

// ─── PolicyError ──────────────────────────────────────────────────────────────

export type PolicyErrorCode =
  | 'POLICY_DENIED'
  | 'RATE_LIMITED'
  | 'REQUIRES_APPROVAL'
  | 'SPEND_CAP_EXCEEDED'
  | 'BUDGET_EXCEEDED'
  | 'AGENT_HALTED'
  | 'GLOBAL_HALT'
  | 'POLICY_NOT_FOUND'
  | 'APPROVAL_TIMEOUT'
  | 'APPROVAL_DENIED'
  | 'POLICY_ERROR';

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
export class PolicyError extends ServiceError {
  public readonly policyCode: PolicyErrorCode;
  public readonly policyDetails: PolicyErrorDetails;

  constructor(
    code: PolicyErrorCode,
    message: string,
    httpStatus: number,
    details: PolicyErrorDetails = {},
  ) {
    super(code, message, httpStatus, details);
    this.name = 'PolicyError';
    this.policyCode = code;
    this.policyDetails = details;
    Object.setPrototypeOf(this, PolicyError.prototype);
  }

  // ─── Factory Methods (from ARCHITECTURE.md §3.3) ──────────────────────────

  /**
   * Action was explicitly denied by policy.
   */
  static denied(message: string, details?: PolicyErrorDetails): PolicyError {
    return new PolicyError('POLICY_DENIED', message, 403, details);
  }

  /**
   * Action blocked because the agent exceeded a rate limit.
   * @param retryAfterMs - milliseconds until rate window resets
   */
  static rateLimited(retryAfterMs: number, details?: PolicyErrorDetails): PolicyError {
    return new PolicyError('RATE_LIMITED', 'Rate limit exceeded', 429, {
      ...details,
      retryAfterMs,
    });
  }

  /**
   * Action requires human approval before it can proceed.
   * @param gateId - HITL gate identifier to poll for resolution
   * @param timeoutMs - gate timeout in milliseconds
   */
  static requiresApproval(gateId: string, timeoutMs: number, details?: PolicyErrorDetails): PolicyError {
    return new PolicyError('REQUIRES_APPROVAL', 'Action requires human approval', 202, {
      ...details,
      gateId,
      timeoutMs,
    });
  }

  /**
   * Action would exceed a budget constraint (session action count, API spend, etc.)
   */
  static budgetExceeded(message: string, details?: PolicyErrorDetails): PolicyError {
    return new PolicyError('BUDGET_EXCEEDED', message, 429, details);
  }

  /**
   * This specific agent has been individually halted via the kill switch.
   */
  static agentHalted(agentId: string, details?: PolicyErrorDetails): PolicyError {
    return new PolicyError(
      'AGENT_HALTED',
      `Agent "${agentId}" has been halted by the kill switch`,
      503,
      { ...details, agentId },
    );
  }

  /**
   * The global kill switch is active — no agents may proceed.
   */
  static globalHalt(reason?: string, details?: PolicyErrorDetails): PolicyError {
    const msg = reason
      ? `Global halt active: ${reason}`
      : 'Global halt active — all agents have been stopped';
    return new PolicyError('GLOBAL_HALT', msg, 503, details);
  }

  /**
   * No policy could be found for the requested policy ID.
   */
  static policyNotFound(policyId: string, details?: PolicyErrorDetails): PolicyError {
    return new PolicyError(
      'POLICY_NOT_FOUND',
      `Policy "${policyId}" not found`,
      404,
      details,
    );
  }

  /**
   * A HITL approval request expired before a human responded.
   */
  static approvalTimeout(approvalId: string, details?: PolicyErrorDetails): PolicyError {
    return new PolicyError(
      'APPROVAL_TIMEOUT',
      `Approval request "${approvalId}" timed out waiting for human response`,
      408,
      details,
    );
  }

  /**
   * A human explicitly denied a HITL approval request.
   */
  static approvalDenied(approvalId: string, reason?: string, details?: PolicyErrorDetails): PolicyError {
    const msg = reason
      ? `Approval request "${approvalId}" denied: ${reason}`
      : `Approval request "${approvalId}" was denied by reviewer`;
    return new PolicyError('APPROVAL_DENIED', msg, 403, details);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Returns true if the error represents a temporary block (caller may retry). */
  isRetryable(): boolean {
    return (
      this.policyCode === 'RATE_LIMITED' ||
      this.policyCode === 'BUDGET_EXCEEDED'
    );
  }

  /** Returns true if the error represents a hard security block. */
  isSecurityBlock(): boolean {
    return (
      this.policyCode === 'POLICY_DENIED' ||
      this.policyCode === 'AGENT_HALTED' ||
      this.policyCode === 'GLOBAL_HALT' ||
      this.policyCode === 'SPEND_CAP_EXCEEDED' ||
      this.policyCode === 'APPROVAL_DENIED'
    );
  }

  override toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.policyCode,
      message: this.message,
      httpStatus: this.httpStatus,
      details: this.policyDetails,
    };
  }
}
