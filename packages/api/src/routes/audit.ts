/**
 * Audit log routes — /v1/audit
 *
 * GET /audit            — query audit events (paginated, filterable)
 * GET /audit/export     — streaming CSV/JSON export
 * GET /audit/:eventId   — single event detail
 * GET /audit/sessions/:sessionId/verify — hash chain integrity verification
 */
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { jwtVerify } from 'jose';
import { QueryAuditEventsSchema } from '@agentguard/shared';
import { AuditService } from '../services/audit.js';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import type { ServiceContext } from '@agentguard/shared';

export const auditRouter = new Hono();

// ─── JWT secret (same as events.ts) ──────────────────────────────────────────

const JWT_SECRET = new TextEncoder().encode(
  process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
);

interface JwtClaims {
  sub: string;
  tenantId: string;
  role: string;
}

async function authenticateJwt(token: string): Promise<ServiceContext | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const claims = payload as unknown as JwtClaims;
    if (!claims.tenantId || !claims.sub || !claims.role) return null;
    return {
      tenantId: claims.tenantId,
      userId: claims.sub,
      role: claims.role as ServiceContext['role'],
      traceId: crypto.randomUUID(),
    };
  } catch {
    return null;
  }
}

/** GET /v1/audit — query audit events */
auditRouter.get('/', async (c) => {
  const ctx = getContext(c);
  const rawQuery = c.req.queries();
  const flatQuery: Record<string, string> = {};
  for (const [key, values] of Object.entries(rawQuery)) {
    if (values[0] !== undefined) flatQuery[key] = values[0];
  }
  const query = QueryAuditEventsSchema.parse(flatQuery);
  const service = new AuditService(prisma, ctx, redis);

  const events = await service.queryEvents(query);

  return c.json({
    data: events.map(auditEventToResponse),
    pagination: {
      cursor: events.length === query.limit ? (events[events.length - 1]?.id ?? null) : null,
      hasMore: events.length === query.limit,
    },
  });
});

/**
 * GET /v1/audit/export — streaming export of audit events.
 *
 * Query params:
 *   - Same filters as GET /audit (agentId, decision, riskTier, fromDate, toDate, toolName)
 *   - format: 'csv' | 'json'  (default: 'json')
 *   - token: JWT for browser-based streaming downloads (alternative to Authorization header)
 *
 * Streams large exports without loading all rows into memory.
 * Batch size: 200 rows per DB query.
 */
auditRouter.get('/export', async (c) => {
  // Auth: try header first, then ?token query param (for browser downloads)
  let ctx: ServiceContext;
  try {
    ctx = getContext(c);
  } catch {
    // Fall back to token query param for browser SSE/stream clients
    const token = c.req.query('token');
    if (!token) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } }, 401);
    const tokenCtx = await authenticateJwt(token);
    if (!tokenCtx) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, 401);
    ctx = tokenCtx;
  }

  const rawQuery = c.req.queries();
  const flatQuery: Record<string, string> = {};
  for (const [key, values] of Object.entries(rawQuery)) {
    if (values[0] !== undefined) flatQuery[key] = values[0];
  }

  const format = (flatQuery['format'] ?? 'json') as 'csv' | 'json';
  delete flatQuery['format'];
  delete flatQuery['token'];

  // Parse filters but override limit for streaming (we handle pagination ourselves)
  const filters = QueryAuditEventsSchema.parse({ ...flatQuery, limit: 200 });

  const contentType = format === 'csv' ? 'text/csv' : 'application/json';
  const filename = `agentguard-audit-${new Date().toISOString().slice(0, 10)}.${format}`;

  c.header('Content-Type', contentType);
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('Transfer-Encoding', 'chunked');
  c.header('Cache-Control', 'no-store');

  const service = new AuditService(prisma, ctx, redis);

  return stream(c, async (s) => {
    if (format === 'csv') {
      // CSV header
      await s.write(
        'id,tenantId,agentId,sessionId,occurredAt,processingMs,actionType,toolName,toolTarget,' +
        'policyDecision,riskScore,riskTier,matchedRuleId,blockReason,previousHash,eventHash\n',
      );

      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const events = await service.queryEvents({ ...filters, cursor });
        for (const e of events) {
          const row = auditEventToResponse(e);
          const csvRow = [
            row.id, row.tenantId, row.agentId, row.sessionId,
            row.occurredAt, row.processingMs,
            row.actionType, csvEscape(row.toolName ?? ''), csvEscape(row.toolTarget ?? ''),
            row.policyDecision, row.riskScore, row.riskTier,
            csvEscape(row.matchedRuleId ?? ''), csvEscape(row.blockReason ?? ''),
            row.previousHash, row.eventHash,
          ].join(',') + '\n';
          await s.write(csvRow);
        }

        hasMore = events.length === filters.limit;
        cursor = events.length > 0 ? events[events.length - 1]?.id : undefined;
      }
    } else {
      // JSON streaming — emit as newline-delimited JSON (NDJSON) for memory efficiency,
      // but wrap in array for compatibility.
      await s.write('[\n');
      let cursor: string | undefined;
      let hasMore = true;
      let first = true;

      while (hasMore) {
        const events = await service.queryEvents({ ...filters, cursor });
        for (const e of events) {
          const row = auditEventToResponse(e);
          if (!first) await s.write(',\n');
          await s.write(JSON.stringify(row));
          first = false;
        }

        hasMore = events.length === filters.limit;
        cursor = events.length > 0 ? events[events.length - 1]?.id : undefined;
      }

      await s.write('\n]\n');
    }
  });
});

/**
 * GET /v1/audit/sessions/:sessionId/verify
 * Must come before /:eventId to avoid routing conflict.
 */
auditRouter.get('/sessions/:sessionId/verify', async (c) => {
  const ctx = getContext(c);
  const sessionId = c.req.param('sessionId');
  const service = new AuditService(prisma, ctx, redis);

  const result = await service.verifySessionChain(sessionId);
  return c.json(result);
});

/** GET /v1/audit/:eventId — single event detail */
auditRouter.get('/:eventId', async (c) => {
  const ctx = getContext(c);
  const eventId = c.req.param('eventId');
  const service = new AuditService(prisma, ctx, redis);

  const event = await service.getEvent(eventId);
  return c.json(auditEventToResponse(event));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AuditEventLike = {
  id: string;
  tenantId: string;
  agentId: string;
  sessionId: string;
  occurredAt: Date;
  processingMs: number;
  actionType: string;
  toolName: string | null;
  toolTarget: string | null;
  policyDecision: string;
  policyId: string | null;
  policyVersion: string | null;
  matchedRuleId: string | null;
  blockReason: string | null;
  riskScore: number;
  riskTier: string;
  inputDataLabels: string[];
  outputDataLabels: string[];
  previousHash: string;
  eventHash: string;
};

function auditEventToResponse(e: AuditEventLike) {
  return {
    id: e.id,
    tenantId: e.tenantId,
    agentId: e.agentId,
    sessionId: e.sessionId,
    occurredAt: e.occurredAt.toISOString(),
    processingMs: e.processingMs,
    actionType: e.actionType,
    toolName: e.toolName,
    toolTarget: e.toolTarget,
    policyDecision: e.policyDecision,
    policyId: e.policyId,
    policyVersion: e.policyVersion,
    matchedRuleId: e.matchedRuleId,
    blockReason: e.blockReason,
    riskScore: e.riskScore,
    riskTier: e.riskTier,
    inputDataLabels: e.inputDataLabels,
    outputDataLabels: e.outputDataLabels,
    previousHash: e.previousHash,
    eventHash: e.eventHash,
  };
}

/** Escape a field for CSV (wrap in quotes if contains comma, quote, or newline). */
function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
