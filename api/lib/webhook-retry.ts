/**
 * AgentGuard — Webhook Retry Engine
 *
 * DB-backed retry for failed webhook deliveries.
 * Runs a cron every 30s, picks up pending retries, re-delivers with exponential backoff.
 * Max 5 attempts per event, then marks as dead_lettered.
 *
 * Uses existing CircuitBreaker per webhook URL to avoid hammering failing endpoints.
 */
import crypto from 'crypto';
import type { IDatabase } from '../db-interface.js';
import type { FailedWebhookRow } from '../db-interface.js';
import { getCircuitBreaker, CircuitBreakerOpenError } from './circuit-breaker.js';
import { publishEvent } from './redis-pubsub.js';
import { logger } from './logger.js';

const MAX_ATTEMPTS = 5;
// Exponential backoff schedule in ms: 30s, 1m, 2m, 5m, 10m
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];

let retryInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Record a failed webhook delivery for later retry.
 */
export async function recordFailedWebhook(
  db: IDatabase,
  webhookId: string,
  tenantId: string,
  eventType: string,
  payload: string,
  error: string,
): Promise<void> {
  const id = crypto.randomUUID();
  const nextRetryAt = new Date(Date.now() + BACKOFF_MS[0]!).toISOString();
  await db.insertFailedWebhook(id, webhookId, tenantId, eventType, payload, nextRetryAt, error);

  publishEvent({
    type: 'webhook_failure',
    tenantId,
    data: { webhookId, eventType, error, nextRetryAt },
    ts: new Date().toISOString(),
  });
}

/**
 * Process one retry batch. Fetches up to 10 pending retries and re-delivers.
 */
export async function processRetryBatch(
  db: IDatabase,
  deliverFn: (webhookId: string, tenantId: string, eventType: string, payload: string) => Promise<boolean>,
): Promise<{ retried: number; succeeded: number; deadLettered: number }> {
  const batch = await db.getRetryableWebhooks(10);
  let succeeded = 0;
  let deadLettered = 0;

  for (const row of batch) {
    // Check circuit breaker for the webhook URL
    const breaker = getCircuitBreaker(`webhook:${row.webhook_id}`, {
      failureThreshold: 5,
      resetMs: 60_000,
      callTimeoutMs: 5_000,
    });

    let ok = false;
    try {
      ok = await breaker.call(() => deliverFn(row.webhook_id, row.tenant_id, row.event_type, row.payload));
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError) {
        // Circuit open — skip this webhook, will retry on next cycle
        continue;
      }
      ok = false;
    }

    if (ok) {
      // Success — remove from retry queue
      await db.updateFailedWebhook(row.id, row.attempt_count, row.next_retry_at, 'delivered', null);
      succeeded++;
    } else if (row.attempt_count >= MAX_ATTEMPTS) {
      // Max attempts reached — dead letter
      await db.updateFailedWebhook(row.id, row.attempt_count, row.next_retry_at, 'dead_lettered', 'Max retry attempts exceeded');
      deadLettered++;
      logger.warn(`[webhook-retry] Dead lettered webhook ${row.id} after ${row.attempt_count} attempts`);
    } else {
      // Schedule next retry with exponential backoff
      const nextAttempt = row.attempt_count; // 0-indexed for BACKOFF_MS
      const delayMs = BACKOFF_MS[Math.min(nextAttempt, BACKOFF_MS.length - 1)]!;
      const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
      await db.updateFailedWebhook(row.id, row.attempt_count + 1, nextRetryAt, 'pending', 'Retry scheduled');
    }
  }

  return { retried: batch.length, succeeded, deadLettered };
}

/**
 * Start the retry cron (every 30s). Call once during server startup.
 */
export function startWebhookRetryCron(
  db: IDatabase,
  deliverFn: (webhookId: string, tenantId: string, eventType: string, payload: string) => Promise<boolean>,
): void {
  if (retryInterval) return; // Already running

  retryInterval = setInterval(async () => {
    try {
      const result = await processRetryBatch(db, deliverFn);
      if (result.retried > 0) {
        logger.info(`[webhook-retry] Processed ${result.retried} retries: ${result.succeeded} succeeded, ${result.deadLettered} dead-lettered`);
      }
    } catch (err) {
      logger.error('[webhook-retry] Cron error:', err instanceof Error ? err.message : err);
    }
  }, 30_000);
  retryInterval.unref(); // Don't block process exit
}

/**
 * Stop the retry cron (for graceful shutdown).
 */
export function stopWebhookRetryCron(): void {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
}
