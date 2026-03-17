/**
 * Cost Attribution Routes
 *
 * Track and query estimated tool-call costs per tenant/agent.
 *
 * POST /api/v1/costs/track          — record a cost event
 * GET  /api/v1/costs/summary        — aggregated cost breakdown
 * GET  /api/v1/costs/agents         — per-agent cost summary
 */

import { Router, Request, Response } from 'express';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

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

interface AuthedRequest extends Request {
  tenantId: string;
}

// ── Default cost estimates per tool type (in cents) ─────────────────────────
const DEFAULT_TOOL_COSTS: Record<string, number> = {
  api_call: 1,
  db_query: 0.5,
  llm_call: 5,
  file_write: 0.2,
  external_api: 2,
};

function estimateCostForTool(tool: string): number {
  if (DEFAULT_TOOL_COSTS[tool] !== undefined) return DEFAULT_TOOL_COSTS[tool]!;
  for (const [key, cost] of Object.entries(DEFAULT_TOOL_COSTS)) {
    const prefix = key.split('_')[0];
    if (prefix && tool.startsWith(prefix)) return cost;
  }
  return 0;
}

export function createCostsRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // ── Initialise tables ────────────────────────────────────────────────────
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
  `).catch(() => {});

  void db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_events_tenant ON cost_events(tenant_id, created_at)`).catch(() => {});
  void db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_events_agent ON cost_events(agent_id, created_at)`).catch(() => {});

  // ── POST /api/v1/costs/track ─────────────────────────────────────────────
  router.post('/api/v1/costs/track', auth.requireTenantAuth, async (req: Request, res: Response) => {
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

    if (agentId) {
      try {
        const agentExists = await db.get(
          'SELECT id FROM agents WHERE id = ? AND tenant_id = ?',
          [agentId, tenantId]
        );
        if (!agentExists) {
          res.status(404).json({ error: 'Agent not found or does not belong to your tenant' });
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

  // ── GET /api/v1/costs/summary ─────────────────────────────────────────────
  router.get('/api/v1/costs/summary', auth.requireTenantAuth, async (req: Request, res: Response) => {
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
        `SELECT agent_id, COUNT(*) as event_count,
                COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents, currency
         FROM cost_events WHERE ${whereClause}
         GROUP BY agent_id, currency ORDER BY total_cost_cents DESC`,
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
        `SELECT tool, COUNT(*) as event_count,
                COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents, currency
         FROM cost_events WHERE ${whereClause}
         GROUP BY tool, currency ORDER BY total_cost_cents DESC`,
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
        `SELECT date(created_at) as day, COUNT(*) as event_count,
                COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents, currency
         FROM cost_events WHERE ${whereClause}
         GROUP BY day, currency ORDER BY day ASC`,
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

  // ── GET /api/v1/costs/agents ──────────────────────────────────────────────
  router.get('/api/v1/costs/agents', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const query = req.query as Record<string, string | undefined>;
    const { from, to } = query;

    const fromDate = from
      ? new Date(from).toISOString()
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to ? new Date(to).toISOString() : new Date().toISOString();

    const rows = await db.all<{
      agent_id: string | null;
      event_count: number;
      total_cost_cents: number;
      currency: string;
      last_event_at: string;
    }>(
      `SELECT agent_id, COUNT(*) as event_count,
              COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
              currency, MAX(created_at) as last_event_at
       FROM cost_events
       WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?
       GROUP BY agent_id, currency ORDER BY total_cost_cents DESC`,
      [tenantId, fromDate, toDate]
    );

    res.json({
      period: { from: fromDate, to: toDate },
      agents: rows.map(r => ({
        agentId: r.agent_id,
        eventCount: Number(r.event_count),
        totalCostCents: Number(r.total_cost_cents),
        currency: r.currency,
        lastEventAt: r.last_event_at,
      })),
    });
  });

  return router;
}
