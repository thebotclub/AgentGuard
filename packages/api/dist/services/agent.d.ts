import type { Agent, AgentStatus } from '@prisma/client';
import type { ServiceContext } from '@agentguard/shared';
import type { CreateAgentInput, UpdateAgentInput } from '@agentguard/shared';
import { BaseService } from './base.js';
import type { PrismaClient } from '../lib/prisma.js';
export declare class AgentService extends BaseService {
    constructor(db: PrismaClient, ctx: ServiceContext);
    listAgents(status?: AgentStatus, limit?: number, cursor?: string): Promise<Agent[]>;
    getAgent(agentId: string): Promise<Agent>;
    createAgent(input: CreateAgentInput): Promise<{
        agent: Agent;
        apiKey: string;
    }>;
    updateAgent(agentId: string, input: UpdateAgentInput): Promise<Agent>;
    deleteAgent(agentId: string): Promise<void>;
    /** Authenticate an SDK agent by raw API key. Returns the agent if valid. */
    authenticateByApiKey(rawKey: string): Promise<Agent | null>;
}
//# sourceMappingURL=agent.d.ts.map