/**
 * Tests for GET /api/v1/health/detailed
 *
 * Covers:
 *  - Happy path: DB healthy → 200 with status "ok"
 *  - Degraded: DB unreachable → 503 with status "degraded"
 *  - Response structure validation
 *  - Cache-Control header
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createHealthRoutes } from '../../routes/health.js';
import { createMockDb } from '../helpers/mock-db.js';
import { buildDbOnlyApp } from '../helpers/create-app.js';
import type { IDatabase } from '../../db-interface.js';

describe('GET /api/v1/health/detailed', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildDbOnlyApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildDbOnlyApp(createHealthRoutes, mockDb);
  });

  it('returns 200 with status "ok" when database is healthy', async () => {
    (mockDb.run as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app).get('/api/v1/health/detailed');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.components.database.status).toBe('ok');
    expect(typeof res.body.components.database.latencyMs).toBe('number');
    expect(res.body.components.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns 503 with status "degraded" when database query fails', async () => {
    (mockDb.run as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB connection refused'));

    const res = await request(app).get('/api/v1/health/detailed');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.components.database.status).toBe('error');
  });

  it('includes version, uptime, and timestamp in response', async () => {
    const res = await request(app).get('/api/v1/health/detailed');

    expect(res.body).toHaveProperty('version');
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
    // Timestamp should be a valid ISO string
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('sets no-store Cache-Control header', async () => {
    const res = await request(app).get('/api/v1/health/detailed');

    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.headers['cache-control']).toMatch(/no-cache/);
  });

  it('runs the SELECT 1 probe against the database', async () => {
    await request(app).get('/api/v1/health/detailed');

    expect(mockDb.run).toHaveBeenCalledWith('SELECT 1', []);
  });
});
