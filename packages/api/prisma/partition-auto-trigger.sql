-- ============================================================================
-- AgentGuard — Automatic Partition Creation Trigger
-- ============================================================================
-- Installs a PostgreSQL function + pg_cron job (if available) that creates the
-- next month's partition automatically on the 1st of each month at 00:05 UTC.
--
-- OPTION A: pg_cron (recommended for managed PostgreSQL like Azure, AWS RDS)
-- OPTION B: Manual cron job calling partition-maintenance.ts
--
-- Prerequisites:
--   pg_cron extension must be enabled (if using Option A).
--   On Azure Database for PostgreSQL:
--     ALTER SYSTEM SET shared_preload_libraries = 'pg_cron';
--     CREATE EXTENSION IF NOT EXISTS pg_cron;
--   On AWS RDS:
--     Enabled via parameter group: shared_preload_libraries = 'pg_cron'
-- ============================================================================

-- ── Ensure create_audit_partition function exists ─────────────────────────────
-- (Also defined in partition-audit-events.sql; safe to re-run)
CREATE OR REPLACE FUNCTION create_audit_partition(year INT, month INT)
RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  start_date     DATE;
  end_date       DATE;
BEGIN
  partition_name := format('AuditEvent_%s_%s', year, lpad(month::TEXT, 2, '0'));
  start_date     := make_date(year, month, 1);
  end_date       := start_date + INTERVAL '1 month';

  IF EXISTS(SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
    RAISE NOTICE 'Partition % already exists', partition_name;
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE TABLE %I PARTITION OF "AuditEvent" FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );

  RAISE NOTICE 'Auto-created partition % (% to %)', partition_name, start_date, end_date;
END;
$$ LANGUAGE plpgsql;

-- ── Monthly auto-provision function ──────────────────────────────────────────
-- Creates current + next month partitions (idempotent).
CREATE OR REPLACE FUNCTION auto_provision_audit_partitions()
RETURNS VOID AS $$
DECLARE
  target DATE;
  y INT;
  m INT;
BEGIN
  -- Current month
  target := date_trunc('month', CURRENT_DATE);
  PERFORM create_audit_partition(
    EXTRACT(YEAR  FROM target)::INT,
    EXTRACT(MONTH FROM target)::INT
  );

  -- Next month
  target := date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
  PERFORM create_audit_partition(
    EXTRACT(YEAR  FROM target)::INT,
    EXTRACT(MONTH FROM target)::INT
  );

  -- Month after next (safety buffer)
  target := date_trunc('month', CURRENT_DATE) + INTERVAL '2 months';
  PERFORM create_audit_partition(
    EXTRACT(YEAR  FROM target)::INT,
    EXTRACT(MONTH FROM target)::INT
  );
END;
$$ LANGUAGE plpgsql;

-- ── OPTION A: pg_cron scheduled job ──────────────────────────────────────────
-- Uncomment if pg_cron is available in your PostgreSQL instance.
-- Runs at 00:05 UTC on the 1st of each month.
--
-- SELECT cron.schedule(
--   'agentguard-partition-maintenance',   -- job name
--   '5 0 1 * *',                          -- cron expression: 00:05 on 1st of month
--   $$ SELECT auto_provision_audit_partitions(); $$
-- );
--
-- Verify with:
-- SELECT * FROM cron.job WHERE jobname = 'agentguard-partition-maintenance';
--
-- Remove with:
-- SELECT cron.unschedule('agentguard-partition-maintenance');

-- ── OPTION B: Event trigger on INSERT ─────────────────────────────────────────
-- Alternatively, use a trigger that fires when a new row would hit a missing
-- partition (PostgreSQL raises an error; we intercept it in the app layer).
-- The TypeScript script (scripts/partition-maintenance.ts) is recommended
-- for production use with a monthly cron job.

-- ── Quick health check ────────────────────────────────────────────────────────
-- Run this to verify the trigger is installed and partitions look healthy:

-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_name IN ('create_audit_partition', 'auto_provision_audit_partitions');

-- SELECT
--   c.relname AS partition,
--   pg_get_expr(c.relpartbound, c.oid) AS range,
--   pg_size_pretty(pg_total_relation_size(c.oid)) AS size
-- FROM pg_class c
-- JOIN pg_inherits i ON c.oid = i.inhrelid
-- JOIN pg_class p    ON i.inhparent = p.oid
-- WHERE p.relname = 'AuditEvent'
-- ORDER BY c.relname;
