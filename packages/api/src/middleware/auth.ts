/**
 * Auth middleware — validates JWT or API key, injects ServiceContext.
 * API key path is for agent SDK authentication.
 * JWT path is for human dashboard/CLI users.
 */
import type { Context, Next } from 'hono';
import { jwtVerify } from 'jose';
import type { ServiceContext, UserRole } from '@agentguard/shared';
import { UnauthorizedError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

// ── JWT_SECRET production startup guard ───────────────────────────────────
// Refuse to start in production with the default dev secret.
// This prevents forged JWTs when the env var is not set.
const _jwtSecretRaw = process.env['JWT_SECRET'];
if (process.env['NODE_ENV'] === 'production') {
  if (
    !_jwtSecretRaw ||
    _jwtSecretRaw.length < 32 ||
    _jwtSecretRaw.includes('dev-') ||
    _jwtSecretRaw.includes('change-in')
  ) {
    throw new Error(
      'FATAL: JWT_SECRET must be set to a strong random secret in production ' +
        '(minimum 32 chars, must not be the default dev secret). ' +
        'Generate with: openssl rand -hex 32',
    );
  }
}

/**
 * Validated JWT secret — use this instead of reading process.env directly.
 * The startup guard above ensures this is never the dev default in production.
 */
export const JWT_SECRET = new TextEncoder().encode(
  _jwtSecretRaw ?? 'dev-secret-change-in-production',
);

/** JWT claims shape used across route-level auth helpers. */
export interface JwtClaims {
  sub: string;
  tenantId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Standalone JWT authentication — returns ServiceContext or null.
 * Used by routes that need JWT auth outside the main Hono middleware
 * (e.g. SSE endpoints accepting ?token= query params).
 */
export async function authenticateJwt(token: string): Promise<ServiceContext | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const claims = payload as unknown as JwtClaims;
    if (!claims.tenantId || !claims.sub || !claims.role) return null;
    return {
      tenantId: claims.tenantId,
      userId: claims.sub,
      role: claims.role as ServiceContext['role'],
      traceId: crypto.randomUUID(),
    };
  } catch {
    return null;
  }
}

/**
 * Auth middleware: extracts and validates JWT or API key.
 * Injects ServiceContext into the Hono context as 'ctx'.
 */
export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    throw new UnauthorizedError('Missing Authorization header');
  }

  // Agent SDK uses "ApiKey ag_live_..." header
  if (authHeader.startsWith('ApiKey ')) {
    const rawKey = authHeader.slice('ApiKey '.length).trim();
    await handleApiKeyAuth(c, rawKey);
    await next();
    return;
  }

  // Human users use "Bearer <JWT>" header
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    await handleJwtAuth(c, token);
    await next();
    return;
  }

  throw new UnauthorizedError('Invalid Authorization header format. Use "Bearer <token>" or "ApiKey <key>"');
}

async function handleJwtAuth(c: Context, token: string): Promise<void> {
  let claims: JwtClaims;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    });
    claims = payload as unknown as JwtClaims;
  } catch {
    throw new UnauthorizedError('Invalid or expired JWT token');
  }

  if (!claims.tenantId || !claims.sub || !claims.role) {
    throw new UnauthorizedError('JWT missing required claims (tenantId, sub, role)');
  }

  const ctx: ServiceContext = {
    tenantId: claims.tenantId,
    userId: claims.sub,
    role: claims.role,
    traceId: c.req.header('X-Trace-Id') ?? crypto.randomUUID(),
  };

  c.set('ctx', ctx);
}

async function handleApiKeyAuth(c: Context, rawKey: string): Promise<void> {
  const { createHash } = await import('node:crypto');
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  const agent = await prisma.agent.findUnique({
    where: { apiKeyHash: keyHash },
  });

  if (!agent || agent.deletedAt !== null) {
    throw new UnauthorizedError('Invalid API key');
  }

  if (agent.status === 'INACTIVE') {
    throw new UnauthorizedError('Agent is deregistered');
  }

  if (agent.apiKeyExpiresAt && agent.apiKeyExpiresAt < new Date()) {
    throw new UnauthorizedError('API key has expired');
  }

  // Update lastSeenAt
  void prisma.agent.update({
    where: { id: agent.id },
    data: { lastSeenAt: new Date() },
  });

  const ctx: ServiceContext = {
    tenantId: agent.tenantId,
    userId: agent.id,
    role: 'agent',
    traceId: c.req.header('X-Trace-Id') ?? crypto.randomUUID(),
  };

  c.set('ctx', ctx);
}

/** Get the ServiceContext from the current request — throws if not set. */
export function getContext(c: Context): ServiceContext {
  const ctx = c.get('ctx') as ServiceContext | undefined;
  if (!ctx) throw new UnauthorizedError('ServiceContext not set — did auth middleware run?');
  return ctx;
}
