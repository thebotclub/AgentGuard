/**
 * Audit log routes — GET /v1/audit
 */
import { Hono } from 'hono';
import { QueryAuditEventsSchema } from '@agentguard/shared';
import { AuditService } from '../services/audit.js';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
export const auditRouter = new Hono();
/** GET /v1/audit — query audit events */
auditRouter.get('/', async (c) => {
    const ctx = getContext(c);
    // c.req.queries() returns Record<string, string[]>; flatten to string for each key
    const rawQuery = c.req.queries();
    const flatQuery = {};
    for (const [key, values] of Object.entries(rawQuery)) {
        if (values[0] !== undefined)
            flatQuery[key] = values[0];
    }
    const query = QueryAuditEventsSchema.parse(flatQuery);
    const service = new AuditService(prisma, ctx);
    const events = await service.queryEvents(query);
    return c.json({
        data: events.map(auditEventToResponse),
        pagination: {
            cursor: events.length === query.limit ? (events[events.length - 1]?.id ?? null) : null,
            hasMore: events.length === query.limit,
        },
    });
});
/** GET /v1/audit/:eventId — single event detail */
auditRouter.get('/:eventId', async (c) => {
    const ctx = getContext(c);
    const eventId = c.req.param('eventId');
    const service = new AuditService(prisma, ctx);
    const event = await service.getEvent(eventId);
    return c.json(auditEventToResponse(event));
});
/** GET /v1/audit/sessions/:sessionId/verify — verify hash chain integrity */
auditRouter.get('/sessions/:sessionId/verify', async (c) => {
    const ctx = getContext(c);
    const sessionId = c.req.param('sessionId');
    const service = new AuditService(prisma, ctx);
    const result = await service.verifySessionChain(sessionId);
    return c.json(result);
});
// ─── Helpers ──────────────────────────────────────────────────────────────────
function auditEventToResponse(e) {
    return {
        id: e.id,
        tenantId: e.tenantId,
        agentId: e.agentId,
        sessionId: e.sessionId,
        occurredAt: e.occurredAt.toISOString(),
        processingMs: e.processingMs,
        actionType: e.actionType,
        toolName: e.toolName,
        toolTarget: e.toolTarget,
        policyDecision: e.policyDecision,
        policyId: e.policyId,
        policyVersion: e.policyVersion,
        matchedRuleId: e.matchedRuleId,
        blockReason: e.blockReason,
        riskScore: e.riskScore,
        riskTier: e.riskTier,
        inputDataLabels: e.inputDataLabels,
        outputDataLabels: e.outputDataLabels,
        previousHash: e.previousHash,
        eventHash: e.eventHash,
    };
}
//# sourceMappingURL=audit.js.map