/**
 * RLS Tenant Context — AsyncLocalStorage-based per-request tenant tracking.
 *
 * This module maintains the current tenant_id for each in-flight request
 * using Node's AsyncLocalStorage, so the PostgreSQL adapter can automatically
 * issue `SET LOCAL app.current_tenant_id = '...'` before executing queries —
 * activating the Row Level Security policies deployed on all tenant tables.
 *
 * Usage:
 *   // In middleware (after auth sets req.tenantId):
 *   import { rlsContext } from '../lib/rls-context.js';
 *   rlsContext.run(tenantId, next);
 *
 *   // In db-postgres.ts (inside each query helper):
 *   const tenantId = rlsContext.getTenantId();
 *   if (tenantId) { ... SET LOCAL ... }
 */
import { AsyncLocalStorage } from 'async_hooks';

interface RlsStore {
  tenantId: string;
}

class RlsContext {
  private readonly store = new AsyncLocalStorage<RlsStore>();

  /**
   * Run `fn` inside an async context where `tenantId` is available.
   * Equivalent to `storage.run(store, fn)`.
   */
  run<T>(tenantId: string, fn: () => T): T {
    return this.store.run({ tenantId }, fn);
  }

  /**
   * Return the current request's tenant_id, or undefined if called outside
   * a request context (e.g. background jobs, migrations).
   */
  getTenantId(): string | undefined {
    return this.store.getStore()?.tenantId;
  }
}

/** Singleton shared across the entire process. */
export const rlsContext = new RlsContext();
