/**
 * AgentGuard — Analytics Routes
 *
 * GET /api/v1/analytics/usage — usage analytics dashboard (requires tenant auth)
 */
import { Router, Request, Response } from 'express';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

export function createAnalyticsRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── GET /api/v1/analytics/usage ───────────────────────────────────────────
  router.get(
    '/api/v1/analytics/usage',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      try {
        const analytics = await db.getUsageAnalytics(tenantId, 30);
        res.json(analytics);
      } catch (e) {
        console.error('[analytics/usage] error:', e);
        res.status(500).json({ error: 'Failed to fetch analytics' });
      }
    },
  );

  // ── GET /api/v1/analytics/platform ─────────────────────────────────────
  // Admin-level platform-wide analytics (all tenants)
  router.get(
    '/api/v1/analytics/platform',
    auth.requireAdminAuth,
    async (_req: Request, res: Response) => {
      try {
        const stats = await db.getPlatformAnalytics();
        res.json(stats);
      } catch (e) {
        console.error('[analytics/platform] error:', e);
        res.status(500).json({ error: 'Failed to fetch platform analytics' });
      }
    },
  );

  return router;
}
