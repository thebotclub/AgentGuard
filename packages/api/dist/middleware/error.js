import { ZodError } from 'zod';
import { ServiceError } from '../lib/errors.js';
export function errorHandler(err, c) {
    // ZodError from body parsing — map to 400
    if (err instanceof ZodError) {
        return c.json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: err.issues,
            },
        }, 400);
    }
    // ServiceError hierarchy
    if (err instanceof ServiceError) {
        const status = err.httpStatus;
        return c.json({
            error: {
                code: err.code,
                message: err.message,
                ...(err.details !== undefined ? { details: err.details } : {}),
            },
        }, status);
    }
    // Unknown error — 500
    const isDev = process.env['NODE_ENV'] !== 'production';
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    console.error('[unhandled_error]', err);
    return c.json({
        error: {
            code: 'INTERNAL_ERROR',
            message: isDev ? message : 'An unexpected error occurred',
            ...(isDev && err instanceof Error ? { stack: err.stack } : {}),
        },
    }, 500);
}
//# sourceMappingURL=error.js.map