/**
 * AgentGuard — Route Registration
 *
 * Mounts all API routes in the correct order. Called after database
 * initialization so every route has access to the DB and auth middleware.
 */
import type { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IDatabase } from '../db-interface.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { csrfMiddleware } from '../middleware/csrf.js';
import { errorHandler } from '../middleware/error-handler.js';
import { logger } from '../lib/logger.js';
import { templateCache } from '../lib/policy-engine-setup.js';
import { getGlobalKillSwitch, deliverWebhook } from './audit.js';
import { getSiemForwarder } from '../lib/siem-forwarder.js';

// Route module imports
import { createHealthProbeRoutes } from './health-probes.js';
import { createHealthRoutes } from './health.js';
import { createAuthRoutes } from './auth.js';
import { createBatchEvaluateRoutes } from './evaluate/batch.js';
import { createEvaluateRoutes } from './evaluate/index.js';
import { createAuditRoutes } from './audit.js';
import { createAgentRoutes } from './agents.js';
import { createWebhookRoutes } from './webhooks.js';
import { createPlaygroundRoutes } from './playground.js';
import { createApprovalRoutes } from './approvals.js';
import { createPolicyRoutes } from './policy.js';
import { createAnalyticsRoutes } from './analytics.js';
import { createFeedbackRoutes } from './feedback.js';
import { createTelemetryRoutes } from './telemetry.js';
import { createComplianceRoutes } from './compliance.js';
import { createPIIRoutes } from './pii.js';
import { createSlackHitlRoutes } from './slack-hitl.js';
import { createMcpPolicyRoutes } from './mcp-policy.js';
import { createRateLimitRoutes } from './rate-limits.js';
import { createCostsRoutes } from './costs.js';
import { createDashboardRoutes } from './dashboard.js';
import { createMcpRoutes } from '../mcp-routes.js';
import { createValidationRoutes } from '../validation-routes.js';
import { createAgentHierarchyRoutes } from './agent-hierarchy.js';
import { createSsoRoutes } from './sso.js';
import { createPolicyGitWebhookRoutes } from './policy-git-webhook/index.js';
import { createSiemRoutes } from './siem.js';
import { createScimRoutes } from './scim/index.js';
import { createLicenseRoutes } from './license.js';
import { createStripeWebhookRoutes } from './stripe-webhook/index.js';
import { createAlertsRoutes } from './alerts.js';
import { createBillingRoutes } from './billing.js';
import { createPricingRoutes } from './pricing.js';
import { createEventsRoutes } from './events.js';
import { createDocsRoutes } from './docs.js';
import { createMetricsRoutes } from './metrics.js';

/** Auth middleware instance type (returned by createAuthMiddleware) */
type Auth = ReturnType<typeof createAuthMiddleware>;

/**
 * Register all routes on the Express app.
 * Order matters — middleware and routes run in registration order.
 */
export function registerRoutes(app: Express, db: IDatabase, auth: Auth): void {
  // ── Security disclosure ──────────────────────────────────────────────────
  app.get('/.well-known/security.txt', (_req: Request, res: Response) => {
    res.type('text/plain').sendFile(path.join(__dirname, '..', 'public', '.well-known', 'security.txt'));
  });

  // ── Kubernetes health probes (before DB health middleware) ───────────────
  app.use(createHealthProbeRoutes(db));

  // ── Prometheus metrics (no DB dependency, no auth) ───────────────────────
  app.use(createMetricsRoutes());

  // ── Root endpoint ────────────────────────────────────────────────────────
  app.get('/', async (_req: Request, res: Response) => {
    const ks = await getGlobalKillSwitch(db);
    res.json({
      name: 'AgentGuard Policy Engine API',
      version: '0.10.0',
      status: 'online',
      killSwitch: { active: ks.active, activatedAt: ks.at },
      endpoints: {
        'GET  /api/v1/setup': 'Agent-readable setup guide — any AI agent can read this and self-onboard',
        'POST /api/v1/signup': 'Create tenant account and get API key',
        'POST /api/v1/evaluate': 'Evaluate an agent action against the policy engine',
        'POST /api/v1/evaluate/batch': 'Evaluate multiple tool calls in one request (max 50)',
        'POST /api/v1/playground/session': 'Create a playground session',
        'POST /api/v1/playground/evaluate': 'Evaluate with session tracking + audit trail',
        'GET  /api/v1/playground/audit/:sessionId': 'Get audit trail for a playground session',
        'GET  /api/v1/playground/policy': 'Get the active policy document',
        'GET  /api/v1/playground/scenarios': 'Get preset attack scenarios',
        'GET  /api/v1/audit': 'Get your persistent audit trail (requires API key)',
        'GET  /api/v1/audit/events': 'Cursor-based paginated audit events (requires API key)',
        'GET  /api/v1/audit/verify': 'Verify audit hash chain integrity (requires API key)',
        'GET  /api/v1/usage': 'Get usage statistics (requires API key)',
        'GET  /health': 'Health check',
        'GET  /api/v1/killswitch': 'Get kill switch status',
        'POST /api/v1/killswitch': 'Toggle your tenant kill switch (requires API key)',
        'POST /api/v1/admin/killswitch': 'Toggle global kill switch (requires ADMIN_KEY)',
        'POST /api/v1/webhooks': 'Register a webhook (requires API key)',
        'GET  /api/v1/webhooks': 'List tenant webhooks (requires API key)',
        'DELETE /api/v1/webhooks/:id': 'Remove a webhook (requires API key)',
        'GET  /api/v1/templates': 'List available policy templates',
        'GET  /api/v1/templates/:name': 'Get a policy template by name',
        'POST /api/v1/templates/:name/apply': 'Apply a policy template (requires API key)',
        'POST /api/v1/agents': 'Create an agent with scoped API key (requires tenant API key)',
        'GET  /api/v1/agents': 'List tenant agents (requires tenant API key)',
        'DELETE /api/v1/agents/:id': 'Deactivate an agent (requires tenant API key)',
        'POST /api/v1/rate-limits': 'Create a rate limit rule (requires API key)',
        'GET  /api/v1/rate-limits': 'List tenant rate limits (requires API key)',
        'DELETE /api/v1/rate-limits/:id': 'Remove a rate limit rule (requires API key)',
        'POST /api/v1/costs/track': 'Record a cost event (requires API key)',
        'GET  /api/v1/costs/summary': 'Aggregated cost report (requires API key)',
        'GET  /api/v1/costs/agents': 'Per-agent cost breakdown (requires API key)',
        'GET  /api/v1/dashboard/stats': 'Aggregated evaluation statistics (requires API key)',
        'GET  /api/v1/dashboard/feed': 'Real-time decision feed (requires API key)',
        'GET  /api/v1/dashboard/agents': 'Agent activity summary (requires API key)',
        'POST /api/v1/mcp/evaluate': 'Evaluate an MCP tool call against the policy engine',
        'GET  /api/v1/mcp/config': 'List MCP proxy configurations (requires API key)',
        'PUT  /api/v1/mcp/config': 'Create or update an MCP proxy configuration (requires API key)',
        'GET  /api/v1/mcp/sessions': 'List active MCP sessions (requires API key)',
        'POST /api/v1/agents/:id/validate': 'Dry-run declared tools through policy engine (requires API key)',
        'GET  /api/v1/agents/:id/readiness': 'Get agent certification/readiness status (requires API key)',
        'POST /api/v1/agents/:id/certify': 'Certify agent after 100% coverage validation (requires API key)',
        'POST /api/v1/mcp/admit': 'MCP server pre-flight admission check (requires API key)',
        'POST /api/v1/billing/checkout': 'Create Stripe Checkout session for Pro/Enterprise upgrade (requires API key)',
        'POST /api/v1/billing/portal': 'Create Stripe Customer Portal session to manage subscription (requires API key)',
        'GET  /api/v1/billing/status': 'Get current subscription status (requires API key)',
        'GET  /api/v1/events/stream': 'SSE real-time event stream: audit events, HITL notifications (requires API key via ?token=)',
        'GET  /api/v1/events/status': 'SSE connection metrics (requires admin key)',
      },
      docs: 'https://agentguard.tech',
      dashboard: '/dashboard',
    });
  });

  // ── Health endpoint ──────────────────────────────────────────────────────
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
      version: '0.10.0',
    });
  });

  // ── Detailed health (unauthenticated) ────────────────────────────────────
  app.use(createHealthRoutes(db));

  // ── Admin health (authenticated) ─────────────────────────────────────────
  app.get('/api/v1/admin/health', auth.requireAdminAuth, async (_req: Request, res: Response) => {
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
      version: '0.10.0',
      uptime: Math.floor(process.uptime()),
      killSwitch: ks.active,
      db: dbOk ? db.type : 'error',
      templates: templateCache.size,
      tenants: tenantCount,
      activeAgents: agentCount,
    });
  });

  // ── Agent-Readable Setup Guide ───────────────────────────────────────────
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

  // ── OpenAPI Spec Endpoints ───────────────────────────────────────────────
  {
    const specPath = join(__dirname, '..', 'openapi.yaml');

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

    app.get('/api/v1/openapi.json', async (_req: Request, res: Response) => {
      try {
        const jsYaml = await import('js-yaml');
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

  // ── Dashboard SPA ────────────────────────────────────────────────────────
  {
    const dashboardPath = join(__dirname, '..', 'public', 'dashboard.html');
    const serveDashboard = (_req: Request, res: Response) => {
      try {
        const html = readFileSync(dashboardPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(html);
      } catch {
        res.status(404).json({ error: 'Dashboard not found' });
      }
    };
    app.get('/dashboard', serveDashboard);
    app.get('/dashboard/', serveDashboard);
  }

  // ── DB Health / Graceful Degradation Middleware ──────────────────────────
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

  // ── CSRF Protection ──────────────────────────────────────────────────────
  app.use(csrfMiddleware);

  // ── Mount Route Modules ──────────────────────────────────────────────────
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

  // MCP Server Policy Enforcement — must be BEFORE createMcpRoutes
  app.use(createMcpPolicyRoutes(db, auth));

  app.use(createRateLimitRoutes(db, auth));
  app.use(createCostsRoutes(db, auth));
  app.use(createDashboardRoutes(db, auth));
  app.use(createMcpRoutes(db));
  app.use(createValidationRoutes(db));
  app.use(createAgentHierarchyRoutes(db, auth));
  app.use(createSsoRoutes(db, auth));
  app.use(createPolicyGitWebhookRoutes(db, auth));
  app.use(createSiemRoutes(db, auth));
  app.use(createScimRoutes(db, auth));

  // SIEM Forwarder — initialize eagerly
  getSiemForwarder(db);

  app.use(createLicenseRoutes(db, auth));
  app.use(createStripeWebhookRoutes(db));
  app.use(createAlertsRoutes(db, auth));
  app.use(createBillingRoutes(db, auth));
  app.use(createPricingRoutes());
  app.use(createEventsRoutes(db, auth));
  app.use(createDocsRoutes());

  // ── Global Error Handler (MUST be last middleware) ───────────────────────
  app.use(errorHandler);

  // ── 404 Handler ──────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      hint: 'Try GET / for a list of available endpoints',
      docs: 'https://agentguard.tech',
      dashboard: 'https://app.agentguard.tech',
    });
  });
}

// Re-export deliverWebhook for the webhook retry cron callback
export { deliverWebhook };
