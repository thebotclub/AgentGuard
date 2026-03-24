-- ============================================================================
-- ROLLBACK: wave2-agent-key-bcrypt.sql
-- AgentGuard — Remove apiKeyBcryptHash column from Agent table
-- ============================================================================
-- Undoes the Wave 2 migration that added the dedicated bcrypt hash column.
-- After rollback, the application falls back to reading the bcrypt hash from
-- the Agent metadata JSON field (__apiKeyBcryptHash).
--
-- ⚠️  WARNING: After rollback you MUST redeploy the API with Wave 1 code
--   that reads apiKeyBcryptHash from metadata JSON, not the column.
--   Failing to do so will break agent authentication.
--
-- HOW TO RUN:
--   psql $DATABASE_URL -f rollback-wave2-agent-key-bcrypt.sql
--
-- VERIFICATION (run after):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'Agent' AND column_name = 'apiKeyBcryptHash';
-- Should return 0 rows.
-- ============================================================================

BEGIN;

-- Drop the index first (required before dropping the column)
DROP INDEX IF EXISTS "Agent_apiKeyBcryptHash_idx";

-- Remove the bcrypt hash column
ALTER TABLE "Agent"
  DROP COLUMN IF EXISTS "apiKeyBcryptHash";

COMMIT;

-- Verify rollback
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Agent'
ORDER BY ordinal_position;
