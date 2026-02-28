/**
 * AgentGuard LangChain Wrapper
 *
 * Intercepts LangChain tool calls before execution, enforcing the agent's
 * policy.  Wrap any LangChain StructuredTool (or compatible interface) and
 * the wrapper transparently enforces:
 *
 *   ALLOW  → runs the tool, logs result
 *   DENY   → throws PolicyError.denied, logs attempt
 *   HITL   → emits 'approval-required', awaits human response, logs outcome
 *
 * Usage:
 *   const guardedSearch = AgentGuardToolWrapper.wrap(searchTool, {
 *     ctx, policyEngine, policyId, auditLogger, killSwitch,
 *   });
 *   // Use `guardedSearch` anywhere you'd use `searchTool`
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import { PolicyError } from '@/core/errors.js';
import { AuditLogger } from '@/core/audit-logger.js';
import { KillSwitch } from '@/core/kill-switch.js';
import { PolicyEngine } from '@/core/policy-engine.js';
import type {
  AgentContext,
  Action,
  ApprovalRequest,
  ApprovalStatus,
} from '@/core/types.js';

// ─── LangChain-compatible tool interface ──────────────────────────────────────
// We define a minimal interface so this wrapper doesn't require @langchain/core
// as a hard dependency.  It's structurally compatible with StructuredTool.

export interface LangChainTool {
  name: string;
  description: string;
  /** Execute the tool with the given input */
  invoke(input: Record<string, unknown>): Promise<unknown>;
}

// ─── Wrapper options ──────────────────────────────────────────────────────────

export interface WrapperOptions {
  /** Agent context (agentId, sessionId, policyVersion) */
  ctx: AgentContext;
  /** Shared policy engine instance */
  policyEngine: PolicyEngine;
  /** Policy ID to evaluate actions under */
  policyId: string;
  /** Audit logger — every invocation is recorded */
  auditLogger: AuditLogger;
  /** Kill switch — checked before every call */
  killSwitch: KillSwitch;
  /**
   * Event bus for HITL notifications.
   * The wrapper emits 'approval-required' with an ApprovalRequest;
   * your approval UI should call approvalBus.emit('resolved', resolvedRequest).
   */
  approvalBus?: ApprovalEventBus;
  /**
   * Estimated cost per tool call in USD.
   * Can be a flat number or a per-tool map.
   */
  estimatedCostUsd?: number | Record<string, number>;
}

// ─── Approval event bus ───────────────────────────────────────────────────────

export interface ApprovalEvents {
  'approval-required': ApprovalRequest;
  resolved: ApprovalRequest;
}

export class ApprovalEventBus extends EventEmitter {
  private readonly pending = new Map<string, ApprovalRequest>();

  /** Emit a new approval request and register it as pending. */
  request(req: ApprovalRequest): void {
    this.pending.set(req.id, req);
    this.emit('approval-required', req);
  }

  /**
   * Resolve an approval request (approve or deny).
   * This unblocks any `awaitApproval` calls waiting on the same ID.
   */
  resolve(
    requestId: string,
    status: Exclude<ApprovalStatus, 'pending' | 'timeout'>,
    resolvedBy = 'human',
    resolveReason?: string,
  ): void {
    const req = this.pending.get(requestId);
    if (!req) return;
    const resolved: ApprovalRequest = {
      ...req,
      status,
      resolvedBy,
      resolvedAt: new Date().toISOString(),
      resolveReason,
    };
    this.pending.delete(requestId);
    this.emit('resolved', resolved);
  }

  /** Wait for a specific approval request to be resolved. */
  awaitResolution(requestId: string, timeoutMs: number): Promise<ApprovalRequest> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener('resolved', handler);
        reject(PolicyError.approvalTimeout(requestId));
      }, timeoutMs);

      const handler = (req: ApprovalRequest) => {
        if (req.id !== requestId) return;
        clearTimeout(timer);
        this.removeListener('resolved', handler);
        resolve(req);
      };

      this.on('resolved', handler);
    });
  }

  override on<K extends keyof ApprovalEvents>(
    event: K,
    listener: (data: ApprovalEvents[K]) => void,
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof ApprovalEvents>(
    event: K,
    data: ApprovalEvents[K],
  ): boolean {
    return super.emit(event, data);
  }
}

// ─── Guarded Tool ─────────────────────────────────────────────────────────────

export class GuardedTool implements LangChainTool {
  readonly name: string;
  readonly description: string;

  private readonly inner: LangChainTool;
  private readonly opts: WrapperOptions;

  constructor(tool: LangChainTool, opts: WrapperOptions) {
    this.inner = tool;
    this.opts = opts;
    this.name = tool.name;
    this.description = tool.description;
  }

  /**
   * Intercept a tool invocation:
   * 1. Assert agent is not halted
   * 2. Evaluate action against policy
   * 3. If DENY → throw PolicyError (logged)
   * 4. If HITL → emit approval event, await resolution (logged)
   * 5. If ALLOW → invoke inner tool, log result
   */
  async invoke(input: Record<string, unknown>): Promise<unknown> {
    const { ctx, policyEngine, policyId, auditLogger, killSwitch, approvalBus } = this.opts;

    // ── Kill switch check ─────────────────────────────────────────────────────
    killSwitch.assertNotHalted(ctx.agentId);

    // ── Build action ──────────────────────────────────────────────────────────
    const action: Action = {
      id: randomUUID(),
      agentId: ctx.agentId,
      tool: this.inner.name,
      parameters: input,
      estimatedCostUsd: this._costFor(this.inner.name),
      timestamp: new Date().toISOString(),
    };

    // ── Policy evaluation ─────────────────────────────────────────────────────
    const evaluation = policyEngine.evaluate(action, ctx, policyId);

    // ── Handle DENY ───────────────────────────────────────────────────────────
    if (evaluation.verdict === 'deny') {
      auditLogger.log({ action, ctx, evaluation });
      throw PolicyError.denied(evaluation.reason, {
        tool: action.tool,
        agentId: ctx.agentId,
        matchedRule: evaluation.matchedRule,
        context: evaluation.context,
      });
    }

    // ── Handle HITL ───────────────────────────────────────────────────────────
    if (evaluation.verdict === 'require-approval') {
      if (!approvalBus) {
        // No approval bus configured — fail closed
        auditLogger.log({ action, ctx, evaluation });
        throw PolicyError.requiresApproval(
          `${evaluation.reason} — no approval bus configured, failing closed`,
          { tool: action.tool, agentId: ctx.agentId },
        );
      }

      const timeoutSeconds =
        (evaluation.context?.['timeoutSeconds'] as number | undefined) ?? 300;

      const approvalReq: ApprovalRequest = {
        id: randomUUID(),
        action,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
      };

      auditLogger.log({ action, ctx, evaluation });
      approvalBus.request(approvalReq);

      let resolved: ApprovalRequest;
      try {
        resolved = await approvalBus.awaitResolution(approvalReq.id, timeoutSeconds * 1000);
      } catch (err) {
        // Timeout
        throw err;
      }

      if (resolved.status === 'denied') {
        throw PolicyError.approvalDenied(approvalReq.id, resolved.resolveReason, {
          tool: action.tool,
          agentId: ctx.agentId,
        });
      }

      // Approved — fall through to execution
    }

    // ── Execute the tool ──────────────────────────────────────────────────────
    let result: unknown;
    let toolError: Error | undefined;
    try {
      result = await this.inner.invoke(input);
    } catch (err) {
      toolError = err instanceof Error ? err : new Error(String(err));
    }

    auditLogger.log({ action, ctx, evaluation, result, error: toolError });

    if (toolError) throw toolError;
    return result;
  }

  private _costFor(toolName: string): number | undefined {
    const c = this.opts.estimatedCostUsd;
    if (c === undefined) return undefined;
    if (typeof c === 'number') return c;
    return c[toolName];
  }
}

// ─── Static factory ───────────────────────────────────────────────────────────

/**
 * Wrap a LangChain-compatible tool with AgentGuard policy enforcement.
 *
 * @example
 * const guarded = AgentGuardToolWrapper.wrap(myTool, { ctx, policyEngine, ... });
 * const result = await guarded.invoke({ query: 'Q3 revenue' });
 */
export const AgentGuardToolWrapper = {
  wrap(tool: LangChainTool, opts: WrapperOptions): GuardedTool {
    return new GuardedTool(tool, opts);
  },

  /** Wrap multiple tools at once */
  wrapAll(tools: LangChainTool[], opts: WrapperOptions): GuardedTool[] {
    return tools.map((t) => new GuardedTool(t, opts));
  },
} as const;
