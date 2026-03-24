/**
 * AgentGuard — SSO Session JWT Signing
 *
 * Issues short-lived signed JWTs for SSO-authenticated users.
 * Uses HS256 with JWT_SECRET env var (symmetric HMAC-SHA256).
 *
 * Environment variables:
 *   JWT_SECRET (required) — at least 32 bytes of entropy.
 *                           In production, set a strong random secret.
 *                           Fallback: a deterministic dev-only secret is used
 *                           (printed as a warning to stderr).
 *
 * Token claims:
 *   sub        — provisioned user ID
 *   iss        — "agentguard"
 *   iat        — issued-at (seconds)
 *   exp        — expiry (iat + SSO_JWT_TTL_SECONDS, default 900 = 15 min)
 *   tenant_id  — tenant ID
 *   email      — user email (if available)
 *   role       — RBAC role (owner | admin | member | viewer)
 *   sso        — true (marker claim to distinguish SSO sessions)
 */
import { SignJWT, jwtVerify } from 'jose';

// ── Constants ─────────────────────────────────────────────────────────────

export const SSO_JWT_ISSUER = 'agentguard';
export const SSO_JWT_COOKIE = 'ag_session';

const DEFAULT_TTL_SECONDS = 900; // 15 minutes

// ── Secret Resolution ──────────────────────────────────────────────────────

/**
 * Resolve the JWT signing secret.
 *
 * Throws a hard error if JWT_SECRET is not set or shorter than 32 characters.
 * There is NO fallback — silently degrading auth security is never acceptable.
 *
 * Set JWT_SECRET to at least 32 random bytes, e.g.:
 *   export JWT_SECRET=$(openssl rand -hex 32)
 */
export function resolveSsoJwtSecret(): Uint8Array {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error(
      '[sso-jwt] FATAL: JWT_SECRET environment variable is not set. ' +
      'SSO authentication cannot proceed without a signing secret. ' +
      'Set JWT_SECRET to at least 32 random characters (e.g. openssl rand -hex 32).',
    );
  }
  if (secret.length < 32) {
    throw new Error(
      `[sso-jwt] FATAL: JWT_SECRET is too short (${secret.length} chars, minimum 32). ` +
      'Set a stronger JWT_SECRET (e.g. openssl rand -hex 32).',
    );
  }
  return new TextEncoder().encode(secret);
}

// ── Token Claims ───────────────────────────────────────────────────────────

export interface SsoJwtClaims {
  sub: string;          // provisioned user ID
  tenant_id: string;    // tenant ID
  email: string | null; // user email
  role: string;         // RBAC role
}

// ── Signing ────────────────────────────────────────────────────────────────

/**
 * Issue a signed JWT for an SSO-authenticated user.
 *
 * @param claims - The user claims to embed in the token.
 * @param ttlSeconds - Token lifetime in seconds (default: 900 = 15 min).
 * @returns Compact JWT string.
 */
export async function signSsoJwt(
  claims: SsoJwtClaims,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const secret = resolveSsoJwtSecret();
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    tenant_id: claims.tenant_id,
    email: claims.email,
    role: claims.role,
    sso: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(SSO_JWT_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret);

  return jwt;
}

// ── Verification (for testing / downstream use) ────────────────────────────

export interface SsoJwtPayload {
  sub: string;
  tenant_id: string;
  email: string | null;
  role: string;
  sso: boolean;
  iss: string;
  iat: number;
  exp: number;
}

/**
 * Verify a signed SSO JWT.
 * Throws on invalid/expired tokens.
 */
export async function verifySsoJwt(token: string): Promise<SsoJwtPayload> {
  const secret = resolveSsoJwtSecret();
  const { payload } = await jwtVerify(token, secret, {
    issuer: SSO_JWT_ISSUER,
    algorithms: ['HS256'],
  });
  return payload as unknown as SsoJwtPayload;
}
