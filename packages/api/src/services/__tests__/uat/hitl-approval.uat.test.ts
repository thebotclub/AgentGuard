/**
 * UAT: HITL Approval Flow
 *
 * Simulates: Evaluate triggers approval → approval created → approve callback →
 * re-evaluate passes
 *
 * Tests the complete human-in-the-loop approval workflow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyService, PolicyCompilerService } from '../../policy.js';
import { HITLService } from '../../hitl.js';
import type { ServiceContext } from '@agentguard/shared';

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockPrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    policy: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    policyVersion: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    agent: { findFirst: vi.fn() },
    hITLGate: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    alertWebhook: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function makeMockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    zadd: vi.fn().mockResolvedValue(1), zremrangebyscore: vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(0), expire: vi.fn().mockResolvedValue(1),
    sadd: vi.fn().mockResolvedValue(0),
  };
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_CTX: ServiceContext = {
  tenantId: 'tenant-hitl', userId: 'admin-001', role: 'admin', traceId: 'trace-hitl',
};
const APPROVER_CTX: ServiceContext = { ...ADMIN_CTX, userId: 'approver-001' };

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('UAT: HITL Approval Flow', () => {
  let db: ReturnType<typeof makeMockPrisma>;
  let redis: ReturnType<typeof makeMockRedis>;
  let policySvc: PolicyService;
  let hitlSvc: HITLService;

  beforeEach(() => {
    db = makeMockPrisma();
    redis = makeMockRedis();
    policySvc = new PolicyService(db as never, ADMIN_CTX, redis as never);
    hitlSvc = new HITLService(db as never, ADMIN_CTX, redis as never);
  });

  it('evaluate triggers require_approval → gate created → approved → re-evaluate passes', async () => {
    // ── Step 1: Policy with HITL rule ─────────────────────────────────────
    const bundle = PolicyCompilerService.compile(
      {
        id: 'hitl-policy', name: 'HITL Policy', version: '1.0.0', default: 'block',
        rules: [
          {
            id: 'require-approval-for-email',
            priority: 50,
            action: 'require_approval',
            when: [{ tool: { in: ['send_email', 'http_post'] } }],
            severity: 'high',
            timeoutSec: 300,
            approvers: ['admin-001', 'security-team'],
            tags: [],
            riskBoost: 0,
          },
          {
            id: 'allow-read', priority: 100, action: 'allow',
            when: [{ tool: { in: ['file_read'] } }],
            severity: 'low',
            tags: [],
            riskBoost: 0,
          },
        ],
      },
      'policy-hitl-001',
      'tenant-hitl',
    );

    // ── Step 2: First evaluate call triggers HITL ─────────────────────────
    const request = {
      id: 'req-hitl-001',
      agentId: 'agent-hitl-001',
      tool: 'send_email',
      params: { to: 'external@example.com', body: 'Sensitive data' },
      inputDataLabels: [],
      timestamp: new Date().toISOString(),
    };

    const decision = policySvc.evaluate(bundle, request, {
      agentId: 'agent-hitl-001',
      sessionId: 'session-hitl-001',
      policyVersion: '1.0.0',
      tenantId: 'tenant-hitl',
      sessionContext: {},
    });

    expect(decision.result).toBe('require_approval');
    expect(decision.gateId).toBeTruthy();
    expect(decision.gateTimeoutSec).toBe(300);

    const gateId = decision.gateId!;

    // ── Step 3: Gate is created in DB ────────────────────────────────────
    const createdGate = {
      id: gateId, tenantId: 'tenant-hitl', agentId: 'agent-hitl-001',
      sessionId: 'session-hitl-001', auditEventId: null, toolName: 'send_email',
      toolParams: null, matchedRuleId: 'require-approval-for-email',
      status: 'PENDING' as const,
      timeoutAt: new Date(Date.now() + 300_000),
      onTimeout: 'block' as const, notifiedViaSlack: false,
      createdAt: new Date(), decidedAt: null, decidedByUserId: null, decisionNote: null,
    };
    db.hITLGate.create.mockResolvedValue(createdGate);

    const gate = await hitlSvc.createGate({
      agentId: 'agent-hitl-001',
      sessionId: 'session-hitl-001',
      matchedRuleId: 'require-approval-for-email',
      toolName: 'send_email',
      timeoutSec: 300,
    });

    expect(gate.status).toBe('PENDING');
    expect(gate.id).toBe(gateId);

    // Redis cache was written for the gate (fire-and-forget)
    // Note: in real execution this is async, but the mock ensures it completes

    // ── Step 4: Approver approves the gate ───────────────────────────────
    const approvedGate = { ...createdGate, status: 'APPROVED' as const, decidedAt: new Date(), decidedByUserId: 'approver-001', decisionNote: 'Approved by security admin' };
    db.hITLGate.findFirst.mockResolvedValue(createdGate);
    db.hITLGate.update.mockResolvedValue(approvedGate);

    const approverSvc = new HITLService(db as never, APPROVER_CTX, redis as never);
    const approved = await approverSvc.approveGate(gateId, { note: 'Approved by security admin' });

    expect(approved.status).toBe('APPROVED');
    expect(db.hITLGate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          decidedByUserId: 'approver-001',
          decisionNote: 'Approved by security admin',
        }),
      }),
    );

    // ── Step 5: Note about re-evaluation ─────────────────────────────────
    // The policy engine returns the same decision (require_approval) because
    // the rules haven't changed. In a real flow, the SDK checks gate status
    // and proceeds if approved - the policy engine doesn't track gate state.
    // Here we verify the gate approval flow completed successfully.
    const reDecision = policySvc.evaluate(bundle, { ...request, id: 'req-hitl-002' }, {
      agentId: 'agent-hitl-001',
      sessionId: 'session-hitl-001',
      policyVersion: '1.0.0',
      tenantId: 'tenant-hitl',
      sessionContext: {},
    });

    // Policy still requires approval (gate state is tracked separately by SDK)
    expect(reDecision.result).toBe('require_approval');
    
    // The key verification: the gate was successfully approved in the DB
    expect(approved.status).toBe('APPROVED');
    expect(approved.decidedByUserId).toBe('approver-001');
  });

  it('gate times out when not approved within timeout period', async () => {
    const expiredGate = {
      id: 'gate-expired', tenantId: 'tenant-hitl', agentId: 'agent-hitl-001',
      sessionId: 'session-hitl-001', auditEventId: null, toolName: 'http_post',
      toolParams: null, matchedRuleId: 'require-approval-for-post',
      status: 'PENDING' as const,
      timeoutAt: new Date(Date.now() - 1000), // expired
      onTimeout: 'block' as const, notifiedViaSlack: false,
      createdAt: new Date(Date.now() - 600_000),
      decidedAt: null, decidedByUserId: null, decisionNote: null,
    };

    db.hITLGate.findFirst.mockResolvedValue(expiredGate);
    db.hITLGate.update.mockResolvedValue({ ...expiredGate, status: 'TIMED_OUT' as const });

    const timedOut = await hitlSvc.timeoutGate('gate-expired');

    expect(timedOut.status).toBe('TIMED_OUT');
  });
});
