/**
 * Tests for Agent Hierarchy routes — A2A Multi-Agent Policy Propagation
 *
 * POST   /api/v1/agents/:agentId/children  — spawn child agent
 * GET    /api/v1/agents/:agentId/children  — list child agents
 * DELETE /api/v1/agents/:agentId/children/:childId — revoke child
 *
 * Security-critical: child agents must inherit parent's policy monotonically
 * (can only become MORE restrictive, never less).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createAgentHierarchyRoutes } from '../../routes/agent-hierarchy.js';
import { createMockDb, MOCK_AGENT } from '../helpers/mock-db.js';
import { buildApp } from '../helpers/create-app.js';
import type { IDatabase, ChildAgentRow, AgentRow } from '../../db-interface.js';

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock('../../middleware/feature-gate.js', () => ({
  requireFeature: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLimit: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../lib/policy-inheritance.js', () => ({
  computeChildPolicy: vi.fn((parent: unknown, child: unknown) => {
    // Simple mock: return child restrictions merged with parent
    const p = parent as Record<string, unknown>;
    const c = child as Record<string, unknown>;
    return {
      allowedTools: c['allowedTools'] ?? p['allowedTools'] ?? [],
      blockedTools: [...(p['blockedTools'] ?? []) as string[], ...((c['blockedTools'] ?? []) as string[])],
      hitlTools: [...(p['hitlTools'] ?? []) as string[], ...((c['hitlTools'] ?? []) as string[])],
    };
  }),
  evaluateToolAgainstPolicy: vi.fn().mockReturnValue({ allowed: true, reason: null }),
}));

// ── Test fixtures ──────────────────────────────────────────────────────────

const MOCK_CHILD_AGENT: AgentRow = {
  id: 'child-agent-001',
  tenant_id: 'tenant-123',
  name: 'Test Child Agent',
  api_key: 'ag_agent_child001',
  policy_scope: JSON.stringify({ allowedTools: ['file_read'], blockedTools: ['shell_exec'] }),
  active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_CHILD_HIERARCHY_ROW: ChildAgentRow = {
  id: 'hierarchy-001',
  parent_agent_id: MOCK_AGENT.id,
  child_agent_id: 'child-agent-001',
  tenant_id: 'tenant-123',
  policy_snapshot: JSON.stringify({ allowedTools: ['file_read'], blockedTools: ['shell_exec'] }),
  ttl_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  max_tool_calls: 100,
  tool_calls_used: 0,
  created_at: '2024-01-01T00:00:00.000Z',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildHierarchyApp(db: IDatabase) {
  return buildApp(createAgentHierarchyRoutes, db);
}

// ── POST /api/v1/agents/:agentId/children — spawn child ───────────────────

describe('POST /api/v1/agents/:agentId/children — authentication', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('returns 401 when no API key is provided', async () => {
    const app = buildHierarchyApp(mockDb);
    const res = await request(app)
      .post(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .send({ name: 'Child Agent' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when an agent key is used (agents cannot create child agents via tenant endpoint)', async () => {
    const app = buildHierarchyApp(mockDb);
    const res = await request(app)
      .post(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'ag_agent_somekey')
      .send({ name: 'Child Agent' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/agents/:agentId/children — happy path', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
    (mockDb.insertAgent as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CHILD_AGENT);
    (mockDb.insertChildAgent as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CHILD_HIERARCHY_ROW);
  });

  it('spawns a child agent with default TTL (24h) when not specified', async () => {
    const app = buildHierarchyApp(mockDb);
    const res = await request(app)
      .post(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'valid-key')
      .send({ name: 'Test Child Agent' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.parentAgentId).toBe(MOCK_AGENT.id);
    expect(res.body.apiKey).toBeTruthy();
    expect(res.body.apiKey).toMatch(/^ag_agent_/);
    // API key must be present in the response (shown only once)
    expect(res.body.note).toContain('not be shown again');
  });

  it('spawns a child agent with custom tool restrictions', async () => {
    const app = buildHierarchyApp(mockDb);
    const res = await request(app)
      .post(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'valid-key')
      .send({
        name: 'Restricted Child',
        allowedTools: ['file_read', 'search_web'],
        blockedTools: ['shell_exec', 'file_delete'],
        ttlMinutes: 60,
        maxToolCalls: 50,
      });

    expect(res.status).toBe(201);
    expect(res.body.ttlExpiresAt).toBeTruthy();
    expect(res.body.maxToolCalls).toBe(100); // from mock hierarchy row
  });

  it('inserts the child into the hierarchy table with correct parent reference', async () => {
    const app = buildHierarchyApp(mockDb);
    await request(app)
      .post(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'valid-key')
      .send({ name: 'Test Child Agent' });

    expect(mockDb.insertChildAgent).toHaveBeenCalledWith(
      expect.any(String),    // hierarchyId
      MOCK_AGENT.id,         // parentAgentId
      MOCK_CHILD_AGENT.id,   // childAgentId
      'tenant-123',          // tenantId
      expect.any(String),    // policy snapshot JSON
      expect.any(String),    // ttl_expires_at
      null,                  // maxToolCalls (not provided)
    );
  });
});

describe('POST /api/v1/agents/:agentId/children — validation', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
  });

  it('returns 400 when name is missing', async () => {
    const app = buildHierarchyApp(mockDb);
    const res = await request(app)
      .post(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'valid-key')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when name is empty string', async () => {
    const app = buildHierarchyApp(mockDb);
    const res = await request(app)
      .post(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'valid-key')
      .send({ name: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when name exceeds 200 chars', async () => {
    const app = buildHierarchyApp(mockDb);
    const res = await request(app)
      .post(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'valid-key')
      .send({ name: 'a'.repeat(201) });

    expect(res.status).toBe(400);
  });

  it('returns 404 when parent agent does not belong to this tenant', async () => {
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const app = buildHierarchyApp(mockDb);

    const res = await request(app)
      .post('/api/v1/agents/nonexistent-agent/children')
      .set('x-api-key', 'valid-key')
      .send({ name: 'Test Child' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('returns 400 when parent agent is inactive', async () => {
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_AGENT,
      active: 0,
    });
    const app = buildHierarchyApp(mockDb);

    const res = await request(app)
      .post(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'valid-key')
      .send({ name: 'Test Child' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('inactive');
  });
});

// ── GET /api/v1/agents/:agentId/children — list ───────────────────────────

describe('GET /api/v1/agents/:agentId/children', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
  });

  it('returns 401 when not authenticated', async () => {
    const app = buildHierarchyApp(mockDb);
    const res = await request(app).get(`/api/v1/agents/${MOCK_AGENT.id}/children`);
    expect(res.status).toBe(401);
  });

  it('returns empty children list when no children exist', async () => {
    (mockDb.listChildAgents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const app = buildHierarchyApp(mockDb);

    const res = await request(app)
      .get(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.parentAgentId).toBe(MOCK_AGENT.id);
    expect(Array.isArray(res.body.children)).toBe(true);
    expect(res.body.children).toHaveLength(0);
  });

  it('returns children with correct status (active/expired/budget_exceeded)', async () => {
    const expiredChild: ChildAgentRow = {
      ...MOCK_CHILD_HIERARCHY_ROW,
      ttl_expires_at: new Date(Date.now() - 1000).toISOString(), // expired
    };
    const budgetChild: ChildAgentRow = {
      ...MOCK_CHILD_HIERARCHY_ROW,
      id: 'hierarchy-002',
      child_agent_id: 'child-002',
      max_tool_calls: 10,
      tool_calls_used: 10, // exhausted
      ttl_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
    const activeChild: ChildAgentRow = {
      ...MOCK_CHILD_HIERARCHY_ROW,
      id: 'hierarchy-003',
      child_agent_id: 'child-003',
    };

    (mockDb.listChildAgents as ReturnType<typeof vi.fn>).mockResolvedValue([
      expiredChild, budgetChild, activeChild,
    ]);

    const app = buildHierarchyApp(mockDb);
    const res = await request(app)
      .get(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.children).toHaveLength(3);
    expect(res.body.children[0].status).toBe('expired');
    expect(res.body.children[1].status).toBe('budget_exceeded');
    expect(res.body.children[2].status).toBe('active');
  });

  it('returns 404 when parent agent not found', async () => {
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const app = buildHierarchyApp(mockDb);

    const res = await request(app)
      .get('/api/v1/agents/nonexistent/children')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/v1/agents/:agentId/children/:childId — revoke ─────────────

describe('DELETE /api/v1/agents/:agentId/children/:childId', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
    (mockDb.getChildAgent as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CHILD_HIERARCHY_ROW);
  });

  it('returns 401 without auth', async () => {
    const app = buildHierarchyApp(mockDb);
    const res = await request(app).delete(
      `/api/v1/agents/${MOCK_AGENT.id}/children/child-agent-001`,
    );
    expect(res.status).toBe(401);
  });

  it('revokes a child agent successfully', async () => {
    const app = buildHierarchyApp(mockDb);
    const res = await request(app)
      .delete(`/api/v1/agents/${MOCK_AGENT.id}/children/child-agent-001`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(true);
    expect(res.body.childAgentId).toBe('child-agent-001');
    expect(mockDb.deactivateAgent).toHaveBeenCalledWith('child-agent-001', 'tenant-123');
    expect(mockDb.deleteChildAgent).toHaveBeenCalledWith('child-agent-001', 'tenant-123');
  });

  it('returns 404 when child does not exist', async () => {
    (mockDb.getChildAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const app = buildHierarchyApp(mockDb);

    const res = await request(app)
      .delete(`/api/v1/agents/${MOCK_AGENT.id}/children/nonexistent-child`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
  });

  it('returns 404 when child belongs to a different parent (prevents cross-tenant access)', async () => {
    (mockDb.getChildAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_CHILD_HIERARCHY_ROW,
      parent_agent_id: 'different-parent-agent', // not the requested parent
    });
    const app = buildHierarchyApp(mockDb);

    const res = await request(app)
      .delete(`/api/v1/agents/${MOCK_AGENT.id}/children/child-agent-001`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
  });
});

// ── Policy inheritance edge cases ──────────────────────────────────────────

describe('Agent hierarchy — monotonic policy restriction', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('child inherits parent blocked tools even if not specified', async () => {
    // Parent has blocked tools
    const parentWithPolicy: AgentRow = {
      ...MOCK_AGENT,
      policy_scope: JSON.stringify({ blockedTools: ['shell_exec', 'file_delete'] }),
    };
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(parentWithPolicy);
    (mockDb.insertAgent as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CHILD_AGENT);
    (mockDb.insertChildAgent as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CHILD_HIERARCHY_ROW);

    const { computeChildPolicy } = await import('../../lib/policy-inheritance.js');
    const app = buildHierarchyApp(mockDb);

    await request(app)
      .post(`/api/v1/agents/${MOCK_AGENT.id}/children`)
      .set('x-api-key', 'valid-key')
      .send({ name: 'Child with inherited policy' });

    // computeChildPolicy must be called with the parent's policy
    expect(computeChildPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ blockedTools: ['shell_exec', 'file_delete'] }),
      expect.any(Object),
    );
  });
});
