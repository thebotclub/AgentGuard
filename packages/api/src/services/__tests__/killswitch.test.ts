/**
 * KillSwitchService — Unit Tests
 *
 * Covers:
 * - issueKill: role enforcement, creates DB record, sets Redis flag, sets agent KILLED
 * - haltAll: role enforcement, kills all ACTIVE agents, one command per agent
 * - resumeAgent: restores ACTIVE, deletes Redis key, updates commands
 * - getKillStatus: Redis fast path, DB fallback, re-warms Redis
 * - listCommands: tenant scope, agent verification
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KillSwitchService } from '../killswitch.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import type { ServiceContext } from '@agentguard/shared';
import { KILL_SWITCH_TTL_SECONDS } from '@agentguard/shared';
import type { Agent, KillSwitchCommand } from '@prisma/client';

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

const MOCK_AGENT: Pick<Agent, 'id' | 'tenantId' | 'status' | 'deletedAt'> & Partial<Agent> = {
  id: 'agent-1',
  tenantId: 'tenant-1',
  status: 'ACTIVE',
  deletedAt: null,
};

const MOCK_COMMAND: KillSwitchCommand = {
  id: 'cmd-1',
  tenantId: 'tenant-1',
  agentId: 'agent-1',
  tier: 'SOFT',
  reason: 'misbehaving',
  issuedByUserId: 'user-1',
  issuedAt: new Date('2024-01-01'),
  resumedAt: null,
};

function makeRedis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  };
}

function makeDb() {
  const agentFindFirst = vi.fn().mockResolvedValue(MOCK_AGENT);
  const agentFindMany = vi.fn().mockResolvedValue([MOCK_AGENT]);
  const agentUpdate = vi.fn().mockResolvedValue({ ...MOCK_AGENT, status: 'KILLED' });
  const agentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const cmdCreate = vi.fn().mockResolvedValue(MOCK_COMMAND);
  const cmdCreateMany = vi.fn().mockResolvedValue({ count: 1 });
  const cmdUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const cmdFindFirst = vi.fn().mockResolvedValue(MOCK_COMMAND);
  const cmdFindMany = vi.fn().mockResolvedValue([MOCK_COMMAND]);

  return {
    agent: {
      findFirst: agentFindFirst,
      findMany: agentFindMany,
      update: agentUpdate,
      updateMany: agentUpdateMany,
    },
    killSwitchCommand: {
      create: cmdCreate,
      createMany: cmdCreateMany,
      updateMany: cmdUpdateMany,
      findFirst: cmdFindFirst,
      findMany: cmdFindMany,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        killSwitchCommand: { create: cmdCreate, updateMany: cmdUpdateMany },
        agent: { update: agentUpdate, updateMany: agentUpdateMany },
      };
      return fn(tx);
    }),
  } as unknown as import('@prisma/client').PrismaClient;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('KillSwitchService', () => {
  let db: ReturnType<typeof makeDb>;
  let redis: ReturnType<typeof makeRedis>;
  let svc: KillSwitchService;

  beforeEach(() => {
    db = makeDb();
    redis = makeRedis();
    svc = new KillSwitchService(db, CTX_ADMIN, redis as unknown as import('../../lib/redis.js').Redis);
    vi.clearAllMocks();
  });

  // ── issueKill ──────────────────────────────────────────────────────────────

  describe('issueKill', () => {
    it('throws ForbiddenError for analyst role', async () => {
      const analysisSvc = new KillSwitchService(
        db,
        CTX_ANALYST,
        redis as unknown as import('../../lib/redis.js').Redis,
      );
      await expect(
        analysisSvc.issueKill('agent-1', { tier: 'SOFT', reason: 'test' }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError when agent does not belong to tenant', async () => {
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(
        svc.issueKill('agent-missing', { tier: 'SOFT', reason: 'test' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('creates a KillSwitchCommand record in DB', async () => {
      await svc.issueKill('agent-1', { tier: 'SOFT', reason: 'misbehaving' });

      expect(db.killSwitchCommand.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            agentId: 'agent-1',
            tier: 'SOFT',
            reason: 'misbehaving',
          }),
        }),
      );
    });

    it('sets agent status to KILLED', async () => {
      await svc.issueKill('agent-1', { tier: 'SOFT' });

      expect(db.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1' },
          data: { status: 'KILLED' },
        }),
      );
    });

    it('sets Redis kill switch flag with TTL', async () => {
      await svc.issueKill('agent-1', { tier: 'HARD', reason: 'critical' });

      expect(redis.set).toHaveBeenCalledWith(
        `killswitch:tenant-1:agent-1`,
        'HARD',
        'EX',
        KILL_SWITCH_TTL_SECONDS,
      );
    });

    it('returns the created KillSwitchCommand', async () => {
      const result = await svc.issueKill('agent-1', { tier: 'SOFT' });
      expect(result).toEqual(MOCK_COMMAND);
    });
  });

  // ── haltAll ────────────────────────────────────────────────────────────────

  describe('haltAll', () => {
    it('throws ForbiddenError for operator role', async () => {
      const opSvc = new KillSwitchService(
        db,
        { ...CTX_ADMIN, role: 'operator' },
        redis as unknown as import('../../lib/redis.js').Redis,
      );
      await expect(opSvc.haltAll({ tier: 'HARD' })).rejects.toThrow(ForbiddenError);
    });

    it('returns affectedAgents count', async () => {
      (db.agent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'agent-1' },
        { id: 'agent-2' },
      ]);

      const result = await svc.haltAll({ tier: 'HARD' });
      expect(result.affectedAgents).toBe(2);
    });

    it('sets Redis keys for every ACTIVE agent', async () => {
      (db.agent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'agent-1' },
        { id: 'agent-2' },
      ]);

      await svc.haltAll({ tier: 'SOFT' });

      expect(redis.set).toHaveBeenCalledWith(
        'killswitch:tenant-1:agent-1',
        'SOFT',
        'EX',
        KILL_SWITCH_TTL_SECONDS,
      );
      expect(redis.set).toHaveBeenCalledWith(
        'killswitch:tenant-1:agent-2',
        'SOFT',
        'EX',
        KILL_SWITCH_TTL_SECONDS,
      );
    });

    it('bulk-updates agent statuses to KILLED', async () => {
      (db.agent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'agent-1' }]);

      await svc.haltAll({ tier: 'HARD' });

      expect(db.agent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
          data: { status: 'KILLED' },
        }),
      );
    });

    it('creates one command per agent', async () => {
      (db.agent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'agent-1' },
        { id: 'agent-2' },
      ]);

      await svc.haltAll({ tier: 'HARD' });

      const call = (db.killSwitchCommand.createMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call?.data).toHaveLength(2);
    });
  });

  // ── resumeAgent ────────────────────────────────────────────────────────────

  describe('resumeAgent', () => {
    it('throws ForbiddenError for analyst role', async () => {
      const analysisSvc = new KillSwitchService(
        db,
        CTX_ANALYST,
        redis as unknown as import('../../lib/redis.js').Redis,
      );
      await expect(analysisSvc.resumeAgent('agent-1')).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError when agent not found', async () => {
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(svc.resumeAgent('missing')).rejects.toThrow(NotFoundError);
    });

    it('restores agent status to ACTIVE', async () => {
      await svc.resumeAgent('agent-1');

      expect(db.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1' },
          data: { status: 'ACTIVE' },
        }),
      );
    });

    it('deletes Redis kill switch key', async () => {
      await svc.resumeAgent('agent-1');

      expect(redis.del).toHaveBeenCalledWith('killswitch:tenant-1:agent-1');
    });

    it('marks all active commands as resumed', async () => {
      await svc.resumeAgent('agent-1');

      expect(db.killSwitchCommand.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agentId: 'agent-1', resumedAt: null }),
          data: { resumedAt: expect.any(Date) },
        }),
      );
    });
  });

  // ── getKillStatus ──────────────────────────────────────────────────────────

  describe('getKillStatus', () => {
    it('returns isKilled: false when Redis key absent and agent not KILLED', async () => {
      redis.get.mockResolvedValue(null);
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...MOCK_AGENT,
        status: 'ACTIVE',
      });

      const result = await svc.getKillStatus('agent-1');

      expect(result.isKilled).toBe(false);
      expect(result.tier).toBeNull();
    });

    it('returns isKilled: true from Redis fast path', async () => {
      redis.get.mockResolvedValue('SOFT');
      (db.killSwitchCommand.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_COMMAND);

      const result = await svc.getKillStatus('agent-1');

      expect(result.isKilled).toBe(true);
      expect(result.tier).toBe('SOFT');
    });

    it('falls back to DB when Redis is empty but agent is KILLED', async () => {
      redis.get.mockResolvedValue(null);
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...MOCK_AGENT,
        status: 'KILLED',
      });
      (db.killSwitchCommand.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_COMMAND);

      const result = await svc.getKillStatus('agent-1');

      expect(result.isKilled).toBe(true);
      expect(result.tier).toBe('SOFT');
    });

    it('re-warms Redis cache on DB fallback hit', async () => {
      redis.get.mockResolvedValue(null);
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...MOCK_AGENT,
        status: 'KILLED',
      });
      (db.killSwitchCommand.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_COMMAND);

      await svc.getKillStatus('agent-1');

      expect(redis.set).toHaveBeenCalledWith(
        'killswitch:tenant-1:agent-1',
        'SOFT',
        'EX',
        KILL_SWITCH_TTL_SECONDS,
      );
    });
  });

  // ── listCommands ───────────────────────────────────────────────────────────

  describe('listCommands', () => {
    it('throws NotFoundError when agent not found', async () => {
      (db.agent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(svc.listCommands('missing')).rejects.toThrow(NotFoundError);
    });

    it('queries commands with tenant and agent scope', async () => {
      await svc.listCommands('agent-1');

      expect(db.killSwitchCommand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agentId: 'agent-1',
            tenantId: 'tenant-1',
          }),
        }),
      );
    });

    it('returns commands array', async () => {
      const result = await svc.listCommands('agent-1');
      expect(result).toEqual([MOCK_COMMAND]);
    });
  });
});
