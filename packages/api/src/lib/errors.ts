/**
 * ServiceError factory pattern — ARCHITECTURE.md §3.3.
 * All error types extend ServiceError.
 */

export class ServiceError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly details: unknown;

  constructor(code: string, message: string, httpStatus: number, details?: unknown) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export class NotFoundError extends ServiceError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} '${id}' not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ServiceError {
  constructor(issues: unknown) {
    super('VALIDATION_ERROR', 'Request validation failed', 400, issues);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends ServiceError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message = 'Insufficient permissions') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

export class PolicyError extends ServiceError {
  static denied(message: string, details?: unknown): PolicyError {
    const e = new PolicyError('POLICY_DENIED', message, 403, details);
    e.name = 'PolicyError';
    return e;
  }

  static rateLimited(retryAfterMs: number): PolicyError {
    const e = new PolicyError('RATE_LIMITED', 'Rate limit exceeded', 429, { retryAfterMs });
    e.name = 'PolicyError';
    return e;
  }

  static requiresApproval(gateId: string, timeoutMs: number): PolicyError {
    const e = new PolicyError('REQUIRES_APPROVAL', 'Action requires human approval', 202, {
      gateId,
      timeoutMs,
    });
    e.name = 'PolicyError';
    return e;
  }
}

/** Format a ServiceError (or any Error) as a standard API error response body. */
export function toApiError(err: unknown): { error: { code: string; message: string; details?: unknown } } {
  if (err instanceof ServiceError) {
    return {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
  }
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  };
}
