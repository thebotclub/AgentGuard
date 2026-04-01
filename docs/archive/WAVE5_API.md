# Wave 5: API Versioning + Rate Limiting + Audit Partitioning

**Branch:** main  
**Commits:** 3 (one per task)  
**Status:** ✅ Complete

---

## Task 1 — API Versioning

**Commit:** `feat(api): Task 1 — API versioning with /v1/ prefix, redirects, and deprecation headers`

### What was done

All AgentGuard API routes were already living under `/v1/`. This wave formalised the versioning contract and added future-proofing infrastructure.

### Files changed

| File | Change |
|------|--------|
| `packages/api/src/middleware/versioning.ts` | **New** — version negotiation + deprecation header middleware |
| `packages/api/src/app.ts` | Updated — wired new middleware, added backward-compatible redirects |

### Versioning strategy

```
GET /agents          →  308  →  /v1/agents     (backward-compatible redirect)
GET /v1/agents       →  200  (canonical route)
```

**URL prefix (primary):**  
All canonical routes live at `/v1/<resource>`. This is the recommended approach for clients.

**Accept header (optional, content-type-based):**  
Clients may negotiate using:
```
Accept: application/vnd.agentguard.v1+json
```
Requesting an unsupported version (e.g. `v2`) returns **406 Not Acceptable** with a structured error body listing supported versions.

**Deprecation headers (RFC 8594, future-proofing):**  
When `/v1/` is eventually deprecated in favour of `/v2/`, the following headers will be added to all v1 responses:
```
Deprecation: 2027-01-01
Sunset: 2027-07-01
Link: <https://docs.agentguard.ai/api/migration/v2>; rel="successor-version"
```
Currently these are `null` — the middleware is wired but will activate when `DEPRECATION_INFO.v1` is populated.

**Version advertisement headers (always present):**
```
X-API-Version: v1
X-API-Supported-Versions: v1
```

**Backward-compatible redirects:**  
Legacy unversioned paths 308-redirect to `/v1/`:
```
/health     → /v1/health
/agents     → /v1/agents
/policies   → /v1/policies
/actions    → /v1/actions
/audit      → /v1/audit
/killswitch → /v1/killswitch
/hitl       → /v1/hitl
/events     → /v1/events
/compliance → /v1/compliance
```
`308 Permanent Redirect` preserves HTTP method (POST stays POST, etc.).

---

## Task 2 — Per-Tenant Rate Limiting

**Commit:** `feat(api): Task 2 — per-tenant rate limiting middleware`

### What was done

Added a Redis-backed, per-tenant rate limiter with graceful in-memory fallback.

### Files changed

| File | Change |
|------|--------|
| `packages/api/src/middleware/rate-limit.ts` | **New** — complete rate limit middleware |
| `packages/api/src/app.ts` | Updated — wired after auth, before RLS |

### Rate limits

| Plan | Limit |
|------|-------|
| FREE | 100 req/min |
| TEAM | 1,000 req/min |
| BUSINESS | 5,000 req/min |
| ENTERPRISE | 10,000 req/min |

### Implementation

**Window:** Fixed 1-minute window (resets on the minute boundary).

**Counter key:** `ratelimit:v1:<tenantId>:<epoch-minute-window>`

**Redis atomicity:** Lua script ensures `INCR` + `EXPIRE` is atomic — no race conditions under concurrent requests.

**In-memory fallback:** When Redis is unavailable, a `Map<string, InMemoryBucket>` is used. `X-RateLimit-Source: memory` header signals degraded mode. GC runs when store exceeds 10,000 entries.

**Tenant plan caching:** Tenant plan is fetched from PostgreSQL and cached for 60 seconds. Stale cache is used during DB downtime.

### Response headers

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1742601660          (Unix epoch of window reset)
X-RateLimit-Policy: 1000;w=60         (RFC 6585 compatible)
```

### 429 Too Many Requests

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. TEAM plan allows 1000 requests per minute.",
    "limit": 1000,
    "remaining": 0,
    "resetAt": "2026-03-22T02:01:00.000Z",
    "retryAfter": 23
  }
}
```
Plus header: `Retry-After: 23`

### Middleware order in app.ts

```
authMiddleware           ← sets ctx.tenantId
rateLimitMiddleware      ← uses ctx.tenantId to look up plan + count
tenantRLSMiddleware      ← sets PostgreSQL session variable
routes...
```

Health endpoint (`/v1/health`) is excluded from rate limiting (no auth context).

---

## Task 3 — PostgreSQL Audit Event Partitioning

**Commit:** `feat(db): Task 3 — PostgreSQL AuditEvent monthly range partitioning`

### What was done

Converted the `AuditEvent` table to a RANGE-partitioned table on `occurredAt` (monthly). This dramatically improves query performance for date-range filtered audit queries, which are the dominant access pattern.

### Files changed

| File | Purpose |
|------|---------|
| `packages/api/prisma/partition-audit-events.sql` | Migration: converts table to partitioned, migrates data |
| `packages/api/prisma/partition-maintenance.sql` | SQL maintenance script (create future, detach old) |
| `packages/api/prisma/partition-auto-trigger.sql` | pg_cron integration + helper functions |
| `packages/api/scripts/partition-maintenance.ts` | TypeScript CLI for CI/cron integration |
| `packages/api/package.json` | Added `db:partition:migrate` and `db:partition:maintain` scripts |

### Partition design

```
AuditEvent (parent, RANGE on occurredAt)
├── AuditEvent_2026_01  (2026-01-01 → 2026-02-01)
├── AuditEvent_2026_02  (2026-02-01 → 2026-03-01)
├── AuditEvent_2026_03  (2026-03-01 → 2026-04-01)   ← current
├── AuditEvent_2026_04  (2026-04-01 → 2026-05-01)   ← pre-created
└── AuditEvent_2026_05  (2026-05-01 → 2026-06-01)   ← pre-created (buffer)
```

### Running the migration

```bash
# 1. Dry run to review (optional)
npm run -w @agentguard/api db:partition:maintain:dry

# 2. Run the migration (requires maintenance window for large tables)
npm run -w @agentguard/api db:partition:migrate
# Equivalent: psql $DATABASE_URL -f packages/api/prisma/partition-audit-events.sql

# 3. Verify the old table still exists as _AuditEvent_old
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"_AuditEvent_old\";"

# 4. After confirming app works (1-2 weeks):
psql $DATABASE_URL -c "DROP TABLE \"_AuditEvent_old\";"
```

### Migration steps (partition-audit-events.sql)

1. Rename `AuditEvent` → `_AuditEvent_old`
2. Create new `AuditEvent` with `PARTITION BY RANGE ("occurredAt")`
3. Recreate all indexes (partition key included per PostgreSQL requirement)
4. Create 6 initial partitions (3 back + current + 2 ahead)
5. Migrate data in 10,000-row batches with `OFFSET`-based cursor
6. Verify row counts match (rolls back if mismatch)
7. Re-enable RLS + tenant isolation policy
8. Drop FK from `HITLGate.auditEventId` (PostgreSQL limitation: FK must reference all partition key columns)

### Automatic partition creation

**Option A — pg_cron (recommended):**
```sql
SELECT cron.schedule(
  'agentguard-partition-maintenance',
  '5 0 1 * *',                        -- 00:05 UTC on 1st of each month
  $$ SELECT auto_provision_audit_partitions(); $$
);
```
See `partition-auto-trigger.sql` for setup instructions.

**Option B — External cron:**
```bash
# Crontab: 00:05 on 1st of each month
5 0 1 * * cd /app && DATABASE_URL=$DATABASE_URL npx tsx packages/api/scripts/partition-maintenance.ts
```

### Partition maintenance CLI

```bash
# Create upcoming partitions + detach partitions older than 24 months
npx tsx packages/api/scripts/partition-maintenance.ts

# Custom retention window
npx tsx packages/api/scripts/partition-maintenance.ts --detach-after 12

# Only create, never detach
npx tsx packages/api/scripts/partition-maintenance.ts --detach-after 0

# Dry run
npx tsx packages/api/scripts/partition-maintenance.ts --dry-run
```

### Query performance

**Before partitioning:** Full table scan or index scan across all rows.

**After partitioning:** Partition pruning applies automatically. Example:
```sql
EXPLAIN ANALYZE
SELECT * FROM "AuditEvent"
WHERE "occurredAt" BETWEEN '2026-03-01' AND '2026-03-31'
  AND "tenantId" = 'tenant_abc';
-- PostgreSQL scans ONLY AuditEvent_2026_03 — all other partitions are excluded
```

**Detached partitions** (beyond retention window) remain as standalone tables and can be:
- Queried directly: `SELECT * FROM "AuditEvent_2024_01" WHERE ...`
- Archived: `pg_dump -t "AuditEvent_2024_01" ...` then drop
- Reattached: `ALTER TABLE "AuditEvent" ATTACH PARTITION "AuditEvent_2024_01" FOR VALUES FROM ('2024-01-01') TO ('2024-02-01')`

### Known limitation

PostgreSQL requires that foreign keys reference all columns in the partition key. Since `HITLGate.auditEventId` referenced `AuditEvent.id` (not the composite PK `(id, occurredAt)`), this FK was removed and is now application-enforced in `HITLService`. The `HITLGate.auditEventId` column is retained; validation happens at INSERT time in the service layer.

---

## Summary of commits

| Commit | Task | Message |
|--------|------|---------|
| `5c74491` | 1 | feat(api): Task 1 — API versioning with /v1/ prefix, redirects, and deprecation headers |
| `2643c2b` | 2 | feat(api): Task 2 — per-tenant rate limiting middleware |
| `0561ccb` | 3 | feat(db): Task 3 — PostgreSQL AuditEvent monthly range partitioning |
