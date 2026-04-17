/**
 * BaseService + ServiceContext — ARCHITECTURE.md §3.2.
 * All services extend this class and receive a ServiceContext at construction.
 */
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { UserRole, ServiceContext } from '@agentguard/shared';
import { ForbiddenError } from '../lib/errors.js';

export type { UserRole, ServiceContext };

export abstract class BaseService {
  constructor(
    protected readonly db: PrismaClient,
    protected readonly ctx: ServiceContext,
  ) {}

  /**
   * Run operations in a single database transaction.
   * Uses ReadCommitted isolation level per team standard.
   */
  protected async withTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn, {
      maxWait: 5_000,
      timeout: 10_000,
      isolationLevel: 'ReadCommitted' as const,
    });
  }

  /**
   * Assert that the current user's role is one of the allowed roles.
   * Throws ForbiddenError if not.
   */
  protected assertRole(...allowed: UserRole[]): void {
    if (!allowed.includes(this.ctx.role)) {
      throw new ForbiddenError(
        `Role '${this.ctx.role}' cannot perform this operation. Required: ${allowed.join(', ')}`,
      );
    }
  }

  /**
   * Return a Prisma where clause scoped to this tenant.
   * Always use this to prevent cross-tenant data leaks.
   */
  protected tenantScope(): { tenantId: string } {
    return { tenantId: this.ctx.tenantId };
  }

  /**
   * Shorthand to get the tenant ID from context.
   */
  protected get tenantId(): string {
    return this.ctx.tenantId;
  }

  /**
   * Shorthand to get the user ID from context.
   */
  protected get userId(): string {
    return this.ctx.userId;
  }
}
