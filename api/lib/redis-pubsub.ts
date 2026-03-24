/**
 * AgentGuard — Redis Pub/Sub Manager
 *
 * Provides fan-out event publishing for SSE (Server-Sent Events).
 * Uses a dedicated subscriber connection per the ioredis recommendation
 * (subscriber clients cannot issue non-subscribe commands).
 *
 * Channel format: ag:events:{tenantId}
 *
 * Falls back to a simple in-process EventEmitter when Redis is unavailable
 * (single-instance dev / test environments).
 */
import { EventEmitter } from 'events';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentGuardEvent {
  /** Event type — used as SSE `event:` field */
  type: 'audit_event' | 'hitl_gate_created' | 'hitl_gate_resolved' | 'keepalive';
  /** Tenant the event belongs to */
  tenantId: string;
  /** Event payload */
  data: Record<string, unknown>;
  /** ISO timestamp */
  ts: string;
}

type Listener = (event: AgentGuardEvent) => void;

// ── Helpers ────────────────────────────────────────────────────────────────

function channelForTenant(tenantId: string): string {
  return `ag:events:${tenantId}`;
}

// ── In-process fallback (no Redis) ────────────────────────────────────────

const inProcessEmitter = new EventEmitter();
inProcessEmitter.setMaxListeners(500);

// ── Redis Pub/Sub ──────────────────────────────────────────────────────────

let publisherClient: { publish: (ch: string, msg: string) => Promise<unknown>; quit: () => Promise<void>; on?: (event: string, listener: (...args: unknown[]) => void) => void } | null = null;
let subscriberClient: {
  subscribe: (...channels: string[]) => Promise<unknown>;
  unsubscribe: (...channels: string[]) => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  quit: () => Promise<void>;
} | null = null;

let redisAvailable = false;
let initialized = false;

/** Subscription reference counting so we only subscribe once per channel */
const channelRefCount = new Map<string, number>();

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    console.info('[redis-pubsub] REDIS_URL not set — using in-process fallback');
    return;
  }

  try {
    const { default: Redis } = await import('ioredis');

    // Publisher client — regular commands + publish
    const pub = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      connectTimeout: 5_000,
    });
    await pub.connect();
    publisherClient = pub as unknown as typeof publisherClient;

    // Subscriber client — dedicated connection, no regular commands
    const sub = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      connectTimeout: 5_000,
    });
    await sub.connect();
    subscriberClient = sub as unknown as typeof subscriberClient;

    // Route incoming Redis messages to the in-process emitter
    subscriberClient!.on('message', (channel: unknown, message: unknown) => {
      try {
        const ch = String(channel);
        const event = JSON.parse(String(message)) as AgentGuardEvent;
        // Emit on the channel-specific topic AND the wildcard topic
        inProcessEmitter.emit(ch, event);
        inProcessEmitter.emit('ag:events:*', event);
      } catch {
        // Malformed message — skip
      }
    });

    subscriberClient!.on('error', (err: unknown) => {
      console.warn('[redis-pubsub] subscriber error:', (err as Error).message ?? err);
      redisAvailable = false;
    });
    publisherClient!.on?.('error', (err: unknown) => {
      console.warn('[redis-pubsub] publisher error:', (err as Error).message ?? err);
      redisAvailable = false;
    });

    redisAvailable = true;
    console.info('[redis-pubsub] connected:', redisUrl.replace(/:[^:@]*@/, ':***@'));
  } catch (err) {
    console.warn('[redis-pubsub] init failed, using in-process fallback:', (err as Error).message ?? err);
    redisAvailable = false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Publish an event to all SSE subscribers for a tenant.
 * Safe to call without awaiting — errors are swallowed.
 */
export async function publishEvent(event: AgentGuardEvent): Promise<void> {
  // Ensure we're initialized (no-op if already done)
  if (!initialized) await ensureInitialized();

  const channel = channelForTenant(event.tenantId);
  const message = JSON.stringify(event);

  if (redisAvailable && publisherClient) {
    try {
      await publisherClient.publish(channel, message);
      return;
    } catch (err) {
      console.warn('[redis-pubsub] publish failed, falling back:', (err as Error).message ?? err);
      redisAvailable = false;
    }
  }

  // In-process fallback: emit directly
  inProcessEmitter.emit(channel, event);
  inProcessEmitter.emit('ag:events:*', event);
}

/**
 * Subscribe to events for a specific tenant.
 * Returns an unsubscribe function.
 */
export async function subscribeTenant(tenantId: string, listener: Listener): Promise<() => void> {
  if (!initialized) await ensureInitialized();

  const channel = channelForTenant(tenantId);

  // Always attach in-process listener
  inProcessEmitter.on(channel, listener);

  // Also subscribe on Redis subscriber client if available
  if (redisAvailable && subscriberClient) {
    const count = (channelRefCount.get(channel) ?? 0) + 1;
    channelRefCount.set(channel, count);
    if (count === 1) {
      // First subscriber for this channel — issue SUBSCRIBE
      subscriberClient.subscribe(channel).catch((err: unknown) => {
        console.warn('[redis-pubsub] subscribe failed:', (err as Error).message ?? err);
      });
    }
  }

  return function unsubscribe() {
    inProcessEmitter.off(channel, listener);

    if (redisAvailable && subscriberClient) {
      const count = Math.max(0, (channelRefCount.get(channel) ?? 1) - 1);
      channelRefCount.set(channel, count);
      if (count === 0) {
        channelRefCount.delete(channel);
        subscriberClient.unsubscribe(channel).catch(() => {
          // Non-critical — connection may already be closed
        });
      }
    }
  };
}

/** Returns true if Redis Pub/Sub is active (vs in-process fallback). */
export function isPubSubAvailable(): boolean {
  return redisAvailable;
}

/** Initialize eagerly (called from server startup). */
export async function initPubSub(): Promise<void> {
  await ensureInitialized();
}

/** Graceful shutdown — close both publisher and subscriber connections. */
export async function closePubSub(): Promise<void> {
  try {
    if (subscriberClient) await subscriberClient.quit();
  } catch {
    // ignore
  }
  try {
    if (publisherClient) await publisherClient.quit();
  } catch {
    // ignore
  }
  redisAvailable = false;
  publisherClient = null;
  subscriberClient = null;
}
