-- ============================================================================
-- ROLLBACK: partition-audit-events.sql
-- AgentGuard — Restore AuditEvent from partitioned table to plain table
-- ============================================================================
-- Reverts the AuditEvent table from a RANGE-partitioned structure back to
-- a plain unpartitioned table (the original schema).
--
-- ⚠️  IMPORTANT PREREQUISITES:
--   1. The backup table "_AuditEvent_old" must still exist. If it was dropped
--      (post-migration cleanup), you CANNOT use this script — restore from
--      a pg_dump backup instead.
--   2. This is a DESTRUCTIVE operation. The partitioned table will be DROPPED.
--      Ensure you have a backup before proceeding.
--   3. Requires maintenance window — the swap involves a table rename which
--      briefly makes the table unavailable.
--
-- HOW TO RUN:
--   psql $DATABASE_URL -f rollback-partition-audit-events.sql
--
-- ESTIMATED DURATION: Depends on table size. For 10M rows: ~2-5 minutes.
-- ============================================================================

BEGIN;

-- ── Step 1: Verify the backup table exists ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_AuditEvent_old'
  ) THEN
    RAISE EXCEPTION
      'Backup table "_AuditEvent_old" does not exist. '
      'Cannot roll back without it — restore from a pg_dump backup instead.';
  END IF;
  RAISE NOTICE 'Backup table "_AuditEvent_old" found. Proceeding with rollback.';
END;
$$;

-- ── Step 2: Check row counts before proceeding ────────────────────────────────
DO $$
DECLARE
  old_count BIGINT;
  new_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO old_count FROM "_AuditEvent_old";
  SELECT COUNT(*) INTO new_count FROM "AuditEvent";
  RAISE NOTICE 'Row counts — backup: %, partitioned: %', old_count, new_count;
  IF new_count > old_count THEN
    RAISE NOTICE
      'Partitioned table has MORE rows (%). '
      'New events written after migration will be LOST in rollback.', new_count - old_count;
  END IF;
END;
$$;

-- ── Step 3: Drop RLS on partitioned table (before rename) ────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "AuditEvent";
ALTER TABLE "AuditEvent" DISABLE ROW LEVEL SECURITY;

-- ── Step 4: Rename partitioned table out of the way ──────────────────────────
ALTER TABLE "AuditEvent" RENAME TO "_AuditEvent_partitioned_bak";

-- ── Step 5: Restore backup table as the live table ───────────────────────────
ALTER TABLE "_AuditEvent_old" RENAME TO "AuditEvent";

-- ── Step 6: Restore RLS on the recovered table (match original migration) ─────
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AuditEvent"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── Step 7: Re-add HITLGate foreign key if it was dropped ────────────────────
ALTER TABLE "HITLGate"
  ADD CONSTRAINT "HITLGate_auditEventId_fkey"
  FOREIGN KEY ("auditEventId") REFERENCES "AuditEvent"(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;

-- ── Post-rollback cleanup (run manually after verifying app works) ────────────
-- Once you've confirmed the original table is working, you can drop the
-- partitioned backup:
--
-- WARNING: This cannot be undone without a database restore.
-- Run DROP PARTITION commands first (cannot drop parent while partitions exist):
--
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN (
--       SELECT c.relname FROM pg_class c
--       JOIN pg_inherits i ON c.oid = i.inhrelid
--       JOIN pg_class p ON i.inhparent = p.oid
--       WHERE p.relname = '_AuditEvent_partitioned_bak'
--     ) LOOP
--       EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.relname);
--     END LOOP;
--   END;
--   $$;
--   DROP TABLE IF EXISTS "_AuditEvent_partitioned_bak";

-- Verify rollback
SELECT
  relname AS table_name,
  relkind,
  rowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('AuditEvent', '_AuditEvent_old', '_AuditEvent_partitioned_bak')
ORDER BY relname;
