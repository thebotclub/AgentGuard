/**
 * AgentGuard — Audit Routes
 *
 * GET /api/v1/audit        — paginated persistent audit trail (offset-based)
 * GET /api/v1/audit/events — cursor-based paginated audit events
 * GET /api/v1/audit/verify — verify hash chain integrity
 * GET /api/v1/audit/export — export audit events as CSV or JSON
 * POST /api/v1/audit/repair — recalculates hash chain
 *
 * Re-exports shared helpers from AuditService for backward compatibility
 * with other modules that import from this file.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { AuditService } from '../services/audit.service.js';

// ── Re-export helpers for backward compatibility ──────────────────────────
// Other modules (evaluate/helpers, etc.) import these from this file.
// They now delegate to AuditService static methods.
export const makeHash = AuditService.makeHash;
export const hmacSignature = AuditService.hmacSignature;
export const deliverWebhook = AuditService.deliverWebhook;

/**
 * Backward-compatible wrapper: store an audit event.
 * Existing callers pass (db, tenantId, sessionId, tool, result, ruleId, riskScore,
 * reason, durationMs, _prevHash, agentId?, detectionScore?, detectionProvider?, detectionCategory?).
 */
export async function storeAuditEvent(
  db: IDatabase,
  tenantId: string,
  sessionId: string | null,
  tool: string,
  result: string,
  ruleId: string | null,
  riskScore: number,
  reason: string | null,
  durationMs: number,
  _prevHash: string,
  agentId?: string | null,
  detectionScore?: number | null,
  detectionProvider?: string | null,
  detectionCategory?: string | null,
): Promise<string> {
  const svc = new AuditService(db);
  return svc.storeAuditEvent({
    tenantId, sessionId, tool, result, ruleId, riskScore,
    reason, durationMs, agentId, detectionScore, detectionProvider, detectionCategory,
  });
}

export async function getGlobalKillSwitch(
  db: IDatabase,
): Promise<{ active: boolean; at: string | null }> {
  return new AuditService(db).getGlobalKillSwitch();
}

export async function setGlobalKillSwitch(
  db: IDatabase,
  active: boolean,
): Promise<void> {
  return new AuditService(db).setGlobalKillSwitch(active);
}

export async function getLastHash(
  db: IDatabase,
  tenantId: string,
): Promise<string> {
  return new AuditService(db).getLastHash(tenantId);
}

export function fireWebhooksAsync(
  db: IDatabase,
  tenantId: string,
  eventType: string,
  payload: object,
): void {
  new AuditService(db).fireWebhooksAsync(tenantId, eventType, payload);
}

// ── CSV Helper ─────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── Route Factory ──────────────────────────────────────────────────────────

export function createAuditRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();
  const auditService = new AuditService(db);

  // ── GET /api/v1/audit ─────────────────────────────────────────────────────
  router.get(
    '/api/v1/audit',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const limit = Math.min(
        parseInt(String(req.query['limit'] ?? '50'), 10),
        500,
      );
      const offset = parseInt(String(req.query['offset'] ?? '0'), 10);

      const total = await auditService.countEvents(tenantId);
      const events = await auditService.getEvents(tenantId, limit, offset);

      res.json({ tenantId, total, limit, offset, events });
    },
  );

  // ── GET /api/v1/audit/events ────────────────────────────────────────────────
  const AuditEventsQuerySchema = z.object({
    limit: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? 50 : Number(v)))
      .pipe(z.number().int().min(1).max(200)),
    before: z.string().datetime().optional(),
  });

  router.get(
    '/api/v1/audit/events',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const parsed = AuditEventsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query parameters' });
        return;
      }

      const { limit, before } = parsed.data;
      const tenantId = req.tenantId!;
      const events = await auditService.getEventsCursor(tenantId, limit, before);
      const nextCursor =
        events.length === limit ? events[events.length - 1]!.created_at : null;

      res.json({ events, nextCursor });
    },
  );

  // ── GET /api/v1/audit/verify ──────────────────────────────────────────────
  router.get(
    '/api/v1/audit/verify',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const result = await auditService.verifyHashChain(tenantId);
      res.json(result);
    },
  );

  // ── GET /api/v1/audit/export ──────────────────────────────────────────────
  router.get(
    '/api/v1/audit/export',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const format = String(req.query['format'] ?? 'csv').toLowerCase();
      const fromStr = req.query['from'] ? String(req.query['from']) : null;
      const toStr = req.query['to'] ? String(req.query['to']) : null;

      const fromDate = fromStr ? new Date(fromStr) : null;
      const toDate = toStr ? new Date(toStr) : null;
      if (fromDate && isNaN(fromDate.getTime())) {
        res.status(400).json({ error: 'Invalid `from` date — must be ISO 8601' });
        return;
      }
      if (toDate && isNaN(toDate.getTime())) {
        res.status(400).json({ error: 'Invalid `to` date — must be ISO 8601' });
        return;
      }

      const allEvents = await auditService.getAllEvents(tenantId);

      const events = allEvents.filter((e) => {
        const ts = new Date(e.created_at);
        if (fromDate && ts < fromDate) return false;
        if (toDate && ts > toDate) return false;
        return true;
      });

      if (format === 'json') {
        const filename = `agentguard-audit-${tenantId}-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');
        res.json(
          events.map((e) => ({
            timestamp: e.created_at,
            agent_id: e.agent_id ?? null,
            tool: e.tool,
            action: e.action ?? null,
            result: e.result,
            hash: e.hash ?? null,
          })),
        );
        return;
      }

      const filename = `agentguard-audit-${tenantId}-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');

      res.write('timestamp,agent_id,tool,action,result,hash\r\n');

      for (const e of events) {
        const row = [
          csvEscape(e.created_at),
          csvEscape(e.agent_id ?? ''),
          csvEscape(e.tool),
          csvEscape(e.action ?? ''),
          csvEscape(e.result),
          csvEscape(e.hash ?? ''),
        ].join(',');
        res.write(row + '\r\n');
      }

      res.end();
    },
  );

  // ── POST /api/v1/audit/repair ─────────────────────────────────────────────
  router.post(
    '/api/v1/audit/repair',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const result = await auditService.repairHashChain(tenantId);
        res.json(result);
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[audit/repair] error');
        res.status(500).json({ error: 'Failed to repair audit chain' });
      }
    },
  );

  return router;
}
