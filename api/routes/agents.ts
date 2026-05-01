/**
 * AgentGuard — Agent Routes
 *
 * POST   /api/v1/agents      — create an agent with scoped API key
 * GET    /api/v1/agents      — list tenant agents
 * DELETE /api/v1/agents/:id  — deactivate an agent
 */
import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import crypto from 'crypto';
import { CreateAgentRequest } from '../schemas.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

function generateAgentKey(): string {
  return 'ag_agent_' + crypto.randomBytes(16).toString('hex');
}

export function createAgentRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

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
      const { name, policy_scope, policyScope } = agentParsed.data;

      let scopeJson = '[]';
      const scope = Array.isArray(policy_scope) ? policy_scope : policyScope;
      if (Array.isArray(scope)) {
        scopeJson = JSON.stringify(scope);
      }

      const agentKey = generateAgentKey();

      try {
        const row = await db.insertAgent(
          tenantId,
          name.trim(),
          agentKey,
          scopeJson,
        );

        res.status(201).json({
          id: row.id,
          tenantId: row.tenant_id,
          name: row.name,
          apiKey: agentKey,
          policyScope: JSON.parse(row.policy_scope) as string[],
          active: row.active === 1,
          createdAt: row.created_at,
          note: 'Store the apiKey securely — it will not be shown again.',
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // SQLite: "UNIQUE constraint failed"
        // PostgreSQL: "duplicate key value violates unique constraint"
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
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const rows = await db.getAgentsByTenant(tenantId);
      res.json({
        agents: rows.map((r) => ({
          id: r.id,
          name: r.name,
          policyScope: JSON.parse(r.policy_scope) as string[],
          active: r.active === 1,
          createdAt: r.created_at,
        })),
      });
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

      const existing = await db.getAgentById(agentRowId, tenantId);
      if (!existing) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      return res.json({
        id: existing.id,
        tenantId: existing.tenant_id,
        name: existing.name,
        policyScope: JSON.parse(existing.policy_scope) as string[],
        active: existing.active === 1,
        createdAt: existing.created_at,
      });
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

      const existing = await db.getAgentById(agentRowId, tenantId);
      if (!existing) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      await db.deactivateAgent(agentRowId, tenantId);
      res.json({ id: agentRowId, deactivated: true });
    },
  );

  return router;
}
