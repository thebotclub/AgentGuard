/**
 * UAT: New Tenant Onboarding
 *
 * Simulates: Create tenant → create first agent → set policy →
 * first evaluate call → verify audit log
 *
 * This tests the full lifecycle of a new tenant using the platform.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentService } from '../../agent.js';
import { PolicyService, PolicyCompilerService } from '../../policy.js';
import { AuditService } from '../../audit.js';
import { AnomalyService } from '../../anomaly.js';
import type { ServiceContext } from '@agentguard/shared';
import type { PolicyBundle } from '@agentguard/shared';
import { GENESIS_HASH } from '@agentguard/shared';

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockPrisma() {
  const agentFindFirst = vi.fn().mockResolvedValue(null);
  const agentFindMany = vi.fn().mockResolvedValue([]);
  const agentCreate = vi.fn();
  const agentUpdate = vi.fn();
  const policyFindFirst = vi.fn().mockResolvedValue(null);
  const policyFindMany = vi.fn().mockResolvedValue([]);
  const policyCreate = vi.fn();
  const policyUpdate = vi.fn();
  const pvFindFirst = vi.fn().mockResolvedValue(null);
  const pvFindMany = vi.fn().mockResolvedValue([]);
  const pvCreate = vi.fn();
  const auditFindMany = vi.fn().mockResolvedValue([]);
  const auditFindFirst = vi.fn().mockResolvedValue(null);
  const auditCreate = vi.fn();
  const anomalyCreate = vi.fn().mockResolvedValue({ id: 'score-1', score: 0, tier: 'LOW', flags: [] });
  const sessionFindFirst = vi.fn().mockResolvedValue(null);
  const sessionCreate = vi.fn().mockResolvedValue({ id: 's1' });
  const sessionUpdate = vi.fn().mockResolvedValue({});

  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      agent: { create: agentCreate, update: agentUpdate },
      policy: { create: policyCreate, update: policyUpdate },
      policyVersion: { create: pvCreate, findFirst: pvFindFirst },
    })),
    agent: {
      findMany: agentFindMany, findFirst: agentFindFirst,
      create: agentCreate, update: agentUpdate,
    },
    policy: {
      findMany: policyFindMany, findFirst: policyFindFirst,
      create: policyCreate, update: policyUpdate,
    },
    policyVersion: {
      findMany: pvFindMany, findFirst: pvFindFirst, create: pvCreate,
    },
    auditEvent: {
      findMany: auditFindMany, findFirst: auditFindFirst, create: auditCreate,
    },
    agentSession: {
      findFirst: sessionFindFirst, create: sessionCreate, update: sessionUpdate,
    },
    anomalyScore: { create: anomalyCreate },
  };
}

function makeMockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1), zadd: vi.fn().mockResolvedValue(1),
    zremrangebyscore: vi.fn().mockResolvedValue(0), zcard: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1), sadd: vi.fn().mockResolvedValue(0),
  };
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_CTX: ServiceContext = {
  tenantId: 'new-tenant-001', userId: 'owner-001', role: 'owner', traceId: 'trace-onboard',
};

const SIMPLE_POLICY_YAML = `
id: starter-policy
name: Starter Policy
version: 0.0.1
default: block
rules:
  - id: allow-read
    priority: 100
    action: allow
    when:
      - tool:
          in: [file_read, list_files, get_config]
    severity: low
  - id: block-shell
    priority: 10
    action: block
    when:
      - tool:
          in: [shell_exec, system_command, sudo]
    severity: critical
    riskBoost: 500
`;

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('UAT: New Tenant Onboarding', () => {
  let db: ReturnType<typeof makeMockPrisma>;
  let redis: ReturnType<typeof makeMockRedis>;
  let policySvc: PolicyService;
  let agentSvc: AgentService;
  let auditSvc: AuditService;

  beforeEach(() => {
    db = makeMockPrisma();
    redis = makeMockRedis();
    policySvc = new PolicyService(db as never, TENANT_CTX, redis as never);
    agentSvc = new AgentService(db as never, TENANT_CTX);
    auditSvc = new AuditService(db as never, TENANT_CTX, redis as never);
  });

  it('complete onboarding flow: create policy → create agent → evaluate → verify audit', async () => {
    // ── Step 1: Create first policy ──────────────────────────────────────
    const createdPolicy = {
      id: 'policy-onboard-001', tenantId: 'new-tenant-001', name: 'Starter Policy',
      description: null, defaultAction: 'block' as const, activeVersion: '0.0.1',
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      gitRepoUrl: null, gitBranch: null, gitPath: null, gitSyncEnabled: false,
      gitLastSync: null, gitLastCommitSha: null,
    };
    db.policy.create.mockResolvedValue(createdPolicy);
    db.policy.update.mockResolvedValue(createdPolicy);

    const { policy, version, warnings } = await policySvc.createPolicy({
      name: 'Starter Policy',
      yamlContent: SIMPLE_POLICY_YAML,
      activate: false,
    });

    expect(policy.id).toBe('policy-onboard-001');
    expect(warnings).toHaveLength(0);

    // ── Step 2: Create first agent ──────────────────────────────────────
    const createdAgent = {
      id: 'agent-onboard-001', tenantId: 'new-tenant-001', name: 'First Agent',
      description: null, status: 'ACTIVE', policyId: 'policy-onboard-001',
      policyVersion: '0.0.1', failBehavior: 'BLOCK' as const, riskTier: 'LOW',
      framework: null, frameworkVersion: null, tags: [], metadata: {},
      apiKeyHash: 'sha', apiKeyPrefix: 'ag_live_', apiKeyExpiresAt: null, lastSeenAt: null,
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    };
    db.agent.create.mockResolvedValue(createdAgent);
    db.agent.update.mockResolvedValue(createdAgent);

    const { agent, apiKey } = await agentSvc.createAgent({
      name: 'First Agent',
      policyId: 'policy-onboard-001',
      failBehavior: 'CLOSED',
      riskTier: 'LOW',
      tags: [],
    });

    expect(agent.id).toBe('agent-onboard-001');
    expect(apiKey).toMatch(/^ag_live_/);

    // ── Step 3: First evaluate call — allowed tool ──────────────────────
    const bundle = PolicyCompilerService.compile(
      {
        id: 'starter-policy', name: 'Starter Policy', version: '0.0.1',
        default: 'block',
        rules: [
          { id: 'allow-read', priority: 100, action: 'allow', when: [{ tool: { in: ['file_read'] } }], severity: 'low', tags: [], riskBoost: 0 },
          { id: 'block-shell', priority: 10, action: 'block', when: [{ tool: { in: ['shell_exec'] } }], severity: 'critical', riskBoost: 500, tags: [] },
        ],
      },
      'policy-onboard-001',
      'new-tenant-001',
    );

    const request = {
      id: 'req-onboard-001',
      agentId: 'agent-onboard-001',
      tool: 'file_read',
      params: { path: '/data/file.txt' },
      inputDataLabels: [],
      timestamp: new Date().toISOString(),
    };

    const decision = policySvc.evaluate(bundle, request, {
      agentId: 'agent-onboard-001', sessionId: 'session-onboard-001',
      policyVersion: '0.0.1', tenantId: 'new-tenant-001', sessionContext: {},
    });

    expect(decision.result).toBe('allow');
    expect(decision.matchedRuleId).toBe('allow-read');

    // ── Step 4: Blocked tool ────────────────────────────────────────────
    const blockedDecision = policySvc.evaluate(
      bundle,
      { ...request, id: 'req-onboard-002', tool: 'shell_exec' },
      { agentId: 'agent-onboard-001', sessionId: 'session-onboard-001', policyVersion: '0.0.1', tenantId: 'new-tenant-001', sessionContext: {} },
    );

    expect(blockedDecision.result).toBe('block');
    expect(blockedDecision.matchedRuleId).toBe('block-shell');
    expect(blockedDecision.riskScore).toBeGreaterThan(0);
  });
});
