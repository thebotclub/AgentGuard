/**
 * AgentGuard — Global Error Handler Middleware
 *
 * Must be registered as the LAST `app.use()` in server.ts.
 *
 * Security rules:
 *   - Production: NEVER expose stack traces or internal details
 *   - Development: include full stack for debugging
 *   - Always log full error + stack to structured logger
 *
 * Known error mappings:
 *   ZodError → 400 (validation failure)
 *   AuthError → 401 (authentication failure)
 *   JSON parse / SyntaxError (400 status) → 400
 *   entity.too.large → 413
 */
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

// ── Known Error Types ──────────────────────────────────────────────────────

/**
 * Sentinel error class for authentication failures.
 * Throw or pass this to next() to get a 401 response.
 */
export class AuthError extends Error {
  readonly statusCode = 401;
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

// ── Helper: extract request ID ─────────────────────────────────────────────

function getRequestId(req: Request): string | undefined {
  const id = req.headers['x-request-id'];
  return Array.isArray(id) ? id[0] : id;
}

// ── Global Error Handler ───────────────────────────────────────────────────

/**
 * Express global error handler.
 * Register as the very last `app.use()` so all route errors reach it.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = getRequestId(req);
  const isProd = process.env['NODE_ENV'] === 'production';

  // ── Zod validation errors → 400 ─────────────────────────────────────────
  if (err instanceof ZodError) {
    logger.warn({
      requestId,
      path: req.path,
      method: req.method,
      errors: err.issues,
    }, 'Validation error');
    const firstIssue = err.issues[0];
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((e: any) => ({
        field: e.path.join('.') || 'body',
        message: e.message,
        expected: e.expected ?? undefined,
        path: e.path.join('.'),
      })),
      // Convenience top-level fields for the first issue
      ...(firstIssue ? {
        field: firstIssue.path.join('.') || 'body',
        expected: firstIssue.message,
      } : {}),
      docs: 'https://agentguard.tech/docs/api',
      requestId,
    });
    return;
  }

  // ── Auth errors → 401 ────────────────────────────────────────────────────
  if (err instanceof AuthError) {
    logger.warn({
      requestId,
      path: req.path,
      method: req.method,
      message: err.message,
    }, 'Auth error');
    res.status(401).json({
      error: 'unauthorized',
      code: 'AUTH_REQUIRED',
      message: err.message || 'Authentication required',
      acceptedAuth: [
        'Header: X-API-Key: ag_<key>',
        'Header: Authorization: Bearer <jwt>',
      ],
      docs: 'https://agentguard.tech/docs/authentication',
      requestId,
    });
    return;
  }

  // ── JSON parse errors (express body-parser) → 400 ─────────────────────
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status: number }).status === 400
  ) {
    logger.warn({ requestId, path: req.path }, 'JSON parse error');
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      field: 'body',
      expected: 'valid JSON',
      received: 'malformed JSON',
      docs: 'https://agentguard.tech/docs/api',
      requestId,
    });
    return;
  }

  // ── Payload-too-large → 413 ────────────────────────────────────────────
  if (
    err instanceof Error &&
    'type' in err &&
    (err as { type: string }).type === 'entity.too.large'
  ) {
    logger.warn({ requestId, path: req.path }, 'Payload too large');
    res.status(413).json({
      error: 'Request body too large. Maximum size is 50kb.',
      requestId,
    });
    return;
  }

  // ── Unknown / unexpected errors → 500 ─────────────────────────────────
  const errorMessage = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  // Always log the full error with stack
  logger.error({
    requestId,
    path: req.path,
    method: req.method,
    error: errorMessage,
    stack,
    ...(req.tenantId ? { tenantId: req.tenantId } : {}),
  }, 'Unhandled error');

  if (isProd) {
    // Production: never leak internals
    res.status(500).json({
      error: 'Internal server error',
      requestId,
    });
  } else {
    // Development: include stack trace for debugging
    res.status(500).json({
      error: 'Internal server error',
      message: errorMessage,
      stack,
      requestId,
    });
  }
}
