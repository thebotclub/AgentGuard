/**
 * AgentGuard — Usage Tracking Middleware
 *
 * Tracks monthly evaluation event counts and unique agent counts.
 * Uses Redis when available, falls back to in-memory counters.
 *
 * Non-blocking: all increments are fire-and-forget — never slows requests.
 * Adds X-AgentGuard-Usage-Remaining header to responses.
 */
import { Request, Response, NextFunction } from 'express';
import type { LicenseContext } from '../lib/license-types.js';

// ── In-memory fallback storage ────────────────────────────────────────────

interface UsageBucket {
  eventsPerMonth: number;
  agentsMax: Set<string>;
  periodKey: string; // YYYY-MM
}

const inMemUsage = new Map<string, UsageBucket>();

function getCurrentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getOrCreateBucket(tenantId: string): UsageBucket {
  const period = getCurrentPeriod();
  let bucket = inMemUsage.get(tenantId);
  if (!bucket || bucket.periodKey !== period) {
    // New period — reset counters
    bucket = { eventsPerMonth: 0, agentsMax: new Set(), periodKey: period };
    inMemUsage.set(tenantId, bucket);
  }
  return bucket;
}

// ── Redis client (optional, re-uses the same lazy pattern as redis-rate-limiter) ─

type RedisLike = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  sadd(key: string, ...members: string[]): Promise<number>;
  scard(key: string): Promise<number>;
};

let _redis: RedisLike | null = null;
let _redisReady = false;
let _redisChecked = false;

async function getRedis(): Promise<RedisLike | null> {
  if (_redisChecked) return _redisReady ? _redis : null;
  _redisChecked = true;

  const url = process.env['REDIS_URL'];
  if (!url) return null;

  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 3000,
      enableOfflineQueue: false,
    });
    await client.connect();
    _redis = client as unknown as RedisLike;
    _redisReady = true;
    return _redis;
  } catch {
    return null;
  }
}

// ── Core usage increment functions ────────────────────────────────────────

/**
 * Increment the monthly event counter for a tenant.
 * Returns { current, limit } for header injection.
 * Non-blocking when awaited inside fire-and-forget.
 */
async function incrementEventCount(
  tenantId: string,
  limit: number,
): Promise<{ current: number; limit: number }> {
  const period = getCurrentPeriod();
  const redisKey = `usage:events:${tenantId}:${period}`;

  try {
    const redis = await getRedis();
    if (redis) {
      const current = await redis.incr(redisKey);
      // Set TTL on first increment: 35 days covers billing cycle slop
      if (current === 1) {
        await redis.expire(redisKey, 35 * 24 * 3600);
      }
      return { current, limit };
    }
  } catch {
    // Fall through to in-memory
  }

  // In-memory fallback
  const bucket = getOrCreateBucket(tenantId);
  bucket.eventsPerMonth += 1;
  return { current: bucket.eventsPerMonth, limit };
}

/**
 * Track a unique agent ID for seat-count purposes.
 * Returns the current unique agent count.
 */
async function trackAgent(tenantId: string, agentId: string): Promise<number> {
  const period = getCurrentPeriod();
  const redisKey = `usage:agents:${tenantId}:${period}`;

  try {
    const redis = await getRedis();
    if (redis) {
      await redis.sadd(redisKey, agentId);
      await redis.expire(redisKey, 35 * 24 * 3600);
      return await redis.scard(redisKey);
    }
  } catch {
    // Fall through to in-memory
  }

  const bucket = getOrCreateBucket(tenantId);
  bucket.agentsMax.add(agentId);
  return bucket.agentsMax.size;
}

// ── Middleware ────────────────────────────────────────────────────────────

/**
 * Tracks usage for evaluate endpoints.
 * Mount AFTER auth middleware so tenantId is available.
 *
 * - Increments monthly event counter (fire-and-forget)
 * - Tracks unique agents (fire-and-forget)
 * - Adds X-AgentGuard-Usage-Remaining header before response
 *
 * Never throws — usage tracking failure must not break the request.
 */
export function createUsageTrackerMiddleware() {
  return function usageTracker(req: Request, res: Response, next: NextFunction): void {
    const tenantId = req.tenantId ?? 'demo';
    const license: LicenseContext | undefined = req.license;
    const agentId = req.agent?.id ?? req.body?.agentId ?? 'unknown';

    const eventsLimit = license?.limits.eventsPerMonth ?? 25_000;
    const agentsLimit = license?.limits.agentsMax ?? 5;

    // Fire-and-forget — do not await, never block the request
    void (async () => {
      try {
        const { current } = await incrementEventCount(tenantId, eventsLimit);

        // Also track agent
        const agentCount = await trackAgent(tenantId, agentId);

        // Inject usage into request for feature-gate middleware downstream
        const reqWithUsage = req as Request & { _usageCurrent?: Record<string, number> };
        reqWithUsage._usageCurrent = {
          eventsPerMonth: current,
          agentsMax: agentCount,
        };

        // Add remaining header if response not yet sent
        if (!res.headersSent) {
          const eventsRemaining = eventsLimit === -1 ? -1 : Math.max(0, eventsLimit - current);
          const agentsRemaining = agentsLimit === -1 ? -1 : Math.max(0, agentsLimit - agentCount);
          res.setHeader('X-AgentGuard-Usage-Remaining', `events=${eventsRemaining},agents=${agentsRemaining}`);
          res.setHeader('X-AgentGuard-Events-Used', String(current));
          res.setHeader('X-AgentGuard-Events-Limit', eventsLimit === -1 ? 'unlimited' : String(eventsLimit));
        }
      } catch {
        // Never throw — usage tracking is best-effort
      }
    })();

    next();
  };
}

/**
 * Read-only helper: get current usage for a tenant (for status endpoints).
 */
export async function getCurrentUsage(tenantId: string): Promise<{
  eventsPerMonth: number;
  agentsMax: number;
  period: string;
}> {
  const period = getCurrentPeriod();
  const eventsKey = `usage:events:${tenantId}:${period}`;
  const agentsKey = `usage:agents:${tenantId}:${period}`;

  try {
    const redis = await getRedis();
    if (redis) {
      const [eventsStr, agentCount] = await Promise.all([
        redis.get(eventsKey),
        redis.scard(agentsKey),
      ]);
      return {
        eventsPerMonth: eventsStr ? parseInt(eventsStr, 10) : 0,
        agentsMax: agentCount,
        period,
      };
    }
  } catch {
    // Fall through
  }

  const bucket = inMemUsage.get(tenantId);
  if (!bucket || bucket.periodKey !== period) {
    return { eventsPerMonth: 0, agentsMax: 0, period };
  }
  return {
    eventsPerMonth: bucket.eventsPerMonth,
    agentsMax: bucket.agentsMax.size,
    period,
  };
}
