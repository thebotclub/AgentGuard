/**
 * AgentGuard — Telemetry Routes
 *
 * POST /api/v1/telemetry — anonymous SDK telemetry ping (no auth required, rate limited)
 */
import { Router, Request, Response } from 'express';
import { TelemetryRequestSchema } from '../schemas.js';
import { logger } from '../lib/logger.js';
import type { IDatabase } from '../db-interface.js';

// Simple in-memory rate limiter for telemetry endpoint (by IP)
const telemetryRateMap = new Map<string, { count: number; windowStart: number }>();
const TELEMETRY_WINDOW_MS = 60_000; // 1 minute
const TELEMETRY_MAX_PER_WINDOW = 5;

// Cleanup stale entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of telemetryRateMap) {
    if (now - entry.windowStart > TELEMETRY_WINDOW_MS * 2) {
      telemetryRateMap.delete(ip);
    }
  }
}, 5 * 60_000).unref();

function isTelemetryRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = telemetryRateMap.get(ip);
  if (!entry || now - entry.windowStart > TELEMETRY_WINDOW_MS) {
    telemetryRateMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  if (entry.count > TELEMETRY_MAX_PER_WINDOW) return true;
  return false;
}

export function createTelemetryRoutes(db: IDatabase): Router {
  const router = Router();

  // ── POST /api/v1/telemetry ────────────────────────────────────────────────
  router.post(
    '/api/v1/telemetry',
    async (req: Request, res: Response) => {
      const ip = (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace('::ffff:', '');

      if (isTelemetryRateLimited(ip)) {
        // Silently accept — don't reveal rate limiting to SDK
        return res.status(202).json({ accepted: true });
      }

      const parsed = TelemetryRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        // Silently accept invalid payloads — telemetry should never break SDK
        return res.status(202).json({ accepted: true });
      }

      const { sdk_version, language, node_version, os_platform } = parsed.data;

      // Fire-and-forget insert — don't let DB errors affect response
      db.insertTelemetryEvent(sdk_version, language, node_version ?? null, os_platform ?? null)
        .catch((e: unknown) => logger.error({ err: e instanceof Error ? e : String(e) }, '[telemetry] insert error'));

      res.status(202).json({ accepted: true });
    },
  );

  return router;
}
