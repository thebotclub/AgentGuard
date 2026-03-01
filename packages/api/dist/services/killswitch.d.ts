/**
 * KillSwitchService — issue/resume/check kill switches.
 * Aligned with ARCHITECTURE.md §3.5.
 */
import type { KillSwitchCommand } from '@prisma/client';
import type { ServiceContext, IssueKillSwitchInput } from '@agentguard/shared';
import { BaseService } from './base.js';
import type { PrismaClient } from '../lib/prisma.js';
import type { Redis } from '../lib/redis.js';
export declare class KillSwitchService extends BaseService {
    private readonly redis;
    constructor(db: PrismaClient, ctx: ServiceContext, redis: Redis);
    /**
     * Issue a kill switch for an agent.
     * Sets a Redis flag (polled by SDK) and creates a DB record.
     */
    issueKill(agentId: string, input: IssueKillSwitchInput): Promise<KillSwitchCommand>;
    /**
     * Resume an agent after a kill switch.
     */
    resumeAgent(agentId: string): Promise<void>;
    /**
     * Check the current kill switch state for an agent.
     */
    getKillStatus(agentId: string): Promise<{
        isKilled: boolean;
        tier: 'SOFT' | 'HARD' | null;
        issuedAt: Date | null;
        reason: string | null;
    }>;
}
//# sourceMappingURL=killswitch.d.ts.map