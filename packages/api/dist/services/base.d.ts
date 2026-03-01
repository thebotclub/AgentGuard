/**
 * BaseService + ServiceContext — ARCHITECTURE.md §3.2.
 * All services extend this class and receive a ServiceContext at construction.
 */
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { UserRole, ServiceContext } from '@agentguard/shared';
export type { UserRole, ServiceContext };
export declare abstract class BaseService {
    protected readonly db: PrismaClient;
    protected readonly ctx: ServiceContext;
    constructor(db: PrismaClient, ctx: ServiceContext);
    /**
     * Run operations in a single database transaction.
     * Uses ReadCommitted isolation level per team standard.
     */
    protected withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
    /**
     * Assert that the current user's role is one of the allowed roles.
     * Throws ForbiddenError if not.
     */
    protected assertRole(...allowed: UserRole[]): void;
    /**
     * Return a Prisma where clause scoped to this tenant.
     * Always use this to prevent cross-tenant data leaks.
     */
    protected tenantScope(): {
        tenantId: string;
    };
    /**
     * Shorthand to get the tenant ID from context.
     */
    protected get tenantId(): string;
    /**
     * Shorthand to get the user ID from context.
     */
    protected get userId(): string;
}
//# sourceMappingURL=base.d.ts.map