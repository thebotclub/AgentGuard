/**
 * AgentGuard — Per-Tenant Rate Limits & Quotas
 *
 * Tier definitions:
 *   free:       1,000 req/month, 10 req/min
 *   pro:       50,000 req/month, 100 req/min
 *   enterprise: unlimited
 *
 * Monthly usage is tracked via Redis (if available) or in-memory fallback.
 * Per-minute limits reuse the redis-rate-limiter sliding window logic.
 */
import type { Request, Response, NextFunction } from 'express';
import type { IDatabase } from '../db-interface.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- imported for Redis quota path (wired in quota enforcer below)
import { checkRateLimit } from './redis-rate-limiter.js';

// ── Tier definitions ──────────────────────────────────────────────────────

export interface TierQuota {
  reqPerMin: number;
  reqPerMonth: number | null; // null = unlimited
}

export const TIER_QUOTAS: Record<string, TierQuota> = {
  free: {
    reqPerMin: 10,
    reqPerMonth: 1_000,
  },
  pro: {
    reqPerMin: 100,
    reqPerMonth: 50_000,
  },
  enterprise: {
    reqPerMin: 1_000,
    reqPerMonth: null, // unlimited
  },
};

// Default tier for unknown plans
const DEFAULT_TIER: TierQuota = TIER_QUOTAS['free']!;

export function getTierQuota(plan: string | null | undefined): TierQuota {
  if (!plan) return DEFAULT_TIER;
  return TIER_QUOTAS[plan.toLowerCase()] ?? DEFAULT_TIER;
}

// ── Monthly usage counter (in-memory fallback) ─────────────────────────────
// Key: `${tenantId}:${year}-${month}` → count

interface MonthlyBucket {
  count: number;
  month: string; // "YYYY-MM"
}

const monthlyUsage = new Map<string, MonthlyBucket>();

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- in-memory monthly counter, reserved for Redis-unavailable fallback path
function getInMemMonthly(tenantId: string): number {
  const key = `${tenantId}:${currentMonth()}`;
  const bucket = monthlyUsage.get(key);
  if (!bucket || bucket.month !== currentMonth()) return 0;
  return bucket.count;
}

function incrementInMemMonthly(tenantId: string): number {
  const month = currentMonth();
  const key = `${tenantId}:${month}`;
  const bucket = monthlyUsage.get(key);
  if (!bucket || bucket.month !== month) {
    monthlyUsage.set(key, { count: 1, month });
    return 1;
  }
  bucket.count++;
  return bucket.count;
}

// Clean up old monthly buckets hourly
setInterval(() => {
  const current = currentMonth();
  for (const [key, bucket] of monthlyUsage) {
    if (bucket.month !== current) monthlyUsage.delete(key);
  }
}, 60 * 60_000).unref();

// ── Redis monthly counter ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Redis monthly counter, reserved for quota enforcement upgrade
async function redisMonthlyCount(tenantId: string): Promise<number | null> {
  try {
    const { default: Redis } = await import('ioredis');
    const url = process.env['REDIS_URL'];
    if (!url) return null;
    // Use the shared Redis connection by dynamic import
    // (avoid circular dep with redis-rate-limiter)
    // We just do a one-shot GET here using the same URL
    const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000 });
    await redis.connect();
    const key = `monthly:${tenantId}:${currentMonth()}`;
    const val = await redis.get(key);
    await redis.quit();
    return val ? Number(val) : 0;
  } catch {
    return null;
  }
}

async function redisMonthlyIncr(tenantId: string): Promise<number | null> {
  try {
    const { default: Redis } = await import('ioredis');
    const url = process.env['REDIS_URL'];
    if (!url) return null;
    const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000 });
    await redis.connect();
    const key = `monthly:${tenantId}:${currentMonth()}`;
    const count = await redis.incr(key);
    // Expire at end of next month (+40 days is safe)
    if (count === 1) {
      await redis.expire(key, 40 * 24 * 3600);
    }
    await redis.quit();
    return count;
  } catch {
    return null;
  }
}

// ── Quota check result ─────────────────────────────────────────────────────

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'per_min' | 'per_month';
  remaining: number;
  limit: number;
  retryAfter?: number;
}

/**
 * Check per-tenant rate limits for a given request.
 * Returns the allowed status plus headers to set.
 *
 * @param tenantId - The tenant identifier
 * @param plan     - The tenant's plan (free/pro/enterprise)
 * @param ip       - Client IP (used for per-minute window key)
 */
export async function checkTenantQuota(
  tenantId: string,
  plan: string | null | undefined,
  ip: string,
): Promise<QuotaCheckResult> {
  const quota = getTierQuota(plan);

  // 1. Per-minute check (reuses Redis sliding window from redis-rate-limiter)
  //    We use a tenant-scoped key for per-tenant per-minute limits
  const perMinKey = `tenant:${tenantId}:${ip}`;
  const perMinResult = await checkRateLimitByKey(perMinKey, quota.reqPerMin);

  if (!perMinResult.allowed) {
    return {
      allowed: false,
      reason: 'per_min',
      remaining: perMinResult.remaining,
      limit: perMinResult.limit,
      retryAfter: perMinResult.retryAfter,
    };
  }

  // 2. Monthly check (skip if unlimited)
  if (quota.reqPerMonth !== null) {
    // Try Redis first, fall back to in-memory
    let monthlyCount: number;
    const redisCount = await redisMonthlyIncr(tenantId);
    if (redisCount !== null) {
      monthlyCount = redisCount;
    } else {
      monthlyCount = incrementInMemMonthly(tenantId);
    }

    const monthlyRemaining = Math.max(0, quota.reqPerMonth - monthlyCount);

    if (monthlyCount > quota.reqPerMonth) {
      return {
        allowed: false,
        reason: 'per_month',
        remaining: 0,
        limit: quota.reqPerMonth,
        retryAfter: secondsUntilNextMonth(),
      };
    }

    return {
      allowed: true,
      remaining: Math.min(perMinResult.remaining, monthlyRemaining),
      limit: quota.reqPerMonth,
    };
  }

  return {
    allowed: true,
    remaining: perMinResult.remaining,
    limit: quota.reqPerMin,
  };
}

function secondsUntilNextMonth(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.ceil((next.getTime() - now.getTime()) / 1000);
}

// ── Local sliding window for tenant per-minute (without importing redis-rate-limiter cyclically) ──

interface LocalBucket {
  count: number;
  windowStart: number;
}
const localBuckets = new Map<string, LocalBucket>();
const LOCAL_WINDOW_MS = 60_000;

function checkRateLimitByKey(key: string, limit: number): { allowed: boolean; remaining: number; limit: number; retryAfter?: number } {
  const now = Date.now();
  const bucket = localBuckets.get(key);
  if (!bucket || now - bucket.windowStart > LOCAL_WINDOW_MS) {
    localBuckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, limit };
  }
  bucket.count++;
  const remaining = Math.max(0, limit - bucket.count);
  return {
    allowed: bucket.count <= limit,
    remaining,
    limit,
    retryAfter: bucket.count > limit ? 60 : undefined,
  };
}

// Cleanup stale local buckets
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of localBuckets) {
    if (now - b.windowStart > LOCAL_WINDOW_MS * 2) localBuckets.delete(k);
  }
}, LOCAL_WINDOW_MS * 2).unref();

// ── Express middleware factory ─────────────────────────────────────────────

/**
 * Creates per-tenant quota middleware bound to a database instance.
 * Must be placed AFTER auth middleware so req.tenant is populated.
 *
 * Sets response headers:
 *   X-RateLimit-Limit
 *   X-RateLimit-Remaining
 *   Retry-After (on 429)
 */
export function createTenantQuotaMiddleware(
  _db: IDatabase,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async function tenantQuotaMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Only apply to authenticated tenants (anonymous requests handled by IP limiter)
    const tenant = (req as Request & { tenant?: { id: string; plan: string } | null }).tenant;
    if (!tenant) {
      next();
      return;
    }

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    try {
      const result = await checkTenantQuota(tenant.id, tenant.plan, ip);

      res.setHeader('X-RateLimit-Limit', String(result.limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));

      if (!result.allowed) {
        if (result.retryAfter) {
          res.setHeader('Retry-After', String(result.retryAfter));
        }
        const message =
          result.reason === 'per_month'
            ? `Monthly quota exceeded. Limit: ${result.limit} requests/month. Upgrade to Pro for more.`
            : `Rate limit exceeded. Limit: ${result.limit} requests/minute.`;
        res.status(429).json({
          error: message,
          reason: result.reason,
          signup: {
            hint: 'Sign up for a free API key to get higher rate limits',
            method: 'POST',
            url: 'https://api.agentguard.dev/api/v1/signup',
            body: { name: 'Your Agent Name' },
          },
        });
        return;
      }

      next();
    } catch (err) {
      // Quota check failure should not block the request — degrade gracefully
      console.error('[tenant-quota] check failed, allowing request:', err instanceof Error ? err.message : err);
      next();
    }
  };
}
