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
import { AuditLogger } from '../core/audit-logger.js';
import { KillSwitch } from '../core/kill-switch.js';
import { PolicyEngine } from '../core/policy-engine.js';
import type { AgentContext, ApprovalRequest, ApprovalStatus } from '../core/types.js';
export interface LangChainTool {
    name: string;
    description: string;
    /** Execute the tool with the given input */
    invoke(input: Record<string, unknown>): Promise<unknown>;
}
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
export interface ApprovalEvents {
    'approval-required': ApprovalRequest;
    resolved: ApprovalRequest;
}
export declare class ApprovalEventBus extends EventEmitter {
    private readonly pending;
    /** Emit a new approval request and register it as pending. */
    request(req: ApprovalRequest): void;
    /**
     * Resolve an approval request (approve or deny).
     * This unblocks any `awaitResolution` calls waiting on the same ID.
     */
    resolve(requestId: string, status: Exclude<ApprovalStatus, 'pending' | 'timeout'>, resolvedBy?: string, resolveReason?: string): void;
    /** Wait for a specific approval request to be resolved. */
    awaitResolution(requestId: string, timeoutMs: number): Promise<ApprovalRequest>;
    on<K extends keyof ApprovalEvents>(event: K, listener: (data: ApprovalEvents[K]) => void): this;
    emit<K extends keyof ApprovalEvents>(event: K, data: ApprovalEvents[K]): boolean;
}
export declare class GuardedTool implements LangChainTool {
    readonly name: string;
    readonly description: string;
    private readonly inner;
    private readonly opts;
    constructor(tool: LangChainTool, opts: WrapperOptions);
    /**
     * Intercept a tool invocation:
     * 1. Assert agent is not halted (kill switch check)
     * 2. Build ActionRequest
     * 3. Evaluate against policy
     * 4. Handle decision (block → throw, require_approval → HITL, monitor/allow → execute)
     * 5. Log the audit event
     */
    invoke(input: Record<string, unknown>): Promise<unknown>;
    private _costFor;
}
/**
 * Wrap a LangChain-compatible tool with AgentGuard policy enforcement.
 *
 * @example
 * const guarded = AgentGuardToolWrapper.wrap(myTool, {
 *   ctx, policyEngine, policyId, auditLogger, killSwitch,
 * });
 * const result = await guarded.invoke({ query: 'Q3 revenue' });
 */
export declare const AgentGuardToolWrapper: {
    /** Wrap a single tool with AgentGuard policy enforcement. */
    readonly wrap: (tool: LangChainTool, opts: WrapperOptions) => GuardedTool;
    /** Wrap multiple tools at once (shared options). */
    readonly wrapAll: (tools: LangChainTool[], opts: WrapperOptions) => GuardedTool[];
};
//# sourceMappingURL=langchain-wrapper.d.ts.map