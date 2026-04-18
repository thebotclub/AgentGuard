/**
 * AgentGuard — Audit Service
 *
 * Domain service for audit event storage, hash chain management,
 * verification, repair, and webhook delivery.
 *
 * Extracts business logic from route handlers and the audit.ts module
 * so routes only handle HTTP concerns and this service is independently testable.
 *
 * Depends on IDatabase for data access — no HTTP types imported.
 */
import crypto from 'crypto';
import { logger } from '../lib/logger.js';
import { GENESIS_HASH } from '../../packages/sdk/src/core/types.js';
import { recordFailedWebhook } from '../lib/webhook-retry.js';
import { signWebhookPayload } from '../lib/webhook-signing.js';
import type { IDatabase, AuditEventRow, WebhookRow } from '../db-interface.js';

export interface StoreAuditEventInput {
  tenantId: string;
  sessionId: string | null;
  tool: string;
  result: string;
  ruleId: string | null;
  riskScore: number;
  reason: string | null;
  durationMs: number;
  agentId?: string | null;
  detectionScore?: number | null;
  detectionProvider?: string | null;
  detectionCategory?: string | null;
}

export interface HashChainVerificationResult {
  valid: boolean;
  eventCount: number;
  errors?: string[];
  message: string;
}

export interface HashChainRepairResult {
  repaired: number;
  total: number;
  message: string;
}

export class AuditService {
  constructor(private db: IDatabase) {}

  // ── Hash Helpers ──────────────────────────────────────────────────────────

  /**
   * Compute a SHA-256 hash from event data and the previous hash.
   */
  static makeHash(data: string, prev: string): string {
    return crypto
      .createHash('sha256')
      .update(prev + '|' + data)
      .digest('hex');
  }

  /**
   * Compute an HMAC-SHA256 signature for a webhook payload.
   */
  static hmacSignature(body: string, secret: string): string {
    return (
      'sha256=' +
      crypto.createHmac('sha256', secret).update(body).digest('hex')
    );
  }

  // ── Kill Switch ───────────────────────────────────────────────────────────

  /**
   * Get the global kill switch state.
   */
  async getGlobalKillSwitch(): Promise<{ active: boolean; at: string | null }> {
    const val = await this.db.getSetting('global_kill_switch');
    const at = await this.db.getSetting('global_kill_switch_at');
    return { active: val === '1', at: at || null };
  }

  /**
   * Set the global kill switch state.
   */
  async setGlobalKillSwitch(active: boolean): Promise<void> {
    await this.db.setSetting('global_kill_switch', active ? '1' : '0');
    await this.db.setSetting(
      'global_kill_switch_at',
      active ? new Date().toISOString() : '',
    );
  }

  // ── Audit Event Storage ───────────────────────────────────────────────────

  /**
   * Get the last audit hash for a tenant (or GENESIS_HASH if none).
   */
  async getLastHash(tenantId: string): Promise<string> {
    const hash = await this.db.getLastAuditHash(tenantId);
    return hash ?? GENESIS_HASH;
  }

  /**
   * Store an audit event with atomic hash chain management.
   * The adapter reads the previous hash inside a lock to prevent corruption.
   *
   * The _prevHash parameter is retained for API compatibility but is no longer
   * used — the adapter handles it atomically.
   */
  async storeAuditEvent(input: StoreAuditEventInput): Promise<string> {
    const effectiveTenantId =
      input.tenantId === 'demo' ? null : input.tenantId;
    const createdAt = new Date().toISOString();

    return this.db.insertAuditEventSafe(
      effectiveTenantId,
      input.sessionId,
      input.tool,
      null, // action
      input.result,
      input.ruleId ?? null,
      input.riskScore,
      input.reason ?? null,
      input.durationMs,
      createdAt,
      input.agentId ?? null,
      input.detectionScore ?? null,
      input.detectionProvider ?? null,
      input.detectionCategory ?? null,
    );
  }

  // ── Audit Event Retrieval ─────────────────────────────────────────────────

  /**
   * Count audit events for a tenant.
   */
  async countEvents(tenantId: string): Promise<number> {
    return this.db.countAuditEvents(tenantId);
  }

  /**
   * Get audit events with offset-based pagination.
   */
  async getEvents(
    tenantId: string,
    limit: number,
    offset: number,
  ): Promise<AuditEventRow[]> {
    return this.db.getAuditEvents(tenantId, limit, offset);
  }

  /**
   * Get audit events with cursor-based pagination.
   */
  async getEventsCursor(
    tenantId: string,
    limit: number,
    before?: string,
  ): Promise<AuditEventRow[]> {
    return this.db.getAuditEventsCursor(tenantId, limit, before);
  }

  /**
   * Get all audit events for a tenant (for export/verification).
   */
  async getAllEvents(tenantId: string): Promise<AuditEventRow[]> {
    return this.db.getAllAuditEvents(tenantId);
  }

  // ── Hash Chain Verification ───────────────────────────────────────────────

  /**
   * Verify the integrity of the entire audit hash chain for a tenant.
   */
  async verifyHashChain(tenantId: string): Promise<HashChainVerificationResult> {
    const events = await this.db.getAllAuditEvents(tenantId);

    if (events.length === 0) {
      return {
        valid: true,
        eventCount: 0,
        message: 'No events to verify',
      };
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
      const expectedHash = AuditService.makeHash(eventData, prevHash);
      if (event.hash !== expectedHash) {
        valid = false;
        errors.push(
          `Event ${event.id}: hash mismatch — data may have been tampered`,
        );
      }

      prevHash = event.hash ?? prevHash;
    }

    return {
      valid,
      eventCount: events.length,
      errors: errors.length > 0 ? errors : undefined,
      message: valid
        ? `Hash chain verified: ${events.length} events intact`
        : `Hash chain INVALID: ${errors.length} problem(s) detected`,
    };
  }

  // ── Hash Chain Repair ─────────────────────────────────────────────────────

  /**
   * Recalculate and fix the hash chain for a tenant's audit events.
   */
  async repairHashChain(tenantId: string): Promise<HashChainRepairResult> {
    const events = await this.db.getAllAuditEvents(tenantId);
    if (events.length === 0) {
      return { repaired: 0, total: 0, message: 'No audit events found' };
    }

    let prevHash = GENESIS_HASH;
    let repaired = 0;

    for (const event of events) {
      const eventData = `${event.tool}|${event.result}|${event.created_at}`;
      const expectedHash = AuditService.makeHash(eventData, prevHash);

      if (event.previous_hash !== prevHash || event.hash !== expectedHash) {
        await this.db.updateAuditEventHashes(event.id, prevHash, expectedHash);
        repaired++;
      }
      prevHash = expectedHash;
    }

    return {
      repaired,
      total: events.length,
      message:
        repaired > 0
          ? `Repaired ${repaired} of ${events.length} events`
          : `Chain already intact — ${events.length} events verified`,
    };
  }

  // ── Webhook Delivery ──────────────────────────────────────────────────────

  /**
   * Deliver a single webhook with HMAC signature.
   * Returns true if the delivery succeeded (HTTP 2xx).
   */
  static async deliverWebhook(
    webhook: WebhookRow,
    eventType: string,
    payload: object,
  ): Promise<boolean> {
    const { payload: body, headers: signedHeaders } = signWebhookPayload(payload, webhook.secret);
    const headers: Record<string, string> = {
      ...signedHeaders,
      'X-AgentGuard-Event': eventType,
      'X-AgentGuard-Delivery': crypto.randomUUID(),
    };
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

  /**
   * Fire webhooks asynchronously for all active webhooks matching the event type.
   * Non-blocking — errors are logged and recorded for retry.
   */
  fireWebhooksAsync(
    tenantId: string,
    eventType: string,
    payload: object,
  ): void {
    setTimeout(async () => {
      const webhooks = await this.db.getActiveWebhooksForTenant(tenantId);
      await Promise.all(
        webhooks.map(async (wh) => {
          let eventList: string[] = [];
          try {
            eventList = JSON.parse(wh.events) as string[];
          } catch {
            eventList = [];
          }
          if (!eventList.includes(eventType) && !eventList.includes('*')) return;

          const ok = await AuditService.deliverWebhook(wh, eventType, payload);
          if (!ok) {
            try {
              await recordFailedWebhook(
                this.db,
                wh.id,
                tenantId,
                eventType,
                JSON.stringify(payload),
                'Initial delivery failed',
              );
            } catch (err) {
              logger.error(
                { err: err instanceof Error ? err.message : String(err) },
                '[webhook] Failed to record webhook failure',
              );
            }
          }
        }),
      );
    }, 0);
  }
}
