/**
 * Tests for public playground routes.
 *
 * The playground is the unauthenticated customer demo surface. Protected
 * production evaluation remains covered in evaluate.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createPlaygroundRoutes } from '../../routes/playground.js';
import { createMockDb } from '../helpers/mock-db.js';
import { buildApp } from '../helpers/create-app.js';
import { sessions } from '../../lib/sessions.js';
import type { IDatabase } from '../../db-interface.js';

vi.mock('../../routes/audit.js', () => ({
  getGlobalKillSwitch: vi.fn().mockResolvedValue({ active: false, at: null }),
  getLastHash: vi.fn().mockResolvedValue(''),
  storeAuditEvent: vi.fn().mockResolvedValue('mock-hash'),
  makeHash: vi.fn().mockReturnValue('mock-event-hash'),
}));

describe('Playground routes', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessions.clear();
    mockDb = createMockDb();
    app = buildApp(createPlaygroundRoutes, mockDb);
  });

  it('creates an unauthenticated demo session', async () => {
    const res = await request(app)
      .post('/api/v1/playground/session')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toEqual(expect.any(String));
    expect(res.body.policy).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      ruleCount: expect.any(Number),
    });
  });

  it('evaluates an unauthenticated demo action', async () => {
    const session = await request(app)
      .post('/api/v1/playground/session')
      .send({});

    const res = await request(app)
      .post('/api/v1/playground/evaluate')
      .send({
        sessionId: session.body.sessionId,
        tool: 'sudo',
        params: { command: 'whoami' },
      });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(session.body.sessionId);
    expect(res.body.decision.result).toBe('block');
    expect(res.body.session.auditTrailLength).toBe(1);
  });

  it('keeps authenticated playground requests scoped to the tenant', async () => {
    const res = await request(app)
      .post('/api/v1/playground/session')
      .set('x-api-key', 'valid-key')
      .send({});

    expect(res.status).toBe(200);
    expect(mockDb.upsertSession).toHaveBeenCalledWith(
      res.body.sessionId,
      'tenant-123',
    );
  });
});
