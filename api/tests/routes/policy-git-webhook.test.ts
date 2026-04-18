/**
 * Tests for Policy Git Webhook routes
 *
 * Covers:
 *  - GET  /api/v1/policies/git/config  — fetch config
 *  - PUT  /api/v1/policies/git/config  — configure webhook
 *  - DELETE /api/v1/policies/git/config — remove config
 *  - GET  /api/v1/policies/git/logs   — fetch sync logs
 *  - POST /api/v1/policies/git/sync   — manual sync trigger
 *  - POST /api/v1/policies/rollback/:version — policy rollback
 *  - POST /api/v1/policies/webhook/github — incoming GitHub webhook
 *
 * Security-critical: webhook signature verification must reject invalid sigs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createPolicyGitWebhookRoutes } from '../../routes/policy-git-webhook/index.js';
import { createMockDb } from '../helpers/mock-db.js';
import { buildApp } from '../helpers/create-app.js';
import type { IDatabase, GitWebhookConfigRow } from '../../db-interface.js';

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock('../../middleware/feature-gate.js', () => ({
  requireFeature: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLimit: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../lib/rbac.js', () => ({
  requireRole: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requirePermission: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../routes/audit.js', () => ({
  storeAuditEvent: vi.fn().mockResolvedValue('mock-hash'),
  getGlobalKillSwitch: vi.fn().mockResolvedValue({ active: false, at: null }),
  fireWebhooksAsync: vi.fn(),
  getLastHash: vi.fn().mockResolvedValue(''),
  createAuditRoutes: vi.fn(),
}));

// GitHub fetch is mocked at the global fetch level
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Test fixtures ─────────────────────────────────────────────────────────

const MOCK_GIT_CONFIG: GitWebhookConfigRow = {
  id: 'cfg-1',
  tenant_id: 'tenant-123',
  repo_url: 'https://github.com/test-org/test-repo',
  webhook_secret: 'supersecret-webhook-value-1234',
  branch: 'main',
  policy_dir: 'agentguard/policies',
  github_token: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: null,
};

const MOCK_UPSERTED_CONFIG: GitWebhookConfigRow = {
  ...MOCK_GIT_CONFIG,
  updated_at: '2024-01-02T00:00:00.000Z',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildGitWebhookApp(db: IDatabase) {
  return buildApp(createPolicyGitWebhookRoutes, db);
}

function makeGithubSignature(payload: string | Buffer, secret: string): string {
  const body = typeof payload === 'string' ? Buffer.from(payload) : payload;
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// ── GET /api/v1/policies/git/config ───────────────────────────────────────

describe('GET /api/v1/policies/git/config — auth & happy path', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('returns 401 when no API key is provided', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app).get('/api/v1/policies/git/config');
    expect(res.status).toBe(401);
  });

  it('returns 404 when no git webhook is configured', async () => {
    const app = buildGitWebhookApp(mockDb);
    // mockDb.getGitWebhookConfig returns undefined by default
    const res = await request(app)
      .get('/api/v1/policies/git/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('No git webhook');
  });

  it('returns config with webhook secret masked', async () => {
    (mockDb.getGitWebhookConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_GIT_CONFIG);
    const app = buildGitWebhookApp(mockDb);

    const res = await request(app)
      .get('/api/v1/policies/git/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.repoUrl).toBe('https://github.com/test-org/test-repo');
    expect(res.body.branch).toBe('main');
    // Webhook secret must be masked
    expect(res.body.webhookSecret).toBe('***');
    expect(res.body.webhookUrl).toContain('/api/v1/policies/webhook/github');
  });
});

// ── PUT /api/v1/policies/git/config ───────────────────────────────────────

describe('PUT /api/v1/policies/git/config — configure webhook', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    (mockDb.upsertGitWebhookConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_UPSERTED_CONFIG);
  });

  it('returns 401 when no API key is provided', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app)
      .put('/api/v1/policies/git/config')
      .send({
        repoUrl: 'https://github.com/test-org/test-repo',
        webhookSecret: 'my-super-secret-webhook-value',
        branch: 'main',
      });
    expect(res.status).toBe(401);
  });

  it('returns 400 when repoUrl is missing', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app)
      .put('/api/v1/policies/git/config')
      .set('x-api-key', 'valid-key')
      .send({ webhookSecret: 'my-super-secret-webhook-value' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when webhookSecret is too short (< 16 chars)', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app)
      .put('/api/v1/policies/git/config')
      .set('x-api-key', 'valid-key')
      .send({
        repoUrl: 'https://github.com/test-org/test-repo',
        webhookSecret: 'short',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when repoUrl is not a valid URL', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app)
      .put('/api/v1/policies/git/config')
      .set('x-api-key', 'valid-key')
      .send({
        repoUrl: 'not-a-valid-url',
        webhookSecret: 'my-super-secret-webhook-value',
      });

    expect(res.status).toBe(400);
  });

  it('creates a webhook config and returns setup instructions', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app)
      .put('/api/v1/policies/git/config')
      .set('x-api-key', 'valid-key')
      .send({
        repoUrl: 'https://github.com/test-org/test-repo',
        webhookSecret: 'my-super-secret-webhook-value',
        branch: 'main',
        policyDir: 'agentguard/policies',
      });

    expect(res.status).toBe(200);
    expect(res.body.repoUrl).toBe('https://github.com/test-org/test-repo');
    expect(res.body.webhookSecret).toBe('***');
    expect(res.body.webhookUrl).toContain('/api/v1/policies/webhook/github');
    expect(Array.isArray(res.body.instructions)).toBe(true);
    expect(res.body.instructions.length).toBeGreaterThan(0);
  });
});

// ── DELETE /api/v1/policies/git/config ────────────────────────────────────

describe('DELETE /api/v1/policies/git/config', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('returns 401 when not authenticated', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app).delete('/api/v1/policies/git/config');
    expect(res.status).toBe(401);
  });

  it('returns 404 when no config exists', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app)
      .delete('/api/v1/policies/git/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
  });

  it('removes git webhook config successfully', async () => {
    (mockDb.getGitWebhookConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_GIT_CONFIG);
    const app = buildGitWebhookApp(mockDb);

    const res = await request(app)
      .delete('/api/v1/policies/git/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
    expect(mockDb.deleteGitWebhookConfig).toHaveBeenCalledWith('tenant-123');
  });
});

// ── POST /api/v1/policies/webhook/github ─────────────────────────────────

describe('POST /api/v1/policies/webhook/github — HMAC signature validation', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    (mockDb.getGitWebhookConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_GIT_CONFIG);
    (mockDb.insertGitSyncLog as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'log-1' });
    // Mock GitHub API calls
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '',
    });
  });

  it('returns 400 when tenant_id query param is missing', async () => {
    const app = buildGitWebhookApp(mockDb);
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      after: 'abc1234',
      repository: { full_name: 'test-org/test-repo', html_url: 'https://github.com/test-org/test-repo' },
    });

    const res = await request(app)
      .post('/api/v1/policies/webhook/github')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', makeGithubSignature(payload, 'supersecret-webhook-value-1234'))
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('tenant_id');
  });

  it('returns 401 when GitHub signature is invalid', async () => {
    const app = buildGitWebhookApp(mockDb);
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      after: 'abc1234',
      repository: { full_name: 'test-org/test-repo', html_url: 'https://github.com/test-org/test-repo' },
    });

    const res = await request(app)
      .post('/api/v1/policies/webhook/github?tenant_id=tenant-123')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', 'sha256=invalidhexsignaturevalue000000000000')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('signature');
  });

  it('returns 401 when signature header is missing', async () => {
    const app = buildGitWebhookApp(mockDb);
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      after: 'abc1234',
      repository: { full_name: 'test-org/test-repo', html_url: 'https://github.com/test-org/test-repo' },
    });

    const res = await request(app)
      .post('/api/v1/policies/webhook/github?tenant_id=tenant-123')
      .set('x-github-event', 'push')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(401);
  });

  it('ignores non-push events (ping, etc.)', async () => {
    const app = buildGitWebhookApp(mockDb);
    const payload = JSON.stringify({ zen: 'Responsive is better than fast.' });

    const res = await request(app)
      .post('/api/v1/policies/webhook/github?tenant_id=tenant-123')
      .set('x-github-event', 'ping')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(false);
    expect(res.body.reason).toContain("'ping' ignored");
  });

  it('accepts a valid push event with correct HMAC signature', async () => {
    const app = buildGitWebhookApp(mockDb);
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      after: 'abc1234deadbeef',
      repository: { full_name: 'test-org/test-repo', html_url: 'https://github.com/test-org/test-repo' },
    });
    const sig = makeGithubSignature(payload, MOCK_GIT_CONFIG.webhook_secret);

    const res = await request(app)
      .post('/api/v1/policies/webhook/github?tenant_id=tenant-123')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', sig)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.commitSha).toBe('abc1234');
  });
});

// ── GET /api/v1/policies/git/logs ─────────────────────────────────────────

describe('GET /api/v1/policies/git/logs', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('returns 401 without auth', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app).get('/api/v1/policies/git/logs');
    expect(res.status).toBe(401);
  });

  it('returns empty logs array when no syncs have run', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app)
      .get('/api/v1/policies/git/logs')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs).toHaveLength(0);
  });
});

// ── POST /api/v1/policies/rollback/:version ───────────────────────────────

describe('POST /api/v1/policies/rollback/:version', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('returns 401 without auth', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app).post('/api/v1/policies/rollback/1');
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-numeric version', async () => {
    const app = buildGitWebhookApp(mockDb);
    const res = await request(app)
      .post('/api/v1/policies/rollback/not-a-number')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('version');
  });

  it('returns 404 when specified version does not exist', async () => {
    (mockDb.getPolicyVersion as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const app = buildGitWebhookApp(mockDb);

    const res = await request(app)
      .post('/api/v1/policies/rollback/99')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('version 99');
  });

  it('rolls back to a valid version successfully', async () => {
    const policyData = JSON.stringify({ rules: [] });
    (mockDb.getPolicyVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      policy_id: 'git-sync',
      tenant_id: 'tenant-123',
      version: 2,
      policy_data: policyData,
      created_at: '2024-01-01T00:00:00.000Z',
      reverted_from: null,
    });
    (mockDb.getPolicyVersions as ReturnType<typeof vi.fn>).mockResolvedValue([{ version: 5 }]);
    (mockDb.insertPolicyVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 6,
      policy_id: 'git-sync',
      tenant_id: 'tenant-123',
      version: 6,
      policy_data: policyData,
      created_at: '2024-01-02T00:00:00.000Z',
      reverted_from: 2,
    });

    const app = buildGitWebhookApp(mockDb);
    const res = await request(app)
      .post('/api/v1/policies/rollback/2')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rolledBackTo).toBe(2);
    expect(mockDb.setCustomPolicy).toHaveBeenCalledWith('tenant-123', policyData);
  });
});
