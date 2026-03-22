-- ============================================================================
-- AgentGuard — Audit Event Partition Maintenance
-- ============================================================================
-- Run this script via cron (e.g. on the 1st of each month) to:
--   1. Create the next month's partition BEFORE it is needed
--   2. Optionally detach/archive old partitions beyond retention window
--
-- SCHEDULE: Run at 00:05 on the 1st of each month
--   Cron: 5 0 1 * * psql $DATABASE_URL -f partition-maintenance.sql
--
-- RETENTION POLICY (configurable):
--   - DETACH_AFTER_MONTHS: detach partitions older than N months (default 24)
--   - Set to 0 to disable detachment (keep all partitions attached)
--
-- DETACHED partitions remain in the database as regular tables; they can be:
--   - Queried directly: SELECT * FROM "AuditEvent_2024_01" WHERE ...
--   - Archived to cold storage (pg_dump the partition, then drop)
--   - Reattached if needed: ATTACH PARTITION ... FOR VALUES FROM ... TO ...
-- ============================================================================

-- ── Configuration ─────────────────────────────────────────────────────────────
\set DETACH_AFTER_MONTHS 24
\set CREATE_AHEAD_MONTHS 2

-- ── Helper: create partition function (idempotent) ───────────────────────────
CREATE OR REPLACE FUNCTION create_audit_partition(year INT, month INT)
RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  start_date     DATE;
  end_date       DATE;
  exists_already BOOLEAN;
BEGIN
  partition_name := format('AuditEvent_%s_%s', year, lpad(month::TEXT, 2, '0'));
  start_date     := make_date(year, month, 1);
  end_date       := start_date + INTERVAL '1 month';

  -- Check if partition already exists
  SELECT EXISTS(
    SELECT 1 FROM pg_class WHERE relname = partition_name
  ) INTO exists_already;

  IF exists_already THEN
    RAISE NOTICE 'Partition % already exists — skipping', partition_name;
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE TABLE %I PARTITION OF "AuditEvent" FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    start_date,
    end_date
  );

  RAISE NOTICE 'Created partition % (% to %)', partition_name, start_date, end_date;
END;
$$ LANGUAGE plpgsql;

-- ── Helper: detach old partition ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION detach_audit_partition(year INT, month INT)
RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  start_date     DATE;
  end_date       DATE;
  is_attached    BOOLEAN;
BEGIN
  partition_name := format('AuditEvent_%s_%s', year, lpad(month::TEXT, 2, '0'));
  start_date     := make_date(year, month, 1);
  end_date       := start_date + INTERVAL '1 month';

  -- Check if it is currently an attached partition
  SELECT EXISTS(
    SELECT 1
    FROM pg_inherits i
    JOIN pg_class parent ON i.inhparent = parent.oid
    JOIN pg_class child  ON i.inhrelid  = child.oid
    WHERE parent.relname = 'AuditEvent'
      AND child.relname  = partition_name
  ) INTO is_attached;

  IF NOT is_attached THEN
    RAISE NOTICE 'Partition % is not attached — skipping', partition_name;
    RETURN;
  END IF;

  -- DETACH CONCURRENTLY avoids a full table lock (PostgreSQL 14+)
  -- Falls back to regular DETACH for older versions
  BEGIN
    EXECUTE format(
      'ALTER TABLE "AuditEvent" DETACH PARTITION %I CONCURRENTLY',
      partition_name
    );
    RAISE NOTICE 'Detached partition % (CONCURRENTLY)', partition_name;
  EXCEPTION WHEN syntax_error THEN
    -- Fallback for PostgreSQL < 14
    EXECUTE format(
      'ALTER TABLE "AuditEvent" DETACH PARTITION %I',
      partition_name
    );
    RAISE NOTICE 'Detached partition % (standard)', partition_name;
  END;
END;
$$ LANGUAGE plpgsql;

-- ── Main maintenance block ────────────────────────────────────────────────────
DO $$
DECLARE
  now_date       DATE    := date_trunc('month', CURRENT_DATE);
  ahead_months   INT     := 2;   -- create partitions this many months ahead
  detach_months  INT     := 24;  -- detach partitions older than this many months
  target_date    DATE;
  y              INT;
  m              INT;
BEGIN
  -- Create upcoming partitions (current month + ahead_months)
  FOR i IN 0..ahead_months LOOP
    target_date := now_date + (i || ' months')::INTERVAL;
    y := EXTRACT(YEAR  FROM target_date)::INT;
    m := EXTRACT(MONTH FROM target_date)::INT;
    PERFORM create_audit_partition(y, m);
  END LOOP;

  -- Detach old partitions beyond retention window (if detach_months > 0)
  IF detach_months > 0 THEN
    -- Find all attached partitions older than the retention window
    FOR target_date IN
      SELECT DISTINCT
        date_trunc('month', range_start)::DATE AS partition_month
      FROM (
        SELECT (pg_get_expr(c.relpartbound, c.oid) ~ '(\d{4}-\d{2}-\d{2})') AS has_bound,
               c.relname
        FROM pg_class c
        JOIN pg_inherits i ON c.oid = i.inhrelid
        JOIN pg_class p    ON i.inhparent = p.oid
        WHERE p.relname = 'AuditEvent'
      ) parts,
      LATERAL (
        SELECT regexp_matches(
          pg_get_expr(
            (SELECT relpartbound FROM pg_class WHERE relname = parts.relname),
            (SELECT oid FROM pg_class WHERE relname = parts.relname)
          ),
          '''(\d{4}-\d{2}-\d{2})'
        ) AS m
      ) bounds,
      LATERAL (SELECT bounds.m[1]::DATE AS range_start) rs
      WHERE rs.range_start < now_date - (detach_months || ' months')::INTERVAL
    LOOP
      y := EXTRACT(YEAR  FROM target_date)::INT;
      m := EXTRACT(MONTH FROM target_date)::INT;
      PERFORM detach_audit_partition(y, m);
    END LOOP;
  END IF;

  RAISE NOTICE 'Partition maintenance complete at %', now();
END;
$$;

-- ── Diagnostic queries ────────────────────────────────────────────────────────
-- Run these to inspect partition status:

-- List all attached partitions with row counts:
-- SELECT
--   c.relname              AS partition_name,
--   pg_get_expr(c.relpartbound, c.oid) AS bounds,
--   pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
--   (SELECT reltuples::BIGINT FROM pg_class WHERE oid = c.oid) AS est_rows
-- FROM pg_class c
-- JOIN pg_inherits i ON c.oid = i.inhrelid
-- JOIN pg_class p    ON i.inhparent = p.oid
-- WHERE p.relname = 'AuditEvent'
-- ORDER BY c.relname;

-- Check partition pruning is working (look for "Seq Scan on AuditEvent_<month>"):
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM "AuditEvent"
-- WHERE "occurredAt" BETWEEN '2026-03-01' AND '2026-03-31'
--   AND "tenantId" = 'your-tenant-id'
-- ORDER BY "occurredAt" DESC
-- LIMIT 100;
