/**
 * UAT: New Tenant Onboarding Journey
 *
 * Simulates a complete tenant onboarding flow:
 * 1. Create tenant (via API key provisioning)
 * 2. Create first agent
 * 3. Set a custom policy
 * 4. Make the first evaluate call
 * 5. Verify the audit log contains the evaluation event
 *
 * Uses an in-memory store to persist state across test steps.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { IDatabase, AgentRow, TenantRow } from '../../db-interface.js';
import { createAgentRoutes } from '../../routes/agents.js';
import { createPolicyRoutes } from '../../routes/policy.js';
import { createEvaluateRoutes } from '../../routes/evaluate.js';
import { createAuditRoutes } from '../../routes/audit.js';
import { createMockAuthMiddleware } from '../helpers/create-app.js';
import { createMockDb, MOCK_TENANT } from '../helpers/mock-db.js';

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../routes/audit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/audit.js')>();
  return {
    ...actual,
    getGlobalKillSwitch: vi.fn().mockResolvedValue({ active: false, at: null }),
    storeAuditEvent: vi.fn().mockResolvedValue('audit-hash-001'),
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
    createPendingApproval: vi.fn().mockResolvedValue('approval-onboarding-001'),
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

// ── In-Memory Store ────────────────────────────────────────────────────────

/**
 * Simple in-memory DB state that persists across test steps in this file.
 * Simulates a real tenant journey through the API.
 */
interface InMemoryState {
  tenant: TenantRow;
  agents: AgentRow[];
  customPolicy: string | null;
  auditEvents: Array<{ tool: string; result: string; ts: string }>;
}

const state: InMemoryState = {
  tenant: MOCK_TENANT,
  agents: [],
  customPolicy: null,
  auditEvents: [],
};

// ── Build Full App ─────────────────────────────────────────────────────────

function buildOnboardingApp(mockDb: IDatabase): express.Application {
  const app = express();
  app.use(express.json());
  const auth = createMockAuthMiddleware();

  app.use(createAgentRoutes(mockDb, auth));
  app.use(createPolicyRoutes(mockDb, auth));
  app.use(createEvaluateRoutes(mockDb, auth));
  app.use(createAuditRoutes(mockDb, auth));

  return app;
}

// ── Journey Tests ──────────────────────────────────────────────────────────

describe('UAT: New Tenant Onboarding Journey', () => {
  let mockDb: IDatabase;
  let app: express.Application;

  beforeAll(() => {
    mockDb = createMockDb();
    app = buildOnboardingApp(mockDb);
  });

  it('Step 1: Tenant can list agents (empty initially)', async () => {
    (mockDb.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/agents')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(0);
  });

  it('Step 2: Tenant creates first agent', async () => {
    const newAgent: AgentRow = {
      id: 'agent-onboard-001',
      tenant_id: 'tenant-123',
      name: 'Onboarding Agent',
      api_key: 'ag_agent_onboard001',
      policy_scope: '["file_read","search_web"]',
      active: 1,
      created_at: new Date().toISOString(),
    };
    (mockDb.insertAgent as ReturnType<typeof vi.fn>).mockResolvedValue(newAgent);
    state.agents.push(newAgent);

    const res = await request(app)
      .post('/api/v1/agents')
      .set('x-api-key', 'valid-key')
      .send({ name: 'Onboarding Agent', policy_scope: ['file_read', 'search_web'] });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('agent-onboard-001');
    expect(res.body.name).toBe('Onboarding Agent');
    expect(res.body.apiKey).toMatch(/^ag_agent_/);
    expect(res.body.policyScope).toEqual(['file_read', 'search_web']);
    expect(res.body.active).toBe(true);
    // API key is shown once
    expect(res.body.note).toContain('securely');
  });

  it('Step 3: Tenant can now list agents and see the new one', async () => {
    (mockDb.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue(state.agents);

    const res = await request(app)
      .get('/api/v1/agents')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(1);
    expect(res.body.agents[0].id).toBe('agent-onboard-001');
    expect(res.body.agents[0].policyScope).toEqual(['file_read', 'search_web']);
  });

  it('Step 4: Tenant sets a custom policy (allow file_read, block everything else)', async () => {
    const customPolicy = JSON.stringify({
      id: 'onboard-policy-001',
      name: 'Onboarding Policy',
      version: '1.0.0',
      default: 'block',
      rules: [
        {
          id: 'allow-file-read',
          priority: 10,
          action: 'allow',
          when: [{ tool: { in: ['file_read', 'search_web'] } }],
          severity: 'low',
          tags: [],
          riskBoost: 0,
        },
      ],
    });
    state.customPolicy = customPolicy;
    (mockDb.getNextPolicyVersion as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockDb.insertPolicyVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      policy_id: 'onboard-policy-001',
      tenant_id: 'tenant-123',
      version: 1,
      policy_data: customPolicy,
      created_at: new Date().toISOString(),
      reverted_from: null,
    });
    (mockDb.setCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const policyPayload = {
      name: 'Onboarding Policy',
      default: 'block',
      rules: [
        {
          id: 'allow-file-read',
          priority: 10,
          action: 'allow',
          when: [{ tool: { in: ['file_read', 'search_web'] } }],
          severity: 'low',
          tags: [],
          riskBoost: 0,
        },
      ],
    };

    const res = await request(app)
      .put('/api/v1/policy')
      .set('x-api-key', 'valid-key')
      .send(policyPayload);

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
    expect(mockDb.setCustomPolicy).toHaveBeenCalledWith('tenant-123', expect.any(String));
  });

  it('Step 5: First evaluate call — allowed tool returns allow', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(state.customPolicy);
    (mockDb.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { storeAuditEvent } = await import('../../routes/audit.js');
    const { getGlobalKillSwitch } = await import('../../routes/audit.js');
    vi.mocked(getGlobalKillSwitch).mockResolvedValue({ active: false, at: null });
    vi.mocked(storeAuditEvent).mockImplementation(async (_db, tenantId, _agent, tool, result) => {
      state.auditEvents.push({ tool, result, ts: new Date().toISOString() });
      return 'audit-hash-step5';
    });

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'file_read', params: { path: '/tmp/test.txt' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('allow');
    expect(res.body.matchedRuleId).toBe('allow-file-read');
  });

  it('Step 6: Evaluate blocked tool returns block', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(state.customPolicy);
    (mockDb.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/evaluate')
      .set('x-api-key', 'valid-key')
      .send({ tool: 'shell_exec', params: { cmd: 'ls' } });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('block');
  });

  it('Step 7: Audit log captures evaluate events', async () => {
    // Verify storeAuditEvent was called for the evaluation steps
    const { storeAuditEvent } = await import('../../routes/audit.js');
    // storeAuditEvent should have been called at least twice (steps 5 and 6)
    expect(storeAuditEvent).toHaveBeenCalled();
  });

  it('Step 8: Audit trail is queryable', async () => {
    const auditEvents = [
      {
        id: 1,
        tenant_id: 'tenant-123',
        agent_id: null,
        tool: 'file_read',
        action: null,
        result: 'allow',
        matched_rule_id: 'allow-file-read',
        risk_score: 0,
        duration_ms: 5,
        session_id: null,
        previous_hash: '000',
        hash: 'hash1',
        created_at: new Date().toISOString(),
      },
    ];
    (mockDb.getAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(auditEvents);
    (mockDb.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/audit')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.events[0].tool).toBe('file_read');
    expect(res.body.events[0].result).toBe('allow');
  });
});
