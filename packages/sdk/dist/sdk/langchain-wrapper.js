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
export class ApprovalEventBus extends EventEmitter {
    pending = new Map();
    /** Emit a new approval request and register it as pending. */
    request(req) {
        this.pending.set(req.id, req);
        this.emit('approval-required', req);
    }
    /**
     * Resolve an approval request (approve or deny).
     * This unblocks any `awaitResolution` calls waiting on the same ID.
     */
    resolve(requestId, status, resolvedBy = 'human', resolveReason) {
        const req = this.pending.get(requestId);
        if (!req)
            return;
        const resolved = {
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
    awaitResolution(requestId, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off('resolved', handler);
                reject(PolicyError.approvalTimeout(requestId));
            }, timeoutMs);
            const handler = (req) => {
                if (req.id !== requestId)
                    return;
                clearTimeout(timer);
                this.off('resolved', handler);
                resolve(req);
            };
            this.on('resolved', handler);
        });
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    emit(event, data) {
        return super.emit(event, data);
    }
}
// ─── Guarded Tool ─────────────────────────────────────────────────────────────
export class GuardedTool {
    name;
    description;
    inner;
    opts;
    constructor(tool, opts) {
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
    async invoke(input) {
        const { ctx, policyEngine, policyId, auditLogger, killSwitch, approvalBus } = this.opts;
        // ── Step 1: Kill Switch Check ─────────────────────────────────────────
        killSwitch.assertNotHalted(ctx.agentId);
        // ── Step 2: Build ActionRequest ───────────────────────────────────────
        const request = {
            id: randomUUID(),
            agentId: ctx.agentId,
            tool: this.inner.name,
            params: input,
            inputDataLabels: this.opts.inputDataLabels ?? [],
            timestamp: new Date().toISOString(),
        };
        // ── Step 3: Policy Evaluation ─────────────────────────────────────────
        const decision = policyEngine.evaluate(request, ctx, policyId);
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
                throw PolicyError.denied(`${decision.reason ?? 'Action requires approval'} — no approval bus configured, failing closed`, { tool: request.tool, agentId: ctx.agentId });
            }
            const timeoutSec = decision.gateTimeoutSec ?? 300;
            const gateId = decision.gateId ?? randomUUID();
            const approvalReq = {
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
            let resolved;
            try {
                resolved = await approvalBus.awaitResolution(gateId, timeoutSec * 1000);
            }
            catch (err) {
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
        let result;
        let toolError;
        try {
            result = await this.inner.invoke(input);
        }
        catch (err) {
            toolError = err instanceof Error ? err : new Error(String(err));
        }
        // ── Step 5: Log ───────────────────────────────────────────────────────
        auditLogger.log({ request, ctx, decision, result, error: toolError });
        if (toolError)
            throw toolError;
        return result;
    }
    _costFor(toolName) {
        const c = this.opts.estimatedCostCents;
        if (c === undefined)
            return undefined;
        if (typeof c === 'number')
            return c;
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
    wrap(tool, opts) {
        return new GuardedTool(tool, opts);
    },
    /** Wrap multiple tools at once (shared options). */
    wrapAll(tools, opts) {
        return tools.map((t) => new GuardedTool(t, opts));
    },
};
//# sourceMappingURL=langchain-wrapper.js.map