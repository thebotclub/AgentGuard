-- ============================================================================
-- AgentGuard — PostgreSQL Row-Level Security (RLS) Migration
-- ============================================================================
-- Run ONCE against your PostgreSQL database BEFORE enabling tenantRLSMiddleware.
--
-- This migration enables RLS on all tenant-scoped tables and creates policies
-- that enforce tenant isolation at the database level. This is a defence-in-depth
-- control: even if application code omits a WHERE tenantId = ? clause (developer
-- mistake), the database will refuse to return rows belonging to another tenant.
--
-- HOW IT WORKS:
--   1. The tenantRLSMiddleware sets a PostgreSQL session variable:
--      SELECT set_config('app.current_tenant_id', '<tenantId>', true)
--   2. Each RLS policy checks this variable against the row's tenantId column.
--   3. Non-matching rows are invisible to the current transaction.
--
-- NOTES:
--   - Superuser and table owners BYPASS RLS by default (use FORCE ROW LEVEL SECURITY
--     if you want to enforce even for owners — not done here for migration safety).
--   - The application database user must NOT be the table owner.
--     Create a restricted role: CREATE ROLE agentguard_api LOGIN PASSWORD '...';
--     GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES TO agentguard_api;
--   - Run this as a PostgreSQL superuser or the table owner.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS tenant_isolation ON "Tenant";
--   ALTER TABLE "Tenant" DISABLE ROW LEVEL SECURITY;
--   (repeat for all tables below)
-- ============================================================================

-- ── Helper: set application user (adjust to your actual app DB username) ───
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO agentguard_api;

-- ── Tenant table ─────────────────────────────────────────────────────────────
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Tenant"
  USING (id = current_setting('app.current_tenant_id', true));

-- ── User table ───────────────────────────────────────────────────────────────
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "User"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── ApiKey table ─────────────────────────────────────────────────────────────
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "ApiKey"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── Agent table ───────────────────────────────────────────────────────────────
ALTER TABLE "Agent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Agent" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Agent"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── AgentSession table ────────────────────────────────────────────────────────
ALTER TABLE "AgentSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSession" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AgentSession"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── Policy table ──────────────────────────────────────────────────────────────
ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Policy"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── PolicyBundle table ────────────────────────────────────────────────────────
ALTER TABLE "PolicyBundle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyBundle" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "PolicyBundle"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── AuditEvent table ──────────────────────────────────────────────────────────
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AuditEvent"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── KillSwitchCommand table ───────────────────────────────────────────────────
ALTER TABLE "KillSwitchCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KillSwitchCommand" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "KillSwitchCommand"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── HITLGate table ────────────────────────────────────────────────────────────
ALTER TABLE "HITLGate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HITLGate" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "HITLGate"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── SIEMIntegration table ─────────────────────────────────────────────────────
ALTER TABLE "SIEMIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SIEMIntegration" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "SIEMIntegration"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── AlertWebhook table ────────────────────────────────────────────────────────
ALTER TABLE "AlertWebhook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlertWebhook" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AlertWebhook"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── Verify RLS is enabled ──────────────────────────────────────────────────────
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
