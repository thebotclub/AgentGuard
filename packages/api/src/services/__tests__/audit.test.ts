/**
 * AuditService — Unit Tests
 *
 * Covers:
 * - queryEvents: filtering, pagination, tenant scope
 * - getEvent: found / not found
 * - ingestBatch: accepted count, per-session ordering, hash chain creation
 * - verifySessionChain: valid chain, broken previousHash, broken eventHash
 * - computeEventHash: deterministic, different for different data
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService, computeEventHash } from '../audit.js';
import { NotFoundError } from '../../lib/errors.js';
import type { ServiceContext } from '@agentguard/shared';
import { GENESIS_HASH } from '@agentguard/shared';
import type { AuditEvent } from '@prisma/client';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CTX: ServiceContext = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'admin',
  traceId: 'trace-1',
};

const MOCK_EVENT: AuditEvent = {
  id: 'evt-1',
  tenantId: 'tenant-1',
  agentId: 'agent-1',
  sessionId: 'session-1',
  occurredAt: new Date('2024-01-01T12:00:00Z'),
  processingMs: 5,
  actionType: 'TOOL_CALL',
  toolName: 'file_read',
  toolTarget: null,
  actionParams: null,
  executionMs: null,
  policyDecision: 'ALLOW',
  policyVersion: null,
  matchedRuleId: null,
  matchedRuleIds: [],
  blockReason: null,
  riskScore: 0,
  riskTier: 'LOW',
  inputDataLabels: [],
  outputDataLabels: [],
  planningTraceSummary: null,
  ragSourceIds: [],
  priorEventIds: [],
  previousHash: GENESIS_HASH,
  eventHash: 'abc123',
  createdAt: new Date('2024-01-01T12:00:00Z'),
};

function makeRedis() {
  return {
    zadd: vi.fn().mockResolvedValue(1),
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    zcard: vi.fn().mockResolvedValue(1),
    sadd: vi.fn().mockResolvedValue(0),
  };
}

function makeDb() {
  const sessionFindFirst = vi.fn().mockResolvedValue({
    id: 'session-1',
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    actionCount: 1,
    blockCount: 0,
    riskScoreMax: 0,
  });

  const eventFindFirst = vi.fn().mockResolvedValue(null); // no previous hash
  const eventFindMany = vi.fn().mockResolvedValue([MOCK_EVENT]);
  const eventCreate = vi.fn().mockResolvedValue(MOCK_EVENT);
  const sessionCreate = vi.fn().mockResolvedValue({ id: 'session-1', actionCount: 0, blockCount: 0, riskScoreMax: 0 });
  const sessionUpdate = vi.fn().mockResolvedValue({});
  const anomalyScoreCreate = vi.fn().mockResolvedValue({ id: 'score-1' });

  return {
    auditEvent: {
      findMany: eventFindMany,
      findFirst: eventFindFirst,
      create: eventCreate,
    },
    agentSession: {
      findFirst: sessionFindFirst,
      create: sessionCreate,
      update: sessionUpdate,
    },
    anomalyScore: {
      create: anomalyScoreCreate,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        auditEvent: { findFirst: eventFindFirst, create: eventCreate },
        agentSession: { findFirst: sessionFindFirst, create: sessionCreate, update: sessionUpdate },
      };
      return fn(tx);
    }),
  } as unknown as import('@prisma/client').PrismaClient;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AuditService', () => {
  let db: ReturnType<typeof makeDb>;
  let redis: ReturnType<typeof makeRedis>;
  let svc: AuditService;

  beforeEach(() => {
    db = makeDb();
    redis = makeRedis();
    svc = new AuditService(db, CTX, redis as unknown as import('../../lib/redis.js').Redis);
    vi.clearAllMocks();
  });

  // ── queryEvents ────────────────────────────────────────────────────────────

  describe('queryEvents', () => {
    it('queries with tenant scope', async () => {
      await svc.queryEvents({ limit: 50 });
      expect(db.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
        }),
      );
    });

    it('applies agentId filter', async () => {
      await svc.queryEvents({ agentId: 'agent-abc', limit: 50 });
      expect(db.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agentId: 'agent-abc' }),
        }),
      );
    });

    it('applies decision filter', async () => {
      await svc.queryEvents({ decision: 'BLOCK', limit: 50 });
      expect(db.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ policyDecision: 'BLOCK' }),
        }),
      );
    });

    it('applies date range filter', async () => {
      await svc.queryEvents({
        fromDate: '2024-01-01',
        toDate: '2024-12-31',
        limit: 50,
      });

      expect(db.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            occurredAt: {
              gte: new Date('2024-01-01'),
              lte: new Date('2024-12-31'),
            },
          }),
        }),
      );
    });

    it('applies riskTier filter', async () => {
      await svc.queryEvents({ riskTier: 'HIGH', limit: 50 });
      expect(db.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ riskTier: 'HIGH' }),
        }),
      );
    });

    it('applies toolName filter', async () => {
      await svc.queryEvents({ toolName: 'file_read', limit: 50 });
      expect(db.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ toolName: 'file_read' }),
        }),
      );
    });

    it('applies cursor for pagination', async () => {
      await svc.queryEvents({ cursor: 'evt-cursor', limit: 10 });
      expect(db.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'evt-cursor' },
          skip: 1,
        }),
      );
    });

    it('returns events array', async () => {
      const result = await svc.queryEvents({ limit: 50 });
      expect(result).toEqual([MOCK_EVENT]);
    });
  });

  // ── getEvent ───────────────────────────────────────────────────────────────

  describe('getEvent', () => {
    it('returns event when found', async () => {
      (db.auditEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_EVENT);
      const result = await svc.getEvent('evt-1');
      expect(result).toEqual(MOCK_EVENT);
    });

    it('throws NotFoundError when event not found', async () => {
      (db.auditEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(svc.getEvent('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('includes tenant scope in query', async () => {
      (db.auditEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_EVENT);
      await svc.getEvent('evt-1');
      expect(db.auditEvent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', id: 'evt-1' }),
        }),
      );
    });
  });

  // ── ingestBatch ────────────────────────────────────────────────────────────

  describe('ingestBatch', () => {
    it('returns accepted count for valid events', async () => {
      const result = await svc.ingestBatch({
        agentId: 'agent-1',
        events: [
          {
            clientEventId: 'c1',
            sessionId: 'session-1',
            occurredAt: '2024-01-01T12:00:00Z',
            actionType: 'TOOL_CALL',
            toolName: 'file_read',
            decision: 'allow',
            riskScore: 0,
            matchedRuleIds: [],
            inputDataLabels: [],
            outputDataLabels: [],
            ragSourceIds: [],
            priorEventIds: [],
          },
        ],
      });

      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(0);
    });

    it('creates audit event with genesis hash for first event in session', async () => {
      (db.agentSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // no session
      (db.auditEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // no previous event

      await svc.ingestBatch({
        agentId: 'agent-1',
        events: [
          {
            clientEventId: 'c1',
            sessionId: 'new-session',
            occurredAt: '2024-01-01T12:00:00Z',
            actionType: 'TOOL_CALL',
            decision: 'allow',
            riskScore: 0,
            matchedRuleIds: [],
            inputDataLabels: [],
            outputDataLabels: [],
            ragSourceIds: [],
            priorEventIds: [],
          },
        ],
      });

      expect(db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            previousHash: GENESIS_HASH,
          }),
        }),
      );
    });

    it('returns errors for failed events without stopping others', async () => {
      // First call succeeds, second fails
      const createMock = (db.auditEvent.create as ReturnType<typeof vi.fn>);
      createMock
        .mockResolvedValueOnce(MOCK_EVENT)
        .mockRejectedValueOnce(new Error('DB error'));

      const result = await svc.ingestBatch({
        agentId: 'agent-1',
        events: [
          {
            clientEventId: 'c1',
            sessionId: 'session-1',
            occurredAt: '2024-01-01T12:00:00Z',
            actionType: 'TOOL_CALL',
            decision: 'allow',
            riskScore: 0,
            matchedRuleIds: [],
            inputDataLabels: [],
            outputDataLabels: [],
            ragSourceIds: [],
            priorEventIds: [],
          },
          {
            clientEventId: 'c2',
            sessionId: 'session-2',
            occurredAt: '2024-01-01T12:01:00Z',
            actionType: 'TOOL_CALL',
            decision: 'allow',
            riskScore: 0,
            matchedRuleIds: [],
            inputDataLabels: [],
            outputDataLabels: [],
            ragSourceIds: [],
            priorEventIds: [],
          },
        ],
      });

      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(1);
      expect(result.errors[0]?.clientEventId).toBe('c2');
    });
  });

  // ── verifySessionChain ─────────────────────────────────────────────────────

  describe('verifySessionChain', () => {
    it('reports chainValid: true for empty session', async () => {
      (db.auditEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await svc.verifySessionChain('session-1');

      expect(result.chainValid).toBe(true);
      expect(result.eventCount).toBe(0);
    });

    it('reports chainValid: true for valid single-event chain', async () => {
      const hash = computeEventHash(GENESIS_HASH, {
        eventId: 'evt-1',
        agentId: 'agent-1',
        tenantId: 'tenant-1',
        occurredAt: '2024-01-01T12:00:00.000Z',
        actionType: 'TOOL_CALL',
        toolName: 'file_read',
        decision: 'ALLOW',
        riskScore: 0,
      });

      (db.auditEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          ...MOCK_EVENT,
          previousHash: GENESIS_HASH,
          eventHash: hash,
        },
      ]);

      const result = await svc.verifySessionChain('session-1');

      expect(result.chainValid).toBe(true);
      expect(result.eventCount).toBe(1);
    });

    it('reports chainValid: false when previousHash is wrong', async () => {
      (db.auditEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          ...MOCK_EVENT,
          previousHash: 'WRONG_HASH',
          eventHash: 'some-hash',
        },
      ]);

      const result = await svc.verifySessionChain('session-1');

      expect(result.chainValid).toBe(false);
      expect(result.firstBrokenAt?.position).toBe(0);
    });

    it('reports chainValid: false when eventHash is tampered', async () => {
      (db.auditEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          ...MOCK_EVENT,
          previousHash: GENESIS_HASH,
          eventHash: 'tampered-hash', // doesn't match computed value
        },
      ]);

      const result = await svc.verifySessionChain('session-1');

      expect(result.chainValid).toBe(false);
      expect(result.firstBrokenAt?.actual).toBe('tampered-hash');
    });
  });

  // ── computeEventHash (exported pure function) ──────────────────────────────

  describe('computeEventHash', () => {
    it('is deterministic for same inputs', () => {
      const payload = {
        eventId: 'evt-1',
        agentId: 'agent-1',
        tenantId: 'tenant-1',
        occurredAt: '2024-01-01T12:00:00Z',
        actionType: 'TOOL_CALL',
        toolName: 'file_read',
        decision: 'ALLOW',
        riskScore: 0,
      };

      expect(computeEventHash(GENESIS_HASH, payload)).toBe(
        computeEventHash(GENESIS_HASH, payload),
      );
    });

    it('produces different hashes for different event IDs', () => {
      const base = {
        agentId: 'agent-1',
        tenantId: 'tenant-1',
        occurredAt: '2024-01-01T12:00:00Z',
        actionType: 'TOOL_CALL',
        toolName: 'file_read',
        decision: 'ALLOW',
        riskScore: 0,
      };

      const hash1 = computeEventHash(GENESIS_HASH, { ...base, eventId: 'evt-1' });
      const hash2 = computeEventHash(GENESIS_HASH, { ...base, eventId: 'evt-2' });

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hashes for different previous hashes (chain linkage)', () => {
      const payload = {
        eventId: 'evt-1',
        agentId: 'agent-1',
        tenantId: 'tenant-1',
        occurredAt: '2024-01-01T12:00:00Z',
        actionType: 'TOOL_CALL',
        toolName: null,
        decision: 'ALLOW',
        riskScore: 0,
      };

      const hash1 = computeEventHash(GENESIS_HASH, payload);
      const hash2 = computeEventHash('different-previous-hash', payload);

      expect(hash1).not.toBe(hash2);
    });

    it('returns a 64-char hex string (SHA-256)', () => {
      const hash = computeEventHash(GENESIS_HASH, {
        eventId: 'evt-1',
        agentId: 'a',
        tenantId: 't',
        occurredAt: '2024-01-01T00:00:00Z',
        actionType: 'TOOL_CALL',
        toolName: null,
        decision: 'ALLOW',
        riskScore: 0,
      });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
