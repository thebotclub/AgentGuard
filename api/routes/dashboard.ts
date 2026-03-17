/**
 * Decision Dashboard Routes
 *
 * Real-time evaluation statistics and activity feed for the tenant dashboard.
 *
 * GET /api/v1/dashboard/stats   — aggregated stats (block rate, latency, active agents)
 * GET /api/v1/dashboard/feed    — recent audit events stream
 * GET /api/v1/dashboard/agents  — per-agent activity breakdown
 */

import { Router, Request, Response } from 'express';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

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

interface AuthedRequest extends Request {
  tenantId: string;
}

// SQLite vs PostgreSQL date arithmetic helpers
const isPg = () => process.env['DB_TYPE'] === 'postgres';
const daysAgo = (n: number) => isPg()
  ? `NOW() - INTERVAL '${n} day'`
  : `datetime('now', '-${n} day${n === 1 ? '' : 's'}')`;

export function createDashboardRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // ── GET /api/v1/dashboard/stats ──────────────────────────────────────────
  router.get('/api/v1/dashboard/stats', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;

    const windowCounts = await db.get<{ total: number; last_24h: number; last_7d: number; last_30d: number }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN created_at >= ${daysAgo(1)}  THEN 1 ELSE 0 END) as last_24h,
         SUM(CASE WHEN created_at >= ${daysAgo(7)}  THEN 1 ELSE 0 END) as last_7d,
         SUM(CASE WHEN created_at >= ${daysAgo(30)} THEN 1 ELSE 0 END) as last_30d
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
         AND created_at >= ${daysAgo(1)}`,
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
         AND created_at >= ${daysAgo(1)}
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
         AND created_at >= ${daysAgo(1)}`,
      [tenantId]
    );
    const activeAgentsCount = Number(activeAgentRow?.cnt ?? 0);

    const topBlockedTools = await db.all<{ tool: string; count: number }>(
      `SELECT tool, COUNT(*) as count
       FROM audit_events
       WHERE tenant_id = ?
         AND result = 'block'
         AND created_at >= ${daysAgo(1)}
       GROUP BY tool
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId]
    );

    const hourExpr = isPg()
      ? `date_trunc('hour', created_at::timestamptz)::text`
      : `strftime('%Y-%m-%dT%H:00:00Z', created_at)`;
    const evalsByHourRaw = await db.all<{ hour: string; total: number; blocked: number; allowed: number; monitored: number }>(
      `SELECT
         ${hourExpr} as hour,
         COUNT(*) as total,
         SUM(CASE WHEN result = 'block' THEN 1 ELSE 0 END) as blocked,
         SUM(CASE WHEN result = 'allow' THEN 1 ELSE 0 END) as allowed,
         SUM(CASE WHEN result = 'monitor' THEN 1 ELSE 0 END) as monitored
       FROM audit_events
       WHERE tenant_id = ?
         AND created_at >= ${daysAgo(1)}
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

  // ── GET /api/v1/dashboard/feed ───────────────────────────────────────────
  router.get('/api/v1/dashboard/feed', auth.requireTenantAuth, async (req: Request, res: Response) => {
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

    res.json({
      events: eventsRaw.map(e => ({
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
      })),
      count: eventsRaw.length,
      fetchedAt: new Date().toISOString(),
    });
  });

  // ── GET /api/v1/dashboard/agents ─────────────────────────────────────────
  router.get('/api/v1/dashboard/agents', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const query = req.query as Record<string, string | undefined>;
    const { from, to } = query;

    const fromDate = from
      ? new Date(from).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to ? new Date(to).toISOString() : new Date().toISOString();

    // Detect if agent_id column exists on audit_events (backward compat)
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

    type AgentActivityRow = {
      agent_id: string;
      agent_name: string | null;
      total_evaluations: number;
      total_blocks: number;
      total_allows: number;
      total_monitors: number;
      last_active: string;
    };

    let agentActivityRaw: AgentActivityRow[];

    if (hasAgentIdColumn) {
      agentActivityRaw = await db.all<AgentActivityRow>(
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
      agentActivityRaw = await db.all<AgentActivityRow>(
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

    res.json({
      period: { from: fromDate, to: toDate },
      agents: agentActivityRaw.map(r => ({
        agentId: r.agent_id,
        agentName: r.agent_name,
        totalEvaluations: Number(r.total_evaluations),
        totalBlocks: Number(r.total_blocks),
        totalAllows: Number(r.total_allows),
        totalMonitors: Number(r.total_monitors),
        lastActive: r.last_active,
      })),
    });
  });

  return router;
}
