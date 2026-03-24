/**
 * AgentService — Unit Tests
 *
 * Covers:
 * - listAgents: filtering, pagination, tenant scope, soft-delete exclusion
 * - getAgent: happy path, not found, cross-tenant isolation
 * - createAgent: creates agent with hashed key, role enforcement
 * - updateAgent: updates fields, role enforcement, not found guard
 * - deleteAgent: soft-delete, role enforcement
 * - authenticateByApiKey: bcrypt verify, expired key, null for missing key
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentService } from '../agent.js';
import { NotFoundError } from '../../lib/errors.js';
import { ForbiddenError } from '../../lib/errors.js';
import { API_KEY_PREFIX } from '@agentguard/shared';
import type { ServiceContext } from '@agentguard/shared';
import type { Agent } from '@prisma/client';

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

const MOCK_AGENT: Agent = {
  id: 'agent-1',
  tenantId: 'tenant-1',
  name: 'My Agent',
  description: null,
  status: 'ACTIVE',
  policyId: null,
  policyVersion: null,
  failBehavior: 'BLOCK',
  riskTier: 'LOW',
  framework: null,
  frameworkVersion: null,
  tags: [],
  metadata: {},
  apiKeyHash: 'sha256hash',
  apiKeyPrefix: 'ag_live_test',
  apiKeyExpiresAt: null,
  lastSeenAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  deletedAt: null,
};

function makeMockDb(overrides: Partial<Record<string, unknown>> = {}) {
  const agentFindMany = vi.fn().mockResolvedValue([MOCK_AGENT]);
  const agentFindFirst = vi.fn().mockResolvedValue(MOCK_AGENT);
  const agentFindUnique = vi.fn().mockResolvedValue(null);
  const agentCreate = vi.fn().mockResolvedValue(MOCK_AGENT);
  const agentUpdate = vi.fn().mockResolvedValue(MOCK_AGENT);

  return {
    agent: {
      findMany: agentFindMany,
      findFirst: agentFindFirst,
      findUnique: agentFindUnique,
      create: agentCreate,
      update: agentUpdate,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      agent: { create: agentCreate, update: agentUpdate },
    })),
    ...overrides,
  } as unknown as import('@prisma/client').PrismaClient;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentService', () => {
  let db: ReturnType<typeof makeMockDb>;
  let svc: AgentService;

  beforeEach(() => {
    db = makeMockDb();
    svc = new AgentService(db, CTX_ADMIN);
    vi.clearAllMocks();
  });

  // ── listAgents ─────────────────────────────────────────────────────────────

  describe('listAgents', () => {
    it('calls db.agent.findMany with tenant scope and deletedAt: null', async () => {
      db = makeMockDb();
      svc = new AgentService(db, CTX_ADMIN);

      await svc.listAgents();

      expect(db.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            deletedAt: null,
          }),
        }),
      );
    });

    it('applies status filter when provided', async () => {
      await svc.listAgents('ACTIVE');

      expect(db.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('applies riskTier filter when provided', async () => {
      await svc.listAgents(undefined, 50, undefined, 'HIGH');

      expect(db.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ riskTier: 'HIGH' }),
        }),
      );
    });

    it('applies policyId filter when provided', async () => {
      await svc.listAgents(undefined, 50, undefined, undefined, 'policy-abc');

      expect(db.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ policyId: 'policy-abc' }),
        }),
      );
    });

    it('passes cursor for pagination', async () => {
      await svc.listAgents(undefined, 10, 'cursor-xyz');

      expect(db.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'cursor-xyz' },
          skip: 1,
          take: 10,
        }),
      );
    });

    it('returns agents array', async () => {
      const result = await svc.listAgents();
      expect(result).toEqual([MOCK_AGENT]);
    });
  });

  // ── getAgent ───────────────────────────────────────────────────────────────

  describe('getAgent', () => {
    it('returns agent when found', async () => {
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
      const result = await svc.getAgent('agent-1');
      expect(result).toEqual(MOCK_AGENT);
    });

    it('throws NotFoundError when agent does not exist', async () => {
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(svc.getAgent('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('includes tenant scope in query', async () => {
      await svc.getAgent('agent-1');
      expect(db.agent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            id: 'agent-1',
            deletedAt: null,
          }),
        }),
      );
    });
  });

  // ── createAgent ────────────────────────────────────────────────────────────

  describe('createAgent', () => {
    it('throws ForbiddenError for analyst role', async () => {
      const analysisSvc = new AgentService(db, CTX_ANALYST);
      await expect(
        analysisSvc.createAgent({
          name: 'Agent',
          failBehavior: 'BLOCK',
          riskTier: 'LOW',
          tags: [],
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('returns agent and rawApiKey starting with prefix', async () => {
      (db.agent.create as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
      (db.agent.update as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

      const { agent, apiKey } = await svc.createAgent({
        name: 'New Agent',
        failBehavior: 'BLOCK',
        riskTier: 'LOW',
        tags: [],
      });

      expect(agent).toEqual(MOCK_AGENT);
      expect(apiKey).toMatch(new RegExp(`^${API_KEY_PREFIX}`));
    });

    it('stores bcrypt hash in metadata after create', async () => {
      (db.agent.create as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
      const updateMock = vi.fn().mockResolvedValue(MOCK_AGENT);
      (db.agent.update as ReturnType<typeof vi.fn>).mockImplementation(updateMock);

      await svc.createAgent({
        name: 'New Agent',
        failBehavior: 'BLOCK',
        riskTier: 'LOW',
        tags: [],
      });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              __apiKeyBcryptHash: expect.stringMatching(/^\$2[ab]\$/),
            }),
          }),
        }),
      );
    });

    it('sets tenantId from context', async () => {
      (db.agent.create as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
      (db.agent.update as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

      await svc.createAgent({
        name: 'Agent',
        failBehavior: 'BLOCK',
        riskTier: 'LOW',
        tags: [],
      });

      expect(db.agent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-1' }),
        }),
      );
    });
  });

  // ── updateAgent ────────────────────────────────────────────────────────────

  describe('updateAgent', () => {
    it('throws ForbiddenError for analyst role', async () => {
      const analysisSvc = new AgentService(db, CTX_ANALYST);
      await expect(analysisSvc.updateAgent('agent-1', { name: 'New' })).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('throws NotFoundError when agent not found', async () => {
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(svc.updateAgent('missing', {})).rejects.toThrow(NotFoundError);
    });

    it('updates only provided fields', async () => {
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
      (db.agent.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...MOCK_AGENT, name: 'Updated' });

      const result = await svc.updateAgent('agent-1', { name: 'Updated' });

      expect(db.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1' },
          data: expect.objectContaining({ name: 'Updated' }),
        }),
      );
      expect(result.name).toBe('Updated');
    });

    it('does not include undefined fields in update', async () => {
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
      (db.agent.update as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

      await svc.updateAgent('agent-1', {});

      const call = (db.agent.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call?.data).not.toHaveProperty('name');
    });
  });

  // ── deleteAgent ────────────────────────────────────────────────────────────

  describe('deleteAgent', () => {
    it('throws ForbiddenError for analyst role', async () => {
      const analysisSvc = new AgentService(db, CTX_ANALYST);
      await expect(analysisSvc.deleteAgent('agent-1')).rejects.toThrow(ForbiddenError);
    });

    it('soft-deletes by setting deletedAt and status INACTIVE', async () => {
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

      await svc.deleteAgent('agent-1');

      expect(db.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1' },
          data: expect.objectContaining({
            status: 'INACTIVE',
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws NotFoundError when agent not found', async () => {
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(svc.deleteAgent('missing')).rejects.toThrow(NotFoundError);
    });
  });

  // ── authenticateByApiKey ───────────────────────────────────────────────────

  describe('authenticateByApiKey', () => {
    it('returns null when no agent matches the SHA-256 hash', async () => {
      (db.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const result = await svc.authenticateByApiKey('ag_live_badkey');
      expect(result).toBeNull();
    });

    it('returns null when agent is soft-deleted', async () => {
      (db.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...MOCK_AGENT,
        deletedAt: new Date(),
      });
      const result = await svc.authenticateByApiKey('ag_live_testkey');
      expect(result).toBeNull();
    });

    it('returns null when API key is expired', async () => {
      (db.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...MOCK_AGENT,
        apiKeyExpiresAt: new Date(Date.now() - 1000),
      });
      const result = await svc.authenticateByApiKey('ag_live_testkey');
      expect(result).toBeNull();
    });

    it('accepts key when no bcrypt hash stored (legacy path)', async () => {
      (db.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...MOCK_AGENT,
        metadata: {}, // no __apiKeyBcryptHash
      });
      (db.agent.update as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

      const result = await svc.authenticateByApiKey('ag_live_testkey');
      // Legacy path: returns agent since SHA-256 matched
      expect(result).not.toBeNull();
    });

    it('returns null when bcrypt verification fails', async () => {
      const bcrypt = await import('bcryptjs');
      const wrongHash = await bcrypt.hash('different-key', 12);

      (db.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...MOCK_AGENT,
        metadata: { __apiKeyBcryptHash: wrongHash },
      });

      const result = await svc.authenticateByApiKey('ag_live_testkey');
      expect(result).toBeNull();
    });

    it('returns agent when bcrypt verification succeeds', async () => {
      const bcrypt = await import('bcryptjs');
      const rawKey = 'ag_live_correctkey123456';
      const hash = await bcrypt.hash(rawKey, 12);

      const { createHash } = await import('node:crypto');
      const sha = createHash('sha256').update(rawKey).digest('hex');

      const agentWithHash = {
        ...MOCK_AGENT,
        apiKeyHash: sha,
        metadata: { __apiKeyBcryptHash: hash },
      };
      (db.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(agentWithHash);
      (db.agent.update as ReturnType<typeof vi.fn>).mockResolvedValue(agentWithHash);

      const result = await svc.authenticateByApiKey(rawKey);
      expect(result).toBeTruthy();
      expect(result?.id).toBe('agent-1');
    });
  });
});
