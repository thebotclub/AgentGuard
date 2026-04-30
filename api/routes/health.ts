/**
 * AgentGuard — Detailed Health Endpoint
 *
 * GET /api/v1/health/detailed  — public, no auth required
 *
 * Returns component-level health status for k8s liveness/readiness probes
 * and customer monitoring dashboards.
 */
import { Router, Request, Response } from 'express';
import type { IDatabase } from '../db-interface.js';

// ── Route factory ─────────────────────────────────────────────────────────

export function createHealthRoutes(db: IDatabase): Router {
  const router = Router();

  /**
   * @openapi
   * /health/detailed:
   *   get:
   *     summary: Detailed health check
   *     description: Returns component-level health for k8s probes and monitoring dashboards.
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: All components healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   enum: [ok, degraded]
   *                 version:
   *                   type: string
   *                 uptimeSeconds:
   *                   type: number
   *                 components:
   *                   type: object
   *       503:
   *         description: One or more components degraded
   */
  router.get('/api/v1/health/detailed', async (_req: Request, res: Response) => {
    let dbStatus: 'ok' | 'error' = 'ok';
    let dbLatencyMs = 0;

    try {
      const start = Date.now();
      await db.run('SELECT 1', []);
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'error';
    }

    const overallStatus = dbStatus === 'ok' ? 'ok' : 'degraded';
    const statusCode = overallStatus === 'ok' ? 200 : 503;

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(statusCode).json({
      status: overallStatus,
      version: '0.10.0',
      uptime: Math.floor(process.uptime()),
      components: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
      },
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
