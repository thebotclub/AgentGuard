/**
 * AgentGuard LangChain Wrapper
 *
 * Intercepts LangChain tool calls before execution, enforcing the agent's
 * policy per ARCHITECTURE.md §4.2 and the evaluation algorithm from
 * POLICY_ENGINE.md §4.
 *
 * Decisions:
 *   ALLOW           → runs the tool, logs result
 *   BLOCK           → throws PolicyError.denied, logs attempt
 *   REQUIRE_APPROVAL → emits 'approval-required', blocks until resolution
 *   MONITOR         → runs the tool, logs with elevated risk flag
 *
 * Usage:
 *   const guarded = AgentGuardToolWrapper.wrap(searchTool, {
 *     ctx, policyEngine, policyId, auditLogger, killSwitch,
 *   });
 *   // Use `guarded` anywhere you'd use `searchTool`
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import { PolicyError } from '../core/errors.js';
import { AuditLogger } from '../core/audit-logger.js';
import { KillSwitch } from '../core/kill-switch.js';
import { PolicyEngine } from '../core/policy-engine.js';
import type {
  AgentContext,
  ActionRequest,
  ApprovalRequest,
  ApprovalStatus,
  PolicyDecision,
} from '../core/types.js';

// ─── LangChain-compatible Tool Interface ─────────────────────────────────────
//
// Structurally compatible with LangChain's StructuredTool.
// We define a minimal interface to avoid requiring @langchain/core as a hard dep.

export interface LangChainTool {
  name: string;
  description: string;
  /** Execute the tool with the given input */
  invoke(input: Record<string, unknown>): Promise<unknown>;
}

// ─── Wrapper Options ──────────────────────────────────────────────────────────

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
   *
   * If not provided, require_approval decisions fail-closed (block).
   */
  approvalBus?: ApprovalEventBus;
  /**
   * Estimated cost per tool call in cents (to match DATA_MODEL.md which uses cents).
   * Can be a flat number or a per-tool map.
   */
  estimatedCostCents?: number | Record<string, number>;
  /**
   * Data classification labels to attach to requests from this wrapper.
   */
  inputDataLabels?: string[];
}

// ─── Approval Event Bus ───────────────────────────────────────────────────────

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
   * This unblocks any `awaitResolution` calls waiting on the same ID.
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
        this.off('resolved', handler);
        reject(PolicyError.approvalTimeout(requestId));
      }, timeoutMs);

      const handler = (req: ApprovalRequest): void => {
        if (req.id !== requestId) return;
        clearTimeout(timer);
        this.off('resolved', handler);
        resolve(req);
      };

      this.on('resolved', handler);
    });
  }

  override on<K extends keyof ApprovalEvents>(
    event: K,
    listener: (data: ApprovalEvents[K]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
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
   * 1. Assert agent is not halted (kill switch check)
   * 2. Build ActionRequest
   * 3. Evaluate against policy
   * 4. Handle decision (block → throw, require_approval → HITL, monitor/allow → execute)
   * 5. Log the audit event
   */
  async invoke(input: Record<string, unknown>): Promise<unknown> {
    const { ctx, policyEngine, policyId, auditLogger, killSwitch, approvalBus } = this.opts;

    // ── Step 1: Kill Switch Check ─────────────────────────────────────────
    killSwitch.assertNotHalted(ctx.agentId);

    // ── Step 2: Build ActionRequest ───────────────────────────────────────
    const request: ActionRequest = {
      id: randomUUID(),
      agentId: ctx.agentId,
      tool: this.inner.name,
      params: input,
      inputDataLabels: this.opts.inputDataLabels ?? [],
      timestamp: new Date().toISOString(),
    };

    // ── Step 3: Policy Evaluation ─────────────────────────────────────────
    const decision: PolicyDecision = policyEngine.evaluate(request, ctx, policyId);

    // ── Step 4: Handle Decision ───────────────────────────────────────────

    if (decision.result === 'block') {
      auditLogger.log({ request, ctx, decision });
      throw PolicyError.denied(decision.reason ?? `Tool "${request.tool}" blocked by policy`, {
        tool: request.tool,
        agentId: ctx.agentId,
        matchedRuleId: decision.matchedRuleId ?? undefined,
      });
    }

    if (decision.result === 'require_approval') {
      if (!approvalBus) {
        // No approval bus — fail closed
        auditLogger.log({ request, ctx, decision });
        throw PolicyError.denied(
          `${decision.reason ?? 'Action requires approval'} — no approval bus configured, failing closed`,
          { tool: request.tool, agentId: ctx.agentId },
        );
      }

      const timeoutSec = decision.gateTimeoutSec ?? 300;
      const gateId = decision.gateId ?? randomUUID();

      const approvalReq: ApprovalRequest = {
        id: gateId,
        action: request,
        agentId: ctx.agentId,
        sessionId: ctx.sessionId,
        matchedRuleId: decision.matchedRuleId ?? 'unknown',
        approvers: [],
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + timeoutSec * 1000).toISOString(),
      };

      auditLogger.log({ request, ctx, decision });
      approvalBus.request(approvalReq);

      let resolved: ApprovalRequest;
      try {
        resolved = await approvalBus.awaitResolution(gateId, timeoutSec * 1000);
      } catch (err) {
        throw err; // Propagate PolicyError.approvalTimeout
      }

      if (resolved.status === 'denied') {
        throw PolicyError.approvalDenied(gateId, resolved.resolveReason, {
          tool: request.tool,
          agentId: ctx.agentId,
        });
      }

      // Approved — fall through to execution
    }

    // ── Execute Tool (allow or monitor decision) ──────────────────────────
    let result: unknown;
    let toolError: Error | undefined;
    try {
      result = await this.inner.invoke(input);
    } catch (err) {
      toolError = err instanceof Error ? err : new Error(String(err));
    }

    // ── Step 5: Log ───────────────────────────────────────────────────────
    auditLogger.log({ request, ctx, decision, result, error: toolError });

    if (toolError) throw toolError;
    return result;
  }

  private _costFor(toolName: string): number | undefined {
    const c = this.opts.estimatedCostCents;
    if (c === undefined) return undefined;
    if (typeof c === 'number') return c;
    return c[toolName];
  }
}

// ─── Static Factory ───────────────────────────────────────────────────────────

/**
 * Wrap a LangChain-compatible tool with AgentGuard policy enforcement.
 *
 * @example
 * const guarded = AgentGuardToolWrapper.wrap(myTool, {
 *   ctx, policyEngine, policyId, auditLogger, killSwitch,
 * });
 * const result = await guarded.invoke({ query: 'Q3 revenue' });
 */
export const AgentGuardToolWrapper = {
  /** Wrap a single tool with AgentGuard policy enforcement. */
  wrap(tool: LangChainTool, opts: WrapperOptions): GuardedTool {
    return new GuardedTool(tool, opts);
  },

  /** Wrap multiple tools at once (shared options). */
  wrapAll(tools: LangChainTool[], opts: WrapperOptions): GuardedTool[] {
    return tools.map((t) => new GuardedTool(t, opts));
  },
} as const;
