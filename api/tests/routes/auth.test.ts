/**
 * Tests for Auth & Account Routes:
 *   POST /api/v1/signup          — create/recover tenant account
 *   POST /api/v1/killswitch      — tenant kill switch
 *   POST /api/v1/admin/killswitch — global kill switch (admin)
 *   POST /api/v1/keys/rotate     — API key rotation
 *
 * Covers: happy path, validation, rate limiting, auth failures, idempotency
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createAuthRoutes } from '../../routes/auth.js';
import { createMockDb, MOCK_TENANT } from '../helpers/mock-db.js';
import { buildApp } from '../helpers/create-app.js';
import type { IDatabase } from '../../db-interface.js';

// Mock the audit module to avoid DB calls from storeAuditEvent
vi.mock('../../routes/audit.js', () => ({
  getGlobalKillSwitch: vi.fn().mockResolvedValue({ active: false, at: null }),
  setGlobalKillSwitch: vi.fn().mockResolvedValue(undefined),
  getLastHash: vi.fn().mockResolvedValue(''),
  storeAuditEvent: vi.fn().mockResolvedValue('mock-hash'),
  fireWebhooksAsync: vi.fn(),
}));

// Mock the kill-switch-cache module
vi.mock('../../lib/kill-switch-cache.js', () => ({
  setGlobalKillSwitchCache: vi.fn().mockResolvedValue(undefined),
  setTenantKillSwitchCache: vi.fn().mockResolvedValue(undefined),
}));

// Mock middleware rate limiters to avoid cross-test pollution
vi.mock('../../middleware/rate-limit.js', () => ({
  signupRateLimit: vi.fn().mockResolvedValue(true),
  recoveryRateLimit: vi.fn().mockResolvedValue(true),
  rateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  bruteForceMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  authEndpointRateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  scimRateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Import mocked modules at top level (after vi.mock, which is hoisted)
import { signupRateLimit } from '../../middleware/rate-limit.js';
import { getGlobalKillSwitch as mockGetGlobalKillSwitch, setGlobalKillSwitch as mockSetGlobalKillSwitch, storeAuditEvent as mockStoreAuditEvent } from '../../routes/audit.js';

describe('POST /api/v1/signup', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set default return values after clearing (clearAllMocks resets them)
    vi.mocked(signupRateLimit).mockResolvedValue(true);
    mockDb = createMockDb();
    // By default: no existing email, fresh signup
    (mockDb.getTenantByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    app = buildApp(createAuthRoutes, mockDb);
  });

  it('creates a new tenant account and returns 201 with API key', async () => {
    const res = await request(app)
      .post('/api/v1/signup')
      .send({ name: 'My Agent', email: 'agent@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.tenantId).toBeTruthy();
    expect(res.body.apiKey).toMatch(/^ag_live_/);
    expect(res.body.message).toContain('Account created');
    expect(mockDb.createTenant).toHaveBeenCalledOnce();
    expect(mockDb.createApiKey).toHaveBeenCalledOnce();
  });

  it('creates account without email (email is optional)', async () => {
    const res = await request(app)
      .post('/api/v1/signup')
      .send({ name: 'Anonymous Agent' });

    expect(res.status).toBe(201);
    expect(res.body.apiKey).toMatch(/^ag_live_/);
  });

  it('recovers existing account by rotating key when email already registered', async () => {
    (mockDb.getTenantByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_TENANT);
    (mockDb.all as ReturnType<typeof vi.fn>).mockResolvedValue([
      { key_sha256: 'old-hash-123' },
    ]);

    const res = await request(app)
      .post('/api/v1/signup')
      .send({ name: 'Any Name', email: 'test@example.com' });

    // Should return 200 (recovered) not 201 (created)
    expect(res.status).toBe(200);
    expect(res.body.recovered).toBe(true);
    expect(res.body.apiKey).toMatch(/^ag_live_/);
    // Old key should be deactivated
    expect(mockDb.deactivateApiKeyBySha256).toHaveBeenCalledWith('old-hash-123');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/v1/signup')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when email format is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/signup')
      .send({ name: 'Test', email: 'not-an-email' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when agent key is used (privilege escalation guard)', async () => {
    const res = await request(app)
      .post('/api/v1/signup')
      .set('x-api-key', 'ag_agent_somekey')
      .send({ name: 'Hacker', email: 'hacker@example.com' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Agent keys');
    expect(mockDb.createTenant).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(signupRateLimit).mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/signup')
      .send({ name: 'Spammer', email: 'spam@example.com' });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Too many');
  });

  it('returns 500 when database fails during tenant creation', async () => {
    (mockDb.createTenant as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk full'));

    const res = await request(app)
      .post('/api/v1/signup')
      .send({ name: 'New User', email: 'new@example.com' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create account');
  });

  it('includes quickstart instructions in response', async () => {
    const res = await request(app)
      .post('/api/v1/signup')
      .send({ name: 'New Agent' });

    expect(res.status).toBe(201);
    expect(res.body.quickstart).toBeTruthy();
    expect(res.body.quickstart.evaluate).toBeTruthy();
  });
});

describe('POST /api/v1/killswitch (tenant)', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signupRateLimit).mockResolvedValue(true);
    vi.mocked(mockGetGlobalKillSwitch).mockResolvedValue({ active: false, at: null });
    mockDb = createMockDb();
    app = buildApp(createAuthRoutes, mockDb);
  });

  it('activates the tenant kill switch', async () => {
    const res = await request(app)
      .post('/api/v1/killswitch')
      .set('x-api-key', 'valid-key')
      .send({ active: true });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
    expect(res.body.activatedAt).toBeTruthy();
    expect(mockDb.updateTenantKillSwitch).toHaveBeenCalledWith(
      MOCK_TENANT.id,
      1,
      expect.any(String),
    );
  });

  it('deactivates the tenant kill switch', async () => {
    const res = await request(app)
      .post('/api/v1/killswitch')
      .set('x-api-key', 'valid-key')
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(res.body.activatedAt).toBeNull();
    expect(mockDb.updateTenantKillSwitch).toHaveBeenCalledWith(
      MOCK_TENANT.id,
      0,
      null,
    );
  });

  it('returns 400 for invalid kill switch body (missing active field)', async () => {
    const res = await request(app)
      .post('/api/v1/killswitch')
      .set('x-api-key', 'valid-key')
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 for non-boolean active field', async () => {
    const res = await request(app)
      .post('/api/v1/killswitch')
      .set('x-api-key', 'valid-key')
      .send({ active: 'yes' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/killswitch')
      .send({ active: true });

    expect(res.status).toBe(401);
    expect(mockDb.updateTenantKillSwitch).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/killswitch', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockGetGlobalKillSwitch).mockResolvedValue({ active: false, at: null });
    mockDb = createMockDb();
    app = buildApp(createAuthRoutes, mockDb);
    process.env['ADMIN_KEY'] = 'admin-key';
  });

  it('activates the global kill switch with admin key', async () => {
    vi.mocked(mockGetGlobalKillSwitch).mockResolvedValue({ active: false, at: null });

    const res = await request(app)
      .post('/api/v1/admin/killswitch')
      .set('x-api-key', 'admin-key')
      .send({ active: true });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
    expect(mockSetGlobalKillSwitch).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('returns 401 with wrong admin key', async () => {
    const res = await request(app)
      .post('/api/v1/admin/killswitch')
      .set('x-api-key', 'wrong-key')
      .send({ active: true });

    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .post('/api/v1/admin/killswitch')
      .set('x-api-key', 'admin-key')
      .send({ enabled: true });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/keys/rotate', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockStoreAuditEvent).mockResolvedValue('mock-hash');
    mockDb = createMockDb();
    app = buildApp(createAuthRoutes, mockDb);
  });

  it('generates new key and deactivates old key', async () => {
    const res = await request(app)
      .post('/api/v1/keys/rotate')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.apiKey).toMatch(/^ag_live_/);
    expect(res.body.message).toContain('invalidated');
    expect(mockDb.createApiKey).toHaveBeenCalledWith(
      expect.stringMatching(/^ag_live_/),
      'tenant-123',
      'rotated',
    );
    expect(mockDb.deactivateApiKeyBySha256).toHaveBeenCalledOnce();
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).post('/api/v1/keys/rotate');
    expect(res.status).toBe(401);
  });

  it('returns 403 when agent key used', async () => {
    const res = await request(app)
      .post('/api/v1/keys/rotate')
      .set('x-api-key', 'ag_agent_somekey');

    expect(res.status).toBe(403);
  });
});
