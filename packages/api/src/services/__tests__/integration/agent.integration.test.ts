/**
 * Agent Service — Integration Tests
 *
 * Tests agent CRUD lifecycle: create → list → get → update → delete.
 * Verifies: API key generation, bcrypt hashing, role enforcement, tenant scope.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentService } from '../../agent.js';
import type { ServiceContext } from '@agentguard/shared';
import type { Agent } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../../lib/errors.js';

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockPrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    agent: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    apiKey: { findUnique: vi.fn(), update: vi.fn() },
    tenant: { findFirst: vi.fn() },
  };
}

function makeMockRedis() {
  return { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) };
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CTX_ADMIN: ServiceContext = { tenantId: 'tenant-1', userId: 'user-1', role: 'admin', traceId: 'trace-1' };
const CTX_ANALYST: ServiceContext = { ...CTX_ADMIN, role: 'analyst' };
const CTX_OWNER: ServiceContext = { ...CTX_ADMIN, role: 'owner' };

const MOCK_AGENT: Agent = {
  id: 'agent-001', tenantId: 'tenant-1', name: 'Test Agent', description: null,
  status: 'ACTIVE', policyId: null, policyVersion: null, failBehavior: 'CLOSED',
  riskTier: 'LOW', framework: null, frameworkVersion: null, tags: [],
  metadata: { __apiKeyBcryptHash: '$2b$12$dummyhash' },
  apiKeyHash: 'sha256abc', apiKeyPrefix: 'ag_live_test', apiKeyExpiresAt: null, lastSeenAt: null,
  createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01'), deletedAt: null,
};

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return { ...MOCK_AGENT, ...overrides } as Agent;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentService — Integration', () => {
  let db: ReturnType<typeof makeMockPrisma>;
  let svc: AgentService;

  beforeEach(() => {
    db = makeMockPrisma();
    svc = new AgentService(db as never, CTX_ADMIN);
  });

  // ── CRUD ────────────────────────────────────────────────────────────────

  it('createAgent → returns agent with raw API key', async () => {
    db.agent.create.mockResolvedValue(makeAgent());
    db.agent.update.mockResolvedValue(makeAgent());

    const { agent, apiKey } = await svc.createAgent({
      name: 'New Agent', failBehavior: 'CLOSED', riskTier: 'LOW', tags: [],
    });

    expect(agent.id).toBe('agent-001');
    expect(apiKey).toMatch(/^ag_live_/);
    expect(db.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1' }) }),
    );
  });

  it('createAgent → stores bcrypt hash in metadata', async () => {
    db.agent.create.mockResolvedValue(makeAgent());
    db.agent.update.mockResolvedValue(makeAgent());

    await svc.createAgent({ name: 'A', failBehavior: 'CLOSED', riskTier: 'LOW', tags: [] });

    expect(db.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ __apiKeyBcryptHash: expect.stringMatching(/^\$2[ab]\$/) }),
        }),
      }),
    );
  });

  it('createAgent → throws ForbiddenError for analyst', async () => {
    const analystSvc = new AgentService(db as never, CTX_ANALYST);
    await expect(
      analystSvc.createAgent({ name: 'A', failBehavior: 'CLOSED', riskTier: 'LOW', tags: [] }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('listAgents → returns agents with tenant scope', async () => {
    db.agent.findMany.mockResolvedValue([makeAgent()]);

    const result = await svc.listAgents();

    expect(result).toHaveLength(1);
    expect(db.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', deletedAt: null }) }),
    );
  });

  it('listAgents → applies status filter', async () => {
    await svc.listAgents('INACTIVE');

    expect(db.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'INACTIVE' }) }),
    );
  });

  it('listAgents → applies riskTier filter', async () => {
    await svc.listAgents(undefined, 50, undefined, 'HIGH');

    expect(db.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ riskTier: 'HIGH' }) }),
    );
  });

  it('getAgent → returns agent when found', async () => {
    db.agent.findFirst.mockResolvedValue(makeAgent());

    const result = await svc.getAgent('agent-001');

    expect(result.id).toBe('agent-001');
  });

  it('getAgent → throws NotFoundError when not found', async () => {
    db.agent.findFirst.mockResolvedValue(null);
    await expect(svc.getAgent('missing')).rejects.toThrow(NotFoundError);
  });

  it('getAgent → includes tenant scope in query', async () => {
    db.agent.findFirst.mockResolvedValue(makeAgent());
    await svc.getAgent('agent-001');

    expect(db.agent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) }),
    );
  });

  it('updateAgent → updates name and returns updated agent', async () => {
    db.agent.findFirst.mockResolvedValue(makeAgent());
    db.agent.update.mockResolvedValue(makeAgent({ name: 'Renamed Agent' }));

    const result = await svc.updateAgent('agent-001', { name: 'Renamed Agent' });

    expect(db.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'agent-001' }, data: expect.objectContaining({ name: 'Renamed Agent' }) }),
    );
    expect(result.name).toBe('Renamed Agent');
  });

  it('updateAgent → throws NotFoundError when agent missing', async () => {
    db.agent.findFirst.mockResolvedValue(null);
    await expect(svc.updateAgent('missing', { name: 'X' })).rejects.toThrow(NotFoundError);
  });

  it('updateAgent → throws ForbiddenError for analyst', async () => {
    const analystSvc = new AgentService(db as never, CTX_ANALYST);
    await expect(analystSvc.updateAgent('agent-001', { name: 'X' })).rejects.toThrow(ForbiddenError);
  });

  it('deleteAgent → soft-deletes by setting deletedAt and status INACTIVE', async () => {
    db.agent.findFirst.mockResolvedValue(makeAgent());
    db.agent.update.mockResolvedValue(makeAgent({ status: 'INACTIVE', deletedAt: new Date() }));

    await svc.deleteAgent('agent-001');

    expect(db.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'agent-001' },
        data: expect.objectContaining({ status: 'INACTIVE', deletedAt: expect.any(Date) }),
      }),
    );
  });

  it('deleteAgent → throws ForbiddenError for analyst', async () => {
    const analystSvc = new AgentService(db as never, CTX_ANALYST);
    await expect(analystSvc.deleteAgent('agent-001')).rejects.toThrow(ForbiddenError);
  });

  // ── authenticateByApiKey ─────────────────────────────────────────────────

  it('authenticateByApiKey → returns null for missing agent', async () => {
    db.agent.findUnique.mockResolvedValue(null);

    const result = await svc.authenticateByApiKey('ag_live_badkey');
    expect(result).toBeNull();
  });

  it('authenticateByApiKey → returns null for soft-deleted agent', async () => {
    db.agent.findUnique.mockResolvedValue(makeAgent({ deletedAt: new Date() }));
    const result = await svc.authenticateByApiKey('ag_live_testkey');
    expect(result).toBeNull();
  });

  it('authenticateByApiKey → returns null for expired key', async () => {
    db.agent.findUnique.mockResolvedValue(makeAgent({ apiKeyExpiresAt: new Date(Date.now() - 1000) }));
    const result = await svc.authenticateByApiKey('ag_live_testkey');
    expect(result).toBeNull();
  });

  it('authenticateByApiKey → returns null when bcrypt hash fails to verify', async () => {
    const wrongHash = '$2b$12$wronghashwronghashwrongha';
    db.agent.findUnique.mockResolvedValue(makeAgent({ metadata: { __apiKeyBcryptHash: wrongHash } }));
    const result = await svc.authenticateByApiKey('ag_live_testkey');
    expect(result).toBeNull();
  });
});
