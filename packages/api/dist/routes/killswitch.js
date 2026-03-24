/**
 * Kill switch routes
 *
 * POST /v1/killswitch/halt/:agentId   — halt specific agent
 * POST /v1/killswitch/halt-all        — halt all tenant agents
 * POST /v1/killswitch/resume/:agentId — resume agent
 * GET  /v1/killswitch/status/:agentId — check kill switch state (SDK polls this)
 * GET  /v1/killswitch/commands/:agentId — list historical commands
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { IssueKillSwitchSchema } from '@agentguard/shared';
import { KillSwitchService } from '../services/killswitch.js';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { broadcastToTenant } from './events.js';
export const killswitchRouter = new Hono();
/** POST /v1/killswitch/halt/:agentId */
killswitchRouter.post('/halt/:agentId', async (c) => {
    const ctx = getContext(c);
    const agentId = c.req.param('agentId');
    const service = new KillSwitchService(prisma, ctx, redis);
    const body = await c.req.json();
    const input = IssueKillSwitchSchema.parse(body);
    const command = await service.issueKill(agentId, input);
    // Broadcast kill switch event to connected dashboard clients
    void broadcastToTenant(ctx.tenantId, {
        type: 'kill_switch',
        data: {
            agentId,
            tier: command.tier,
            reason: command.reason,
            issuedAt: command.issuedAt.toISOString(),
        },
    });
    return c.json({
        id: command.id,
        agentId: command.agentId,
        tier: command.tier,
        reason: command.reason,
        issuedAt: command.issuedAt.toISOString(),
    }, 201);
});
/** POST /v1/killswitch/halt-all — halt ALL active agents in tenant */
killswitchRouter.post('/halt-all', async (c) => {
    const ctx = getContext(c);
    const service = new KillSwitchService(prisma, ctx, redis);
    const body = await c.req.json();
    const input = IssueKillSwitchSchema.parse(body);
    const { affectedAgents } = await service.haltAll(input);
    // Broadcast global halt event
    void broadcastToTenant(ctx.tenantId, {
        type: 'kill_switch',
        data: {
            agentId: '*',
            tier: input.tier,
            reason: input.reason ?? 'Global halt',
            issuedAt: new Date().toISOString(),
            affectedAgents,
        },
    });
    return c.json({
        success: true,
        affectedAgents,
        tier: input.tier,
        reason: input.reason,
    });
});
/** POST /v1/killswitch/resume/:agentId */
killswitchRouter.post('/resume/:agentId', async (c) => {
    const ctx = getContext(c);
    const agentId = c.req.param('agentId');
    const service = new KillSwitchService(prisma, ctx, redis);
    const body = await c.req.json().catch(() => ({}));
    const input = z.object({ reason: z.string().max(500).optional() }).parse(body);
    await service.resumeAgent(agentId, input.reason);
    // Broadcast resume event
    void broadcastToTenant(ctx.tenantId, {
        type: 'kill_switch',
        data: {
            agentId,
            tier: null,
            reason: input.reason ?? 'Agent resumed',
            issuedAt: new Date().toISOString(),
            resumed: true,
        },
    });
    return c.json({ success: true, agentId });
});
/**
 * GET /v1/killswitch/status/:agentId
 * Checked by SDK long-poll (every 10 seconds).
 * Redis-first for speed (<5ms p99 from cache).
 */
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
/** GET /v1/killswitch/commands/:agentId — list historical commands */
killswitchRouter.get('/commands/:agentId', async (c) => {
    const ctx = getContext(c);
    const agentId = c.req.param('agentId');
    const service = new KillSwitchService(prisma, ctx, redis);
    const limit = Number(c.req.query('limit') ?? '20');
    const commands = await service.listCommands(agentId, Math.min(limit, 100));
    return c.json({
        data: commands.map((cmd) => ({
            id: cmd.id,
            agentId: cmd.agentId,
            tier: cmd.tier,
            reason: cmd.reason,
            issuedAt: cmd.issuedAt.toISOString(),
            acknowledgedAt: cmd.acknowledgedAt?.toISOString() ?? null,
            resumedAt: cmd.resumedAt?.toISOString() ?? null,
        })),
    });
});
//# sourceMappingURL=killswitch.js.map