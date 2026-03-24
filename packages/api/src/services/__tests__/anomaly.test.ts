/**
 * AnomalyService — Unit Tests
 *
 * Covers:
 * - computeScore: each detection rule independently
 * - Score capping at 1000
 * - Tier mapping: LOW / MEDIUM / HIGH / CRITICAL
 * - scoreAndPersist: writes AnomalyScore to DB
 * - Unusual hours boundary: exactly at 06:00 (ok) and 05:59 (flag)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnomalyService } from '../anomaly.js';
import type { AnomalyContext } from '../anomaly.js';
import type { ServiceContext } from '@agentguard/shared';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CTX: ServiceContext = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'admin',
  traceId: 'trace-1',
};

function makeRedis(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    zadd: vi.fn().mockResolvedValue(1),
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    zcard: vi.fn().mockResolvedValue(1),    // default: 1 event in window (no velocity flag)
    sadd: vi.fn().mockResolvedValue(0),     // default: tool already known
    set: vi.fn().mockResolvedValue('OK'),
    ...overrides,
  };
}

function makeDb(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    auditEvent: {
      findFirst: vi.fn().mockResolvedValue({ id: 'existing-event' }),
    },
    anomalyScore: {
      create: vi.fn().mockResolvedValue({ id: 'score-1', score: 0, tier: 'LOW', flags: [] }),
    },
    ...overrides,
  } as unknown as import('@prisma/client').PrismaClient;
}

function makeCtx(opts: Partial<AnomalyContext> = {}): AnomalyContext {
  return {
    auditEventId: 'evt-1',
    agentId: 'agent-1',
    sessionId: 'session-1',
    toolName: 'file_read',
    decision: 'allow',
    riskScore: 0,
    occurredAt: new Date('2024-06-15T12:00:00Z'), // 12:00 UTC — business hours
    sessionActionCount: 1,
    sessionBlockCount: 0,
    ...opts,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AnomalyService', () => {
  let db: ReturnType<typeof makeDb>;
  let redis: ReturnType<typeof makeRedis>;
  let svc: AnomalyService;

  beforeEach(() => {
    db = makeDb();
    redis = makeRedis();
    svc = new AnomalyService(db, CTX, redis as unknown as import('../../lib/redis.js').Redis);
    vi.clearAllMocks();
  });

  // ── computeScore ───────────────────────────────────────────────────────────

  describe('computeScore', () => {
    it('returns LOW tier with no flags for normal action', async () => {
      redis.zcard.mockResolvedValue(1); // low velocity

      const result = await svc.computeScore(makeCtx());

      expect(result.flags).toEqual([]);
      expect(result.tier).toBe('LOW');
      expect(result.score).toBe(0);
    });

    it('flags HIGH_VELOCITY when velocity > 30', async () => {
      redis.zcard.mockResolvedValue(31);

      const result = await svc.computeScore(makeCtx());

      expect(result.flags).toContain('HIGH_VELOCITY');
      expect(result.details['velocityCount']).toBe(31);
    });

    it('does NOT flag HIGH_VELOCITY when velocity exactly 30', async () => {
      redis.zcard.mockResolvedValue(30);

      const result = await svc.computeScore(makeCtx());

      expect(result.flags).not.toContain('HIGH_VELOCITY');
    });

    it('flags REPEATED_DENIALS when sessionBlockCount > 5', async () => {
      const result = await svc.computeScore(makeCtx({ sessionBlockCount: 6 }));

      expect(result.flags).toContain('REPEATED_DENIALS');
      expect(result.details['sessionBlockCount']).toBe(6);
    });

    it('does NOT flag REPEATED_DENIALS at exactly 5', async () => {
      const result = await svc.computeScore(makeCtx({ sessionBlockCount: 5 }));

      expect(result.flags).not.toContain('REPEATED_DENIALS');
    });

    it('flags UNUSUAL_HOURS before 06:00 UTC', async () => {
      const result = await svc.computeScore(
        makeCtx({ occurredAt: new Date('2024-06-15T05:59:00Z') }),
      );

      expect(result.flags).toContain('UNUSUAL_HOURS');
      expect(result.details['hourUtc']).toBe(5);
    });

    it('does NOT flag UNUSUAL_HOURS at exactly 06:00 UTC', async () => {
      const result = await svc.computeScore(
        makeCtx({ occurredAt: new Date('2024-06-15T06:00:00Z') }),
      );

      expect(result.flags).not.toContain('UNUSUAL_HOURS');
    });

    it('flags UNUSUAL_HOURS at and after 22:00 UTC', async () => {
      const result = await svc.computeScore(
        makeCtx({ occurredAt: new Date('2024-06-15T22:00:00Z') }),
      );

      expect(result.flags).toContain('UNUSUAL_HOURS');
    });

    it('does NOT flag UNUSUAL_HOURS at 21:59 UTC', async () => {
      const result = await svc.computeScore(
        makeCtx({ occurredAt: new Date('2024-06-15T21:59:00Z') }),
      );

      expect(result.flags).not.toContain('UNUSUAL_HOURS');
    });

    it('flags NEW_TOOL_FIRST_USE when sadd returns 1 and no DB event found', async () => {
      redis.sadd.mockResolvedValue(1);
      (db.auditEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await svc.computeScore(makeCtx({ toolName: 'new_tool' }));

      expect(result.flags).toContain('NEW_TOOL_FIRST_USE');
      expect(result.details['toolName']).toBe('new_tool');
    });

    it('does NOT flag NEW_TOOL_FIRST_USE when tool exists in DB', async () => {
      redis.sadd.mockResolvedValue(1); // new to redis
      (db.auditEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'old-event' }); // but in DB

      const result = await svc.computeScore(makeCtx({ toolName: 'existing_tool' }));

      expect(result.flags).not.toContain('NEW_TOOL_FIRST_USE');
    });

    it('does NOT check NEW_TOOL_FIRST_USE when toolName is null', async () => {
      const result = await svc.computeScore(makeCtx({ toolName: null }));

      expect(result.flags).not.toContain('NEW_TOOL_FIRST_USE');
      expect(redis.sadd).not.toHaveBeenCalled();
    });

    it('flags ACTION_COUNT_SPIKE when sessionActionCount > 200', async () => {
      const result = await svc.computeScore(makeCtx({ sessionActionCount: 201 }));

      expect(result.flags).toContain('ACTION_COUNT_SPIKE');
    });

    it('does NOT flag ACTION_COUNT_SPIKE at exactly 200', async () => {
      const result = await svc.computeScore(makeCtx({ sessionActionCount: 200 }));

      expect(result.flags).not.toContain('ACTION_COUNT_SPIKE');
    });

    it('accumulates score from multiple flags', async () => {
      redis.zcard.mockResolvedValue(31); // HIGH_VELOCITY +50
      // sessionBlockCount 6 => REPEATED_DENIALS +40
      // unusual hours => UNUSUAL_HOURS +20

      const result = await svc.computeScore(
        makeCtx({
          sessionBlockCount: 6,
          occurredAt: new Date('2024-06-15T02:00:00Z'),
          riskScore: 0,
        }),
      );

      expect(result.flags).toContain('HIGH_VELOCITY');
      expect(result.flags).toContain('REPEATED_DENIALS');
      expect(result.flags).toContain('UNUSUAL_HOURS');
      // 0 + 50 + 40 + 20 = 110
      expect(result.score).toBe(110);
    });

    it('caps score at 1000', async () => {
      redis.zcard.mockResolvedValue(100); // HIGH_VELOCITY
      redis.sadd.mockResolvedValue(1);
      (db.auditEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await svc.computeScore(
        makeCtx({
          riskScore: 900,
          sessionBlockCount: 10,
          sessionActionCount: 300,
          occurredAt: new Date('2024-06-15T02:00:00Z'),
          toolName: 'some_tool',
        }),
      );

      expect(result.score).toBe(1000);
    });

    it('maps score 0-199 to LOW tier', async () => {
      const result = await svc.computeScore(makeCtx({ riskScore: 0 }));
      expect(result.tier).toBe('LOW');
    });

    it('maps score 200-499 to MEDIUM tier', async () => {
      redis.zcard.mockResolvedValue(100); // +50
      const result = await svc.computeScore(makeCtx({ riskScore: 200 }));
      expect(result.tier).toBe('MEDIUM');
    });

    it('maps score 500-799 to HIGH tier', async () => {
      const result = await svc.computeScore(makeCtx({ riskScore: 500 }));
      expect(result.tier).toBe('HIGH');
    });

    it('maps score 800+ to CRITICAL tier', async () => {
      const result = await svc.computeScore(makeCtx({ riskScore: 800 }));
      expect(result.tier).toBe('CRITICAL');
    });
  });

  // ── scoreAndPersist ────────────────────────────────────────────────────────

  describe('scoreAndPersist', () => {
    it('creates an AnomalyScore record in DB', async () => {
      await svc.scoreAndPersist(makeCtx());

      expect(db.anomalyScore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            agentId: 'agent-1',
            auditEventId: 'evt-1',
            sessionId: 'session-1',
            method: 'RULE_BASED',
          }),
        }),
      );
    });

    it('includes computed flags and score in DB record', async () => {
      redis.zcard.mockResolvedValue(31);

      await svc.scoreAndPersist(makeCtx());

      expect(db.anomalyScore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            flags: expect.arrayContaining(['HIGH_VELOCITY']),
            score: expect.any(Number),
          }),
        }),
      );
    });

    it('returns the created AnomalyScore record', async () => {
      const created = { id: 'score-99', score: 50, tier: 'LOW', flags: [] };
      (db.anomalyScore.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      const result = await svc.scoreAndPersist(makeCtx());
      expect(result).toEqual(created);
    });
  });
});
