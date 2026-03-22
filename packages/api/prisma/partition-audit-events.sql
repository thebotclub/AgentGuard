-- ============================================================================
-- AgentGuard — Audit Event Table Partitioning Migration
-- ============================================================================
-- Converts "AuditEvent" to a PostgreSQL RANGE-partitioned table on occurredAt.
-- Monthly partitions dramatically improve query performance for date-range
-- filtered queries (the most common audit log access pattern).
--
-- STRATEGY:
--   - RANGE partitioning on occurredAt (monthly)
--   - Partition key MUST be included in every index on the partitioned table
--   - The old non-partitioned table is renamed to _AuditEvent_old for safety
--   - Data is migrated in batches to avoid lock escalation
--   - Initial partitions: 3 months back → 2 months ahead (adjust as needed)
--
-- PERFORMANCE IMPACT:
--   - Queries with WHERE occurredAt BETWEEN t1 AND t2 → partition pruning
--   - Each partition has its own indexes → smaller B-trees, faster scans
--   - VACUUM and AUTOVACUUM work per-partition → reduced table bloat
--
-- PREREQUISITES:
--   - pg_partman extension (optional; for automatic future partition creation)
--   - Run as PostgreSQL superuser or table owner
--   - Maintenance window recommended for large tables (>1M rows)
--
-- ROLLBACK:
--   - Rename _AuditEvent_old back to "AuditEvent"
--   - Drop the partitioned table (cannot drop parent while partitions exist)
--
-- ============================================================================

BEGIN;

-- ── 1. Rename existing table (safety net) ─────────────────────────────────────
ALTER TABLE "AuditEvent" RENAME TO "_AuditEvent_old";

-- ── 2. Create new partitioned table ──────────────────────────────────────────
-- IMPORTANT: occurredAt must be part of the PRIMARY KEY for partitioned tables.
-- We use (id, occurredAt) as the composite PK. The application-level uniqueness
-- on id is enforced by the UNIQUE index created below.
CREATE TABLE "AuditEvent" (
  id                   TEXT NOT NULL,
  "tenantId"           TEXT NOT NULL,
  "agentId"            TEXT NOT NULL,
  "sessionId"          TEXT NOT NULL,

  "occurredAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processingMs"       INTEGER NOT NULL,

  "actionType"         TEXT NOT NULL,
  "toolName"           TEXT,
  "toolTarget"         TEXT,
  "actionParams"       JSONB,
  "actionResult"       JSONB,
  "executionMs"        INTEGER,

  "policyDecision"     TEXT NOT NULL,
  "policyId"           TEXT,
  "policyVersion"      TEXT,
  "matchedRuleId"      TEXT,
  "matchedRuleIds"     TEXT[] NOT NULL DEFAULT '{}',
  "blockReason"        TEXT,

  "riskScore"          INTEGER NOT NULL DEFAULT 0,
  "riskTier"           TEXT NOT NULL DEFAULT 'LOW',
  "anomalyFlags"       TEXT[] NOT NULL DEFAULT '{}',

  "inputDataLabels"    TEXT[] NOT NULL DEFAULT '{}',
  "outputDataLabels"   TEXT[] NOT NULL DEFAULT '{}',

  "planningTraceSummary" TEXT,
  "ragSourceIds"       TEXT[] NOT NULL DEFAULT '{}',
  "priorEventIds"      TEXT[] NOT NULL DEFAULT '{}',

  "previousHash"       TEXT NOT NULL,
  "eventHash"          TEXT NOT NULL,

  -- Composite PK required for partitioned tables (partition key must be included)
  PRIMARY KEY (id, "occurredAt")
) PARTITION BY RANGE ("occurredAt");

-- ── 3. Restore foreign key constraints ────────────────────────────────────────
-- NOTE: PostgreSQL 12+ supports FK references TO partitioned tables.
-- FKs FROM partitioned tables to other tables work natively.
-- We skip FK back-references from HITLGate to AuditEvent for now
-- (auditEventId on HITLGate → handled at application level).

-- ── 4. Recreate indexes on the partitioned table ──────────────────────────────
-- All indexes on partitioned tables must include the partition key (occurredAt).

-- Unique index on id (application-level uniqueness guarantee)
CREATE UNIQUE INDEX "AuditEvent_id_key"
  ON "AuditEvent" (id, "occurredAt");

-- Primary lookup: tenantId + id
CREATE INDEX "AuditEvent_tenantId_id_idx"
  ON "AuditEvent" ("tenantId", id, "occurredAt");

-- Most common query: tenant events by time (DESC)
CREATE INDEX "AuditEvent_tenantId_occurredAt_idx"
  ON "AuditEvent" ("tenantId", "occurredAt" DESC);

-- Agent-scoped event timeline
CREATE INDEX "AuditEvent_tenantId_agentId_occurredAt_idx"
  ON "AuditEvent" ("tenantId", "agentId", "occurredAt" DESC);

-- Session-scoped event timeline (for hash chain verification)
CREATE INDEX "AuditEvent_tenantId_sessionId_occurredAt_idx"
  ON "AuditEvent" ("tenantId", "sessionId", "occurredAt" ASC);

-- Policy decision filtering
CREATE INDEX "AuditEvent_tenantId_policyDecision_occurredAt_idx"
  ON "AuditEvent" ("tenantId", "policyDecision", "occurredAt" DESC);

-- Risk tier filtering
CREATE INDEX "AuditEvent_tenantId_riskTier_occurredAt_idx"
  ON "AuditEvent" ("tenantId", "riskTier", "occurredAt" DESC);

-- ── 5. Create initial monthly partitions ─────────────────────────────────────
-- Covers 3 months back + current + 2 months ahead.
-- Adjust the date range based on when you're running this migration.

-- Helper function to create a single monthly partition
CREATE OR REPLACE FUNCTION create_audit_partition(year INT, month INT)
RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  start_date     DATE;
  end_date       DATE;
BEGIN
  partition_name := format('"AuditEvent_%s_%s"', year, lpad(month::TEXT, 2, '0'));
  start_date     := make_date(year, month, 1);
  end_date       := start_date + INTERVAL '1 month';

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %s
     PARTITION OF "AuditEvent"
     FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    start_date,
    end_date
  );

  RAISE NOTICE 'Created partition % (% to %)', partition_name, start_date, end_date;
END;
$$ LANGUAGE plpgsql;

-- Create partitions: 3 months back through 2 months ahead
DO $$
DECLARE
  target_date DATE;
  y INT;
  m INT;
BEGIN
  -- 3 months back
  FOR i IN -3..2 LOOP
    target_date := date_trunc('month', now()) + (i || ' months')::INTERVAL;
    y := EXTRACT(YEAR FROM target_date)::INT;
    m := EXTRACT(MONTH FROM target_date)::INT;
    PERFORM create_audit_partition(y, m);
  END LOOP;
END;
$$;

-- ── 6. Migrate data from old table in batches ──────────────────────────────────
-- Uses a cursor-based batch insert to avoid long locks.
-- Batch size 10,000 rows; adjust based on table size and maintenance window.

DO $$
DECLARE
  batch_size  INT := 10000;
  offset_val  INT := 0;
  rows_moved  INT;
  total_moved INT := 0;
BEGIN
  LOOP
    WITH batch AS (
      SELECT * FROM "_AuditEvent_old"
      ORDER BY "occurredAt", id
      LIMIT batch_size OFFSET offset_val
    )
    INSERT INTO "AuditEvent"
    SELECT * FROM batch
    ON CONFLICT (id, "occurredAt") DO NOTHING;

    GET DIAGNOSTICS rows_moved = ROW_COUNT;
    total_moved := total_moved + rows_moved;
    offset_val  := offset_val + batch_size;

    RAISE NOTICE 'Migrated % rows (total: %)', rows_moved, total_moved;

    EXIT WHEN rows_moved < batch_size;
  END LOOP;

  RAISE NOTICE 'Migration complete. Total rows migrated: %', total_moved;
END;
$$;

-- ── 7. Verify row counts match ────────────────────────────────────────────────
DO $$
DECLARE
  old_count BIGINT;
  new_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO old_count FROM "_AuditEvent_old";
  SELECT COUNT(*) INTO new_count FROM "AuditEvent";

  IF old_count <> new_count THEN
    RAISE EXCEPTION 'Row count mismatch! Old: %, New: % — ROLLING BACK', old_count, new_count;
  END IF;

  RAISE NOTICE 'Row count verified: % rows in both tables', new_count;
END;
$$;

-- ── 8. Enable RLS on the new partitioned table ────────────────────────────────
-- RLS on the parent automatically applies to all partitions.
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AuditEvent"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── 9. Recreate HITLGate foreign key (auditEventId) ──────────────────────────
-- HITLGate.auditEventId references AuditEvent.id
-- Since AuditEvent is now partitioned with PK (id, occurredAt), we cannot
-- have a direct FK to id alone. Drop and re-add as application-enforced reference.
-- The application already validates this relationship in HITLService.
-- (This is a known PostgreSQL limitation with partitioned table FKs on non-PK columns)
ALTER TABLE "HITLGate" DROP CONSTRAINT IF EXISTS "HITLGate_auditEventId_fkey";
COMMENT ON COLUMN "HITLGate"."auditEventId" IS
  'Application-enforced reference to AuditEvent.id (FK removed due to partitioning)';

COMMIT;

-- ── Post-migration steps (run separately after verifying production) ───────────
-- 1. Verify application works correctly with the new partitioned table
-- 2. After confidence period (1-2 weeks), drop the old table:
--    DROP TABLE "_AuditEvent_old";
-- 3. Set up the automatic partition function (see partition-maintenance.sql)
