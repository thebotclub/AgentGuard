/**
 * AgentGuard — Agent Routes
 *
 * POST   /api/v1/agents      — create an agent with scoped API key
 * GET    /api/v1/agents      — list tenant agents
 * GET    /api/v1/agents/:id  — get agent details
 * DELETE /api/v1/agents/:id  — deactivate an agent
 */
import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { CreateAgentRequest } from '../schemas.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { AgentService } from '../services/agent.service.js';

export function createAgentRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();
  const agentService = new AgentService(db);

  // ── POST /api/v1/agents ───────────────────────────────────────────────────
  router.post(
    '/api/v1/agents',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      const agentParsed = CreateAgentRequest.safeParse(req.body ?? {});
      if (!agentParsed.success) {
        return res
          .status(400)
          .json({ error: agentParsed.error.issues[0]!.message });
      }
      const { name, policy_scope } = agentParsed.data;

      try {
        const agent = await agentService.createAgent(tenantId, {
          name,
          policyScope: policy_scope,
        });

        res.status(201).json({
          ...agent,
          note: 'Store the apiKey securely — it will not be shown again.',
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('UNIQUE') || msg.includes('duplicate key')) {
          return res.status(409).json({
            error: 'An agent with this name already exists',
          });
        }
        logger.error({ err: msg }, '[agents] insert error');
        res.status(500).json({ error: 'Failed to create agent' });
      }
    },
  );

  // ── GET /api/v1/agents ────────────────────────────────────────────────────
  router.get(
    '/api/v1/agents',
    auth.requireTenantAuth,
    async (_req: Request, res: Response) => {
      const tenantId = _req.tenantId!;
      const agents = await agentService.listAgents(tenantId);
      res.json({ agents });
    },
  );

  // ── GET /api/v1/agents/:id ────────────────────────────────────────────────
  router.get(
    '/api/v1/agents/:id',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const agentRowId = req.params['id'] as string;

      if (!agentRowId || typeof agentRowId !== 'string') {
        return res.status(400).json({ error: 'Invalid agent id' });
      }

      const agent = await agentService.getAgent(agentRowId, tenantId);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      return res.json(agent);
    },
  );

  // ── DELETE /api/v1/agents/:id ─────────────────────────────────────────────
  router.delete(
    '/api/v1/agents/:id',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const agentRowId = req.params['id'] as string;

      if (!agentRowId || typeof agentRowId !== 'string') {
        return res.status(400).json({ error: 'Invalid agent id' });
      }

      const existing = await agentService.getAgent(agentRowId, tenantId);
      if (!existing) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      await agentService.deactivateAgent(agentRowId, tenantId);
      res.json({ id: agentRowId, deactivated: true });
    },
  );

  return router;
}
