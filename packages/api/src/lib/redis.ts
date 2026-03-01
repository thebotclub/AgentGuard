/**
 * Redis client singleton using ioredis.
 * Used for: kill switch flags, HITL gate state, policy bundle cache, rate limits.
 */
import Redis from 'ioredis';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy: (times) => {
    if (times > 10) return null; // Stop retrying after 10 attempts
    return Math.min(times * 100, 2000);
  },
});

redis.on('error', (err: Error) => {
  console.error('[redis:error]', err.message);
});

redis.on('connect', () => {
  console.info('[redis] Connected');
});

// ─── Key helpers ──────────────────────────────────────────────────────────────

export const RedisKeys = {
  killSwitch: (tenantId: string, agentId: string) =>
    `killswitch:${tenantId}:${agentId}`,

  policyBundle: (tenantId: string, agentId: string) =>
    `bundle:${tenantId}:${agentId}`,

  hitlGate: (gateId: string) =>
    `hitl:gate:${gateId}`,

  rateLimit: (tenantId: string, key: string) =>
    `ratelimit:${tenantId}:${key}`,
} as const;

export type { Redis };
