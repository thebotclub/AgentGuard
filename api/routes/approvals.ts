/**
 * AgentGuard — HITL Approval Queue Routes
 *
 * GET  /api/v1/approvals         — list pending approvals for tenant
 * POST /api/v1/approvals/:id/approve — approve a pending request
 * POST /api/v1/approvals/:id/deny    — deny a pending request
 *
 * Approvals are created automatically by the evaluate endpoint when a policy
 * rule returns `require_approval`. The approvalId is included in the evaluate
 * response so callers can poll or receive webhook notifications.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { publishEvent } from '../lib/redis-pubsub.js';

export function createApprovalRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── GET /api/v1/approvals ─────────────────────────────────────────────────
  // ?status=pending|all|resolved  (default: all)
  // ?limit=<n>                    (default: 100, max: 200)
  router.get(
    '/api/v1/approvals',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const statusFilter = (req.query['status'] as string) || 'all';
      const limit = Math.min(200, parseInt((req.query['limit'] as string) || '100', 10));
      try {
        const approvals = await db.listAllApprovals(tenantId, limit);
        const filtered = statusFilter === 'pending'
          ? approvals.filter(a => a.status === 'pending')
          : statusFilter === 'resolved'
            ? approvals.filter(a => a.status !== 'pending')
            : approvals;
        res.json({
          approvals: filtered.map((a) => ({
            id: a.id,
            agentId: a.agent_id,
            tool: a.tool,
            params: a.params_json ? (JSON.parse(a.params_json) as unknown) : null,
            status: a.status,
            createdAt: a.created_at,
            resolvedAt: a.resolved_at,
            resolvedBy: a.resolved_by,
          })),
        });
      } catch (e) {
        console.error('[approvals] list error:', e);
        res.status(500).json({ error: 'Failed to list approvals' });
      }
    },
  );

  // ── POST /api/v1/approvals/:id/approve ────────────────────────────────────
  router.post(
    '/api/v1/approvals/:id/approve',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const approvalId = req.params['id'] as string;

      const approval = await db.getApproval(approvalId, tenantId);
      if (!approval) {
        return res.status(404).json({ error: 'Approval not found' });
      }
      if (approval.status !== 'pending') {
        return res.status(409).json({
          error: `Approval already resolved as '${approval.status}'`,
        });
      }

      const resolvedBy = req.tenantId!; // record who resolved it (tenant)
      await db.resolveApproval(approvalId, tenantId, 'approved', resolvedBy);

      // ── SSE: notify gate resolved ──────────────────────────────────────────
      publishEvent({
        type: 'hitl_gate_resolved',
        tenantId,
        data: { approvalId, status: 'approved', resolvedBy, tool: approval.tool },
        ts: new Date().toISOString(),
      }).catch(() => { /* non-critical */ });

      res.json({
        id: approvalId,
        status: 'approved',
        resolvedAt: new Date().toISOString(),
        resolvedBy,
      });
    },
  );

  // ── POST /api/v1/approvals/:id/deny ──────────────────────────────────────
  router.post(
    '/api/v1/approvals/:id/deny',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const approvalId = req.params['id'] as string;

      const approval = await db.getApproval(approvalId, tenantId);
      if (!approval) {
        return res.status(404).json({ error: 'Approval not found' });
      }
      if (approval.status !== 'pending') {
        return res.status(409).json({
          error: `Approval already resolved as '${approval.status}'`,
        });
      }

      const resolvedBy = req.tenantId!;
      await db.resolveApproval(approvalId, tenantId, 'denied', resolvedBy);

      // ── SSE: notify gate resolved ──────────────────────────────────────────
      publishEvent({
        type: 'hitl_gate_resolved',
        tenantId,
        data: { approvalId, status: 'denied', resolvedBy, tool: approval.tool },
        ts: new Date().toISOString(),
      }).catch(() => { /* non-critical */ });

      res.json({
        id: approvalId,
        status: 'denied',
        resolvedAt: new Date().toISOString(),
        resolvedBy,
      });
    },
  );

  return router;
}

/**
 * Create a pending approval record and return its ID.
 * Called from the evaluate route when result === 'require_approval'.
 */
export async function createPendingApproval(
  db: IDatabase,
  tenantId: string,
  agentId: string | null,
  tool: string,
  params: Record<string, unknown>,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.createApproval(
    id,
    tenantId,
    agentId,
    tool,
    JSON.stringify(params),
  );
  return id;
}
