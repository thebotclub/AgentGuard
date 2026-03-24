import { KILL_SWITCH_TTL_SECONDS } from '@agentguard/shared';
import { BaseService } from './base.js';
import { NotFoundError } from '../lib/errors.js';
import { RedisKeys } from '../lib/redis.js';
export class KillSwitchService extends BaseService {
    redis;
    constructor(db, ctx, redis) {
        super(db, ctx);
        this.redis = redis;
    }
    /**
     * Issue a kill switch for a specific agent.
     * Sets a Redis flag (polled by SDK) and creates a DB record.
     */
    async issueKill(agentId, input) {
        this.assertRole('owner', 'admin', 'operator');
        const agent = await this.db.agent.findFirst({
            where: { id: agentId, tenantId: this.tenantId, deletedAt: null },
        });
        if (!agent)
            throw new NotFoundError('Agent', agentId);
        return this.withTransaction(async (tx) => {
            const command = await tx.killSwitchCommand.create({
                data: {
                    tenantId: this.tenantId,
                    agentId,
                    tier: input.tier,
                    reason: input.reason ?? null,
                    issuedByUserId: this.isAgentContext() ? null : this.userId,
                    issuedAt: new Date(),
                },
            });
            await tx.agent.update({
                where: { id: agentId },
                data: { status: 'KILLED' },
            });
            // Write Redis flag — SDK polls this
            await this.redis.set(RedisKeys.killSwitch(this.tenantId, agentId), input.tier, 'EX', KILL_SWITCH_TTL_SECONDS);
            return command;
        });
    }
    /**
     * Issue a global halt for all agents in this tenant.
     */
    async haltAll(input) {
        this.assertRole('owner', 'admin');
        const agents = await this.db.agent.findMany({
            where: { tenantId: this.tenantId, status: 'ACTIVE', deletedAt: null },
            select: { id: true },
        });
        await Promise.all(agents.map(async (agent) => {
            await this.redis.set(RedisKeys.killSwitch(this.tenantId, agent.id), input.tier, 'EX', KILL_SWITCH_TTL_SECONDS);
        }));
        // Bulk update DB status
        await this.db.agent.updateMany({
            where: { tenantId: this.tenantId, status: 'ACTIVE', deletedAt: null },
            data: { status: 'KILLED' },
        });
        // Create one command per agent (for audit trail)
        await this.db.killSwitchCommand.createMany({
            data: agents.map((agent) => ({
                tenantId: this.tenantId,
                agentId: agent.id,
                tier: input.tier,
                reason: input.reason ?? 'Global halt',
                issuedByUserId: this.isAgentContext() ? null : this.userId,
                issuedAt: new Date(),
            })),
        });
        return { affectedAgents: agents.length };
    }
    /**
     * Resume an agent after a kill switch.
     */
    async resumeAgent(agentId, _reason) {
        this.assertRole('owner', 'admin', 'operator');
        const agent = await this.db.agent.findFirst({
            where: { id: agentId, tenantId: this.tenantId, deletedAt: null },
        });
        if (!agent)
            throw new NotFoundError('Agent', agentId);
        await this.withTransaction(async (tx) => {
            // Mark all active kill switch commands as resolved
            await tx.killSwitchCommand.updateMany({
                where: { agentId, tenantId: this.tenantId, resumedAt: null },
                data: { resumedAt: new Date() },
            });
            // Restore agent to active
            await tx.agent.update({
                where: { id: agentId },
                data: { status: 'ACTIVE' },
            });
        });
        // Remove Redis flag
        await this.redis.del(RedisKeys.killSwitch(this.tenantId, agentId));
    }
    /**
     * Check the current kill switch state for an agent.
     * Redis-first (fast path), DB fallback.
     */
    async getKillStatus(agentId) {
        const redisValue = await this.redis.get(RedisKeys.killSwitch(this.tenantId, agentId));
        if (redisValue) {
            const latest = await this.db.killSwitchCommand.findFirst({
                where: { agentId, tenantId: this.tenantId, resumedAt: null },
                orderBy: { issuedAt: 'desc' },
            });
            return {
                isKilled: true,
                tier: redisValue,
                issuedAt: latest?.issuedAt ?? null,
                reason: latest?.reason ?? null,
            };
        }
        // DB fallback — check if agent has a KILLED status
        const agent = await this.db.agent.findFirst({
            where: { id: agentId, tenantId: this.tenantId, deletedAt: null },
            select: { status: true },
        });
        if (agent?.status === 'KILLED') {
            const latest = await this.db.killSwitchCommand.findFirst({
                where: { agentId, tenantId: this.tenantId, resumedAt: null },
                orderBy: { issuedAt: 'desc' },
            });
            if (latest) {
                // Re-warm Redis cache
                await this.redis.set(RedisKeys.killSwitch(this.tenantId, agentId), latest.tier, 'EX', KILL_SWITCH_TTL_SECONDS);
                return {
                    isKilled: true,
                    tier: latest.tier,
                    issuedAt: latest.issuedAt,
                    reason: latest.reason ?? null,
                };
            }
        }
        return { isKilled: false, tier: null, issuedAt: null, reason: null };
    }
    /**
     * List recent kill switch commands for an agent.
     */
    async listCommands(agentId, limit = 20) {
        // Verify agent belongs to tenant
        const agent = await this.db.agent.findFirst({
            where: { id: agentId, tenantId: this.tenantId, deletedAt: null },
        });
        if (!agent)
            throw new NotFoundError('Agent', agentId);
        return this.db.killSwitchCommand.findMany({
            where: { agentId, tenantId: this.tenantId },
            orderBy: { issuedAt: 'desc' },
            take: limit,
        });
    }
    /** Check if the current context is an agent (not a human user). */
    isAgentContext() {
        return this.ctx.role === 'agent';
    }
}
//# sourceMappingURL=killswitch.js.map