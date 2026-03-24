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
import './types.js' // Request.requestId augmentation
import { createRateLimitRoutes } from './routes/rate-limits.js';
import { createCostsRoutes } from './routes/costs.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { createMcpRoutes } from './mcp-routes.js';
import {
  createValidationRoutes,
  runValidationMigrations,
  runValidationMigrationsAsync,
} from './validation-routes.js';
import { createDb } from './db-factory.js';
import { createAuthMiddleware } from './middleware/auth.js';
import {
  rateLimitMiddleware,
  bruteForceMiddleware,
  authEndpointRateLimitMiddleware,
  scimRateLimitMiddleware,
} from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { logger } from './lib/logger.js';
import { loadTemplates, DEFAULT_POLICY, templateCache } from './lib/policy-engine-setup.js';
import { getGlobalKillSwitch } from './routes/audit.js';
import { createEvaluateRoutes } from './routes/evaluate.js';
import { createBatchEvaluateRoutes } from './routes/evaluate-batch.js';
import { createAuditRoutes } from './routes/audit.js';
import { createAgentRoutes } from './routes/agents.js';
import { createWebhookRoutes } from './routes/webhooks.js';
import { createAuthRoutes } from './routes/auth.js';
import { createPlaygroundRoutes } from './routes/playground.js';
import { createApprovalRoutes } from './routes/approvals.js';
import { createPolicyRoutes } from './routes/policy.js';
import { createAnalyticsRoutes } from './routes/analytics.js';
import { createFeedbackRoutes } from './routes/feedback.js';
import { createTelemetryRoutes } from './routes/telemetry.js';
import { createComplianceRoutes } from './routes/compliance.js';
import { createPIIRoutes } from './routes/pii.js';
import { createMcpPolicyRoutes } from './routes/mcp-policy.js';
import { createSlackHitlRoutes } from './routes/slack-hitl.js';
import { createAgentHierarchyRoutes } from './routes/agent-hierarchy.js';
import { createSsoRoutes } from './routes/sso.js';
import { createPolicyGitWebhookRoutes } from './routes/policy-git-webhook.js';
import { createSiemRoutes } from './routes/siem.js';
import { createScimRoutes } from './routes/scim.js';
import { getSiemForwarder } from './lib/siem-forwarder.js';
import { createHealthRoutes } from './routes/health.js';
import { createHealthProbeRoutes } from './routes/health-probes.js';
import { createDocsRoutes } from './routes/docs.js';
import { createLicenseRoutes } from './routes/license.js';
import { createStripeWebhookRoutes } from './routes/stripe-webhook.js';
import { createPricingRoutes } from './routes/pricing.js';
import { createBillingRoutes } from './routes/billing.js';
import { createAlertsRoutes } from './routes/alerts.js';
import { createAnomalyDetector } from './lib/anomaly-detector.js';
import { createEventsRoutes } from './routes/events.js';
import { initPubSub, closePubSub } from './lib/redis-pubsub.js';
import type { IDatabase } from './db-interface.js';

// ── Load Templates ─────────────────────────────────────────────────────────
loadTemplates();

// ── Express App ────────────────────────────────────────────────────────────
const app = express();

// Request ID middleware — attaches/generates request ID and binds a child logger
app.use((req: Request, res: Response, next: NextFunction) => {
  const existing = req.headers['x-request-id'];
  const requestId = Array.isArray(existing) ? existing[0] : existing || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId as string);
  // Attach a child logger scoped to this request (available as req.log in routes)
  (req as Request & { log: ReturnType<typeof logger.child> }).log = logger.child({ requestId });
  next();
});

// ── Trust proxy — only trust Cloudflare and Azure Container Apps ──────────
// This ensures X-Forwarded-For cannot be spoofed by end users.
// Cloudflare always sets the real client IP; Azure load balancer adds one hop.
app.set('trust proxy', 2); // trust up to 2 proxy hops (Cloudflare + Azure LB)

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
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
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
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
    credentials: false,
  }),
);

app.disable('x-powered-by');

// ── llms.txt — plain-text agent discovery (mounted before body parsers) ───
app.get('/llms.txt', (_req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(`# AgentGuard
> Runtime security for AI agents. Evaluate tool calls before execution.

## Setup
For AI agents: GET https://api.agentguard.tech/api/v1/setup
For humans: https://agentguard.tech/docs

## Try Without Signup
POST https://api.agentguard.tech/api/v1/evaluate
Content-Type: application/json
{"tool": "read_file", "params": {"path": "/etc/passwd"}}

## Sign Up (free, no email required)
POST https://api.agentguard.tech/api/v1/signup
Content-Type: application/json
{"name": "My Agent"}

## SDKs
- Python: pip install agentguard
- Node.js: npm install @the-bot-club/agentguard

## Links
- API: https://api.agentguard.tech
- Docs: https://agentguard.tech/docs
- GitHub: https://github.com/thebotclub/AgentGuard
`);
});

// ── Extend Express Request type for raw body capture ────────────────────────
declare global {
   
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

// ── Raw body capture for Slack & Stripe HMAC signature verification ────────
// Must be registered BEFORE express.json so we can read the raw bytes.
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path === '/api/v1/integrations/slack/callback') {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
    });
    req.on('end', () => {
      req.rawBody = data;
      // Manually parse URL-encoded body for Slack payload
      try {
        const params = new URLSearchParams(data);
        const payload = params.get('payload');
        if (payload) {
          req.body = { payload };
        } else {
          req.body = Object.fromEntries(params.entries());
        }
      } catch {
        req.body = {};
      }
      next();
    });
    req.on('error', () => next());
  } else {
    next();
  }
});

// ── Request ID tracing ───────────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID()
  _res.setHeader('x-request-id', req.requestId)
  next()
})

// ── Stripe webhook raw body (must come before express.json) ──────────────
// Stripe requires the raw body for HMAC signature verification.
// Use express.raw() for this specific path to capture it as a Buffer.
app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }));
// GitHub webhook raw body (for HMAC-SHA256 signature verification)
app.use('/api/v1/policies/webhook/github', express.raw({ type: 'application/json', limit: '2mb' }));

app.use(express.json({ limit: '50kb' }));
// URL-encoded body parsing (for non-Slack paths, after the raw body middleware)
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// ── Security Headers (Helmet.js) ───────────────────────────────────────────
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: false, // API server, not serving HTML
  crossOriginEmbedderPolicy: false,
}));

// Request timeout (30s default, prevents hung connections)
// SSE connections are exempt — they're long-lived by design.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/v1/events/stream') {
    // No timeout for SSE connections
    req.setTimeout(0);
    res.setTimeout(0);
  } else {
    req.setTimeout(30_000);
    res.setTimeout(30_000);
  }
  next();
});

// Additional headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()',
  );
  next();
});

// ── IP Rate Limiting ───────────────────────────────────────────────────────
app.use(rateLimitMiddleware);

// ── Stricter rate limiting for auth/signup/SSO endpoints ─────────────────
// Auth endpoints get a tighter per-IP limit (20 req/min) separate from the
// global bucket, to throttle credential-stuffing and account-creation abuse.
app.use(
  ['/api/v1/signup', '/api/v1/auth', '/api/v1/sso', '/api/v1/recover'],
  authEndpointRateLimitMiddleware,
);

// ── SCIM endpoint rate limiting (separate bucket) ─────────────────────────
// Okta/Azure AD connectors use SCIM at low volume; 30 req/min is generous.
// Isolating SCIM into its own bucket prevents provisioning abuse from
// consuming the general auth/API quota.
app.use('/api/scim', scimRateLimitMiddleware);

// ── Brute-Force Protection ─────────────────────────────────────────────────
// Applied to auth-sensitive endpoints only (signup, evaluate, key-verification paths)
// Must run before the auth middleware processes the key.
// Lockout threshold: 5 failures / 15 min; 30 min cooldown.
app.use(['/api/v1/signup', '/api/v1/evaluate', '/api/v1/evaluate/batch', '/api/v1/mcp/evaluate'], bruteForceMiddleware);

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

  // ── Kubernetes health probes (mounted first, before DB health middleware) ──
  // /healthz — liveness (process alive, no DB check)
  // /readyz  — readiness (DB + Redis + migrations)
  app.use(createHealthProbeRoutes(db));

  // ── Root & health routes ───────────────────────────────────────────────
  app.get('/', async (_req: Request, res: Response) => {
    const ks = await getGlobalKillSwitch(db);
    res.json({
      name: 'AgentGuard Policy Engine API',
      version: '0.9.0',
      status: 'online',
      killSwitch: { active: ks.active, activatedAt: ks.at },
      endpoints: {
        'GET  /api/v1/setup': 'Agent-readable setup guide — any AI agent can read this and self-onboard',
        'POST /api/v1/signup': 'Create tenant account and get API key',
        'POST /api/v1/evaluate':
          'Evaluate an agent action against the policy engine',
        'POST /api/v1/evaluate/batch':
          'Evaluate multiple tool calls in one request (max 50)',
        'POST /api/v1/playground/session': 'Create a playground session',
        'POST /api/v1/playground/evaluate':
          'Evaluate with session tracking + audit trail',
        'GET  /api/v1/playground/audit/:sessionId':
          'Get audit trail for a playground session',
        'GET  /api/v1/playground/policy': 'Get the active policy document',
        'GET  /api/v1/playground/scenarios': 'Get preset attack scenarios',
        'GET  /api/v1/audit':
          'Get your persistent audit trail (requires API key)',
        'GET  /api/v1/audit/events':
          'Cursor-based paginated audit events (requires API key)',
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
        'POST /api/v1/billing/checkout':
          'Create Stripe Checkout session for Pro/Enterprise upgrade (requires API key)',
        'POST /api/v1/billing/portal':
          'Create Stripe Customer Portal session to manage subscription (requires API key)',
        'GET  /api/v1/billing/status':
          'Get current subscription status (requires API key)',
        'GET  /api/v1/events/stream':
          'SSE real-time event stream: audit events, HITL notifications (requires API key via ?token=)',
        'GET  /api/v1/events/status':
          'SSE connection metrics (requires admin key)',
      },
      docs: 'https://agentguard.tech',
      dashboard: '/dashboard',
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
      version: '0.9.0',
    });
  });

  // ── Detailed health (unauthenticated) ──────────────────────────────────
  app.use(createHealthRoutes(db));

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
      version: '0.9.0',
      uptime: Math.floor(process.uptime()),
      killSwitch: ks.active,
      db: dbOk ? db.type : 'error',
      templates: templateCache.size,
      tenants: tenantCount,
      activeAgents: agentCount,
    });
  });

  // ── Agent-Readable Setup Guide ────────────────────────────────────────
  // GET /api/v1/setup — Returns a step-by-step guide any AI agent can follow
  // to integrate AgentGuard. No auth required. This is the zero-friction
  // onboarding path: an agent reads this endpoint and does the rest.
  app.get('/api/v1/setup', (_req: Request, res: Response) => {
    res.set('Content-Type', 'application/json');
    res.json({
      name: 'AgentGuard',
      tagline: 'Runtime security for AI agents. Evaluate tool calls before execution.',
      instructions: 'You are an AI agent integrating AgentGuard. Follow the steps below. You can try it immediately without signing up, or sign up for an API key to get audit trails and custom policies.',
      tryNow: {
        description: 'Try immediately — no signup, no API key needed',
        method: 'POST',
        url: 'https://api.agentguard.tech/api/v1/evaluate',
        headers: { 'Content-Type': 'application/json' },
        body: { tool: 'shell_exec', params: { command: 'cat /etc/shadow' } },
        expectedResult: { result: 'block', reason: 'Blocked by rule...' },
        note: 'Works without auth. Rate limited to 10 requests/min. Uses default security policy.',
      },
      fullSetup: [
        {
          step: 1,
          action: 'Sign up to get an API key (email is optional)',
          method: 'POST',
          url: 'https://api.agentguard.tech/api/v1/signup',
          headers: { 'Content-Type': 'application/json' },
          body: { name: 'Your Agent Name' },
          note: 'Returns an apiKey (starts with ag_live_). Store it securely — you cannot retrieve it again.',
        },
        {
          step: 2,
          action: 'Store the API key securely',
          method: 'SET',
          url: 'N/A — local configuration step',
          headers: {},
          body: {},
          note: 'Set AGENTGUARD_API_KEY as an environment variable or store in your framework config. See keyStorage below for framework-specific instructions.',
        },
        {
          step: 3,
          action: 'Before executing any tool, check it against AgentGuard',
          method: 'POST',
          url: 'https://api.agentguard.tech/api/v1/evaluate',
          headers: { 'X-API-Key': 'ag_live_<from step 1>', 'Content-Type': 'application/json' },
          body: { tool: '<the tool you are about to call>', params: { '<param>': '<value>' } },
          responses: {
            allow: 'Safe to execute the tool',
            block: 'Do NOT execute — the tool call is dangerous or violates policy',
            monitor: 'Safe to execute — the call is being logged for audit',
            require_approval: 'Pause and ask a human for approval before executing',
          },
        },
        {
          step: 4,
          action: 'Optionally configure a custom policy for your use case',
          method: 'PUT',
          url: 'https://api.agentguard.tech/api/v1/policy',
          headers: { 'X-API-Key': 'ag_live_<your key>', 'Content-Type': 'application/json' },
          body: { rules: ['<see docs for policy rule format>'] },
          note: 'The default policy blocks dangerous tools and allows everything else. Customise it for production.',
        },
      ],
      keyStorage: {
        env: 'Set AGENTGUARD_API_KEY environment variable',
        openclaw: 'Write to your workspace: echo the key to TOOLS.md or a config file',
        langchain: 'Add AGENTGUARD_API_KEY to your .env file',
        general: 'Store the API key securely. You cannot retrieve it from the API again.',
      },
      defaultPolicy: {
        description: 'New accounts ship with a comprehensive default policy. No configuration needed.',
        blocked: [
          'shell_exec, sudo, chmod, chown, system_command (privilege escalation)',
          'rm, rmdir, unlink, file_delete, drop_table (destructive ops)',
          'eval, eval_code, exec_code, run_code (code execution)',
          'send_email, upload_file, post_webhook, scp (data exfiltration)',
          'read_file /etc/shadow, .pem, .key, .env, .ssh/, .aws/credentials (sensitive file reads)',
        ],
        monitored: ['file reads from /etc/, /var/log/, /proc/, /sys/ (system paths)'],
        requireApproval: ['transfer_funds, create_payment, execute_transaction (over $1000)'],
        allowed: 'Safe read operations and anything not matched above',
      },
      sdks: {
        python: { install: 'pip install agentguard', env: 'AGENTGUARD_API_KEY=ag_live_...' },
        node: { install: 'npm install @the-bot-club/agentguard', env: 'AGENTGUARD_API_KEY=ag_live_...' },
      },
      links: {
        api: 'https://api.agentguard.tech',
        docs: 'https://agentguard.tech/docs',
        github: 'https://github.com/thebotclub/AgentGuard',
        dashboard: 'https://app.agentguard.tech',
      },
    });
  });

  // ── OpenAPI Spec Endpoints ──────────────────────────────────────────────
  // Serve before auth middleware so the spec is publicly accessible.
  {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const jsYaml = await import('js-yaml');
    const specPath = join(__dirname, 'openapi.yaml');

    app.get('/api/v1/openapi.yaml', (_req: Request, res: Response) => {
      try {
        const yaml = readFileSync(specPath, 'utf8');
        res.setHeader('Content-Type', 'text/yaml');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(yaml);
      } catch {
        res.status(500).json({ error: 'Could not load OpenAPI spec' });
      }
    });

    app.get('/api/v1/openapi.json', (_req: Request, res: Response) => {
      try {
        const yamlContent = readFileSync(specPath, 'utf8');
        const jsonSpec = jsYaml.load(yamlContent);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json(jsonSpec);
      } catch {
        res.status(500).json({ error: 'Could not load OpenAPI spec' });
      }
    });
  }

  // ── Dashboard SPA ─────────────────────────────────────────────────────
  // Serve the built-in dashboard SPA at /dashboard (no build step required).
  // Auth happens client-side via API key.
  {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const dashboardPath = join(__dirname, 'public', 'dashboard.html');

    app.get('/dashboard', (_req: Request, res: Response) => {
      try {
        const html = readFileSync(dashboardPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(html);
      } catch {
        res.status(404).json({ error: 'Dashboard not found' });
      }
    });

    app.get('/dashboard/', (_req: Request, res: Response) => {
      try {
        const html = readFileSync(dashboardPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(html);
      } catch {
        res.status(404).json({ error: 'Dashboard not found' });
      }
    });
  }

  // ── DB Health / Graceful Degradation Middleware ────────────────────────
  // If the DB is slow (>5s ping), return 503 with Retry-After to prevent
  // requests from hanging. This acts as a fast-fail before routes attempt queries.
  const DB_HEALTH_TIMEOUT_MS = 5_000;
  app.use(async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const pingPromise = db.ping();
      const timeoutPromise = new Promise<false>((_, reject) =>
        setTimeout(() => reject(new Error('DB ping timeout')), DB_HEALTH_TIMEOUT_MS),
      );
      const ok = await Promise.race([pingPromise, timeoutPromise]).catch(() => false);
      if (!ok) {
        res.setHeader('Retry-After', '30');
        res.status(503).json({ error: 'Database temporarily unavailable. Please retry shortly.' });
        return;
      }
    } catch {
      res.setHeader('Retry-After', '30');
      res.status(503).json({ error: 'Database temporarily unavailable. Please retry shortly.' });
      return;
    }
    next();
  });

  // ── CSRF Protection ───────────────────────────────────────────────────
  // Mount after DB health check. Auth middleware runs per-route; JWT-flag is
  // set before CSRF runs because route auth middleware calls next() before
  // the route handler. For global CSRF enforcement on JWT sessions, we mount
  // it here so it intercepts state-changing requests after auth populates
  // req.jwtAuthenticated (the per-route auth middlewares run before CSRF
  // on their own routes, but csrfMiddleware is a no-op for API-key requests).
  app.use(csrfMiddleware);

  // ── Mount Route Modules ────────────────────────────────────────────────
  app.use(createAuthRoutes(db, auth));
  app.use(createBatchEvaluateRoutes(db, auth));
  app.use(createEvaluateRoutes(db, auth));
  app.use(createAuditRoutes(db, auth));
  app.use(createAgentRoutes(db, auth));
  app.use(createWebhookRoutes(db, auth));
  app.use(createPlaygroundRoutes(db, auth));
  app.use(createApprovalRoutes(db, auth));
  app.use(createPolicyRoutes(db, auth));
  app.use(createAnalyticsRoutes(db, auth));
  app.use(createFeedbackRoutes(db, auth));
  app.use(createTelemetryRoutes(db));
  app.use(createComplianceRoutes(db, auth));
  app.use(createPIIRoutes(db, auth));
  app.use(createSlackHitlRoutes(db, auth));

  // ── MCP Server Policy Enforcement (servers registry + SSRF-aware evaluate) ─
  // Must be mounted BEFORE createMcpRoutes so our /mcp/evaluate takes precedence
  app.use(createMcpPolicyRoutes(db, auth));

  // ── Rate limits, costs, and dashboard ────────────────────────────────
  app.use(createRateLimitRoutes(db, auth));
  app.use(createCostsRoutes(db, auth));
  app.use(createDashboardRoutes(db, auth));
  app.use(createMcpRoutes(db));
  app.use(createValidationRoutes(db));

  // ── Agent Hierarchy (A2A Multi-Agent Policy Propagation) ─────────────
  app.use(createAgentHierarchyRoutes(db, auth));

  // ── SSO Configuration ─────────────────────────────────────────────────
  app.use(createSsoRoutes(db, auth));

  // ── Policy-as-Code Git Webhook (GitOps) ───────────────────────────────
  app.use(createPolicyGitWebhookRoutes(db, auth));

  // ── SIEM Export ───────────────────────────────────────────────────────
  app.use(createSiemRoutes(db, auth));
  app.use(createScimRoutes(db, auth));

  // ── Start SIEM Forwarder ──────────────────────────────────────────────
  getSiemForwarder(db);

  // ── License API ───────────────────────────────────────────────────────
  app.use(createLicenseRoutes(db, auth));

  // ── Stripe Webhook Handler ────────────────────────────────────────────
  // Note: raw body is captured above via express.raw() for this path.
  // No auth middleware — verified by Stripe HMAC signature.
  app.use(createStripeWebhookRoutes(db));

  // ── Alerts & Anomaly Rules ────────────────────────────────────────────
  app.use(createAlertsRoutes(db, auth));

  // ── Billing (Stripe Checkout + Portal) ─────────────────────────────────
  app.use(createBillingRoutes(db, auth));

  // ── Pricing Page Data ─────────────────────────────────────────────────
  app.use(createPricingRoutes());

  // ── SSE Event Stream ──────────────────────────────────────────────────
  // GET /api/v1/events/stream — real-time audit events, HITL notifications
  // GET /api/v1/events/status — admin metrics (connection counts)
  app.use(createEventsRoutes(db, auth));

  // ── API Documentation (Swagger UI) ────────────────────────────────────
  app.use(createDocsRoutes());

  // ── Global Error Handler (MUST be last middleware) ────────────────────
  app.use(errorHandler);

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

  // ── Redis Pub/Sub (SSE fan-out) ────────────────────────────────────────
  // Initialize eagerly so the first subscriber doesn't incur connection latency.
  await initPubSub().catch((e: Error) =>
    console.warn('[pubsub] init error (non-fatal):', e.message),
  );

  // ── Anomaly Detection Loop ─────────────────────────────────────────────
  const detector = createAnomalyDetector(db);
  detector.start();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🛡️  AgentGuard API v0.9.0 running on port ${PORT}`);
    console.log(
      `   ${DEFAULT_POLICY.rules.length} rules loaded | default: ${DEFAULT_POLICY.default}`,
    );
    console.log(`   CORS: ${ALLOWED_ORIGINS.join(', ')}, localhost:*`);
    console.log(`   Rate limit: 10 req/min (unauthenticated) | 100 req/min (authenticated) per IP`);
    console.log(`   DB: ${db.type} | ${process.env['AG_DB_PATH'] || 'default path'}`);
    console.log(
      `   Global kill switch: ${ks.active ? 'ACTIVE ⚠️' : 'inactive'}`,
    );
    if (process.env['ADMIN_KEY']) console.log(`   Admin key: configured`);
    else console.log(`   Admin key: NOT SET (set ADMIN_KEY env var)`);
    if (SEED_API_KEY) console.log(`   Seed API key: registered`);
  });

  // ── Graceful Shutdown ──────────────────────────────────────────────────
  // On SIGTERM / SIGINT:
  //   1. Stop accepting new connections (server.close)
  //   2. Wait for in-flight requests to complete (30s timeout)
  //   3. Close database connections
  //   4. Close Redis connections (if applicable)
  //   5. Exit cleanly

  const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;
  let shuttingDown = false;

  // ── SSE connection registry ─────────────────────────────────────────────
  // Shared registry used by /api/v1/events/stream (routes/events.ts) to track
  // active SSE connections for graceful drain on shutdown.
  // The events route reads this via app.sseRegistry and adds/removes each res.
  const sseRegistry = new Set<import('express').Response>();
  (app as unknown as { sseRegistry: Set<import('express').Response> }).sseRegistry = sseRegistry;

  async function gracefulShutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`Graceful shutdown initiated (${signal})`);

    // 1a. Drain SSE connections — send a close event so clients reconnect gracefully
    if (sseRegistry.size > 0) {
      logger.info(`Draining ${sseRegistry.size} active SSE connection(s)...`);
      for (const sseRes of sseRegistry) {
        try {
          sseRes.write('event: server-shutdown\ndata: {"reason":"graceful-shutdown"}\n\n');
          sseRes.end();
        } catch {
          // ignore — client may have already disconnected
        }
      }
      sseRegistry.clear();
      logger.info('SSE connections drained');
    }

    // 1b. Stop accepting new connections (server.close)
    server.close(async (closeErr?: Error) => {
      if (closeErr) {
        logger.error({ error: String(closeErr) }, 'Error closing HTTP server');
      } else {
        logger.info('HTTP server closed — no more incoming connections');
      }

      // 2. Wait for in-flight evaluations — already handled by server.close
      // (existing keep-alive connections are destroyed after the timeout below)

      // 3. Close database connections
      try {
        if (typeof (db as unknown as { close?: () => Promise<void> }).close === 'function') {
          await (db as unknown as { close: () => Promise<void> }).close();
          logger.info('Database connection closed');
        }
      } catch (e) {
        logger.error({ error: String(e) }, 'Error closing database');
      }

      // 4. Close Redis connections (standalone + sentinel + pubsub)
      try {
        const { closeRedis } = await import('./lib/redis-rate-limiter.js');
        if (typeof closeRedis === 'function') {
          await closeRedis();
          logger.info('Redis standalone connection closed');
        }
      } catch {
        // Redis may not be configured — not an error
      }
      try {
        const { closeSentinel } = await import('./lib/redis-sentinel.js');
        if (typeof closeSentinel === 'function') {
          await closeSentinel();
          logger.info('Redis sentinel connection closed');
        }
      } catch {
        // Sentinel may not be configured
      }
      try {
        await closePubSub();
        logger.info('Redis Pub/Sub connections closed');
      } catch {
        // Pub/Sub may not be connected
      }

      // 5. Close webhook queue worker
      try {
        const { closeWebhookQueue } = await import('./lib/webhook-queue.js');
        if (typeof closeWebhookQueue === 'function') {
          await closeWebhookQueue();
          logger.info('Webhook queue closed');
        }
      } catch {
        // Queue may not be initialized
      }

      // 6. Exit cleanly
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

    // Force-exit after timeout if in-flight requests don't drain
    setTimeout(() => {
      logger.error(`Shutdown timeout (${GRACEFUL_SHUTDOWN_TIMEOUT_MS}ms) exceeded — forcing exit`);
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS).unref();
  }

  process.once('SIGTERM', () => { gracefulShutdown('SIGTERM').catch(() => process.exit(1)); });
  process.once('SIGINT',  () => { gracefulShutdown('SIGINT').catch(() => process.exit(1)); });
}

main().catch((err) => {
  console.error('[fatal] Failed to start server:', err);
  process.exit(1);
});

// Re-export db type so tests/utilities can import it
export type { IDatabase };
