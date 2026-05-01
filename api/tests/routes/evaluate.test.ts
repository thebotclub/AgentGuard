/**
 * Tests for POST /api/v1/evaluate — Core Policy Evaluation Endpoint
 *
 * Covers:
 *  - Happy path: allow, block, monitor decisions
 *  - Authentication is required for protected evaluation
 *  - Authenticated tenant requests
 *  - Input validation (tool name format, missing tool, etc.)
 *  - Kill switch (global + tenant)
 *  - Rate limiting
 *  - Default policy behavior for known dangerous tools
 *  - Agent key requests
 *  - GET /api/v1/evaluate discovery endpoint
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createEvaluateRoutes } from '../../routes/evaluate.js';
import { createMockDb, MOCK_TENANT, MOCK_AGENT } from '../helpers/mock-db.js';
import { buildApp, createMockAuthMiddleware } from '../helpers/create-app.js';
import type { IDatabase } from '../../db-interface.js';
import express from 'express';

// ── Module mocks (hoisted by vitest before any imports) ────────────────────

vi.mock('../../routes/audit.js', () => ({
  getGlobalKillSwitch: vi.fn().mockResolvedValue({ active: false, at: null }),
  storeAuditEvent: vi.fn().mockResolvedValue('mock-hash'),
  fireWebhooksAsync: vi.fn(),
  getLastHash: vi.fn().mockResolvedValue(''),
  createAuditRoutes: vi.fn(),
}));

vi.mock('../../lib/rate-limit-db.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: -1, resetAt: 0 }),
  incrementRateCounter: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/kill-switch-cache.js', () => ({
  getGlobalKillSwitchCached: vi.fn().mockResolvedValue({ active: false, cached: false }),
  getTenantKillSwitchCached: vi.fn().mockResolvedValue({ active: false, cached: false }),
}));

vi.mock('../../lib/otel-exporter.js', () => ({
  getOtelExporter: vi.fn().mockReturnValue({
    recordPolicyDecision: vi.fn(),
  }),
}));

vi.mock('../../routes/approvals.js', () => ({
  createPendingApproval: vi.fn().mockResolvedValue('approval-uuid-123'),
  createApprovalRoutes: vi.fn(),
}));

vi.mock('../../lib/pii/regex-detector.js', () => ({
  defaultDetector: {
    scan: vi.fn().mockResolvedValue({ entitiesFound: 0, entities: [], redactedContent: '' }),
  },
  scanParamsForPII: vi.fn().mockResolvedValue({ redactedParams: {}, totalEntities: 0, typeSet: new Set() }),
}));

vi.mock('../../lib/detection/engine.js', () => ({
  DetectionEngine: vi.fn().mockImplementation(function () {
    return {
      detect: vi.fn().mockResolvedValue({ score: 0, category: 'none', provider: 'heuristic' }),
      isAboveThreshold: vi.fn().mockReturnValue(false),
    };
  }),
}));

vi.mock('../../lib/detection/heuristic.js', () => ({
  HeuristicDetectionPlugin: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('../../lib/policy-inheritance.js', () => ({
  evaluateToolAgainstPolicy: vi.fn().mockReturnValue({ allowed: true, reason: null }),
}));

vi.mock('../../lib/decision-enricher.js', () => ({
  enrichDecision: vi.fn().mockReturnValue({}),
}));

// ── Static imports of mocked modules (after vi.mock calls are hoisted) ────
import { getGlobalKillSwitch, storeAuditEvent } from '../../routes/audit.js';
import { checkRateLimit, incrementRateCounter } from '../../lib/rate-limit-db.js';
import { createPendingApproval } from '../../routes/approvals.js';

// ── Helper to build a standard test app ───────────────────────────────────

function buildEvalApp(db: IDatabase) {
  return buildApp(createEvaluateRoutes, db);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/evaluate (discovery)', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildEvalApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: -1, resetAt: 0 });
    mockDb = createMockDb();
    app = buildEvalApp(mockDb);
  });

  it('returns 200 with usage instructions', async () => {
    const res = await request(app).get('/api/v1/evaluate');

    expect(res.status).toBe(200);
    expect(res.body.endpoint).toContain('POST');
    expect(res.body.description).toBeTruthy();
    expect(res.body.example).toBeTruthy();
  });
});

describe('POST /api/v1/evaluate — auth and default policy', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildEvalApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: -1, resetAt: 0 });
    vi.mocked(storeAuditEvent).mockResolvedValue('mock-hash');
    mockDb = createMockDb();
    app = buildEvalApp(mockDb);
  });

  it('returns 401 without API key', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .send({ tool: 'search_web', params: { query: 'hello world' } });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('blocks known dangerous tools under default policy (shell_exec)', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'shell_exec', params: { command: 'ls' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('block');
    expect(res.body.matchedRuleId).toBeTruthy();
    expect(typeof res.body.riskScore).toBe('number');
    expect(res.body.riskScore).toBeGreaterThan(0);
  });

  it('blocks sudo under default policy', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'sudo', params: { command: 'cat /etc/shadow' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('block');
  });

  it('returns result, matchedRuleId, riskScore, reason, and durationMs', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_read', params: { path: '/tmp/test.txt' } });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('result');
    expect(res.body).toHaveProperty('riskScore');
    expect(res.body).toHaveProperty('durationMs');
    expect(typeof res.body.durationMs).toBe('number');
  });

  it('returns 400 for missing tool field', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ params: { key: 'value' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.field).toBeTruthy();
  });

  it('returns 400 for empty tool name', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: '', params: {} });

    expect(res.status).toBe(400);
  });

  it('returns 400 for tool name with invalid characters', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'tool; DROP TABLE users;', params: {} });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('returns 400 for tool name exceeding 200 chars', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'a'.repeat(201), params: {} });

    expect(res.status).toBe(400);
  });

  it('stores an audit event for authenticated evaluations', async () => {
    await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_write', params: { path: '/tmp/out.txt' } });

    expect(storeAuditEvent).toHaveBeenCalledOnce();
  });
});

describe('POST /api/v1/evaluate — authenticated tenant', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildEvalApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: -1, resetAt: 0 });
    vi.mocked(storeAuditEvent).mockResolvedValue('mock-hash');
    vi.mocked(incrementRateCounter).mockResolvedValue(undefined);
    MOCK_AGENT.policy_scope = '[]';
    mockDb = createMockDb();
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockDb.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    app = buildEvalApp(mockDb);
  });

  it('evaluates with authenticated tenant key', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'search_web', params: { query: 'test' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBeTruthy();
  });

  it('uses custom policy when tenant has one configured', async () => {
    // Custom policy that blocks everything
    const customPolicy = JSON.stringify({
      id: 'custom-tenant-123',
      name: 'Block All',
      version: '1.0.0',
      default: 'block',
      rules: [],
    });
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(customPolicy);

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'any_tool', params: {} });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('block');
  });

  it('uses custom policy that allows a specific tool', async () => {
    const customPolicy = JSON.stringify({
      id: 'custom-tenant-123',
      name: 'Allow file_read',
      version: '1.0.0',
      default: 'block',
      rules: [
        {
          id: 'allow-file-read',
          priority: 10,
          action: 'allow',
          when: [{ tool: { in: ['file_read'] } }],
          severity: 'low',
          tags: [],
          riskBoost: 0,
        },
      ],
    });
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(customPolicy);

    const allowRes = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_read' });

    expect(allowRes.body.result).toBe('allow');

    const blockRes = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_write' });

    expect(blockRes.body.result).toBe('block');
  });

  it('checks rate limit for authenticated tenants', async () => {
    await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_read' });

    expect(checkRateLimit).toHaveBeenCalledWith(expect.anything(), 'tenant-123', undefined);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_read' });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Rate limit');
    expect(res.body.remaining).toBe(0);
  });
});

describe('POST /api/v1/evaluate — kill switch', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildEvalApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: -1, resetAt: 0 });
    vi.mocked(storeAuditEvent).mockResolvedValue('mock-hash');
    mockDb = createMockDb();
    app = buildEvalApp(mockDb);
  });

  it('returns block when global kill switch is active', async () => {
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: true, at: '2024-01-01T00:00:00.000Z' });

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'any_tool', params: {} });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('block');
    expect(res.body.matchedRuleId).toBe('KILL_SWITCH');
    expect(res.body.killSwitchActive).toBe(true);
    expect(res.body.riskScore).toBe(1000);
  });

  it('returns block when tenant kill switch is active', async () => {
    // Build a custom app where the auth middleware sets a tenant with kill switch active
    const localApp = express();
    localApp.use(express.json());

    const auth = createMockAuthMiddleware();
    const tenantWithKillSwitch = { ...MOCK_TENANT, kill_switch_active: 1, kill_switch_at: '2024-01-01T00:00:00.000Z' };

    // Override requireEvaluateAuth to inject kill-switch tenant
    auth.requireEvaluateAuth = async (req: any, _res: any, next: any): Promise<void> => {
      req.tenantId = 'tenant-123';
      req.tenant = tenantWithKillSwitch;
      req.agent = null;
      next();
    };

    localApp.use(createEvaluateRoutes(mockDb, auth));

    const res = await request(localApp)
      .post('/api/v1/evaluate')
      .send({ tool: 'any_tool', params: {} });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('block');
    expect(res.body.matchedRuleId).toBe('TENANT_KILL_SWITCH');
    expect(res.body.killSwitchActive).toBe(true);
  });

  it('stores audit event when global kill switch blocks', async () => {
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: true, at: '2024-01-01T00:00:00.000Z' });

    await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'any_tool', params: {} });

    expect(storeAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      null,
      'any_tool',
      'block',
      'KILL_SWITCH',
      1000,
      expect.any(String),
      0,
      expect.any(String),
      null,
    );
  });
});

describe('POST /api/v1/evaluate — agent key requests', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildEvalApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: -1, resetAt: 0 });
    vi.mocked(storeAuditEvent).mockResolvedValue('mock-hash');
    vi.mocked(incrementRateCounter).mockResolvedValue(undefined);
    mockDb = createMockDb();
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockDb.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    app = buildEvalApp(mockDb);
  });

  it('evaluates with valid agent key', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'ag_agent_valid')
      .send({ tool: 'file_read', params: {} });

    expect(res.status).toBe(200);
    expect(res.body.result).toBeTruthy();
  });

  it('blocks agent key calls outside the agent policy scope', async () => {
    MOCK_AGENT.policy_scope = '["file_read"]';

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'ag_agent_valid')
      .send({ tool: 'sudo', params: { command: 'cat /etc/shadow' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('block');
    expect(res.body.matchedRuleId).toBe('AGENT_SCOPE_VIOLATION');
    expect(storeAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-123',
      null,
      'sudo',
      'block',
      'AGENT_SCOPE_VIOLATION',
      900,
      expect.stringContaining('outside this agent key'),
      0,
      expect.any(String),
      MOCK_AGENT.id,
    );
  });

  it('returns 401 for invalid agent key (ag_agent_ prefix but not found)', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'ag_agent_invalid_key')
      .send({ tool: 'file_read', params: {} });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/evaluate — decision types', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildEvalApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: -1, resetAt: 0 });
    vi.mocked(storeAuditEvent).mockResolvedValue('mock-hash');
    vi.mocked(incrementRateCounter).mockResolvedValue(undefined);
    vi.mocked(createPendingApproval).mockResolvedValue('approval-uuid-123');
    mockDb = createMockDb();
    (mockDb.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    app = buildEvalApp(mockDb);
  });

  it('returns allow decision for explicitly allowed tool in custom policy', async () => {
    const allowAllPolicy = JSON.stringify({
      id: 'allow-all',
      name: 'Allow All',
      version: '1.0.0',
      default: 'allow',
      rules: [
        {
          id: 'explicit-allow',
          priority: 5,
          action: 'allow',
          when: [{ tool: { in: ['data_query'] } }],
          severity: 'low',
          tags: [],
          riskBoost: 0,
        },
      ],
    });
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(allowAllPolicy);

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'data_query', params: { sql: 'SELECT 1' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('allow');
    expect(res.body.matchedRuleId).toBe('explicit-allow');
  });

  it('returns require_approval and creates approval record', async () => {
    const hitlPolicy = JSON.stringify({
      id: 'hitl-policy',
      name: 'HITL Policy',
      version: '1.0.0',
      default: 'block',
      rules: [
        {
          id: 'hitl-rule',
          priority: 5,
          action: 'require_approval',
          when: [{ tool: { in: ['file_delete'] } }],
          severity: 'high',
          tags: [],
          riskBoost: 0,
        },
      ],
    });
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(hitlPolicy);
    (mockDb.createApproval as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'approval-123' });

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_delete', params: { path: '/important/file.txt' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('require_approval');
    expect(res.body.approvalId).toBeTruthy();
    expect(res.body.approvalUrl).toContain(res.body.approvalId);
  });

  it('includes params in evaluation without error', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_read', params: { path: '/etc/hosts', encoding: 'utf8' } });

    expect(res.status).toBe(200);
  });
});
