-- ============================================================================
-- ROLLBACK: rls-migration.sql
-- AgentGuard — Remove Row-Level Security from all tenant-scoped tables
-- ============================================================================
-- Run this to UNDO the RLS migration. After rollback, tenant isolation
-- is enforced at the application layer only (no DB-level guarantee).
--
-- ⚠️  WARNING: This removes a critical security control. Only roll back if:
--   - You are debugging an RLS misconfiguration blocking legitimate queries
--   - You are migrating to a different isolation strategy
--   - Explicitly approved by your security lead
--
-- HOW TO RUN:
--   psql $DATABASE_URL -f rollback-rls-migration.sql
--
-- VERIFICATION (run after):
--   SELECT tablename, rowsecurity, forcerowsecurity
--   FROM pg_tables WHERE schemaname = 'public'
--   ORDER BY tablename;
-- All rowsecurity and forcerowsecurity should be 'f' (false) after rollback.
-- ============================================================================

BEGIN;

-- ── Tenant ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "Tenant";
ALTER TABLE "Tenant" DISABLE ROW LEVEL SECURITY;

-- ── User ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "User";
ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;

-- ── ApiKey ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "ApiKey";
ALTER TABLE "ApiKey" DISABLE ROW LEVEL SECURITY;

-- ── Agent ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "Agent";
ALTER TABLE "Agent" DISABLE ROW LEVEL SECURITY;

-- ── AgentSession ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "AgentSession";
ALTER TABLE "AgentSession" DISABLE ROW LEVEL SECURITY;

-- ── Policy ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "Policy";
ALTER TABLE "Policy" DISABLE ROW LEVEL SECURITY;

-- ── PolicyBundle ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "PolicyBundle";
ALTER TABLE "PolicyBundle" DISABLE ROW LEVEL SECURITY;

-- ── AuditEvent ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "AuditEvent";
ALTER TABLE "AuditEvent" DISABLE ROW LEVEL SECURITY;

-- ── KillSwitchCommand ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "KillSwitchCommand";
ALTER TABLE "KillSwitchCommand" DISABLE ROW LEVEL SECURITY;

-- ── HITLGate ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "HITLGate";
ALTER TABLE "HITLGate" DISABLE ROW LEVEL SECURITY;

-- ── SIEMIntegration ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "SIEMIntegration";
ALTER TABLE "SIEMIntegration" DISABLE ROW LEVEL SECURITY;

-- ── AlertWebhook ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "AlertWebhook";
ALTER TABLE "AlertWebhook" DISABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify rollback
SELECT
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'Tenant', 'User', 'ApiKey', 'Agent', 'AgentSession',
    'Policy', 'PolicyBundle', 'AuditEvent', 'KillSwitchCommand',
    'HITLGate', 'SIEMIntegration', 'AlertWebhook'
  )
ORDER BY tablename;
