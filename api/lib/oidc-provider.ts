/**
 * AgentGuard — OIDC Provider Library
 *
 * Supports: Okta, Azure AD, Google Workspace, and any OIDC-compliant IdP.
 *
 * Implements:
 *  - Discovery endpoint (.well-known/openid-configuration) auto-configuration
 *  - Authorization Code Flow with PKCE
 *  - Token validation (JWT verification against JWKS)
 *  - User provisioning (auto-create user on first SSO login)
 *  - OIDC claims → AgentGuard role mapping
 */
import crypto from 'node:crypto';
import { importJWK, jwtVerify } from 'jose';
import type { JWTPayload, JWK } from 'jose';

// ── Types ─────────────────────────────────────────────────────────────────

export interface OidcProviderConfig {
  discoveryUrl: string;   // .well-known/openid-configuration URL
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
  roleClaimName?: string;    // JWT claim that maps to roles (default: 'groups')
  adminGroup?: string;       // Group name → admin role
  memberGroup?: string;      // Group name → member role
}

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  grant_types_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
}

export interface OidcTokenSet {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface OidcUser {
  sub: string;          // Subject (unique ID from IdP)
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email_verified?: boolean;
  groups?: string[];
  roles?: string[];
  [key: string]: unknown;
}

export type AgentGuardRole = 'admin' | 'member' | 'viewer';

// ── PKCE Helpers ──────────────────────────────────────────────────────────

/**
 * Generate a PKCE code verifier (43–128 chars, base64url-safe).
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * Derive the PKCE code challenge from the verifier (S256 method).
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ── Discovery ─────────────────────────────────────────────────────────────

const discoveryCache = new Map<string, { doc: OidcDiscovery; expiresAt: number }>();
const DISCOVERY_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch and cache the OIDC discovery document.
 */
export async function fetchDiscovery(discoveryUrl: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(discoveryUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.doc;
  }

  const res = await fetch(discoveryUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText} from ${discoveryUrl}`);
  }

  const doc = (await res.json()) as OidcDiscovery;

  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error('OIDC discovery document is missing required fields');
  }

  discoveryCache.set(discoveryUrl, { doc, expiresAt: Date.now() + DISCOVERY_TTL_MS });
  return doc;
}

// ── JWKS ──────────────────────────────────────────────────────────────────

const jwksCache = new Map<string, { keys: JWK[]; expiresAt: number }>();
const JWKS_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch the JWKS from the IdP.
 */
async function fetchJwks(jwksUri: string): Promise<JWK[]> {
  const cached = jwksCache.get(jwksUri);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const res = await fetch(jwksUri, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`JWKS fetch failed: ${res.status} from ${jwksUri}`);
  }

  const body = (await res.json()) as { keys: JWK[] };
  const keys = body.keys ?? [];
  jwksCache.set(jwksUri, { keys, expiresAt: Date.now() + JWKS_TTL_MS });
  return keys;
}

// ── Authorization URL ─────────────────────────────────────────────────────

export interface AuthorizationUrlParams {
  config: OidcProviderConfig;
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * Build the authorization URL for initiating SSO.
 */
export async function buildAuthorizationUrl({
  config,
  state,
  nonce,
  codeVerifier,
}: AuthorizationUrlParams): Promise<{ url: string; codeChallenge: string }> {
  const discovery = await fetchDiscovery(config.discoveryUrl);
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const scopes = config.scopes ?? ['openid', 'email', 'profile'];

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `${discovery.authorization_endpoint}?${params.toString()}`,
    codeChallenge,
  };
}

// ── Token Exchange ────────────────────────────────────────────────────────

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  config: OidcProviderConfig,
  code: string,
  codeVerifier: string,
): Promise<OidcTokenSet> {
  const discovery = await fetchDiscovery(config.discoveryUrl);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier,
  });

  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Token exchange failed: ${res.status} — ${errBody}`);
  }

  return (await res.json()) as OidcTokenSet;
}

// ── Token Validation ──────────────────────────────────────────────────────

/**
 * Validate an OIDC ID token against the IdP's JWKS.
 * Returns the decoded claims on success.
 */
export async function validateIdToken(
  config: OidcProviderConfig,
  idToken: string,
  nonce: string,
): Promise<JWTPayload> {
  const discovery = await fetchDiscovery(config.discoveryUrl);
  const keys = await fetchJwks(discovery.jwks_uri);

  // Decode header to find the right key (kid)
  const header = JSON.parse(
    Buffer.from(idToken.split('.')[0]!, 'base64url').toString(),
  ) as { kid?: string; alg?: string };

  const matchingKey = header.kid
    ? keys.find((k) => (k as { kid?: string }).kid === header.kid)
    : keys[0];

  if (!matchingKey) {
    throw new Error('No matching JWKS key found for ID token');
  }

  const key = await importJWK(matchingKey as Parameters<typeof importJWK>[0]);

  const { payload } = await jwtVerify(idToken, key, {
    issuer: discovery.issuer,
    audience: config.clientId,
  });

  // Validate nonce
  if (payload['nonce'] !== nonce) {
    throw new Error('OIDC nonce mismatch — possible replay attack');
  }

  return payload;
}

// ── User Profile ──────────────────────────────────────────────────────────

/**
 * Extract a normalized user profile from OIDC claims.
 */
export function extractUserFromClaims(claims: JWTPayload): OidcUser {
  return {
    sub: claims['sub'] as string,
    email: claims['email'] as string | undefined,
    name: claims['name'] as string | undefined,
    given_name: claims['given_name'] as string | undefined,
    family_name: claims['family_name'] as string | undefined,
    picture: claims['picture'] as string | undefined,
    email_verified: claims['email_verified'] as boolean | undefined,
    groups: Array.isArray(claims['groups']) ? (claims['groups'] as string[]) : undefined,
    roles: Array.isArray(claims['roles']) ? (claims['roles'] as string[]) : undefined,
    ...claims,
  };
}

// ── Role Mapping ──────────────────────────────────────────────────────────

/**
 * Map OIDC claims to an AgentGuard role.
 *
 * Priority:
 *  1. Check `roles` claim for known role names
 *  2. Check `groups` claim against configured group→role mapping
 *  3. Fall back to 'viewer'
 */
export function mapClaimsToRole(
  user: OidcUser,
  config: OidcProviderConfig,
): AgentGuardRole {
  const roleClaimName = config.roleClaimName ?? 'roles';

  // Check direct role claims (Okta, Azure AD with app roles)
  const directRoles = (user[roleClaimName] as string[] | undefined) ?? [];
  if (directRoles.includes('admin') || directRoles.includes('AgentGuard-Admin')) {
    return 'admin';
  }
  if (directRoles.includes('member') || directRoles.includes('AgentGuard-Member')) {
    return 'member';
  }

  // Check groups
  const groups = user.groups ?? [];
  if (config.adminGroup && groups.includes(config.adminGroup)) {
    return 'admin';
  }
  if (config.memberGroup && groups.includes(config.memberGroup)) {
    return 'member';
  }

  return 'viewer';
}

// ── Utility: Known Provider Discovery URLs ─────────────────────────────────

/**
 * Build the standard discovery URL for well-known OIDC providers.
 */
export function getProviderDiscoveryUrl(
  provider: 'okta' | 'azure_ad' | 'google' | string,
  domain: string,
): string {
  switch (provider) {
    case 'okta':
      return `https://${domain}/.well-known/openid-configuration`;
    case 'azure_ad':
      // domain is typically the tenant ID or tenant domain
      return `https://login.microsoftonline.com/${domain}/v2.0/.well-known/openid-configuration`;
    case 'google':
      return 'https://accounts.google.com/.well-known/openid-configuration';
    default:
      // Assume domain is already a base URL or discovery URL
      if (domain.endsWith('/.well-known/openid-configuration')) {
        return domain;
      }
      return `${domain}/.well-known/openid-configuration`;
  }
}

/**
 * Test the OIDC configuration by fetching the discovery document.
 * Returns { success: true, issuer } on success or { success: false, error } on failure.
 */
export async function testOidcConfig(
  discoveryUrl: string,
): Promise<{ success: true; issuer: string; endpoints: Partial<OidcDiscovery> } | { success: false; error: string }> {
  try {
    const doc = await fetchDiscovery(discoveryUrl);
    return {
      success: true,
      issuer: doc.issuer,
      endpoints: {
        authorization_endpoint: doc.authorization_endpoint,
        token_endpoint: doc.token_endpoint,
        jwks_uri: doc.jwks_uri,
        end_session_endpoint: doc.end_session_endpoint,
        userinfo_endpoint: doc.userinfo_endpoint,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
