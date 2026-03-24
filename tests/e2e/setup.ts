/**
 * E2E Test Setup
 *
 * Provides shared helpers, constants, and graceful-skip logic for the E2E suite.
 * Every test file imports from here.
 *
 * Prerequisites (local):
 *   docker compose -f docker-compose.test.yml up -d
 *   DATABASE_URL=postgresql://test:test@localhost:5433/agentguard_test
 *   REDIS_URL=redis://localhost:6380
 *   JWT_SECRET=test-jwt-secret-for-e2e-only
 *   npx tsx tests/e2e/seed.ts  (once per test run)
 *   PORT=3001 npx tsx packages/api/src/index.ts &
 */

import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';

// ─── Base URL ─────────────────────────────────────────────────────────────────

export const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3001';

// ─── JWT helper ───────────────────────────────────────────────────────────────

const JWT_SECRET_RAW = process.env['JWT_SECRET'] ?? 'test-jwt-secret-for-e2e-only';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

export interface JWTClaims {
  tenantId: string;
  userId: string;
  role: string;
  expiresIn?: number; // seconds, default 3600
}

/**
 * Signs a JWT with the test secret.
 * Use role 'owner' or 'admin' for admin operations.
 */
export async function makeJWT(claims: JWTClaims): Promise<string> {
  const expiresIn = claims.expiresIn ?? 3600;
  return new SignJWT({
    sub: claims.userId,
    tenantId: claims.tenantId,
    role: claims.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(JWT_SECRET);
}

/**
 * Makes an expired JWT (exp in the past).
 */
export async function makeExpiredJWT(claims: JWTClaims): Promise<string> {
  return new SignJWT({
    sub: claims.userId,
    tenantId: claims.tenantId,
    role: claims.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // issued 2h ago
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // expired 1h ago
    .sign(JWT_SECRET);
}

// ─── HTTP request helper ──────────────────────────────────────────────────────

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  jwt?: string;
  apiKey?: string;
}

export interface ApiResponse<T = Record<string, unknown>> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

export async function request<T = Record<string, unknown>>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, headers = {}, jwt, apiKey } = options;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (jwt) {
    reqHeaders['Authorization'] = `Bearer ${jwt}`;
  } else if (apiKey) {
    reqHeaders['Authorization'] = `ApiKey ${apiKey}`;
  }

  const opts: RequestInit = {
    method,
    headers: reqHeaders,
  };

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, opts);

  let responseBody: T;
  const contentType = res.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      responseBody = (await res.json()) as T;
    } else {
      responseBody = (await res.text()) as unknown as T;
    }
  } catch {
    responseBody = {} as T;
  }

  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  return { status: res.status, body: responseBody, headers: responseHeaders };
}

// ─── Server availability check ────────────────────────────────────────────────

export async function isServerAvailable(
  retries = 3,
  delayMs = 500,
): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/v1/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return true;
    } catch {
      // not ready
    }
    if (i < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

/**
 * Skip a test suite gracefully if the server is not available.
 * Call at the top of each test file's beforeAll.
 */
export async function requireServer(
  skipMessage = 'E2E server not available — skipping',
): Promise<void> {
  const available = await isServerAvailable();
  if (!available) {
    console.warn(`\n⚠️  ${skipMessage}`);
    // Vitest doesn't have a native "skip all" mechanism in beforeAll,
    // so we throw a special error that the beforeAll handler can ignore,
    // while individual tests use the SKIP_E2E flag.
    process.env['SKIP_E2E'] = '1';
  }
}

/** Returns true if E2E tests should be skipped (server unavailable). */
export function shouldSkip(): boolean {
  return process.env['SKIP_E2E'] === '1';
}

// ─── Unique ID helpers ────────────────────────────────────────────────────────

let _counter = 0;
/** Generate a unique suffix for test data to avoid collisions. */
export function uid(prefix = ''): string {
  return `${prefix}${Date.now()}-${++_counter}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── SHA256 helper (for API key hashing checks) ───────────────────────────────
export function sha256(data: string): string {
  return createHmac('sha256', '').update(data).digest('hex');
}
