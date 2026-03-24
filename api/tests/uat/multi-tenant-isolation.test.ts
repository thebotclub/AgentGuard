/**
 * UAT: Multi-Tenant Isolation
 *
 * Verifies that tenant A cannot access tenant B's resources:
 * 1. Agents: Tenant A cannot see tenant B's agents
 * 2. Audit events: Tenant A cannot see tenant B's audit trail
 * 3. Policies: Tenant A cannot see or modify tenant B's policies
 * 4. Approvals: Tenant A cannot see or resolve tenant B's approvals
 *
 * Uses two separate mock auth contexts to simulate two different tenants.
 */
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { IDatabase, AgentRow, TenantRow, ApprovalRow } from '../../db-interface.js';
import { createAgentRoutes } from '../../routes/agents.js';
import { createPolicyRoutes } from '../../routes/policy.js';
import { createAuditRoutes } from '../../routes/audit.js';
import { createApprovalRoutes } from '../../routes/approvals.js';
import { createMockDb } from '../helpers/mock-db.js';
import type { AuthMiddleware } from '../../middleware/auth.js';

vi.mock('../../lib/redis-pubsub.js', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Tenant Fixtures ───────────────────────────────────────────────────────

const TENANT_A: TenantRow = {
  id: 'tenant-aaa',
  name: 'Tenant A',
  email: 'a@example.com',
  plan: 'pro',
  created_at: '2024-01-01T00:00:00.000Z',
  kill_switch_active: 0,
  kill_switch_at: null,
};

const TENANT_B: TenantRow = {
  id: 'tenant-bbb',
  name: 'Tenant B',
  email: 'b@example.com',
  plan: 'starter',
  created_at: '2024-01-01T00:00:00.000Z',
  kill_switch_active: 0,
  kill_switch_at: null,
};

const AGENT_A: AgentRow = {
  id: 'agent-aaa-001',
  tenant_id: 'tenant-aaa',
  name: 'Agent A1',
  api_key: 'ag_agent_aaa001',
  policy_scope: '[]',
  active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
};

const AGENT_B: AgentRow = {
  id: 'agent-bbb-001',
  tenant_id: 'tenant-bbb',
  name: 'Agent B1',
  api_key: 'ag_agent_bbb001',
  policy_scope: '[]',
  active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
};

const APPROVAL_A: ApprovalRow = {
  id: 'approval-aaa-001',
  tenant_id: 'tenant-aaa',
  agent_id: null,
  tool: 'file_delete',
  params_json: null,
  status: 'pending',
  created_at: '2024-01-01T00:00:00.000Z',
  resolved_at: null,
  resolved_by: null,
};

const APPROVAL_B: ApprovalRow = {
  id: 'approval-bbb-001',
  tenant_id: 'tenant-bbb',
  agent_id: null,
  tool: 'db_drop',
  params_json: null,
  status: 'pending',
  created_at: '2024-01-01T00:00:00.000Z',
  resolved_at: null,
  resolved_by: null,
};

// ── Mock Auth that switches between tenants ────────────────────────────────

function createDualTenantAuth(tenantId: string, tenant: TenantRow): AuthMiddleware {
  return {
    requireTenantAuth: async (req, _res, next) => {
      req.tenantId = tenantId;
      req.tenant = tenant;
      req.agent = null;
      next();
    },
    requireEvaluateAuth: async (req, _res, next) => {
      req.tenantId = tenantId;
      req.tenant = tenant;
      req.agent = null;
      next();
    },
    optionalTenantAuth: async (req, _res, next) => {
      req.tenantId = tenantId;
      req.tenant = tenant;
      req.agent = null;
      next();
    },
    requireAdminAuth: (_req, res, _next) => {
      res.status(401).json({ error: 'unauthorized' });
    },
  };
}

// ── Build isolated apps per tenant ────────────────────────────────────────

function buildTenantApp(db: IDatabase, tenantId: string, tenant: TenantRow): express.Application {
  const app = express();
  app.use(express.json());
  const auth = createDualTenantAuth(tenantId, tenant);
  app.use(createAgentRoutes(db, auth));
  app.use(createPolicyRoutes(db, auth));
  app.use(createAuditRoutes(db, auth));
  app.use(createApprovalRoutes(db, auth));
  return app;
}

// ── Agent Isolation ───────────────────────────────────────────────────────

describe('UAT: Multi-Tenant Isolation — Agents', () => {
  it('Tenant A can only see its own agents', async () => {
    const mockDb = createMockDb();

    (mockDb.getAgentsByTenant as ReturnType<typeof vi.fn>).mockImplementation(
      async (tenantId: string) => {
        if (tenantId === 'tenant-aaa') return [AGENT_A];
        if (tenantId === 'tenant-bbb') return [AGENT_B];
        return [];
      },
    );

    const appA = buildTenantApp(mockDb, 'tenant-aaa', TENANT_A);
    const appB = buildTenantApp(mockDb, 'tenant-bbb', TENANT_B);

    const resA = await request(appA).get('/api/v1/agents');
    expect(resA.status).toBe(200);
    expect(resA.body.agents).toHaveLength(1);
    expect(resA.body.agents[0].id).toBe('agent-aaa-001');

    const resB = await request(appB).get('/api/v1/agents');
    expect(resB.status).toBe(200);
    expect(resB.body.agents).toHaveLength(1);
    expect(resB.body.agents[0].id).toBe('agent-bbb-001');
  });

  it('Tenant A cannot access Tenant B agent by ID', async () => {
    const mockDb = createMockDb();

    // getAgentById with tenantId scoping — Tenant A cannot see Tenant B's agent
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string, tenantId: string) => {
        if (id === 'agent-aaa-001' && tenantId === 'tenant-aaa') return AGENT_A;
        if (id === 'agent-bbb-001' && tenantId === 'tenant-bbb') return AGENT_B;
        return undefined; // Cross-tenant access returns undefined
      },
    );

    const appA = buildTenantApp(mockDb, 'tenant-aaa', TENANT_A);

    // Tenant A tries to get Tenant B's agent
    const res = await request(appA).get('/api/v1/agents/agent-bbb-001');
    expect(res.status).toBe(404); // Should not be found
  });

  it('Tenant A deactivation cannot affect Tenant B agents', async () => {
    const mockDb = createMockDb();

    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string, tenantId: string) => {
        if (id === 'agent-bbb-001' && tenantId === 'tenant-aaa') return undefined;
        return undefined;
      },
    );

    const appA = buildTenantApp(mockDb, 'tenant-aaa', TENANT_A);

    const res = await request(appA).delete('/api/v1/agents/agent-bbb-001');
    expect(res.status).toBe(404);
    expect(mockDb.deactivateAgent).not.toHaveBeenCalled();
  });
});

// ── Audit Log Isolation ───────────────────────────────────────────────────

describe('UAT: Multi-Tenant Isolation — Audit', () => {
  it('Tenant A can only see its own audit events', async () => {
    const mockDb = createMockDb();

    const eventsA = [
      { id: 1, tenant_id: 'tenant-aaa', tool: 'file_read', result: 'allow', created_at: '2024-01-01T00:00:00.000Z', previous_hash: '000', hash: 'h1' },
    ];
    const eventsB = [
      { id: 2, tenant_id: 'tenant-bbb', tool: 'shell_exec', result: 'block', created_at: '2024-01-01T00:00:01.000Z', previous_hash: '000', hash: 'h2' },
      { id: 3, tenant_id: 'tenant-bbb', tool: 'db_query', result: 'allow', created_at: '2024-01-01T00:00:02.000Z', previous_hash: 'h2', hash: 'h3' },
    ];

    (mockDb.getAuditEvents as ReturnType<typeof vi.fn>).mockImplementation(
      async (tenantId: string) => {
        if (tenantId === 'tenant-aaa') return eventsA;
        if (tenantId === 'tenant-bbb') return eventsB;
        return [];
      },
    );

    (mockDb.countAuditEvents as ReturnType<typeof vi.fn>).mockImplementation(
      async (tenantId: string) => {
        if (tenantId === 'tenant-aaa') return 1;
        if (tenantId === 'tenant-bbb') return 2;
        return 0;
      },
    );

    const appA = buildTenantApp(mockDb, 'tenant-aaa', TENANT_A);
    const appB = buildTenantApp(mockDb, 'tenant-bbb', TENANT_B);

    const resA = await request(appA).get('/api/v1/audit');
    expect(resA.status).toBe(200);
    expect(resA.body.total).toBe(1);
    expect(resA.body.events).toHaveLength(1);
    expect(resA.body.events[0].tool).toBe('file_read');

    const resB = await request(appB).get('/api/v1/audit');
    expect(resB.status).toBe(200);
    expect(resB.body.total).toBe(2);
    expect(resB.body.events).toHaveLength(2);
  });

  it('Tenant A export cannot see Tenant B events', async () => {
    const mockDb = createMockDb();

    (mockDb.getAllAuditEvents as ReturnType<typeof vi.fn>).mockImplementation(
      async (tenantId: string) => {
        if (tenantId === 'tenant-aaa') return [
          { id: 1, tenant_id: 'tenant-aaa', tool: 'file_read', result: 'allow', action: null, created_at: '2024-01-01T00:00:00.000Z', agent_id: null, previous_hash: '000', hash: 'h1' },
        ];
        if (tenantId === 'tenant-bbb') return [
          { id: 2, tenant_id: 'tenant-bbb', tool: 'shell_exec', result: 'block', action: null, created_at: '2024-01-01T00:00:01.000Z', agent_id: null, previous_hash: '000', hash: 'h2' },
        ];
        return [];
      },
    );

    const appA = buildTenantApp(mockDb, 'tenant-aaa', TENANT_A);

    const res = await request(appA).get('/api/v1/audit/export?format=json');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tool).toBe('file_read');
    // Should NOT contain Tenant B's data
    expect(res.body.some((e: { tool: string }) => e.tool === 'shell_exec')).toBe(false);
  });
});

// ── Policy Isolation ──────────────────────────────────────────────────────

describe('UAT: Multi-Tenant Isolation — Policy', () => {
  it('Tenant A sees its own custom policy, not Tenant B\'s', async () => {
    const mockDb = createMockDb();

    const policyA = JSON.stringify({
      id: 'policy-a', name: 'Policy A', version: '1.0.0', default: 'allow', rules: [],
    });
    const policyB = JSON.stringify({
      id: 'policy-b', name: 'Policy B', version: '1.0.0', default: 'block', rules: [],
    });

    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockImplementation(
      async (tenantId: string) => {
        if (tenantId === 'tenant-aaa') return policyA;
        if (tenantId === 'tenant-bbb') return policyB;
        return null;
      },
    );

    const appA = buildTenantApp(mockDb, 'tenant-aaa', TENANT_A);
    const appB = buildTenantApp(mockDb, 'tenant-bbb', TENANT_B);

    const resA = await request(appA).get('/api/v1/policy');
    expect(resA.status).toBe(200);
    expect(resA.body.policy.id).toBe('policy-a');
    expect(resA.body.policy.default).toBe('allow');

    const resB = await request(appB).get('/api/v1/policy');
    expect(resB.status).toBe(200);
    expect(resB.body.policy.id).toBe('policy-b');
    expect(resB.body.policy.default).toBe('block');
  });

  it('Tenant A setting policy does not affect Tenant B', async () => {
    const mockDb = createMockDb();

    let policyA: string | null = null;
    let policyB: string | null = null;

    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockImplementation(
      async (tenantId: string) => {
        if (tenantId === 'tenant-aaa') return policyA;
        if (tenantId === 'tenant-bbb') return policyB;
        return null;
      },
    );

    (mockDb.setCustomPolicy as ReturnType<typeof vi.fn>).mockImplementation(
      async (tenantId: string, policy: string) => {
        if (tenantId === 'tenant-aaa') policyA = policy;
        if (tenantId === 'tenant-bbb') policyB = policy;
      },
    );

    (mockDb.getNextPolicyVersion as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockDb.insertPolicyVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1, policy_id: 'p1', tenant_id: 'tenant-aaa', version: 1, policy_data: '{}', created_at: '2024-01-01T00:00:00.000Z', reverted_from: null,
    });

    const appA = buildTenantApp(mockDb, 'tenant-aaa', TENANT_A);
    const appB = buildTenantApp(mockDb, 'tenant-bbb', TENANT_B);

    // Tenant A sets a policy
    const resSet = await request(appA)
      .put('/api/v1/policy')
      .send({
        name: 'A Custom Policy',
        default: 'allow',
        rules: [],
      });
    expect(resSet.status).toBe(200);

    // Tenant B's policy is still null (default)
    const resB = await request(appB).get('/api/v1/policy');
    expect(resB.status).toBe(200);
    expect(resB.body.isCustom).toBe(false); // Tenant B still has default policy
  });
});

// ── Approval Isolation ────────────────────────────────────────────────────

describe('UAT: Multi-Tenant Isolation — Approvals', () => {
  it('Tenant A can only see its own approvals', async () => {
    const mockDb = createMockDb();

    (mockDb.listAllApprovals as ReturnType<typeof vi.fn>).mockImplementation(
      async (tenantId: string) => {
        if (tenantId === 'tenant-aaa') return [APPROVAL_A];
        if (tenantId === 'tenant-bbb') return [APPROVAL_B];
        return [];
      },
    );

    const appA = buildTenantApp(mockDb, 'tenant-aaa', TENANT_A);
    const appB = buildTenantApp(mockDb, 'tenant-bbb', TENANT_B);

    const resA = await request(appA).get('/api/v1/approvals');
    expect(resA.status).toBe(200);
    expect(resA.body.approvals).toHaveLength(1);
    expect(resA.body.approvals[0].id).toBe('approval-aaa-001');

    const resB = await request(appB).get('/api/v1/approvals');
    expect(resB.status).toBe(200);
    expect(resB.body.approvals).toHaveLength(1);
    expect(resB.body.approvals[0].id).toBe('approval-bbb-001');
  });

  it('Tenant A cannot approve Tenant B\'s approval', async () => {
    const mockDb = createMockDb();

    // getApproval is scoped by tenantId — cross-tenant returns undefined
    (mockDb.getApproval as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string, tenantId: string) => {
        if (id === 'approval-aaa-001' && tenantId === 'tenant-aaa') return APPROVAL_A;
        if (id === 'approval-bbb-001' && tenantId === 'tenant-bbb') return APPROVAL_B;
        // Cross-tenant access is denied (returns undefined)
        return undefined;
      },
    );

    // Tenant A tries to approve Tenant B's approval
    const appA = buildTenantApp(mockDb, 'tenant-aaa', TENANT_A);
    const res = await request(appA)
      .post('/api/v1/approvals/approval-bbb-001/approve');

    expect(res.status).toBe(404); // Not found for tenant A
    expect(mockDb.resolveApproval).not.toHaveBeenCalled();
  });

  it('Tenant A cannot deny Tenant B\'s approval', async () => {
    const mockDb = createMockDb();

    (mockDb.getApproval as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string, tenantId: string) => {
        if (id === 'approval-bbb-001' && tenantId === 'tenant-aaa') return undefined;
        return undefined;
      },
    );

    const appA = buildTenantApp(mockDb, 'tenant-aaa', TENANT_A);
    const res = await request(appA)
      .post('/api/v1/approvals/approval-bbb-001/deny');

    expect(res.status).toBe(404);
    expect(mockDb.resolveApproval).not.toHaveBeenCalled();
  });
});
