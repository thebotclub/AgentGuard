/**
 * AgentGuard — Graceful Shutdown
 *
 * Handles SIGTERM/SIGINT by draining SSE connections, stopping the HTTP
 * server, and closing database/Redis connections.
 */
import type { Server } from 'node:http';
import type { Express } from 'express';
import { logger } from './logger.js';
import { closePubSub } from './redis-pubsub.js';
import type { IDatabase } from '../db-interface.js';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;

/**
 * Register graceful shutdown handlers for SIGTERM and SIGINT.
 */
export function gracefulShutdown(
  server: Server,
  db: IDatabase,
  app: Express,
): void {
  let shuttingDown = false;

  // SSE connection registry (set by routes/events.ts)
  const sseRegistry = (app as unknown as { sseRegistry?: Set<import('express').Response> }).sseRegistry;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`Graceful shutdown initiated (${signal})`);

    // Stop webhook retry cron
    try {
      const { stopWebhookRetryCron } = await import('./webhook-retry.js');
      stopWebhookRetryCron();
    } catch { /* non-critical */ }

    // 1a. Drain SSE connections
    if (sseRegistry && sseRegistry.size > 0) {
      logger.info(`Draining ${sseRegistry.size} active SSE connection(s)...`);
      for (const sseRes of sseRegistry) {
        try {
          sseRes.write('event: server-shutdown\ndata: {"reason":"graceful-shutdown"}\n\n');
          sseRes.end();
        } catch {
          // ignore — client may have already disconnected
        }
      }
      sseRegistry.clear();
      logger.info('SSE connections drained');
    }

    // 1b. Stop accepting new connections
    server.close(async (closeErr?: Error) => {
      if (closeErr) {
        logger.error({ error: String(closeErr) }, 'Error closing HTTP server');
      } else {
        logger.info('HTTP server closed — no more incoming connections');
      }

      // 3. Close database connections
      try {
        if (typeof (db as unknown as { close?: () => Promise<void> }).close === 'function') {
          await (db as unknown as { close: () => Promise<void> }).close();
          logger.info('Database connection closed');
        }
      } catch (e) {
        logger.error({ error: String(e) }, 'Error closing database');
      }

      // 4. Close Redis connections
      try {
        const { closeRedis } = await import('./redis-rate-limiter.js');
        if (typeof closeRedis === 'function') {
          await closeRedis();
          logger.info('Redis standalone connection closed');
        }
      } catch { /* Redis may not be configured */ }
      try {
        const { closeSentinel } = await import('./redis-sentinel.js');
        if (typeof closeSentinel === 'function') {
          await closeSentinel();
          logger.info('Redis sentinel connection closed');
        }
      } catch { /* Sentinel may not be configured */ }
      try {
        await closePubSub();
        logger.info('Redis Pub/Sub connections closed');
      } catch { /* Pub/Sub may not be connected */ }

      // 5. Close webhook queue worker
      try {
        const { closeWebhookQueue } = await import('./webhook-queue.js');
        if (typeof closeWebhookQueue === 'function') {
          await closeWebhookQueue();
          logger.info('Webhook queue closed');
        }
      } catch { /* Queue may not be initialized */ }

      // 6. Exit cleanly
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

    // Force-exit after timeout if in-flight requests don't drain
    setTimeout(() => {
      logger.error(`Shutdown timeout (${GRACEFUL_SHUTDOWN_TIMEOUT_MS}ms) exceeded — forcing exit`);
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS).unref();
  }

  process.once('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)); });
  process.once('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)); });
}
