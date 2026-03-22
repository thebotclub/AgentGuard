/**
 * Per-Tenant Rate Limiting Middleware
 *
 * Strategy:
 *  - Fixed-window counter per tenant, keyed by minute
 *  - Limits are tier-based (Free / Team / Business / Enterprise)
 *  - Redis-backed with atomic Lua increment; graceful in-memory fallback if Redis is down
 *  - Response headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 *  - 429 Too Many Requests + Retry-After header when limit exceeded
 *
 * Rate limits (per minute):
 *   FREE:        100  req/min
 *   TEAM:      1,000  req/min
 *   BUSINESS:  5,000  req/min
 *   ENTERPRISE: 10,000 req/min
 */

import type { Context, Next } from 'hono';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { getContext } from './auth.js';

// ─── Plan limits ──────────────────────────────────────────────────────────────

const PLAN_LIMITS: Record<string, number> = {
  FREE: 100,
  TEAM: 1_000,
  BUSINESS: 5_000,
  ENTERPRISE: 10_000,
} as const;

const DEFAULT_LIMIT = PLAN_LIMITS['FREE']!;
const WINDOW_SECONDS = 60; // 1-minute fixed window

// ─── In-memory fallback (used when Redis is unavailable) ──────────────────────

interface InMemoryBucket {
  count: number;
  windowStart: number; // epoch seconds
}

const inMemoryStore = new Map<string, InMemoryBucket>();

function inMemoryIncrement(key: string, windowSeconds: number): { count: number; windowStart: number } {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds); // floor to window boundary
  const existing = inMemoryStore.get(key);

  if (!existing || existing.windowStart !== windowStart) {
    const bucket: InMemoryBucket = { count: 1, windowStart };
    inMemoryStore.set(key, bucket);
    // Cleanup old entries periodically (simple GC: every 1000 inserts)
    if (inMemoryStore.size > 10_000) {
      for (const [k, v] of inMemoryStore.entries()) {
        if (v.windowStart < windowStart - windowSeconds) inMemoryStore.delete(k);
      }
    }
    return bucket;
  }

  existing.count += 1;
  return existing;
}

// ─── Lua script for atomic Redis fixed-window increment ───────────────────────
//
// KEYS[1] = rate limit key  e.g. "ratelimit:tenant123:2026031515"
// ARGV[1] = window TTL in seconds
//
// Returns the new count after increment.
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

// ─── Tenant plan cache (avoid DB lookup on every request) ─────────────────────

const planCache = new Map<string, { plan: string; fetchedAt: number }>();
const PLAN_CACHE_TTL_MS = 60_000; // 1 minute

async function getTenantPlan(tenantId: string): Promise<string> {
  const cached = planCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < PLAN_CACHE_TTL_MS) {
    return cached.plan;
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    const plan = tenant?.plan ?? 'FREE';
    planCache.set(tenantId, { plan, fetchedAt: Date.now() });
    return plan;
  } catch {
    // DB unavailable — use cached value if stale, or default
    return cached?.plan ?? 'FREE';
  }
}

// ─── Rate limit middleware ────────────────────────────────────────────────────

/**
 * Per-tenant rate limiting. Must run after authMiddleware (requires ctx.tenantId).
 * Skips rate limiting for the health route (no auth context).
 */
export async function rateLimitMiddleware(c: Context, next: Next): Promise<void> {
  let tenantId: string;
  try {
    const ctx = getContext(c);
    tenantId = ctx.tenantId;
  } catch {
    // No auth context (e.g. health endpoint) — skip rate limiting
    await next();
    return;
  }

  // Resolve limit for tenant plan
  const plan = await getTenantPlan(tenantId);
  const limit = PLAN_LIMITS[plan] ?? DEFAULT_LIMIT;

  // Fixed-window key: "ratelimit:v1:<tenantId>:<minute-epoch>"
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % WINDOW_SECONDS);
  const windowKey = `ratelimit:v1:${tenantId}:${windowStart}`;
  const resetAt = windowStart + WINDOW_SECONDS;

  let count = 1;
  let usingFallback = false;

  // Try Redis first
  try {
    const result = await redis.eval(RATE_LIMIT_LUA, 1, windowKey, String(WINDOW_SECONDS));
    count = Number(result);
  } catch (err) {
    // Redis down — fall back to in-memory
    usingFallback = true;
    const bucket = inMemoryIncrement(windowKey, WINDOW_SECONDS);
    count = bucket.count;
    console.warn('[rate-limit] Redis unavailable, using in-memory fallback:', (err as Error).message);
  }

  const remaining = Math.max(0, limit - count);

  // Set rate limit headers on every response
  c.res = new Response(c.res.body, c.res);
  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(remaining));
  c.header('X-RateLimit-Reset', String(resetAt));
  c.header('X-RateLimit-Policy', `${limit};w=${WINDOW_SECONDS}`);
  if (usingFallback) {
    c.header('X-RateLimit-Source', 'memory');
  }

  if (count > limit) {
    const retryAfter = resetAt - now;
    c.header('Retry-After', String(retryAfter));
    c.status(429);
    c.json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. ${plan} plan allows ${limit} requests per minute.`,
        limit,
        remaining: 0,
        resetAt: new Date(resetAt * 1000).toISOString(),
        retryAfter,
      },
    });
    return;
  }

  await next();
}
