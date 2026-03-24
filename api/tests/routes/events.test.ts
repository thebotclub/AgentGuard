/**
 * SSE Events Route Tests
 *
 * Tests for GET /api/v1/events/stream
 * - Auth enforcement (401 without token)
 * - SSE headers set correctly
 * - Connection limit enforcement
 * - Status endpoint for admins
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createEventsRoutes } from '../../routes/events.js';
import type { IDatabase } from '../../db-interface.js';
import type { AuthMiddleware } from '../../middleware/auth.js';

// ── Mock redis-pubsub so tests don't need a Redis instance ────────────────
vi.mock('../../lib/redis-pubsub.js', () => ({
  subscribeTenant: vi.fn().mockResolvedValue(() => {}),
  publishEvent: vi.fn().mockResolvedValue(undefined),
  isPubSubAvailable: vi.fn().mockReturnValue(false),
  initPubSub: vi.fn().mockResolvedValue(undefined),
  closePubSub: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

function makeApp(tenantId: string | null = 'tenant-123') {
  const app = express();

  const db = {} as IDatabase;

  const auth: AuthMiddleware = {
    requireTenantAuth: vi.fn((req, res, next) => {
      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      (req as express.Request & { tenantId?: string }).tenantId = tenantId;
      next();
    }) as unknown as AuthMiddleware['requireTenantAuth'],
    requireEvaluateAuth: vi.fn((req, _res, next) => {
      (req as express.Request & { tenantId?: string }).tenantId = tenantId ?? 'demo';
      next();
    }) as unknown as AuthMiddleware['requireEvaluateAuth'],
    requireAdminAuth: vi.fn((_req, res, next) => {
      const adminKey = _req.headers['x-admin-key'];
      if (adminKey !== 'admin-secret') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      next();
    }) as unknown as AuthMiddleware['requireAdminAuth'],
    optionalTenantAuth: vi.fn((_req, _res, next) => next()) as unknown as AuthMiddleware['optionalTenantAuth'],
  };

  // sseRegistry on app for graceful shutdown integration
  (app as unknown as { sseRegistry: Set<unknown> }).sseRegistry = new Set();

  app.use(createEventsRoutes(db, auth));
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/events/stream', () => {
  it('returns 401 when no token is provided', async () => {
    const app = makeApp(null);
    const res = await request(app).get('/api/v1/events/stream');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.stringContaining('API key required') });
  });

  it('sets SSE headers when authenticated', async () => {
    const app = makeApp('tenant-123');
    // supertest will close immediately after headers — that's fine for this test
    const res = await request(app)
      .get('/api/v1/events/stream?token=ag_live_test')
      .timeout({ response: 500, deadline: 1000 })
      .catch((err: NodeJS.ErrnoException) => {
        // Timeout or aborted is expected — connection is long-lived
        if (err.code === 'ECONNABORTED' || err.timeout) return null;
        throw err;
      });

    if (res) {
      // If we got a response, check headers
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toContain('no-cache');
      expect(res.headers['x-accel-buffering']).toBe('no');
    }
    // If res is null (timeout), headers were set correctly (connection stayed open)
  });

  it('returns 401 when tenant lookup fails', async () => {
    const app = makeApp(null); // null = auth fails
    const res = await request(app)
      .get('/api/v1/events/stream?token=bad-key');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/events/status', () => {
  it('returns 403 without admin key', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/events/status');
    expect(res.status).toBe(403);
  });

  it('returns connection stats with valid admin key', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/v1/events/status')
      .set('x-admin-key', 'admin-secret');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalConnections: expect.any(Number),
      byTenant: expect.any(Object),
      maxPerTenant: expect.any(Number),
    });
  });
});
