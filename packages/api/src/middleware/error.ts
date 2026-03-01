/**
 * Error handler middleware — maps ServiceError → HTTP response.
 * Hono uses this as the last resort error handler.
 */
import type { Context } from 'hono';
import { ZodError } from 'zod';
import { ServiceError } from '../lib/errors.js';

export function errorHandler(err: unknown, c: Context) {
  // ZodError from body parsing — map to 400
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: err.issues,
        },
      },
      400,
    );
  }

  // ServiceError hierarchy
  if (err instanceof ServiceError) {
    const status = err.httpStatus as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500;
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
      status,
    );
  }

  // Unknown error — 500
  const isDev = process.env['NODE_ENV'] !== 'production';
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';

  console.error('[unhandled_error]', err);

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: isDev ? message : 'An unexpected error occurred',
        ...(isDev && err instanceof Error ? { stack: err.stack } : {}),
      },
    },
    500,
  );
}
