/**
 * AgentGuard — Kubernetes-style Health Probe Endpoints
 *
 * GET /healthz  — Liveness probe: is the process alive and accepting connections?
 *                 Returns 200 immediately; only fails if the event loop is frozen.
 *
 * GET /readyz   — Readiness probe: is the instance ready to serve traffic?
 *                 Checks DB connectivity, Redis connectivity (if configured),
 *                 and that required migrations have run.
 *
 * These are separate from the existing /health and /api/v1/health/detailed
 * endpoints to allow precise Kubernetes probe configuration without coupling
 * liveness to database availability (liveness restart is destructive; prefer
 * readiness for dependency failures).
 */
import { Router, Request, Response } from 'express';
import type { IDatabase } from '../db-interface.js';

// ── Redis availability check (optional) ──────────────────────────────────────

async function checkRedis(): Promise<{ ok: boolean; latencyMs: number; mode: string }> {
  try {
    const { getRedisClient } = await import('../lib/redis-rate-limiter.js');
    const client = getRedisClient();
    if (!client) {
      return { ok: true, latencyMs: 0, mode: 'none' }; // Redis not configured — not a readiness failure
    }
    const start = Date.now();
    await client.ping();
    return { ok: true, latencyMs: Date.now() - start, mode: 'standalone' };
  } catch {
    return { ok: false, latencyMs: -1, mode: 'error' };
  }
}

async function checkRedisSentinel(): Promise<{ ok: boolean; latencyMs: number; mode: string }> {
  const sentinelUrl = process.env['REDIS_SENTINEL_URL'] || process.env['REDIS_SENTINELS'];
  if (!sentinelUrl) {
    return checkRedis();
  }
  try {
    const { getSentinelClient } = await import('../lib/redis-sentinel.js');
    const client = getSentinelClient();
    if (!client) return { ok: true, latencyMs: 0, mode: 'sentinel-unconfigured' };
    const start = Date.now();
    await client.ping();
    return { ok: true, latencyMs: Date.now() - start, mode: 'sentinel' };
  } catch {
    return checkRedis();
  }
}

// ── Migration currency check ──────────────────────────────────────────────────

async function checkMigrations(db: IDatabase): Promise<{ current: boolean; detail: string }> {
  try {
    // Check that core tables exist — proxy for migrations being current
    await db.run('SELECT 1 FROM tenants LIMIT 1', []);
    await db.run('SELECT 1 FROM api_keys LIMIT 1', []);
    await db.run('SELECT 1 FROM audit_events LIMIT 1', []);
    return { current: true, detail: 'all required tables present' };
  } catch (e) {
    return { current: false, detail: `missing table: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createHealthProbeRoutes(db: IDatabase): Router {
  const router = Router();

  /**
   * GET /healthz — Liveness probe
   *
   * Returns 200 as long as the Node.js event loop is not frozen.
   * Does NOT check DB or Redis — liveness failures trigger pod restarts,
   * which are destructive. Only use for detecting hung processes.
   *
   * k8s example:
   *   livenessProbe:
   *     httpGet: { path: /healthz, port: 8080 }
   *     initialDelaySeconds: 10
   *     periodSeconds: 30
   */
  router.get('/healthz', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).json({
      status: 'alive',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /readyz — Readiness probe
   *
   * Returns 200 only when the instance is ready to serve traffic:
   *   - Database is reachable and migrations are current
   *   - Redis is reachable (if configured)
   *
   * Returns 503 when any dependency is unavailable. Kubernetes will
   * stop routing traffic to this pod until it becomes ready again.
   * This enables zero-downtime rolling deployments.
   *
   * k8s example:
   *   readinessProbe:
   *     httpGet: { path: /readyz, port: 8080 }
   *     initialDelaySeconds: 5
   *     periodSeconds: 10
   */
  router.get('/readyz', async (_req: Request, res: Response) => {
    const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};
    let allOk = true;

    // ── Database check ────────────────────────────────────────────────────
    try {
      const start = Date.now();
      const dbOk = await db.ping();
      checks['database'] = { ok: dbOk, latencyMs: Date.now() - start };
      if (!dbOk) allOk = false;
    } catch (e) {
      checks['database'] = { ok: false, detail: e instanceof Error ? e.message : 'error' };
      allOk = false;
    }

    // ── Migration currency check ──────────────────────────────────────────
    try {
      const migCheck = await checkMigrations(db);
      checks['migrations'] = { ok: migCheck.current, detail: migCheck.detail };
      if (!migCheck.current) allOk = false;
    } catch {
      checks['migrations'] = { ok: false, detail: 'check failed' };
      allOk = false;
    }

    // ── Redis check (non-blocking failure if not configured) ──────────────
    try {
      const redisResult = await checkRedisSentinel();
      // If Redis is configured and fails, mark not ready
      const isRedisConfigured =
        !!process.env['REDIS_URL'] ||
        !!process.env['REDIS_SENTINEL_URL'] ||
        !!process.env['REDIS_SENTINELS'];

      checks['redis'] = {
        ok: redisResult.ok,
        latencyMs: redisResult.latencyMs,
        detail: redisResult.mode,
      };

      if (isRedisConfigured && !redisResult.ok) {
        allOk = false;
      }
    } catch {
      checks['redis'] = { ok: true, detail: 'not-configured' }; // optional dependency
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ready' : 'not-ready',
      checks,
      version: '0.9.0',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
