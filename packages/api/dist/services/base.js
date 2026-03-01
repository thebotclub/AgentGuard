/**
 * BaseService + ServiceContext — ARCHITECTURE.md §3.2.
 * All services extend this class and receive a ServiceContext at construction.
 */
import { Prisma } from '@prisma/client';
import { ForbiddenError } from '../lib/errors.js';
export class BaseService {
    db;
    ctx;
    constructor(db, ctx) {
        this.db = db;
        this.ctx = ctx;
    }
    /**
     * Run operations in a single database transaction.
     * Uses ReadCommitted isolation level per team standard.
     */
    async withTransaction(fn) {
        return this.db.$transaction(fn, {
            maxWait: 5_000,
            timeout: 10_000,
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        });
    }
    /**
     * Assert that the current user's role is one of the allowed roles.
     * Throws ForbiddenError if not.
     */
    assertRole(...allowed) {
        if (!allowed.includes(this.ctx.role)) {
            throw new ForbiddenError(`Role '${this.ctx.role}' cannot perform this operation. Required: ${allowed.join(', ')}`);
        }
    }
    /**
     * Return a Prisma where clause scoped to this tenant.
     * Always use this to prevent cross-tenant data leaks.
     */
    tenantScope() {
        return { tenantId: this.ctx.tenantId };
    }
    /**
     * Shorthand to get the tenant ID from context.
     */
    get tenantId() {
        return this.ctx.tenantId;
    }
    /**
     * Shorthand to get the user ID from context.
     */
    get userId() {
        return this.ctx.userId;
    }
}
//# sourceMappingURL=base.js.map