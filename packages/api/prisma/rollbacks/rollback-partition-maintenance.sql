-- ============================================================================
-- ROLLBACK: partition-maintenance.sql
-- AgentGuard — Remove partition maintenance functions and pg_cron job
-- ============================================================================
-- Removes the monthly partition maintenance function and cancels the pg_cron
-- scheduled job (if configured). Safe to run at any time — does NOT affect
-- existing partition data.
--
-- HOW TO RUN:
--   psql $DATABASE_URL -f rollback-partition-maintenance.sql
-- ============================================================================

BEGIN;

-- ── Remove pg_cron scheduled job (if it was configured) ──────────────────────
-- Only runs if pg_cron is installed and the job exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'unschedule'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'cron')
  ) THEN
    BEGIN
      PERFORM cron.unschedule('agentguard-partition-maintenance');
      RAISE NOTICE 'Removed pg_cron job: agentguard-partition-maintenance';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron job not found (may not have been configured): %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron extension not installed — skipping job removal';
  END IF;
END;
$$;

-- ── Drop the auto-provision function ─────────────────────────────────────────
DROP FUNCTION IF EXISTS auto_provision_audit_partitions();

-- ── Drop the helper create function ──────────────────────────────────────────
-- NOTE: Only drop create_audit_partition if partition-audit-events.sql
-- has also been rolled back. If the partitioned table still exists, this
-- function is still needed for future partition creation.
-- Uncomment the line below only if partition-audit-events.sql has been rolled back:
--
-- DROP FUNCTION IF EXISTS create_audit_partition(INT, INT);

COMMIT;

-- Verify rollback
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('create_audit_partition', 'auto_provision_audit_partitions')
  AND routine_schema = 'public';
