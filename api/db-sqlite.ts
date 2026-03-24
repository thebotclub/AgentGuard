/**
 * AgentGuard SQLite Adapter
 *
 * Synchronous SQLite (better-sqlite3) wrapped to implement IDatabase
 * with the same async interface as the PostgreSQL adapter.
 * Used for development, testing, and SQLite-only deployments.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type {
  IDatabase,
  TenantRow,
  ApiKeyRow,
  AuditEventRow,
  WebhookRow,
  AgentRow,
  ApprovalRow,
  FeedbackRow,
  ComplianceReportRow,
  McpServerRow,
  IntegrationRow,
  SsoConfigRow,
  SsoProvider,
  SsoProtocol,
  SsoUserRow,
  SiemConfigRow,
  ChildAgentRow,
  UsageAnalytics,
  PlatformAnalytics,
  LicenseKeyRow,
  LicenseEventRow,
  LicenseUsageRow,
  AnomalyRuleRow,
  AlertRow,
  PolicyVersionRow,
  TeamMemberRow,
  JobRow,
  GitWebhookConfigRow,
  GitSyncLogRow,
  ScimTokenRow,
  ScimUserRow,
  ScimGroupRow,
  ScimGroupMemberRow,
} from './db-interface.js';
import { GENESIS_HASH } from '../packages/sdk/src/core/types.js';

// ── Key hashing helpers ────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 10;

export function sha256Hex(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_ROUNDS);
}

export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

// ── Schema (SQLite dialect) ────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'free',
    created_at TEXT DEFAULT (datetime('now')),
    kill_switch_active INTEGER DEFAULT 0,
    kill_switch_at TEXT
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT DEFAULT 'default',
    created_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT,
    session_id TEXT,
    tool TEXT NOT NULL,
    action TEXT,
    result TEXT NOT NULL,
    rule_id TEXT,
    risk_score INTEGER,
    reason TEXT,
    duration_ms REAL,
    previous_hash TEXT,
    hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    agent_id TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_activity TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    url TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '["block","killswitch"]',
    secret TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    policy_scope TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, name)
  );

  -- Phase 2: Rate limiting
  CREATE TABLE IF NOT EXISTS rate_limits (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    agent_id TEXT,
    window_seconds INTEGER NOT NULL DEFAULT 60,
    max_requests INTEGER NOT NULL DEFAULT 100,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rate_counters (
    tenant_id TEXT NOT NULL,
    agent_id TEXT,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, agent_id, window_start)
  );

  -- Phase 2: Cost attribution
  CREATE TABLE IF NOT EXISTS cost_events (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    agent_id TEXT,
    tool TEXT NOT NULL,
    estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Phase 3: MCP proxy configs
  CREATE TABLE IF NOT EXISTS mcp_proxy_configs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    upstream_url TEXT NOT NULL,
    allowed_tools TEXT NOT NULL DEFAULT '[]',
    blocked_tools TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, name)
  );

  -- HITL Approvals
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    agent_id TEXT,
    tool TEXT NOT NULL,
    params_json TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    resolved_by TEXT
  );

  -- Custom policies (per-tenant policy overrides)
  CREATE TABLE IF NOT EXISTS tenant_policies (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
    policy_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approvals(tenant_id, status);

  CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_events(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_events(session_id);
  CREATE INDEX IF NOT EXISTS idx_apikeys_tenant ON api_keys(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_agents_key ON agents(api_key);
  CREATE INDEX IF NOT EXISTS idx_rate_limits_tenant ON rate_limits(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_cost_events_tenant ON cost_events(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_mcp_proxy_tenant ON mcp_proxy_configs(tenant_id);

  -- Compliance Reports
  CREATE TABLE IF NOT EXISTS compliance_reports (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    report_type TEXT NOT NULL DEFAULT 'owasp-agentic-top10',
    score REAL NOT NULL DEFAULT 0,
    controls_json TEXT NOT NULL DEFAULT '{}',
    generated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_compliance_reports_tenant ON compliance_reports(tenant_id, generated_at);

  -- License Keys
  CREATE TABLE IF NOT EXISTS license_keys (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',
    features TEXT NOT NULL DEFAULT '[]',
    limits_json TEXT NOT NULL DEFAULT '{}',
    offline_grace_days INTEGER NOT NULL DEFAULT 1,
    issued_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    revoke_reason TEXT,
    stripe_subscription_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_license_keys_tenant ON license_keys(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_license_keys_hash ON license_keys(key_hash);

  -- License Events
  CREATE TABLE IF NOT EXISTS license_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    license_id TEXT,
    event_type TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_license_events_tenant ON license_events(tenant_id, created_at);

  -- License Usage
  CREATE TABLE IF NOT EXISTS license_usage (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    month TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    agent_count INTEGER NOT NULL DEFAULT 0,
    last_updated TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, month)
  );

  CREATE INDEX IF NOT EXISTS idx_license_usage_tenant ON license_usage(tenant_id, month);

  CREATE TABLE IF NOT EXISTS stripe_processed_events (
    event_id TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL DEFAULT (datetime('now')),
    event_type TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at ON stripe_processed_events(processed_at);
`;

const SEED_SETTINGS_SQL = `
  INSERT OR IGNORE INTO settings (key, value) VALUES ('global_kill_switch', '0');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('global_kill_switch_at', '');
`;

// ── Factory ────────────────────────────────────────────────────────────────

export function createSqliteAdapter(dbPath?: string): { adapter: IDatabase; raw: Database.Database } {
  let db: Database.Database;

  if (dbPath && dbPath !== ':memory:') {
    // Ensure parent directory exists
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    console.log(`[db] opening SQLite at ${dbPath}`);
    db = new Database(dbPath);
  } else {
    console.log('[db] opening SQLite in-memory');
    db = new Database(':memory:');
  }

  db.pragma('journal_mode = DELETE');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  // ── Core query helpers ─────────────────────────────────────────────────────

  function execSync(sql: string, params: unknown[] = []): void {
    db.prepare(sql).run(...params);
  }

  function getSync<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
    return db.prepare(sql).get(...params) as T | undefined;
  }

  function allSync<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return db.prepare(sql).all(...params) as T[];
  }

  // Wrap all sync methods as async for interface compatibility
  async function exec(sql: string, params: unknown[] = []): Promise<void> {
    execSync(sql, params);
  }

  async function get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return getSync<T>(sql, params);
  }

  async function all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return allSync<T>(sql, params);
  }

  async function run(sql: string, params: unknown[] = []): Promise<void> {
    execSync(sql, params);
  }

  const adapter: IDatabase = {
    type: 'sqlite',

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    async initialize(): Promise<void> {
      db.exec(SCHEMA_SQL);
      db.exec(SEED_SETTINGS_SQL);

      // ── Backward-compat migrations ──────────────────────────────────────────
      // Migration: add agent_id to audit_events if not present
      try { db.exec('ALTER TABLE audit_events ADD COLUMN agent_id TEXT'); } catch { /* already exists */ }

      // Migration: detection columns on audit_events
      const detectionCols: Array<{ name: string; type: string }> = [
        { name: 'detection_score', type: 'REAL' },
        { name: 'detection_provider', type: 'TEXT' },
        { name: 'detection_category', type: 'TEXT' },
      ];
      for (const col of detectionCols) {
        try { db.exec(`ALTER TABLE audit_events ADD COLUMN ${col.name} ${col.type}`); } catch { /* already exists */ }
      }

      // Migration: validation/certification columns on agents table
      const validationCols: Array<{ name: string; type: string }> = [
        { name: 'declared_tools', type: 'TEXT' },
        { name: 'last_validated_at', type: 'TEXT' },
        { name: 'validation_coverage', type: 'INTEGER' },
        { name: 'certified_at', type: 'TEXT' },
        { name: 'certification_expires_at', type: 'TEXT' },
        { name: 'certification_token', type: 'TEXT' },
      ];
      for (const col of validationCols) {
        try { db.exec(`ALTER TABLE agents ADD COLUMN ${col.name} ${col.type}`); } catch { /* already exists */ }
      }

      // Migration: bcrypt hashing columns on api_keys
      const apiKeyCols: Array<{ name: string; type: string }> = [
        { name: 'key_hash', type: 'TEXT' },
        { name: 'key_prefix', type: 'TEXT' },
        { name: 'key_sha256', type: 'TEXT' },
      ];
      for (const col of apiKeyCols) {
        try { db.exec(`ALTER TABLE api_keys ADD COLUMN ${col.name} ${col.type}`); } catch { /* already exists */ }
      }

      // Back-fill existing plaintext keys with sha256 + prefix (bcrypt hash deferred — keys are live)
      const unhashedRows = db.prepare(
        'SELECT key FROM api_keys WHERE key_sha256 IS NULL AND key IS NOT NULL'
      ).all() as Array<{ key: string }>;
      for (const row of unhashedRows) {
        const sha256 = sha256Hex(row.key);
        const prefix = row.key.substring(0, 12);
        db.prepare(
          'UPDATE api_keys SET key_sha256 = ?, key_prefix = ? WHERE key = ?'
        ).run(sha256, prefix, row.key);
      }
      if (unhashedRows.length > 0) {
        console.log(`[db] migrated ${unhashedRows.length} existing API key(s) to sha256 lookup`);
      }

      // ── Fix 1: Agent API key hashing columns ──────────────────────────────
      const agentKeyCols2: Array<{ name: string; type: string }> = [
        { name: 'api_key_hash', type: 'TEXT' },
        { name: 'api_key_sha256', type: 'TEXT' },
      ];
      for (const col of agentKeyCols2) {
        try { db.exec(`ALTER TABLE agents ADD COLUMN ${col.name} ${col.type}`); } catch { /* already exists */ }
      }
      const unhashedAgents = db.prepare(
        'SELECT id, api_key FROM agents WHERE api_key_sha256 IS NULL AND api_key IS NOT NULL AND active = 1'
      ).all() as Array<{ id: string; api_key: string }>;
      for (const agentRow of unhashedAgents) {
        const agentSha256 = sha256Hex(agentRow.api_key);
        db.prepare('UPDATE agents SET api_key_sha256 = ? WHERE id = ?').run(agentSha256, agentRow.id);
      }
      if (unhashedAgents.length > 0) {
        console.log(`[db] migrated ${unhashedAgents.length} existing agent key(s) to sha256 lookup`);
      }
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_agents_key_sha256 ON agents(api_key_sha256)'); } catch { /* already exists */ }

      // Migration: MCP tables (also created by McpMiddleware but we ensure they exist here)
      db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_configs (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          name TEXT NOT NULL,
          upstream_url TEXT,
          transport TEXT NOT NULL DEFAULT 'sse',
          agent_id TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          action_mapping TEXT NOT NULL DEFAULT '{}',
          default_action TEXT NOT NULL DEFAULT 'allow',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(tenant_id, name)
        );
        CREATE TABLE IF NOT EXISTS mcp_sessions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          agent_id TEXT,
          config_id TEXT,
          transport TEXT NOT NULL DEFAULT 'sse',
          upstream_url TEXT,
          action_mapping TEXT NOT NULL DEFAULT '{}',
          tool_call_count INTEGER NOT NULL DEFAULT 0,
          blocked_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_activity_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS mcp_audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          action_name TEXT NOT NULL,
          arguments TEXT,
          decision TEXT NOT NULL,
          matched_rule_id TEXT,
          risk_score INTEGER NOT NULL DEFAULT 0,
          reason TEXT,
          duration_ms REAL,
          blocked INTEGER NOT NULL DEFAULT 0,
          previous_hash TEXT,
          hash TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_mcp_configs_tenant ON mcp_configs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_mcp_sessions_tenant ON mcp_sessions(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_mcp_audit_tenant ON mcp_audit_events(tenant_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_mcp_audit_session ON mcp_audit_events(session_id);
      `);

      // Migration: approvals table
      db.exec(`
        CREATE TABLE IF NOT EXISTS approvals (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          agent_id TEXT,
          tool TEXT NOT NULL,
          params_json TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          resolved_at TEXT,
          resolved_by TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approvals(tenant_id, status);
        CREATE TABLE IF NOT EXISTS tenant_policies (
          tenant_id TEXT PRIMARY KEY,
          policy_json TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      // Migration: pii_entities_count column on audit_events
      try { db.exec('ALTER TABLE audit_events ADD COLUMN pii_entities_count INTEGER DEFAULT 0'); } catch { /* already exists */ }

      // Migration: feedback and telemetry tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS feedback (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL,
          agent_id TEXT,
          rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
          comment TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON feedback(tenant_id);

        CREATE TABLE IF NOT EXISTS telemetry_events (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          sdk_version TEXT NOT NULL DEFAULT 'unknown',
          language TEXT NOT NULL DEFAULT 'unknown',
          platform TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      // Migration: compliance_reports table
      db.exec(`
        CREATE TABLE IF NOT EXISTS compliance_reports (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL,
          report_type TEXT NOT NULL DEFAULT 'owasp-agentic-top10',
          score REAL NOT NULL DEFAULT 0,
          controls_json TEXT NOT NULL DEFAULT '{}',
          generated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_compliance_reports_tenant ON compliance_reports(tenant_id, generated_at);
      `);

      // Migration: mcp_servers table (MCP Server Registry)
      db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_servers (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          allowed_tools TEXT NOT NULL DEFAULT '[]',
          blocked_tools TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant ON mcp_servers(tenant_id);
      `);

      // Migration: agent_hierarchy table (A2A multi-agent policy propagation)
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_hierarchy (
          id TEXT PRIMARY KEY,
          parent_agent_id TEXT NOT NULL,
          child_agent_id TEXT NOT NULL UNIQUE,
          tenant_id TEXT NOT NULL,
          policy_snapshot TEXT NOT NULL DEFAULT '{}',
          ttl_expires_at TEXT,
          max_tool_calls INTEGER,
          tool_calls_used INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_agent_hierarchy_parent ON agent_hierarchy(parent_agent_id, tenant_id);
        CREATE INDEX IF NOT EXISTS idx_agent_hierarchy_child ON agent_hierarchy(child_agent_id);
      `);

      // Migration: integrations table (Slack/Teams HITL)
      db.exec(`
        CREATE TABLE IF NOT EXISTS integrations (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          type TEXT NOT NULL,
          config_encrypted TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id, type);
      `);

      // Migration: sso_configs table (Enterprise SSO)
      db.exec(`
        CREATE TABLE IF NOT EXISTS sso_configs (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL UNIQUE,
          provider TEXT NOT NULL,
          domain TEXT NOT NULL,
          client_id TEXT NOT NULL,
          client_secret_encrypted TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sso_configs_tenant ON sso_configs(tenant_id);
      `);

      // Migration: anomaly_rules and alerts tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS anomaly_rules (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          name TEXT NOT NULL,
          metric TEXT NOT NULL,
          condition TEXT NOT NULL,
          threshold REAL NOT NULL,
          window_minutes INTEGER NOT NULL,
          severity TEXT NOT NULL DEFAULT 'warning',
          enabled INTEGER DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_anomaly_rules_tenant ON anomaly_rules(tenant_id);

        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          rule_id TEXT NOT NULL,
          metric TEXT NOT NULL,
          current_value REAL NOT NULL,
          threshold REAL NOT NULL,
          severity TEXT NOT NULL,
          message TEXT NOT NULL,
          resolved_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON alerts(tenant_id, resolved_at);
        CREATE INDEX IF NOT EXISTS idx_alerts_rule ON alerts(rule_id, resolved_at);
      `);

      // Migration: siem_configs table (SIEM export integrations)
      db.exec(`
        CREATE TABLE IF NOT EXISTS siem_configs (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL UNIQUE,
          provider TEXT NOT NULL,
          config_encrypted TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          last_forwarded_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_siem_configs_tenant ON siem_configs(tenant_id);
      `);

      // Migration: policy_versions table (M3-75 policy versioning)
      db.exec(`
        CREATE TABLE IF NOT EXISTS policy_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          policy_id TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          policy_data TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          reverted_from INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON policy_versions(policy_id, tenant_id);
      `);

      // Migration: team_members table (M3-78 RBAC)
      db.exec(`
        CREATE TABLE IF NOT EXISTS team_members (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          invited_at TEXT DEFAULT (datetime('now')),
          accepted_at TEXT,
          UNIQUE(tenant_id, email)
        );
        CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON team_members(tenant_id);
      `);

      // Migration: evaluation_jobs table (M3-79 job queue)
      db.exec(`
        CREATE TABLE IF NOT EXISTS evaluation_jobs (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          job_type TEXT NOT NULL DEFAULT 'evaluation',
          status TEXT NOT NULL DEFAULT 'pending',
          payload TEXT NOT NULL,
          result TEXT,
          error TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          started_at TEXT,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON evaluation_jobs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON evaluation_jobs(status);
      `);

      // Wave 7: Expand SSO config schema (SQLite doesn't support IF NOT EXISTS on ALTER)
      const ssoColumns = [
        `ALTER TABLE sso_configs ADD COLUMN protocol TEXT NOT NULL DEFAULT 'oidc'`,
        `ALTER TABLE sso_configs ADD COLUMN discovery_url TEXT`,
        `ALTER TABLE sso_configs ADD COLUMN redirect_uri TEXT`,
        `ALTER TABLE sso_configs ADD COLUMN scopes TEXT`,
        `ALTER TABLE sso_configs ADD COLUMN force_sso INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE sso_configs ADD COLUMN role_claim_name TEXT`,
        `ALTER TABLE sso_configs ADD COLUMN admin_group TEXT`,
        `ALTER TABLE sso_configs ADD COLUMN member_group TEXT`,
        `ALTER TABLE sso_configs ADD COLUMN idp_metadata_xml TEXT`,
        `ALTER TABLE sso_configs ADD COLUMN sp_entity_id TEXT`,
        `ALTER TABLE sso_configs ADD COLUMN updated_at TEXT`,
      ];
      for (const sql of ssoColumns) {
        try { db.exec(sql); } catch { /* column already exists */ }
      }

      // Wave 7: SSO state table (PKCE / nonce storage)
      db.exec(`
        CREATE TABLE IF NOT EXISTS sso_states (
          state TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      // Wave 7: SSO users (provisioned from IdP)
      db.exec(`
        CREATE TABLE IF NOT EXISTS sso_users (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL,
          idp_sub TEXT NOT NULL,
          provider TEXT NOT NULL,
          email TEXT,
          name TEXT,
          role TEXT NOT NULL DEFAULT 'viewer',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_login_at TEXT,
          UNIQUE(tenant_id, idp_sub)
        );
        CREATE INDEX IF NOT EXISTS idx_sso_users_tenant ON sso_users(tenant_id);
      `);

      // Wave 7: Git webhook config (GitOps policy sync)
      db.exec(`
        CREATE TABLE IF NOT EXISTS git_webhook_configs (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL UNIQUE,
          repo_url TEXT NOT NULL,
          webhook_secret TEXT NOT NULL,
          branch TEXT NOT NULL DEFAULT 'main',
          policy_dir TEXT NOT NULL DEFAULT 'agentguard/policies',
          github_token TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_git_webhook_tenant ON git_webhook_configs(tenant_id);
      `);

      // Wave 7: Git sync log (audit trail for policy syncs)
      db.exec(`
        CREATE TABLE IF NOT EXISTS git_sync_logs (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL,
          commit_sha TEXT NOT NULL,
          branch TEXT NOT NULL,
          policies_updated INTEGER NOT NULL DEFAULT 0,
          policies_skipped INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'success',
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_git_sync_tenant ON git_sync_logs(tenant_id);
      `);

      // Wave 9: SCIM 2.0 provisioning tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS scim_tokens (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL DEFAULT 'default',
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_used_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_scim_tokens_tenant ON scim_tokens(tenant_id);

        CREATE TABLE IF NOT EXISTS scim_users (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL,
          external_id TEXT,
          user_name TEXT NOT NULL,
          display_name TEXT,
          given_name TEXT,
          family_name TEXT,
          email TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          role TEXT NOT NULL DEFAULT 'member',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT,
          deleted_at TEXT,
          UNIQUE(tenant_id, user_name)
        );
        CREATE INDEX IF NOT EXISTS idx_scim_users_tenant ON scim_users(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_scim_users_external ON scim_users(tenant_id, external_id);

        CREATE TABLE IF NOT EXISTS scim_groups (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT,
          UNIQUE(tenant_id, display_name)
        );
        CREATE INDEX IF NOT EXISTS idx_scim_groups_tenant ON scim_groups(tenant_id);

        CREATE TABLE IF NOT EXISTS scim_group_members (
          group_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          PRIMARY KEY (group_id, user_id),
          FOREIGN KEY (group_id) REFERENCES scim_groups(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES scim_users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_scim_group_members_group ON scim_group_members(group_id);
        CREATE INDEX IF NOT EXISTS idx_scim_group_members_user ON scim_group_members(user_id);
      `);

      console.log('[db] SQLite schema ready');
    },

    async close(): Promise<void> {
      db.close();
    },

    // ── Raw query ──────────────────────────────────────────────────────────────
    exec,
    get,
    all,
    run,

    // ── Tenants ───────────────────────────────────────────────────────────────
    async getTenant(id: string): Promise<TenantRow | undefined> {
      return getSync<TenantRow>('SELECT * FROM tenants WHERE id = ?', [id]);
    },

    async getTenantByEmail(email: string): Promise<TenantRow | undefined> {
      return getSync<TenantRow>('SELECT * FROM tenants WHERE email = ?', [email]);
    },

    async createTenant(id: string, name: string, email: string): Promise<void> {
      db.transaction(() => {
        db.prepare('INSERT INTO tenants (id, name, email) VALUES (?, ?, ?)').run(id, name, email);
      })();
    },

    async updateTenantKillSwitch(tenantId: string, active: number, at: string | null): Promise<void> {
      db.prepare('UPDATE tenants SET kill_switch_active = ?, kill_switch_at = ? WHERE id = ?').run(active, at, tenantId);
    },

    // ── API Keys ──────────────────────────────────────────────────────────────
    async getApiKey(key: string): Promise<ApiKeyRow | undefined> {
      // Legacy plaintext lookup (backward compat for keys not yet migrated)
      return getSync<ApiKeyRow>('SELECT * FROM api_keys WHERE key = ? AND is_active = 1', [key]);
    },

    async getApiKeyBySha256(sha256: string): Promise<ApiKeyRow | undefined> {
      return getSync<ApiKeyRow>(
        'SELECT * FROM api_keys WHERE key_sha256 = ? AND is_active = 1',
        [sha256]
      );
    },

    async createApiKey(key: string, tenantId: string, name: string): Promise<void> {
      const keyHash = await hashApiKey(key);
      const keyPrefix = key.substring(0, 12);
      const keySha256 = sha256Hex(key);
      db.prepare(
        'INSERT INTO api_keys (key, tenant_id, name, key_hash, key_prefix, key_sha256) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(key, tenantId, name, keyHash, keyPrefix, keySha256);
    },

    async deactivateApiKeyBySha256(sha256: string): Promise<void> {
      db.prepare("UPDATE api_keys SET is_active = 0 WHERE key_sha256 = ?").run(sha256);
    },

    async updateAuditEventHashes(eventId: number, previousHash: string, hash: string): Promise<void> {
      db.prepare('UPDATE audit_events SET previous_hash = ?, hash = ? WHERE id = ?').run(previousHash, hash, eventId);
    },

    async touchApiKey(key: string): Promise<void> {
      // Touch by sha256 (works for both hashed and legacy rows)
      const sha256 = sha256Hex(key);
      const updated = db.prepare(
        "UPDATE api_keys SET last_used_at = datetime('now') WHERE key_sha256 = ?"
      ).run(sha256);
      if (updated.changes === 0) {
        // Fallback for legacy plaintext rows
        db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE key = ?").run(key);
      }
    },

    // ── Audit Events ──────────────────────────────────────────────────────────
    async insertAuditEventSafe(
      tenantId: string | null,
      sessionId: string | null,
      tool: string,
      action: string | null,
      result: string,
      ruleId: string | null,
      riskScore: number | null,
      reason: string | null,
      durationMs: number | null,
      createdAt: string,
      agentId: string | null,
      detectionScore: number | null = null,
      detectionProvider: string | null = null,
      detectionCategory: string | null = null,
    ): Promise<string> {
      // SQLite with better-sqlite3 is synchronous — wrap in exclusive transaction
      // to guarantee atomic read-last-hash + insert (already serialized by the
      // event loop, but the transaction makes it explicit and safe).
      const insertTx = db.transaction(() => {
        const lastRow = db.prepare(
          'SELECT hash FROM audit_events WHERE tenant_id IS ? ORDER BY id DESC LIMIT 1'
        ).get(tenantId) as { hash: string } | undefined;
        const prevHash = lastRow?.hash ?? GENESIS_HASH;
        const eventData = `${tool}|${result}|${createdAt}`;
        const newHash = crypto.createHash('sha256').update(prevHash + '|' + eventData).digest('hex');
        db.prepare(
          `INSERT INTO audit_events
           (tenant_id, session_id, tool, action, result, rule_id, risk_score, reason,
            duration_ms, previous_hash, hash, created_at, agent_id,
            detection_score, detection_provider, detection_category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          tenantId, sessionId, tool, action, result, ruleId, riskScore, reason,
          durationMs, prevHash, newHash, createdAt, agentId,
          detectionScore, detectionProvider, detectionCategory,
        );
        return newHash;
      });
      return insertTx() as string;
    },

    async insertAuditEvent(
      tenantId: string | null,
      sessionId: string | null,
      tool: string,
      action: string | null,
      result: string,
      ruleId: string | null,
      riskScore: number | null,
      reason: string | null,
      durationMs: number | null,
      previousHash: string | null,
      hash: string | null,
      createdAt: string,
      agentId: string | null,
      detectionScore: number | null = null,
      detectionProvider: string | null = null,
      detectionCategory: string | null = null,
    ): Promise<void> {
      db.prepare(
        `INSERT INTO audit_events
         (tenant_id, session_id, tool, action, result, rule_id, risk_score, reason,
          duration_ms, previous_hash, hash, created_at, agent_id,
          detection_score, detection_provider, detection_category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        tenantId, sessionId, tool, action, result, ruleId, riskScore, reason,
        durationMs, previousHash, hash, createdAt, agentId,
        detectionScore, detectionProvider, detectionCategory,
      );
    },

    async getLastAuditHash(tenantId: string): Promise<string | undefined> {
      const row = getSync<{ hash: string }>(
        'SELECT hash FROM audit_events WHERE tenant_id = ? ORDER BY id DESC LIMIT 1',
        [tenantId]
      );
      return row?.hash;
    },

    async countAuditEvents(tenantId: string): Promise<number> {
      const row = getSync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = ?',
        [tenantId]
      );
      return row?.cnt ?? 0;
    },

    async getAuditEvents(tenantId: string, limit: number, offset: number): Promise<AuditEventRow[]> {
      return allSync<AuditEventRow>(
        'SELECT * FROM audit_events WHERE tenant_id = ? ORDER BY id ASC LIMIT ? OFFSET ?',
        [tenantId, limit, offset]
      );
    },

    async getAuditEventsCursor(tenantId: string, limit: number, before?: string): Promise<AuditEventRow[]> {
      if (before) {
        return allSync<AuditEventRow>(
          'SELECT * FROM audit_events WHERE tenant_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?',
          [tenantId, before, limit]
        );
      }
      return allSync<AuditEventRow>(
        'SELECT * FROM audit_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?',
        [tenantId, limit]
      );
    },

    async getAllAuditEvents(tenantId: string): Promise<AuditEventRow[]> {
      return allSync<AuditEventRow>(
        'SELECT * FROM audit_events WHERE tenant_id = ? ORDER BY id ASC',
        [tenantId]
      );
    },

    // ── Usage Stats ───────────────────────────────────────────────────────────
    async usageTotal(tenantId: string): Promise<number> {
      const row = getSync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = ?',
        [tenantId]
      );
      return row?.cnt ?? 0;
    },

    async usageByResult(tenantId: string): Promise<Array<{ result: string; cnt: number }>> {
      return allSync<{ result: string; cnt: number }>(
        'SELECT result, COUNT(*) as cnt FROM audit_events WHERE tenant_id = ? GROUP BY result',
        [tenantId]
      );
    },

    async usageLast24h(tenantId: string): Promise<number> {
      const row = getSync<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = ? AND created_at >= datetime('now', '-1 day')",
        [tenantId]
      );
      return row?.cnt ?? 0;
    },

    async topBlockedTools(tenantId: string): Promise<Array<{ tool: string; cnt: number }>> {
      return allSync<{ tool: string; cnt: number }>(
        "SELECT tool, COUNT(*) as cnt FROM audit_events WHERE tenant_id = ? AND result = 'block' GROUP BY tool ORDER BY cnt DESC LIMIT 5",
        [tenantId]
      );
    },

    async avgDurationMs(tenantId: string): Promise<number | null> {
      const row = getSync<{ avg: number | null }>(
        'SELECT AVG(duration_ms) as avg FROM audit_events WHERE tenant_id = ?',
        [tenantId]
      );
      return row?.avg ?? null;
    },

    // ── Sessions ──────────────────────────────────────────────────────────────
    async upsertSession(id: string, tenantId: string | null): Promise<void> {
      db.prepare(
        `INSERT INTO sessions (id, tenant_id, last_activity) VALUES (?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET last_activity = datetime('now')`
      ).run(id, tenantId);
    },

    // ── Settings ──────────────────────────────────────────────────────────────
    async getSetting(key: string): Promise<string | undefined> {
      const row = getSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
      return row?.value;
    },

    async setSetting(key: string, value: string): Promise<void> {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    },

    // ── Webhooks ──────────────────────────────────────────────────────────────
    async insertWebhook(
      tenantId: string,
      url: string,
      events: string,
      secret: string | null,
    ): Promise<WebhookRow> {
      const row = db.prepare<[string, string, string, string | null]>(
        'INSERT INTO webhooks (tenant_id, url, events, secret) VALUES (?, ?, ?, ?) RETURNING *'
      ).get(tenantId, url, events, secret) as WebhookRow;
      return row;
    },

    async getWebhooksByTenant(tenantId: string): Promise<WebhookRow[]> {
      return allSync<WebhookRow>(
        'SELECT id, tenant_id, url, events, active, created_at FROM webhooks WHERE tenant_id = ? AND active = 1',
        [tenantId]
      );
    },

    async getWebhookById(id: string, tenantId: string): Promise<WebhookRow | undefined> {
      return getSync<WebhookRow>('SELECT * FROM webhooks WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    },

    async deleteWebhook(id: string, tenantId: string): Promise<void> {
      db.prepare('UPDATE webhooks SET active = 0 WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    },

    async getActiveWebhooksForTenant(tenantId: string): Promise<WebhookRow[]> {
      return allSync<WebhookRow>(
        'SELECT * FROM webhooks WHERE tenant_id = ? AND active = 1',
        [tenantId]
      );
    },

    // ── Agents ────────────────────────────────────────────────────────────────
    async insertAgent(
      tenantId: string,
      name: string,
      apiKey: string,
      policyScope: string,
    ): Promise<AgentRow> {
      // Fix 1: hash agent API key before storage
      const apiKeyHash = await hashApiKey(apiKey);
      const apiKeySha256 = sha256Hex(apiKey);
      const row = db.prepare<[string, string, string, string, string, string]>(
        `INSERT INTO agents (tenant_id, name, api_key, api_key_hash, api_key_sha256, policy_scope)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, tenant_id, name, policy_scope, active, created_at`
      ).get(tenantId, name, apiKey, apiKeyHash, apiKeySha256, policyScope) as Record<string, unknown>;
      row['api_key'] = apiKey;
      return row as unknown as AgentRow;
    },

    async getAgentsByTenant(tenantId: string): Promise<AgentRow[]> {
      return allSync<AgentRow>(
        'SELECT id, tenant_id, name, policy_scope, active, created_at FROM agents WHERE tenant_id = ? AND active = 1',
        [tenantId]
      );
    },

    async getAgentByKey(apiKey: string): Promise<AgentRow | undefined> {
      // Fix 1: SHA-256 lookup first, then bcrypt verify
      const sha256 = sha256Hex(apiKey);
      let row = getSync<Record<string, unknown>>('SELECT * FROM agents WHERE api_key_sha256 = ? AND active = 1', [sha256]);
      if (row) {
        if (row['api_key_hash']) {
          const valid = await verifyApiKey(apiKey, row['api_key_hash'] as string);
          if (!valid) return undefined;
        }
        return row as unknown as AgentRow;
      }
      // Fallback: legacy plaintext lookup for agents that predate sha256 migration
      return getSync<AgentRow>('SELECT * FROM agents WHERE api_key = ? AND active = 1', [apiKey]);
    },

    async getAgentById(id: string, tenantId: string): Promise<AgentRow | undefined> {
      return getSync<AgentRow>(
        'SELECT id, tenant_id, name, policy_scope, active, created_at FROM agents WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );
    },

    async deactivateAgent(id: string, tenantId: string): Promise<void> {
      db.prepare('UPDATE agents SET active = 0 WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    },

    // ── Approvals (HITL) ──────────────────────────────────────────────────────
    async createApproval(
      id: string,
      tenantId: string,
      agentId: string | null,
      tool: string,
      paramsJson: string | null,
    ): Promise<ApprovalRow> {
      const row = db.prepare<[string, string, string | null, string, string | null]>(
        `INSERT INTO approvals (id, tenant_id, agent_id, tool, params_json)
         VALUES (?, ?, ?, ?, ?)
         RETURNING *`
      ).get(id, tenantId, agentId, tool, paramsJson) as ApprovalRow;
      return row;
    },

    async getApproval(id: string, tenantId: string): Promise<ApprovalRow | undefined> {
      return getSync<ApprovalRow>(
        'SELECT * FROM approvals WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );
    },

    async listPendingApprovals(tenantId: string): Promise<ApprovalRow[]> {
      return allSync<ApprovalRow>(
        "SELECT * FROM approvals WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at DESC",
        [tenantId]
      );
    },

    async listAllApprovals(tenantId: string, limit = 100): Promise<ApprovalRow[]> {
      return allSync<ApprovalRow>(
        'SELECT * FROM approvals WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?',
        [tenantId, limit]
      );
    },

    async resolveApproval(
      id: string,
      tenantId: string,
      status: 'approved' | 'denied',
      resolvedBy: string,
    ): Promise<void> {
      db.prepare(
        `UPDATE approvals SET status = ?, resolved_at = datetime('now'), resolved_by = ?
         WHERE id = ? AND tenant_id = ?`
      ).run(status, resolvedBy, id, tenantId);
    },

    // ── Policy ────────────────────────────────────────────────────────────────
    async getCustomPolicy(tenantId: string): Promise<string | null> {
      const row = getSync<{ policy_json: string }>(
        'SELECT policy_json FROM tenant_policies WHERE tenant_id = ?',
        [tenantId]
      );
      return row?.policy_json ?? null;
    },

    async setCustomPolicy(tenantId: string, policyJson: string): Promise<void> {
      db.prepare(
        `INSERT INTO tenant_policies (tenant_id, policy_json, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(tenant_id) DO UPDATE SET policy_json = excluded.policy_json, updated_at = excluded.updated_at`
      ).run(tenantId, policyJson);
    },

    // ── Health Check ──────────────────────────────────────────────────────────
    async ping(): Promise<boolean> {
      try {
        db.prepare('SELECT 1').get();
        return true;
      } catch {
        return false;
      }
    },

    async countTenants(): Promise<number> {
      const row = getSync<{ n: number }>('SELECT COUNT(*) as n FROM tenants');
      return row?.n ?? 0;
    },

    async countActiveAgents(): Promise<number> {
      const row = getSync<{ n: number }>('SELECT COUNT(*) as n FROM agents WHERE active = 1');
      return row?.n ?? 0;
    },

    // ── Analytics ─────────────────────────────────────────────────────────────
    async getUsageAnalytics(tenantId: string, days: number): Promise<UsageAnalytics> {
      const now = new Date();

      // Total calls by time window
      const last24h = getSync<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = ? AND created_at >= datetime('now', '-1 day')",
        [tenantId]
      )?.cnt ?? 0;

      const last7d = getSync<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = ? AND created_at >= datetime('now', '-7 days')",
        [tenantId]
      )?.cnt ?? 0;

      const last30d = getSync<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = ? AND created_at >= datetime('now', '-30 days')",
        [tenantId]
      )?.cnt ?? 0;

      // Unique agents
      const uniqueAgentsRow = getSync<{ cnt: number }>(
        'SELECT COUNT(DISTINCT agent_id) as cnt FROM audit_events WHERE tenant_id = ? AND agent_id IS NOT NULL',
        [tenantId]
      );
      const uniqueAgents = uniqueAgentsRow?.cnt ?? 0;

      // Top tools evaluated (last 30 days)
      const topTools = allSync<{ tool: string; cnt: number }>(
        `SELECT tool, COUNT(*) as cnt FROM audit_events
         WHERE tenant_id = ? AND created_at >= datetime('now', '-${days} days')
         GROUP BY tool ORDER BY cnt DESC LIMIT 10`,
        [tenantId]
      );

      // Block rate
      const totalRow = getSync<{ total: number; blocked: number }>(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN result = 'block' THEN 1 ELSE 0 END) as blocked
         FROM audit_events
         WHERE tenant_id = ? AND created_at >= datetime('now', '-${days} days')`,
        [tenantId]
      );
      const total = totalRow?.total ?? 0;
      const blocked = totalRow?.blocked ?? 0;
      const blockRate = total > 0 ? Math.round((blocked / total) * 100 * 100) / 100 : 0;

      // Daily volume (last 30 days)
      const dailyRows = allSync<{ date: string; cnt: number }>(
        `SELECT date(created_at) as date, COUNT(*) as cnt
         FROM audit_events
         WHERE tenant_id = ? AND created_at >= datetime('now', '-${days} days')
         GROUP BY date(created_at)
         ORDER BY date ASC`,
        [tenantId]
      );

      // Fill in missing days with 0
      const dailyMap = new Map<string, number>(dailyRows.map((r) => [r.date, r.cnt]));
      const dailyVolume: Array<{ date: string; cnt: number }> = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        dailyVolume.push({ date: dateStr, cnt: dailyMap.get(dateStr) ?? 0 });
      }

      return {
        calls: { last24h, last7d, last30d },
        uniqueAgents,
        topTools,
        blockRate,
        dailyVolume,
      };
    },

    // ── Platform Analytics (admin) ────────────────────────────────────────────
    /* eslint-disable @typescript-eslint/no-explicit-any -- SQLite .get()/.all() return dynamic row shapes; typed inline for brevity */
    async getPlatformAnalytics(): Promise<PlatformAnalytics> {
      const totalTenants = (db.prepare('SELECT COUNT(*) as cnt FROM tenants').get() as any)?.cnt ?? 0;
      const activeTenants30d = (db.prepare("SELECT COUNT(DISTINCT tenant_id) as cnt FROM audit_events WHERE created_at >= datetime('now','-30 days')").get() as any)?.cnt ?? 0;
      const totalEvaluateCalls = (db.prepare('SELECT COUNT(*) as cnt FROM audit_events').get() as any)?.cnt ?? 0;
      const callsLast24h = (db.prepare("SELECT COUNT(*) as cnt FROM audit_events WHERE created_at >= datetime('now','-1 day')").get() as any)?.cnt ?? 0;
      const callsLast7d = (db.prepare("SELECT COUNT(*) as cnt FROM audit_events WHERE created_at >= datetime('now','-7 days')").get() as any)?.cnt ?? 0;
      const callsLast30d = (db.prepare("SELECT COUNT(*) as cnt FROM audit_events WHERE created_at >= datetime('now','-30 days')").get() as any)?.cnt ?? 0;
      const blocked = (db.prepare("SELECT COUNT(*) as cnt FROM audit_events WHERE result = 'block'").get() as any)?.cnt ?? 0;
      const blockRate = totalEvaluateCalls > 0 ? blocked / totalEvaluateCalls : 0;
      const topTools = db.prepare('SELECT tool, COUNT(*) as cnt FROM audit_events GROUP BY tool ORDER BY cnt DESC LIMIT 20').all() as any[];
      const topTenants = db.prepare("SELECT a.tenant_id, COALESCE(t.email,'unknown') as email, COUNT(*) as cnt FROM audit_events a LEFT JOIN tenants t ON a.tenant_id = t.id GROUP BY a.tenant_id, t.email ORDER BY cnt DESC LIMIT 20").all() as any[];
      const dailyVolume = db.prepare("SELECT DATE(created_at) as date, COUNT(*) as cnt FROM audit_events WHERE created_at >= datetime('now','-30 days') GROUP BY date ORDER BY date").all() as any[];

      let sdkTelemetry = { total: 0, last7d: 0, byLanguage: [] as any[] };
      try {
        const total = (db.prepare('SELECT COUNT(*) as cnt FROM telemetry_events').get() as any)?.cnt ?? 0;
        const last7d = (db.prepare("SELECT COUNT(*) as cnt FROM telemetry_events WHERE created_at >= datetime('now','-7 days')").get() as any)?.cnt ?? 0;
        const byLang = db.prepare('SELECT language, COUNT(*) as cnt FROM telemetry_events GROUP BY language ORDER BY cnt DESC').all() as any[];
        sdkTelemetry = { total, last7d, byLanguage: byLang };
      } catch { /* table may not exist */ }

      return {
        totalTenants,
        activeTenants30d,
        totalEvaluateCalls,
        callsLast24h,
        callsLast7d,
        callsLast30d,
        blockRate,
        topTools: topTools.map(r => ({ tool: r.tool, cnt: r.cnt })),
        topTenants: topTenants.map(r => ({ tenant_id: r.tenant_id, email: r.email, cnt: r.cnt })),
        dailyVolume: dailyVolume.map(r => ({ date: r.date, cnt: r.cnt })),
        sdkTelemetry,
      };
    },
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // ── Feedback ──────────────────────────────────────────────────────────────
    async insertFeedback(
      tenantId: string,
      agentId: string | null,
      rating: number,
      comment: string | null,
    ): Promise<FeedbackRow> {
      const row = db.prepare<[string, string | null, number, string | null]>(
        `INSERT INTO feedback (tenant_id, agent_id, rating, comment)
         VALUES (?, ?, ?, ?)
         RETURNING *`
      ).get(tenantId, agentId, rating, comment) as FeedbackRow;
      return row;
    },

    async listFeedback(): Promise<FeedbackRow[]> {
      return allSync<FeedbackRow>(
        'SELECT * FROM feedback ORDER BY created_at DESC'
      );
    },

    // ── Telemetry ─────────────────────────────────────────────────────────────
    async insertTelemetryEvent(
      sdkVersion: string,
      language: string,
      nodeVersion: string | null,
      osPlatform: string | null,
    ): Promise<void> {
      // Store node_version concatenated into platform field if provided
      const platform = osPlatform ?? null;
      db.prepare(
        'INSERT INTO telemetry_events (sdk_version, language, platform) VALUES (?, ?, ?)'
      ).run(sdkVersion, language, platform);
    },

    // ── Compliance Reports ────────────────────────────────────────────────────
    async insertComplianceReport(
      tenantId: string,
      reportType: string,
      score: number,
      controlsJson: string,
    ): Promise<string> {
      const id = crypto.randomUUID().replace(/-/g, '');
      db.prepare(
        `INSERT INTO compliance_reports (id, tenant_id, report_type, score, controls_json)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, tenantId, reportType, score, controlsJson);
      return id;
    },

    async getComplianceReport(tenantId: string, reportId: string): Promise<ComplianceReportRow | undefined> {
      return getSync<ComplianceReportRow>(
        'SELECT * FROM compliance_reports WHERE id = ? AND tenant_id = ?',
        [reportId, tenantId]
      );
    },

    async getLatestComplianceReport(tenantId: string): Promise<ComplianceReportRow | undefined> {
      return getSync<ComplianceReportRow>(
        'SELECT * FROM compliance_reports WHERE tenant_id = ? ORDER BY generated_at DESC LIMIT 1',
        [tenantId]
      );
    },

    // ── Agent Hierarchy (A2A) ──────────────────────────────────────────────────
    async insertChildAgent(
      id: string,
      parentAgentId: string,
      childAgentId: string,
      tenantId: string,
      policySnapshot: string,
      ttlExpiresAt: string | null,
      maxToolCalls: number | null,
    ): Promise<ChildAgentRow> {
      db.prepare(
        `INSERT INTO agent_hierarchy
           (id, parent_agent_id, child_agent_id, tenant_id, policy_snapshot, ttl_expires_at, max_tool_calls)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, parentAgentId, childAgentId, tenantId, policySnapshot, ttlExpiresAt, maxToolCalls);
      return getSync<ChildAgentRow>(
        'SELECT * FROM agent_hierarchy WHERE id = ?',
        [id]
      )!;
    },

    async getChildAgent(childAgentId: string): Promise<ChildAgentRow | undefined> {
      return getSync<ChildAgentRow>(
        'SELECT * FROM agent_hierarchy WHERE child_agent_id = ?',
        [childAgentId]
      );
    },

    async listChildAgents(parentAgentId: string, tenantId: string): Promise<ChildAgentRow[]> {
      return allSync<ChildAgentRow>(
        'SELECT * FROM agent_hierarchy WHERE parent_agent_id = ? AND tenant_id = ? ORDER BY created_at DESC',
        [parentAgentId, tenantId]
      );
    },

    async deleteChildAgent(childAgentId: string, tenantId: string): Promise<void> {
      db.prepare(
        'DELETE FROM agent_hierarchy WHERE child_agent_id = ? AND tenant_id = ?'
      ).run(childAgentId, tenantId);
    },

    async incrementChildToolCalls(childAgentId: string): Promise<void> {
      db.prepare(
        'UPDATE agent_hierarchy SET tool_calls_used = tool_calls_used + 1 WHERE child_agent_id = ?'
      ).run(childAgentId);
    },

    // ── MCP Server Registry ───────────────────────────────────────────────────
    async insertMcpServer(
      tenantId: string,
      name: string,
      url: string,
      allowedTools: string[],
      blockedTools: string[],
    ): Promise<McpServerRow> {
      const id = crypto.randomUUID().replace(/-/g, '');
      db.prepare(
        `INSERT INTO mcp_servers (id, tenant_id, name, url, allowed_tools, blocked_tools)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, tenantId, name, url, JSON.stringify(allowedTools), JSON.stringify(blockedTools));
      return getSync<McpServerRow>('SELECT * FROM mcp_servers WHERE id = ?', [id])!;
    },

    async listMcpServers(tenantId: string): Promise<McpServerRow[]> {
      return allSync<McpServerRow>(
        'SELECT * FROM mcp_servers WHERE tenant_id = ? ORDER BY created_at ASC',
        [tenantId]
      );
    },

    async getMcpServer(id: string, tenantId: string): Promise<McpServerRow | undefined> {
      return getSync<McpServerRow>(
        'SELECT * FROM mcp_servers WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );
    },

    async deleteMcpServer(id: string, tenantId: string): Promise<void> {
      db.prepare('DELETE FROM mcp_servers WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    },

    // ── Integrations (Slack/Teams) ────────────────────────────────────────────
    async insertIntegration(tenantId: string, type: 'slack' | 'teams', configEncrypted: string): Promise<IntegrationRow> {
      const id = require('crypto').randomUUID();
      db.prepare(
        'INSERT INTO integrations (id, tenant_id, type, config_encrypted) VALUES (?, ?, ?, ?)'
      ).run(id, tenantId, type, configEncrypted);
      return { id, tenant_id: tenantId, type, config_encrypted: configEncrypted, created_at: new Date().toISOString() };
    },
    async getIntegration(tenantId: string, type: 'slack' | 'teams'): Promise<IntegrationRow | undefined> {
      return (db.prepare('SELECT * FROM integrations WHERE tenant_id = ? AND type = ?').get(tenantId, type) as IntegrationRow | undefined);
    },
    async deleteIntegration(tenantId: string, type: 'slack' | 'teams'): Promise<void> {
      db.prepare('DELETE FROM integrations WHERE tenant_id = ? AND type = ?').run(tenantId, type);
    },

    // ── SSO Configurations ─────────────────────────────────────────────────────
    async upsertSsoConfig(
      tenantId: string,
      config: {
        provider: SsoProvider;
        protocol: SsoProtocol;
        domain: string;
        clientId: string;
        clientSecretEncrypted: string;
        discoveryUrl?: string | null;
        redirectUri?: string | null;
        scopes?: string | null;
        forceSso?: boolean;
        roleClaimName?: string | null;
        adminGroup?: string | null;
        memberGroup?: string | null;
        idpMetadataXml?: string | null;
        spEntityId?: string | null;
      },
    ): Promise<SsoConfigRow> {
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT * FROM sso_configs WHERE tenant_id = ?').get(tenantId) as SsoConfigRow | undefined;
      if (existing) {
        db.prepare(
          `UPDATE sso_configs SET
            provider = ?, protocol = ?, domain = ?, client_id = ?, client_secret_encrypted = ?,
            discovery_url = ?, redirect_uri = ?, scopes = ?, force_sso = ?,
            role_claim_name = ?, admin_group = ?, member_group = ?,
            idp_metadata_xml = ?, sp_entity_id = ?, updated_at = ?
           WHERE tenant_id = ?`
        ).run(
          config.provider, config.protocol, config.domain, config.clientId, config.clientSecretEncrypted,
          config.discoveryUrl ?? null, config.redirectUri ?? null, config.scopes ?? null,
          config.forceSso ? 1 : 0,
          config.roleClaimName ?? null, config.adminGroup ?? null, config.memberGroup ?? null,
          config.idpMetadataXml ?? null, config.spEntityId ?? null, now,
          tenantId,
        );
      } else {
        const id = crypto.randomUUID();
        db.prepare(
          `INSERT INTO sso_configs (
            id, tenant_id, provider, protocol, domain, client_id, client_secret_encrypted,
            discovery_url, redirect_uri, scopes, force_sso,
            role_claim_name, admin_group, member_group,
            idp_metadata_xml, sp_entity_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id, tenantId, config.provider, config.protocol, config.domain,
          config.clientId, config.clientSecretEncrypted,
          config.discoveryUrl ?? null, config.redirectUri ?? null, config.scopes ?? null,
          config.forceSso ? 1 : 0,
          config.roleClaimName ?? null, config.adminGroup ?? null, config.memberGroup ?? null,
          config.idpMetadataXml ?? null, config.spEntityId ?? null, now, null,
        );
      }
      return db.prepare('SELECT * FROM sso_configs WHERE tenant_id = ?').get(tenantId) as SsoConfigRow;
    },

    async getSsoConfig(tenantId: string): Promise<SsoConfigRow | undefined> {
      return db.prepare('SELECT * FROM sso_configs WHERE tenant_id = ?').get(tenantId) as SsoConfigRow | undefined;
    },

    async deleteSsoConfig(tenantId: string): Promise<void> {
      db.prepare('DELETE FROM sso_configs WHERE tenant_id = ?').run(tenantId);
    },

    // ── SSO State ─────────────────────────────────────────────────────────────
    async storeSsoState(state: string, data: string, expiresAt: string): Promise<void> {
      db.prepare(
        'INSERT OR REPLACE INTO sso_states (state, data, expires_at) VALUES (?, ?, ?)'
      ).run(state, data, expiresAt);
    },

    async getSsoState(state: string): Promise<{ data: string; expires_at: string } | undefined> {
      return db.prepare('SELECT data, expires_at FROM sso_states WHERE state = ?').get(state) as
        { data: string; expires_at: string } | undefined;
    },

    async deleteSsoState(state: string): Promise<void> {
      db.prepare('DELETE FROM sso_states WHERE state = ?').run(state);
      // Clean up expired states while we're at it
      db.prepare("DELETE FROM sso_states WHERE expires_at < datetime('now')").run();
    },

    // ── SSO Users ─────────────────────────────────────────────────────────────
    async upsertSsoUser(
      tenantId: string,
      idpSub: string,
      provider: SsoProvider,
      email: string | null,
      name: string | null,
      role: string,
    ): Promise<SsoUserRow> {
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT * FROM sso_users WHERE tenant_id = ? AND idp_sub = ?').get(tenantId, idpSub);
      if (existing) {
        db.prepare(
          `UPDATE sso_users SET email = ?, name = ?, role = ?, last_login_at = ? WHERE tenant_id = ? AND idp_sub = ?`
        ).run(email, name, role, now, tenantId, idpSub);
      } else {
        db.prepare(
          `INSERT INTO sso_users (id, tenant_id, idp_sub, provider, email, name, role, created_at, last_login_at)
           VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(tenantId, idpSub, provider, email, name, role, now, now);
      }
      return db.prepare('SELECT * FROM sso_users WHERE tenant_id = ? AND idp_sub = ?').get(tenantId, idpSub) as SsoUserRow;
    },

    async getSsoUser(tenantId: string, idpSub: string): Promise<SsoUserRow | undefined> {
      return db.prepare('SELECT * FROM sso_users WHERE tenant_id = ? AND idp_sub = ?').get(tenantId, idpSub) as SsoUserRow | undefined;
    },

    // ── Git Webhook Config ────────────────────────────────────────────────────
    async upsertGitWebhookConfig(
      tenantId: string,
      repoUrl: string,
      webhookSecret: string,
      branch: string,
      policyDir: string,
      githubToken: string | null,
    ): Promise<GitWebhookConfigRow> {
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT * FROM git_webhook_configs WHERE tenant_id = ?').get(tenantId);
      if (existing) {
        db.prepare(
          `UPDATE git_webhook_configs SET
             repo_url = ?, webhook_secret = ?, branch = ?, policy_dir = ?, github_token = ?, updated_at = ?
           WHERE tenant_id = ?`
        ).run(repoUrl, webhookSecret, branch, policyDir, githubToken, now, tenantId);
      } else {
        db.prepare(
          `INSERT INTO git_webhook_configs (id, tenant_id, repo_url, webhook_secret, branch, policy_dir, github_token, created_at)
           VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)`
        ).run(tenantId, repoUrl, webhookSecret, branch, policyDir, githubToken, now);
      }
      return db.prepare('SELECT * FROM git_webhook_configs WHERE tenant_id = ?').get(tenantId) as GitWebhookConfigRow;
    },

    async getGitWebhookConfig(tenantId: string): Promise<GitWebhookConfigRow | undefined> {
      return db.prepare('SELECT * FROM git_webhook_configs WHERE tenant_id = ?').get(tenantId) as GitWebhookConfigRow | undefined;
    },

    async deleteGitWebhookConfig(tenantId: string): Promise<void> {
      db.prepare('DELETE FROM git_webhook_configs WHERE tenant_id = ?').run(tenantId);
    },

    async insertGitSyncLog(
      tenantId: string,
      commitSha: string,
      branch: string,
      policiesUpdated: number,
      policiesSkipped: number,
      status: 'success' | 'error',
      errorMessage: string | null,
    ): Promise<GitSyncLogRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO git_sync_logs (id, tenant_id, commit_sha, branch, policies_updated, policies_skipped, status, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, tenantId, commitSha, branch, policiesUpdated, policiesSkipped, status, errorMessage, now);
      return db.prepare('SELECT * FROM git_sync_logs WHERE id = ?').get(id) as GitSyncLogRow;
    },

    async listGitSyncLogs(tenantId: string, limit = 50): Promise<GitSyncLogRow[]> {
      return db.prepare(
        'SELECT * FROM git_sync_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(tenantId, limit) as GitSyncLogRow[];
    },

    // ── SIEM Configurations ────────────────────────────────────────────────────
    async upsertSiemConfig(tenantId: string, provider: 'splunk' | 'sentinel', configEncrypted: string): Promise<SiemConfigRow> {
      const existing = db.prepare('SELECT * FROM siem_configs WHERE tenant_id = ?').get(tenantId) as SiemConfigRow | undefined;
      if (existing) {
        db.prepare(
          'UPDATE siem_configs SET provider = ?, config_encrypted = ?, enabled = 1 WHERE tenant_id = ?'
        ).run(provider, configEncrypted, tenantId);
        return {
          ...existing,
          provider,
          config_encrypted: configEncrypted,
          enabled: 1,
        };
      }
      const id = crypto.randomUUID();
      const created_at = new Date().toISOString();
      db.prepare(
        'INSERT INTO siem_configs (id, tenant_id, provider, config_encrypted, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, tenantId, provider, configEncrypted, created_at);
      return { id, tenant_id: tenantId, provider, config_encrypted: configEncrypted, enabled: 1, last_forwarded_at: null, created_at };
    },

    async getSiemConfig(tenantId: string): Promise<SiemConfigRow | undefined> {
      return db.prepare('SELECT * FROM siem_configs WHERE tenant_id = ?').get(tenantId) as SiemConfigRow | undefined;
    },

    async deleteSiemConfig(tenantId: string): Promise<void> {
      db.prepare('DELETE FROM siem_configs WHERE tenant_id = ?').run(tenantId);
    },

    async updateSiemLastForwarded(tenantId: string, at: string): Promise<void> {
      db.prepare('UPDATE siem_configs SET last_forwarded_at = ? WHERE tenant_id = ?').run(at, tenantId);
    },

    // ── License Keys ──────────────────────────────────────────────────────────
    async insertLicenseKey(key: LicenseKeyRow): Promise<LicenseKeyRow> {
      db.prepare(
        `INSERT INTO license_keys
           (id, tenant_id, key_hash, tier, features, limits_json, offline_grace_days,
            issued_at, expires_at, revoked_at, revoke_reason, stripe_subscription_id, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        key.id, key.tenant_id, key.key_hash, key.tier, key.features,
        key.limits_json, key.offline_grace_days, key.issued_at, key.expires_at,
        key.revoked_at, key.revoke_reason, key.stripe_subscription_id, key.metadata, key.created_at,
      );
      return getSync<LicenseKeyRow>('SELECT * FROM license_keys WHERE id = ?', [key.id])!;
    },

    async getLicenseKeyByTenant(tenantId: string): Promise<LicenseKeyRow | null> {
      const row = getSync<LicenseKeyRow>(
        'SELECT * FROM license_keys WHERE tenant_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',
        [tenantId]
      );
      return row ?? null;
    },

    async getLicenseKeyByHash(hash: string): Promise<LicenseKeyRow | null> {
      const row = getSync<LicenseKeyRow>(
        'SELECT * FROM license_keys WHERE key_hash = ? LIMIT 1',
        [hash]
      );
      return row ?? null;
    },

    async revokeLicenseKey(id: string, reason: string): Promise<void> {
      db.prepare(
        "UPDATE license_keys SET revoked_at = datetime('now'), revoke_reason = ? WHERE id = ?"
      ).run(reason, id);
    },

    // ── License Events ─────────────────────────────────────────────────────────
    async insertLicenseEvent(event: LicenseEventRow): Promise<void> {
      db.prepare(
        `INSERT INTO license_events (id, tenant_id, license_id, event_type, details, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        event.id, event.tenant_id, event.license_id, event.event_type,
        event.details, event.ip_address, event.created_at,
      );
    },

    async getLicenseEvents(tenantId: string, limit: number): Promise<LicenseEventRow[]> {
      return allSync<LicenseEventRow>(
        'SELECT * FROM license_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?',
        [tenantId, limit]
      );
    },

    // ── License Usage ─────────────────────────────────────────────────────────
    async upsertLicenseUsage(tenantId: string, month: string, events: number, agents: number): Promise<void> {
      const existing = getSync<LicenseUsageRow>(
        'SELECT * FROM license_usage WHERE tenant_id = ? AND month = ?',
        [tenantId, month]
      );
      if (existing) {
        db.prepare(
          "UPDATE license_usage SET event_count = event_count + ?, agent_count = ?, last_updated = datetime('now') WHERE tenant_id = ? AND month = ?"
        ).run(events, agents, tenantId, month);
      } else {
        const id = crypto.randomUUID();
        db.prepare(
          "INSERT INTO license_usage (id, tenant_id, month, event_count, agent_count, last_updated) VALUES (?, ?, ?, ?, ?, datetime('now'))"
        ).run(id, tenantId, month, events, agents);
      }
    },

    async getLicenseUsage(tenantId: string, month: string): Promise<LicenseUsageRow | null> {
      const row = getSync<LicenseUsageRow>(
        'SELECT * FROM license_usage WHERE tenant_id = ? AND month = ?',
        [tenantId, month]
      );
      return row ?? null;
    },

    // ── Anomaly Rules ─────────────────────────────────────────────────────────
    async insertAnomalyRule(rule: AnomalyRuleRow): Promise<AnomalyRuleRow> {
      db.prepare(
        `INSERT INTO anomaly_rules (id, tenant_id, name, metric, condition, threshold, window_minutes, severity, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        rule.id, rule.tenant_id, rule.name, rule.metric, rule.condition,
        rule.threshold, rule.window_minutes, rule.severity,
        rule.enabled ?? 1,
        rule.created_at ?? new Date().toISOString(),
      );
      return getSync<AnomalyRuleRow>('SELECT * FROM anomaly_rules WHERE id = ?', [rule.id])!;
    },

    async getAnomalyRules(tenantId: string): Promise<AnomalyRuleRow[]> {
      return allSync<AnomalyRuleRow>(
        'SELECT * FROM anomaly_rules WHERE tenant_id = ? ORDER BY created_at ASC',
        [tenantId]
      );
    },

    async updateAnomalyRule(id: string, tenantId: string, updates: Partial<AnomalyRuleRow>): Promise<AnomalyRuleRow | undefined> {
      const allowed = ['name', 'metric', 'condition', 'threshold', 'window_minutes', 'severity', 'enabled'] as const;
      const setClauses: string[] = [];
      const params: unknown[] = [];
      for (const key of allowed) {
        if (key in updates) {
          setClauses.push(`${key} = ?`);
          params.push((updates as Record<string, unknown>)[key]);
        }
      }
      if (setClauses.length === 0) return getSync<AnomalyRuleRow>('SELECT * FROM anomaly_rules WHERE id = ? AND tenant_id = ?', [id, tenantId]);
      params.push(id, tenantId);
      db.prepare(`UPDATE anomaly_rules SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...params);
      return getSync<AnomalyRuleRow>('SELECT * FROM anomaly_rules WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    },

    async deleteAnomalyRule(id: string, tenantId: string): Promise<void> {
      db.prepare('DELETE FROM anomaly_rules WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    },

    // ── Alerts ────────────────────────────────────────────────────────────────
    async insertAlert(alert: AlertRow): Promise<AlertRow> {
      db.prepare(
        `INSERT INTO alerts (id, tenant_id, rule_id, metric, current_value, threshold, severity, message, resolved_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        alert.id, alert.tenant_id, alert.rule_id, alert.metric,
        alert.current_value, alert.threshold, alert.severity, alert.message,
        alert.resolved_at ?? null,
        alert.created_at ?? new Date().toISOString(),
      );
      return getSync<AlertRow>('SELECT * FROM alerts WHERE id = ?', [alert.id])!;
    },

    async getAlerts(tenantId: string, opts?: { severity?: string; resolved?: boolean }): Promise<AlertRow[]> {
      const conditions: string[] = ['tenant_id = ?'];
      const params: unknown[] = [tenantId];
      if (opts?.severity) {
        conditions.push('severity = ?');
        params.push(opts.severity);
      }
      if (opts?.resolved === false) {
        conditions.push('resolved_at IS NULL');
      } else if (opts?.resolved === true) {
        conditions.push('resolved_at IS NOT NULL');
      }
      return allSync<AlertRow>(
        `SELECT * FROM alerts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
        params
      );
    },

    async resolveAlert(id: string): Promise<void> {
      db.prepare(
        "UPDATE alerts SET resolved_at = datetime('now') WHERE id = ?"
      ).run(id);
    },

    async getActiveAlert(tenantId: string, ruleId: string): Promise<AlertRow | undefined> {
      return getSync<AlertRow>(
        'SELECT * FROM alerts WHERE tenant_id = ? AND rule_id = ? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1',
        [tenantId, ruleId]
      );
    },

    // ── Stripe Webhook Idempotency ──────────────────────────────────────────

    async isStripeEventProcessed(eventId: string): Promise<boolean> {
      const row = getSync<{ event_id: string }>(
        'SELECT event_id FROM stripe_processed_events WHERE event_id = ?',
        [eventId]
      );
      return row !== undefined;
    },

    async markStripeEventProcessed(eventId: string, eventType: string): Promise<void> {
      execSync(
        'INSERT OR IGNORE INTO stripe_processed_events (event_id, event_type) VALUES (?, ?)',
        [eventId, eventType]
      );
    },

    async pruneStripeProcessedEvents(olderThanDays = 30): Promise<void> {
      execSync(
        `DELETE FROM stripe_processed_events WHERE processed_at < datetime('now', '-' || ? || ' days')`,
        [olderThanDays]
      );
    },

    // ── Policy Versioning ─────────────────────────────────────────────────────
    async getNextPolicyVersion(policyId: string, tenantId: string): Promise<number> {
      const row = getSync<{ max_version: number | null }>(
        'SELECT MAX(version) as max_version FROM policy_versions WHERE policy_id = ? AND tenant_id = ?',
        [policyId, tenantId]
      );
      return (row?.max_version ?? 0) + 1;
    },

    async insertPolicyVersion(
      policyId: string,
      tenantId: string,
      policyData: string,
      revertedFrom: number | null = null,
    ): Promise<PolicyVersionRow> {
      const version = await adapter.getNextPolicyVersion(policyId, tenantId);
      db.prepare(
        `INSERT INTO policy_versions (policy_id, tenant_id, version, policy_data, reverted_from)
         VALUES (?, ?, ?, ?, ?)`
      ).run(policyId, tenantId, version, policyData, revertedFrom ?? null);
      return getSync<PolicyVersionRow>(
        'SELECT * FROM policy_versions WHERE policy_id = ? AND tenant_id = ? AND version = ?',
        [policyId, tenantId, version]
      )!;
    },

    async getPolicyVersions(policyId: string, tenantId: string): Promise<PolicyVersionRow[]> {
      return allSync<PolicyVersionRow>(
        'SELECT * FROM policy_versions WHERE policy_id = ? AND tenant_id = ? ORDER BY version DESC',
        [policyId, tenantId]
      );
    },

    async getPolicyVersion(policyId: string, tenantId: string, version: number): Promise<PolicyVersionRow | undefined> {
      return getSync<PolicyVersionRow>(
        'SELECT * FROM policy_versions WHERE policy_id = ? AND tenant_id = ? AND version = ?',
        [policyId, tenantId, version]
      );
    },

    // ── Team Members (M3-78) ──────────────────────────────────────────────
    async getTeamMembers(tenantId: string): Promise<TeamMemberRow[]> {
      return allSync<TeamMemberRow>(
        'SELECT * FROM team_members WHERE tenant_id = ? ORDER BY invited_at',
        [tenantId]
      );
    },

    async addTeamMember(tenantId: string, email: string, role: string): Promise<TeamMemberRow> {
      const id = crypto.randomUUID();
      try {
        db.prepare(
          'INSERT INTO team_members (id, tenant_id, email, role) VALUES (?, ?, ?, ?)'
        ).run(id, tenantId, email, role);
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('UNIQUE')) {
          throw new Error('Member already exists');
        }
        throw e;
      }
      return getSync<TeamMemberRow>('SELECT * FROM team_members WHERE id = ?', [id])!;
    },

    async removeTeamMember(tenantId: string, userId: string): Promise<void> {
      db.prepare('DELETE FROM team_members WHERE tenant_id = ? AND id = ?').run(tenantId, userId);
    },

    async updateTeamMemberRole(tenantId: string, userId: string, role: string): Promise<void> {
      db.prepare('UPDATE team_members SET role = ? WHERE tenant_id = ? AND id = ?').run(role, tenantId, userId);
    },

    async getTeamMemberByEmail(tenantId: string, email: string): Promise<TeamMemberRow | undefined> {
      return getSync<TeamMemberRow>(
        'SELECT * FROM team_members WHERE tenant_id = ? AND email = ?',
        [tenantId, email]
      );
    },

    // ── Job Queue (M3-79) ─────────────────────────────────────────────────
    async enqueueJob(tenantId: string, jobType: string, payload: string): Promise<string> {
      const id = crypto.randomUUID();
      db.prepare(
        'INSERT INTO evaluation_jobs (id, tenant_id, job_type, payload) VALUES (?, ?, ?, ?)'
      ).run(id, tenantId, jobType, payload);
      return id;
    },

    async getJob(jobId: string): Promise<JobRow | undefined> {
      return getSync<JobRow>('SELECT * FROM evaluation_jobs WHERE id = ?', [jobId]);
    },

    async getJobsForTenant(tenantId: string, limit = 50, offset = 0): Promise<JobRow[]> {
      return allSync<JobRow>(
        'SELECT * FROM evaluation_jobs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [tenantId, limit, offset]
      );
    },

    async claimPendingJob(): Promise<JobRow | undefined> {
      const job = getSync<JobRow>(
        "SELECT * FROM evaluation_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      );
      if (job) {
        db.prepare(
          "UPDATE evaluation_jobs SET status = 'running', started_at = datetime('now') WHERE id = ? AND status = 'pending'"
        ).run(job.id);
      }
      return job;
    },

    async completeJob(jobId: string, result: string): Promise<void> {
      db.prepare(
        "UPDATE evaluation_jobs SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?"
      ).run(result, jobId);
    },

    async failJob(jobId: string, error: string): Promise<void> {
      db.prepare(
        "UPDATE evaluation_jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?"
      ).run(error, jobId);
    },

    // ── SCIM Tokens (Wave 9) ──────────────────────────────────────────────
    async createScimToken(tenantId: string, tokenHash: string, label: string): Promise<ScimTokenRow> {
      const id = crypto.randomUUID();
      db.prepare(
        'INSERT INTO scim_tokens (id, tenant_id, token_hash, label) VALUES (?, ?, ?, ?)'
      ).run(id, tenantId, tokenHash, label);
      return getSync<ScimTokenRow>('SELECT * FROM scim_tokens WHERE id = ?', [id])!;
    },

    async getScimTokenByHash(tokenHash: string): Promise<ScimTokenRow | undefined> {
      return getSync<ScimTokenRow>('SELECT * FROM scim_tokens WHERE token_hash = ? AND active = 1', [tokenHash]);
    },

    async listScimTokens(tenantId: string): Promise<ScimTokenRow[]> {
      return allSync<ScimTokenRow>('SELECT * FROM scim_tokens WHERE tenant_id = ? ORDER BY created_at DESC', [tenantId]);
    },

    async revokeScimToken(id: string, tenantId: string): Promise<void> {
      db.prepare('UPDATE scim_tokens SET active = 0 WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    },

    async touchScimToken(id: string): Promise<void> {
      db.prepare("UPDATE scim_tokens SET last_used_at = datetime('now') WHERE id = ?").run(id);
    },

    // ── SCIM Users (Wave 9) ───────────────────────────────────────────────
    async createScimUser(tenantId: string, user: Omit<ScimUserRow, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'tenant_id'>): Promise<ScimUserRow> {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO scim_users (id, tenant_id, external_id, user_name, display_name, given_name, family_name, email, active, role)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, user.external_id ?? null, user.user_name, user.display_name ?? null,
            user.given_name ?? null, user.family_name ?? null, user.email ?? null,
            user.active ?? 1, user.role ?? 'member');
      return getSync<ScimUserRow>('SELECT * FROM scim_users WHERE id = ?', [id])!;
    },

    async getScimUser(id: string, tenantId: string): Promise<ScimUserRow | undefined> {
      return getSync<ScimUserRow>('SELECT * FROM scim_users WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    },

    async getScimUserByUserName(tenantId: string, userName: string): Promise<ScimUserRow | undefined> {
      return getSync<ScimUserRow>('SELECT * FROM scim_users WHERE tenant_id = ? AND user_name = ?', [tenantId, userName]);
    },

    async listScimUsers(tenantId: string, opts: { filter?: string; startIndex?: number; count?: number } = {}): Promise<{ users: ScimUserRow[]; total: number }> {
      const { startIndex = 1, count = 100 } = opts;
      const offset = Math.max(0, startIndex - 1);
      let where = 'tenant_id = ? AND deleted_at IS NULL';
      const params: unknown[] = [tenantId];

      // Basic SCIM filter support: userName eq "value"
      if (opts.filter) {
        const m = opts.filter.match(/^userName\s+eq\s+"([^"]+)"$/i);
        if (m) { where += ' AND user_name = ?'; params.push(m[1]); }
      }

      const total = (getSync<{ c: number }>(`SELECT COUNT(*) AS c FROM scim_users WHERE ${where}`, params)?.c) ?? 0;
      const users = allSync<ScimUserRow>(
        `SELECT * FROM scim_users WHERE ${where} ORDER BY created_at ASC LIMIT ? OFFSET ?`,
        [...params, count, offset]
      );
      return { users, total };
    },

    async updateScimUser(id: string, tenantId: string, updates: Partial<ScimUserRow>): Promise<ScimUserRow | undefined> {
      const fields: string[] = [];
      const vals: unknown[] = [];
      const allowed = ['external_id','user_name','display_name','given_name','family_name','email','active','role'] as const;
      for (const k of allowed) {
        if (k in updates) { fields.push(`${k} = ?`); vals.push((updates as Record<string,unknown>)[k]); }
      }
      if (fields.length === 0) return this.getScimUser(id, tenantId);
      fields.push("updated_at = datetime('now')");
      vals.push(id, tenantId);
      db.prepare(`UPDATE scim_users SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...vals);
      return getSync<ScimUserRow>('SELECT * FROM scim_users WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    },

    async deleteScimUser(id: string, tenantId: string): Promise<void> {
      db.prepare("UPDATE scim_users SET deleted_at = datetime('now'), active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(id, tenantId);
    },

    // ── SCIM Groups (Wave 9) ──────────────────────────────────────────────
    async createScimGroup(tenantId: string, displayName: string): Promise<ScimGroupRow> {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO scim_groups (id, tenant_id, display_name) VALUES (?, ?, ?)').run(id, tenantId, displayName);
      return getSync<ScimGroupRow>('SELECT * FROM scim_groups WHERE id = ?', [id])!;
    },

    async getScimGroup(id: string, tenantId: string): Promise<ScimGroupRow | undefined> {
      return getSync<ScimGroupRow>('SELECT * FROM scim_groups WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    },

    async listScimGroups(tenantId: string, opts: { startIndex?: number; count?: number } = {}): Promise<{ groups: ScimGroupRow[]; total: number }> {
      const { startIndex = 1, count = 100 } = opts;
      const offset = Math.max(0, startIndex - 1);
      const total = (getSync<{ c: number }>('SELECT COUNT(*) AS c FROM scim_groups WHERE tenant_id = ?', [tenantId])?.c) ?? 0;
      const groups = allSync<ScimGroupRow>('SELECT * FROM scim_groups WHERE tenant_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?', [tenantId, count, offset]);
      return { groups, total };
    },

    async updateScimGroup(id: string, tenantId: string, displayName: string): Promise<ScimGroupRow | undefined> {
      db.prepare("UPDATE scim_groups SET display_name = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(displayName, id, tenantId);
      return getSync<ScimGroupRow>('SELECT * FROM scim_groups WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    },

    async deleteScimGroup(id: string, tenantId: string): Promise<void> {
      db.prepare('DELETE FROM scim_group_members WHERE group_id = ? AND tenant_id = ?').run(id, tenantId);
      db.prepare('DELETE FROM scim_groups WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    },

    async getScimGroupMembers(groupId: string, tenantId: string): Promise<ScimGroupMemberRow[]> {
      return allSync<ScimGroupMemberRow>('SELECT * FROM scim_group_members WHERE group_id = ? AND tenant_id = ?', [groupId, tenantId]);
    },

    async addScimGroupMember(groupId: string, userId: string, tenantId: string): Promise<void> {
      db.prepare('INSERT OR IGNORE INTO scim_group_members (group_id, user_id, tenant_id) VALUES (?, ?, ?)').run(groupId, userId, tenantId);
    },

    async removeScimGroupMember(groupId: string, userId: string, tenantId: string): Promise<void> {
      db.prepare('DELETE FROM scim_group_members WHERE group_id = ? AND user_id = ? AND tenant_id = ?').run(groupId, userId, tenantId);
    },

    async replaceScimGroupMembers(groupId: string, tenantId: string, userIds: string[]): Promise<void> {
      db.transaction(() => {
        db.prepare('DELETE FROM scim_group_members WHERE group_id = ? AND tenant_id = ?').run(groupId, tenantId);
        for (const userId of userIds) {
          db.prepare('INSERT OR IGNORE INTO scim_group_members (group_id, user_id, tenant_id) VALUES (?, ?, ?)').run(groupId, userId, tenantId);
        }
      })();
    },
  };

  return { adapter, raw: db };
}
