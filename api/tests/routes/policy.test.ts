/**
 * Tests for Policy Management Routes:
 *   GET  /api/v1/policy          — get effective policy
 *   PUT  /api/v1/policy          — replace policy
 *   POST /api/v1/policy/coverage — check tool coverage
 *   GET  /api/v1/policy/versions — list policy versions
 *
 * Covers: auth, validation, default policy fallback, invalid rules, coverage logic
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createPolicyRoutes } from '../../routes/policy.js';
import { createMockDb } from '../helpers/mock-db.js';
import { buildApp } from '../helpers/create-app.js';
import type { IDatabase } from '../../db-interface.js';

// Valid policy rule for testing
const VALID_RULE = {
  id: 'rule-allow-search',
  description: 'Allow web search',
  priority: 10,
  action: 'allow',
  when: [{ tool: { in: ['search_web'] } }],
  severity: 'low',
  tags: [],
  riskBoost: 0,
};

describe('GET /api/v1/policy', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createPolicyRoutes, mockDb);
  });

  it('returns the default policy when no custom policy is set', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/policy')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe('tenant-123');
    expect(res.body.isCustom).toBe(false);
    expect(res.body.policy).toBeTruthy();
    expect(Array.isArray(res.body.policy.rules)).toBe(true);
  });

  it('returns custom policy when one is configured', async () => {
    const customPolicy = JSON.stringify({
      id: 'custom-tenant-123',
      name: 'Custom Policy',
      version: '1.0.0',
      default: 'block',
      rules: [VALID_RULE],
    });
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(customPolicy);

    const res = await request(app)
      .get('/api/v1/policy')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.isCustom).toBe(true);
    expect(res.body.policy.rules).toHaveLength(1);
    expect(res.body.policy.rules[0].id).toBe(VALID_RULE.id);
  });

  it('returns default policy when stored custom policy is corrupt JSON', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue('{ invalid json ');

    const res = await request(app)
      .get('/api/v1/policy')
      .set('x-api-key', 'valid-key');

    // Should gracefully fall back to default policy
    expect(res.status).toBe(200);
    expect(res.body.policy).toBeTruthy();
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/policy');
    expect(res.status).toBe(401);
  });

  it('returns 403 when agent key used for tenant admin operation', async () => {
    const res = await request(app)
      .get('/api/v1/policy')
      .set('x-api-key', 'ag_agent_somekey');

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/policy', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createPolicyRoutes, mockDb);
  });

  it('saves a valid array of rules and returns confirmation', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/policy')
      .set('x-api-key', 'valid-key')
      .send([VALID_RULE]);

    expect(res.status).toBe(200);
    expect(res.body.ruleCount).toBe(1);
    expect(res.body.message).toBe('Policy updated successfully');
    expect(mockDb.setCustomPolicy).toHaveBeenCalledWith('tenant-123', expect.any(String));
  });

  it('accepts a full PolicyDocument object with rules array', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/policy')
      .set('x-api-key', 'valid-key')
      .send({ rules: [VALID_RULE] });

    expect(res.status).toBe(200);
    expect(res.body.ruleCount).toBe(1);
  });

  it('saves previous policy as a version before overwriting', async () => {
    const existingPolicy = JSON.stringify({ rules: [VALID_RULE] });
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(existingPolicy);

    await request(app)
      .put('/api/v1/policy')
      .set('x-api-key', 'valid-key')
      .send([VALID_RULE]);

    expect(mockDb.insertPolicyVersion).toHaveBeenCalledOnce();
  });

  it('does NOT save version when no existing policy', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await request(app)
      .put('/api/v1/policy')
      .set('x-api-key', 'valid-key')
      .send([VALID_RULE]);

    expect(mockDb.insertPolicyVersion).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not an array or PolicyDocument', async () => {
    const res = await request(app)
      .put('/api/v1/policy')
      .set('x-api-key', 'valid-key')
      .send({ notRules: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('array');
  });

  it('returns 400 when a rule is invalid (missing required fields)', async () => {
    const invalidRule = { id: 'bad-rule', action: 'allow' }; // missing required fields

    const res = await request(app)
      .put('/api/v1/policy')
      .set('x-api-key', 'valid-key')
      .send([invalidRule]);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('returns 400 when more than 500 rules are submitted', async () => {
    const rules = Array.from({ length: 501 }, (_, i) => ({ ...VALID_RULE, id: `rule-${i}` }));

    const res = await request(app)
      .put('/api/v1/policy')
      .set('x-api-key', 'valid-key')
      .send(rules);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('500');
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).put('/api/v1/policy').send([VALID_RULE]);
    expect(res.status).toBe(401);
  });

  it('returns 500 when database save fails', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockDb.setCustomPolicy as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk full'));

    const res = await request(app)
      .put('/api/v1/policy')
      .set('x-api-key', 'valid-key')
      .send([VALID_RULE]);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to save policy');
  });
});

describe('POST /api/v1/policy/coverage', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createPolicyRoutes, mockDb);
  });

  it('returns coverage analysis for given tool list', async () => {
    // Use default policy (no custom policy)
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/policy/coverage')
      .set('x-api-key', 'valid-key')
      .send({ tools: ['shell_exec', 'search_web', 'file_read'] });

    expect(res.status).toBe(200);
    expect(typeof res.body.coverage).toBe('number');
    expect(res.body.coverage).toBeGreaterThanOrEqual(0);
    expect(res.body.coverage).toBeLessThanOrEqual(100);
    expect(Array.isArray(res.body.covered)).toBe(true);
    expect(Array.isArray(res.body.uncovered)).toBe(true);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results).toHaveLength(3);
  });

  it('each result entry includes tool name, decision, and riskScore', async () => {
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/policy/coverage')
      .set('x-api-key', 'valid-key')
      .send({ tools: ['shell_exec'] });

    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.tool).toBe('shell_exec');
    expect(['allow', 'block', 'require_approval', 'monitor']).toContain(result.decision);
    expect(typeof result.riskScore).toBe('number');
  });

  it('returns 400 when tools array is missing', async () => {
    const res = await request(app)
      .post('/api/v1/policy/coverage')
      .set('x-api-key', 'valid-key')
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 when tools array is empty', async () => {
    const res = await request(app)
      .post('/api/v1/policy/coverage')
      .set('x-api-key', 'valid-key')
      .send({ tools: [] });

    expect(res.status).toBe(400);
  });

  it('returns 400 when more than 200 tools are submitted', async () => {
    const tools = Array.from({ length: 201 }, (_, i) => `tool_${i}`);

    const res = await request(app)
      .post('/api/v1/policy/coverage')
      .set('x-api-key', 'valid-key')
      .send({ tools });

    expect(res.status).toBe(400);
  });

  it('returns 100% coverage when all tools have matching rules', async () => {
    // Default policy blocks shell_exec
    (mockDb.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/policy/coverage')
      .set('x-api-key', 'valid-key')
      .send({ tools: ['shell_exec'] });

    // shell_exec is in the default blocked list
    expect(res.status).toBe(200);
    const shellResult = res.body.results.find((r: { tool: string }) => r.tool === 'shell_exec');
    expect(shellResult).toBeTruthy();
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/policy/coverage')
      .send({ tools: ['shell_exec'] });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/policy/versions', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createPolicyRoutes, mockDb);
  });

  it('returns list of policy versions', async () => {
    const versions = [
      {
        id: 1,
        policy_id: 'custom-tenant-123',
        tenant_id: 'tenant-123',
        version: 1,
        policy_data: '[]',
        created_at: '2024-01-01T00:00:00.000Z',
        reverted_from: null,
      },
    ];
    (mockDb.getPolicyVersions as ReturnType<typeof vi.fn>).mockResolvedValue(versions);

    const res = await request(app)
      .get('/api/v1/policy/versions')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe('tenant-123');
    expect(Array.isArray(res.body.versions)).toBe(true);
    expect(res.body.versions).toHaveLength(1);
  });

  it('returns empty array when no versions exist', async () => {
    (mockDb.getPolicyVersions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/policy/versions')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.versions).toHaveLength(0);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/policy/versions');
    expect(res.status).toBe(401);
  });
});
