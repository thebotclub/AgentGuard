/**
 * AgentGuard — API Versioning Middleware
 *
 * Attaches version headers to every response so clients can
 * programmatically detect which API version served their request.
 */
import type { Request, Response, NextFunction } from 'express';

/** Current API major version. Bump when introducing /api/v2/ routes. */
export const API_VERSION = 1;

/**
 * Express middleware that adds API version headers to all responses.
 *
 * Headers set:
 *  - X-API-Version: current major version number
 *  - Access-Control-Expose-Headers: includes X-API-Version
 */
export function versioningMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-API-Version', API_VERSION);

  // Merge into any existing Access-Control-Expose-Headers
  const existing = res.getHeader('Access-Control-Expose-Headers');
  if (existing) {
    const headers = String(existing).split(',').map((h) => h.trim());
    if (!headers.includes('X-API-Version')) {
      headers.push('X-API-Version');
    }
    res.setHeader('Access-Control-Expose-Headers', headers.join(', '));
  } else {
    res.setHeader('Access-Control-Expose-Headers', 'X-API-Version');
  }

  next();
}
