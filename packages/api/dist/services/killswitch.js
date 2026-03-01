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
     * Issue a kill switch for an agent.
     * Sets a Redis flag (polled by SDK) and creates a DB record.
     */
    async issueKill(agentId, input) {
        this.assertRole('owner', 'admin', 'operator');
        // Verify agent belongs to this tenant
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
                    issuedByUserId: this.userId,
                    issuedAt: new Date(),
                },
            });
            // Update agent status
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
     * Resume an agent after a kill switch.
     */
    async resumeAgent(agentId) {
        this.assertRole('owner', 'admin', 'operator');
        const agent = await this.db.agent.findFirst({
            where: { id: agentId, tenantId: this.tenantId, deletedAt: null },
        });
        if (!agent)
            throw new NotFoundError('Agent', agentId);
        await this.withTransaction(async (tx) => {
            // Mark all active kill switch commands as resolved
            await tx.killSwitchCommand.updateMany({
                where: {
                    agentId,
                    tenantId: this.tenantId,
                    resumedAt: null,
                },
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
     */
    async getKillStatus(agentId) {
        const redisValue = await this.redis.get(RedisKeys.killSwitch(this.tenantId, agentId));
        if (redisValue) {
            const latest = await this.db.killSwitchCommand.findFirst({
                where: {
                    agentId,
                    tenantId: this.tenantId,
                    resumedAt: null,
                },
                orderBy: { issuedAt: 'desc' },
            });
            return {
                isKilled: true,
                tier: redisValue,
                issuedAt: latest?.issuedAt ?? null,
                reason: latest?.reason ?? null,
            };
        }
        return { isKilled: false, tier: null, issuedAt: null, reason: null };
    }
}
//# sourceMappingURL=killswitch.js.map