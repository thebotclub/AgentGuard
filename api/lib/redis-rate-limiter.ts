/**
 * AgentGuard — Redis-backed Rate Limiter
 *
 * Sliding window algorithm using Redis sorted sets.
 * Falls back to in-memory counters if Redis is unavailable.
 *
 * Key format: rl:{auth|unauth}:{ip}:{windowBucket}
 * Brute-force:  bf:{ip}
 */
import { recordFailedAttempt, isBlocked, clearAttempts } from './brute-force.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfter?: number; // seconds
}

export interface BruteForceResult {
  blocked: boolean;
  retryAfter?: number; // seconds
}

// ── Constants ──────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000;           // 1 minute sliding window
const AUTH_LIMIT = 100;             // authenticated req/min
const UNAUTH_LIMIT = 10;            // unauthenticated req/min
const BF_MAX_ATTEMPTS = 10;         // max failed auth attempts
const BF_WINDOW_MS = 15 * 60_000;  // 15 minute window
const BF_BLOCK_MS = 30 * 60_000;   // 30 minute block

// ── In-memory fallback ─────────────────────────────────────────────────────

interface InMemBucket {
  count: number;
  windowStart: number;
}

interface InMemBfRecord {
  count: number;
  firstAttempt: number;
  blockedUntil: number;
}

const inMemRl = new Map<string, InMemBucket>();
const inMemBf = new Map<string, InMemBfRecord>();

// Cleanup stale in-memory entries
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of inMemRl) {
    if (now - b.windowStart > WINDOW_MS * 2) inMemRl.delete(k);
  }
  for (const [ip, r] of inMemBf) {
    if (now - r.firstAttempt > BF_WINDOW_MS * 2 && now > r.blockedUntil) {
      inMemBf.delete(ip);
    }
  }
}, WINDOW_MS * 2).unref();

function inMemCheck(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const bucket = inMemRl.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    inMemRl.set(key, { count: 1, windowStart: now });
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

function inMemBfRecord(ip: string): void {
  const now = Date.now();
  const record = inMemBf.get(ip);
  if (!record || now - record.firstAttempt > BF_WINDOW_MS) {
    inMemBf.set(ip, { count: 1, firstAttempt: now, blockedUntil: 0 });
    return;
  }
  record.count++;
  if (record.count >= BF_MAX_ATTEMPTS) {
    record.blockedUntil = now + BF_BLOCK_MS;
  }
}

function inMemBfCheck(ip: string): BruteForceResult {
  const record = inMemBf.get(ip);
  if (!record) return { blocked: false };
  const now = Date.now();
  if (now < record.blockedUntil) {
    return { blocked: true, retryAfter: Math.ceil((record.blockedUntil - now) / 1000) };
  }
  return { blocked: false };
}

function inMemBfClear(ip: string): void {
  inMemBf.delete(ip);
}

// ── Redis client (lazy, optional) ─────────────────────────────────────────

type RedisLike = {
  status: string;
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zremrangebyscore(key: string, min: string | number, max: number): Promise<unknown>;
  zcard(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exMode: string, ex: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  ttl(key: string): Promise<number>;
};

let redisClient: RedisLike | null = null;
let redisAvailable = false;
let redisInitialized = false;

async function getRedis(): Promise<RedisLike | null> {
  if (redisInitialized) return redisAvailable ? redisClient : null;
  redisInitialized = true;

  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    // Redis not configured — use in-memory only
    return null;
  }

  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });

    await client.connect();
    await client.ping();

    client.on('error', (err: Error) => {
      if (redisAvailable) {
        console.warn('[redis-rl] connection error, falling back to in-memory:', err.message);
        redisAvailable = false;
      }
    });

    client.on('ready', () => {
      if (!redisAvailable) {
        console.info('[redis-rl] reconnected');
        redisAvailable = true;
      }
    });

    redisClient = client as unknown as RedisLike;
    redisAvailable = true;
    console.info('[redis-rl] connected:', redisUrl.replace(/:[^:@]*@/, ':***@'));
    return redisClient;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[redis-rl] unavailable, using in-memory fallback:', msg);
    return null;
  }
}

// ── Redis sliding window (sorted set) ─────────────────────────────────────

/**
 * Sliding window rate limiter using Redis sorted sets.
 * Each member is a unique request ID (timestamp:random) scored by epoch ms.
 * We trim members older than the window, then count what remains.
 */
async function redisCheck(
  redis: RedisLike,
  key: string,
  limit: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const member = `${now}:${Math.random().toString(36).slice(2)}`;
  const redisKey = `rl:${key}`;

  try {
    // Add current request, remove expired entries, count remaining
    await redis.zadd(redisKey, now, member);
    await redis.zremrangebyscore(redisKey, '-inf', windowStart);
    const count = await redis.zcard(redisKey);
    // Set expiry so keys self-clean (2× window)
    await redis.expire(redisKey, Math.ceil((WINDOW_MS * 2) / 1000));

    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;
    return {
      allowed,
      remaining,
      limit,
      retryAfter: !allowed ? 60 : undefined,
    };
  } catch (err) {
    // Redis error during operation — fall back to in-memory
    console.warn('[redis-rl] operation failed, using in-memory:', err instanceof Error ? err.message : err);
    redisAvailable = false;
    return inMemCheck(key, limit);
  }
}

// ── Redis brute-force tracker ──────────────────────────────────────────────

async function redisBfRecord(redis: RedisLike, ip: string): Promise<void> {
  const counterKey = `bf:count:${ip}`;
  const blockKey = `bf:block:${ip}`;
  const firstKey = `bf:first:${ip}`;
  const now = Date.now();

  try {
    // Set first-attempt timestamp if not set (expires after window)
    const existing = await redis.get(firstKey);
    if (!existing) {
      await redis.set(firstKey, String(now), 'EX', Math.ceil(BF_WINDOW_MS / 1000));
      await redis.set(counterKey, '0', 'EX', Math.ceil(BF_WINDOW_MS / 1000));
    }

    // Check if the window has expired (first attempt was too long ago)
    const firstTs = Number(await redis.get(firstKey) ?? now);
    if (now - firstTs > BF_WINDOW_MS) {
      // Reset window
      await redis.set(firstKey, String(now), 'EX', Math.ceil(BF_WINDOW_MS / 1000));
      await redis.set(counterKey, '1', 'EX', Math.ceil(BF_WINDOW_MS / 1000));
      return;
    }

    const count = await redis.incr(counterKey);
    if (count >= BF_MAX_ATTEMPTS) {
      await redis.set(blockKey, '1', 'EX', Math.ceil(BF_BLOCK_MS / 1000));
    }
  } catch (err) {
    console.warn('[redis-rl] bf record failed:', err instanceof Error ? err.message : err);
    // Fall back to in-memory
    recordFailedAttempt(ip);
  }
}

async function redisBfCheck(redis: RedisLike, ip: string): Promise<BruteForceResult> {
  const blockKey = `bf:block:${ip}`;
  try {
    const blocked = await redis.get(blockKey);
    if (blocked) {
      const ttl = await redis.ttl(blockKey);
      return { blocked: true, retryAfter: ttl > 0 ? ttl : Math.ceil(BF_BLOCK_MS / 1000) };
    }
    return { blocked: false };
  } catch (err) {
    console.warn('[redis-rl] bf check failed:', err instanceof Error ? err.message : err);
    // Fall back to in-memory
    return { blocked: isBlocked(ip) };
  }
}

async function redisBfClear(redis: RedisLike, ip: string): Promise<void> {
  try {
    await redis.del(`bf:count:${ip}`);
    await redis.del(`bf:first:${ip}`);
    await redis.del(`bf:block:${ip}`);
  } catch {
    // Non-critical
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Check the rate limit for an IP.
 * @param ip - Client IP address
 * @param authenticated - Whether the request is authenticated (higher limit)
 * @returns RateLimitResult with allowed, remaining, limit, retryAfter
 */
export async function checkRateLimit(
  ip: string,
  authenticated: boolean,
): Promise<RateLimitResult> {
  const limit = authenticated ? AUTH_LIMIT : UNAUTH_LIMIT;
  const bucket = authenticated ? 'auth' : 'unauth';
  const key = `${bucket}:${ip}`;

  const redis = await getRedis();
  if (redis && redisAvailable) {
    return redisCheck(redis, key, limit);
  }
  return inMemCheck(key, limit);
}

/**
 * Record a failed authentication attempt for an IP.
 * Used for brute-force protection.
 */
export async function recordBruteForce(ip: string): Promise<void> {
  const redis = await getRedis();
  if (redis && redisAvailable) {
    await redisBfRecord(redis, ip);
  } else {
    // Fall back to in-memory brute-force tracker
    recordFailedAttempt(ip);
  }
}

/**
 * Check if an IP is blocked due to too many failed auth attempts.
 */
export async function checkBruteForce(ip: string): Promise<BruteForceResult> {
  const redis = await getRedis();
  if (redis && redisAvailable) {
    return redisBfCheck(redis, ip);
  }
  // Fall back to in-memory
  return { blocked: isBlocked(ip) };
}

/**
 * Clear brute-force state for an IP (on successful auth).
 */
export async function clearBruteForce(ip: string): Promise<void> {
  const redis = await getRedis();
  if (redis && redisAvailable) {
    await redisBfClear(redis, ip);
  } else {
    clearAttempts(ip);
  }
}

/**
 * Returns true if Redis is currently connected and available.
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}
