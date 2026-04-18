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

// ── Redis connectivity check ──────────────────────────────────────────────

async function checkRedis(): Promise<{ status: 'ok' | 'degraded' | 'error'; latencyMs: number; detail: string }> {
  try {
    const { getRedisClient } = await import('../lib/redis-rate-limiter.js');
    const client = getRedisClient();
    if (!client) {
      return { status: 'degraded', latencyMs: 0, detail: 'redis not configured' };
    }
    const start = Date.now();
    await (client as any).ping?.() ?? Promise.resolve();
    return { status: 'ok', latencyMs: Date.now() - start, detail: 'connected' };
  } catch (e) {
    const isConfigured = !!process.env['REDIS_URL'];
    if (!isConfigured) {
      return { status: 'degraded', latencyMs: -1, detail: 'redis not configured' };
    }
    return { status: 'error', latencyMs: -1, detail: e instanceof Error ? e.message : 'connection failed' };
  }
}

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
   *         description: All components healthy (or degraded if optional deps are unavailable)
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
   *         description: One or more required components failed
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

    const redisResult = await checkRedis();

    // Redis not configured = degraded; Redis configured but failing = error
    const hasCriticalFailure = dbStatus === 'error' || redisResult.status === 'error';
    const hasDegradation = dbStatus === 'ok' && redisResult.status === 'degraded';

    const overallStatus = hasCriticalFailure ? 'degraded' : hasDegradation ? 'degraded' : 'ok';
    const statusCode = hasCriticalFailure ? 503 : 200;

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
        redis: {
          status: redisResult.status,
          latencyMs: redisResult.latencyMs,
          detail: redisResult.detail,
        },
      },
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
