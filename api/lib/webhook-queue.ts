/**
 * AgentGuard — Webhook Queue (stub / future implementation)
 *
 * This module is reserved for a persistent webhook delivery queue
 * (e.g. BullMQ or a simple DB-backed queue for at-least-once delivery).
 *
 * Currently a no-op stub so that the graceful-shutdown path in server.ts
 * can safely call closeWebhookQueue() without a missing-module error.
 */

let _initialized = false;

/**
 * Mark the queue as initialized (called when the queue is started).
 * @internal
 */
export function markWebhookQueueInitialized(): void {
  _initialized = true;
}

/**
 * Close the webhook queue gracefully.
 * No-op when the queue has not been initialized.
 */
export async function closeWebhookQueue(): Promise<void> {
  if (!_initialized) return;
  // Future: drain pending jobs, close BullMQ workers, etc.
  _initialized = false;
}
