/**
 * AgentGuard API Server — Production Backend
 * SQLite persistence (default) or PostgreSQL (DB_TYPE=postgres + DATABASE_URL).
 * Real auth, tenant isolation, persistent audit trail.
 *
 * Hardened: auth, rate limiting, CORS allowlist, error handling, memory caps.
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createPhase2Routes } from './phase2-routes.js';
import { createMcpRoutes } from './mcp-routes.js';
import {
  createValidationRoutes,
  runValidationMigrations,
  runValidationMigrationsAsync,
} from './validation-routes.js';
import { createDb } from './db-factory.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { loadTemplates, DEFAULT_POLICY, templateCache } from './lib/policy-engine-setup.js';
import { getGlobalKillSwitch } from './routes/audit.js';
import { createEvaluateRoutes } from './routes/evaluate.js';
import { createAuditRoutes } from './routes/audit.js';
import { createAgentRoutes } from './routes/agents.js';
import { createWebhookRoutes } from './routes/webhooks.js';
import { createAuthRoutes } from './routes/auth.js';
import { createPlaygroundRoutes } from './routes/playground.js';
import type { IDatabase } from './db-interface.js';

// ── Load Templates ─────────────────────────────────────────────────────────
loadTemplates();

// ── Express App ────────────────────────────────────────────────────────────
const app = express();

// ── CORS — restrict to known origins ──────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://agentguard.tech',
  'https://www.agentguard.tech',
  'https://app.agentguard.tech',
  'https://demo.agentguard.tech',
  'https://docs.agentguard.tech',
];
if (process.env['CORS_ORIGINS']) {
  ALLOWED_ORIGINS.push(
    ...process.env['CORS_ORIGINS']
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
}
app.use(
  cors({
    origin: (origin, callback) => {
      const isAllowed =
        !origin ||
        ALLOWED_ORIGINS.includes(origin) ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https:\/\/agentguard-[^.]+\.australiaeast\.azurecontainerapps\.io$/.test(
          origin,
        );
      if (isAllowed) {
        callback(null, true);
      } else {
        // Return false — omits CORS headers for disallowed origins (no crash/500)
        callback(null, false);
      }
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
    credentials: false,
  }),
);

app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));

// ── Security Headers ───────────────────────────────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()',
  );
  next();
});

// ── IP Rate Limiting ───────────────────────────────────────────────────────
app.use(rateLimitMiddleware);

// ── Main: Init DB then start server ───────────────────────────────────────
const PORT = parseInt(process.env['PORT'] || '3000', 10);

async function main(): Promise<void> {
  // Initialize database
  const { db, raw } = await createDb();

  // Run migrations
  if (raw) {
    runValidationMigrations(raw);
  } else {
    await runValidationMigrationsAsync(db).catch((e: Error) =>
      console.warn('[migrations] validation columns:', e.message),
    );
  }

  // ── Build shared auth middleware ───────────────────────────────────────
  const auth = createAuthMiddleware(db);

  // ── Root & health routes ───────────────────────────────────────────────
  app.get('/', async (_req: Request, res: Response) => {
    const ks = await getGlobalKillSwitch(db);
    res.json({
      name: 'AgentGuard Policy Engine API',
      version: '0.6.0',
      status: 'online',
      killSwitch: { active: ks.active, activatedAt: ks.at },
      endpoints: {
        'POST /api/v1/signup': 'Create tenant account and get API key',
        'POST /api/v1/evaluate':
          'Evaluate an agent action against the policy engine',
        'POST /api/v1/playground/session': 'Create a playground session',
        'POST /api/v1/playground/evaluate':
          'Evaluate with session tracking + audit trail',
        'GET  /api/v1/playground/audit/:sessionId':
          'Get audit trail for a playground session',
        'GET  /api/v1/playground/policy': 'Get the active policy document',
        'GET  /api/v1/playground/scenarios': 'Get preset attack scenarios',
        'GET  /api/v1/audit':
          'Get your persistent audit trail (requires API key)',
        'GET  /api/v1/audit/verify':
          'Verify audit hash chain integrity (requires API key)',
        'GET  /api/v1/usage':
          'Get usage statistics (requires API key)',
        'GET  /health': 'Health check',
        'GET  /api/v1/killswitch': 'Get kill switch status',
        'POST /api/v1/killswitch':
          'Toggle your tenant kill switch (requires API key)',
        'POST /api/v1/admin/killswitch':
          'Toggle global kill switch (requires ADMIN_KEY)',
        'POST /api/v1/webhooks':
          'Register a webhook (requires API key)',
        'GET  /api/v1/webhooks':
          'List tenant webhooks (requires API key)',
        'DELETE /api/v1/webhooks/:id':
          'Remove a webhook (requires API key)',
        'GET  /api/v1/templates': 'List available policy templates',
        'GET  /api/v1/templates/:name': 'Get a policy template by name',
        'POST /api/v1/templates/:name/apply':
          'Apply a policy template (requires API key)',
        'POST /api/v1/agents':
          'Create an agent with scoped API key (requires tenant API key)',
        'GET  /api/v1/agents':
          'List tenant agents (requires tenant API key)',
        'DELETE /api/v1/agents/:id':
          'Deactivate an agent (requires tenant API key)',
        'POST /api/v1/rate-limits':
          'Create a rate limit rule (requires API key)',
        'GET  /api/v1/rate-limits':
          'List tenant rate limits (requires API key)',
        'DELETE /api/v1/rate-limits/:id':
          'Remove a rate limit rule (requires API key)',
        'POST /api/v1/costs/track':
          'Record a cost event (requires API key)',
        'GET  /api/v1/costs/summary':
          'Aggregated cost report (requires API key)',
        'GET  /api/v1/costs/agents':
          'Per-agent cost breakdown (requires API key)',
        'GET  /api/v1/dashboard/stats':
          'Aggregated evaluation statistics (requires API key)',
        'GET  /api/v1/dashboard/feed':
          'Real-time decision feed (requires API key)',
        'GET  /api/v1/dashboard/agents':
          'Agent activity summary (requires API key)',
        'POST /api/v1/mcp/evaluate':
          'Evaluate an MCP tool call against the policy engine',
        'GET  /api/v1/mcp/config':
          'List MCP proxy configurations (requires API key)',
        'PUT  /api/v1/mcp/config':
          'Create or update an MCP proxy configuration (requires API key)',
        'GET  /api/v1/mcp/sessions':
          'List active MCP sessions (requires API key)',
        'POST /api/v1/agents/:id/validate':
          'Dry-run declared tools through policy engine (requires API key)',
        'GET  /api/v1/agents/:id/readiness':
          'Get agent certification/readiness status (requires API key)',
        'POST /api/v1/agents/:id/certify':
          'Certify agent after 100% coverage validation (requires API key)',
        'POST /api/v1/mcp/admit':
          'MCP server pre-flight admission check (requires API key)',
      },
      docs: 'https://agentguard.tech',
      dashboard: 'https://app.agentguard.tech',
    });
  });

  app.get('/health', async (_req: Request, res: Response) => {
    let dbOk = false;
    try {
      dbOk = await db.ping();
    } catch {
      /* db down */
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      version: '0.6.0',
    });
  });

  // ── Admin health (authenticated) ───────────────────────────────────────
  const adminAuth = createAuthMiddleware(db);
  app.get('/api/v1/admin/health', adminAuth.requireAdminAuth, async (_req: Request, res: Response) => {
    const ks = await getGlobalKillSwitch(db);
    let dbOk = false;
    let tenantCount = 0;
    let agentCount = 0;
    try {
      dbOk = await db.ping();
      tenantCount = await db.countTenants();
      agentCount = await db.countActiveAgents();
    } catch {
      /* db down */
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      engine: 'agentguard',
      version: '0.6.0',
      uptime: Math.floor(process.uptime()),
      killSwitch: ks.active,
      db: dbOk ? db.type : 'error',
      templates: templateCache.size,
      tenants: tenantCount,
      activeAgents: agentCount,
    });
  });

  // ── Mount Route Modules ────────────────────────────────────────────────
  app.use(createAuthRoutes(db, auth));
  app.use(createEvaluateRoutes(db, auth));
  app.use(createAuditRoutes(db, auth));
  app.use(createAgentRoutes(db, auth));
  app.use(createWebhookRoutes(db, auth));
  app.use(createPlaygroundRoutes(db, auth));

  // ── Already-extracted route modules ───────────────────────────────────
  app.use(createPhase2Routes(db));
  app.use(createMcpRoutes(db));
  app.use(createValidationRoutes(db));

  // ── Global Error Handler ───────────────────────────────────────────────
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      // Handle JSON parse errors
      if (
        err instanceof SyntaxError &&
        'status' in err &&
        (err as { status: number }).status === 400
      ) {
        return res
          .status(400)
          .json({ error: 'Invalid JSON in request body' });
      }
      // Handle payload-too-large (express body-parser emits type 'entity.too.large')
      if (
        err instanceof Error &&
        'type' in err &&
        (err as { type: string }).type === 'entity.too.large'
      ) {
        return res
          .status(413)
          .json({ error: 'Request body too large. Maximum size is 50kb.' });
      }
      console.error('[error]', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Internal server error' });
    },
  );

  // ── 404 Handler ────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      hint: 'Try GET / for a list of available endpoints',
      docs: 'https://agentguard.tech',
      dashboard: 'https://app.agentguard.tech',
    });
  });

  // ── Seed tenant from API_KEY env var ──────────────────────────────────
  const SEED_API_KEY = process.env['API_KEY'];
  if (SEED_API_KEY) {
    try {
      // Check if this seed key already exists (by sha256)
      const keySha256 = crypto.createHash('sha256').update(SEED_API_KEY).digest('hex');
      const existing = await db.getApiKeyBySha256(keySha256);
      if (!existing) {
        const seedTenantId = 'seed-' + SEED_API_KEY.slice(-8);
        const existingTenant = await db.getTenant(seedTenantId);
        if (!existingTenant) {
          await db.run(
            'INSERT INTO tenants (id, name, email, plan, created_at) VALUES (?, ?, ?, ?, ?)',
            [
              seedTenantId,
              'AgentGuard Admin',
              'admin@agentguard.tech',
              'enterprise',
              new Date().toISOString(),
            ],
          );
        }
        // Use createApiKey which handles hashing
        await db.createApiKey(SEED_API_KEY, seedTenantId, 'default');
        console.log(`[seed] registered API_KEY as tenant ${seedTenantId} (hashed)`);
      }
    } catch (e) {
      console.error('[seed] failed to register API_KEY:', e);
    }
  }

  const ks = await getGlobalKillSwitch(db);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🛡️  AgentGuard API v0.2.1 running on port ${PORT}`);
    console.log(
      `   ${DEFAULT_POLICY.rules.length} rules loaded | default: ${DEFAULT_POLICY.default}`,
    );
    console.log(`   CORS: ${ALLOWED_ORIGINS.join(', ')}, localhost:*`);
    console.log(`   Rate limit: 100 req/min per IP`);
    console.log(`   DB: ${db.type} | ${process.env['AG_DB_PATH'] || 'default path'}`);
    console.log(
      `   Global kill switch: ${ks.active ? 'ACTIVE ⚠️' : 'inactive'}`,
    );
    if (process.env['ADMIN_KEY']) console.log(`   Admin key: configured`);
    else console.log(`   Admin key: NOT SET (set ADMIN_KEY env var)`);
    if (SEED_API_KEY) console.log(`   Seed API key: registered`);
  });
}

main().catch((err) => {
  console.error('[fatal] Failed to start server:', err);
  process.exit(1);
});

// Re-export db type so tests/utilities can import it
export type { IDatabase };
