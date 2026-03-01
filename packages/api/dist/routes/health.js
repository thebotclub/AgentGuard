/**
 * Health check route — GET /v1/health
 */
import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
export const healthRouter = new Hono();
healthRouter.get('/', async (c) => {
    const checks = {
        database: 'ok',
        redis: 'ok',
    };
    // Check PostgreSQL
    try {
        await prisma.$queryRaw `SELECT 1`;
    }
    catch {
        checks.database = 'error';
    }
    // Check Redis
    try {
        await redis.ping();
    }
    catch {
        checks.redis = 'error';
    }
    const allOk = Object.values(checks).every((v) => v === 'ok');
    return c.json({
        status: allOk ? 'ok' : 'degraded',
        version: process.env['npm_package_version'] ?? '0.1.0',
        timestamp: new Date().toISOString(),
        checks,
    }, allOk ? 200 : 503);
});
//# sourceMappingURL=health.js.map