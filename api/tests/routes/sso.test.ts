/**
 * Tests for SSO callback JWT issuance (G-SSO-01 fix)
 *
 * Verifies that the SSO callback:
 *   1. Issues a signed JWT in the response body (not a query-string sso_user_id)
 *   2. Sets an HttpOnly cookie containing the JWT
 *   3. Redirects to returnTo WITHOUT sso_user_id in query string
 *   4. JWT contains expected claims (sub, tenant_id, email, role, sso, iss)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createSsoRoutes } from '../../routes/sso.js';
import { createMockDb, MOCK_TENANT } from '../helpers/mock-db.js';
import { buildApp } from '../helpers/create-app.js';
import type { IDatabase, SsoUserRow } from '../../db-interface.js';
import { verifySsoJwt, SSO_JWT_COOKIE } from '../../lib/sso-jwt.js';

// ── Mock external dependencies ────────────────────────────────────────────

vi.mock('../../lib/oidc-provider.js', () => ({
  fetchDiscovery: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn().mockResolvedValue({ id_token: 'mock-id-token', access_token: 'mock-access-token' }),
  validateIdToken: vi.fn().mockResolvedValue({
    sub: 'oidc-sub-123',
    email: 'sso@example.com',
    name: 'SSO User',
  }),
  extractUserFromClaims: vi.fn().mockReturnValue({
    sub: 'oidc-sub-123',
    email: 'sso@example.com',
    name: 'SSO User',
  }),
  mapClaimsToRole: vi.fn().mockReturnValue('member'),
  generateCodeVerifier: vi.fn().mockReturnValue('mock-code-verifier'),
  testOidcConfig: vi.fn(),
  getProviderDiscoveryUrl: vi.fn().mockReturnValue('https://example.okta.com/.well-known/openid-configuration'),
}));

vi.mock('../../lib/saml-provider.js', () => ({
  parseSamlMetadata: vi.fn(),
  buildSamlAuthnRequest: vi.fn(),
  parseSamlResponse: vi.fn().mockReturnValue({
    nameId: 'saml-name-id-456',
    email: 'saml@example.com',
    displayName: 'SAML User',
    groups: [],
  }),
}));

vi.mock('../../lib/integration-crypto.js', () => ({
  encryptConfig: vi.fn().mockReturnValue('encrypted-secret'),
  decryptConfig: vi.fn().mockReturnValue({ clientSecret: 'decrypted-secret', provider: 'okta', tenantId: 'tenant-123' }),
}));

vi.mock('../../middleware/feature-gate.js', () => ({
  requireFeature: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../lib/rbac.js', () => ({
  requireRole: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

// ── Test fixtures ─────────────────────────────────────────────────────────

const MOCK_SSO_USER: SsoUserRow = {
  id: 'sso-user-789',
  tenant_id: 'tenant-123',
  idp_sub: 'oidc-sub-123',
  provider: 'okta',
  email: 'sso@example.com',
  name: 'SSO User',
  role: 'member',
  created_at: '2026-01-01T00:00:00.000Z',
  last_login_at: '2026-03-23T00:00:00.000Z',
};

const MOCK_OIDC_SSO_CONFIG = {
  id: 'sso-cfg-1',
  tenant_id: 'tenant-123',
  provider: 'okta' as const,
  protocol: 'oidc' as const,
  domain: 'example.okta.com',
  client_id: 'oidc-client-id',
  client_secret_encrypted: 'encrypted-secret',
  discovery_url: 'https://example.okta.com/.well-known/openid-configuration',
  redirect_uri: 'https://app.example.com/api/v1/auth/sso/callback',
  scopes: 'openid email profile',
  force_sso: 0,
  role_claim_name: null,
  admin_group: null,
  member_group: null,
  idp_metadata_xml: null,
  sp_entity_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// ── Helper: create an SSO state in mock DB ────────────────────────────────

function setupSsoState(
  mockDb: IDatabase,
  state: string,
  tenantId: string,
  returnTo?: string,
): void {
  const stateData = JSON.stringify({
    tenantId,
    codeVerifier: 'mock-code-verifier',
    nonce: 'mock-nonce',
    returnTo,
  });
  (mockDb.getSsoState as ReturnType<typeof vi.fn>).mockResolvedValue({
    state,
    data: stateData,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  (mockDb.getSsoConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_OIDC_SSO_CONFIG);
  (mockDb.upsertSsoUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SSO_USER);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/sso/callback — JWT issuance (G-SSO-01)', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    app = buildApp(createSsoRoutes, mockDb);
  });

  it('should return a signed JWT token in the response body', async () => {
    setupSsoState(mockDb, 'valid-state-abc', 'tenant-123');

    const res = await request(app)
      .post('/api/v1/auth/sso/callback')
      .send({ code: 'auth-code-123', state: 'valid-state-abc' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(typeof res.body.token).toBe('string');

    // Verify the JWT has expected claims
    const payload = await verifySsoJwt(res.body.token as string);
    expect(payload.sub).toBe('sso-user-789');
    expect(payload.tenant_id).toBe('tenant-123');
    expect(payload.email).toBe('sso@example.com');
    expect(payload.role).toBe('member');
    expect(payload.sso).toBe(true);
    expect(payload.iss).toBe('agentguard');
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should set an HttpOnly cookie with the JWT', async () => {
    setupSsoState(mockDb, 'valid-state-cookie', 'tenant-123');

    const res = await request(app)
      .post('/api/v1/auth/sso/callback')
      .send({ code: 'auth-code-123', state: 'valid-state-cookie' });

    expect(res.status).toBe(200);

    // Check Set-Cookie header contains the session cookie
    const setCookieHeader = res.headers['set-cookie'] as string[] | string | undefined;
    expect(setCookieHeader).toBeDefined();

    const cookieStr = Array.isArray(setCookieHeader)
      ? setCookieHeader.join('; ')
      : (setCookieHeader ?? '');

    expect(cookieStr).toContain(`${SSO_JWT_COOKIE}=`);
    expect(cookieStr.toLowerCase()).toContain('httponly');
    expect(cookieStr.toLowerCase()).toContain('samesite=lax');
  });

  it('should NOT include sso_user_id in the response', async () => {
    setupSsoState(mockDb, 'valid-state-nosub', 'tenant-123');

    const res = await request(app)
      .post('/api/v1/auth/sso/callback')
      .send({ code: 'auth-code-123', state: 'valid-state-nosub' });

    expect(res.status).toBe(200);
    // The old insecure field must not appear
    expect(res.body).not.toHaveProperty('sso_user_id');
    expect(res.body.user).not.toHaveProperty('sso_user_id');
  });

  it('should redirect to returnTo WITHOUT sso_user_id in query string', async () => {
    setupSsoState(mockDb, 'valid-state-redirect', 'tenant-123', 'https://dashboard.example.com/welcome');

    const res = await request(app)
      .post('/api/v1/auth/sso/callback')
      .send({ code: 'auth-code-123', state: 'valid-state-redirect' });

    expect(res.status).toBe(302);

    const location = res.headers['location'] as string;
    expect(location).toBe('https://dashboard.example.com/welcome');
    // Must NOT contain any user-identifying query parameters
    expect(location).not.toContain('sso_user_id');
    expect(location).not.toContain('sso_role');
    expect(location).not.toContain('sso_email');

    // Cookie should still be set on redirect
    const setCookieHeader = res.headers['set-cookie'] as string[] | string | undefined;
    expect(setCookieHeader).toBeDefined();
    const cookieStr = Array.isArray(setCookieHeader)
      ? setCookieHeader.join('; ')
      : (setCookieHeader ?? '');
    expect(cookieStr).toContain(`${SSO_JWT_COOKIE}=`);
  });

  it('should return 400 for missing state', async () => {
    const res = await request(app)
      .post('/api/v1/auth/sso/callback')
      .send({ code: 'auth-code-123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/state/i);
  });

  it('should return 400 for expired/invalid state', async () => {
    (mockDb.getSsoState as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/sso/callback')
      .send({ code: 'auth-code-123', state: 'expired-state' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired|invalid/i);
  });

  it('should return 400 on IdP error response', async () => {
    const res = await request(app)
      .post('/api/v1/auth/sso/callback')
      .send({ error: 'access_denied', error_description: 'User denied access', state: 'some-state' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SSO error/i);
  });

  it('should include user info in the response body', async () => {
    setupSsoState(mockDb, 'valid-state-user', 'tenant-123');

    const res = await request(app)
      .post('/api/v1/auth/sso/callback')
      .send({ code: 'auth-code-123', state: 'valid-state-user' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 'sso-user-789',
      tenantId: 'tenant-123',
      email: 'sso@example.com',
      role: 'member',
    });
  });
});

describe('GET /api/v1/auth/sso/callback — JWT issuance (G-SSO-01)', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    app = buildApp(createSsoRoutes, mockDb);
  });

  it('should return a signed JWT token in the response body', async () => {
    setupSsoState(mockDb, 'get-state-abc', 'tenant-123');

    const res = await request(app)
      .get('/api/v1/auth/sso/callback')
      .query({ code: 'auth-code-123', state: 'get-state-abc' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();

    const payload = await verifySsoJwt(res.body.token as string);
    expect(payload.sub).toBe('sso-user-789');
    expect(payload.sso).toBe(true);
    expect(payload.iss).toBe('agentguard');
  });

  it('should redirect to returnTo WITHOUT sso_user_id in query string (GET)', async () => {
    setupSsoState(mockDb, 'get-state-redirect', 'tenant-123', 'https://dashboard.example.com/home');

    const res = await request(app)
      .get('/api/v1/auth/sso/callback')
      .query({ code: 'auth-code-123', state: 'get-state-redirect' });

    expect(res.status).toBe(302);
    const location = res.headers['location'] as string;
    expect(location).toBe('https://dashboard.example.com/home');
    expect(location).not.toContain('sso_user_id');
    expect(location).not.toContain('sso_role');
  });

  it('should set an HttpOnly cookie on GET callback', async () => {
    setupSsoState(mockDb, 'get-state-cookie', 'tenant-123');

    const res = await request(app)
      .get('/api/v1/auth/sso/callback')
      .query({ code: 'auth-code-123', state: 'get-state-cookie' });

    expect(res.status).toBe(200);
    const setCookieHeader = res.headers['set-cookie'] as string[] | string | undefined;
    expect(setCookieHeader).toBeDefined();
    const cookieStr = Array.isArray(setCookieHeader)
      ? setCookieHeader.join('; ')
      : (setCookieHeader ?? '');
    expect(cookieStr).toContain(`${SSO_JWT_COOKIE}=`);
    expect(cookieStr.toLowerCase()).toContain('httponly');
  });
});
