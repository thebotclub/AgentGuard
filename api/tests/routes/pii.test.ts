/**
 * Tests for POST /api/v1/pii/scan — PII Detection Endpoint
 *
 * Security-critical route: detects and redacts PII from content.
 *
 * Covers:
 *  - Happy path: scan with content, returns entities + redacted output
 *  - Auth required (401) — tenant auth enforced
 *  - Input validation (400) — missing content/text
 *  - Edge cases: dryRun=true, `text` alias, content too long
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createPIIRoutes } from '../../routes/pii.js';
import { createMockDb } from '../helpers/mock-db.js';
import { buildApp } from '../helpers/create-app.js';
import type { IDatabase } from '../../db-interface.js';

// ── Module mocks ──────────────────────────────────────────────────────────

vi.mock('../../lib/pii/regex-detector.js', () => ({
  defaultDetector: {
    scan: vi.fn().mockResolvedValue({
      entitiesFound: 1,
      entities: [
        { text: 'test@example.com', type: 'EMAIL', start: 14, end: 30, score: 0.99 },
      ],
      redactedContent: 'My email is [EMAIL REDACTED] and phone is 555-1234.',
    }),
  },
}));

vi.mock('../../routes/audit.js', () => ({
  storeAuditEvent: vi.fn().mockResolvedValue('mock-hash'),
  getGlobalKillSwitch: vi.fn().mockResolvedValue({ active: false, at: null }),
  fireWebhooksAsync: vi.fn(),
  getLastHash: vi.fn().mockResolvedValue(''),
  createAuditRoutes: vi.fn(),
}));

import { defaultDetector } from '../../lib/pii/regex-detector.js';
import { storeAuditEvent } from '../../routes/audit.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function buildPIIApp(db: IDatabase) {
  return buildApp(createPIIRoutes, db);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/pii/scan — authentication', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('returns 401 when no API key is provided', async () => {
    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .send({ content: 'My email is test@example.com' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 403 when an agent key is used (agent keys cannot call tenant endpoints)', async () => {
    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'ag_agent_someagentkey')
      .send({ content: 'My email is test@example.com' });

    expect(res.status).toBe(403);
  });

  it('returns 401 for an invalid tenant API key', async () => {
    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'invalid-garbage-key')
      .send({ content: 'My email is test@example.com' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/pii/scan — happy path', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('scans content and returns detected PII entities (raw text stripped)', async () => {
    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'valid-key')
      .send({ content: 'My email is test@example.com and phone is 555-1234.' });

    expect(res.status).toBe(200);
    expect(res.body.entitiesFound).toBe(1);
    expect(res.body.entities).toHaveLength(1);
    // Raw entity text must NOT be exposed in the response (security requirement)
    expect(res.body.entities[0]).not.toHaveProperty('text');
    expect(res.body.entities[0]).toHaveProperty('type', 'EMAIL');
    expect(res.body.entities[0]).toHaveProperty('score');
    expect(res.body.redactedContent).toContain('[EMAIL REDACTED]');
    expect(res.body.dryRun).toBe(false);
  });

  it('accepts `text` as an alias for `content`', async () => {
    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'valid-key')
      .send({ text: 'Call me at 555-1234.' });

    expect(res.status).toBe(200);
    expect(res.body.entitiesFound).toBeDefined();
  });

  it('stores an audit event when PII is detected (non-dryRun)', async () => {
    const app = buildPIIApp(mockDb);
    await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'valid-key')
      .send({ content: 'My email is test@example.com' });

    expect(storeAuditEvent).toHaveBeenCalledOnce();
    // Audit event should never include raw PII
    const callArgs = vi.mocked(storeAuditEvent).mock.calls[0]!;
    const reason = callArgs[7] as string;
    expect(reason).not.toContain('test@example.com');
  });
});

describe('POST /api/v1/pii/scan — input validation', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('returns 400 when neither content nor text is provided', async () => {
    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'valid-key')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 for empty body', async () => {
    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'valid-key')
      .send();

    expect(res.status).toBe(400);
  });

  it('returns 400 when content is an empty string', async () => {
    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'valid-key')
      .send({ content: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when content exceeds 50000 chars', async () => {
    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'valid-key')
      .send({ content: 'x'.repeat(50001) });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('50000');
  });
});

describe('POST /api/v1/pii/scan — dryRun mode', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('dryRun=true returns entities without storing an audit event', async () => {
    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'valid-key')
      .send({ content: 'My email is test@example.com', dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.entitiesFound).toBe(1);
    // No audit event should be written in dryRun mode
    expect(storeAuditEvent).not.toHaveBeenCalled();
  });

  it('dryRun=false (explicit) stores audit event when PII found', async () => {
    const app = buildPIIApp(mockDb);
    await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'valid-key')
      .send({ content: 'My email is test@example.com', dryRun: false });

    expect(storeAuditEvent).toHaveBeenCalledOnce();
  });

  it('no audit event stored when no PII is detected', async () => {
    vi.mocked(defaultDetector.scan).mockResolvedValueOnce({
      entitiesFound: 0,
      entities: [],
      redactedContent: 'Hello world, nothing sensitive here.',
    });

    const app = buildPIIApp(mockDb);
    const res = await request(app)
      .post('/api/v1/pii/scan')
      .set('x-api-key', 'valid-key')
      .send({ content: 'Hello world, nothing sensitive here.' });

    expect(res.status).toBe(200);
    expect(res.body.entitiesFound).toBe(0);
    expect(storeAuditEvent).not.toHaveBeenCalled();
  });
});
