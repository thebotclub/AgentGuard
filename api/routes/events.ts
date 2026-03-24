/**
 * AgentGuard — SSE Event Stream
 *
 * GET /api/v1/events/stream
 *
 * Streams real-time events to authenticated clients via Server-Sent Events.
 * Uses Redis Pub/Sub for fan-out across multiple server instances.
 *
 * Auth: API key via `X-API-Key` header OR `token` query parameter
 *       (query param needed because EventSource doesn't support custom headers).
 *
 * Connection management:
 *   - Heartbeat ping every 30 s (keeps proxies from closing idle connections)
 *   - Max MAX_CONNECTIONS_PER_TENANT concurrent SSE connections per tenant
 *   - Client-side reconnection supported via `Last-Event-ID` header
 *   - Server sends `event: server-shutdown` before closing on SIGTERM
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { subscribeTenant, type AgentGuardEvent } from '../lib/redis-pubsub.js';
import { logger } from '../lib/logger.js';

// ── Constants ──────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONNECTIONS_PER_TENANT = 100;

// ── Connection tracker ─────────────────────────────────────────────────────

/** Active SSE connections per tenant */
const connectionsByTenant = new Map<string, Set<Response>>();

function getConnectionCount(tenantId: string): number {
  return connectionsByTenant.get(tenantId)?.size ?? 0;
}

function registerConnection(tenantId: string, res: Response): void {
  let conns = connectionsByTenant.get(tenantId);
  if (!conns) {
    conns = new Set();
    connectionsByTenant.set(tenantId, conns);
  }
  conns.add(res);
}

function unregisterConnection(tenantId: string, res: Response): void {
  const conns = connectionsByTenant.get(tenantId);
  if (conns) {
    conns.delete(res);
    if (conns.size === 0) connectionsByTenant.delete(tenantId);
  }
}

/** Total active SSE connections across all tenants (for health/metrics). */
export function getTotalSseConnections(): number {
  let total = 0;
  for (const conns of connectionsByTenant.values()) total += conns.size;
  return total;
}

// ── SSE helpers ────────────────────────────────────────────────────────────

function sendEvent(res: Response, event: AgentGuardEvent, id?: string): void {
  try {
    const idLine = id ? `id: ${id}\n` : '';
    const lines = [
      idLine,
      `event: ${event.type}\n`,
      `data: ${JSON.stringify(event.data)}\n`,
      '\n',
    ].join('');
    res.write(lines);
  } catch {
    // Client disconnected — will be cleaned up by the 'close' listener
  }
}

function sendComment(res: Response, text: string): void {
  try {
    res.write(`: ${text}\n\n`);
  } catch {
    // ignore
  }
}

// ── Route factory ──────────────────────────────────────────────────────────

export function createEventsRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  /**
   * GET /api/v1/events/stream
   *
   * SSE endpoint. Clients should connect with:
   *   new EventSource('/api/v1/events/stream?token=ag_live_...')
   *
   * The `token` query param is used because browser EventSource doesn't
   * support custom request headers.
   */
  router.get('/api/v1/events/stream', async (req: Request, res: Response) => {
    // ── Auth via query param token or header ───────────────────────────────
    // We must authenticate manually here because EventSource can't set headers.
    const apiKey =
      (req.query['token'] as string | undefined) ||
      (req.headers['x-api-key'] as string | undefined);

    if (!apiKey) {
      res.status(401).json({ error: 'API key required (pass as ?token=<key> or X-API-Key header)' });
      return;
    }

    // Use the auth middleware's lookup logic by delegating to a fake next()
    let tenantId: string | null = null;
    await new Promise<void>((resolve) => {
      (req as Request & { query: Record<string, string> })['headers']['x-api-key'] = apiKey;
      auth.requireTenantAuth(req, res, () => {
        tenantId = (req as Request & { tenantId?: string }).tenantId ?? null;
        resolve();
      });
    });

    if (!tenantId || res.headersSent) {
      // requireTenantAuth already sent 401/403
      return;
    }

    const tid = tenantId; // narrow type

    // ── Check connection limit ─────────────────────────────────────────────
    if (getConnectionCount(tid) >= MAX_CONNECTIONS_PER_TENANT) {
      res.status(429).json({
        error: `Too many SSE connections for this tenant (max ${MAX_CONNECTIONS_PER_TENANT})`,
      });
      return;
    }

    // ── Set SSE headers ────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    // ── Register connection ────────────────────────────────────────────────
    const connId = crypto.randomUUID();
    registerConnection(tid, res);

    // Also register in global sseRegistry for graceful drain
    const sseRegistry: Set<Response> | undefined = (
      req.app as unknown as { sseRegistry?: Set<Response> }
    ).sseRegistry;
    sseRegistry?.add(res);

    logger.info({ tenantId: tid, connId, totalConns: getTotalSseConnections() }, 'SSE connection opened');

    // ── Send initial connected event ──────────────────────────────────────
    res.write(`: AgentGuard SSE stream connected\n\n`);
    sendComment(res, `tenant=${tid} conn=${connId}`);

    // ── Subscribe to tenant events ─────────────────────────────────────────
    let eventId = 0;
    const unsubscribe = await subscribeTenant(tid, (event) => {
      sendEvent(res, event, String(++eventId));
    });

    // ── Heartbeat ping ─────────────────────────────────────────────────────
    const heartbeat = setInterval(() => {
      sendComment(res, `heartbeat ${new Date().toISOString()}`);
    }, HEARTBEAT_INTERVAL_MS);

    // ── Cleanup on disconnect ──────────────────────────────────────────────
    function cleanup() {
      clearInterval(heartbeat);
      unsubscribe();
      unregisterConnection(tid, res);
      sseRegistry?.delete(res);
      logger.info({ tenantId: tid, connId, totalConns: getTotalSseConnections() }, 'SSE connection closed');
    }

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('error', cleanup);
  });

  // ── GET /api/v1/events/status — connection metrics (admin) ───────────────
  router.get('/api/v1/events/status', auth.requireAdminAuth, (_req: Request, res: Response) => {
    const byTenant: Record<string, number> = {};
    for (const [tenantId, conns] of connectionsByTenant.entries()) {
      byTenant[tenantId] = conns.size;
    }
    res.json({
      totalConnections: getTotalSseConnections(),
      byTenant,
      maxPerTenant: MAX_CONNECTIONS_PER_TENANT,
    });
  });

  return router;
}
