/**
 * AgentGuard — Feedback Routes
 *
 * POST /api/v1/feedback     — submit feedback (requires tenant auth)
 * GET  /api/v1/feedback     — list all feedback (requires admin auth)
 */
import { Router, Request, Response } from 'express';
import { FeedbackRequestSchema } from '../schemas.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

export function createFeedbackRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── POST /api/v1/feedback ─────────────────────────────────────────────────
  router.post(
    '/api/v1/feedback',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      const parsed = FeedbackRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]!.message });
      }

      const { rating: ratingField, verdict, comment, agent_id } = parsed.data;

      // Map string/verdict rating to numeric for DB storage
      function toNumericRating(v: string | number | undefined): number {
        if (typeof v === 'number') return v;
        if (v === 'positive') return 5;
        if (v === 'negative') return 1;
        if (v === 'neutral') return 3;
        return 3;
      }
      const rating = typeof ratingField !== 'undefined'
        ? toNumericRating(ratingField)
        : toNumericRating(verdict!);

      try {
        const row = await db.insertFeedback(tenantId, agent_id ?? null, rating, comment ?? null);
        res.status(201).json({
          id: row.id,
          tenantId: row.tenant_id,
          agentId: row.agent_id,
          rating: row.rating,
          comment: row.comment,
          createdAt: row.created_at,
        });
      } catch (e) {
        console.error('[feedback] insert error:', e);
        res.status(500).json({ error: 'Failed to submit feedback' });
      }
    },
  );

  // ── GET /api/v1/feedback ─────────────────────────────────────────────────
  router.get(
    '/api/v1/feedback',
    auth.requireAdminAuth,
    async (_req: Request, res: Response) => {
      try {
        const rows = await db.listFeedback();
        res.json({
          feedback: rows.map((r) => ({
            id: r.id,
            tenantId: r.tenant_id,
            agentId: r.agent_id,
            rating: r.rating,
            comment: r.comment,
            createdAt: r.created_at,
          })),
          count: rows.length,
        });
      } catch (e) {
        console.error('[feedback] list error:', e);
        res.status(500).json({ error: 'Failed to list feedback' });
      }
    },
  );

  return router;
}
