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
import crypto from 'crypto';
import { SpawnChildAgentRequest } from '../schemas.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import {
  computeChildPolicy,
  type AgentPolicy,
} from '../lib/policy-inheritance.js';

function generateAgentKey(): string {
  return 'ag_agent_' + crypto.randomBytes(16).toString('hex');
}

/**
 * Parse a stored policy_scope JSON into an AgentPolicy.
 * policy_scope on agents is an array of strings historically, but here
 * we also interpret it as a full AgentPolicy if it was stored as an object.
 */
function parseAgentPolicy(policyScopeJson: string): AgentPolicy {
  try {
    const parsed = JSON.parse(policyScopeJson) as unknown;
    if (Array.isArray(parsed)) {
      // Legacy format: array of allowed tools
      return { allowedTools: parsed as string[] };
    }
    if (parsed && typeof parsed === 'object') {
      return parsed as AgentPolicy;
    }
  } catch {
    // ignore
  }
  return {};
}

export function createAgentHierarchyRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── POST /api/v1/agents/:agentId/children — spawn child agent ─────────────
  router.post(
    '/api/v1/agents/:agentId/children',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const parentAgentId = req.params['agentId'] as string;

      // Verify parent agent belongs to this tenant
      const parentAgent = await db.getAgentById(parentAgentId, tenantId);
      if (!parentAgent) {
        return res.status(404).json({ error: 'Parent agent not found' });
      }
      if (parentAgent.active === 0) {
        return res.status(400).json({ error: 'Parent agent is inactive' });
      }

      const parsed = SpawnChildAgentRequest.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]!.message });
      }
      const { name, allowedTools, blockedTools, hitlTools, ttlMinutes, maxToolCalls } = parsed.data;

      // Compute parent's effective policy
      const parentPolicy = parseAgentPolicy(parentAgent.policy_scope);

      // Requested child restrictions
      const childRestrictions: AgentPolicy = {};
      if (allowedTools !== undefined) childRestrictions.allowedTools = allowedTools;
      if (blockedTools !== undefined) childRestrictions.blockedTools = blockedTools;
      if (hitlTools !== undefined) childRestrictions.hitlTools = hitlTools;

      // Compute merged (monotonically restrictive) child policy
      const childPolicy = computeChildPolicy(parentPolicy, childRestrictions);

      // Compute TTL expiry
      const ttlExpiresAt = ttlMinutes
        ? new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // default 24h

      // Create the child agent row
      const childApiKey = generateAgentKey();
      const childAgentId = crypto.randomUUID().replace(/-/g, '');
      const hierarchyId = crypto.randomUUID().replace(/-/g, '');

      try {
        // Insert child into agents table (re-uses parent's tenant)
        const childAgentRow = await db.insertAgent(
          tenantId,
          name.trim(),
          childApiKey,
          JSON.stringify(childPolicy),
        );

        // Insert into hierarchy table
        const hierarchyRow = await db.insertChildAgent(
          hierarchyId,
          parentAgentId,
          childAgentRow.id,
          tenantId,
          JSON.stringify(childPolicy),
          ttlExpiresAt,
          maxToolCalls ?? null,
        );

        return res.status(201).json({
          id: childAgentRow.id,
          parentAgentId,
          tenantId,
          name: childAgentRow.name,
          apiKey: childApiKey,
          policy: childPolicy,
          ttlExpiresAt: hierarchyRow.ttl_expires_at,
          maxToolCalls: hierarchyRow.max_tool_calls,
          toolCallsUsed: 0,
          createdAt: hierarchyRow.created_at,
          note: 'Store the apiKey securely — it will not be shown again.',
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('UNIQUE') || msg.includes('duplicate key')) {
          return res.status(409).json({ error: 'An agent with this name already exists' });
        }
        console.error('[agent-hierarchy] spawn error:', msg);
        return res.status(500).json({ error: 'Failed to spawn child agent' });
      }
    },
  );

  // ── GET /api/v1/agents/:agentId/children — list child agents ──────────────
  router.get(
    '/api/v1/agents/:agentId/children',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const parentAgentId = req.params['agentId'] as string;

      // Verify parent exists + belongs to tenant
      const parentAgent = await db.getAgentById(parentAgentId, tenantId);
      if (!parentAgent) {
        return res.status(404).json({ error: 'Parent agent not found' });
      }

      const children = await db.listChildAgents(parentAgentId, tenantId);

      return res.json({
        parentAgentId,
        children: children.map((c) => {
          let policy: AgentPolicy = {};
          try { policy = JSON.parse(c.policy_snapshot) as AgentPolicy; } catch { /* keep empty */ }
          const now = Date.now();
          const expired = c.ttl_expires_at ? new Date(c.ttl_expires_at).getTime() < now : false;
          const budgetExceeded = c.max_tool_calls !== null
            ? c.tool_calls_used >= c.max_tool_calls
            : false;
          return {
            id: c.child_agent_id,
            hierarchyId: c.id,
            name: c.child_agent_id, // actual name from agents table
            policy,
            ttlExpiresAt: c.ttl_expires_at,
            maxToolCalls: c.max_tool_calls,
            toolCallsUsed: c.tool_calls_used,
            createdAt: c.created_at,
            status: expired ? 'expired' : budgetExceeded ? 'budget_exceeded' : 'active',
          };
        }),
      });
    },
  );

  // ── DELETE /api/v1/agents/:agentId/children/:childId — revoke child ────────
  router.delete(
    '/api/v1/agents/:agentId/children/:childId',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const parentAgentId = req.params['agentId'] as string;
      const childId = req.params['childId'] as string;

      // Verify parent agent belongs to this tenant
      const parentAgent = await db.getAgentById(parentAgentId, tenantId);
      if (!parentAgent) {
        return res.status(404).json({ error: 'Parent agent not found' });
      }

      // Verify the child agent is actually a child of this parent
      const hierarchyRow = await db.getChildAgent(childId);
      if (!hierarchyRow || hierarchyRow.parent_agent_id !== parentAgentId || hierarchyRow.tenant_id !== tenantId) {
        return res.status(404).json({ error: 'Child agent not found' });
      }

      // Deactivate child agent and remove hierarchy record
      await db.deactivateAgent(childId, tenantId);
      await db.deleteChildAgent(childId, tenantId);

      return res.json({
        childAgentId: childId,
        parentAgentId,
        revoked: true,
      });
    },
  );

  return router;
}
