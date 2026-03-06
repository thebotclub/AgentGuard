/**
 * AgentGuard — License Manager (Singleton)
 *
 * Manages the entire license lifecycle:
 *   - Startup: reads AGENTGUARD_LICENSE_KEY env var, validates
 *   - Background: re-validates every 60 minutes
 *   - Usage tracking: monthly event counter (Redis if available, in-memory fallback)
 *   - Feature/limit checks
 *   - SIGHUP handler for hot-reload of license key
 *   - Graceful degradation: no key → free tier defaults
 *
 * Usage:
 *   const mgr = LicenseManager.getInstance();
 *   await mgr.initialize();
 *   const ctx = mgr.getLicenseContext();
 */
import type { LicenseContext, LicenseFeature } from './license-types.js';
import {
  validateLicenseKeyCached,
  buildLicenseContext,
  buildFreeLicenseContext,
  invalidateCache,
  isExpired,
  InvalidSignatureError,
} from './license-validator.js';
import { logger } from './logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CheckLimitResult {
  allowed: boolean;
  remaining: number;
  current: number;
  limit: number;
}

// ── In-memory usage counter (Redis fallback) ──────────────────────────────────

interface UsageBucket {
  count: number;
  month: string; // "YYYY-MM"
}

const inMemUsage = new Map<string, UsageBucket>();

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function inMemIncrement(tenantId: string): number {
  const month = currentMonth();
  const key = `${tenantId}:${month}`;
  const bucket = inMemUsage.get(key);
  if (!bucket || bucket.month !== month) {
    inMemUsage.set(key, { count: 1, month });
    return 1;
  }
  bucket.count++;
  return bucket.count;
}

function inMemGet(tenantId: string): number {
  const month = currentMonth();
  const key = `${tenantId}:${month}`;
  const bucket = inMemUsage.get(key);
  if (!bucket || bucket.month !== month) return 0;
  return bucket.count;
}

// Clean stale buckets hourly
setInterval(() => {
  const current = currentMonth();
  for (const [key, bucket] of inMemUsage) {
    if (bucket.month !== current) inMemUsage.delete(key);
  }
}, 60 * 60_000).unref();

// ── Redis helpers (optional, lazy-loaded) ─────────────────────────────────────

type RedisLike = {
  incr(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  expire(key: string, seconds: number): Promise<unknown>;
};

let _redis: RedisLike | null = null;
let _redisAvailable = false;
let _redisChecked = false;

async function getRedis(): Promise<RedisLike | null> {
  if (_redisChecked) return _redisAvailable ? _redis : null;
  _redisChecked = true;

  const url = process.env['REDIS_URL'];
  if (!url) return null;

  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy: (times: number) => (times > 2 ? null : times * 200),
    });
    await client.connect();
    await client.ping();
    _redis = client as unknown as RedisLike;
    _redisAvailable = true;
    logger.info('[license-manager] Redis connected for usage tracking');
    return _redis;
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, '[license-manager] Redis unavailable, using in-memory usage tracking');
    return null;
  }
}

async function redisIncrement(tenantId: string): Promise<number | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const key = `license:usage:${tenantId}:${currentMonth()}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 40 * 24 * 3600); // 40 days
    return count;
  } catch {
    _redisAvailable = false;
    return null;
  }
}

async function redisGet(tenantId: string): Promise<number | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const key = `license:usage:${tenantId}:${currentMonth()}`;
    const val = await redis.get(key);
    return val ? Number(val) : 0;
  } catch {
    _redisAvailable = false;
    return null;
  }
}

// ── LicenseManager singleton ──────────────────────────────────────────────────

export class LicenseManager {
  private static _instance: LicenseManager | null = null;

  private _context: LicenseContext;
  private _revalidationTimer: ReturnType<typeof setInterval> | null = null;
  private _initialized = false;

  private constructor() {
    // Default: free tier until initialized
    this._context = buildFreeLicenseContext('default');
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): LicenseManager {
    if (!LicenseManager._instance) {
      LicenseManager._instance = new LicenseManager();
    }
    return LicenseManager._instance;
  }

  /**
   * Reset the singleton (for testing only).
   */
  static _resetForTesting(): void {
    if (LicenseManager._instance) {
      LicenseManager._instance._stopRevalidation();
      LicenseManager._instance = null;
    }
    invalidateCache();
  }

  /**
   * Initialize the license manager.
   * Must be called once at startup.
   *
   * - BAD SIGNATURE → throws (caller should exit 1)
   * - EXPIRED / no key → degrades to free tier
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;

    const keyString = process.env['AGENTGUARD_LICENSE_KEY'];

    if (!keyString) {
      logger.info('[LICENSE] No key configured — running in Free mode');
      this._context = buildFreeLicenseContext('default');
      return;
    }

    await this._validateAndSet(keyString, true);
    this._startRevalidation();
    this._registerSighup();
  }

  /**
   * Validate and set the license context.
   *
   * @param keyString - AGKEY-* string
   * @param hardFailOnBadSig - If true, re-throws InvalidSignatureError (startup)
   */
  private async _validateAndSet(keyString: string, hardFailOnBadSig: boolean): Promise<void> {
    try {
      const payload = validateLicenseKeyCached(keyString);

      if (isExpired(payload)) {
        logger.warn({ tier: payload.tier, exp: new Date(payload.exp * 1000).toISOString() }, '[LICENSE] License key is expired — degrading to Free mode');
        this._context = buildFreeLicenseContext(payload.tid);
        return;
      }

      this._context = buildLicenseContext(payload, 'key');
      logger.info({ tier: payload.tier, exp: new Date(payload.exp * 1000).toISOString(), features: payload.features }, `[LICENSE] Active — Tier: ${payload.tier.toUpperCase()}, Tenant: ${payload.tid}`);
    } catch (err) {
      if (err instanceof InvalidSignatureError) {
        logger.error({ error: err.message }, '[LICENSE] INVALID SIGNATURE — license key rejected');
        if (hardFailOnBadSig) throw err;
        // During background re-validation, keep existing context
        return;
      }
      // Other errors → degrade gracefully
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, '[LICENSE] License validation failed — degrading to Free mode');
      this._context = buildFreeLicenseContext('default');
    }
  }

  /**
   * Start background re-validation loop (every 60 minutes).
   */
  private _startRevalidation(): void {
    this._revalidationTimer = setInterval(
      () => void this._revalidate(),
      60 * 60 * 1000,
    );
    this._revalidationTimer.unref?.();
  }

  private _stopRevalidation(): void {
    if (this._revalidationTimer) {
      clearInterval(this._revalidationTimer);
      this._revalidationTimer = null;
    }
  }

  private async _revalidate(): Promise<void> {
    const keyString = process.env['AGENTGUARD_LICENSE_KEY'];
    if (!keyString) {
      this._context = buildFreeLicenseContext('default');
      return;
    }
    invalidateCache(); // Force re-read from key (not cache)
    await this._validateAndSet(keyString, false);
  }

  /**
   * SIGHUP handler — hot-reload the license key without restart.
   */
  private _registerSighup(): void {
    process.on('SIGHUP', () => {
      logger.info('[LICENSE] SIGHUP received — hot-reloading license key');
      invalidateCache();
      void this._revalidate();
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Get the current LicenseContext.
   * Always returns a valid context (free tier as fallback).
   */
  getLicenseContext(): LicenseContext {
    return this._context;
  }

  /**
   * Check whether a feature flag is enabled.
   * Returns false if no valid license (free tier has no features).
   */
  checkFeature(feature: LicenseFeature | string): boolean {
    return this._context.features.has(feature);
  }

  /**
   * Check whether a resource limit allows the current usage.
   * Increments the monthly event counter.
   *
   * @param limit - 'eventsPerMonth' | 'agentsMax' | 'hitlConcurrent'
   * @param currentValue - Current usage value (for non-event limits)
   */
  async checkLimit(limit: string, currentValue?: number): Promise<CheckLimitResult> {
    const ctx = this._context;

    if (limit === 'eventsPerMonth') {
      const maxEvents = ctx.limits.eventsPerMonth;

      // -1 = unlimited
      if (maxEvents === -1) {
        return { allowed: true, remaining: -1, current: 0, limit: -1 };
      }

      const tenantId = ctx.tenantId;
      let current: number;

      const redisCount = await redisIncrement(tenantId);
      if (redisCount !== null) {
        current = redisCount;
      } else {
        current = inMemIncrement(tenantId);
      }

      const remaining = Math.max(0, maxEvents - current);
      return { allowed: current <= maxEvents, remaining, current, limit: maxEvents };
    }

    // For non-event limits, use currentValue directly
    const val = currentValue ?? 0;
    const maxVal = ctx.limits[limit as keyof typeof ctx.limits] as number | undefined;

    if (maxVal === undefined) {
      return { allowed: true, remaining: -1, current: val, limit: -1 };
    }

    if (maxVal === -1) {
      return { allowed: true, remaining: -1, current: val, limit: -1 };
    }

    const remaining = Math.max(0, maxVal - val);
    return { allowed: val < maxVal, remaining, current: val, limit: maxVal };
  }

  /**
   * Get current monthly event usage count (without incrementing).
   */
  async getCurrentUsage(): Promise<number> {
    const tenantId = this._context.tenantId;
    const redisCount = await redisGet(tenantId);
    if (redisCount !== null) return redisCount;
    return inMemGet(tenantId);
  }

  /**
   * Force a re-validation cycle (e.g., after key change).
   */
  async reload(): Promise<void> {
    invalidateCache();
    await this._revalidate();
  }
}
