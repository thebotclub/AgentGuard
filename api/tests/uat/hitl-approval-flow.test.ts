/**
 * UAT: HITL Approval Flow
 *
 * Simulates the full Human-In-The-Loop approval workflow:
 * 1. Evaluate triggers require_approval decision
 * 2. Approval record is created in DB
 * 3. Tenant lists pending approvals
 * 4. Tenant approves via REST callback
 * 5. Re-evaluate reflects resolved state (if policy allows)
 * 6. Deny flow also works correctly
 *
 * Uses in-memory store to persist approval state across steps.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { IDatabase } from '../../db-interface.js';
import { createEvaluateRoutes } from '../../routes/evaluate.js';
import { createApprovalRoutes } from '../../routes/approvals.js';
import { createMockDb } from '../helpers/mock-db.js';
import { createMockAuthMiddleware } from '../helpers/create-app.js';

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../routes/audit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/audit.js')>();
  return {
    ...actual,
    getGlobalKillSwitch: vi.fn().mockResolvedValue({ active: false, at: null }),
    storeAuditEvent: vi.fn().mockResolvedValue('hitl-audit-hash'),
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

vi.mock('../../lib/pii/regex-detector.js', () => ({
  defaultDetector: { scan: vi.fn().mockResolvedValue({ entitiesFound: 0, entities: [], redactedContent: '' }) },
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

vi.mock('../../lib/redis-pubsub.js', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── In-Memory Approval Store ──────────────────────────────────────────────

interface ApprovalRecord {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  tool: string;
  params_json: string | null;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

const approvalStore: Map<string, ApprovalRecord> = new Map();

function createApprovalInStore(
  id: string,
  tenantId: string,
  tool: string,
  paramsJson: string | null,
): ApprovalRecord {
  const record: ApprovalRecord = {
    id,
    tenant_id: tenantId,
    agent_id: null,
    tool,
    params_json: paramsJson,
    status: 'pending',
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by: null,
  };
  approvalStore.set(id, record);
  return record;
}

// ── Build App ─────────────────────────────────────────────────────────────

function buildHitlApp(mockDb: IDatabase): express.Application {
  const app = express();
  app.use(express.json());
  const auth = createMockAuthMiddleware();
  app.use(createEvaluateRoutes(mockDb, auth));
  app.use(createApprovalRoutes(mockDb, auth));
  return app;
}

// ── UAT Tests ─────────────────────────────────────────────────────────────

describe('UAT: HITL Approval Flow', () => {
  let mockDb: IDatabase;
  let app: express.Application;
  let capturedApprovalId: string;

  const HITL_POLICY = JSON.stringify({
    id: 'hitl-test-policy',
    name: 'HITL Test Policy',
    version: '1.0.0',
    default: 'allow',
    rules: [
      {
        id: 'require-approval-for-delete',
        priority: 10,
        action: 'require_approval',
        when: [{ tool: { in: ['file_delete', 'db_drop_table'] } }],
        severity: 'critical',
        tags: ['destructive'],
        riskBoost: 50,
      },
    ],
  });

  beforeAll(() => {
    approvalStore.clear();
    mockDb = createMockDb();
    app = buildHitlApp(mockDb);

    // Wire up the approval store mock
    (mockDb.createApproval as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string, tenantId: string, agentId: string | null, tool: string, paramsJson: string) => {
        return createApprovalInStore(id, tenantId, tool, paramsJson);
      },
    );

    (mockDb.getApproval as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string, tenantId: string) => {
        const record = approvalStore.get(id);
        if (!record || record.tenant_id !== tenantId) return undefined;
        return record;
      },
    );

    (mockDb.listAllApprovals as ReturnType<typeof vi.fn>).mockImplementation(
      async (tenantId: string) => {
        return Array.from(approvalStore.values()).filter((r) => r.tenant_id === tenantId);
      },
    );

    (mockDb.resolveApproval as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string, tenantId: string, status: 'approved' | 'denied', resolvedBy: string) => {
        const record = approvalStore.get(id);
        if (record && record.tenant_id === tenantId) {
          record.status = status;
          record.resolved_at = new Date().toISOString();
          record.resolved_by = resolvedBy;
        }
      },
    );
  });

  it('Step 1: Evaluate returns require_approval for a HITL-gated tool', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(HITL_POLICY);
    (mockDb.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { getGlobalKillSwitch } = await import('../../routes/audit.js');
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_delete', params: { path: '/important/config.yaml' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('require_approval');
    expect(res.body.approvalId).toBeTruthy();
    expect(res.body.approvalUrl).toContain(res.body.approvalId);
    expect(res.body.matchedRuleId).toBe('require-approval-for-delete');

    capturedApprovalId = res.body.approvalId as string;
  });

  it('Step 2: Approval record is created and visible in pending queue', async () => {
    const res = await request(app)
      .get('/api/v1/approvals?status=pending')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.approvals)).toBe(true);
    const pending = res.body.approvals.filter((a: { id: string }) => a.id === capturedApprovalId);
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('pending');
    expect(pending[0].tool).toBe('file_delete');
  });

  it('Step 3: Tenant approves the request', async () => {
    const res = await request(app)
      .post(`/api/v1/approvals/${capturedApprovalId}/approve`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(capturedApprovalId);
    expect(res.body.status).toBe('approved');
    expect(res.body.resolvedAt).toBeTruthy();
  });

  it('Step 4: Approval is no longer in pending queue', async () => {
    const res = await request(app)
      .get('/api/v1/approvals?status=pending')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    const pending = res.body.approvals.filter((a: { id: string }) => a.id === capturedApprovalId);
    expect(pending).toHaveLength(0);
  });

  it('Step 5: Approval appears in resolved list', async () => {
    const res = await request(app)
      .get('/api/v1/approvals?status=resolved')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    const resolved = res.body.approvals.filter((a: { id: string }) => a.id === capturedApprovalId);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].status).toBe('approved');
  });

  it('Step 6: Cannot approve an already-resolved approval', async () => {
    const res = await request(app)
      .post(`/api/v1/approvals/${capturedApprovalId}/approve`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already resolved');
  });
});

// ── Deny Flow ─────────────────────────────────────────────────────────────

describe('UAT: HITL Deny Flow', () => {
  let mockDb: IDatabase;
  let app: express.Application;
  let deniedApprovalId: string;

  const HITL_POLICY = JSON.stringify({
    id: 'hitl-deny-policy',
    name: 'HITL Deny Test Policy',
    version: '1.0.0',
    default: 'allow',
    rules: [
      {
        id: 'require-approval-db',
        priority: 10,
        action: 'require_approval',
        when: [{ tool: { in: ['db_drop_table'] } }],
        severity: 'critical',
        tags: [],
        riskBoost: 80,
      },
    ],
  });

  beforeAll(() => {
    approvalStore.clear();
    mockDb = createMockDb();
    app = buildHitlApp(mockDb);

    (mockDb.createApproval as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string, tenantId: string, _agentId: string | null, tool: string, paramsJson: string) => {
        return createApprovalInStore(id, tenantId, tool, paramsJson);
      },
    );

    (mockDb.getApproval as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string, tenantId: string) => {
        const record = approvalStore.get(id);
        if (!record || record.tenant_id !== tenantId) return undefined;
        return record;
      },
    );

    (mockDb.listAllApprovals as ReturnType<typeof vi.fn>).mockImplementation(
      async (tenantId: string) => {
        return Array.from(approvalStore.values()).filter((r) => r.tenant_id === tenantId);
      },
    );

    (mockDb.resolveApproval as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string, tenantId: string, status: 'approved' | 'denied', resolvedBy: string) => {
        const record = approvalStore.get(id);
        if (record && record.tenant_id === tenantId) {
          record.status = status;
          record.resolved_at = new Date().toISOString();
          record.resolved_by = resolvedBy;
        }
      },
    );
  });

  it('Evaluate triggers approval for db_drop_table', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(HITL_POLICY);
    (mockDb.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { getGlobalKillSwitch } = await import('../../routes/audit.js');
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'db_drop_table', params: { table: 'users' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('require_approval');
    expect(res.body.approvalId).toBeTruthy();
    deniedApprovalId = res.body.approvalId as string;
  });

  it('Tenant denies the request', async () => {
    const res = await request(app)
      .post(`/api/v1/approvals/${deniedApprovalId}/deny`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(deniedApprovalId);
    expect(res.body.status).toBe('denied');
  });

  it('Cannot deny an already-denied approval', async () => {
    const res = await request(app)
      .post(`/api/v1/approvals/${deniedApprovalId}/deny`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already resolved');
  });

  it('Returns 404 for non-existent approval', async () => {
    const res = await request(app)
      .post('/api/v1/approvals/nonexistent-id/approve')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });
});
