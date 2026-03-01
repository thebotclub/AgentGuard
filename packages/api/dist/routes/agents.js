/**
 * Agent CRUD routes — /v1/agents
 * GET    /agents
 * POST   /agents
 * GET    /agents/:agentId
 * PUT    /agents/:agentId
 * DELETE /agents/:agentId
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateAgentSchema, UpdateAgentSchema, ListAgentsQuerySchema, } from '@agentguard/shared';
import { AgentService } from '../services/agent.js';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
export const agentsRouter = new Hono();
/** GET /v1/agents — list agents */
agentsRouter.get('/', zValidator('query', ListAgentsQuerySchema), async (c) => {
    const ctx = getContext(c);
    const query = c.req.valid('query');
    const service = new AgentService(prisma, ctx);
    const agents = await service.listAgents(query.status, query.limit, query.cursor);
    return c.json({
        data: agents.map(agentToResponse),
        pagination: {
            cursor: agents.length === query.limit ? (agents[agents.length - 1]?.id ?? null) : null,
            hasMore: agents.length === query.limit,
        },
    });
});
/** POST /v1/agents — create agent */
agentsRouter.post('/', zValidator('json', CreateAgentSchema), async (c) => {
    const ctx = getContext(c);
    const input = c.req.valid('json');
    const service = new AgentService(prisma, ctx);
    const { agent, apiKey } = await service.createAgent(input);
    return c.json({
        ...agentToResponse(agent),
        apiKey, // Only returned on creation
    }, 201);
});
/** GET /v1/agents/:agentId — get agent */
agentsRouter.get('/:agentId', async (c) => {
    const ctx = getContext(c);
    const agentId = c.req.param('agentId');
    const service = new AgentService(prisma, ctx);
    const agent = await service.getAgent(agentId);
    return c.json(agentToResponse(agent));
});
/** PUT /v1/agents/:agentId — update agent */
agentsRouter.put('/:agentId', zValidator('json', UpdateAgentSchema), async (c) => {
    const ctx = getContext(c);
    const agentId = c.req.param('agentId');
    const input = c.req.valid('json');
    const service = new AgentService(prisma, ctx);
    const agent = await service.updateAgent(agentId, input);
    return c.json(agentToResponse(agent));
});
/** DELETE /v1/agents/:agentId — soft-delete agent */
agentsRouter.delete('/:agentId', async (c) => {
    const ctx = getContext(c);
    const agentId = c.req.param('agentId');
    const service = new AgentService(prisma, ctx);
    await service.deleteAgent(agentId);
    return c.json({ success: true });
});
function agentToResponse(agent) {
    return {
        id: agent.id,
        tenantId: agent.tenantId,
        name: agent.name,
        description: agent.description,
        status: agent.status,
        riskTier: agent.riskTier,
        failBehavior: agent.failBehavior,
        framework: agent.framework,
        frameworkVersion: agent.frameworkVersion,
        tags: agent.tags,
        policyId: agent.policyId,
        policyVersion: agent.policyVersion,
        apiKeyPrefix: agent.apiKeyPrefix,
        apiKeyExpiresAt: agent.apiKeyExpiresAt?.toISOString() ?? null,
        metadata: agent.metadata,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
        lastSeenAt: agent.lastSeenAt?.toISOString() ?? null,
    };
}
//# sourceMappingURL=agents.js.map