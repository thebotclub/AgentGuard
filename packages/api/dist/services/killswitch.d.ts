/**
 * KillSwitchService — issue/resume/check kill switches.
 * Aligned with ARCHITECTURE.md §3.5 and BUILD_PLAN.md Component e.
 *
 * Redis-backed: SDK polls GET /v1/killswitch/status/:agentId every 10s.
 * DB record provides audit trail of all kill switch commands.
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
     * Issue a kill switch for a specific agent.
     * Sets a Redis flag (polled by SDK) and creates a DB record.
     */
    issueKill(agentId: string, input: IssueKillSwitchInput): Promise<KillSwitchCommand>;
    /**
     * Issue a global halt for all agents in this tenant.
     */
    haltAll(input: IssueKillSwitchInput): Promise<{
        affectedAgents: number;
    }>;
    /**
     * Resume an agent after a kill switch.
     */
    resumeAgent(agentId: string, _reason?: string): Promise<void>;
    /**
     * Check the current kill switch state for an agent.
     * Redis-first (fast path), DB fallback.
     */
    getKillStatus(agentId: string): Promise<{
        isKilled: boolean;
        tier: 'SOFT' | 'HARD' | null;
        issuedAt: Date | null;
        reason: string | null;
    }>;
    /**
     * List recent kill switch commands for an agent.
     */
    listCommands(agentId: string, limit?: number): Promise<KillSwitchCommand[]>;
    /** Check if the current context is an agent (not a human user). */
    private isAgentContext;
}
//# sourceMappingURL=killswitch.d.ts.map