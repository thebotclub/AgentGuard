/**
 * AgentGuard Phase 2 Routes
 * Rate Limiting, Cost Attribution, and Decision Dashboard endpoints.
 *
 * Usage: import { createPhase2Routes, checkRateLimit } from './phase2-routes.js'
 * Then in server.ts: app.use(createPhase2Routes(db))
 */

import { Router, Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';

// ── Types ──────────────────────────────────────────────────────────────────

interface TenantRow {
  id: string;
  name: string;
  email: string;
  plan: string;
  created_at: string;
  kill_switch_active: number;
  kill_switch_at: string | null;
}

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface RateCounterRow {
  tenant_id: string;
  agent_id: string;
  window_start: number;
  count: number;
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
 * Mirrors the `declare global` augmentation in server.ts.
 */
interface AuthedRequest extends Request {
  tenant: TenantRow;
  tenantId: string;
}

// ── Auth helpers (inline — mirrors server.ts pattern) ─────────────────────

function lookupTenantFromDb(
  db: Database.Database,
  apiKey: string
): TenantRow | null {
  const keyRow = db
    .prepare<[string]>('SELECT * FROM api_keys WHERE key = ? AND is_active = 1')
    .get(apiKey) as ApiKeyRow | undefined;
  if (!keyRow) return null;

  db.prepare<[string]>(
    "UPDATE api_keys SET last_used_at = datetime('now') WHERE key = ?"
  ).run(apiKey);

  const tenant = db
    .prepare<[string]>('SELECT * FROM tenants WHERE id = ?')
    .get(keyRow.tenant_id) as TenantRow | undefined;
  return tenant ?? null;
}

function makeRequireTenantAuth(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      res.status(401).json({ error: 'X-API-Key header required' });
      return;
    }
    const tenant = lookupTenantFromDb(db, apiKey);
    if (!tenant) {
      res.status(401).json({ error: 'Invalid or inactive API key' });
      return;
    }
    // Attach to request — cast matches the global augmentation in server.ts
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
  // Try prefix match (e.g. "llm_query" → "llm_call" prefix "llm")
  for (const [key, cost] of Object.entries(DEFAULT_TOOL_COSTS)) {
    const prefix = key.split('_')[0];
    if (prefix && tool.startsWith(prefix)) return cost;
  }
  return 0;
}

// ── Exported: checkRateLimit ───────────────────────────────────────────────

/**
 * Sliding window rate limit check.
 *
 * Finds applicable rate limits for (tenantId, agentId) — agent-specific rules
 * take precedence over tenant-wide rules. Checks accumulated request count within
 * the configured window using 60-second buckets stored in rate_counters.
 *
 * Returns { allowed, remaining, resetAt } without mutating state.
 * Call incrementRateCounter() after a successful evaluate to track usage.
 */
export function checkRateLimit(
  db: Database.Database,
  tenantId: string,
  agentId?: string | null
): { allowed: boolean; remaining: number; resetAt: number } {
  const limits = db
    .prepare<[string, string | null, string | null]>(
      `SELECT * FROM rate_limits
       WHERE tenant_id = ?
         AND (agent_id = ? OR agent_id IS NULL)
       ORDER BY
         CASE WHEN agent_id IS NOT NULL THEN 0 ELSE 1 END ASC,
         max_requests ASC`
    )
    .all(tenantId, agentId ?? null, agentId ?? null) as RateLimitRow[];

  if (limits.length === 0) {
    return { allowed: true, remaining: -1, resetAt: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const effectiveAgentId = agentId ?? '__tenant__';

  for (const limit of limits) {
    const windowStart = now - limit.window_seconds;

    const row = db
      .prepare<[string, string, number]>(
        `SELECT COALESCE(SUM(count), 0) as total
         FROM rate_counters
         WHERE tenant_id = ?
           AND agent_id = ?
           AND window_start > ?`
      )
      .get(tenantId, effectiveAgentId, windowStart) as { total: number } | undefined;

    const count = row?.total ?? 0;
    const remaining = Math.max(0, limit.max_requests - count);
    const resetAt = now + limit.window_seconds;

    if (count >= limit.max_requests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    // Return result for first (most specific) matching limit
    return { allowed: true, remaining, resetAt };
  }

  return { allowed: true, remaining: -1, resetAt: 0 };
}

/**
 * Increment the rate counter bucket for a tenant/agent.
 * Uses 60-second fixed buckets for the sliding window implementation.
 * Call this after each successful evaluate to track usage.
 */
export function incrementRateCounter(
  db: Database.Database,
  tenantId: string,
  agentId?: string | null
): void {
  const now = Math.floor(Date.now() / 1000);
  const effectiveAgentId = agentId ?? '__tenant__';
  const bucketStart = now - (now % 60); // 60-second buckets

  db.prepare<[string, string, number]>(
    `INSERT INTO rate_counters (tenant_id, agent_id, window_start, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(tenant_id, agent_id, window_start)
     DO UPDATE SET count = count + 1`
  ).run(tenantId, effectiveAgentId, bucketStart);

  // Probabilistic cleanup of stale buckets (1% chance per call)
  if (Math.random() < 0.01) {
    db.prepare<[number]>(
      'DELETE FROM rate_counters WHERE window_start < ?'
    ).run(now - 86400);
  }
}

// ── Exported: createPhase2Routes ──────────────────────────────────────────

export function createPhase2Routes(db: Database.Database): Router {
  const router = Router();
  const requireAuth = makeRequireTenantAuth(db);

  // ── Initialize Phase 2 Tables ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      agent_id TEXT,
      window_seconds INTEGER NOT NULL DEFAULT 60,
      max_requests INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rate_counters (
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tenant_id, agent_id, window_start)
    );

    CREATE TABLE IF NOT EXISTS cost_events (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      agent_id TEXT,
      tool TEXT NOT NULL,
      estimated_cost_cents REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rate_limits_tenant ON rate_limits(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_rate_counters_lookup ON rate_counters(tenant_id, agent_id, window_start);
    CREATE INDEX IF NOT EXISTS idx_cost_events_tenant ON cost_events(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_cost_events_agent ON cost_events(agent_id, created_at);
  `);

  // ──────────────────────────────────────────────────────────────────────────
  // RATE LIMITING ROUTES
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/rate-limits
   * Create a rate limit for a tenant (or specific agent within tenant).
   *
   * Body: { agentId?: string, windowSeconds: number, maxRequests: number }
   */
  router.post('/api/v1/rate-limits', requireAuth, (req: Request, res: Response) => {
    const body = req.body ?? {};
    const { agentId, windowSeconds, maxRequests } = body;

    // Validate
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
      const agentExists = db
        .prepare<[string, string]>('SELECT id FROM agents WHERE id = ? AND tenant_id = ?')
        .get(agentId, tenantId);
      if (!agentExists) {
        // Table may not exist yet (Phase 1.3 not merged) — skip validation in that case
        try {
          db.prepare("SELECT 1 FROM agents LIMIT 1").get();
          res.status(404).json({
            error: 'Agent not found or does not belong to your tenant',
          });
          return;
        } catch {
          // agents table doesn't exist yet — allow it, will be validated once Phase 1.3 lands
        }
      }
    }

    const result = db
      .prepare<[string, string | null, number, number]>(
        `INSERT INTO rate_limits (tenant_id, agent_id, window_seconds, max_requests)
         VALUES (?, ?, ?, ?)
         RETURNING *`
      )
      .get(tenantId, agentId ?? null, windowSeconds, maxRequests) as RateLimitRow | undefined;

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

  /**
   * GET /api/v1/rate-limits
   * List all rate limits for the authenticated tenant.
   */
  router.get('/api/v1/rate-limits', requireAuth, (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const limits = db
      .prepare<[string]>(
        'SELECT * FROM rate_limits WHERE tenant_id = ? ORDER BY created_at DESC'
      )
      .all(tenantId) as RateLimitRow[];

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

  /**
   * DELETE /api/v1/rate-limits/:id
   * Remove a rate limit rule.
   */
  router.delete('/api/v1/rate-limits/:id', requireAuth, (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const id = req.params['id'];

    if (!id || typeof id !== 'string' || id.length > 100) {
      res.status(400).json({ error: 'Invalid rate limit ID' });
      return;
    }

    const existing = db
      .prepare<[string, string]>(
        'SELECT id FROM rate_limits WHERE id = ? AND tenant_id = ?'
      )
      .get(id, tenantId);

    if (!existing) {
      res.status(404).json({ error: 'Rate limit not found' });
      return;
    }

    db.prepare<[string]>('DELETE FROM rate_limits WHERE id = ?').run(id);
    res.json({ deleted: true, id });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // COST ATTRIBUTION ROUTES
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/costs/track
   * Record a cost event. estimatedCostCents is auto-estimated from tool type if omitted.
   *
   * Body: { agentId?: string, tool: string, estimatedCostCents?: number,
   *         currency?: string, metadata?: object }
   */
  router.post('/api/v1/costs/track', requireAuth, (req: Request, res: Response) => {
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

    // Auto-estimate cost if not provided
    if (estimatedCostCents === undefined || estimatedCostCents === null) {
      estimatedCostCents = estimateCostForTool(tool);
    }

    // Validate agent belongs to tenant if provided (gracefully skip if table missing)
    if (agentId) {
      try {
        const agentExists = db
          .prepare<[string, string]>(
            'SELECT id FROM agents WHERE id = ? AND tenant_id = ?'
          )
          .get(agentId, tenantId);
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

    const result = db
      .prepare<[string, string | null, string, number, string, string | null]>(
        `INSERT INTO cost_events (tenant_id, agent_id, tool, estimated_cost_cents, currency, metadata)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .get(
        tenantId,
        agentId ?? null,
        tool,
        estimatedCostCents,
        currency,
        metadataStr
      ) as CostEventRow | undefined;

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

  /**
   * GET /api/v1/costs/summary
   * Aggregated cost report.
   *
   * Query params:
   *   agentId  — filter to specific agent
   *   from     — ISO 8601 start date (default: 7 days ago)
   *   to       — ISO 8601 end date (default: now)
   *   groupBy  — "agent" | "tool" | "day" (default: "agent")
   */
  router.get('/api/v1/costs/summary', requireAuth, (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const query = req.query as Record<string, string | undefined>;
    const { agentId, from, to, groupBy = 'agent' } = query;

    const fromDate = from
      ? new Date(from).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to ? new Date(to).toISOString() : new Date().toISOString();

    const validGroupBy = ['agent', 'tool', 'day'];
    const effectiveGroupBy = validGroupBy.includes(groupBy) ? groupBy : 'agent';

    // Build WHERE clause dynamically
    const conditions: string[] = [
      'tenant_id = ?',
      'created_at >= ?',
      'created_at <= ?',
    ];
    const params: (string | null)[] = [tenantId, fromDate, toDate];

    if (agentId) {
      conditions.push('agent_id = ?');
      params.push(agentId);
    }

    const whereClause = conditions.join(' AND ');

    // Totals (grouped by currency)
    const totals = db
      .prepare<(string | null)[]>(
        `SELECT
           COUNT(*) as event_count,
           COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
           currency
         FROM cost_events
         WHERE ${whereClause}
         GROUP BY currency`
      )
      .all(...params) as Array<{
        event_count: number;
        total_cost_cents: number;
        currency: string;
      }>;

    // Map totals to camelCase
    const totalsMapped = totals.map(t => ({
      eventCount: t.event_count,
      totalCostCents: t.total_cost_cents,
      currency: t.currency,
    }));

    // Grouped breakdown
    let breakdown: unknown[] = [];

    if (effectiveGroupBy === 'agent') {
      const rows = db
        .prepare<(string | null)[]>(
          `SELECT
             agent_id,
             COUNT(*) as event_count,
             COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
             currency
           FROM cost_events
           WHERE ${whereClause}
           GROUP BY agent_id, currency
           ORDER BY total_cost_cents DESC`
        )
        .all(...params) as Array<{ agent_id: string | null; event_count: number; total_cost_cents: number; currency: string }>;
      breakdown = rows.map(r => ({
        agentId: r.agent_id,
        eventCount: r.event_count,
        totalCostCents: r.total_cost_cents,
        currency: r.currency,
      }));
    } else if (effectiveGroupBy === 'tool') {
      const rows = db
        .prepare<(string | null)[]>(
          `SELECT
             tool,
             COUNT(*) as event_count,
             COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
             currency
           FROM cost_events
           WHERE ${whereClause}
           GROUP BY tool, currency
           ORDER BY total_cost_cents DESC`
        )
        .all(...params) as Array<{ tool: string; event_count: number; total_cost_cents: number; currency: string }>;
      breakdown = rows.map(r => ({
        tool: r.tool,
        eventCount: r.event_count,
        totalCostCents: r.total_cost_cents,
        currency: r.currency,
      }));
    } else if (effectiveGroupBy === 'day') {
      const rows = db
        .prepare<(string | null)[]>(
          `SELECT
             date(created_at) as day,
             COUNT(*) as event_count,
             COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
             currency
           FROM cost_events
           WHERE ${whereClause}
           GROUP BY day, currency
           ORDER BY day ASC`
        )
        .all(...params) as Array<{ day: string; event_count: number; total_cost_cents: number; currency: string }>;
      breakdown = rows.map(r => ({
        day: r.day,
        eventCount: r.event_count,
        totalCostCents: r.total_cost_cents,
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

  /**
   * GET /api/v1/costs/agents
   * Per-agent cost breakdown (default: last 30 days).
   *
   * Query params: from, to (ISO 8601)
   */
  router.get('/api/v1/costs/agents', requireAuth, (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const query = req.query as Record<string, string | undefined>;
    const { from, to } = query;

    const fromDate = from
      ? new Date(from).toISOString()
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to ? new Date(to).toISOString() : new Date().toISOString();

    const rows = db
      .prepare<[string, string, string]>(
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
         ORDER BY total_cost_cents DESC`
      )
      .all(tenantId, fromDate, toDate) as Array<{
        agent_id: string | null;
        event_count: number;
        total_cost_cents: number;
        currency: string;
        last_event_at: string;
      }>;

    const agents = rows.map(r => ({
      agentId: r.agent_id,
      eventCount: r.event_count,
      totalCostCents: r.total_cost_cents,
      currency: r.currency,
      lastEventAt: r.last_event_at,
    }));

    res.json({ period: { from: fromDate, to: toDate }, agents });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DECISION DASHBOARD ROUTES
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/dashboard/stats
   * Aggregated evaluation statistics for the authenticated tenant.
   *
   * Returns:
   *  - evaluations: { last24h, last7d, last30d }
   *  - blockRatePercent: percentage (last 24h)
   *  - avgLatencyMs: average evaluation duration (last 24h)
   *  - activeAgents24h: distinct sessions/agents in last 24h
   *  - topBlockedTools: top 10 blocked tools (last 24h)
   *  - evaluationsByHour: hourly breakdown (last 24h)
   */
  router.get('/api/v1/dashboard/stats', requireAuth, (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;

    // Totals for each window
    const windowCounts = db
      .prepare<[string]>(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN created_at >= datetime('now', '-1 day')  THEN 1 ELSE 0 END) as last_24h,
           SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as last_7d,
           SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) as last_30d
         FROM audit_events
         WHERE tenant_id = ?`
      )
      .get(tenantId) as {
        total: number;
        last_24h: number;
        last_7d: number;
        last_30d: number;
      } | undefined;

    const total24h = windowCounts?.last_24h ?? 0;
    const total7d = windowCounts?.last_7d ?? 0;
    const total30d = windowCounts?.last_30d ?? 0;

    // Block rate in last 24h
    const blockRow = db
      .prepare<[string]>(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN result = 'block' THEN 1 ELSE 0 END) as blocked
         FROM audit_events
         WHERE tenant_id = ?
           AND created_at >= datetime('now', '-1 day')`
      )
      .get(tenantId) as { total: number; blocked: number } | undefined;

    const blockRate =
      blockRow && blockRow.total > 0
        ? Math.round((blockRow.blocked / blockRow.total) * 10000) / 100
        : 0;

    // Average latency (last 24h)
    const latencyRow = db
      .prepare<[string]>(
        `SELECT AVG(duration_ms) as avg
         FROM audit_events
         WHERE tenant_id = ?
           AND created_at >= datetime('now', '-1 day')
           AND duration_ms IS NOT NULL`
      )
      .get(tenantId) as { avg: number | null } | undefined;

    const avgLatencyMs =
      latencyRow?.avg != null
        ? Math.round((latencyRow.avg as number) * 100) / 100
        : 0;

    // Active agents (distinct session_ids in last 24h — proxy until agent_id column exists)
    const activeAgentRow = db
      .prepare<[string]>(
        `SELECT COUNT(DISTINCT COALESCE(session_id, 'default')) as cnt
         FROM audit_events
         WHERE tenant_id = ?
           AND created_at >= datetime('now', '-1 day')`
      )
      .get(tenantId) as { cnt: number } | undefined;
    const activeAgentsCount = activeAgentRow?.cnt ?? 0;

    // Top blocked tools (last 24h, top 10)
    const topBlockedTools = db
      .prepare<[string]>(
        `SELECT tool, COUNT(*) as count
         FROM audit_events
         WHERE tenant_id = ?
           AND result = 'block'
           AND created_at >= datetime('now', '-1 day')
         GROUP BY tool
         ORDER BY count DESC
         LIMIT 10`
      )
      .all(tenantId) as Array<{ tool: string; count: number }>;

    // Evaluations by hour (last 24h)
    const evalsByHourRaw = db
      .prepare<[string]>(
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
         ORDER BY hour ASC`
      )
      .all(tenantId) as Array<{
        hour: string;
        total: number;
        blocked: number;
        allowed: number;
        monitored: number;
      }>;

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

  /**
   * GET /api/v1/dashboard/feed
   * Last N decisions as a real-time feed.
   *
   * Query params:
   *   since  — ISO 8601 timestamp for polling (returns events after this time)
   *   limit  — max events to return (default: 50, max: 200)
   */
  router.get('/api/v1/dashboard/feed', requireAuth, (req: Request, res: Response) => {
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

      eventsRaw = db
        .prepare<[string, string, number]>(
          `SELECT id, tenant_id, session_id, tool, result, rule_id, risk_score, reason, duration_ms, created_at
           FROM audit_events
           WHERE tenant_id = ?
             AND created_at > ?
           ORDER BY id DESC
           LIMIT ?`
        )
        .all(tenantId, sinceDate, limit) as AuditEventRow[];
    } else {
      eventsRaw = db
        .prepare<[string, number]>(
          `SELECT id, tenant_id, session_id, tool, result, rule_id, risk_score, reason, duration_ms, created_at
           FROM audit_events
           WHERE tenant_id = ?
           ORDER BY id DESC
           LIMIT ?`
        )
        .all(tenantId, limit) as AuditEventRow[];
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

  /**
   * GET /api/v1/dashboard/agents
   * Agent activity summary — evaluations, blocks, last active time.
   *
   * Query params: from, to (ISO 8601, default: last 7 days)
   *
   * Gracefully handles both Phase 1.3 merged (agent_id column on audit_events)
   * and not-yet-merged (falls back to session_id grouping).
   */
  router.get('/api/v1/dashboard/agents', requireAuth, (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const query = req.query as Record<string, string | undefined>;
    const { from, to } = query;

    const fromDate = from
      ? new Date(from).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to ? new Date(to).toISOString() : new Date().toISOString();

    // Detect if agent_id column exists on audit_events (Phase 1.3 may not be merged yet)
    let hasAgentIdColumn = false;
    try {
      const cols = db
        .prepare("PRAGMA table_info(audit_events)")
        .all() as Array<{ name: string }>;
      hasAgentIdColumn = cols.some((c) => c.name === 'agent_id');
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
      // Use agent_id + join to agents table for names
      agentActivityRaw = db
        .prepare<[string, string, string]>(
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
           LIMIT 50`
        )
        .all(tenantId, fromDate, toDate) as typeof agentActivityRaw;
    } else {
      // Fallback: group by session_id as a proxy for agent
      agentActivityRaw = db
        .prepare<[string, string, string]>(
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
           LIMIT 50`
        )
        .all(tenantId, fromDate, toDate) as typeof agentActivityRaw;
    }

    const agents = agentActivityRaw.map(r => ({
      agentId: r.agent_id,
      agentName: r.agent_name,
      totalEvaluations: r.total_evaluations,
      totalBlocks: r.total_blocks,
      totalAllows: r.total_allows,
      totalMonitors: r.total_monitors,
      lastActive: r.last_active,
    }));

    res.json({
      period: { from: fromDate, to: toDate },
      agents,
    });
  });

  return router;
}
