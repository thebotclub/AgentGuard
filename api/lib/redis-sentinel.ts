/**
 * AgentGuard — Redis Sentinel Client
 *
 * Provides HA Redis connectivity via Redis Sentinel. Sentinel monitors master
 * and replica nodes, automatically promoting a replica on master failure.
 *
 * Configuration (env vars):
 *   REDIS_SENTINELS     — comma-separated list of sentinel host:port pairs
 *                         e.g. "sentinel1:26379,sentinel2:26379,sentinel3:26379"
 *   REDIS_SENTINEL_NAME — Sentinel master name (default: "mymaster")
 *   REDIS_PASSWORD      — Redis AUTH password (optional)
 *   REDIS_SENTINEL_PASSWORD — Sentinel AUTH password (optional, separate from Redis)
 *   REDIS_DB            — Redis database number (default: 0)
 *
 * Falls back to standalone Redis (REDIS_URL) if sentinel is not configured.
 * Falls back to in-memory if neither is configured.
 *
 * The module exposes the same ping() and getRedisClient() interface as
 * redis-rate-limiter.ts so health probes can call either.
 */
import type { Redis as RedisType } from 'ioredis';

let sentinelClient: RedisType | null = null;
let sentinelAvailable = false;
let sentinelInitialized = false;

/**
 * Parse the REDIS_SENTINELS env var into ioredis Sentinel format.
 * Input: "host1:26379,host2:26379"
 * Output: [{ host: "host1", port: 26379 }, ...]
 */
function parseSentinels(raw: string): Array<{ host: string; port: number }> {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [host, portStr] = s.split(':');
      return { host: host ?? s, port: parseInt(portStr ?? '26379', 10) };
    });
}

/**
 * Get or create the Sentinel Redis client (lazy initialization).
 * Returns null if sentinel is not configured.
 */
export async function getSentinelClient(): Promise<RedisType | null> {
  if (sentinelInitialized) {
    return sentinelAvailable ? sentinelClient : null;
  }
  sentinelInitialized = true;

  const sentinelsRaw = process.env['REDIS_SENTINELS'];
  if (!sentinelsRaw) {
    return null; // Sentinel not configured
  }

  const sentinels = parseSentinels(sentinelsRaw);
  if (sentinels.length === 0) {
    console.warn('[redis-sentinel] REDIS_SENTINELS is set but empty — skipping sentinel');
    return null;
  }

  const name = process.env['REDIS_SENTINEL_NAME'] ?? 'mymaster';
  const password = process.env['REDIS_PASSWORD'] || undefined;
  const sentinelPassword = process.env['REDIS_SENTINEL_PASSWORD'] || undefined;
  const db = parseInt(process.env['REDIS_DB'] ?? '0', 10);

  try {
    const { default: Redis } = await import('ioredis');

    const client = new Redis({
      sentinels,
      name,
      password,
      sentinelPassword,
      db,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 5000,
      sentinelRetryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 500, 5000);
      },
      retryStrategy: (times: number) => {
        if (times > 5) return null;
        return Math.min(times * 300, 3000);
      },
    });

    await client.connect();
    await client.ping();

    client.on('error', (err: Error) => {
      if (sentinelAvailable) {
        console.warn('[redis-sentinel] error, attempting failover:', err.message);
        sentinelAvailable = false;
      }
    });

    client.on('ready', () => {
      if (!sentinelAvailable) {
        console.info('[redis-sentinel] connected/reconnected');
        sentinelAvailable = true;
      }
    });

    client.on('+switch-master', (masterName: string, oldHost: string, oldPort: string, newHost: string, newPort: string) => {
      console.info(`[redis-sentinel] master switched: ${masterName} ${oldHost}:${oldPort} -> ${newHost}:${newPort}`);
    });

    sentinelClient = client as RedisType;
    sentinelAvailable = true;

    const sentinelList = sentinels.map((s) => `${s.host}:${s.port}`).join(', ');
    console.info(`[redis-sentinel] connected via ${sentinels.length} sentinel(s) [${sentinelList}] master="${name}"`);

    return sentinelClient;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[redis-sentinel] failed to connect:', msg);
    sentinelAvailable = false;
    return null;
  }
}

/**
 * Get the current sentinel client synchronously (may be null if not yet initialized
 * or if connection failed).
 */
export function getSentinelClientSync(): RedisType | null {
  return sentinelClient;
}

/**
 * Whether the sentinel connection is currently available.
 */
export function isSentinelAvailable(): boolean {
  return sentinelAvailable;
}

/**
 * Gracefully close the Sentinel Redis connection.
 */
export async function closeSentinel(): Promise<void> {
  if (!sentinelClient) return;
  try {
    await sentinelClient.quit();
    sentinelAvailable = false;
    sentinelClient = null;
    console.info('[redis-sentinel] connection closed');
  } catch {
    // Non-critical — process is exiting
  }
}

/**
 * Build the Redis connection URL for standalone fallback.
 * REDIS_URL format: redis://[:password@]host[:port][/db]
 */
export function buildRedisUrl(): string | null {
  // Prefer explicit REDIS_URL
  if (process.env['REDIS_URL']) return process.env['REDIS_URL'];

  // Construct from parts
  const host = process.env['REDIS_HOST'];
  if (!host) return null;
  const port = process.env['REDIS_PORT'] ?? '6379';
  const password = process.env['REDIS_PASSWORD'];
  const db = process.env['REDIS_DB'] ?? '0';

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}/${db}`;
  }
  return `redis://${host}:${port}/${db}`;
}
