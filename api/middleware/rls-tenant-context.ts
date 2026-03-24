/**
 * RLS Tenant Context Middleware
 *
 * This module exports the helper used by auth middleware (auth.ts) to
 * activate the Row Level Security context for each authenticated request.
 *
 * HOW IT WORKS
 * ────────────
 * 1. Auth middleware (requireTenantAuth / requireEvaluateAuth / optionalTenantAuth)
 *    determines req.tenantId from the API key or JWT token.
 * 2. Instead of calling `next()` directly, auth calls `nextWithRlsContext(tenantId, next)`.
 * 3. This wraps the remainder of the async call chain in rlsContext.run(tenantId, ...),
 *    which stores tenantId in AsyncLocalStorage for the current async context.
 * 4. The PostgreSQL query helpers (exec/get/all in db-postgres.ts) check this
 *    context and, when present, wrap each query in:
 *       BEGIN
 *       SET LOCAL app.current_tenant_id = '<tenantId>'
 *       <actual query>
 *       COMMIT
 *    `SET LOCAL` is transaction-scoped, so it can never leak between requests
 *    on the same pooled connection.
 *
 * SQLITE FALLBACK
 * ───────────────
 * The rlsContext is set in AsyncLocalStorage regardless of DB type, but the
 * SQLite adapter never calls SET LOCAL, so this is a harmless no-op on SQLite.
 *
 * FAIL-CLOSED BEHAVIOUR
 * ─────────────────────
 * Unauthenticated / demo requests don't set a context. Postgres RLS policies
 * evaluate current_setting('app.current_tenant_id', true) as NULL and return
 * no rows — safe fail-closed behaviour for any accidentally unsecured query.
 */
import { NextFunction } from 'express';
import { rlsContext } from '../lib/rls-context.js';

/**
 * Wrap `next` inside an RLS async context for the given tenant.
 * Call this in auth middleware wherever `next()` would normally be called
 * after successfully authenticating a tenant.
 *
 * @param tenantId - The authenticated tenant's ID.
 * @param next     - Express NextFunction to call inside the context.
 */
export function nextWithRlsContext(tenantId: string, next: NextFunction): void {
  rlsContext.run(tenantId, next);
}
