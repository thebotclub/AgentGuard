/**
 * UAT: Kill Switch Flow
 *
 * Simulates the full kill switch lifecycle:
 * 1. Normal evaluate calls pass through
 * 2. Kill switch is activated
 * 3. Subsequent evaluate calls are blocked (result=block, matchedRuleId=KILL_SWITCH)
 * 4. Kill switch is deactivated
 * 5. Evaluate calls resume normally
 *
 * Also tests tenant-level kill switch separately.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { IDatabase } from '../../db-interface.js';
import { createEvaluateRoutes } from '../../routes/evaluate.js';
import { createAuditRoutes } from '../../routes/audit.js';
import { createMockDb, MOCK_TENANT } from '../helpers/mock-db.js';
import { createMockAuthMiddleware } from '../helpers/create-app.js';

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../routes/audit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/audit.js')>();
  return {
    ...actual,
    getGlobalKillSwitch: vi.fn().mockResolvedValue({ active: false, at: null }),
    storeAuditEvent: vi.fn().mockResolvedValue('ks-audit-hash'),
    fireWebhooksAsync: vi.fn(),
    getLastHash: vi.fn().mockResolvedValue(''),
  };
});

vi.mock('../../lib/rate-limit-db.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 999, resetAt: 0 }),
  incrementRateCounter: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/otel-exporter.js', () => ({
  getOtelExporter: vi.fn().mockReturnValue({ recordPolicyDecision: vi.fn() }),
}));

vi.mock('../../routes/approvals.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/approvals.js')>();
  return {
    ...actual,
    createPendingApproval: vi.fn().mockResolvedValue('ks-approval-001'),
  };
});

vi.mock('../../lib/pii/regex-detector.js', () => ({
  defaultDetector: { scan: vi.fn().mockResolvedValue({ entitiesFound: 0, entities: [], redactedContent: '' }) },
  scanParamsForPII: vi.fn().mockResolvedValue({ redactedParams: {}, totalEntities: 0, typeSet: new Set() }),
}));

vi.mock('../../lib/detection/engine.js', () => ({
  DetectionEngine: vi.fn().mockImplementation(() => ({
    detect: vi.fn().mockResolvedValue({ score: 0, category: 'none', provider: 'heuristic' }),
    isAboveThreshold: vi.fn().mockReturnValue(false),
  })),
}));

vi.mock('../../lib/detection/heuristic.js', () => ({
  HeuristicDetectionPlugin: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../lib/policy-inheritance.js', () => ({
  evaluateToolAgainstPolicy: vi.fn().mockReturnValue({ allowed: true, reason: null }),
}));

vi.mock('../../lib/decision-enricher.js', () => ({
  enrichDecision: vi.fn().mockReturnValue({}),
}));

vi.mock('../../lib/redis-pubsub.js', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function buildKillSwitchApp(mockDb: IDatabase): express.Application {
  const app = express();
  app.use(express.json());
  const auth = createMockAuthMiddleware();
  app.use(createEvaluateRoutes(mockDb, auth));
  app.use(createAuditRoutes(mockDb, auth));
  return app;
}

// ── Global Kill Switch Tests ───────────────────────────────────────────────

describe('UAT: Global Kill Switch Flow', () => {
  let mockDb: IDatabase;
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    app = buildKillSwitchApp(mockDb);

    const { getGlobalKillSwitch } = await import('../../routes/audit.js');
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });

    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockDb.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('Step 1: Normal evaluate passes through (kill switch OFF)', async () => {
    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'search_web', params: { query: 'weather' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('allow');
    expect(res.body.killSwitchActive).toBeFalsy();
  });

  it('Step 2: Kill switch activated — all evaluates return block', async () => {
    const { getGlobalKillSwitch } = await import('../../routes/audit.js');
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({
      active: true,
      at: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'search_web', params: { query: 'weather' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('block');
    expect(res.body.matchedRuleId).toBe('KILL_SWITCH');
    expect(res.body.killSwitchActive).toBe(true);
    expect(res.body.riskScore).toBe(1000);
  });

  it('Step 3: Kill switch blocks even normally-safe tools', async () => {
    const { getGlobalKillSwitch } = await import('../../routes/audit.js');
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({
      active: true,
      at: new Date().toISOString(),
    });

    // Even a search_web which is normally safe is blocked
    const tools = ['search_web', 'file_read', 'data_query', 'send_email'];
    for (const tool of tools) {
      const res = await request(app)
        .post('/api/v1/evaluate')
        .set('x-api-key', 'valid-key')
        .send({ tool, params: {} });

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('block');
      expect(res.body.matchedRuleId).toBe('KILL_SWITCH');
    }
  });

  it('Step 4: Kill switch deactivated — evaluates resume normally', async () => {
    const { getGlobalKillSwitch } = await import('../../routes/audit.js');
    // Kill switch deactivated
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'search_web', params: { query: 'weather' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('allow');
    expect(res.body.killSwitchActive).toBeFalsy();
    expect(res.body.matchedRuleId).not.toBe('KILL_SWITCH');
  });

  it('Step 5: Kill switch does not bypass evaluate authentication', async () => {
    const { getGlobalKillSwitch } = await import('../../routes/audit.js');
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({
      active: true,
      at: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/api/v1/evaluate')
      .send({ tool: 'search_web', params: {} });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('Kill switch stores audit event with KILL_SWITCH rule ID', async () => {
    const { getGlobalKillSwitch, storeAuditEvent } = await import('../../routes/audit.js');
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({
      active: true,
      at: new Date().toISOString(),
    });

    await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_write', params: {} });

    expect(storeAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      null,
      'file_write',
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

// ── Tenant Kill Switch Tests ──────────────────────────────────────────────

describe('UAT: Tenant-Level Kill Switch', () => {
  let mockDb: IDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb = createMockDb();

    const { getGlobalKillSwitch } = await import('../../routes/audit.js');
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockDb.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('Tenant kill switch blocks evaluate for that tenant only', async () => {
    // Build app with a tenant that has kill_switch_active=1
    const tenantWithKillSwitch = {
      ...MOCK_TENANT,
      kill_switch_active: 1,
      kill_switch_at: new Date().toISOString(),
    };

    const localApp = express();
    localApp.use(express.json());
    const auth = createMockAuthMiddleware();

    // Override to inject kill-switch-active tenant
    auth.requireEvaluateAuth = async (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.tenantId = 'tenant-123';
      req.tenant = tenantWithKillSwitch as typeof MOCK_TENANT;
      req.agent = null;
      next();
    };

    localApp.use(createEvaluateRoutes(mockDb, auth));

    const res = await request(localApp)
      .post('/api/v1/evaluate')
      .send({ tool: 'search_web', params: {} });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('block');
    expect(res.body.matchedRuleId).toBe('TENANT_KILL_SWITCH');
    expect(res.body.killSwitchActive).toBe(true);
  });

  it('Normal tenant is not affected by another tenant kill switch', async () => {
    // Normal tenant (kill_switch_active=0) — should pass through
    const localApp = express();
    localApp.use(express.json());
    const auth = createMockAuthMiddleware();

    // Normal tenant with kill switch OFF
    auth.requireEvaluateAuth = async (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.tenantId = 'tenant-456';
      req.tenant = { ...MOCK_TENANT, id: 'tenant-456', kill_switch_active: 0 };
      req.agent = null;
      next();
    };

    localApp.use(createEvaluateRoutes(mockDb, auth));

    const res = await request(localApp)
      .post('/api/v1/evaluate')
      .send({ tool: 'search_web', params: {} });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('allow');
    expect(res.body.killSwitchActive).toBeFalsy();
  });

  it('Global kill switch overrides even if tenant kill switch is off', async () => {
    const { getGlobalKillSwitch } = await import('../../routes/audit.js');
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({
      active: true,
      at: new Date().toISOString(),
    });

    const localApp = express();
    localApp.use(express.json());
    const auth = createMockAuthMiddleware();

    // Tenant has kill switch OFF but global is ON
    auth.requireEvaluateAuth = async (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.tenantId = 'tenant-789';
      req.tenant = { ...MOCK_TENANT, id: 'tenant-789', kill_switch_active: 0 };
      req.agent = null;
      next();
    };

    localApp.use(createEvaluateRoutes(mockDb, auth));

    const res = await request(localApp)
      .post('/api/v1/evaluate')
      .send({ tool: 'search_web', params: {} });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('block');
    expect(res.body.matchedRuleId).toBe('KILL_SWITCH'); // global takes precedence
  });
});
