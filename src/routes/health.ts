/**
 * AgentGuard — Health Check Endpoints
 *
 * GET /v1/health  — Full readiness check (DB + Redis)
 * GET /v1/live    — Lightweight liveness probe
 */

import type { Hono } from 'hono';

export function registerHealthRoutes(app: Hono) {
  // Liveness — process alive, no I/O
  app.get('/v1/live', (c) => c.json({ status: 'ok' }, 200));

  // Readiness — full dependency check
  app.get('/v1/health', async (c) => {
    const checks: Record<string, 'ok' | 'error'> = {};
    let httpStatus = 200;

    // Database check
    try {
      // Dynamically import to avoid hard failure if prisma not configured
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      await prisma.$disconnect();
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      httpStatus = 503;
    }

    // Redis check
    try {
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        const { createClient } = await import('redis');
        const client = createClient({ url: redisUrl });
        await client.connect();
        await client.ping();
        await client.disconnect();
        checks.redis = 'ok';
      } else {
        checks.redis = 'error';
        httpStatus = 503;
      }
    } catch {
      checks.redis = 'error';
      httpStatus = 503;
    }

    return c.json({
      status: httpStatus === 200 ? 'ok' : 'degraded',
      service: 'agentguard-api',
      version: process.env.IMAGE_TAG ?? 'unknown',
      checks,
      timestamp: new Date().toISOString(),
    }, httpStatus);
  });
}
