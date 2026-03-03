/**
 * AgentGuard Phase 2 Routes
 * Rate Limiting, Cost Attribution, and Decision Dashboard endpoints.
 *
 * Usage: import { createPhase2Routes, checkRateLimit } from './phase2-routes.js'
 * Then in server.ts: app.use(createPhase2Routes(db))
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { IDatabase, TenantRow } from './db-interface.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface ApiKeyRow {
  key: string;
  tenant_id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: number;
}

interface RateLimitRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  window_seconds: number;
  max_requests: number;
  created_at: string;
}

interface CostEventRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  tool: string;
  estimated_cost_cents: number;
  currency: string;
  metadata: string | null;
  created_at: string;
}

interface AuditEventRow {
  id: number;
  tenant_id: string | null;
  session_id: string | null;
  tool: string;
  result: string;
  rule_id: string | null;
  risk_score: number | null;
  reason: string | null;
  duration_ms: number | null;
  created_at: string;
}

/**
 * Extended Request type carrying tenant context set by auth middleware.
 */
interface AuthedRequest extends Request {
  tenant: TenantRow;
  tenantId: string;
}

// ── Auth helpers ───────────────────────────────────────────────────────────

async function lookupTenantFromDb(
  db: IDatabase,
  apiKey: string
): Promise<TenantRow | null> {
  const keyRow = await db.getApiKey(apiKey) as ApiKeyRow | undefined;
  if (!keyRow) return null;
  await db.touchApiKey(apiKey);
  const tenant = await db.getTenant(keyRow.tenant_id);
  return tenant ?? null;
}

function makeRequireTenantAuth(db: IDatabase) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      res.status(401).json({ error: 'X-API-Key header required' });
      return;
    }
    const tenant = await lookupTenantFromDb(db, apiKey);
    if (!tenant) {
      res.status(401).json({ error: 'Invalid or inactive API key' });
      return;
    }
    (req as AuthedRequest).tenant = tenant;
    (req as AuthedRequest).tenantId = tenant.id;
    next();
  };
}

// ── Default cost estimates per tool type (in cents) ───────────────────────
const DEFAULT_TOOL_COSTS: Record<string, number> = {
  api_call: 1,
  db_query: 0.5,
  llm_call: 5,
  file_write: 0.2,
  external_api: 2,
};

function estimateCostForTool(tool: string): number {
  if (DEFAULT_TOOL_COSTS[tool] !== undefined) return DEFAULT_TOOL_COSTS[tool];
  for (const [key, cost] of Object.entries(DEFAULT_TOOL_COSTS)) {
    const prefix = key.split('_')[0];
    if (prefix && tool.startsWith(prefix)) return cost;
  }
  return 0;
}

// ── Exported: checkRateLimit ───────────────────────────────────────────────

/**
 * Sliding window rate limit check (async, works with both SQLite and PostgreSQL).
 */
export async function checkRateLimit(
  db: IDatabase,
  tenantId: string,
  agentId?: string | null
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  // Build the rate_limits query — use SQLite-compatible syntax
  // The IDatabase.get/all methods handle ? → $N conversion for PostgreSQL
  const limits = await db.all<RateLimitRow>(
    `SELECT * FROM rate_limits
     WHERE tenant_id = ?
       AND (agent_id = ? OR agent_id IS NULL)
     ORDER BY
       CASE WHEN agent_id IS NOT NULL THEN 0 ELSE 1 END ASC,
       max_requests ASC`,
    [tenantId, agentId ?? null]
  );

  if (limits.length === 0) {
    return { allowed: true, remaining: -1, resetAt: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const effectiveAgentId = agentId ?? '__tenant__';

  for (const limit of limits) {
    const windowStart = now - limit.window_seconds;

    const row = await db.get<{ total: number }>(
      `SELECT COALESCE(SUM(count), 0) as total
       FROM rate_counters
       WHERE tenant_id = ?
         AND agent_id = ?
         AND window_start > ?`,
      [tenantId, effectiveAgentId, windowStart]
    );

    const count = row?.total ?? 0;
    const remaining = Math.max(0, limit.max_requests - count);
    const resetAt = now + limit.window_seconds;

    if (count >= limit.max_requests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    return { allowed: true, remaining, resetAt };
  }

  return { allowed: true, remaining: -1, resetAt: 0 };
}

/**
 * Increment the rate counter bucket for a tenant/agent (async).
 */
export async function incrementRateCounter(
  db: IDatabase,
  tenantId: string,
  agentId?: string | null
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const effectiveAgentId = agentId ?? '__tenant__';
  const bucketStart = now - (now % 60);

  await db.run(
    `INSERT INTO rate_counters (tenant_id, agent_id, window_start, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(tenant_id, agent_id, window_start)
     DO UPDATE SET count = count + 1`,
    [tenantId, effectiveAgentId, bucketStart]
  );

  // Probabilistic cleanup of stale buckets (1% chance per call)
  if (Math.random() < 0.01) {
    await db.run(
      'DELETE FROM rate_counters WHERE window_start < ?',
      [now - 86400]
    );
  }
}

// ── Exported: createPhase2Routes ──────────────────────────────────────────

export function createPhase2Routes(db: IDatabase): Router {
  const router = Router();
  const requireAuth = makeRequireTenantAuth(db);

  // ── Initialize Phase 2 Tables ────────────────────────────────────────────
  // Run synchronously at startup (before any requests)
  void db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      agent_id TEXT,
      window_seconds INTEGER NOT NULL DEFAULT 60,
      max_requests INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => { /* PG may use different syntax, already handled by schema */ });

  void db.exec(`
    CREATE TABLE IF NOT EXISTS rate_counters (
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tenant_id, agent_id, window_start)
    )
  `).catch(() => { /* already exists */ });

  void db.exec(`
    CREATE TABLE IF NOT EXISTS cost_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      agent_id TEXT,
      tool TEXT NOT NULL,
      estimated_cost_cents REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => { /* already exists */ });

  void db.exec(`CREATE INDEX IF NOT EXISTS idx_rate_limits_tenant ON rate_limits(tenant_id)`).catch(() => {});
  void db.exec(`CREATE INDEX IF NOT EXISTS idx_rate_counters_lookup ON rate_counters(tenant_id, agent_id, window_start)`).catch(() => {});
  void db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_events_tenant ON cost_events(tenant_id, created_at)`).catch(() => {});
  void db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_events_agent ON cost_events(agent_id, created_at)`).catch(() => {});

  // ──────────────────────────────────────────────────────────────────────────
  // RATE LIMITING ROUTES
  // ──────────────────────────────────────────────────────────────────────────

  router.post('/api/v1/rate-limits', requireAuth, async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const { agentId, windowSeconds, maxRequests } = body;

    if (
      windowSeconds === undefined ||
      typeof windowSeconds !== 'number' ||
      !Number.isInteger(windowSeconds) ||
      windowSeconds < 1 ||
      windowSeconds > 86400
    ) {
      res.status(400).json({
        error: 'windowSeconds is required and must be an integer between 1 and 86400',
      });
      return;
    }

    if (
      maxRequests === undefined ||
      typeof maxRequests !== 'number' ||
      !Number.isInteger(maxRequests) ||
      maxRequests < 1 ||
      maxRequests > 1_000_000
    ) {
      res.status(400).json({
        error: 'maxRequests is required and must be an integer between 1 and 1000000',
      });
      return;
    }

    if (agentId !== undefined && agentId !== null) {
      if (typeof agentId !== 'string' || agentId.length > 100) {
        res.status(400).json({ error: 'agentId must be a string (max 100 chars)' });
        return;
      }
    }

    const tenantId = (req as AuthedRequest).tenantId;

    // Validate agent belongs to this tenant if provided
    if (agentId) {
      try {
        const agentExists = await db.get(
          'SELECT id FROM agents WHERE id = ? AND tenant_id = ?',
          [agentId, tenantId]
        );
        if (!agentExists) {
          res.status(404).json({
            error: 'Agent not found or does not belong to your tenant',
          });
          return;
        }
      } catch {
        // agents table may not exist yet — allow through
      }
    }

    const result = await db.get<RateLimitRow>(
      `INSERT INTO rate_limits (tenant_id, agent_id, window_seconds, max_requests)
       VALUES (?, ?, ?, ?)
       RETURNING *`,
      [tenantId, agentId ?? null, windowSeconds, maxRequests]
    );

    if (!result) {
      res.status(500).json({ error: 'Failed to create rate limit' });
      return;
    }

    res.status(201).json({
      id: result.id,
      tenantId: result.tenant_id,
      agentId: result.agent_id,
      windowSeconds: result.window_seconds,
      maxRequests: result.max_requests,
      createdAt: result.created_at,
    });
  });

  router.get('/api/v1/rate-limits', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const limits = await db.all<RateLimitRow>(
      'SELECT * FROM rate_limits WHERE tenant_id = ? ORDER BY created_at DESC',
      [tenantId]
    );

    res.json({
      rateLimits: limits.map(r => ({
        id: r.id,
        tenantId: r.tenant_id,
        agentId: r.agent_id,
        windowSeconds: r.window_seconds,
        maxRequests: r.max_requests,
        createdAt: r.created_at,
      })),
      count: limits.length,
    });
  });

  router.delete('/api/v1/rate-limits/:id', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const id = req.params['id'];

    if (!id || typeof id !== 'string' || id.length > 100) {
      res.status(400).json({ error: 'Invalid rate limit ID' });
      return;
    }

    const existing = await db.get(
      'SELECT id FROM rate_limits WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!existing) {
      res.status(404).json({ error: 'Rate limit not found' });
      return;
    }

    await db.run('DELETE FROM rate_limits WHERE id = ?', [id]);
    res.json({ deleted: true, id });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // COST ATTRIBUTION ROUTES
  // ──────────────────────────────────────────────────────────────────────────

  router.post('/api/v1/costs/track', requireAuth, async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const { agentId, tool, currency = 'USD', metadata } = body;
    let { estimatedCostCents } = body;

    if (!tool || typeof tool !== 'string' || tool.length < 1 || tool.length > 200) {
      res.status(400).json({ error: 'tool is required (string, 1–200 chars)' });
      return;
    }

    if (agentId !== undefined && agentId !== null) {
      if (typeof agentId !== 'string' || agentId.length > 100) {
        res.status(400).json({ error: 'agentId must be a string (max 100 chars)' });
        return;
      }
    }

    if (typeof currency !== 'string' || currency.length > 10) {
      res.status(400).json({ error: 'currency must be a string (max 10 chars)' });
      return;
    }

    if (
      estimatedCostCents !== undefined &&
      estimatedCostCents !== null &&
      (typeof estimatedCostCents !== 'number' || estimatedCostCents < 0)
    ) {
      res.status(400).json({ error: 'estimatedCostCents must be a non-negative number' });
      return;
    }

    if (metadata !== undefined && metadata !== null && typeof metadata !== 'object') {
      res.status(400).json({ error: 'metadata must be an object' });
      return;
    }

    const tenantId = (req as AuthedRequest).tenantId;

    if (estimatedCostCents === undefined || estimatedCostCents === null) {
      estimatedCostCents = estimateCostForTool(tool);
    }

    // Validate agent belongs to tenant if provided
    if (agentId) {
      try {
        const agentExists = await db.get(
          'SELECT id FROM agents WHERE id = ? AND tenant_id = ?',
          [agentId, tenantId]
        );
        if (!agentExists) {
          res.status(404).json({
            error: 'Agent not found or does not belong to your tenant',
          });
          return;
        }
      } catch {
        // agents table not yet created — allow through
      }
    }

    const metadataStr =
      metadata !== undefined && metadata !== null ? JSON.stringify(metadata) : null;

    const result = await db.get<CostEventRow>(
      `INSERT INTO cost_events (tenant_id, agent_id, tool, estimated_cost_cents, currency, metadata)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [tenantId, agentId ?? null, tool, estimatedCostCents, currency, metadataStr]
    );

    if (!result) {
      res.status(500).json({ error: 'Failed to record cost event' });
      return;
    }

    res.status(201).json({
      id: result.id,
      tenantId: result.tenant_id,
      agentId: result.agent_id,
      tool: result.tool,
      estimatedCostCents: result.estimated_cost_cents,
      currency: result.currency,
      metadata: result.metadata ? JSON.parse(result.metadata) : null,
      createdAt: result.created_at,
    });
  });

  router.get('/api/v1/costs/summary', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const query = req.query as Record<string, string | undefined>;
    const { agentId, from, to, groupBy = 'agent' } = query;

    const fromDate = from
      ? new Date(from).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to ? new Date(to).toISOString() : new Date().toISOString();

    const validGroupBy = ['agent', 'tool', 'day'];
    const effectiveGroupBy = validGroupBy.includes(groupBy) ? groupBy : 'agent';

    const conditions: string[] = ['tenant_id = ?', 'created_at >= ?', 'created_at <= ?'];
    const params: (string | null)[] = [tenantId, fromDate, toDate];

    if (agentId) {
      conditions.push('agent_id = ?');
      params.push(agentId);
    }

    const whereClause = conditions.join(' AND ');

    const totals = await db.all<{ event_count: number; total_cost_cents: number; currency: string }>(
      `SELECT
         COUNT(*) as event_count,
         COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
         currency
       FROM cost_events
       WHERE ${whereClause}
       GROUP BY currency`,
      params
    );

    const totalsMapped = totals.map(t => ({
      eventCount: Number(t.event_count),
      totalCostCents: Number(t.total_cost_cents),
      currency: t.currency,
    }));

    let breakdown: unknown[] = [];

    if (effectiveGroupBy === 'agent') {
      const rows = await db.all<{ agent_id: string | null; event_count: number; total_cost_cents: number; currency: string }>(
        `SELECT
           agent_id,
           COUNT(*) as event_count,
           COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
           currency
         FROM cost_events
         WHERE ${whereClause}
         GROUP BY agent_id, currency
         ORDER BY total_cost_cents DESC`,
        params
      );
      breakdown = rows.map(r => ({
        agentId: r.agent_id,
        eventCount: Number(r.event_count),
        totalCostCents: Number(r.total_cost_cents),
        currency: r.currency,
      }));
    } else if (effectiveGroupBy === 'tool') {
      const rows = await db.all<{ tool: string; event_count: number; total_cost_cents: number; currency: string }>(
        `SELECT
           tool,
           COUNT(*) as event_count,
           COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
           currency
         FROM cost_events
         WHERE ${whereClause}
         GROUP BY tool, currency
         ORDER BY total_cost_cents DESC`,
        params
      );
      breakdown = rows.map(r => ({
        tool: r.tool,
        eventCount: Number(r.event_count),
        totalCostCents: Number(r.total_cost_cents),
        currency: r.currency,
      }));
    } else if (effectiveGroupBy === 'day') {
      const rows = await db.all<{ day: string; event_count: number; total_cost_cents: number; currency: string }>(
        `SELECT
           date(created_at) as day,
           COUNT(*) as event_count,
           COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
           currency
         FROM cost_events
         WHERE ${whereClause}
         GROUP BY day, currency
         ORDER BY day ASC`,
        params
      );
      breakdown = rows.map(r => ({
        day: r.day,
        eventCount: Number(r.event_count),
        totalCostCents: Number(r.total_cost_cents),
        currency: r.currency,
      }));
    }

    res.json({
      period: { from: fromDate, to: toDate },
      groupBy: effectiveGroupBy,
      totals: totalsMapped,
      breakdown,
    });
  });

  router.get('/api/v1/costs/agents', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const query = req.query as Record<string, string | undefined>;
    const { from, to } = query;

    const fromDate = from
      ? new Date(from).toISOString()
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to ? new Date(to).toISOString() : new Date().toISOString();

    const rows = await db.all<{ agent_id: string | null; event_count: number; total_cost_cents: number; currency: string; last_event_at: string }>(
      `SELECT
         agent_id,
         COUNT(*) as event_count,
         COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
         currency,
         MAX(created_at) as last_event_at
       FROM cost_events
       WHERE tenant_id = ?
         AND created_at >= ?
         AND created_at <= ?
       GROUP BY agent_id, currency
       ORDER BY total_cost_cents DESC`,
      [tenantId, fromDate, toDate]
    );

    const agents = rows.map(r => ({
      agentId: r.agent_id,
      eventCount: Number(r.event_count),
      totalCostCents: Number(r.total_cost_cents),
      currency: r.currency,
      lastEventAt: r.last_event_at,
    }));

    res.json({ period: { from: fromDate, to: toDate }, agents });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DECISION DASHBOARD ROUTES
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/api/v1/dashboard/stats', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;

    const windowCounts = await db.get<{ total: number; last_24h: number; last_7d: number; last_30d: number }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN created_at >= datetime('now', '-1 day')  THEN 1 ELSE 0 END) as last_24h,
         SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as last_7d,
         SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) as last_30d
       FROM audit_events
       WHERE tenant_id = ?`,
      [tenantId]
    );

    const total24h = Number(windowCounts?.last_24h ?? 0);
    const total7d = Number(windowCounts?.last_7d ?? 0);
    const total30d = Number(windowCounts?.last_30d ?? 0);

    const blockRow = await db.get<{ total: number; blocked: number }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN result = 'block' THEN 1 ELSE 0 END) as blocked
       FROM audit_events
       WHERE tenant_id = ?
         AND created_at >= datetime('now', '-1 day')`,
      [tenantId]
    );

    const blockRate =
      blockRow && Number(blockRow.total) > 0
        ? Math.round((Number(blockRow.blocked) / Number(blockRow.total)) * 10000) / 100
        : 0;

    const latencyRow = await db.get<{ avg: number | null }>(
      `SELECT AVG(duration_ms) as avg
       FROM audit_events
       WHERE tenant_id = ?
         AND created_at >= datetime('now', '-1 day')
         AND duration_ms IS NOT NULL`,
      [tenantId]
    );

    const avgLatencyMs =
      latencyRow?.avg != null
        ? Math.round(Number(latencyRow.avg) * 100) / 100
        : 0;

    const activeAgentRow = await db.get<{ cnt: number }>(
      `SELECT COUNT(DISTINCT COALESCE(session_id, 'default')) as cnt
       FROM audit_events
       WHERE tenant_id = ?
         AND created_at >= datetime('now', '-1 day')`,
      [tenantId]
    );
    const activeAgentsCount = Number(activeAgentRow?.cnt ?? 0);

    const topBlockedTools = await db.all<{ tool: string; count: number }>(
      `SELECT tool, COUNT(*) as count
       FROM audit_events
       WHERE tenant_id = ?
         AND result = 'block'
         AND created_at >= datetime('now', '-1 day')
       GROUP BY tool
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId]
    );

    const evalsByHourRaw = await db.all<{ hour: string; total: number; blocked: number; allowed: number; monitored: number }>(
      `SELECT
         strftime('%Y-%m-%dT%H:00:00Z', created_at) as hour,
         COUNT(*) as total,
         SUM(CASE WHEN result = 'block' THEN 1 ELSE 0 END) as blocked,
         SUM(CASE WHEN result = 'allow' THEN 1 ELSE 0 END) as allowed,
         SUM(CASE WHEN result = 'monitor' THEN 1 ELSE 0 END) as monitored
       FROM audit_events
       WHERE tenant_id = ?
         AND created_at >= datetime('now', '-1 day')
       GROUP BY hour
       ORDER BY hour ASC`,
      [tenantId]
    );

    res.json({
      evaluations: {
        last24h: total24h,
        last7d: total7d,
        last30d: total30d,
      },
      blockRatePercent: blockRate,
      avgLatencyMs,
      activeAgents24h: activeAgentsCount,
      topBlockedTools,
      evaluationsByHour: evalsByHourRaw,
    });
  });

  router.get('/api/v1/dashboard/feed', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const query = req.query as Record<string, string | undefined>;
    const { since, limit: limitStr } = query;

    const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);

    let eventsRaw: AuditEventRow[];

    if (since) {
      let sinceDate: string;
      try {
        sinceDate = new Date(since).toISOString();
      } catch {
        res.status(400).json({
          error: 'Invalid "since" timestamp — use ISO 8601 format (e.g. 2026-03-02T00:00:00Z)',
        });
        return;
      }

      eventsRaw = await db.all<AuditEventRow>(
        `SELECT id, tenant_id, session_id, tool, result, rule_id, risk_score, reason, duration_ms, created_at
         FROM audit_events
         WHERE tenant_id = ?
           AND created_at > ?
         ORDER BY id DESC
         LIMIT ?`,
        [tenantId, sinceDate, limit]
      );
    } else {
      eventsRaw = await db.all<AuditEventRow>(
        `SELECT id, tenant_id, session_id, tool, result, rule_id, risk_score, reason, duration_ms, created_at
         FROM audit_events
         WHERE tenant_id = ?
         ORDER BY id DESC
         LIMIT ?`,
        [tenantId, limit]
      );
    }

    const events = eventsRaw.map(e => ({
      id: e.id,
      tenantId: e.tenant_id,
      sessionId: e.session_id,
      tool: e.tool,
      result: e.result,
      ruleId: e.rule_id,
      riskScore: e.risk_score,
      reason: e.reason,
      durationMs: e.duration_ms,
      createdAt: e.created_at,
    }));

    res.json({
      events,
      count: events.length,
      fetchedAt: new Date().toISOString(),
    });
  });

  router.get('/api/v1/dashboard/agents', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const query = req.query as Record<string, string | undefined>;
    const { from, to } = query;

    const fromDate = from
      ? new Date(from).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to ? new Date(to).toISOString() : new Date().toISOString();

    // Detect if agent_id column exists on audit_events (backward compat)
    // Works on both SQLite (PRAGMA) and PostgreSQL (information_schema)
    let hasAgentIdColumn = false;
    try {
      if (process.env['DB_TYPE'] === 'postgres') {
        const cols = await db.all<{ column_name: string }>(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_events' AND column_name = 'agent_id'"
        );
        hasAgentIdColumn = cols.length > 0;
      } else {
        const cols = await db.all<{ name: string }>("PRAGMA table_info(audit_events)");
        hasAgentIdColumn = cols.some((c) => c.name === 'agent_id');
      }
    } catch {
      hasAgentIdColumn = false;
    }

    let agentActivityRaw: Array<{
      agent_id: string;
      agent_name: string | null;
      total_evaluations: number;
      total_blocks: number;
      total_allows: number;
      total_monitors: number;
      last_active: string;
    }>;

    if (hasAgentIdColumn) {
      agentActivityRaw = await db.all<typeof agentActivityRaw[number]>(
        `SELECT
           COALESCE(ae.agent_id, 'unscoped') as agent_id,
           a.name as agent_name,
           COUNT(*) as total_evaluations,
           SUM(CASE WHEN ae.result = 'block'   THEN 1 ELSE 0 END) as total_blocks,
           SUM(CASE WHEN ae.result = 'allow'   THEN 1 ELSE 0 END) as total_allows,
           SUM(CASE WHEN ae.result = 'monitor' THEN 1 ELSE 0 END) as total_monitors,
           MAX(ae.created_at) as last_active
         FROM audit_events ae
         LEFT JOIN agents a ON a.id = ae.agent_id
         WHERE ae.tenant_id = ?
           AND ae.created_at >= ?
           AND ae.created_at <= ?
         GROUP BY ae.agent_id, a.name
         ORDER BY total_evaluations DESC
         LIMIT 50`,
        [tenantId, fromDate, toDate]
      );
    } else {
      agentActivityRaw = await db.all<typeof agentActivityRaw[number]>(
        `SELECT
           COALESCE(session_id, 'default') as agent_id,
           NULL as agent_name,
           COUNT(*) as total_evaluations,
           SUM(CASE WHEN result = 'block'   THEN 1 ELSE 0 END) as total_blocks,
           SUM(CASE WHEN result = 'allow'   THEN 1 ELSE 0 END) as total_allows,
           SUM(CASE WHEN result = 'monitor' THEN 1 ELSE 0 END) as total_monitors,
           MAX(created_at) as last_active
         FROM audit_events
         WHERE tenant_id = ?
           AND created_at >= ?
           AND created_at <= ?
         GROUP BY session_id
         ORDER BY total_evaluations DESC
         LIMIT 50`,
        [tenantId, fromDate, toDate]
      );
    }

    const agents = agentActivityRaw.map(r => ({
      agentId: r.agent_id,
      agentName: r.agent_name,
      totalEvaluations: Number(r.total_evaluations),
      totalBlocks: Number(r.total_blocks),
      totalAllows: Number(r.total_allows),
      totalMonitors: Number(r.total_monitors),
      lastActive: r.last_active,
    }));

    res.json({
      period: { from: fromDate, to: toDate },
      agents,
    });
  });

  return router;
}
