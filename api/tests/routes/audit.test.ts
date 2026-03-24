/**
 * Integration tests for Audit Routes:
 *   GET  /api/v1/audit         — paginated audit trail
 *   GET  /api/v1/audit/events  — cursor-based audit events
 *   GET  /api/v1/audit/verify  — verify hash chain integrity
 *   GET  /api/v1/audit/export  — export as CSV or JSON
 *   POST /api/v1/audit/repair  — repair hash chain (admin)
 *
 * Covers: auth, pagination, filtering, chain verification, export formats, error cases
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createAuditRoutes } from '../../routes/audit.js';
import { createMockDb } from '../helpers/mock-db.js';
import { buildApp } from '../helpers/create-app.js';
import type { IDatabase } from '../../db-interface.js';

// ── Sample audit events for testing ───────────────────────────────────────

function makeAuditEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    tenant_id: 'tenant-123',
    agent_id: 'agent-456',
    tool: 'file_read',
    action: null,
    result: 'allow',
    matched_rule_id: null,
    risk_score: 0,
    duration_ms: 5,
    session_id: null,
    previous_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    hash: 'abc123',
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── GET /api/v1/audit ─────────────────────────────────────────────────────

describe('GET /api/v1/audit', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createAuditRoutes, mockDb);
  });

  it('returns 401 without API key', async () => {
    const res = await request(app).get('/api/v1/audit');
    expect(res.status).toBe(401);
  });

  it('returns 403 for agent keys', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('x-api-key', 'ag_agent_somekey');
    expect(res.status).toBe(403);
  });

  it('returns audit events with pagination metadata', async () => {
    const events = [makeAuditEvent(), makeAuditEvent({ id: 2, tool: 'file_write' })];
    (mockDb.getAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(events);
    (mockDb.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(42);

    const res = await request(app)
      .get('/api/v1/audit')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe('tenant-123');
    expect(res.body.total).toBe(42);
    expect(res.body.limit).toBe(50); // default
    expect(res.body.offset).toBe(0); // default
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events).toHaveLength(2);
  });

  it('returns empty events list when no audit trail', async () => {
    (mockDb.getAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockDb.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/audit')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.events).toHaveLength(0);
  });

  it('respects limit and offset query params', async () => {
    (mockDb.getAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockDb.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(100);

    const res = await request(app)
      .get('/api/v1/audit?limit=10&offset=20')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(20);
    expect(mockDb.getAuditEvents).toHaveBeenCalledWith('tenant-123', 10, 20);
  });

  it('caps limit at 500', async () => {
    (mockDb.getAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockDb.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/audit?limit=9999')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(500);
    expect(mockDb.getAuditEvents).toHaveBeenCalledWith('tenant-123', 500, 0);
  });
});

// ── GET /api/v1/audit/events ──────────────────────────────────────────────

describe('GET /api/v1/audit/events (cursor-based)', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createAuditRoutes, mockDb);
  });

  it('returns 401 without API key', async () => {
    const res = await request(app).get('/api/v1/audit/events');
    expect(res.status).toBe(401);
  });

  it('returns events list with null nextCursor when fewer than limit', async () => {
    const events = [makeAuditEvent(), makeAuditEvent({ id: 2 })];
    (mockDb.getAuditEventsCursor as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const res = await request(app)
      .get('/api/v1/audit/events')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.nextCursor).toBeNull(); // 2 < 50 (default limit)
  });

  it('returns nextCursor when page is full', async () => {
    // Return exactly 50 events (default limit) → nextCursor should be set
    const events = Array.from({ length: 50 }, (_, i) =>
      makeAuditEvent({ id: i + 1, created_at: `2024-01-01T00:00:${String(i).padStart(2, '0')}.000Z` }),
    );
    (mockDb.getAuditEventsCursor as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const res = await request(app)
      .get('/api/v1/audit/events')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(50);
    expect(res.body.nextCursor).toBeTruthy();
    expect(res.body.nextCursor).toBe(events[49]!.created_at);
  });

  it('passes before cursor to DB', async () => {
    (mockDb.getAuditEventsCursor as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const before = '2024-06-01T12:00:00.000Z';
    const res = await request(app)
      .get(`/api/v1/audit/events?before=${before}`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(mockDb.getAuditEventsCursor).toHaveBeenCalledWith('tenant-123', 50, before);
  });

  it('returns 400 for invalid before timestamp', async () => {
    const res = await request(app)
      .get('/api/v1/audit/events?before=not-a-date')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(400);
  });

  it('returns 400 for limit out of range', async () => {
    const res = await request(app)
      .get('/api/v1/audit/events?limit=0')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/audit/verify ──────────────────────────────────────────────

import { makeHash } from '../../routes/audit.js';
import { GENESIS_HASH } from '../../../packages/sdk/src/core/types.js';

describe('GET /api/v1/audit/verify', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createAuditRoutes, mockDb);
  });

  it('returns 401 without API key', async () => {
    const res = await request(app).get('/api/v1/audit/verify');
    expect(res.status).toBe(401);
  });

  it('returns valid=true with eventCount=0 when no events', async () => {
    (mockDb.getAllAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/audit/verify')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.eventCount).toBe(0);
  });

  it('verifies a valid hash chain', async () => {
    // Build a proper chain
    const ts1 = '2024-01-01T00:00:01.000Z';
    const ts2 = '2024-01-01T00:00:02.000Z';
    const h1 = makeHash(`file_read|allow|${ts1}`, GENESIS_HASH);
    const h2 = makeHash(`file_write|block|${ts2}`, h1);

    const events = [
      { id: 1, tool: 'file_read', result: 'allow', created_at: ts1, previous_hash: GENESIS_HASH, hash: h1 },
      { id: 2, tool: 'file_write', result: 'block', created_at: ts2, previous_hash: h1, hash: h2 },
    ];
    (mockDb.getAllAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const res = await request(app)
      .get('/api/v1/audit/verify')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.eventCount).toBe(2);
    expect(res.body.errors).toBeUndefined();
  });

  it('detects a tampered hash chain', async () => {
    const ts1 = '2024-01-01T00:00:01.000Z';
    const events = [
      {
        id: 1,
        tool: 'file_read',
        result: 'allow',
        created_at: ts1,
        previous_hash: GENESIS_HASH,
        hash: 'tampered_hash_value', // wrong hash
      },
    ];
    (mockDb.getAllAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const res = await request(app)
      .get('/api/v1/audit/verify')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('detects broken previous_hash link', async () => {
    const ts1 = '2024-01-01T00:00:01.000Z';
    const ts2 = '2024-01-01T00:00:02.000Z';
    const h1 = makeHash(`file_read|allow|${ts1}`, GENESIS_HASH);
    // Second event has wrong previous_hash
    const events = [
      { id: 1, tool: 'file_read', result: 'allow', created_at: ts1, previous_hash: GENESIS_HASH, hash: h1 },
      { id: 2, tool: 'file_write', result: 'block', created_at: ts2, previous_hash: 'wrong_previous', hash: 'any' },
    ];
    (mockDb.getAllAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const res = await request(app)
      .get('/api/v1/audit/verify')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.some((e: string) => e.includes('previous_hash mismatch'))).toBe(true);
  });
});

// ── GET /api/v1/audit/export ──────────────────────────────────────────────

describe('GET /api/v1/audit/export', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  const sampleEvents = [
    {
      id: 1,
      tenant_id: 'tenant-123',
      agent_id: 'agent-456',
      tool: 'file_read',
      action: null,
      result: 'allow',
      created_at: '2024-01-01T10:00:00.000Z',
      hash: 'hash1',
      previous_hash: GENESIS_HASH,
    },
    {
      id: 2,
      tenant_id: 'tenant-123',
      agent_id: 'agent-456',
      tool: 'shell_exec',
      action: null,
      result: 'block',
      created_at: '2024-02-01T10:00:00.000Z',
      hash: 'hash2',
      previous_hash: 'hash1',
    },
  ];

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createAuditRoutes, mockDb);
    (mockDb.getAllAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(sampleEvents);
  });

  it('returns 401 without API key', async () => {
    const res = await request(app).get('/api/v1/audit/export');
    expect(res.status).toBe(401);
  });

  it('exports CSV by default', async () => {
    const res = await request(app)
      .get('/api/v1/audit/export')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/\.csv/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toContain('timestamp,agent_id,tool,action,result,hash');
    expect(res.text).toContain('file_read');
    expect(res.text).toContain('shell_exec');
  });

  it('exports JSON when format=json', async () => {
    const res = await request(app)
      .get('/api/v1/audit/export?format=json')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(/\.json/);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('tool', 'file_read');
    expect(res.body[0]).toHaveProperty('result', 'allow');
    expect(res.body[0]).toHaveProperty('timestamp');
  });

  it('filters by from date', async () => {
    const res = await request(app)
      .get('/api/v1/audit/export?format=json&from=2024-02-01T00:00:00.000Z')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tool).toBe('shell_exec');
  });

  it('filters by to date', async () => {
    const res = await request(app)
      .get('/api/v1/audit/export?format=json&to=2024-01-31T23:59:59.000Z')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tool).toBe('file_read');
  });

  it('filters by from+to date range', async () => {
    const res = await request(app)
      .get('/api/v1/audit/export?format=json&from=2024-01-01T00:00:00.000Z&to=2024-01-31T23:59:59.000Z')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tool).toBe('file_read');
  });

  it('returns 400 for invalid from date', async () => {
    const res = await request(app)
      .get('/api/v1/audit/export?from=not-a-date')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('from');
  });

  it('returns 400 for invalid to date', async () => {
    const res = await request(app)
      .get('/api/v1/audit/export?to=bad-date')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('to');
  });

  it('exports empty CSV when no events match filter', async () => {
    const res = await request(app)
      .get('/api/v1/audit/export?from=2099-01-01T00:00:00.000Z')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    // CSV header only
    expect(res.text).toContain('timestamp,agent_id,tool');
    // No data rows beyond header
    const lines = res.text.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
  });

  it('CSV properly escapes fields with commas', async () => {
    const eventsWithComma = [{
      ...sampleEvents[0],
      tool: 'tool,with,commas',
    }];
    (mockDb.getAllAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(eventsWithComma);

    const res = await request(app)
      .get('/api/v1/audit/export')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.text).toContain('"tool,with,commas"');
  });
});

// ── POST /api/v1/audit/repair ─────────────────────────────────────────────

describe('POST /api/v1/audit/repair', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createAuditRoutes, mockDb);
  });

  it('returns 401 without API key', async () => {
    const res = await request(app).post('/api/v1/audit/repair');
    expect(res.status).toBe(401);
  });

  it('returns repaired=0 when chain is already intact', async () => {
    const ts1 = '2024-01-01T00:00:01.000Z';
    const h1 = makeHash(`file_read|allow|${ts1}`, GENESIS_HASH);
    const events = [
      { id: 1, tool: 'file_read', result: 'allow', created_at: ts1, previous_hash: GENESIS_HASH, hash: h1 },
    ];
    (mockDb.getAllAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(events);

    const res = await request(app)
      .post('/api/v1/audit/repair')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.repaired).toBe(0);
    expect(res.body.total).toBe(1);
  });

  it('returns repaired=0 when no events', async () => {
    (mockDb.getAllAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app)
      .post('/api/v1/audit/repair')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.repaired).toBe(0);
    expect(res.body.total).toBe(0);
  });

  it('repairs broken hashes and returns correct count', async () => {
    const ts1 = '2024-01-01T00:00:01.000Z';
    const events = [
      { id: 1, tool: 'file_read', result: 'allow', created_at: ts1, previous_hash: 'wrong', hash: 'wrong_hash' },
    ];
    (mockDb.getAllAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(events);
    (mockDb.updateAuditEventHashes as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/audit/repair')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.repaired).toBe(1);
    expect(res.body.total).toBe(1);
    expect(mockDb.updateAuditEventHashes).toHaveBeenCalledOnce();
  });
});
