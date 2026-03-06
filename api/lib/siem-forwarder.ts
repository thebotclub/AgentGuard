/**
 * AgentGuard — SIEM Forwarder
 *
 * Background service that batches and forwards audit events to configured
 * SIEM systems (Splunk HEC, Azure Sentinel Log Analytics).
 *
 * Features:
 *  - Batched delivery: flush every 10s or when 50 events accumulate
 *  - Exponential back-off retry (3 attempts)
 *  - Circuit breaker per tenant SIEM target
 *  - HMAC-SHA256 signing for Sentinel Log Analytics Data Collector API
 */
import crypto from 'crypto';
import type { IDatabase } from '../db-interface.js';
import { decryptConfig } from './integration-crypto.js';
import { getCircuitBreaker } from './circuit-breaker.js';
import { logger } from './logger.js';

// ── Type Definitions ──────────────────────────────────────────────────────

export interface AuditEventPayload {
  id?: number;
  tenant_id: string | null;
  tool: string;
  action: string | null;
  result: string;
  rule_id?: string | null;
  risk_score?: number | null;
  reason?: string | null;
  duration_ms?: number | null;
  created_at: string;
  agent_id?: string | null;
}

interface SplunkConfig {
  hecUrl: string;
  hecToken: string;
  index?: string;
  source?: string;
}

interface SentinelConfig {
  workspaceId: string;
  sharedKey: string;
  logType?: string;
}

// ── Splunk HEC Formatting ─────────────────────────────────────────────────

function formatSplunkEvent(event: AuditEventPayload, config: SplunkConfig): object {
  return {
    event: {
      tool: event.tool,
      action: event.action,
      result: event.result,
      ruleId: event.rule_id,
      riskScore: event.risk_score,
      reason: event.reason,
      durationMs: event.duration_ms,
      agentId: event.agent_id,
      tenantId: event.tenant_id,
    },
    time: Math.floor(new Date(event.created_at).getTime() / 1000),
    source: config.source ?? 'agentguard',
    sourcetype: 'agentguard:audit',
    index: config.index ?? 'main',
  };
}

async function sendToSplunk(
  events: AuditEventPayload[],
  config: SplunkConfig,
): Promise<void> {
  const body = events
    .map((e) => JSON.stringify(formatSplunkEvent(e, config)))
    .join('\n');

  const response = await fetch(config.hecUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Splunk ${config.hecToken}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Splunk HEC returned ${response.status}: ${text}`);
  }
}

// ── Azure Sentinel Formatting ─────────────────────────────────────────────

/**
 * Build the HMAC-SHA256 Authorization header for Sentinel Log Analytics.
 * https://docs.microsoft.com/en-us/azure/azure-monitor/logs/data-collector-api
 */
function buildSentinelSignature(
  workspaceId: string,
  sharedKey: string,
  date: string,
  contentLength: number,
): string {
  const stringToSign = `POST\n${contentLength}\napplication/json\nx-ms-date:${date}\n/api/logs`;
  const keyBuffer = Buffer.from(sharedKey, 'base64');
  const signature = crypto
    .createHmac('sha256', keyBuffer)
    .update(stringToSign)
    .digest('base64');
  return `SharedKey ${workspaceId}:${signature}`;
}

async function sendToSentinel(
  events: AuditEventPayload[],
  config: SentinelConfig,
): Promise<void> {
  const logType = config.logType ?? 'AgentGuard_CL';
  const rows = events.map((e) => ({
    Tool: e.tool,
    Action: e.action,
    Result: e.result,
    RuleId: e.rule_id,
    RiskScore: e.risk_score,
    Reason: e.reason,
    DurationMs: e.duration_ms,
    AgentId: e.agent_id,
    TenantId: e.tenant_id,
    TimeGenerated: e.created_at,
  }));

  const body = JSON.stringify(rows);
  const contentLength = Buffer.byteLength(body, 'utf8');
  const date = new Date().toUTCString();
  const authorization = buildSentinelSignature(
    config.workspaceId,
    config.sharedKey,
    date,
    contentLength,
  );

  const url = `https://${config.workspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Log-Type': logType,
      'Authorization': authorization,
      'x-ms-date': date,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Sentinel Log Analytics returned ${response.status}: ${text}`);
  }
}

// ── Retry helper ──────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ── SIEM Forwarder class ──────────────────────────────────────────────────

interface BatchEntry {
  tenantId: string;
  event: AuditEventPayload;
}

export class SiemForwarder {
  private readonly db: IDatabase;
  private readonly queue: BatchEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly flushIntervalMs: number;
  private readonly batchSize: number;

  constructor(db: IDatabase, opts?: { flushIntervalMs?: number; batchSize?: number }) {
    this.db = db;
    this.flushIntervalMs = opts?.flushIntervalMs ?? 10_000;
    this.batchSize = opts?.batchSize ?? 50;
  }

  /** Start the background flush timer */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flushAll().catch((err) => {
        logger.error({ error: err instanceof Error ? err.message : String(err) }, 'siem-forwarder: flush error');
      });
    }, this.flushIntervalMs);
    // Prevent the timer from blocking process exit
    if (this.timer.unref) this.timer.unref();
  }

  /** Stop the background flush timer */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Enqueue an audit event for a tenant */
  enqueue(tenantId: string, event: AuditEventPayload): void {
    this.queue.push({ tenantId, event });
    if (this.queue.length >= this.batchSize) {
      setImmediate(() => {
        this.flushAll().catch((err) => {
          logger.error({ error: err instanceof Error ? err.message : String(err) }, 'siem-forwarder: flush error');
        });
      });
    }
  }

  /** Flush all queued events, grouped by tenant */
  async flushAll(): Promise<void> {
    if (this.queue.length === 0) return;

    // Drain the queue
    const items = this.queue.splice(0, this.queue.length);

    // Group by tenantId
    const byTenant = new Map<string, AuditEventPayload[]>();
    for (const { tenantId, event } of items) {
      if (!byTenant.has(tenantId)) byTenant.set(tenantId, []);
      byTenant.get(tenantId)!.push(event);
    }

    // Forward each tenant's events
    const forwardPromises = Array.from(byTenant.entries()).map(([tenantId, events]) =>
      this.forwardTenant(tenantId, events),
    );
    await Promise.allSettled(forwardPromises);
  }

  /** Forward events for a single tenant */
  private async forwardTenant(tenantId: string, events: AuditEventPayload[]): Promise<void> {
    let config;
    try {
      config = await this.db.getSiemConfig(tenantId);
    } catch (err) {
      logger.warn({ tenantId, error: err instanceof Error ? err.message : String(err) }, 'siem-forwarder: failed to load SIEM config');
      return;
    }

    if (!config || config.enabled === 0) return;

    let siemConfig: Record<string, unknown>;
    try {
      siemConfig = decryptConfig(config.config_encrypted);
    } catch (err) {
      logger.error({ tenantId, error: err instanceof Error ? err.message : String(err) }, 'siem-forwarder: failed to decrypt SIEM config');
      return;
    }

    const breakerName = `siem:${tenantId}`;
    const breaker = getCircuitBreaker(breakerName, {
      failureThreshold: 5,
      resetMs: 60_000,
      callTimeoutMs: 10_000,
    });

    try {
      await breaker.call(() =>
        withRetry(() => {
          if (config!.provider === 'splunk') {
            return sendToSplunk(events, siemConfig as unknown as SplunkConfig);
          } else {
            return sendToSentinel(events, siemConfig as unknown as SentinelConfig);
          }
        }),
      );

      // Update last_forwarded_at on success
      await this.db.updateSiemLastForwarded(tenantId, new Date().toISOString());

      logger.info({ tenantId, count: events.length, provider: config.provider }, 'siem-forwarder: forwarded events');
    } catch (err) {
      logger.error({
        tenantId,
        provider: config.provider,
        count: events.length,
        error: err instanceof Error ? err.message : String(err),
      }, 'siem-forwarder: failed to forward events');
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

let _forwarder: SiemForwarder | null = null;

export function getSiemForwarder(db?: IDatabase): SiemForwarder {
  if (!_forwarder) {
    if (!db) throw new Error('getSiemForwarder: db required for first call');
    _forwarder = new SiemForwarder(db);
    _forwarder.start();
  }
  return _forwarder;
}
