-- ============================================================================
-- ROLLBACK: partition-auto-trigger.sql
-- AgentGuard — Remove automatic partition creation trigger functions
-- ============================================================================
-- Removes the auto-provisioning function and pg_cron job installed by
-- partition-auto-trigger.sql. Does NOT remove existing partitions or data.
--
-- If you want to fully remove all partition infrastructure, run these
-- rollback scripts in reverse dependency order:
--   1. rollback-partition-auto-trigger.sql   (this file)
--   2. rollback-partition-maintenance.sql
--   3. rollback-partition-audit-events.sql   (removes the partitioned table itself)
--
-- HOW TO RUN:
--   psql $DATABASE_URL -f rollback-partition-auto-trigger.sql
-- ============================================================================

BEGIN;

-- ── Remove pg_cron scheduled job (if configured) ─────────────────────────────
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
      RAISE NOTICE 'Job not found or already removed: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron not installed — no job to remove';
  END IF;
END;
$$;

-- ── Drop the auto-provisioning function ──────────────────────────────────────
DROP FUNCTION IF EXISTS auto_provision_audit_partitions();

-- ── Drop the single-partition creation helper ────────────────────────────────
-- Only if you are fully removing all partition infrastructure (partitioned
-- AuditEvent table has been dropped or rolled back first).
-- Uncomment only after rollback-partition-audit-events.sql has run:
--
-- DROP FUNCTION IF EXISTS create_audit_partition(INT, INT);

COMMIT;

-- Verify: functions should no longer exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'auto_provision_audit_partitions'
  AND routine_schema = 'public';
-- Expected: 0 rows
