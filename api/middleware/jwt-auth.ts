/**
 * AgentGuard — JWT Authentication Middleware
 *
 * Validates RS256 JWTs from `Authorization: Bearer <token>`.
 * Supports JWKS-based public key discovery with in-memory TTL cache.
 *
 * Config:
 *   JWT_JWKS_URL  — JWKS endpoint URL (required for JWT auth to function)
 *   JWT_AUDIENCE  — expected `aud` claim (optional, skipped if unset)
 *   JWT_ISSUER    — expected `iss` claim (optional, skipped if unset)
 *
 * Extracted claims set on req:
 *   req.tenantId  — from JWT claim `tenant_id` (falls back to `sub`)
 *   req.jwtClaims — full decoded payload
 */
import { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet, createLocalJWKSet } from 'jose';
import type { JWTPayload, JWTVerifyOptions, JSONWebKeySet } from 'jose';
import crypto from 'crypto';

// ── Type Augmentation ──────────────────────────────────────────────────────

export interface JwtClaims extends JWTPayload {
  sub?: string;
  email?: string;
  tenant_id?: string;
  roles?: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      jwtClaims?: JwtClaims;
      jwtAuthenticated?: boolean;
    }
  }
}

// ── JWKS Cache ─────────────────────────────────────────────────────────────

const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

interface JwksCacheEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keySet: ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>;
  expiresAt: number;
  url: string;
}

let jwksCache: JwksCacheEntry | null = null;

/**
 * Returns a cached JWKS keyset, refreshing after TTL.
 * Uses createRemoteJWKSet which handles HTTP fetching internally.
 */
function getJwksKeySet(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet> {
  const now = Date.now();

  if (jwksCache && jwksCache.url === jwksUrl && jwksCache.expiresAt > now) {
    return jwksCache.keySet;
  }

  // Build new remote keyset
  const keySet = createRemoteJWKSet(new URL(jwksUrl), {
    cacheMaxAge: JWKS_TTL_MS,
  });

  jwksCache = {
    keySet,
    expiresAt: now + JWKS_TTL_MS,
    url: jwksUrl,
  };

  return keySet;
}

/** Force-invalidate JWKS cache (useful for tests) */
export function invalidateJwksCache(): void {
  jwksCache = null;
}

/** Inject a pre-built local keyset for testing (bypasses network) */
export function injectJwksKeySet(keySet: ReturnType<typeof createLocalJWKSet>, url: string): void {
  jwksCache = {
    keySet,
    expiresAt: Date.now() + JWKS_TTL_MS,
    url,
  };
}

// ── Token Extraction ───────────────────────────────────────────────────────

/**
 * Extract bearer token from Authorization header.
 * Returns null if not a Bearer token.
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

// ── JWT Verification ───────────────────────────────────────────────────────

export interface JwtVerifyResult {
  ok: true;
  claims: JwtClaims;
  tenantId: string;
}

export interface JwtVerifyFailure {
  ok: false;
  status: number;
  message: string;
}

/**
 * Verify a JWT token. Returns claims on success or an error descriptor.
 * Uses timing-safe operations internally (jose library handles this).
 */
export async function verifyJwt(
  token: string,
  jwksUrl: string,
): Promise<JwtVerifyResult | JwtVerifyFailure> {
  try {
    const keySet = getJwksKeySet(jwksUrl);

    const verifyOptions: JWTVerifyOptions = {
      algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'],
    };

    const audience = process.env['JWT_AUDIENCE'];
    const issuer = process.env['JWT_ISSUER'];
    if (audience) verifyOptions.audience = audience;
    if (issuer) verifyOptions.issuer = issuer;

    const { payload } = await jwtVerify(token, keySet, verifyOptions);

    const claims = payload as JwtClaims;

    // Extract tenant_id: prefer explicit claim, fall back to sub
    const tenantId = claims.tenant_id ?? claims.sub ?? 'jwt-unknown';

    return { ok: true, claims, tenantId };
  } catch (err: unknown) {
    if (err instanceof Error) {
      const name = err.name;
      // Map jose error names to HTTP status codes
      if (name === 'JWTExpired') {
        return { ok: false, status: 401, message: 'JWT token has expired' };
      }
      if (name === 'JWTClaimValidationFailed') {
        return { ok: false, status: 401, message: 'JWT claim validation failed' };
      }
      if (
        name === 'JWSSignatureVerificationFailed' ||
        name === 'JWSInvalid' ||
        name === 'JWTInvalid'
      ) {
        return { ok: false, status: 401, message: 'Invalid JWT signature' };
      }
      if (name === 'JWKSNoMatchingKey') {
        return { ok: false, status: 401, message: 'No matching JWKS key for JWT' };
      }
      if (name === 'JWKSMultipleMatchingKeys') {
        return { ok: false, status: 401, message: 'Ambiguous JWKS key for JWT' };
      }
      if (name === 'JWKSTimeout' || name === 'JWKSFetchFailed') {
        return { ok: false, status: 503, message: 'JWKS endpoint unavailable' };
      }
    }
    return { ok: false, status: 401, message: 'Invalid JWT token' };
  }
}

// ── Middleware Factory ─────────────────────────────────────────────────────

/**
 * Express middleware: validate JWT Bearer token and populate req.jwtClaims + req.tenantId.
 * Returns 401 on invalid token, passes through on success.
 */
export async function jwtAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const jwksUrl = process.env['JWT_JWKS_URL'];
  if (!jwksUrl) {
    res.status(503).json({ error: 'JWT authentication not configured (JWT_JWKS_URL not set)' });
    return;
  }

  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authorization: Bearer <token> header required' });
    return;
  }

  const result = await verifyJwt(token, jwksUrl);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  req.jwtClaims = result.claims;
  req.jwtAuthenticated = true;
  req.tenantId = result.tenantId;
  next();
}
