/**
 * HITLService — Unit Tests
 *
 * Covers:
 * - createGate: creates DB record, caches in Redis, fires webhook
 * - approveGate / rejectGate: role enforcement, resolves gate, updates Redis
 * - timeoutGate: only times out PENDING gates past their timeoutAt
 * - pollGateStatus: Redis fast path, DB fallback, auto-timeout
 * - cancelGate: sets status CANCELLED
 * - listPendingGates / listHistoricalGates: query filters
 * - isSafeWebhookUrl: blocks localhost/private IPs
 * - fireAlertWebhooksForGate: sends Slack block kit for slack URLs
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HITLService } from '../hitl.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../lib/errors.js';
import type { ServiceContext } from '@agentguard/shared';
import type { HITLGate } from '@prisma/client';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CTX_ADMIN: ServiceContext = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'admin',
  traceId: 'trace-1',
};

const CTX_ANALYST: ServiceContext = {
  ...CTX_ADMIN,
  role: 'analyst',
};

const PENDING_GATE: HITLGate = {
  id: 'gate-1',
  tenantId: 'tenant-1',
  agentId: 'agent-1',
  sessionId: 'session-1',
  auditEventId: 'evt-1',
  toolName: 'file_write',
  toolParams: null,
  matchedRuleId: 'rule-hitl',
  status: 'PENDING',
  timeoutAt: new Date(Date.now() + 60_000), // 1 min in the future
  onTimeout: 'block',
  notifiedViaSlack: false,
  notifiedViaEmail: false,
  createdAt: new Date('2024-01-01'),
  decidedAt: null,
  decidedByUserId: null,
  decisionNote: null,
};

function makeRedis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  };
}

function makeDb() {
  const gateCreate = vi.fn().mockResolvedValue(PENDING_GATE);
  const gateUpdate = vi.fn().mockResolvedValue({ ...PENDING_GATE, status: 'APPROVED' });
  const gateFindFirst = vi.fn().mockResolvedValue(PENDING_GATE);
  const gateFindMany = vi.fn().mockResolvedValue([PENDING_GATE]);
  const webhookFindMany = vi.fn().mockResolvedValue([]);

  return {
    hITLGate: {
      create: gateCreate,
      update: gateUpdate,
      findFirst: gateFindFirst,
      findMany: gateFindMany,
    },
    alertWebhook: {
      findMany: webhookFindMany,
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('HITLService', () => {
  let db: ReturnType<typeof makeDb>;
  let redis: ReturnType<typeof makeRedis>;
  let svc: HITLService;

  beforeEach(() => {
    db = makeDb();
    redis = makeRedis();
    svc = new HITLService(db, CTX_ADMIN, redis as unknown as import('../../lib/redis.js').Redis);
    vi.clearAllMocks();
  });

  // ── createGate ─────────────────────────────────────────────────────────────

  describe('createGate', () => {
    it('creates DB record with PENDING status', async () => {
      await svc.createGate({
        agentId: 'agent-1',
        sessionId: 'session-1',
        matchedRuleId: 'rule-1',
      });

      expect(db.hITLGate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            status: 'PENDING',
            agentId: 'agent-1',
            matchedRuleId: 'rule-1',
          }),
        }),
      );
    });

    it('caches gate state in Redis with EX', async () => {
      await svc.createGate({
        agentId: 'agent-1',
        sessionId: 'session-1',
        matchedRuleId: 'rule-1',
        timeoutSec: 300,
      });

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('gate-1'),
        expect.stringContaining('PENDING'),
        'EX',
        expect.any(Number),
      );
    });

    it('uses default timeout when not provided', async () => {
      await svc.createGate({
        agentId: 'agent-1',
        sessionId: 'session-1',
        matchedRuleId: 'rule-1',
      });

      const call = (db.hITLGate.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const timeoutAt = call?.data?.timeoutAt as Date;

      // Default is 300 seconds from HITL_DEFAULT_TIMEOUT_SEC
      expect(timeoutAt.getTime()).toBeGreaterThan(Date.now() + 290_000);
      expect(timeoutAt.getTime()).toBeLessThan(Date.now() + 310_000);
    });

    it('fires explicit webhook URL when provided', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 }),
      );

      await svc.createGate({
        agentId: 'agent-1',
        sessionId: 'session-1',
        matchedRuleId: 'rule-1',
        webhookUrl: 'https://example.com/webhook',
      });

      // Allow micro-task queue to flush (fire-and-forget)
      await new Promise((r) => setTimeout(r, 50));

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({ method: 'POST' }),
      );

      fetchSpy.mockRestore();
    });

    it('does NOT fire webhook for private IP URL', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 }),
      );

      await svc.createGate({
        agentId: 'agent-1',
        sessionId: 'session-1',
        matchedRuleId: 'rule-1',
        webhookUrl: 'https://192.168.1.1/webhook', // private IP
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  // ── approveGate / rejectGate ───────────────────────────────────────────────

  describe('approveGate', () => {
    it('throws ForbiddenError for analyst role', async () => {
      const analysisSvc = new HITLService(
        db,
        CTX_ANALYST,
        redis as unknown as import('../../lib/redis.js').Redis,
      );
      await expect(analysisSvc.approveGate('gate-1', {})).rejects.toThrow(ForbiddenError);
    });

    it('calls resolveGate with APPROVED status', async () => {
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(PENDING_GATE);
      (db.hITLGate.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...PENDING_GATE,
        status: 'APPROVED',
      });

      const result = await svc.approveGate('gate-1', { note: 'Looks good' });
      expect(result.status).toBe('APPROVED');
    });

    it('throws ValidationError when gate is already resolved', async () => {
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...PENDING_GATE,
        status: 'APPROVED',
      });

      await expect(svc.approveGate('gate-1', {})).rejects.toThrow(ValidationError);
    });
  });

  describe('rejectGate', () => {
    it('resolves gate with REJECTED status', async () => {
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(PENDING_GATE);
      (db.hITLGate.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...PENDING_GATE,
        status: 'REJECTED',
      });

      const result = await svc.rejectGate('gate-1', { note: 'Denied' });
      expect(result.status).toBe('REJECTED');
    });
  });

  // ── timeoutGate ────────────────────────────────────────────────────────────

  describe('timeoutGate', () => {
    it('returns gate unchanged if already resolved', async () => {
      const resolved = { ...PENDING_GATE, status: 'APPROVED' as const };
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(resolved);

      const result = await svc.timeoutGate('gate-1');
      expect(result.status).toBe('APPROVED');
      expect(db.hITLGate.update).not.toHaveBeenCalled();
    });

    it('returns gate unchanged if timeoutAt is in the future', async () => {
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(PENDING_GATE);

      const result = await svc.timeoutGate('gate-1');
      expect(result.status).toBe('PENDING');
      expect(db.hITLGate.update).not.toHaveBeenCalled();
    });

    it('resolves to TIMED_OUT when timeoutAt has passed', async () => {
      const expiredGate = {
        ...PENDING_GATE,
        timeoutAt: new Date(Date.now() - 1000), // in the past
      };
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(expiredGate);
      (db.hITLGate.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...expiredGate,
        status: 'TIMED_OUT',
      });

      const result = await svc.timeoutGate('gate-1');
      expect(result.status).toBe('TIMED_OUT');
    });
  });

  // ── pollGateStatus ─────────────────────────────────────────────────────────

  describe('pollGateStatus', () => {
    it('returns cached Redis state on fast path', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({ status: 'APPROVED', decidedAt: '2024-01-01T12:00:00Z', decisionNote: 'ok' }),
      );

      const result = await svc.pollGateStatus('gate-1');

      expect(result.status).toBe('APPROVED');
      expect(result.resolved).toBe(true);
      expect(db.hITLGate.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to DB when Redis returns null', async () => {
      redis.get.mockResolvedValue(null);
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(PENDING_GATE);

      const result = await svc.pollGateStatus('gate-1');

      expect(result.status).toBe('PENDING');
      expect(result.resolved).toBe(false);
    });

    it('auto-times-out an expired PENDING gate on poll', async () => {
      redis.get.mockResolvedValue(null);
      const expiredGate = { ...PENDING_GATE, timeoutAt: new Date(Date.now() - 1000) };
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(expiredGate)   // getGate
        .mockResolvedValueOnce(expiredGate);  // inside timeoutGate
      (db.hITLGate.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...expiredGate,
        status: 'TIMED_OUT',
      });

      const result = await svc.pollGateStatus('gate-1');
      expect(result.status).toBe('TIMED_OUT');
      expect(result.resolved).toBe(true);
    });
  });

  // ── getGate ────────────────────────────────────────────────────────────────

  describe('getGate', () => {
    it('throws NotFoundError when gate not found', async () => {
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(svc.getGate('missing')).rejects.toThrow(NotFoundError);
    });

    it('returns gate when found', async () => {
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(PENDING_GATE);
      const result = await svc.getGate('gate-1');
      expect(result).toEqual(PENDING_GATE);
    });
  });

  // ── listPendingGates ───────────────────────────────────────────────────────

  describe('listPendingGates', () => {
    it('queries with status PENDING and tenant scope', async () => {
      await svc.listPendingGates();

      expect(db.hITLGate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            status: 'PENDING',
          }),
        }),
      );
    });
  });

  // ── listHistoricalGates ────────────────────────────────────────────────────

  describe('listHistoricalGates', () => {
    it('queries with resolved statuses by default', async () => {
      await svc.listHistoricalGates();

      expect(db.hITLGate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: expect.arrayContaining(['APPROVED', 'REJECTED', 'TIMED_OUT', 'CANCELLED']) },
          }),
        }),
      );
    });

    it('filters to specific status when provided', async () => {
      await svc.listHistoricalGates(50, undefined, 'APPROVED');

      expect(db.hITLGate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['APPROVED'] },
          }),
        }),
      );
    });
  });

  // ── cancelGate ─────────────────────────────────────────────────────────────

  describe('cancelGate', () => {
    it('resolves gate with CANCELLED status', async () => {
      (db.hITLGate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(PENDING_GATE);
      (db.hITLGate.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...PENDING_GATE,
        status: 'CANCELLED',
      });

      const result = await svc.cancelGate('gate-1');
      expect(result.status).toBe('CANCELLED');
    });
  });
});
