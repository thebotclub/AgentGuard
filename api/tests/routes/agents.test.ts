/**
 * Tests for Agent CRUD routes:
 *   POST   /api/v1/agents        — create agent
 *   GET    /api/v1/agents        — list agents
 *   GET    /api/v1/agents/:id    — get single agent
 *   DELETE /api/v1/agents/:id    — deactivate agent
 *
 * Covers: happy path, auth failures, validation, 404, 409 duplicate, 500 errors
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createAgentRoutes } from '../../routes/agents.js';
import { createMockDb, MOCK_AGENT } from '../helpers/mock-db.js';
import { buildApp } from '../helpers/create-app.js';
import type { IDatabase } from '../../db-interface.js';

describe('POST /api/v1/agents', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createAgentRoutes, mockDb);
  });

  it('creates an agent and returns 201 with api key', async () => {
    (mockDb.insertAgent as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

    const res = await request(app)
      .post('/api/v1/agents')
      .set('x-api-key', 'valid-key')
      .send({ name: 'My Agent' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(MOCK_AGENT.id);
    expect(res.body.name).toBe(MOCK_AGENT.name);
    // apiKey should start with ag_agent_ (generated fresh, not the stored one)
    expect(res.body.apiKey).toMatch(/^ag_agent_/);
    expect(res.body.note).toContain('securely');
    expect(res.body.active).toBe(true);
  });

  it('creates agent with policy_scope', async () => {
    const agentWithScope = { ...MOCK_AGENT, policy_scope: '["file_read","file_write"]' };
    (mockDb.insertAgent as ReturnType<typeof vi.fn>).mockResolvedValue(agentWithScope);

    const res = await request(app)
      .post('/api/v1/agents')
      .set('x-api-key', 'valid-key')
      .send({ name: 'Scoped Agent', policy_scope: ['file_read', 'file_write'] });

    expect(res.status).toBe(201);
    expect(res.body.policyScope).toEqual(['file_read', 'file_write']);
  });

  it('returns 401 when no API key provided', async () => {
    const res = await request(app)
      .post('/api/v1/agents')
      .send({ name: 'My Agent' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when agent key used (privilege escalation guard)', async () => {
    const res = await request(app)
      .post('/api/v1/agents')
      .set('x-api-key', 'ag_agent_somekey')
      .send({ name: 'My Agent' });

    expect(res.status).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/v1/agents')
      .set('x-api-key', 'valid-key')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when name is empty string', async () => {
    const res = await request(app)
      .post('/api/v1/agents')
      .set('x-api-key', 'valid-key')
      .send({ name: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when name contains invalid characters (XSS attempt)', async () => {
    const res = await request(app)
      .post('/api/v1/agents')
      .set('x-api-key', 'valid-key')
      .send({ name: '<script>alert(1)</script>' });

    expect(res.status).toBe(400);
  });

  it('returns 409 when agent name already exists (UNIQUE constraint)', async () => {
    (mockDb.insertAgent as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('UNIQUE constraint failed: agents.name'),
    );

    const res = await request(app)
      .post('/api/v1/agents')
      .set('x-api-key', 'valid-key')
      .send({ name: 'Existing Agent' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('returns 409 on PostgreSQL duplicate key error', async () => {
    (mockDb.insertAgent as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('duplicate key value violates unique constraint'),
    );

    const res = await request(app)
      .post('/api/v1/agents')
      .set('x-api-key', 'valid-key')
      .send({ name: 'Existing Agent' });

    expect(res.status).toBe(409);
  });

  it('returns 500 on unexpected database error', async () => {
    (mockDb.insertAgent as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('disk full'),
    );

    const res = await request(app)
      .post('/api/v1/agents')
      .set('x-api-key', 'valid-key')
      .send({ name: 'New Agent' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create agent');
  });
});

describe('GET /api/v1/agents', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createAgentRoutes, mockDb);
  });

  it('returns list of agents for authenticated tenant', async () => {
    (mockDb.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_AGENT]);

    const res = await request(app)
      .get('/api/v1/agents')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(res.body.agents).toHaveLength(1);
    expect(res.body.agents[0].id).toBe(MOCK_AGENT.id);
    expect(res.body.agents[0].name).toBe(MOCK_AGENT.name);
    // API keys must NOT be exposed in list endpoint
    expect(res.body.agents[0]).not.toHaveProperty('apiKey');
    expect(res.body.agents[0]).not.toHaveProperty('api_key');
  });

  it('returns empty list when tenant has no agents', async () => {
    (mockDb.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/agents')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(0);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/agents');
    expect(res.status).toBe(401);
  });

  it('returns 403 when agent key used for tenant admin operation', async () => {
    const res = await request(app)
      .get('/api/v1/agents')
      .set('x-api-key', 'ag_agent_somekey');

    expect(res.status).toBe(403);
  });

  it('maps active field from integer to boolean', async () => {
    (mockDb.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...MOCK_AGENT, active: 1 },
      { ...MOCK_AGENT, id: 'agent-inactive', active: 0 },
    ]);

    const res = await request(app)
      .get('/api/v1/agents')
      .set('x-api-key', 'valid-key');

    expect(res.body.agents[0].active).toBe(true);
    expect(res.body.agents[1].active).toBe(false);
  });
});

describe('GET /api/v1/agents/:id', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createAgentRoutes, mockDb);
  });

  it('returns agent details for valid id', async () => {
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

    const res = await request(app)
      .get(`/api/v1/agents/${MOCK_AGENT.id}`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(MOCK_AGENT.id);
    expect(res.body.tenantId).toBe(MOCK_AGENT.tenant_id);
    expect(res.body.name).toBe(MOCK_AGENT.name);
    // API key must NOT be exposed
    expect(res.body).not.toHaveProperty('apiKey');
    expect(res.body).not.toHaveProperty('api_key');
  });

  it('returns 404 when agent not found', async () => {
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .get('/api/v1/agents/nonexistent-id')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/agents/agent-456');
    expect(res.status).toBe(401);
  });

  it('only returns agents belonging to the authenticated tenant', async () => {
    // getAgentById is called with tenantId to ensure isolation
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await request(app)
      .get('/api/v1/agents/agent-from-other-tenant')
      .set('x-api-key', 'valid-key');

    expect(mockDb.getAgentById).toHaveBeenCalledWith('agent-from-other-tenant', 'tenant-123');
  });
});

describe('DELETE /api/v1/agents/:id', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createAgentRoutes, mockDb);
  });

  it('deactivates agent and returns confirmation', async () => {
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
    (mockDb.deactivateAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/v1/agents/${MOCK_AGENT.id}`)
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(MOCK_AGENT.id);
    expect(res.body.deactivated).toBe(true);
  });

  it('returns 404 when trying to delete non-existent agent', async () => {
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/v1/agents/nonexistent')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
    expect(mockDb.deactivateAgent).not.toHaveBeenCalled();
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).delete('/api/v1/agents/agent-456');
    expect(res.status).toBe(401);
  });

  it('calls deactivateAgent with correct id and tenantId', async () => {
    (mockDb.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

    await request(app)
      .delete(`/api/v1/agents/${MOCK_AGENT.id}`)
      .set('x-api-key', 'valid-key');

    expect(mockDb.deactivateAgent).toHaveBeenCalledWith(MOCK_AGENT.id, 'tenant-123');
  });
});
