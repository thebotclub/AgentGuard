/**
 * Tenant RLS middleware — sets PostgreSQL session variable for Row-Level Security.
 * Must run AFTER authMiddleware so ctx is available.
 */
import type { Context, Next } from 'hono';
import { prisma } from '../lib/prisma.js';
import { getContext } from './auth.js';

/**
 * Sets `app.current_tenant_id` as a PostgreSQL session-local config variable.
 * The RLS policy on each table checks this value.
 * This is a defence-in-depth control — application code still uses tenantId explicitly.
 */
export async function tenantRLSMiddleware(c: Context, next: Next): Promise<void> {
  const ctx = getContext(c);

  // Set PostgreSQL session variable for RLS enforcement
  // Using set_config with is_local=true means it applies only to current transaction
  await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true)`;

  await next();
}
