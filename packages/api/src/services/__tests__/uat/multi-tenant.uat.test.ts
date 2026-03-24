/**
 * UAT: Multi-Tenant Isolation
 *
 * Simulates: Two tenants (Tenant A and Tenant B) acting simultaneously.
 * Verifies: Tenant A cannot see Tenant B's agents/events/policies.
 *
 * Tests Row-Level Security and tenant scoping enforcement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentService } from '../../agent.js';
import { PolicyService } from '../../policy.js';
import { AuditService } from '../../audit.js';
import type { ServiceContext } from '@agentguard/shared';

function makeMockPrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    agent: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    policy: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    policyVersion: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    auditEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    agentSession: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    anomalyScore: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makeMockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1), zadd: vi.fn().mockResolvedValue(1),
    zremrangebyscore: vi.fn().mockResolvedValue(0), zcard: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1), sadd: vi.fn().mockResolvedValue(0),
  };
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CTX_A: ServiceContext = { tenantId: 'tenant-A', userId: 'user-A', role: 'admin', traceId: 'trace-A' };
const CTX_B: ServiceContext = { tenantId: 'tenant-B', userId: 'user-B', role: 'admin', traceId: 'trace-B' };

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('UAT: Multi-Tenant Isolation', () => {
  let db: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    db = makeMockPrisma();
  });

  it('AgentService — each tenant only sees their own agents', async () => {
    const tenantAAgents = [
      { id: 'agent-A1', tenantId: 'tenant-A', status: 'ACTIVE', deletedAt: null, name: 'Agent A1', failBehavior: 'BLOCK', riskTier: 'LOW', tags: [], metadata: {}, apiKeyHash: '', apiKeyPrefix: '', apiKeyExpiresAt: null, lastSeenAt: null, createdAt: new Date(), updatedAt: new Date(), description: null, policyId: null, policyVersion: null, framework: null, frameworkVersion: null },
    ];
    const tenantBAgents = [
      { id: 'agent-B1', tenantId: 'tenant-B', status: 'ACTIVE', deletedAt: null, name: 'Agent B1', failBehavior: 'BLOCK', riskTier: 'LOW', tags: [], metadata: {}, apiKeyHash: '', apiKeyPrefix: '', apiKeyExpiresAt: null, lastSeenAt: null, createdAt: new Date(), updatedAt: new Date(), description: null, policyId: null, policyVersion: null, framework: null, frameworkVersion: null },
    ];

    // ── Tenant A lists agents ───────────────────────────────────────────
    db.agent.findMany
      .mockResolvedValueOnce(tenantAAgents)   // Tenant A's call
      .mockResolvedValueOnce(tenantBAgents);  // Tenant B's call (different ctx)

    const svcA = new AgentService(db as never, CTX_A);
    const svcB = new AgentService(db as never, CTX_B);

    const agentsA = await svcA.listAgents();
    const agentsB = await svcB.listAgents();

    // Verify Tenant A calls had tenant-A scope
    expect(db.agent.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-A' }) }),
    );

    // Tenant A only gets their own agents
    expect(agentsA).toHaveLength(1);
    expect((agentsA as unknown as Array<{id: string}>)[0]!.id).toBe('agent-A1');

    // Tenant B only gets their own agents
    expect(agentsB).toHaveLength(1);
    expect((agentsB as unknown as Array<{id: string}>)[0]!.id).toBe('agent-B1');
  });

  it('AgentService — Tenant A cannot get Tenant B agent by ID', async () => {
    const svcA = new AgentService(db as never, CTX_A);

    // Tenant A gets their own agent
    const tenantAAgent = {
      id: 'agent-A1', tenantId: 'tenant-A', status: 'ACTIVE', deletedAt: null,
      name: 'Agent A1', failBehavior: 'BLOCK', riskTier: 'LOW', tags: [],
      metadata: {}, apiKeyHash: '', apiKeyPrefix: '', apiKeyExpiresAt: null,
      lastSeenAt: null, createdAt: new Date(), updatedAt: new Date(),
      description: null, policyId: null, policyVersion: null,
      framework: null, frameworkVersion: null,
    };
    db.agent.findFirst.mockResolvedValueOnce(tenantAAgent);

    const agentA = await svcA.getAgent('agent-A1');
    expect((agentA as unknown as {tenantId: string}).tenantId).toBe('tenant-A');

    // The findFirst call was scoped to tenant-A
    expect(db.agent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-A' }) }),
    );

    // Now try to get Tenant B agent using Tenant A's service — should throw NotFoundError
    db.agent.findFirst.mockResolvedValueOnce(null); // tenant-A scope returns null for tenant-B's agent
    await expect(svcA.getAgent('agent-B1')).rejects.toThrow('not found');

    // findFirst was still called with tenant-A scope (not tenant-B)
    expect(db.agent.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-A' }) }),
    );
  });

  it('PolicyService — each tenant only sees their own policies', async () => {
    const tenantAPolicies = [{ id: 'policy-A1', tenantId: 'tenant-A', name: 'Policy A1', defaultAction: 'block' as const, activeVersion: '1.0.0', description: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, gitRepoUrl: null, gitBranch: null, gitPath: null, gitSyncEnabled: false, gitLastSync: null, gitLastCommitSha: null }];
    const tenantBPolicies = [{ id: 'policy-B1', tenantId: 'tenant-B', name: 'Policy B1', defaultAction: 'allow' as const, activeVersion: '1.0.0', description: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, gitRepoUrl: null, gitBranch: null, gitPath: null, gitSyncEnabled: false, gitLastSync: null, gitLastCommitSha: null }];

    db.policy.findMany
      .mockResolvedValueOnce(tenantAPolicies)
      .mockResolvedValueOnce(tenantBPolicies);

    const svcA = new PolicyService(db as never, CTX_A, makeMockRedis() as never);
    const svcB = new PolicyService(db as never, CTX_B, makeMockRedis() as never);

    const policiesA = await svcA.listPolicies();
    const policiesB = await svcB.listPolicies();

    expect(policiesA).toHaveLength(1);
    expect((policiesA as unknown as Array<{id: string}>)[0]!.id).toBe('policy-A1');
    expect(policiesB).toHaveLength(1);
    expect((policiesB as unknown as Array<{id: string}>)[0]!.id).toBe('policy-B1');

    // Verify scoping: tenant-A calls had tenant-A filter
    expect(db.policy.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-A', deletedAt: null }) }),
    );
  });

  it('AuditService — each tenant only sees their own events', async () => {
    const tenantAEvents = [
      { id: 'evt-A1', tenantId: 'tenant-A', agentId: 'agent-A1', sessionId: 's1', occurredAt: new Date(), processingMs: 5, actionType: 'TOOL_CALL', toolName: 'file_read', toolTarget: null, actionParams: null, executionMs: null, policyDecision: 'ALLOW', policyVersion: null, matchedRuleId: null, matchedRuleIds: [], blockReason: null, riskScore: 0, riskTier: 'LOW', inputDataLabels: [], outputDataLabels: [], planningTraceSummary: null, ragSourceIds: [], priorEventIds: [], previousHash: '0'.repeat(64), eventHash: 'abc', createdAt: new Date() },
    ];
    const tenantBEvents = [
      { id: 'evt-B1', tenantId: 'tenant-B', agentId: 'agent-B1', sessionId: 's2', occurredAt: new Date(), processingMs: 3, actionType: 'TOOL_CALL', toolName: 'shell_exec', toolTarget: null, actionParams: null, executionMs: null, policyDecision: 'BLOCK', policyVersion: null, matchedRuleId: null, matchedRuleIds: [], blockReason: null, riskScore: 100, riskTier: 'HIGH', inputDataLabels: [], outputDataLabels: [], planningTraceSummary: null, ragSourceIds: [], priorEventIds: [], previousHash: '0'.repeat(64), eventHash: 'def', createdAt: new Date() },
    ];

    db.auditEvent.findMany
      .mockResolvedValueOnce(tenantAEvents)
      .mockResolvedValueOnce(tenantBEvents);

    const svcA = new AuditService(db as never, CTX_A, makeMockRedis() as never);
    const svcB = new AuditService(db as never, CTX_B, makeMockRedis() as never);

    const eventsA = await svcA.queryEvents({ limit: 50 });
    const eventsB = await svcB.queryEvents({ limit: 50 });

    expect(eventsA).toHaveLength(1);
    expect((eventsA as unknown as Array<{id: string}>)[0]!.id).toBe('evt-A1');
    expect(eventsB).toHaveLength(1);
    expect((eventsB as unknown as Array<{id: string}>)[0]!.id).toBe('evt-B1');

    // Verify tenant scoping
    expect(db.auditEvent.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-A' }) }),
    );
    expect(db.auditEvent.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-B' }) }),
    );
  });
});
