/**
 * AgentGuard Control Plane API — Hono application.
 * Mounts all routes with middleware chain.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { healthRouter } from './routes/health.js';
import { agentsRouter } from './routes/agents.js';
import { policiesRouter } from './routes/policies.js';
import { actionsRouter } from './routes/actions.js';
import { auditRouter } from './routes/audit.js';
import { killswitchRouter } from './routes/killswitch.js';
export function createApp() {
    const app = new Hono();
    // ── Global middleware ────────────────────────────────────────────────────────
    app.use('*', logger());
    app.use('*', secureHeaders());
    app.use('*', cors({
        origin: process.env['CORS_ORIGIN'] ?? '*',
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id'],
        exposeHeaders: ['X-Request-Id'],
    }));
    // ── Error handler ────────────────────────────────────────────────────────────
    app.onError(errorHandler);
    // ── Health (no auth) ─────────────────────────────────────────────────────────
    app.route('/v1/health', healthRouter);
    // ── Authenticated routes ──────────────────────────────────────────────────────
    app.use('/v1/*', authMiddleware);
    // Note: tenantRLSMiddleware is disabled by default until PostgreSQL RLS is
    // enabled in the database. Uncomment after running migration SQL.
    // app.use('/v1/*', tenantRLSMiddleware);
    // ── API routes ────────────────────────────────────────────────────────────────
    app.route('/v1/agents', agentsRouter);
    app.route('/v1/policies', policiesRouter);
    app.route('/v1/actions', actionsRouter);
    app.route('/v1/audit', auditRouter);
    app.route('/v1/killswitch', killswitchRouter);
    // ── 404 fallback ──────────────────────────────────────────────────────────────
    app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} not found` } }, 404));
    return app;
}
//# sourceMappingURL=app.js.map