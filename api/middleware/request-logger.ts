/**
 * Request lifecycle logger — logs one structured line per completed request.
 *
 * Must be mounted early (before auth middleware) to capture all requests
 * including those that fail authentication.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;
    const meta = {
      requestId: req.headers['x-request-id'] as string | undefined,
      traceId: req.headers['x-trace-id'] as string | undefined,
      spanId: req.headers['x-span-id'] as string | undefined,
      method: req.method,
      path: req.originalUrl || req.url,
      status,
      duration: Math.round(durationMs * 100) / 100,
      tenantId: req.tenantId,
    };

    if (status >= 500) {
      logger.error(meta, 'request completed');
    } else if (status >= 400) {
      logger.warn(meta, 'request completed');
    } else {
      logger.info(meta, 'request completed');
    }
  });

  next();
}
