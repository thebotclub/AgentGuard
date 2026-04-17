/**
 * AgentGuard — Agent Hierarchy Routes (A2A Multi-Agent Policy Propagation)
 *
 * POST   /api/v1/agents/:agentId/children           — spawn a child agent
 * GET    /api/v1/agents/:agentId/children           — list child agents
 * DELETE /api/v1/agents/:agentId/children/:childId  — revoke a child agent
 *
 * Policy inheritance rules (monotonically restrictive):
 *  - Child can only ADD restrictions vs parent — never remove them
 *  - blockedTools: union of parent + child
 *  - allowedTools: intersection of parent + child
 *  - hitlTools: union of parent + child
 */
import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { SpawnChildAgentRequest } from '../schemas.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { requireFeature } from '../middleware/feature-gate.js';
import {
  AgentService,
  AgentNotFoundError,
  AgentValidationError,
} from '../services/agent.service.js';

export function createAgentHierarchyRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();
  const agentService = new AgentService(db);

  // ── POST /api/v1/agents/:agentId/children — spawn child agent ─────────────
  router.post(
    '/api/v1/agents/:agentId/children',
    auth.requireTenantAuth,
    requireFeature('a2a_governance'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const parentAgentId = req.params['agentId'] as string;

      const parsed = SpawnChildAgentRequest.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]!.message });
      }
      const { name, allowedTools, blockedTools, hitlTools, ttlMinutes, maxToolCalls } = parsed.data;

      try {
        const child = await agentService.spawnChildAgent(tenantId, parentAgentId, {
          name,
          allowedTools,
          blockedTools,
          hitlTools,
          ttlMinutes,
          maxToolCalls,
        });

        return res.status(201).json({
          ...child,
          note: 'Store the apiKey securely — it will not be shown again.',
        });
      } catch (e: unknown) {
        if (e instanceof AgentNotFoundError) {
          return res.status(404).json({ error: e.message });
        }
        if (e instanceof AgentValidationError) {
          return res.status(400).json({ error: e.message });
        }
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('UNIQUE') || msg.includes('duplicate key')) {
          return res.status(409).json({ error: 'An agent with this name already exists' });
        }
        logger.error({ err: msg }, '[agent-hierarchy] spawn error');
        return res.status(500).json({ error: 'Failed to spawn child agent' });
      }
    },
  );

  // ── GET /api/v1/agents/:agentId/children — list child agents ──────────────
  router.get(
    '/api/v1/agents/:agentId/children',
    auth.requireTenantAuth,
    requireFeature('a2a_governance'),
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const parentAgentId = req.params['agentId'] as string;

        const children = await agentService.listChildAgents(tenantId, parentAgentId);

        return res.json({ parentAgentId, children });
      } catch (e) {
        if (e instanceof AgentNotFoundError) {
          return res.status(404).json({ error: e.message });
        }
        logger.error({ err: e instanceof Error ? e : String(e) }, '[agent-hierarchy] list children error');
        return res.status(500).json({ error: 'Failed to list child agents' });
      }
    },
  );

  // ── DELETE /api/v1/agents/:agentId/children/:childId — revoke child ────────
  router.delete(
    '/api/v1/agents/:agentId/children/:childId',
    auth.requireTenantAuth,
    requireFeature('a2a_governance'),
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const parentAgentId = req.params['agentId'] as string;
        const childId = req.params['childId'] as string;

        await agentService.revokeChildAgent(tenantId, parentAgentId, childId);

        return res.json({
          childAgentId: childId,
          parentAgentId,
          revoked: true,
        });
      } catch (e) {
        if (e instanceof AgentNotFoundError) {
          return res.status(404).json({ error: e.message });
        }
        logger.error({ err: e instanceof Error ? e : String(e) }, '[agent-hierarchy] delete child error');
        return res.status(500).json({ error: 'Failed to revoke child agent' });
      }
    },
  );

  return router;
}
