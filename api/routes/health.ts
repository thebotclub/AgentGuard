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
   * GET /api/v1/health/detailed
   * Public — no auth required (health probe endpoint).
   * Returns version, uptime, and component health with latency.
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
      version: '0.9.0',
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
