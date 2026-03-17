/**
 * Database-backed rate limit helpers (sliding window, SQLite + PostgreSQL).
 *
 * These are consumed by:
 *  - api/routes/evaluate.ts
 *  - api/routes/evaluate-batch.ts
 *  - api/routes/rate-limits.ts
 */

import type { IDatabase } from '../db-interface.js';

interface RateLimitRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  window_seconds: number;
  max_requests: number;
  created_at: string;
}

/**
 * Sliding-window rate limit check (async, works with both SQLite and PostgreSQL).
 *
 * Returns `allowed = true` with `remaining = -1` when no limits are configured.
 */
export async function checkRateLimit(
  db: IDatabase,
  tenantId: string,
  agentId?: string | null
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const limits = await db.all<RateLimitRow>(
    `SELECT * FROM rate_limits
     WHERE tenant_id = ?
       AND (agent_id = ? OR agent_id IS NULL)
     ORDER BY
       CASE WHEN agent_id IS NOT NULL THEN 0 ELSE 1 END ASC,
       max_requests ASC`,
    [tenantId, agentId ?? null]
  );

  if (limits.length === 0) {
    return { allowed: true, remaining: -1, resetAt: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const effectiveAgentId = agentId ?? '__tenant__';

  for (const limit of limits) {
    const windowStart = now - limit.window_seconds;

    const row = await db.get<{ total: number }>(
      `SELECT COALESCE(SUM(count), 0) as total
       FROM rate_counters
       WHERE tenant_id = ?
         AND agent_id = ?
         AND window_start > ?`,
      [tenantId, effectiveAgentId, windowStart]
    );

    const count = row?.total ?? 0;
    const remaining = Math.max(0, limit.max_requests - count);
    const resetAt = now + limit.window_seconds;

    if (count >= limit.max_requests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    return { allowed: true, remaining, resetAt };
  }

  return { allowed: true, remaining: -1, resetAt: 0 };
}

/**
 * Increment the sliding-window rate counter bucket for a tenant/agent.
 * Uses a 60-second bucket granularity with probabilistic stale-bucket cleanup.
 */
export async function incrementRateCounter(
  db: IDatabase,
  tenantId: string,
  agentId?: string | null
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const effectiveAgentId = agentId ?? '__tenant__';
  const bucketStart = now - (now % 60);

  await db.run(
    `INSERT INTO rate_counters (tenant_id, agent_id, window_start, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(tenant_id, agent_id, window_start)
     DO UPDATE SET count = count + 1`,
    [tenantId, effectiveAgentId, bucketStart]
  );

  // Probabilistic cleanup of stale buckets (1% chance per call)
  if (Math.random() < 0.01) {
    await db.run(
      'DELETE FROM rate_counters WHERE window_start < ?',
      [now - 86400]
    );
  }
}
