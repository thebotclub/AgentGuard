/**
 * AgentGuard PolicyError
 *
 * Typed error class with factory methods for every policy-enforcement
 * outcome. Callers catch a single error type and can switch on `code`.
 */
import type { PolicyVerdict } from '@/core/types.js';

export type PolicyErrorCode =
  | 'DENIED'
  | 'RATE_LIMITED'
  | 'REQUIRES_APPROVAL'
  | 'SPEND_CAP_EXCEEDED'
  | 'AGENT_HALTED'
  | 'GLOBAL_HALT'
  | 'POLICY_NOT_FOUND'
  | 'APPROVAL_TIMEOUT'
  | 'APPROVAL_DENIED';

export interface PolicyErrorMeta {
  /** Tool name that triggered the error */
  tool?: string;
  /** Agent ID the error applies to */
  agentId?: string;
  /** Policy verdict that led to the error, if applicable */
  verdict?: PolicyVerdict;
  /** Matched rule identifier */
  matchedRule?: string;
  /** Arbitrary key-value context (spend amounts, limits, etc.) */
  context?: Record<string, unknown>;
}

export class PolicyError extends Error {
  public readonly code: PolicyErrorCode;
  public readonly meta: PolicyErrorMeta;

  private constructor(code: PolicyErrorCode, message: string, meta: PolicyErrorMeta = {}) {
    super(message);
    this.name = 'PolicyError';
    this.code = code;
    this.meta = meta;
    // Maintains proper prototype chain in transpiled code
    Object.setPrototypeOf(this, new.target.prototype);
  }

  // ─── Factory Methods ───────────────────────────────────────────────────────

  /**
   * Action was explicitly denied by policy.
   * @example PolicyError.denied('tool not in allow list', { tool: 'send_email' })
   */
  static denied(message: string, meta?: PolicyErrorMeta): PolicyError {
    return new PolicyError('DENIED', message, { ...meta, verdict: 'deny' });
  }

  /**
   * Action was blocked because the agent has exceeded its rate limit.
   * @example PolicyError.rateLimited('exceeded 100 calls/min', { tool: 'search', context: { limit: 100 } })
   */
  static rateLimited(message: string, meta?: PolicyErrorMeta): PolicyError {
    return new PolicyError('RATE_LIMITED', message, meta);
  }

  /**
   * Action requires human approval before it can proceed.
   * @example PolicyError.requiresApproval('send_email requires HITL review', { tool: 'send_email' })
   */
  static requiresApproval(message: string, meta?: PolicyErrorMeta): PolicyError {
    return new PolicyError('REQUIRES_APPROVAL', message, { ...meta, verdict: 'require-approval' });
  }

  /**
   * Action would exceed the agent's cumulative or per-action spending cap.
   * @example PolicyError.spendCapExceeded('would exceed $500 session cap', { context: { currentUsd: 490, limitUsd: 500 } })
   */
  static spendCapExceeded(message: string, meta?: PolicyErrorMeta): PolicyError {
    return new PolicyError('SPEND_CAP_EXCEEDED', message, meta);
  }

  /**
   * This specific agent has been individually halted via the kill switch.
   */
  static agentHalted(agentId: string, meta?: PolicyErrorMeta): PolicyError {
    return new PolicyError(
      'AGENT_HALTED',
      `Agent "${agentId}" has been halted by the kill switch`,
      { ...meta, agentId },
    );
  }

  /**
   * The global kill switch is active — no agents may proceed.
   */
  static globalHalt(reason?: string, meta?: PolicyErrorMeta): PolicyError {
    const msg = reason
      ? `Global halt active: ${reason}`
      : 'Global halt active — all agents have been stopped';
    return new PolicyError('GLOBAL_HALT', msg, meta);
  }

  /**
   * No policy could be found for the requested policy ID.
   */
  static policyNotFound(policyId: string, meta?: PolicyErrorMeta): PolicyError {
    return new PolicyError(
      'POLICY_NOT_FOUND',
      `Policy "${policyId}" not found`,
      meta,
    );
  }

  /**
   * A HITL approval request expired before a human responded.
   */
  static approvalTimeout(approvalId: string, meta?: PolicyErrorMeta): PolicyError {
    return new PolicyError(
      'APPROVAL_TIMEOUT',
      `Approval request "${approvalId}" timed out waiting for human response`,
      meta,
    );
  }

  /**
   * A human explicitly denied a HITL approval request.
   */
  static approvalDenied(approvalId: string, reason?: string, meta?: PolicyErrorMeta): PolicyError {
    const msg = reason
      ? `Approval request "${approvalId}" denied: ${reason}`
      : `Approval request "${approvalId}" was denied by reviewer`;
    return new PolicyError('APPROVAL_DENIED', msg, meta);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Returns true if the error represents a temporary block (caller may retry). */
  isRetryable(): boolean {
    return this.code === 'RATE_LIMITED' || this.code === 'APPROVAL_TIMEOUT';
  }

  /** Returns true if the error represents a hard security block. */
  isSecurityBlock(): boolean {
    return (
      this.code === 'DENIED' ||
      this.code === 'AGENT_HALTED' ||
      this.code === 'GLOBAL_HALT' ||
      this.code === 'SPEND_CAP_EXCEEDED' ||
      this.code === 'APPROVAL_DENIED'
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      meta: this.meta,
    };
  }
}
