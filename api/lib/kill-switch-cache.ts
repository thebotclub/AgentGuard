/**
 * AgentGuard — Kill Switch Redis Cache
 *
 * Thin cache layer in front of the DB for kill switch state.
 * On toggle: write DB first, then SET Redis key.
 * On evaluate: check Redis first; on miss/error, fall back to DB.
 *
 * Key format:
 *   killswitch:global      — global kill switch ("1" = active)
 *   killswitch:{tenantId}  — per-tenant kill switch ("1" = active)
 *
 * No TTL — explicit SET/DEL on toggle. Self-heals on Redis miss via DB fallback.
 */
import { getRedisClient } from './redis-rate-limiter.js';
import { logger } from './logger.js';

// ── Global kill switch ────────────────────────────────────────────────────

const GLOBAL_KEY = 'killswitch:global';

export async function getGlobalKillSwitchCached(): Promise<{ active: boolean; cached: boolean }> {
  try {
    const redis = getRedisClient();
    if (redis) {
      const val = await redis.get(GLOBAL_KEY);
      if (val !== null) {
        return { active: val === '1', cached: true };
      }
    }
  } catch {
    // Redis unavailable — fall through to DB
  }
  return { active: false, cached: false }; // caller must check DB on cache miss
}

export async function setGlobalKillSwitchCache(active: boolean): Promise<void> {
  try {
    const redis = getRedisClient();
    if (redis) {
      if (active) {
        await redis.set(GLOBAL_KEY, '1', 'EX', 86400); // 24h safety TTL
      } else {
        await redis.del(GLOBAL_KEY);
      }
    }
  } catch (err) {
    logger.warn('[kill-switch-cache] Redis write failed (DB is source of truth):', err instanceof Error ? err.message : err);
  }
}

// ── Per-tenant kill switch ────────────────────────────────────────────────

function tenantKey(tenantId: string): string {
  return `killswitch:${tenantId}`;
}

export async function getTenantKillSwitchCached(tenantId: string): Promise<{ active: boolean; cached: boolean }> {
  try {
    const redis = getRedisClient();
    if (redis) {
      const val = await redis.get(tenantKey(tenantId));
      if (val !== null) {
        return { active: val === '1', cached: true };
      }
    }
  } catch {
    // Redis unavailable — fall through to DB
  }
  return { active: false, cached: false };
}

export async function setTenantKillSwitchCache(tenantId: string, active: boolean): Promise<void> {
  try {
    const redis = getRedisClient();
    if (redis) {
      if (active) {
        await redis.set(tenantKey(tenantId), '1', 'EX', 86400);
      } else {
        await redis.del(tenantKey(tenantId));
      }
    }
  } catch (err) {
    logger.warn('[kill-switch-cache] Redis write failed (DB is source of truth):', err instanceof Error ? err.message : err);
  }
}
