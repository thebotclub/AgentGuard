/**
 * Action evaluation route — POST /v1/actions/evaluate
 * Also handles SDK telemetry batch ingest.
 */
import { Hono } from 'hono';
import { EvaluateActionSchema, TelemetryBatchSchema } from '@agentguard/shared';
import { AuditService } from '../services/audit.js';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
export const actionsRouter = new Hono();
/**
 * POST /v1/actions/evaluate
 * Evaluate an action against the agent's active policy.
 * Used by the SDK for real-time enforcement.
 */
actionsRouter.post('/evaluate', async (c) => {
    const ctx = getContext(c);
    const body = await c.req.json();
    const input = EvaluateActionSchema.parse(body);
    // TODO: Full implementation:
    // 1. Load agent record, verify tenantId matches
    // 2. Load active policy bundle for agent
    // 3. Run PolicyEngine.evaluate(actionRequest, agentCtx, policyId)
    // 4. Create AuditEvent (async)
    // 5. Return PolicyDecision
    // Stub response for scaffold
    return c.json({
        result: 'allow',
        matchedRuleId: null,
        monitorRuleIds: [],
        riskScore: 0,
        reason: 'TODO: Policy engine integration pending',
        gateId: null,
        gateTimeoutSec: null,
        policyVersion: '0.0.0',
        evaluatedAt: new Date().toISOString(),
        durationMs: 0,
    });
});
/**
 * POST /v1/sdk/telemetry/batch
 * Ingest a batch of telemetry events from the SDK.
 */
actionsRouter.post('/telemetry/batch', async (c) => {
    const ctx = getContext(c);
    const body = await c.req.json();
    const input = TelemetryBatchSchema.parse(body);
    const auditService = new AuditService(prisma, ctx);
    const result = await auditService.ingestBatch(input);
    return c.json(result);
});
//# sourceMappingURL=actions.js.map