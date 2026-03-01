/**
 * Tenant RLS middleware — sets PostgreSQL session variable for Row-Level Security.
 * Must run AFTER authMiddleware so ctx is available.
 */
import type { Context, Next } from 'hono';
/**
 * Sets `app.current_tenant_id` as a PostgreSQL session-local config variable.
 * The RLS policy on each table checks this value.
 * This is a defence-in-depth control — application code still uses tenantId explicitly.
 */
export declare function tenantRLSMiddleware(c: Context, next: Next): Promise<void>;
//# sourceMappingURL=tenant.d.ts.map