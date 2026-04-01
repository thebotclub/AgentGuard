/**
 * Real-time event streaming via Server-Sent Events (SSE).
 *
 * GET /v1/events/stream — SSE endpoint for real-time event feed.
 *   Auth: ?token=<JWT> query param (for browser SSE clients that can't set headers).
 *         Alternatively: Authorization: Bearer <JWT> header.
 *   Multi-tenant safe: only events for the authenticated tenant are streamed.
 *
 * Events pushed to connected clients:
 *   data: {"type":"audit_event","data":{...}}\n\n
 *   data: {"type":"kill_switch","data":{...}}\n\n
 *   data: {"type":"hitl_gate","data":{...}}\n\n
 *   data: {"type":"anomaly_alert","data":{...}}\n\n
 *   data: {"type":"ping"}\n\n  — heartbeat every 30s
 *
 * GET /v1/events/stats — connected client count (admin debug)
 *
 * ── Horizontal scaling via Redis Pub/Sub ─────────────────────────────────────
 *
 * Events are published to Redis channels instead of in-process Maps.
 * Each server instance subscribes to its tenants' Redis channels.
 * SSE clients on any instance receive events published from any instance.
 *
 * Redis channel naming: `agentguard:events:<tenantId>`
 *
 * Graceful degradation: if Redis is unavailable, falls back to in-process
 * fan-out. Logged as a warning; functionality preserved for single-instance.
 */
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import Redis from 'ioredis';
import type { ServiceContext } from '@agentguard/shared';
import { authenticateJwt } from '../middleware/auth.js';

export const eventsRouter = new Hono();

// ─── Types ────────────────────────────────────────────────────────────────────

type EventMessage =
  | { type: 'audit_event'; data: Record<string, unknown> }
  | { type: 'kill_switch'; data: Record<string, unknown> }
  | { type: 'hitl_gate'; data: Record<string, unknown> }
  | { type: 'anomaly_alert'; data: Record<string, unknown> }
  | { type: 'ping' };

interface ConnectedClient {
  tenantId: string;
  id: string;
  push: (msg: EventMessage) => boolean;
}

// ─── Redis Pub/Sub Setup ──────────────────────────────────────────────────────

const REDIS_CHANNEL_PREFIX = 'agentguard:events:';

/** Redis publisher client (shared). */
let redisPublisher: Redis | null = null;

/** Redis subscriber client (dedicated — cannot be shared with publisher). */
let redisSubscriber: Redis | null = null;

/** Whether Redis pub/sub is available. Falls back to in-process if false. */
let redisAvailable = false;

/**
 * Initialize Redis pub/sub.
 * Called lazily on first SSE connection attempt.
 * Gracefully degrades if Redis is not available.
 */
async function ensureRedisPubSub(): Promise<void> {
  if (redisPublisher !== null) return; // Already initialized

  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

  try {
    redisPublisher = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 3000,
    });

    redisSubscriber = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 3000,
    });

    await redisPublisher.connect();
    await redisSubscriber.connect();

    // Route incoming Redis messages to the correct local SSE clients
    redisSubscriber.on('message', (channel: string, rawMessage: string) => {
      if (!channel.startsWith(REDIS_CHANNEL_PREFIX)) return;
      const tenantId = channel.slice(REDIS_CHANNEL_PREFIX.length);

      let msg: EventMessage;
      try {
        msg = JSON.parse(rawMessage) as EventMessage;
      } catch {
        return;
      }

      fanOutToLocalClients(tenantId, msg);
    });

    redisPublisher.on('error', (err: Error) => {
      console.warn('[events:redis:publisher]', err.message);
    });

    redisSubscriber.on('error', (err: Error) => {
      console.warn('[events:redis:subscriber]', err.message);
    });

    redisAvailable = true;
    console.info('[events] Redis Pub/Sub initialized for SSE fan-out');
  } catch (err) {
    console.warn(
      '[events] Redis unavailable — falling back to in-process SSE fan-out:',
      (err as Error).message,
    );
    redisAvailable = false;
    // Close any partially-opened connections
    redisPublisher?.disconnect();
    redisSubscriber?.disconnect();
    redisPublisher = null;
    redisSubscriber = null;
  }
}

// ─── In-process connection registry ──────────────────────────────────────────
// Primary storage for THIS server instance's connected clients.
// With Redis pub/sub, all instances fan out to their local clients.
// Without Redis (fallback), this is the only fan-out mechanism.
const localRegistry = new Map<string, Map<string, ConnectedClient>>();

function registerLocalClient(client: ConnectedClient): void {
  let tenantMap = localRegistry.get(client.tenantId);
  if (!tenantMap) {
    tenantMap = new Map();
    localRegistry.set(client.tenantId, tenantMap);
  }
  tenantMap.set(client.id, client);
}

function unregisterLocalClient(client: ConnectedClient): void {
  const tenantMap = localRegistry.get(client.tenantId);
  if (!tenantMap) return;
  tenantMap.delete(client.id);
  if (tenantMap.size === 0) {
    localRegistry.delete(client.tenantId);
  }
}

/** Fan out an event message to all local SSE clients for a tenant. */
function fanOutToLocalClients(tenantId: string, message: EventMessage): number {
  const tenantMap = localRegistry.get(tenantId);
  if (!tenantMap) return 0;

  const dead: string[] = [];
  let count = 0;

  for (const [id, client] of tenantMap) {
    const ok = client.push(message);
    if (!ok) {
      dead.push(id);
    } else {
      count++;
    }
  }

  // Clean up dead connections
  for (const id of dead) {
    tenantMap.delete(id);
  }
  if (tenantMap.size === 0) {
    localRegistry.delete(tenantId);
  }

  return count;
}

/**
 * Subscribe to a tenant's Redis channel (if not already subscribed).
 * Called when the first SSE client for a tenant connects to this instance.
 */
async function ensureTenantSubscription(tenantId: string): Promise<void> {
  if (!redisAvailable || !redisSubscriber) return;
  const channel = `${REDIS_CHANNEL_PREFIX}${tenantId}`;
  try {
    await redisSubscriber.subscribe(channel);
  } catch (err) {
    console.warn(`[events] Failed to subscribe to channel ${channel}:`, (err as Error).message);
  }
}

/**
 * Unsubscribe from a tenant's Redis channel when no local clients remain.
 */
async function maybeTenantUnsubscribe(tenantId: string): Promise<void> {
  if (!redisAvailable || !redisSubscriber) return;
  const tenantMap = localRegistry.get(tenantId);
  if (tenantMap && tenantMap.size > 0) return; // Still have clients

  const channel = `${REDIS_CHANNEL_PREFIX}${tenantId}`;
  try {
    await redisSubscriber.unsubscribe(channel);
  } catch {
    // Non-fatal
  }
}

/**
 * Broadcast an event to all connected clients for a given tenant.
 *
 * With Redis: publishes to the tenant's Redis channel — all instances receive it.
 * Without Redis (fallback): fans out directly to local in-process clients only.
 *
 * Returns number of local clients notified (may be 0 on other instances).
 * Called from services/routes when events occur.
 */
export async function broadcastToTenant(tenantId: string, message: EventMessage): Promise<number> {
  // Ensure pub/sub is initialized (lazy)
  if (redisPublisher === null) {
    await ensureRedisPubSub();
  }

  if (redisAvailable && redisPublisher) {
    try {
      const channel = `${REDIS_CHANNEL_PREFIX}${tenantId}`;
      await redisPublisher.publish(channel, JSON.stringify(message));
      // Local fan-out happens via the subscriber 'message' handler above
      // We return the local client count as an approximation
      return localRegistry.get(tenantId)?.size ?? 0;
    } catch (err) {
      console.warn('[events] Redis publish failed, falling back to in-process:', (err as Error).message);
      // Fall through to in-process fallback
    }
  }

  // In-process fallback
  return fanOutToLocalClients(tenantId, message);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /v1/events/stream
 * Server-Sent Events stream authenticated by JWT.
 */
eventsRouter.get('/stream', async (c) => {
  // Initialize Redis pub/sub if not done yet
  if (redisPublisher === null) {
    await ensureRedisPubSub();
  }

  // Authenticate
  const token = c.req.query('token') ?? extractBearerToken(c.req.header('Authorization'));
  if (!token) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } }, 401);
  }

  const ctx = await authenticateJwt(token);
  if (!ctx) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }, 401);
  }

  const clientId = crypto.randomUUID();

  // Subscribe to tenant's Redis channel (no-op if Redis unavailable)
  await ensureTenantSubscription(ctx.tenantId);

  return streamSSE(c, async (s) => {
    // Create a queue for messages — push() returns false when queue is closed
    const queue: EventMessage[] = [];
    let closed = false;

    const client: ConnectedClient = {
      tenantId: ctx.tenantId,
      id: clientId,
      push: (msg) => {
        if (closed) return false;
        queue.push(msg);
        return true;
      },
    };

    registerLocalClient(client);

    // Send initial connected message
    await s.writeSSE({
      data: JSON.stringify({
        type: 'connected',
        tenantId: ctx.tenantId,
        clientId,
        fanOut: redisAvailable ? 'redis' : 'in-process',
      }),
      event: 'message',
      id: clientId,
    });

    try {
      const HEARTBEAT_MS = 30_000;
      const DRAIN_MS = 100;
      let lastHeartbeat = Date.now();

      while (!s.closed) {
        // Drain queue
        while (queue.length > 0) {
          const msg = queue.shift()!;
          await s.writeSSE({
            data: JSON.stringify(msg),
            event: 'message',
          });
        }

        // Heartbeat
        const now = Date.now();
        if (now - lastHeartbeat >= HEARTBEAT_MS) {
          await s.writeSSE({
            data: JSON.stringify({ type: 'ping' }),
            event: 'message',
          });
          lastHeartbeat = now;
        }

        await sleep(DRAIN_MS);
      }
    } finally {
      closed = true;
      unregisterLocalClient(client);
      // Unsubscribe from Redis channel if no more local clients for this tenant
      await maybeTenantUnsubscribe(ctx.tenantId);
    }
  });
});

/**
 * GET /v1/events/stats — connected client count + fan-out mode (admin debug)
 */
eventsRouter.get('/stats', (c) => {
  const stats: Record<string, number> = {};
  let total = 0;
  for (const [tenantId, clients] of localRegistry) {
    stats[tenantId] = clients.size;
    total += clients.size;
  }
  return c.json({
    totalConnected: total,
    fanOutMode: redisAvailable ? 'redis-pubsub' : 'in-process',
    tenants: stats,
  });
});

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
