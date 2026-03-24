/**
 * Action evaluation routes.
 *
 * POST /v1/actions/evaluate      — evaluate action against agent's active policy
 * POST /v1/actions/telemetry/batch — ingest SDK telemetry batch
 */
import { Hono } from 'hono';
import { EvaluateActionSchema, TelemetryBatchSchema } from '@agentguard/shared';
import { PolicyService } from '../services/policy.js';
import { AuditService } from '../services/audit.js';
import { KillSwitchService } from '../services/killswitch.js';
import { HITLService } from '../services/hitl.js';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { ValidationError } from '../lib/errors.js';
import { broadcastToTenant } from './events.js';
import { getDefaultDetector } from '../services/prompt-injection/detector.js';
export const actionsRouter = new Hono();
/**
 * POST /v1/actions/evaluate
 *
 * The core enforcement endpoint used by the SDK.
 * 1. Check kill switch
 * 2. Load agent + active policy bundle (Redis → DB)
 * 3. Evaluate action against policy
 * 4. Log to audit (async, non-blocking on hot path)
 * 5. If require_approval, create HITL gate
 * 6. Return PolicyDecision
 */
actionsRouter.post('/evaluate', async (c) => {
    const ctx = getContext(c);
    const body = await c.req.json();
    const input = EvaluateActionSchema.parse(body);
    const agentId = input.agentId;
    // ── Step 1: Kill switch check ──────────────────────────────────────────────
    const killService = new KillSwitchService(prisma, ctx, redis);
    const killStatus = await killService.getKillStatus(agentId);
    if (killStatus.isKilled) {
        // Log the kill-switch decision asynchronously
        void logKillSwitchEvent(ctx, agentId, input.sessionId ?? `session_${agentId}`);
        return c.json({
            result: 'block',
            matchedRuleId: null,
            monitorRuleIds: [],
            riskScore: 1000,
            reason: `Agent is halted (kill switch: ${killStatus.tier ?? 'unknown'})`,
            gateId: null,
            gateTimeoutSec: null,
            policyVersion: '0.0.0',
            evaluatedAt: new Date().toISOString(),
            durationMs: 0,
            killSwitch: { tier: killStatus.tier, reason: killStatus.reason },
        }, 403);
    }
    // ── Step 2: Load agent + policy bundle ─────────────────────────────────────
    const policyService = new PolicyService(prisma, ctx, redis);
    const bundle = await policyService.getBundleForAgent(agentId);
    if (!bundle) {
        // No policy configured — apply fail-closed default
        const agent = await prisma.agent.findFirst({
            where: { id: agentId, tenantId: ctx.tenantId, deletedAt: null },
            select: { failBehavior: true },
        });
        const defaultDecision = agent?.failBehavior === 'OPEN' ? 'allow' : 'block';
        return c.json({
            result: defaultDecision,
            matchedRuleId: null,
            monitorRuleIds: [],
            riskScore: defaultDecision === 'block' ? 50 : 0,
            reason: defaultDecision === 'block'
                ? 'No policy configured — fail-closed'
                : 'No policy configured — fail-open',
            gateId: null,
            gateTimeoutSec: null,
            policyVersion: '0.0.0',
            evaluatedAt: new Date().toISOString(),
            durationMs: 0,
        });
    }
    // ── Step 3: Prompt Injection Check (pre-policy, if configured) ────────────
    // If the active policy has a prompt_injection check, run it against all
    // string-valued tool params. Injection detected → block immediately or warn.
    let injectionResult = null;
    if (bundle.promptInjectionConfig) {
        const injConfig = bundle.promptInjectionConfig;
        const detector = getDefaultDetector();
        // Collect all string values from tool params for analysis
        const textToAnalyse = [
            input.tool,
            ...Object.values(input.params)
                .filter((v) => typeof v === 'string')
                .filter((s) => s.length > 0),
        ].join('\n');
        injectionResult = detector.detectSync(textToAnalyse, {
            sensitivity: injConfig.sensitivity,
            action: injConfig.action,
            adapters: injConfig.adapters,
        });
        if (injectionResult.detected && injConfig.action === 'block') {
            // Log async and return block immediately
            void logInjectionEvent(ctx, agentId, input.sessionId ?? `session_${agentId}`, input, injectionResult);
            void broadcastToTenant(ctx.tenantId, {
                type: 'audit_event',
                data: {
                    agentId,
                    tool: input.tool,
                    decision: 'block',
                    riskScore: 950,
                    matchedRuleId: `prompt_injection:${injectionResult.triggeredBy.join(',')}`,
                    timestamp: new Date().toISOString(),
                    injectionDetected: true,
                    confidence: injectionResult.confidence,
                },
            });
            return c.json({
                result: 'block',
                matchedRuleId: null,
                monitorRuleIds: [],
                riskScore: Math.min(1000, 700 + injectionResult.confidence * 3),
                reason: `Prompt injection detected (confidence: ${injectionResult.confidence}%, sensitivity: ${injConfig.sensitivity}, triggered by: ${injectionResult.triggeredBy.join(', ')})`,
                gateId: null,
                gateTimeoutSec: null,
                policyVersion: bundle.version,
                evaluatedAt: new Date().toISOString(),
                durationMs: injectionResult.durationMs,
                promptInjection: {
                    detected: true,
                    confidence: injectionResult.confidence,
                    sensitivity: injectionResult.sensitivity,
                    triggeredBy: injectionResult.triggeredBy,
                    topPatterns: injectionResult.builtin.patternMatches.slice(0, 3).map((p) => ({
                        id: p.patternId,
                        category: p.category,
                        description: p.description,
                    })),
                },
            }, 403);
        }
    }
    // ── Step 4: Build action request + agent context ───────────────────────────
    const actionRequest = {
        id: crypto.randomUUID(),
        agentId,
        tool: input.tool,
        params: input.params,
        inputDataLabels: input.inputDataLabels,
        timestamp: new Date().toISOString(),
    };
    const agentCtx = {
        agentId,
        sessionId: input.sessionId ?? `session_${agentId}`,
        policyVersion: bundle.version,
        tenantId: ctx.tenantId,
        sessionContext: input.context,
    };
    // ── Step 5: Evaluate policy rules ─────────────────────────────────────────
    const decision = policyService.evaluate(bundle, actionRequest, agentCtx);
    // ── Step 6: Log to audit (async — non-blocking on hot path) ────────────────
    void logAuditEvent(ctx, agentId, agentCtx.sessionId, input, decision);
    // Broadcast to WebSocket clients
    void broadcastDecision(ctx.tenantId, agentId, input.tool, decision);
    // ── Step 7: Handle require_approval — create HITL gate ────────────────────
    if (decision.result === 'require_approval' && decision.gateId) {
        const hitlService = new HITLService(prisma, ctx, redis);
        await hitlService.createGate({
            agentId,
            sessionId: agentCtx.sessionId,
            toolName: input.tool,
            toolParams: input.params,
            matchedRuleId: decision.matchedRuleId ?? 'unknown',
            timeoutSec: decision.gateTimeoutSec ?? 300,
            onTimeout: 'block',
        });
    }
    return c.json(decision);
});
/**
 * POST /v1/actions/telemetry/batch
 * Ingest a batch of telemetry events from the SDK.
 */
actionsRouter.post('/telemetry/batch', async (c) => {
    const ctx = getContext(c);
    const body = await c.req.json();
    const input = TelemetryBatchSchema.parse(body);
    if (input.events.length === 0) {
        throw new ValidationError({ events: 'Batch must contain at least one event' });
    }
    const auditService = new AuditService(prisma, ctx, redis);
    const result = await auditService.ingestBatch(input);
    return c.json(result);
});
// ─── Async helpers (fire-and-forget) ──────────────────────────────────────────
async function logAuditEvent(ctx, agentId, sessionId, input, decision) {
    try {
        const auditService = new AuditService(prisma, ctx, redis);
        await auditService.ingestBatch({
            agentId,
            events: [{
                    clientEventId: crypto.randomUUID(),
                    sessionId,
                    occurredAt: new Date().toISOString(),
                    processingMs: Math.round(decision.durationMs),
                    actionType: 'TOOL_CALL',
                    toolName: input.tool,
                    actionParams: input.params,
                    decision: decision.result,
                    matchedRuleId: decision.matchedRuleId ?? undefined,
                    matchedRuleIds: decision.monitorRuleIds,
                    blockReason: decision.result === 'block' ? (decision.reason ?? undefined) : undefined,
                    riskScore: decision.riskScore,
                    policyVersion: decision.policyVersion,
                    inputDataLabels: input.inputDataLabels,
                    outputDataLabels: [],
                    ragSourceIds: [],
                    priorEventIds: [],
                }],
        });
    }
    catch {
        // Audit logging failure is non-fatal on the hot path
    }
}
async function logKillSwitchEvent(ctx, agentId, sessionId) {
    try {
        const auditService = new AuditService(prisma, ctx, redis);
        await auditService.ingestBatch({
            agentId,
            events: [{
                    clientEventId: crypto.randomUUID(),
                    sessionId,
                    occurredAt: new Date().toISOString(),
                    processingMs: 0,
                    actionType: 'KILL_SWITCH',
                    decision: 'KILLED',
                    riskScore: 1000,
                    matchedRuleIds: [],
                    inputDataLabels: [],
                    outputDataLabels: [],
                    ragSourceIds: [],
                    priorEventIds: [],
                }],
        });
    }
    catch {
        // Non-fatal
    }
}
async function logInjectionEvent(ctx, agentId, sessionId, input, detection) {
    try {
        const auditService = new AuditService(prisma, ctx, redis);
        await auditService.ingestBatch({
            agentId,
            events: [{
                    clientEventId: crypto.randomUUID(),
                    sessionId,
                    occurredAt: new Date().toISOString(),
                    processingMs: Math.round(detection.durationMs),
                    actionType: 'PROMPT_INJECTION',
                    toolName: input.tool,
                    actionParams: input.params,
                    decision: 'block',
                    blockReason: `Prompt injection detected (confidence: ${detection.confidence}%, triggered by: ${detection.triggeredBy.join(', ')})`,
                    riskScore: Math.min(1000, 700 + detection.confidence * 3),
                    matchedRuleIds: [],
                    inputDataLabels: input.inputDataLabels,
                    outputDataLabels: [],
                    ragSourceIds: [],
                    priorEventIds: [],
                }],
        });
    }
    catch {
        // Non-fatal
    }
}
async function broadcastDecision(tenantId, agentId, tool, decision) {
    void broadcastToTenant(tenantId, {
        type: 'audit_event',
        data: {
            agentId,
            tool,
            decision: decision.result,
            riskScore: decision.riskScore,
            matchedRuleId: decision.matchedRuleId,
            timestamp: new Date().toISOString(),
        },
    });
}
//# sourceMappingURL=actions.js.map