/**
 * AgentGuard — Structured JSON Logger (Pino)
 *
 * Replaces the hand-rolled JSON wrapper with pino for production-grade
 * structured logging with ISO timestamps and pretty-printing in dev.
 *
 * Usage:
 *   import { logger } from './logger.js';
 *   logger.info('server started', { port: 3000 });
 *
 *   // Per-request child logger with request ID:
 *   const reqLog = logger.child({ requestId: req.headers['x-request-id'] });
 *   reqLog.info('incoming request', { method: req.method, path: req.path });
 */
import pino from 'pino';

/**
 * Scrub sensitive tokens from URLs before they are logged.
 * Replaces `?token=ag_live_...` (and similar) with `?token=ag_****`
 * to prevent API keys from leaking into access logs.
 */
export function scrubTokenFromUrl(url: string): string {
  return url.replace(/([?&]token=)[^&\s#]*/gi, '$1ag_****');
}

export const logger = pino({
  level: process.env['LOG_LEVEL'] || 'info',
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    // Scrub token from any logged request URL fields
    req(req) {
      return {
        ...req,
        url: req.url ? scrubTokenFromUrl(req.url) : req.url,
        originalUrl: req.originalUrl ? scrubTokenFromUrl(req.originalUrl) : req.originalUrl,
      };
    },
  },
  // In development: pretty-print to console
  ...(process.env['NODE_ENV'] !== 'production' && {
    transport: { target: 'pino-pretty' },
  }),
});

/**
 * Create a child logger scoped to a specific request ID and optional tenant ID.
 * Attach this to req in middleware for request-scoped logging.
 */
export function createRequestLogger(requestId: string | undefined, tenantId?: string) {
  return logger.child({
    requestId: requestId ?? 'none',
    ...(tenantId ? { tenantId } : {}),
  });
}
