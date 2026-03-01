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
 */
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { jwtVerify } from 'jose';
import type { ServiceContext } from '@agentguard/shared';

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

// ─── In-process connection registry ──────────────────────────────────────────
// Maps tenantId → Set of connected clients
const registry = new Map<string, Map<string, ConnectedClient>>();

function registerClient(client: ConnectedClient): void {
  let tenantMap = registry.get(client.tenantId);
  if (!tenantMap) {
    tenantMap = new Map();
    registry.set(client.tenantId, tenantMap);
  }
  tenantMap.set(client.id, client);
}

function unregisterClient(client: ConnectedClient): void {
  const tenantMap = registry.get(client.tenantId);
  if (!tenantMap) return;
  tenantMap.delete(client.id);
  if (tenantMap.size === 0) {
    registry.delete(client.tenantId);
  }
}

/**
 * Broadcast an event to all connected clients for a given tenant.
 * Returns number of clients successfully notified.
 * Called from services/routes when events occur.
 */
export function broadcastToTenant(tenantId: string, message: EventMessage): number {
  const tenantMap = registry.get(tenantId);
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
    registry.delete(tenantId);
  }

  return count;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /v1/events/stream
 * Server-Sent Events stream authenticated by JWT.
 *
 * Clients connect with:
 *   GET /v1/events/stream?token=<JWT>
 * or
 *   GET /v1/events/stream  with  Authorization: Bearer <JWT>
 */
eventsRouter.get('/stream', async (c) => {
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

  return streamSSE(c, async (stream) => {
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

    registerClient(client);

    // Send initial connected message
    await stream.writeSSE({
      data: JSON.stringify({ type: 'connected', tenantId: ctx.tenantId, clientId }),
      event: 'message',
      id: clientId,
    });

    try {
      // Main event loop — drain queue and send heartbeats
      const HEARTBEAT_MS = 30_000;
      const DRAIN_MS = 100; // check queue every 100ms
      let lastHeartbeat = Date.now();

      while (!stream.closed) {
        // Drain queue
        while (queue.length > 0) {
          const msg = queue.shift()!;
          await stream.writeSSE({
            data: JSON.stringify(msg),
            event: 'message',
          });
        }

        // Send heartbeat if needed
        const now = Date.now();
        if (now - lastHeartbeat >= HEARTBEAT_MS) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'ping' }),
            event: 'message',
          });
          lastHeartbeat = now;
        }

        // Small sleep before next drain
        await sleep(DRAIN_MS);
      }
    } finally {
      closed = true;
      unregisterClient(client);
    }
  });
});

/**
 * GET /v1/events/stats — connected client count (for admin dashboards)
 */
eventsRouter.get('/stats', (c) => {
  const stats: Record<string, number> = {};
  let total = 0;
  for (const [tenantId, clients] of registry) {
    stats[tenantId] = clients.size;
    total += clients.size;
  }
  return c.json({ totalConnected: total, tenants: stats });
});

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const JWT_SECRET = new TextEncoder().encode(
  process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
);

interface JwtClaims {
  sub: string;
  tenantId: string;
  role: string;
}

async function authenticateJwt(token: string): Promise<ServiceContext | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const claims = payload as unknown as JwtClaims;
    if (!claims.tenantId || !claims.sub || !claims.role) return null;
    return {
      tenantId: claims.tenantId,
      userId: claims.sub,
      role: claims.role as ServiceContext['role'],
      traceId: crypto.randomUUID(),
    };
  } catch {
    return null;
  }
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
