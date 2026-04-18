/**
 * AgentGuard API Server — Production Backend
 * SQLite persistence (default) or PostgreSQL (DB_TYPE=postgres + DATABASE_URL).
 * Real auth, tenant isolation, persistent audit trail.
 */
import crypto from 'node:crypto';
import { createApp } from './app.js';
import { createDb } from './db-factory.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { logger } from './lib/logger.js';
import { loadTemplates, DEFAULT_POLICY } from './lib/policy-engine-setup.js';
import { getGlobalKillSwitch } from './routes/audit.js';
import { createAnomalyDetector } from './lib/anomaly-detector.js';
import { initPubSub } from './lib/redis-pubsub.js';
import { startWebhookRetryCron } from './lib/webhook-retry.js';
import { gracefulShutdown } from './lib/shutdown.js';
import { registerRoutes, deliverWebhook } from './routes/index.js';
import {
  runValidationMigrations,
  runValidationMigrationsAsync,
} from './validation-routes.js';
import { ALLOWED_ORIGINS, IS_PRODUCTION } from './middleware/index.js';
import type { IDatabase } from './db-interface.js';

// ── Load Policy Templates ───────────────────────────────────────────────────
loadTemplates();

const PORT = parseInt(process.env['PORT'] || '3000', 10);

async function main(): Promise<void> {
  // ── Create Express app (pre-DB middleware) ───────────────────────────────
  const app = createApp();

  // ── Initialize database ──────────────────────────────────────────────────
  const { db, raw } = await createDb();

  // Run migrations
  if (raw) {
    runValidationMigrations(raw);
  } else {
    await runValidationMigrationsAsync(db).catch((e: Error) =>
      logger.warn('[migrations] validation columns:', e.message),
    );
  }

  // ── Build shared auth middleware ─────────────────────────────────────────
  const auth = createAuthMiddleware(db);

  // ── SSE connection registry (shared with routes/events.ts) ───────────────
  const sseRegistry = new Set<import('express').Response>();
  (app as unknown as { sseRegistry: Set<import('express').Response> }).sseRegistry = sseRegistry;

  // ── Mount all routes ─────────────────────────────────────────────────────
  registerRoutes(app, db, auth);

  // ── Seed tenant from API_KEY env var ─────────────────────────────────────
  const SEED_API_KEY = process.env['API_KEY'];
  if (SEED_API_KEY) {
    try {
      const keySha256 = crypto.createHash('sha256').update(SEED_API_KEY).digest('hex');
      const existing = await db.getApiKeyBySha256(keySha256);
      if (!existing) {
        const seedTenantId = 'seed-' + SEED_API_KEY.slice(-8);
        const existingTenant = await db.getTenant(seedTenantId);
        if (!existingTenant) {
          await db.run(
            'INSERT INTO tenants (id, name, email, plan, created_at) VALUES (?, ?, ?, ?, ?)',
            [
              seedTenantId,
              'AgentGuard Admin',
              'admin@agentguard.tech',
              'enterprise',
              new Date().toISOString(),
            ],
          );
        }
        await db.createApiKey(SEED_API_KEY, seedTenantId, 'default');
        logger.info(`[seed] registered API_KEY as tenant ${seedTenantId} (hashed)`);
      }
    } catch (e) {
      logger.error('[seed] failed to register API_KEY:', e);
    }
  }

  const ks = await getGlobalKillSwitch(db);

  // ── Redis Pub/Sub (SSE fan-out) ──────────────────────────────────────────
  await initPubSub().catch((e: Error) =>
    logger.warn('[pubsub] init error (non-fatal):', e.message),
  );

  // ── Anomaly Detection Loop ───────────────────────────────────────────────
  const detector = createAnomalyDetector(db);
  detector.start();

  // ── Webhook Retry Cron ───────────────────────────────────────────────────
  startWebhookRetryCron(db, async (webhookId, tenantId, eventType, payload) => {
    const wh = await db.getWebhookById(webhookId, tenantId);
    if (!wh || !wh.active) return false;
    return deliverWebhook(wh, eventType, JSON.parse(payload));
  });

  // ── Start HTTP server ────────────────────────────────────────────────────
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🛡️  AgentGuard API v0.9.0 running on port ${PORT}`);
    logger.info(
      `   ${DEFAULT_POLICY.rules.length} rules loaded | default: ${DEFAULT_POLICY.default}`,
    );
    logger.info(`   CORS: ${ALLOWED_ORIGINS.join(', ')}${!IS_PRODUCTION ? ', localhost:* (dev only)' : ''}`);
    logger.info(`   Rate limit: 10 req/min (unauthenticated) | 100 req/min (authenticated) per IP`);
    logger.info(`   DB: ${db.type} | ${process.env['AG_DB_PATH'] || 'default path'}`);
    logger.info(`   Global kill switch: ${ks.active ? 'ACTIVE ⚠️' : 'inactive'}`);
    if (process.env['ADMIN_KEY']) logger.info(`   Admin key: configured`);
    else logger.info(`   Admin key: NOT SET (set ADMIN_KEY env var)`);
    if (SEED_API_KEY) logger.info(`   Seed API key: registered`);
  });

  // ── Graceful Shutdown ────────────────────────────────────────────────────
  gracefulShutdown(server, db, app);
}

main().catch((err) => {
  logger.error('[fatal] Failed to start server:', err);
  process.exit(1);
});

// Re-export db type so tests/utilities can import it
export type { IDatabase };
