/**
 * Integration Tests — HITL Routes
 *
 * Tests HITL gate lifecycle via service-level integration tests.
 * Verifies: createGate, approve, reject, timeout, poll, list endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HITLService } from '../../hitl.js';
import type { ServiceContext } from '@agentguard/shared';
import type { HITLGate } from '@prisma/client';
import { ForbiddenError, ValidationError } from '../../../lib/errors.js';

// ─── Mock Prisma / Redis ───────────────────────────────────────────────────────

function makeMockPrisma() {
  const gateCreate = vi.fn();
  const gateUpdate = vi.fn();
  const gateFindFirst = vi.fn().mockResolvedValue(null);
  const gateFindMany = vi.fn().mockResolvedValue([]);
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
    $transaction: vi.fn(),
  } as unknown as {
    hITLGate: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    alertWebhook: { findMany: ReturnType<typeof vi.fn> };
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
  tenantId: 'tenant-test',
  userId: 'user-test',
  role: 'admin',
  traceId: 'trace-test',
};

const CTX_ANALYST: ServiceContext = { ...CTX_ADMIN, role: 'analyst' };
const CTX_OWNER: ServiceContext = { ...CTX_ADMIN, role: 'owner' };

function makePendingGate(overrides: Partial<HITLGate> = {}): HITLGate {
  return {
    id: 'gate-001',
    tenantId: 'tenant-test',
    agentId: 'agent-001',
    sessionId: 'session-001',
    auditEventId: 'evt-001',
    toolName: 'file_write',
    toolParams: null,
    matchedRuleId: 'rule-hitl',
    status: 'PENDING',
    timeoutAt: new Date(Date.now() + 300_000),
    onTimeout: 'block',
    notifiedViaSlack: false,
    createdAt: new Date('2024-01-01'),
    decidedAt: null,
    decidedByUserId: null,
    decisionNote: null,
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
    vi.clearAllMocks();
  });

  // ── createGate → approve ─────────────────────────────────────────────────

  it('full lifecycle: create → poll pending → approve → poll resolved', async () => {
    const gate = makePendingGate();
    db.hITLGate.create.mockResolvedValue(gate);

    const created = await svc.createGate({
      agentId: 'agent-001',
      sessionId: 'session-001',
      matchedRuleId: 'rule-hitl',
      toolName: 'file_write',
    });

    expect(created.id).toBe('gate-001');
    expect(created.status).toBe('PENDING');

    // Simulate Redis caching
    redis.get.mockResolvedValue(JSON.stringify({ status: 'PENDING', decidedAt: null, decisionNote: null }));
    const pollPending = await svc.pollGateStatus('gate-001');
    expect(pollPending.resolved).toBe(false);
    expect(pollPending.status).toBe('PENDING');

    // Approve
    const approvedGate = { ...gate, status: 'APPROVED' as const, decidedAt: new Date(), decidedByUserId: 'user-test', decisionNote: 'LGTM' };
    db.hITLGate.update.mockResolvedValue(approvedGate);

    const approved = await svc.approveGate('gate-001', { note: 'LGTM' });
    expect(approved.status).toBe('APPROVED');
  });

  // ── createGate → reject ─────────────────────────────────────────────────

  it('full lifecycle: create → reject', async () => {
    const gate = makePendingGate();
    db.hITLGate.create.mockResolvedValue(gate);

    await svc.createGate({ agentId: 'a', sessionId: 's', matchedRuleId: 'r' });

    const rejected = { ...gate, status: 'REJECTED' as const };
    db.hITLGate.update.mockResolvedValue(rejected);

    const result = await svc.rejectGate('gate-001', { note: 'Not allowed' });
    expect(result.status).toBe('REJECTED');
  });

  // ── createGate → timeout (expired) ──────────────────────────────────────

  it('timeoutGate resolves PENDING gate past timeoutAt', async () => {
    const expiredGate = makePendingGate({ timeoutAt: new Date(Date.now() - 1000) });
    db.hITLGate.findFirst.mockResolvedValue(expiredGate);

    const timedOut = { ...expiredGate, status: 'TIMED_OUT' as const };
    db.hITLGate.update.mockResolvedValue(timedOut);

    const result = await svc.timeoutGate('gate-001');
    expect(result.status).toBe('TIMED_OUT');
    expect(db.hITLGate.update).toHaveBeenCalled();
  });

  it('timeoutGate returns unchanged for future timeoutAt', async () => {
    const futureGate = makePendingGate({ timeoutAt: new Date(Date.now() + 300_000) });
    db.hITLGate.findFirst.mockResolvedValue(futureGate);

    const result = await svc.timeoutGate('gate-001');
    expect(result.status).toBe('PENDING');
    expect(db.hITLGate.update).not.toHaveBeenCalled();
  });

  it('timeoutGate returns unchanged for already-resolved gate', async () => {
    const resolved = { ...makePendingGate(), status: 'APPROVED' as const };
    db.hITLGate.findFirst.mockResolvedValue(resolved);

    const result = await svc.timeoutGate('gate-001');
    expect(result.status).toBe('APPROVED');
    expect(db.hITLGate.update).not.toHaveBeenCalled();
  });

  // ── Role enforcement ─────────────────────────────────────────────────────

  it('approveGate throws ForbiddenError for analyst', async () => {
    const analysisSvc = new HITLService(db as never, CTX_ANALYST, redis as never);
    await expect(analysisSvc.approveGate('gate-001', {})).rejects.toThrow(ForbiddenError);
  });

  it('rejectGate throws ForbiddenError for analyst', async () => {
    const analysisSvc = new HITLService(db as never, CTX_ANALYST, redis as never);
    await expect(analysisSvc.rejectGate('gate-001', {})).rejects.toThrow(ForbiddenError);
  });

  it('approveGate succeeds for owner', async () => {
    const ownerSvc = new HITLService(db as never, CTX_OWNER, redis as never);
    const gate = makePendingGate();
    db.hITLGate.findFirst.mockResolvedValue(gate);
    db.hITLGate.update.mockResolvedValue({ ...gate, status: 'APPROVED' as const });

    const result = await ownerSvc.approveGate('gate-001', {});
    expect(result.status).toBe('APPROVED');
  });

  // ── Validation ─────────────────────────────────────────────────────────

  it('approveGate throws ValidationError for already-resolved gate', async () => {
    db.hITLGate.findFirst.mockResolvedValue({ ...makePendingGate(), status: 'APPROVED' });

    await expect(svc.approveGate('gate-001', {})).rejects.toThrow(ValidationError);
  });

  it('rejectGate throws ValidationError for already-resolved gate', async () => {
    db.hITLGate.findFirst.mockResolvedValue({ ...makePendingGate(), status: 'REJECTED' });

    await expect(svc.rejectGate('gate-001', {})).rejects.toThrow(ValidationError);
  });

  // ── List operations ─────────────────────────────────────────────────────

  it('listPendingGates returns only PENDING gates for tenant', async () => {
    const gates = [makePendingGate(), makePendingGate({ id: 'gate-002' })];
    db.hITLGate.findMany.mockResolvedValue(gates);

    const result = await svc.listPendingGates();

    expect(result).toHaveLength(2);
    expect(db.hITLGate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-test', status: 'PENDING' }),
      }),
    );
  });

  it('listHistoricalGates returns resolved statuses by default', async () => {
    db.hITLGate.findMany.mockResolvedValue([]);

    await svc.listHistoricalGates();

    expect(db.hITLGate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-test',
          status: { in: expect.arrayContaining(['APPROVED', 'REJECTED', 'TIMED_OUT', 'CANCELLED']) },
        }),
      }),
    );
  });

  it('listHistoricalGates filters by specific status', async () => {
    db.hITLGate.findMany.mockResolvedValue([]);

    await svc.listHistoricalGates(50, undefined, 'APPROVED');

    expect(db.hITLGate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['APPROVED'] } }),
      }),
    );
  });

  // ── cancelGate ──────────────────────────────────────────────────────────

  it('cancelGate resolves gate with CANCELLED status', async () => {
    db.hITLGate.findFirst.mockResolvedValue(makePendingGate());
    db.hITLGate.update.mockResolvedValue({ ...makePendingGate(), status: 'CANCELLED' as const });

    const result = await svc.cancelGate('gate-001');
    expect(result.status).toBe('CANCELLED');
  });

  // ── Redis caching ──────────────────────────────────────────────────────

  it('createGate caches gate state in Redis', async () => {
    const gate = makePendingGate();
    db.hITLGate.create.mockResolvedValue(gate);

    await svc.createGate({ agentId: 'a', sessionId: 's', matchedRuleId: 'r', timeoutSec: 300 });

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('gate-001'),
      expect.stringContaining('PENDING'),
      'EX',
      expect.any(Number),
    );
  });

  it('pollGateStatus returns cached state from Redis fast path', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ status: 'APPROVED', decidedAt: '2024-01-01T12:00:00Z', decisionNote: 'ok' }));

    const result = await svc.pollGateStatus('gate-001');

    expect(result.status).toBe('APPROVED');
    expect(result.resolved).toBe(true);
    expect(result.decisionNote).toBe('ok');
    // DB should not be called
    expect(db.hITLGate.findFirst).not.toHaveBeenCalled();
  });
});
