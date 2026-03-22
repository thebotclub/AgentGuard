-- Wave 2 Migration: Add bcrypt hash field to Agent table
-- Run after deploying Wave 2 API changes.
--
-- This migration adds a dedicated column for the bcrypt hash of the agent API key.
-- Until this migration runs, the bcrypt hash is stored in the metadata JSON field
-- as `__apiKeyBcryptHash` (migration bridge).
--
-- After running this migration:
--   1. Update AgentService.createAgent() to set apiKeyBcryptHash directly
--   2. Update AgentService.authenticateByApiKey() to use apiKeyBcryptHash column
--   3. Run the key migration script: tsx packages/api/scripts/migrate-agent-key-bcrypt.ts

BEGIN;

-- Add bcrypt hash column (nullable during migration — filled by migrate-agent-key-bcrypt.ts)
ALTER TABLE "Agent"
  ADD COLUMN IF NOT EXISTS "apiKeyBcryptHash" TEXT;

-- Index for integrity (not unique — bcrypt output is non-deterministic per hash)
CREATE INDEX IF NOT EXISTS "Agent_apiKeyBcryptHash_idx" ON "Agent" ("id")
  WHERE "apiKeyBcryptHash" IS NOT NULL;

-- Verification query (run after migration to check coverage)
-- SELECT
--   COUNT(*) FILTER (WHERE "apiKeyBcryptHash" IS NOT NULL) AS hashed,
--   COUNT(*) FILTER (WHERE "apiKeyBcryptHash" IS NULL) AS unhashed,
--   COUNT(*) AS total
-- FROM "Agent"
-- WHERE "deletedAt" IS NULL;

COMMIT;
