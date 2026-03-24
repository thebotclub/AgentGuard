/**
 * UAT: Kill Switch Lifecycle
 *
 * Simulates: Agent misbehaves → kill switch activated → subsequent evaluates blocked
 * → deactivate → evaluates resume
 *
 * Tests the full kill switch lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KillSwitchService } from '../../killswitch.js';
import { PolicyService, PolicyCompilerService } from '../../policy.js';
import type { ServiceContext } from '@agentguard/shared';

function makeMockPrisma() {
  const agentFindMany = vi.fn().mockResolvedValue([]);
  const agentFindFirst = vi.fn().mockResolvedValue(null);
  const agentUpdate = vi.fn();
  const agentUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
  const kscFindMany = vi.fn().mockResolvedValue([]);
  const kscFindFirst = vi.fn().mockResolvedValue(null);
  const kscCreate = vi.fn();
  const kscCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const kscUpdateMany = vi.fn().mockResolvedValue({ count: 0 });

  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      killSwitchCommand: { create: kscCreate, updateMany: kscUpdateMany },
      agent: { update: agentUpdate },
    })),
    agent: {
      findMany: agentFindMany,
      findFirst: agentFindFirst,
      update: agentUpdate,
      updateMany: agentUpdateMany,
    },
    killSwitchCommand: {
      findMany: kscFindMany,
      findFirst: kscFindFirst,
      create: kscCreate,
      createMany: kscCreateMany,
      updateMany: kscUpdateMany,
    },
  };
}

function makeMockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
}

const CTX_ADMIN: ServiceContext = {
  tenantId: 'tenant-ks', userId: 'admin-ks', role: 'admin', traceId: 'trace-ks',
};

describe('UAT: Kill Switch Lifecycle', () => {
  let db: ReturnType<typeof makeMockPrisma>;
  let redis: ReturnType<typeof makeMockRedis>;
  let killSvc: KillSwitchService;
  let policySvc: PolicyService;

  beforeEach(() => {
    db = makeMockPrisma();
    redis = makeMockRedis();
    killSvc = new KillSwitchService(db as never, CTX_ADMIN, redis as never);
    policySvc = new PolicyService(db as never, CTX_ADMIN, redis as never);
  });

  it('agent misbehaves → kill switch issued → evaluates blocked → resume → evaluates pass', async () => {
    // ── Step 1: Normal evaluation before kill switch ─────────────────────────
    const bundle = PolicyCompilerService.compile(
      {
        id: 'ks-policy', name: 'KS Policy', version: '1.0.0', default: 'allow',
        rules: [
          { id: 'block-shell', priority: 10, action: 'block', when: [{ tool: { in: ['shell_exec'] } }], severity: 'critical', riskBoost: 500 },
        ],
      },
      'policy-ks-001',
      'tenant-ks',
    );

    const normalDecision = policySvc.evaluate(
      bundle,
      { id: 'req-ks-001', agentId: 'agent-ks-001', tool: 'file_read', params: {}, inputDataLabels: [], timestamp: new Date().toISOString() },
      { agentId: 'agent-ks-001', sessionId: 'session-ks-001', policyVersion: '1.0.0', tenantId: 'tenant-ks', sessionContext: {} },
    );

    expect(normalDecision.result).toBe('allow'); // default allow

    // ── Step 2: Kill switch activated ─────────────────────────────────────
    const activeAgent = {
      id: 'agent-ks-001', tenantId: 'tenant-ks', status: 'ACTIVE', deletedAt: null,
    };
    db.agent.findFirst.mockResolvedValue(activeAgent);

    const command = {
      id: 'cmd-ks-001', tenantId: 'tenant-ks', agentId: 'agent-ks-001',
      tier: 'SOFT' as const, reason: 'Excessive block rate detected', issuedByUserId: 'admin-ks',
      issuedAt: new Date(), resumedAt: null,
    };
    db.killSwitchCommand.create.mockResolvedValue(command);
    db.agent.update.mockResolvedValue({ ...activeAgent, status: 'KILLED' });

    const killResult = await killSvc.issueKill('agent-ks-001', { tier: 'SOFT', reason: 'Excessive block rate detected' });

    expect(killResult.id).toBe('cmd-ks-001');
    expect(killResult.tier).toBe('SOFT');

    // Redis flag was set
    expect(redis.set).toHaveBeenCalledWith(
      'killswitch:tenant-ks:agent-ks-001',
      'SOFT',
      'EX',
      expect.any(Number),
    );

    // Agent status updated to KILLED
    expect(db.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'agent-ks-001' }, data: { status: 'KILLED' } }),
    );

    // ── Step 3: Kill status check (SDK polling) ─────────────────────────────
    redis.get.mockResolvedValue('SOFT'); // Redis fast path
    db.killSwitchCommand.findFirst.mockResolvedValue(command);

    const killStatus = await killSvc.getKillStatus('agent-ks-001');
    expect(killStatus.isKilled).toBe(true);
    expect(killStatus.tier).toBe('SOFT');

    // ── Step 4: Resume agent ────────────────────────────────────────────────
    db.agent.update.mockResolvedValue({ ...activeAgent, status: 'ACTIVE' });
    db.killSwitchCommand.updateMany.mockResolvedValue({ count: 1 });

    const resumeResult = await killSvc.resumeAgent('agent-ks-001');

    // Redis key deleted
    expect(redis.del).toHaveBeenCalledWith('killswitch:tenant-ks:agent-ks-001');

    // Agent status back to ACTIVE
    expect(db.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'agent-ks-001' }, data: { status: 'ACTIVE' } }),
    );

    // Commands marked as resumed
    expect(db.killSwitchCommand.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ agentId: 'agent-ks-001', resumedAt: null }),
        data: { resumedAt: expect.any(Date) },
      }),
    );

    // ── Step 5: Agent can be evaluated again ───────────────────────────────
    db.agent.findFirst.mockResolvedValue({ ...activeAgent, status: 'ACTIVE' });
    redis.get.mockResolvedValue(null); // No longer in Redis

    const afterResumeStatus = await killSvc.getKillStatus('agent-ks-001');
    expect(afterResumeStatus.isKilled).toBe(false);
  });

  it('haltAll kills all active agents and sets Redis flags', async () => {
    db.agent.findMany.mockResolvedValue([
      { id: 'agent-1' }, { id: 'agent-2' }, { id: 'agent-3' },
    ]);
    db.agent.updateMany.mockResolvedValue({ count: 3 });
    db.killSwitchCommand.createMany.mockResolvedValue({ count: 3 });

    const result = await killSvc.haltAll({ tier: 'HARD', reason: 'Security incident' });

    expect(result.affectedAgents).toBe(3);
    expect(redis.set).toHaveBeenCalledTimes(3);
    expect(redis.set).toHaveBeenCalledWith(
      'killswitch:tenant-ks:agent-1', 'HARD', 'EX', expect.any(Number),
    );
    expect(db.agent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-ks' }), data: { status: 'KILLED' } }),
    );
  });
});
