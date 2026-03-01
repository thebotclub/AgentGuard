/**
 * ServiceError factory pattern — ARCHITECTURE.md §3.3.
 * All error types extend ServiceError.
 */
export declare class ServiceError extends Error {
    readonly code: string;
    readonly httpStatus: number;
    readonly details: unknown;
    constructor(code: string, message: string, httpStatus: number, details?: unknown);
    toJSON(): Record<string, unknown>;
}
export declare class NotFoundError extends ServiceError {
    constructor(resource: string, id: string);
}
export declare class ValidationError extends ServiceError {
    constructor(issues: unknown);
}
export declare class UnauthorizedError extends ServiceError {
    constructor(message?: string);
}
export declare class ForbiddenError extends ServiceError {
    constructor(message?: string);
}
export declare class ConflictError extends ServiceError {
    constructor(message: string, details?: unknown);
}
export declare class PolicyError extends ServiceError {
    static denied(message: string, details?: unknown): PolicyError;
    static rateLimited(retryAfterMs: number): PolicyError;
    static requiresApproval(gateId: string, timeoutMs: number): PolicyError;
}
/** Format a ServiceError (or any Error) as a standard API error response body. */
export declare function toApiError(err: unknown): {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
};
//# sourceMappingURL=errors.d.ts.map