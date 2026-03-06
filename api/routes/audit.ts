/**
 * AgentGuard — Audit Routes & Helpers
 *
 * GET /api/v1/audit        — paginated persistent audit trail
 * GET /api/v1/audit/verify — verify hash chain integrity
 *
 * Also exports shared audit helpers used by other route modules:
 *  - getGlobalKillSwitch / setGlobalKillSwitch
 *  - getLastHash
 *  - storeAuditEvent
 *  - fireWebhooksAsync
 *  - makeHash
 *  - hmacSignature
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { IDatabase, WebhookRow } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { GENESIS_HASH } from '../../packages/sdk/src/core/types.js';

// ── Shared Helpers ─────────────────────────────────────────────────────────

export function makeHash(data: string, prev: string): string {
  return crypto
    .createHash('sha256')
    .update(prev + '|' + data)
    .digest('hex');
}

export function hmacSignature(body: string, secret: string): string {
  return (
    'sha256=' +
    crypto.createHmac('sha256', secret).update(body).digest('hex')
  );
}

export async function getGlobalKillSwitch(
  db: IDatabase,
): Promise<{ active: boolean; at: string | null }> {
  const val = await db.getSetting('global_kill_switch');
  const at = await db.getSetting('global_kill_switch_at');
  return {
    active: val === '1',
    at: at || null,
  };
}

export async function setGlobalKillSwitch(
  db: IDatabase,
  active: boolean,
): Promise<void> {
  await db.setSetting('global_kill_switch', active ? '1' : '0');
  await db.setSetting(
    'global_kill_switch_at',
    active ? new Date().toISOString() : '',
  );
}

export async function getLastHash(
  db: IDatabase,
  tenantId: string,
): Promise<string> {
  const hash = await db.getLastAuditHash(tenantId);
  return hash ?? GENESIS_HASH;
}

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
  // prevHash is now ignored — the adapter reads it atomically inside a lock
  _prevHash: string,
  agentId?: string | null,
  detectionScore?: number | null,
  detectionProvider?: string | null,
  detectionCategory?: string | null,
): Promise<string> {
  const createdAt = new Date().toISOString();
  const effectiveTenantId = tenantId === 'demo' ? null : tenantId;
  // insertAuditEventSafe atomically reads the last hash and inserts in one
  // serialized operation, preventing hash-chain corruption under concurrency.
  return db.insertAuditEventSafe(
    effectiveTenantId,
    sessionId,
    tool,
    null,
    result,
    ruleId ?? null,
    riskScore,
    reason ?? null,
    durationMs,
    createdAt,
    agentId ?? null,
    detectionScore ?? null,
    detectionProvider ?? null,
    detectionCategory ?? null,
  );
}

export async function deliverWebhook(
  webhook: WebhookRow,
  eventType: string,
  payload: object,
): Promise<boolean> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-AgentGuard-Event': eventType,
    'X-AgentGuard-Delivery': crypto.randomUUID(),
  };
  if (webhook.secret) {
    headers['X-AgentGuard-Signature'] = hmacSignature(body, webhook.secret);
  }
  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function fireWebhooksAsync(
  db: IDatabase,
  tenantId: string,
  eventType: string,
  payload: object,
): void {
  setTimeout(async () => {
    const webhooks = await db.getActiveWebhooksForTenant(tenantId);
    for (const wh of webhooks) {
      let eventList: string[] = [];
      try {
        eventList = JSON.parse(wh.events) as string[];
      } catch {
        eventList = [];
      }
      if (!eventList.includes(eventType) && !eventList.includes('*')) continue;

      const ok = await deliverWebhook(wh, eventType, payload);
      if (!ok) {
        setTimeout(async () => {
          await deliverWebhook(wh, eventType, payload);
        }, 5000);
      }
    }
  }, 0);
}

// ── Route Factory ──────────────────────────────────────────────────────────

export function createAuditRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

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

      const total = await db.countAuditEvents(tenantId);
      const events = await db.getAuditEvents(tenantId, limit, offset);

      res.json({ tenantId, total, limit, offset, events });
    },
  );

  // ── GET /api/v1/audit/verify ──────────────────────────────────────────────
  router.get(
    '/api/v1/audit/verify',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const events = await db.getAllAuditEvents(tenantId);

      if (events.length === 0) {
        return res.json({ valid: true, eventCount: 0, message: 'No events to verify' });
      }

      let valid = true;
      const errors: string[] = [];
      let prevHash = GENESIS_HASH;

      for (const event of events) {
        if (event.previous_hash !== prevHash) {
          valid = false;
          errors.push(
            `Event ${event.id}: previous_hash mismatch (expected ${prevHash.substring(0, 8)}..., got ${(event.previous_hash ?? '').substring(0, 8)}...)`,
          );
        }

        const eventData = `${event.tool}|${event.result}|${event.created_at}`;
        const expectedHash = makeHash(eventData, prevHash);
        if (event.hash !== expectedHash) {
          valid = false;
          errors.push(
            `Event ${event.id}: hash mismatch — data may have been tampered`,
          );
        }

        prevHash = event.hash ?? prevHash;
      }

      res.json({
        valid,
        eventCount: events.length,
        errors: errors.length > 0 ? errors : undefined,
        message: valid
          ? `Hash chain verified: ${events.length} events intact`
          : `Hash chain INVALID: ${errors.length} problem(s) detected`,
      });
    },
  );

  // ── POST /api/v1/audit/repair ─────────────────────────────────────────────
  // Admin-only: recalculates the hash chain for the authenticated tenant.
  router.post(
    '/api/v1/audit/repair',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const events = await db.getAllAuditEvents(tenantId);
        if (events.length === 0) {
          return res.json({ repaired: 0, total: 0, message: 'No audit events found' });
        }

        let prevHash = GENESIS_HASH;
        let repaired = 0;

        for (const event of events) {
          const eventData = `${event.tool}|${event.result}|${event.created_at}`;
          const expectedHash = makeHash(eventData, prevHash);

          if (event.previous_hash !== prevHash || event.hash !== expectedHash) {
            await db.updateAuditEventHashes(event.id, prevHash, expectedHash);
            repaired++;
          }
          prevHash = expectedHash;
        }

        res.json({
          repaired,
          total: events.length,
          message: repaired > 0
            ? `Repaired ${repaired} of ${events.length} events`
            : `Chain already intact — ${events.length} events verified`,
        });
      } catch (e) {
        console.error('[audit/repair] error:', e);
        res.status(500).json({ error: 'Failed to repair audit chain' });
      }
    },
  );

  return router;
}
