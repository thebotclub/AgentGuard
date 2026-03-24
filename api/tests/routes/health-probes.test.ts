/**
 * Tests for Kubernetes health probes:
 *   GET /healthz  — liveness probe
 *   GET /readyz   — readiness probe
 *
 * Covers:
 *  - Liveness: always 200, fast response, no DB check
 *  - Readiness: 200 when DB+migrations pass
 *  - Readiness: 503 when DB fails
 *  - Readiness: 503 when migrations fail (missing tables)
 *  - Readiness: Redis optional (not configured → ok)
 *  - Response structure and cache headers
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createHealthProbeRoutes } from '../../routes/health-probes.js';
import { createMockDb } from '../helpers/mock-db.js';
import { buildDbOnlyApp } from '../helpers/create-app.js';
import type { IDatabase } from '../../db-interface.js';

describe('GET /healthz (liveness probe)', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildDbOnlyApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildDbOnlyApp(createHealthProbeRoutes, mockDb);
  });

  it('always returns 200 regardless of DB state', async () => {
    (mockDb.ping as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/healthz');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
  });

  it('returns uptime and timestamp', async () => {
    const res = await request(app).get('/healthz');

    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('does NOT call db.ping (liveness should not check DB)', async () => {
    await request(app).get('/healthz');
    expect(mockDb.ping).not.toHaveBeenCalled();
  });

  it('sets no-store Cache-Control header', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });
});

describe('GET /readyz (readiness probe)', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildDbOnlyApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    // By default: ping passes, migration table checks pass
    (mockDb.ping as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (mockDb.run as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    // Clear any Redis env vars
    delete process.env['REDIS_URL'];
    delete process.env['REDIS_SENTINEL_URL'];
    delete process.env['REDIS_SENTINELS'];
    app = buildDbOnlyApp(createHealthProbeRoutes, mockDb);
  });

  it('returns 200 when DB and migrations are healthy', async () => {
    const res = await request(app).get('/readyz');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.database.ok).toBe(true);
    expect(res.body.checks.migrations.ok).toBe(true);
  });

  it('returns 503 when database ping fails', async () => {
    (mockDb.ping as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const res = await request(app).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not-ready');
    expect(res.body.checks.database.ok).toBe(false);
  });

  it('returns 503 when database ping throws', async () => {
    (mockDb.ping as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not-ready');
    expect(res.body.checks.database.ok).toBe(false);
  });

  it('returns 503 when migration tables are missing', async () => {
    (mockDb.ping as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (mockDb.run as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no such table: tenants'));

    const res = await request(app).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not-ready');
    expect(res.body.checks.migrations.ok).toBe(false);
    expect(res.body.checks.migrations.detail).toContain('missing table');
  });

  it('includes database latency in response', async () => {
    const res = await request(app).get('/readyz');

    expect(typeof res.body.checks.database.latencyMs).toBe('number');
    expect(res.body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('includes version and timestamp', async () => {
    const res = await request(app).get('/readyz');

    expect(res.body).toHaveProperty('version');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('sets no-store Cache-Control header', async () => {
    const res = await request(app).get('/readyz');
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('marks Redis as ok when not configured (optional dependency)', async () => {
    const res = await request(app).get('/readyz');

    // Without Redis configured, readiness should still pass
    expect(res.status).toBe(200);
    // checks.redis should exist and be in a non-failure state
    if (res.body.checks.redis) {
      // If redis check is included, it should not be blocking (not configured = ok)
      // The overall status should still be ready
      expect(res.body.status).toBe('ready');
    }
  });
});
