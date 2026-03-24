/**
 * Rate Limit Management Routes
 *
 * CRUD for per-tenant and per-agent rate limits stored in the database.
 *
 * POST   /api/v1/rate-limits        — create a new rate limit rule
 * GET    /api/v1/rate-limits        — list all rules for the tenant
 * DELETE /api/v1/rate-limits/:id    — remove a rule
 */

import { Router, Request, Response } from 'express';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

interface RateLimitRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  window_seconds: number;
  max_requests: number;
  created_at: string;
}

// Extend Request with tenant context injected by auth middleware
interface AuthedRequest extends Request {
  tenantId: string;
}

export function createRateLimitRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // ── Initialise tables ────────────────────────────────────────────────────
  void db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      agent_id TEXT,
      window_seconds INTEGER NOT NULL DEFAULT 60,
      max_requests INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => { /* already exists or handled by main schema setup */ });

  void db.exec(`
    CREATE TABLE IF NOT EXISTS rate_counters (
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tenant_id, agent_id, window_start)
    )
  `).catch(() => {});

  void db.exec(`CREATE INDEX IF NOT EXISTS idx_rate_limits_tenant ON rate_limits(tenant_id)`).catch(() => {});
  void db.exec(`CREATE INDEX IF NOT EXISTS idx_rate_counters_lookup ON rate_counters(tenant_id, agent_id, window_start)`).catch(() => {});

  // ── POST /api/v1/rate-limits — create ────────────────────────────────────
  router.post('/api/v1/rate-limits', auth.requireTenantAuth, async (req: Request, res: Response) => {
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

  // ── GET /api/v1/rate-limits — list ──────────────────────────────────────
  router.get('/api/v1/rate-limits', auth.requireTenantAuth, async (req: Request, res: Response) => {
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

  // ── DELETE /api/v1/rate-limits/:id — remove ──────────────────────────────
  router.delete('/api/v1/rate-limits/:id', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const id = req.params['id'] as string;

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

  return router;
}
