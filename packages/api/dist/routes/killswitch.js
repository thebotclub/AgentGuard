/**
 * Kill switch routes
 * POST /v1/killswitch/halt/:agentId
 * POST /v1/killswitch/resume/:agentId
 * GET  /v1/killswitch/status/:agentId
 */
import { Hono } from 'hono';
import { IssueKillSwitchSchema } from '@agentguard/shared';
import { KillSwitchService } from '../services/killswitch.js';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
export const killswitchRouter = new Hono();
/** POST /v1/killswitch/halt/:agentId */
killswitchRouter.post('/halt/:agentId', async (c) => {
    const ctx = getContext(c);
    const agentId = c.req.param('agentId');
    const service = new KillSwitchService(prisma, ctx, redis);
    const body = await c.req.json();
    const input = IssueKillSwitchSchema.parse(body);
    const command = await service.issueKill(agentId, input);
    return c.json({
        id: command.id,
        agentId: command.agentId,
        tier: command.tier,
        reason: command.reason,
        issuedAt: command.issuedAt.toISOString(),
    }, 201);
});
/** POST /v1/killswitch/resume/:agentId */
killswitchRouter.post('/resume/:agentId', async (c) => {
    const ctx = getContext(c);
    const agentId = c.req.param('agentId');
    const service = new KillSwitchService(prisma, ctx, redis);
    await service.resumeAgent(agentId);
    return c.json({ success: true, agentId });
});
/** GET /v1/killswitch/status/:agentId */
killswitchRouter.get('/status/:agentId', async (c) => {
    const ctx = getContext(c);
    const agentId = c.req.param('agentId');
    const service = new KillSwitchService(prisma, ctx, redis);
    const status = await service.getKillStatus(agentId);
    return c.json({
        agentId,
        isKilled: status.isKilled,
        tier: status.tier,
        issuedAt: status.issuedAt?.toISOString() ?? null,
        reason: status.reason,
    });
});
//# sourceMappingURL=killswitch.js.map