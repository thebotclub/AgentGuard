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

      // Support ?period=7d, ?period=30d (default: 30d)
      const periodParam = req.query['period'] as string | undefined;
      let days = 30;
      if (periodParam === '7d') days = 7;
      else if (periodParam === '14d') days = 14;
      else if (periodParam === '90d') days = 90;

      try {
        const analytics = await db.getUsageAnalytics(tenantId, days);
        res.json(analytics);
      } catch (e) {
        console.error('[analytics/usage] error:', e);
        // Return empty analytics on error rather than 500
        res.json({
          calls: { last24h: 0, last7d: 0, last30d: 0 },
          uniqueAgents: 0,
          topTools: [],
          blockRate: 0,
          dailyVolume: [],
        });
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
