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
import { QueryAuditEventsSchema } from '@agentguard/shared';
import { AuditService } from '../services/audit.js';
import { getContext, authenticateJwt } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import type { ServiceContext } from '@agentguard/shared';

export const auditRouter = new Hono();

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

  const format = (flatQuery['format'] ?? 'json') as 'csv' | 'json' | 'cef' | 'leef';
  delete flatQuery['format'];
  delete flatQuery['token'];

  // Parse filters but override limit for streaming (we handle pagination ourselves)
  const filters = QueryAuditEventsSchema.parse({ ...flatQuery, limit: 200 });

  const contentType =
    format === 'csv' ? 'text/csv' :
    format === 'cef' || format === 'leef' ? 'text/plain' :
    'application/json';
  const fileExt = format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'log';
  const filename = `agentguard-audit-${format}-${new Date().toISOString().slice(0, 10)}.${fileExt}`;

  c.header('Content-Type', contentType);
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('Transfer-Encoding', 'chunked');
  c.header('Cache-Control', 'no-store');

  const service = new AuditService(prisma, ctx, redis);

  return stream(c, async (s) => {
    if (format === 'cef' || format === 'leef') {
      // SIEM streaming export
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const events = await service.queryEvents({ ...filters, cursor });
        for (const e of events) {
          const row = auditEventToResponse(e);
          const line = format === 'cef' ? formatCEF(row) : formatLEEF(row);
          await s.write(line + '\n');
        }
        hasMore = events.length === filters.limit;
        cursor = events.length > 0 ? events[events.length - 1]?.id : undefined;
      }
    } else if (format === 'csv') {
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

// ─── SIEM Format Helpers ──────────────────────────────────────────────────────

type AuditEventResponse = ReturnType<typeof auditEventToResponse>;

/**
 * CEF (Common Event Format) — ArcSight / generic SIEM
 * CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
 */
function formatCEF(e: AuditEventResponse): string {
  const severity = ({ CRITICAL: 10, HIGH: 8, MEDIUM: 5, LOW: 2 } as Record<string, number>)[e.riskTier] ?? 0;
  const signatureId = `AGENTGUARD_${e.policyDecision}_${e.actionType}`;
  const name = `Agent action ${e.policyDecision}: ${e.actionType}`;

  const ext = [
    `rt=${new Date(e.occurredAt).getTime()}`,
    `src=${e.tenantId}`,
    `dvchost=${e.agentId}`,
    `suid=${e.sessionId}`,
    `act=${e.policyDecision}`,
    `outcome=${e.policyDecision}`,
    e.blockReason ? `reason=${siemEscape(e.blockReason)}` : '',
    e.toolName ? `cs1=${siemEscape(e.toolName)}` : '',
    e.toolName ? `cs1Label=toolName` : '',
    e.toolTarget ? `cs2=${siemEscape(e.toolTarget)}` : '',
    e.toolTarget ? `cs2Label=toolTarget` : '',
    `cs3=${e.riskScore}`,
    `cs3Label=riskScore`,
    `cs4=${e.riskTier}`,
    `cs4Label=riskTier`,
    e.matchedRuleId ? `cs5=${e.matchedRuleId}` : '',
    e.matchedRuleId ? `cs5Label=matchedRuleId` : '',
    `cn1=${e.processingMs}`,
    `cn1Label=processingMs`,
    `flexString1=${e.eventHash.slice(0, 32)}`,
    `flexString1Label=eventHash`,
  ]
    .filter(Boolean)
    .join(' ');

  return `CEF:0|AgentGuard|AgentGuard Runtime Security|1.0|${signatureId}|${name}|${severity}|${ext}`;
}

/**
 * LEEF (Log Event Extended Format) — IBM QRadar
 * LEEF:Version|Vendor|Product|Version|EventID|\tattributes
 */
function formatLEEF(e: AuditEventResponse): string {
  const eventId = `AGENTGUARD_${e.policyDecision}_${e.actionType}`;

  const attrs = [
    `devTime=${e.occurredAt}`,
    `devTimeFormat=ISO 8601`,
    `src=${e.tenantId}`,
    `usrName=${e.agentId}`,
    `sessionId=${e.sessionId}`,
    `action=${e.policyDecision}`,
    `toolName=${leefEscape(e.toolName ?? '')}`,
    `toolTarget=${leefEscape(e.toolTarget ?? '')}`,
    `riskScore=${e.riskScore}`,
    `riskTier=${e.riskTier}`,
    `blockReason=${leefEscape(e.blockReason ?? '')}`,
    `matchedRuleId=${e.matchedRuleId ?? ''}`,
    `processingMs=${e.processingMs}`,
    `eventHash=${e.eventHash.slice(0, 32)}`,
  ].join('\t');

  return `LEEF:2.0|AgentGuard|AgentGuard Runtime Security|1.0|${eventId}|\t${attrs}`;
}

function siemEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/=/g, '\\=').replace(/\n/g, '\\n');
}

function leefEscape(s: string): string {
  return s.replace(/\t/g, ' ').replace(/\n/g, ' ');
}
