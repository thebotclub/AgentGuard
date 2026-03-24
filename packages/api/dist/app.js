/**
 * AgentGuard Control Plane API — Hono application.
 * Mounts all routes with middleware chain.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { authMiddleware } from './middleware/auth.js';
import { tenantRLSMiddleware } from './middleware/tenant.js';
import { errorHandler } from './middleware/error.js';
import { healthRouter } from './routes/health.js';
import { agentsRouter } from './routes/agents.js';
import { policiesRouter } from './routes/policies.js';
import { actionsRouter } from './routes/actions.js';
import { auditRouter } from './routes/audit.js';
import { killswitchRouter } from './routes/killswitch.js';
import { hitlRouter } from './routes/hitl.js';
import { eventsRouter } from './routes/events.js';
import { complianceRouter } from './routes/compliance.js';
export function createApp() {
    const app = new Hono();
    // ── Global middleware ────────────────────────────────────────────────────────
    app.use('*', logger());
    app.use('*', secureHeaders());
    app.use('*', cors({
        origin: process.env['CORS_ORIGIN'] ?? '*',
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id', 'X-API-Key'],
        exposeHeaders: ['X-Request-Id'],
    }));
    // ── Error handler ────────────────────────────────────────────────────────────
    app.onError(errorHandler);
    // ── Health (no auth) ─────────────────────────────────────────────────────────
    app.route('/v1/health', healthRouter);
    // ── WebSocket events (auth handled inside the route via ?token=) ─────────────
    app.route('/v1/events', eventsRouter);
    // ── Authenticated routes ──────────────────────────────────────────────────────
    app.use('/v1/*', authMiddleware);
    // Tenant Row-Level Security middleware — sets PostgreSQL session variable
    // `app.current_tenant_id` for RLS enforcement at the database level.
    // Defence-in-depth: even if application code omits a tenantId filter,
    // the DB policy prevents cross-tenant data leaks.
    // Requires RLS to be enabled via migration: packages/api/prisma/rls-migration.sql
    app.use('/v1/*', tenantRLSMiddleware);
    // ── API routes ────────────────────────────────────────────────────────────────
    app.route('/v1/agents', agentsRouter);
    app.route('/v1/policies', policiesRouter);
    app.route('/v1/actions', actionsRouter);
    app.route('/v1/audit', auditRouter);
    app.route('/v1/killswitch', killswitchRouter);
    app.route('/v1/hitl', hitlRouter);
    app.route('/v1/compliance', complianceRouter);
    // ── 404 fallback ──────────────────────────────────────────────────────────────
    app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} not found` } }, 404));
    return app;
}
//# sourceMappingURL=app.js.map