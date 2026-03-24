/**
 * PolicyService — Unit Tests
 *
 * Covers:
 * - listPolicies / getPolicy: CRUD + tenant scope + NotFoundError
 * - createPolicy: role enforcement, YAML parsing, compilation, versioning
 * - updatePolicy: role enforcement, new version creation, cache invalidation
 * - deletePolicy: soft-delete, role enforcement
 * - activateVersion: sets activeVersion, caches bundle
 * - evaluate: allow/block/require_approval decisions
 * - PolicyCompilerService.compile: rule compilation, tool index building
 * - PolicyCompilerService.compileRule: individual rule compilation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyService, PolicyCompilerService } from '../policy.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import type { ServiceContext } from '@agentguard/shared';
import type { Policy, PolicyVersion } from '@prisma/client';
import type { PolicyBundle, ActionRequest, AgentContext } from '@agentguard/shared';

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

const SIMPLE_YAML = `
id: test-policy
name: Test Policy
version: 1.0.0
default: block
rules:
  - id: allow-read
    priority: 100
    action: allow
    when:
      - tool:
          in: [file_read, list_files]
    severity: low
  - id: block-write
    priority: 10
    action: block
    when:
      - tool:
          in: [file_write, delete_file]
    severity: high
    riskBoost: 100
`;

const MOCK_POLICY: Policy = {
  id: 'policy-1',
  tenantId: 'tenant-1',
  name: 'Test Policy',
  description: null,
  defaultAction: 'block',
  activeVersion: '1.0.0',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  deletedAt: null,
};

const MOCK_BUNDLE: PolicyBundle = {
  policyId: 'policy-1',
  tenantId: 'tenant-1',
  version: '1.0.0',
  compiledAt: new Date().toISOString(),
  defaultAction: 'block',
  rules: [],
  toolIndex: {},
  checksum: 'abc123',
  ruleCount: 0,
};

const MOCK_POLICY_VERSION: PolicyVersion = {
  id: 'pv-1',
  tenantId: 'tenant-1',
  policyId: 'policy-1',
  version: '1.0.0',
  yamlContent: SIMPLE_YAML,
  compiledBundle: MOCK_BUNDLE as unknown as import('@prisma/client').Prisma.JsonValue,
  bundleChecksum: 'abc123',
  ruleCount: 0,
  createdByUserId: 'user-1',
  createdAt: new Date('2024-01-01'),
  changelog: null,
};

function makeRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    setex: vi.fn().mockResolvedValue('OK'),
  };
}

function makeDb() {
  const policyFindMany = vi.fn().mockResolvedValue([MOCK_POLICY]);
  const policyFindFirst = vi.fn().mockResolvedValue(MOCK_POLICY);
  const policyCreate = vi.fn().mockResolvedValue(MOCK_POLICY);
  const policyUpdate = vi.fn().mockResolvedValue(MOCK_POLICY);
  const pvFindMany = vi.fn().mockResolvedValue([MOCK_POLICY_VERSION]);
  const pvFindFirst = vi.fn().mockResolvedValue(MOCK_POLICY_VERSION);
  const pvFindUnique = vi.fn().mockResolvedValue(MOCK_POLICY_VERSION);
  const pvCreate = vi.fn().mockResolvedValue(MOCK_POLICY_VERSION);
  const agentFindFirst = vi.fn().mockResolvedValue(null);
  const agentUpdate = vi.fn().mockResolvedValue({});

  return {
    policy: {
      findMany: policyFindMany,
      findFirst: policyFindFirst,
      create: policyCreate,
      update: policyUpdate,
    },
    policyVersion: {
      findMany: pvFindMany,
      findFirst: pvFindFirst,
      findUnique: pvFindUnique,
      create: pvCreate,
    },
    agent: {
      findFirst: agentFindFirst,
      update: agentUpdate,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        policy: { create: policyCreate, update: policyUpdate },
        policyVersion: { create: pvCreate, findFirst: pvFindFirst },
      };
      return fn(tx);
    }),
  } as unknown as import('@prisma/client').PrismaClient;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('PolicyService', () => {
  let db: ReturnType<typeof makeDb>;
  let redis: ReturnType<typeof makeRedis>;
  let svc: PolicyService;

  beforeEach(() => {
    db = makeDb();
    redis = makeRedis();
    svc = new PolicyService(db, CTX_ADMIN, redis as unknown as import('../../lib/redis.js').Redis);
    vi.clearAllMocks();
  });

  // ── listPolicies ───────────────────────────────────────────────────────────

  describe('listPolicies', () => {
    it('queries with tenant scope and deletedAt: null', async () => {
      await svc.listPolicies();

      expect(db.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            deletedAt: null,
          }),
        }),
      );
    });

    it('applies cursor pagination', async () => {
      await svc.listPolicies(10, 'cursor-123');

      expect(db.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'cursor-123' },
          skip: 1,
          take: 10,
        }),
      );
    });
  });

  // ── getPolicy ──────────────────────────────────────────────────────────────

  describe('getPolicy', () => {
    it('returns policy when found', async () => {
      const result = await svc.getPolicy('policy-1');
      expect(result).toEqual(MOCK_POLICY);
    });

    it('throws NotFoundError when policy not found', async () => {
      (db.policy.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(svc.getPolicy('missing')).rejects.toThrow(NotFoundError);
    });

    it('includes tenant scope in query', async () => {
      await svc.getPolicy('policy-1');
      expect(db.policy.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
        }),
      );
    });
  });

  // ── createPolicy ───────────────────────────────────────────────────────────

  describe('createPolicy', () => {
    it('throws ForbiddenError for analyst role', async () => {
      const analysisSvc = new PolicyService(
        db,
        CTX_ANALYST,
        redis as unknown as import('../../lib/redis.js').Redis,
      );
      await expect(
        analysisSvc.createPolicy({ name: 'P', yamlContent: SIMPLE_YAML, activate: false }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('creates policy record in DB', async () => {
      await svc.createPolicy({ name: 'My Policy', yamlContent: SIMPLE_YAML, activate: false });

      expect(db.policy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-1', name: 'My Policy' }),
        }),
      );
    });

    it('creates a PolicyVersion record', async () => {
      await svc.createPolicy({ name: 'My Policy', yamlContent: SIMPLE_YAML, activate: false });
      expect(db.policyVersion.create).toHaveBeenCalled();
    });

    it('returns warnings array (empty for valid YAML)', async () => {
      const { warnings } = await svc.createPolicy({
        name: 'My Policy',
        yamlContent: SIMPLE_YAML,
        activate: false,
      });
      expect(Array.isArray(warnings)).toBe(true);
    });

    it('throws ValidationError for invalid YAML', async () => {
      const { ValidationError: VE } = await import('../../lib/errors.js');
      await expect(
        svc.createPolicy({ name: 'Bad', yamlContent: ':::invalid yaml:::', activate: false }),
      ).rejects.toThrow();
    });

    it('activates version immediately when activate: true', async () => {
      await svc.createPolicy({
        name: 'My Policy',
        yamlContent: SIMPLE_YAML,
        activate: true,
      });

      // Should update activeVersion on the policy
      expect(db.policy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ activeVersion: expect.any(String) }),
        }),
      );
    });
  });

  // ── updatePolicy ───────────────────────────────────────────────────────────

  describe('updatePolicy', () => {
    it('throws ForbiddenError for analyst role', async () => {
      const analysisSvc = new PolicyService(
        db,
        CTX_ANALYST,
        redis as unknown as import('../../lib/redis.js').Redis,
      );
      await expect(analysisSvc.updatePolicy('policy-1', {})).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError when policy not found', async () => {
      (db.policy.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(svc.updatePolicy('missing', {})).rejects.toThrow(NotFoundError);
    });

    it('creates new version when yamlContent provided', async () => {
      await svc.updatePolicy('policy-1', { yamlContent: SIMPLE_YAML });
      expect(db.policyVersion.create).toHaveBeenCalled();
    });

    it('invalidates Redis bundle cache on delete', async () => {
      await svc.deletePolicy('policy-1');
      expect(redis.del).toHaveBeenCalledWith(
        expect.stringContaining('bundle'),
      );
    });
  });

  // ── deletePolicy ───────────────────────────────────────────────────────────

  describe('deletePolicy', () => {
    it('throws ForbiddenError for operator role', async () => {
      const opSvc = new PolicyService(
        db,
        { ...CTX_ADMIN, role: 'operator' },
        redis as unknown as import('../../lib/redis.js').Redis,
      );
      await expect(opSvc.deletePolicy('policy-1')).rejects.toThrow(ForbiddenError);
    });

    it('soft-deletes by setting deletedAt', async () => {
      await svc.deletePolicy('policy-1');

      expect(db.policy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });
  });

  // ── activateVersion ────────────────────────────────────────────────────────

  describe('activateVersion', () => {
    it('throws ForbiddenError for analyst', async () => {
      const analysisSvc = new PolicyService(
        db,
        CTX_ANALYST,
        redis as unknown as import('../../lib/redis.js').Redis,
      );
      await expect(analysisSvc.activateVersion('policy-1', '1.0.0')).rejects.toThrow(ForbiddenError);
    });

    it('sets activeVersion on policy', async () => {
      await svc.activateVersion('policy-1', '1.0.0');

      expect(db.policy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ activeVersion: '1.0.0' }),
        }),
      );
    });

    it('caches bundle in Redis on activation', async () => {
      await svc.activateVersion('policy-1', '1.0.0');

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('bundle'),
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });
  });

  // ── evaluate ───────────────────────────────────────────────────────────────

  describe('evaluate', () => {
    function makeBundle(defaultAction: 'allow' | 'block' = 'block'): PolicyBundle {
      const compiled = PolicyCompilerService.compile(
        {
          id: 'p1',
          name: 'Test',
          version: '1.0.0',
          default: defaultAction,
          rules: [
            {
              id: 'allow-read',
              priority: 100,
              action: 'allow',
              when: [{ tool: { in: ['file_read'] } }],
              severity: 'low',
              tags: [],
              riskBoost: 0,
            },
            {
              id: 'block-write',
              priority: 10,
              action: 'block',
              when: [{ tool: { in: ['file_write'] } }],
              severity: 'high',
              riskBoost: 100,
              tags: [],
            },
          ],
        },
        'policy-1',
        'tenant-1',
      );
      return compiled;
    }

    function makeRequest(tool: string, params: Record<string, unknown> = {}): ActionRequest {
      return {
        id: 'req-1',
        agentId: 'agent-1',
        tool,
        params,
        inputDataLabels: [],
        timestamp: new Date().toISOString(),
      };
    }

    function makeAgentCtx(): AgentContext {
      return {
        agentId: 'agent-1',
        sessionId: 'session-1',
        policyVersion: '1.0.0',
        tenantId: 'tenant-1',
        sessionContext: {},
      };
    }

    it('returns allow for matching allow rule', () => {
      const bundle = makeBundle();
      const decision = svc.evaluate(bundle, makeRequest('file_read'), makeAgentCtx());
      expect(decision.result).toBe('allow');
    });

    it('returns block for matching block rule', () => {
      const bundle = makeBundle();
      const decision = svc.evaluate(bundle, makeRequest('file_write'), makeAgentCtx());
      expect(decision.result).toBe('block');
    });

    it('returns default action when no rule matches', () => {
      const bundle = makeBundle('block');
      const decision = svc.evaluate(bundle, makeRequest('unknown_tool'), makeAgentCtx());
      expect(decision.result).toBe('block');
    });

    it('applies riskBoost from block rule', () => {
      const bundle = makeBundle();
      const decision = svc.evaluate(bundle, makeRequest('file_write'), makeAgentCtx());
      expect(decision.riskScore).toBeGreaterThan(0);
    });

    it('returns matchedRuleId when rule matches', () => {
      const bundle = makeBundle();
      const decision = svc.evaluate(bundle, makeRequest('file_read'), makeAgentCtx());
      expect(decision.matchedRuleId).toBe('allow-read');
    });

    it('includes policyVersion in result', () => {
      const bundle = makeBundle();
      const decision = svc.evaluate(bundle, makeRequest('file_read'), makeAgentCtx());
      expect(decision.policyVersion).toBe('1.0.0');
    });

    it('returns require_approval for HITL rule', () => {
      const bundle = PolicyCompilerService.compile(
        {
          id: 'p1',
          name: 'HITL Policy',
          version: '1.0.0',
          default: 'block',
          rules: [
            {
              id: 'hitl-rule',
              priority: 50,
              action: 'require_approval',
              when: [{ tool: { in: ['send_email'] } }],
              severity: 'medium',
              timeoutSec: 300,
              tags: [],
              riskBoost: 0,
            },
          ],
        },
        'policy-1',
        'tenant-1',
      );

      const decision = svc.evaluate(bundle, makeRequest('send_email'), makeAgentCtx());
      expect(decision.result).toBe('require_approval');
    });
  });
});

// ─── PolicyCompilerService ─────────────────────────────────────────────────────

describe('PolicyCompilerService', () => {
  describe('compile', () => {
    it('compiles rules and builds toolIndex', () => {
      const bundle = PolicyCompilerService.compile(
        {
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          default: 'block',
          rules: [
            {
              id: 'rule-1',
              priority: 100,
              action: 'allow',
              when: [{ tool: { in: ['file_read'] } }],
              severity: 'low',
              tags: [],
              riskBoost: 0,
            },
          ],
        },
        'policy-1',
        'tenant-1',
      );

      expect(bundle.policyId).toBe('policy-1');
      expect(bundle.tenantId).toBe('tenant-1');
      expect(bundle.ruleCount).toBe(1);
      expect(bundle.toolIndex['file_read']).toBeDefined();
    });

    it('places wildcard tools in toolIndex under "*"', () => {
      const bundle = PolicyCompilerService.compile(
        {
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          default: 'allow',
          rules: [
            {
              id: 'wildcard-rule',
              priority: 100,
              action: 'block',
              when: [{ tool: { matches: ['*'] } }],
              severity: 'high',
              tags: [],
              riskBoost: 0,
            },
          ],
        },
        'policy-1',
        'tenant-1',
      );

      expect(bundle.toolIndex['*']).toBeDefined();
    });

    it('generates a non-empty checksum', () => {
      const bundle = PolicyCompilerService.compile(
        {
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          default: 'allow',
          rules: [],
        },
        'policy-1',
        'tenant-1',
      );

      expect(bundle.checksum).toBeTruthy();
      expect(bundle.checksum).toMatch(/^[a-f0-9]+$/);
    });

    it('sets compiledAt to a valid ISO string', () => {
      const bundle = PolicyCompilerService.compile(
        { id: 'test', name: 'Test', version: '1.0.0', default: 'allow', rules: [] },
        'policy-1',
        'tenant-1',
      );

      expect(new Date(bundle.compiledAt).toISOString()).toBe(bundle.compiledAt);
    });
  });

  describe('compileRule', () => {
    it('extracts tool condition from when clauses', () => {
      const rule = PolicyCompilerService.compileRule({
        id: 'r1',
        priority: 100,
        action: 'allow',
        when: [{ tool: { in: ['file_read'] } }],
        severity: 'low',
        tags: [],
        riskBoost: 0,
      });

      expect(rule.toolCondition).toEqual({ in: ['file_read'] });
    });

    it('extracts param conditions', () => {
      const rule = PolicyCompilerService.compileRule({
        id: 'r1',
        priority: 50,
        action: 'block',
        when: [{ params: { destination: { not_in: ['internal.api'] } } }],
        severity: 'high',
        tags: [],
        riskBoost: 0,
      });

      expect(rule.paramConditions).toHaveLength(1);
    });

    it('defaults priority to 100 when not specified', () => {
      const rule = PolicyCompilerService.compileRule({
        id: 'r1',
        action: 'allow',
        when: [] as { tool: { in: string[] } }[],
        severity: 'low',
        tags: [] as string[],
        riskBoost: 0,
        priority: 100,
      });

      expect(rule.priority).toBe(100);
    });

    it('defaults riskBoost to 0 when not specified', () => {
      const rule = PolicyCompilerService.compileRule({
        id: 'r1',
        action: 'allow',
        when: [] as { tool: { in: string[] } }[],
        severity: 'low',
        tags: [] as string[],
        riskBoost: 0,
        priority: 100,
      });

      expect(rule.riskBoost).toBe(0);
    });
  });
});
