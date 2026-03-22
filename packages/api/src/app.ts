/**
 * AgentGuard Control Plane API — Hono application.
 * Mounts all routes with middleware chain.
 *
 * API Versioning strategy:
 *   - All canonical routes live under /v1/
 *   - Legacy unversioned routes 308-redirect → /v1/
 *   - Version negotiation via Accept: application/vnd.agentguard.v1+json
 *   - Deprecation / Sunset headers signal future migration (RFC 8594)
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { authMiddleware } from './middleware/auth.js';
import { tenantRLSMiddleware } from './middleware/tenant.js';
import { errorHandler } from './middleware/error.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import {
  versionNegotiationMiddleware,
  deprecationHeaderMiddleware,
  LEGACY_ROUTE_PREFIXES,
} from './middleware/versioning.js';
import { healthRouter } from './routes/health.js';
import { agentsRouter } from './routes/agents.js';
import { policiesRouter } from './routes/policies.js';
import { actionsRouter } from './routes/actions.js';
import { auditRouter } from './routes/audit.js';
import { auditAnalyticsRouter } from './routes/audit-analytics.js';
import { killswitchRouter } from './routes/killswitch.js';
import { hitlRouter } from './routes/hitl.js';
import { eventsRouter } from './routes/events.js';
import { complianceRouter } from './routes/compliance.js';
import { mcpRouter } from './routes/mcp.js';

export function createApp(): Hono {
  const app = new Hono();

  // ── Global middleware ────────────────────────────────────────────────────────
  app.use('*', logger());
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: process.env['CORS_ORIGIN'] ?? '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id', 'X-API-Key', 'Accept'],
      exposeHeaders: [
        'X-Request-Id',
        'X-API-Version',
        'X-API-Supported-Versions',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-RateLimit-Policy',
        'Retry-After',
        'Deprecation',
        'Sunset',
      ],
    }),
  );

  // ── Version negotiation ───────────────────────────────────────────────────────
  // Inspects Accept header; rejects unsupported versions with 406.
  app.use('*', versionNegotiationMiddleware);

  // ── Deprecation / Sunset headers ─────────────────────────────────────────────
  // Attaches RFC 8594 Deprecation + Sunset headers when a version is sunsetted.
  app.use('/v1/*', deprecationHeaderMiddleware);

  // ── Error handler ────────────────────────────────────────────────────────────
  app.onError(errorHandler);

  // ── Backward-compatible redirects: /<route> → /v1/<route> ────────────────────
  // 308 Permanent Redirect preserves HTTP method (POST stays POST, etc.)
  for (const prefix of LEGACY_ROUTE_PREFIXES) {
    // Exact prefix match:  /health → /v1/health
    app.all(`/${prefix}`, (c) => {
      const url = new URL(c.req.url);
      const target = `/v1${url.pathname}${url.search}`;
      return c.redirect(target, 308);
    });
    // Prefix with sub-path: /agents/abc → /v1/agents/abc
    app.all(`/${prefix}/*`, (c) => {
      const url = new URL(c.req.url);
      const target = `/v1${url.pathname}${url.search}`;
      return c.redirect(target, 308);
    });
  }

  // ── Health (no auth, no rate limit) ─────────────────────────────────────────
  app.route('/v1/health', healthRouter);

  // ── WebSocket events (auth handled inside the route via ?token=) ─────────────
  app.route('/v1/events', eventsRouter);

  // ── Authenticated routes ──────────────────────────────────────────────────────
  app.use('/v1/*', authMiddleware);

  // Per-tenant rate limiting (runs after auth so tenantId is available)
  app.use('/v1/*', rateLimitMiddleware);

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
  app.route('/v1/audit/analytics', auditAnalyticsRouter);
  app.route('/v1/killswitch', killswitchRouter);
  app.route('/v1/hitl', hitlRouter);
  app.route('/v1/compliance', complianceRouter);
  app.route('/v1/mcp', mcpRouter);

  // ── 404 fallback ──────────────────────────────────────────────────────────────
  app.notFound((c) =>
    c.json(
      { error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} not found` } },
      404,
    ),
  );

  return app;
}
