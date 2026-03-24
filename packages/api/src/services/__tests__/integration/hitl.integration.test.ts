/**
 * HITL Service — Integration Tests
 *
 * End-to-end service-level integration tests for the full HITL gate lifecycle.
 * Covers: create → approve, create → reject, timeout, poll, list, cancel.
 * Uses fresh mock Prisma/Redis per test, properly configured.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HITLService } from '../../hitl.js';
import type { ServiceContext } from '@agentguard/shared';
import type { HITLGate } from '@prisma/client';
import { ForbiddenError, ValidationError } from '../../../lib/errors.js';

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockPrisma() {
  return {
    hITLGate: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    alertWebhook: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  };
}

function makeMockRedis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
  };
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CTX_ADMIN: ServiceContext = {
  tenantId: 'tenant-test', userId: 'user-test', role: 'admin', traceId: 'trace-test',
};
const CTX_ANALYST: ServiceContext = { ...CTX_ADMIN, role: 'analyst' };
const CTX_OWNER: ServiceContext = { ...CTX_ADMIN, role: 'owner' };

function makeGate(overrides: Partial<HITLGate> = {}): HITLGate {
  return {
    id: 'gate-001', tenantId: 'tenant-test', agentId: 'agent-001',
    sessionId: 'session-001', auditEventId: 'evt-001',
    toolName: 'file_write', toolParams: null, matchedRuleId: 'rule-hitl',
    status: 'PENDING',
    timeoutAt: new Date(Date.now() + 300_000),
    onTimeout: 'block', notifiedViaSlack: false,
    createdAt: new Date('2024-01-01'),
    decidedAt: null, decidedByUserId: null, decisionNote: null,
    ...overrides,
  } as HITLGate;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('HITL Service — Integration', () => {
  let db: ReturnType<typeof makeMockPrisma>;
  let redis: ReturnType<typeof makeMockRedis>;
  let svc: HITLService;

  beforeEach(() => {
    db = makeMockPrisma();
    redis = makeMockRedis();
    svc = new HITLService(db as never, CTX_ADMIN, redis as never);
  });

  // ── create → approve ─────────────────────────────────────────────────────

  it('createGate then approveGate — full lifecycle', async () => {
    const gate = makeGate();
    db.hITLGate.create.mockResolvedValue(gate);
    db.hITLGate.findFirst.mockResolvedValue(gate); // for approveGate → getGate

    const created = await svc.createGate({
      agentId: 'agent-001', sessionId: 'session-001',
      matchedRuleId: 'rule-hitl', toolName: 'file_write',
    });

    expect(created.id).toBe('gate-001');
    expect(created.status).toBe('PENDING');
    expect(db.hITLGate.create).toHaveBeenCalled();

    // Redis was written
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('gate-001'),
      expect.stringContaining('PENDING'),
      'EX', expect.any(Number),
    );

    // Approve
    const approved = { ...gate, status: 'APPROVED' as const, decidedAt: new Date(), decidedByUserId: 'user-test' };
    db.hITLGate.update.mockResolvedValue(approved);

    const result = await svc.approveGate('gate-001', { note: 'LGTM' });
    expect(result.status).toBe('APPROVED');
  });

  // ── create → reject ─────────────────────────────────────────────────────

  it('createGate then rejectGate — full lifecycle', async () => {
    const gate = makeGate();
    db.hITLGate.create.mockResolvedValue(gate);
    db.hITLGate.findFirst.mockResolvedValue(gate);

    await svc.createGate({ agentId: 'a', sessionId: 's', matchedRuleId: 'r' });

    const rejected = { ...gate, status: 'REJECTED' as const };
    db.hITLGate.update.mockResolvedValue(rejected);

    const result = await svc.rejectGate('gate-001', { note: 'Not allowed' });
    expect(result.status).toBe('REJECTED');
  });

  // ── timeout ─────────────────────────────────────────────────────────────

  it('timeoutGate resolves expired PENDING gate', async () => {
    const expiredGate = makeGate({ timeoutAt: new Date(Date.now() - 1000) });
    db.hITLGate.findFirst.mockResolvedValue(expiredGate);
    db.hITLGate.update.mockResolvedValue({ ...expiredGate, status: 'TIMED_OUT' as const });

    const result = await svc.timeoutGate('gate-001');
    expect(result.status).toBe('TIMED_OUT');
  });

  it('timeoutGate returns unchanged for future timeoutAt', async () => {
    const futureGate = makeGate({ timeoutAt: new Date(Date.now() + 300_000) });
    db.hITLGate.findFirst.mockResolvedValue(futureGate);

    const result = await svc.timeoutGate('gate-001');
    expect(result.status).toBe('PENDING');
    expect(db.hITLGate.update).not.toHaveBeenCalled();
  });

  it('timeoutGate returns unchanged for already-resolved gate', async () => {
    const resolvedGate = makeGate({ status: 'APPROVED' as const });
    db.hITLGate.findFirst.mockResolvedValue(resolvedGate);

    const result = await svc.timeoutGate('gate-001');
    expect(result.status).toBe('APPROVED');
    expect(db.hITLGate.update).not.toHaveBeenCalled();
  });

  // ── pollGateStatus ───────────────────────────────────────────────────────

  it('pollGateStatus returns cached state from Redis fast path', async () => {
    redis.get.mockResolvedValue(JSON.stringify({
      status: 'APPROVED', decidedAt: '2024-01-01T12:00:00Z', decisionNote: 'ok',
    }));

    const result = await svc.pollGateStatus('gate-001');

    expect(result.status).toBe('APPROVED');
    expect(result.resolved).toBe(true);
    expect(result.decisionNote).toBe('ok');
    expect(db.hITLGate.findFirst).not.toHaveBeenCalled(); // DB not called
  });

  it('pollGateStatus falls back to DB when Redis is null', async () => {
    redis.get.mockResolvedValue(null);
    const gate = makeGate();
    db.hITLGate.findFirst.mockResolvedValue(gate);

    const result = await svc.pollGateStatus('gate-001');

    expect(result.status).toBe('PENDING');
    expect(result.resolved).toBe(false);
  });

  // ── role enforcement ─────────────────────────────────────────────────────

  it('approveGate throws ForbiddenError for analyst', async () => {
    const analystSvc = new HITLService(db as never, CTX_ANALYST, redis as never);
    await expect(analystSvc.approveGate('gate-001', {})).rejects.toThrow(ForbiddenError);
  });

  it('rejectGate throws ForbiddenError for analyst', async () => {
    const analystSvc = new HITLService(db as never, CTX_ANALYST, redis as never);
    await expect(analystSvc.rejectGate('gate-001', {})).rejects.toThrow(ForbiddenError);
  });

  it('approveGate succeeds for owner', async () => {
    const ownerSvc = new HITLService(db as never, CTX_OWNER, redis as never);
    const gate = makeGate();
    db.hITLGate.findFirst.mockResolvedValue(gate);
    db.hITLGate.update.mockResolvedValue({ ...gate, status: 'APPROVED' as const });

    const result = await ownerSvc.approveGate('gate-001', {});
    expect(result.status).toBe('APPROVED');
  });

  // ── validation ───────────────────────────────────────────────────────────

  it('approveGate throws ValidationError when gate already APPROVED', async () => {
    db.hITLGate.findFirst.mockResolvedValue(makeGate({ status: 'APPROVED' }));
    await expect(svc.approveGate('gate-001', {})).rejects.toThrow(ValidationError);
  });

  it('rejectGate throws ValidationError when gate already REJECTED', async () => {
    db.hITLGate.findFirst.mockResolvedValue(makeGate({ status: 'REJECTED' }));
    await expect(svc.rejectGate('gate-001', {})).rejects.toThrow(ValidationError);
  });

  // ── list operations ──────────────────────────────────────────────────────

  it('listPendingGates queries PENDING gates for current tenant', async () => {
    const gates = [makeGate(), makeGate({ id: 'gate-002' })];
    db.hITLGate.findMany.mockResolvedValue(gates);

    const result = await svc.listPendingGates();

    expect(result).toHaveLength(2);
    expect(db.hITLGate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-test', status: 'PENDING' }),
      }),
    );
  });

  it('listHistoricalGates includes resolved statuses', async () => {
    db.hITLGate.findMany.mockResolvedValue([]);

    await svc.listHistoricalGates();

    expect(db.hITLGate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: expect.arrayContaining(['APPROVED', 'REJECTED', 'TIMED_OUT', 'CANCELLED']) },
        }),
      }),
    );
  });

  it('listHistoricalGates filters by specific status', async () => {
    db.hITLGate.findMany.mockResolvedValue([]);

    await svc.listHistoricalGates(50, undefined, 'APPROVED');

    expect(db.hITLGate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ['APPROVED'] } }) }),
    );
  });

  // ── cancel ───────────────────────────────────────────────────────────────

  it('cancelGate resolves gate with CANCELLED status', async () => {
    db.hITLGate.findFirst.mockResolvedValue(makeGate());
    db.hITLGate.update.mockResolvedValue({ ...makeGate(), status: 'CANCELLED' as const });

    const result = await svc.cancelGate('gate-001');
    expect(result.status).toBe('CANCELLED');
  });
});
