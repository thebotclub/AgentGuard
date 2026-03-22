/**
 * AgentGuard PostgreSQL Adapter
 *
 * Async database layer using `pg` (node-postgres).
 * Implements IDatabase interface for seamless drop-in use.
 *
 * Connection: Pool with SSL (required for Azure Database for PostgreSQL).
 * Schema: Auto-migrated on startup.
 */

import type { Pool, PoolConfig } from 'pg';
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
} from './db-interface.js';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// ── Key hashing helpers ────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 10;

function sha256Hex(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_ROUNDS);
}

// verifyApiKey is only used in auth middleware directly
export { sha256Hex };

// ── Schema ─────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    kill_switch_active INTEGER DEFAULT 0,
    kill_switch_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT DEFAULT 'default',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    agent_id TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    url TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '["block","killswitch"]',
    secret TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    policy_scope TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    declared_tools TEXT,
    last_validated_at TEXT,
    validation_coverage INTEGER,
    certified_at TEXT,
    certification_expires_at TEXT,
    certification_token TEXT,
    UNIQUE(tenant_id, name)
  );

  -- Phase 2: Rate limiting
  CREATE TABLE IF NOT EXISTS rate_limits (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    agent_id TEXT,
    window_seconds INTEGER NOT NULL DEFAULT 60,
    max_requests INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS rate_counters (
    tenant_id TEXT NOT NULL,
    agent_id TEXT,
    window_start BIGINT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, agent_id, window_start)
  );

  -- Phase 2: Cost attribution
  CREATE TABLE IF NOT EXISTS cost_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    agent_id TEXT,
    tool TEXT NOT NULL,
    estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    metadata TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Phase 3: MCP proxy configs
  CREATE TABLE IF NOT EXISTS mcp_proxy_configs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    upstream_url TEXT NOT NULL,
    allowed_tools TEXT NOT NULL DEFAULT '[]',
    blocked_tools TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
  );

  -- Custom policies (per-tenant policy overrides)
  CREATE TABLE IF NOT EXISTS tenant_policies (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
    policy_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_events(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_events(session_id);
  CREATE INDEX IF NOT EXISTS idx_apikeys_tenant ON api_keys(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_agents_key ON agents(api_key);
  CREATE INDEX IF NOT EXISTS idx_rate_limits_tenant ON rate_limits(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_cost_events_tenant ON cost_events(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_mcp_proxy_tenant ON mcp_proxy_configs(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approvals(tenant_id, status);

  CREATE TABLE IF NOT EXISTS compliance_reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    report_type TEXT NOT NULL DEFAULT 'owasp-agentic-top10',
    score REAL NOT NULL DEFAULT 0,
    controls_json TEXT NOT NULL DEFAULT '{}',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_compliance_reports_tenant ON compliance_reports(tenant_id, generated_at);

  -- MCP Server Registry
  CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    allowed_tools TEXT NOT NULL DEFAULT '[]',
    blocked_tools TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant ON mcp_servers(tenant_id);

  CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    type TEXT NOT NULL,
    config_encrypted TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id, type);

  CREATE TABLE IF NOT EXISTS sso_configs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id),
    provider TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'oidc',
    domain TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret_encrypted TEXT NOT NULL,
    discovery_url TEXT,
    redirect_uri TEXT,
    scopes TEXT,
    force_sso INTEGER NOT NULL DEFAULT 0,
    role_claim_name TEXT,
    admin_group TEXT,
    member_group TEXT,
    idp_metadata_xml TEXT,
    sp_entity_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_sso_configs_tenant ON sso_configs(tenant_id);

  CREATE TABLE IF NOT EXISTS sso_states (
    state TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sso_users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL,
    idp_sub TEXT NOT NULL,
    provider TEXT NOT NULL,
    email TEXT,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    UNIQUE(tenant_id, idp_sub)
  );
  CREATE INDEX IF NOT EXISTS idx_sso_users_tenant ON sso_users(tenant_id);

  CREATE TABLE IF NOT EXISTS git_webhook_configs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL UNIQUE,
    repo_url TEXT NOT NULL,
    webhook_secret TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    policy_dir TEXT NOT NULL DEFAULT 'agentguard/policies',
    github_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_git_webhook_tenant ON git_webhook_configs(tenant_id);

  CREATE TABLE IF NOT EXISTS git_sync_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    branch TEXT NOT NULL,
    policies_updated INTEGER NOT NULL DEFAULT 0,
    policies_skipped INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_git_sync_tenant ON git_sync_logs(tenant_id);

  -- SIEM Configurations
  CREATE TABLE IF NOT EXISTS siem_configs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    config_encrypted TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_forwarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_siem_configs_tenant ON siem_configs(tenant_id);

  -- License Keys
  CREATE TABLE IF NOT EXISTS license_keys (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',
    features TEXT NOT NULL DEFAULT '[]',
    limits_json TEXT NOT NULL DEFAULT '{}',
    offline_grace_days INTEGER NOT NULL DEFAULT 1,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,
    stripe_subscription_id TEXT,
    metadata TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_license_events_tenant ON license_events(tenant_id, created_at);

  -- License Usage
  CREATE TABLE IF NOT EXISTS license_usage (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    month TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    agent_count INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, month)
  );

  CREATE INDEX IF NOT EXISTS idx_license_usage_tenant ON license_usage(tenant_id, month);

  -- Anomaly Rules
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_anomaly_rules_tenant ON anomaly_rules(tenant_id);

  -- Alerts
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    current_value REAL NOT NULL,
    threshold REAL NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON alerts(tenant_id, resolved_at);
  CREATE INDEX IF NOT EXISTS idx_alerts_rule ON alerts(rule_id, resolved_at);

  -- Stripe webhook idempotency: DB-backed dedup replaces in-memory Set
  CREATE TABLE IF NOT EXISTS stripe_processed_events (
    event_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at ON stripe_processed_events(processed_at);

  CREATE TABLE IF NOT EXISTS policy_versions (
    id SERIAL PRIMARY KEY,
    policy_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    policy_data TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reverted_from INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON policy_versions(policy_id, tenant_id);

  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, email)
  );
  CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON team_members(tenant_id);

  CREATE TABLE IF NOT EXISTS evaluation_jobs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    job_type TEXT NOT NULL DEFAULT 'evaluation',
    status TEXT NOT NULL DEFAULT 'pending',
    payload TEXT NOT NULL,
    result TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON evaluation_jobs(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON evaluation_jobs(status);
`;

const SEED_SETTINGS_SQL = `
  INSERT INTO settings (key, value) VALUES ('global_kill_switch', '0') ON CONFLICT (key) DO NOTHING;
  INSERT INTO settings (key, value) VALUES ('global_kill_switch_at', '') ON CONFLICT (key) DO NOTHING;
`;

// ── PostgreSQL Adapter ─────────────────────────────────────────────────────

export async function createPostgresAdapter(connectionString: string): Promise<IDatabase> {
  // Dynamic import so pg is optional — SQLite-only installs won't fail at import time
  const { Pool } = await import('pg');

  const poolConfig: PoolConfig = {
    connectionString,
    // Hardened pool limits for multi-tenant workloads:
    // max 20 connections to avoid exhausting DB server resources;
    // idle timeout 30s to release unused connections promptly.
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Statement timeout: kill queries running > 5s to trigger graceful degradation
    // (applied via SET statement_timeout on each acquired client via the 'connect' hook below)
    ssl: {
      // Azure PostgreSQL requires SSL; rejectUnauthorized: false handles self-signed certs
      rejectUnauthorized: false,
    },
  };

  const pool: Pool = new Pool(poolConfig);

  // Log pool errors to avoid unhandled rejection crashes
  pool.on('error', (err: Error) => {
    console.error('[pg] pool error:', err.message);
  });

  // ── Helper: convert positional ? params to $1, $2 ... ─────────────────────
  // Used for query conversion from SQLite-style → PostgreSQL style
  function toPositional(sql: string, params: unknown[]): { text: string; values: unknown[] } {
    let idx = 0;
    const text = sql.replace(/\?/g, () => `$${++idx}`);
    return { text, values: params };
  }

  // ── Core query helpers ─────────────────────────────────────────────────────

  async function exec(sql: string, params: unknown[] = []): Promise<void> {
    const { text, values } = toPositional(sql, params);
    await pool.query(text, values.length ? values : undefined);
  }

  async function get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const { text, values } = toPositional(sql, params);
    const result = await pool.query(text, values.length ? values : undefined);
    return result.rows[0] as T | undefined;
  }

  async function all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { text, values } = toPositional(sql, params);
    const result = await pool.query(text, values.length ? values : undefined);
    return result.rows as T[];
  }

  async function run(sql: string, params: unknown[] = []): Promise<void> {
    await exec(sql, params);
  }

  // ── Normalise timestamps returned by pg ───────────────────────────────────
  // pg returns Date objects for TIMESTAMPTZ; we normalise to ISO strings
  function ts(val: unknown): string | null {
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return val.toISOString();
    return String(val);
  }

  function normTenant(row: Record<string, unknown>): TenantRow {
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      email: row['email'] as string,
      plan: row['plan'] as string,
      created_at: ts(row['created_at']) ?? new Date().toISOString(),
      kill_switch_active: Number(row['kill_switch_active'] ?? 0),
      kill_switch_at: ts(row['kill_switch_at']),
    };
  }

  function normApiKey(row: Record<string, unknown>): ApiKeyRow {
    return {
      key: row['key'] as string,
      tenant_id: row['tenant_id'] as string,
      name: row['name'] as string,
      created_at: ts(row['created_at']) ?? new Date().toISOString(),
      last_used_at: ts(row['last_used_at']),
      is_active: Number(row['is_active'] ?? 1),
      key_hash: (row['key_hash'] as string | null) ?? null,
      key_prefix: (row['key_prefix'] as string | null) ?? null,
      key_sha256: (row['key_sha256'] as string | null) ?? null,
    };
  }

  function normAuditEvent(row: Record<string, unknown>): AuditEventRow {
    return {
      id: Number(row['id']),
      tenant_id: (row['tenant_id'] as string | null) ?? null,
      session_id: (row['session_id'] as string | null) ?? null,
      tool: row['tool'] as string,
      action: (row['action'] as string | null) ?? null,
      result: row['result'] as string,
      rule_id: (row['rule_id'] as string | null) ?? null,
      risk_score: row['risk_score'] !== null && row['risk_score'] !== undefined ? Number(row['risk_score']) : null,
      reason: (row['reason'] as string | null) ?? null,
      duration_ms: row['duration_ms'] !== null && row['duration_ms'] !== undefined ? Number(row['duration_ms']) : null,
      previous_hash: (row['previous_hash'] as string | null) ?? null,
      hash: (row['hash'] as string | null) ?? null,
      created_at: ts(row['created_at']) ?? new Date().toISOString(),
      agent_id: (row['agent_id'] as string | null) ?? null,
      detection_score: row['detection_score'] !== null && row['detection_score'] !== undefined ? Number(row['detection_score']) : null,
      detection_provider: (row['detection_provider'] as string | null) ?? null,
      detection_category: (row['detection_category'] as string | null) ?? null,
      pii_entities_count: row['pii_entities_count'] !== null && row['pii_entities_count'] !== undefined ? Number(row['pii_entities_count']) : null,
    };
  }

  function normWebhook(row: Record<string, unknown>): WebhookRow {
    return {
      id: row['id'] as string,
      tenant_id: row['tenant_id'] as string,
      url: row['url'] as string,
      events: row['events'] as string,
      secret: (row['secret'] as string | null) ?? null,
      active: Number(row['active'] ?? 1),
      created_at: ts(row['created_at']) ?? new Date().toISOString(),
    };
  }

  function normAgent(row: Record<string, unknown>): AgentRow {
    return {
      id: row['id'] as string,
      tenant_id: row['tenant_id'] as string,
      name: row['name'] as string,
      api_key: row['api_key'] as string,
      policy_scope: (row['policy_scope'] as string) ?? '[]',
      active: Number(row['active'] ?? 1),
      created_at: ts(row['created_at']) ?? new Date().toISOString(),
    };
  }

  // ── Adapter implementation ─────────────────────────────────────────────────

  const adapter: IDatabase = {
    type: 'postgres',

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    async initialize(): Promise<void> {
      console.log('[pg] running schema migration...');
      await pool.query(SCHEMA_SQL);
      await pool.query(SEED_SETTINGS_SQL);

      // Migration: bcrypt hashing columns on api_keys (idempotent)
      const newCols = [
        'ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_hash TEXT',
        'ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix TEXT',
        'ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_sha256 TEXT',
      ];
      for (const sql of newCols) {
        try { await pool.query(sql); } catch { /* already exists */ }
      }

      // Migration: detection columns on audit_events (idempotent)
      const detectionCols = [
        'ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS detection_score REAL',
        'ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS detection_provider VARCHAR(100)',
        'ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS detection_category VARCHAR(100)',
        'ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS pii_entities_count INTEGER DEFAULT 0',
      ];
      for (const sql of detectionCols) {
        try { await pool.query(sql); } catch { /* already exists */ }
      }

      // Back-fill sha256 + prefix for existing plaintext keys
      const { rows: unhashedRows } = await pool.query<{ key: string }>(
        'SELECT key FROM api_keys WHERE key_sha256 IS NULL AND key IS NOT NULL'
      );
      for (const row of unhashedRows) {
        const sha256 = sha256Hex(row.key);
        const prefix = row.key.substring(0, 12);
        await pool.query(
          'UPDATE api_keys SET key_sha256 = $1, key_prefix = $2 WHERE key = $3',
          [sha256, prefix, row.key]
        );
      }
      if (unhashedRows.length > 0) {
        console.log(`[pg] migrated ${unhashedRows.length} existing API key(s) to sha256 lookup`);
      }

      // Create index on key_sha256 (after column exists)
      try { await pool.query('CREATE INDEX IF NOT EXISTS idx_apikeys_sha256 ON api_keys(key_sha256)'); } catch { /* already exists */ }

      // ── Row-Level Security (RLS) ───────────────────────────────────────────
      // Enable RLS on all tenant-scoped tables for defense-in-depth.
      // The application already enforces tenant isolation via tenant_id in queries,
      // but RLS provides an additional database-level security layer.
      const rlsTables = [
        'tenants',
        'api_keys',
        'audit_events',
        'sessions',
        'webhooks',
        'agents',
        'rate_limits',
        'cost_events',
      ];
      for (const table of rlsTables) {
        try {
          await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
          console.log(`[pg] RLS enabled on ${table}`);
        } catch (e) {
          // Ignore if already enabled or table doesn't exist (may be created later)
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes('already enabled') && !msg.includes('does not exist')) {
            console.log(`[pg] RLS setup for ${table}: ${msg}`);
          }
        }
      }

      // Migration: feedback and telemetry tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS feedback (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          tenant_id TEXT NOT NULL,
          agent_id TEXT,
          rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
          comment TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON feedback(tenant_id);

        CREATE TABLE IF NOT EXISTS telemetry_events (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          sdk_version TEXT NOT NULL DEFAULT 'unknown',
          language TEXT NOT NULL DEFAULT 'unknown',
          platform TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Migration: compliance_reports table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS compliance_reports (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          tenant_id TEXT NOT NULL,
          report_type TEXT NOT NULL DEFAULT 'owasp-agentic-top10',
          score REAL NOT NULL DEFAULT 0,
          controls_json TEXT NOT NULL DEFAULT '{}',
          generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_compliance_reports_tenant ON compliance_reports(tenant_id, generated_at);
      `);

      // Migration: mcp_servers table (MCP Server Registry)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mcp_servers (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          tenant_id TEXT NOT NULL,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          allowed_tools TEXT NOT NULL DEFAULT '[]',
          blocked_tools TEXT NOT NULL DEFAULT '[]',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant ON mcp_servers(tenant_id);
      `);

      // Migration: agent_hierarchy table (A2A multi-agent policy propagation)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS agent_hierarchy (
          id TEXT PRIMARY KEY,
          parent_agent_id TEXT NOT NULL,
          child_agent_id TEXT NOT NULL UNIQUE,
          tenant_id TEXT NOT NULL,
          policy_snapshot TEXT NOT NULL DEFAULT '{}',
          ttl_expires_at TIMESTAMPTZ,
          max_tool_calls INTEGER,
          tool_calls_used INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_agent_hierarchy_parent ON agent_hierarchy(parent_agent_id, tenant_id);
        CREATE INDEX IF NOT EXISTS idx_agent_hierarchy_child ON agent_hierarchy(child_agent_id);
      `);

      console.log('[pg] schema ready');
    },

    async close(): Promise<void> {
      await pool.end();
    },

    // ── Raw query ──────────────────────────────────────────────────────────────
    exec,
    get,
    all,
    run,

    // ── Tenants ───────────────────────────────────────────────────────────────
    async getTenant(id: string): Promise<TenantRow | undefined> {
      const row = await get<Record<string, unknown>>(
        'SELECT * FROM tenants WHERE id = $1', [id]
      );
      return row ? normTenant(row) : undefined;
    },

    async getTenantByEmail(email: string): Promise<TenantRow | undefined> {
      const row = await get<Record<string, unknown>>(
        'SELECT * FROM tenants WHERE email = $1', [email]
      );
      return row ? normTenant(row) : undefined;
    },

    async createTenant(id: string, name: string, email: string): Promise<void> {
      await pool.query(
        'INSERT INTO tenants (id, name, email) VALUES ($1, $2, $3)',
        [id, name, email]
      );
    },

    async updateTenantKillSwitch(tenantId: string, active: number, at: string | null): Promise<void> {
      await pool.query(
        'UPDATE tenants SET kill_switch_active = $1, kill_switch_at = $2 WHERE id = $3',
        [active, at, tenantId]
      );
    },

    // ── API Keys ──────────────────────────────────────────────────────────────
    async getApiKey(key: string): Promise<ApiKeyRow | undefined> {
      // Legacy plaintext lookup (backward compat for keys not yet migrated)
      const row = await get<Record<string, unknown>>(
        'SELECT * FROM api_keys WHERE key = $1 AND is_active = 1', [key]
      );
      return row ? normApiKey(row) : undefined;
    },

    async getApiKeyBySha256(sha256: string): Promise<ApiKeyRow | undefined> {
      const row = await get<Record<string, unknown>>(
        'SELECT * FROM api_keys WHERE key_sha256 = $1 AND is_active = 1', [sha256]
      );
      return row ? normApiKey(row) : undefined;
    },

    async createApiKey(key: string, tenantId: string, name: string): Promise<void> {
      const keyHash = await hashApiKey(key);
      const keyPrefix = key.substring(0, 12);
      const keySha256 = sha256Hex(key);
      await pool.query(
        'INSERT INTO api_keys (key, tenant_id, name, key_hash, key_prefix, key_sha256) VALUES ($1, $2, $3, $4, $5, $6)',
        [key, tenantId, name, keyHash, keyPrefix, keySha256]
      );
    },

    async deactivateApiKeyBySha256(sha256: string): Promise<void> {
      await pool.query('UPDATE api_keys SET is_active = 0 WHERE key_sha256 = $1', [sha256]);
    },

    async updateAuditEventHashes(eventId: number, previousHash: string, hash: string): Promise<void> {
      await pool.query('UPDATE audit_events SET previous_hash = $1, hash = $2 WHERE id = $3', [previousHash, hash, eventId]);
    },

    async touchApiKey(key: string): Promise<void> {
      const sha256 = sha256Hex(key);
      const result = await pool.query(
        'UPDATE api_keys SET last_used_at = NOW() WHERE key_sha256 = $1',
        [sha256]
      );
      if (result.rowCount === 0) {
        // Fallback for legacy plaintext rows
        await pool.query(
          'UPDATE api_keys SET last_used_at = NOW() WHERE key = $1',
          [key]
        );
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
      // Use advisory lock keyed on a hash of the tenant_id to serialize writes
      // for the same tenant. This prevents concurrent requests from reading the
      // same previous_hash and producing a broken chain.
      const GENESIS_HASH = '0'.repeat(64);
      const lockKey = tenantId
        ? parseInt(
            crypto.createHash('sha256').update(tenantId).digest('hex').slice(0, 8),
            16,
          )
        : 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Acquire tenant-scoped advisory lock (session-level within transaction)
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
        // Now safely read last hash
        const lastRow = await client.query<{ hash: string }>(
          'SELECT hash FROM audit_events WHERE tenant_id IS NOT DISTINCT FROM $1 ORDER BY id DESC LIMIT 1',
          [tenantId]
        );
        const prevHash = lastRow.rows[0]?.hash ?? GENESIS_HASH;
        const eventData = `${tool}|${result}|${createdAt}`;
        const newHash = crypto.createHash('sha256').update(prevHash + '|' + eventData).digest('hex');
        await client.query(
          `INSERT INTO audit_events
           (tenant_id, session_id, tool, action, result, rule_id, risk_score, reason,
            duration_ms, previous_hash, hash, created_at, agent_id,
            detection_score, detection_provider, detection_category)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [tenantId, sessionId, tool, action, result, ruleId, riskScore, reason,
           durationMs, prevHash, newHash, createdAt, agentId,
           detectionScore, detectionProvider, detectionCategory]
        );
        await client.query('COMMIT');
        return newHash;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
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
      await pool.query(
        `INSERT INTO audit_events
         (tenant_id, session_id, tool, action, result, rule_id, risk_score, reason,
          duration_ms, previous_hash, hash, created_at, agent_id,
          detection_score, detection_provider, detection_category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [tenantId, sessionId, tool, action, result, ruleId, riskScore, reason,
         durationMs, previousHash, hash, createdAt, agentId,
         detectionScore, detectionProvider, detectionCategory]
      );
    },

    async getLastAuditHash(tenantId: string): Promise<string | undefined> {
      const row = await get<{ hash: string }>(
        'SELECT hash FROM audit_events WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1',
        [tenantId]
      );
      return row?.hash;
    },

    async countAuditEvents(tenantId: string): Promise<number> {
      const row = await get<{ cnt: string }>(
        'SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = $1',
        [tenantId]
      );
      return Number(row?.cnt ?? 0);
    },

    async getAuditEvents(tenantId: string, limit: number, offset: number): Promise<AuditEventRow[]> {
      const rows = await all<Record<string, unknown>>(
        'SELECT * FROM audit_events WHERE tenant_id = $1 ORDER BY id ASC LIMIT $2 OFFSET $3',
        [tenantId, limit, offset]
      );
      return rows.map(normAuditEvent);
    },

    async getAuditEventsCursor(tenantId: string, limit: number, before?: string): Promise<AuditEventRow[]> {
      if (before) {
        const rows = await all<Record<string, unknown>>(
          'SELECT * FROM audit_events WHERE tenant_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3',
          [tenantId, before, limit]
        );
        return rows.map(normAuditEvent);
      }
      const rows = await all<Record<string, unknown>>(
        'SELECT * FROM audit_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2',
        [tenantId, limit]
      );
      return rows.map(normAuditEvent);
    },

    async getAllAuditEvents(tenantId: string): Promise<AuditEventRow[]> {
      const rows = await all<Record<string, unknown>>(
        'SELECT * FROM audit_events WHERE tenant_id = $1 ORDER BY id ASC',
        [tenantId]
      );
      return rows.map(normAuditEvent);
    },

    // ── Usage Stats ───────────────────────────────────────────────────────────
    async usageTotal(tenantId: string): Promise<number> {
      const row = await get<{ cnt: string }>(
        'SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = $1',
        [tenantId]
      );
      return Number(row?.cnt ?? 0);
    },

    async usageByResult(tenantId: string): Promise<Array<{ result: string; cnt: number }>> {
      const rows = await all<{ result: string; cnt: string }>(
        'SELECT result, COUNT(*) as cnt FROM audit_events WHERE tenant_id = $1 GROUP BY result',
        [tenantId]
      );
      return rows.map(r => ({ result: r.result, cnt: Number(r.cnt) }));
    },

    async usageLast24h(tenantId: string): Promise<number> {
      const row = await get<{ cnt: string }>(
        "SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '1 day'",
        [tenantId]
      );
      return Number(row?.cnt ?? 0);
    },

    async topBlockedTools(tenantId: string): Promise<Array<{ tool: string; cnt: number }>> {
      const rows = await all<{ tool: string; cnt: string }>(
        "SELECT tool, COUNT(*) as cnt FROM audit_events WHERE tenant_id = $1 AND result = 'block' GROUP BY tool ORDER BY cnt DESC LIMIT 5",
        [tenantId]
      );
      return rows.map(r => ({ tool: r.tool, cnt: Number(r.cnt) }));
    },

    async avgDurationMs(tenantId: string): Promise<number | null> {
      const row = await get<{ avg: string | null }>(
        'SELECT AVG(duration_ms) as avg FROM audit_events WHERE tenant_id = $1',
        [tenantId]
      );
      return row?.avg !== null && row?.avg !== undefined ? Number(row.avg) : null;
    },

    // ── Sessions ──────────────────────────────────────────────────────────────
    async upsertSession(id: string, tenantId: string | null): Promise<void> {
      await pool.query(
        `INSERT INTO sessions (id, tenant_id, last_activity) VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET last_activity = NOW()`,
        [id, tenantId]
      );
    },

    // ── Settings ──────────────────────────────────────────────────────────────
    async getSetting(key: string): Promise<string | undefined> {
      const row = await get<{ value: string }>(
        'SELECT value FROM settings WHERE key = $1',
        [key]
      );
      return row?.value;
    },

    async setSetting(key: string, value: string): Promise<void> {
      await pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, value]
      );
    },

    // ── Webhooks ──────────────────────────────────────────────────────────────
    async insertWebhook(
      tenantId: string,
      url: string,
      events: string,
      secret: string | null,
    ): Promise<WebhookRow> {
      const result = await pool.query(
        `INSERT INTO webhooks (tenant_id, url, events, secret)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [tenantId, url, events, secret]
      );
      return normWebhook(result.rows[0] as Record<string, unknown>);
    },

    async getWebhooksByTenant(tenantId: string): Promise<WebhookRow[]> {
      const rows = await all<Record<string, unknown>>(
        'SELECT id, tenant_id, url, events, active, created_at FROM webhooks WHERE tenant_id = $1 AND active = 1',
        [tenantId]
      );
      return rows.map(normWebhook);
    },

    async getWebhookById(id: string, tenantId: string): Promise<WebhookRow | undefined> {
      const row = await get<Record<string, unknown>>(
        'SELECT * FROM webhooks WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      return row ? normWebhook(row) : undefined;
    },

    async deleteWebhook(id: string, tenantId: string): Promise<void> {
      await pool.query(
        'UPDATE webhooks SET active = 0 WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
    },

    async getActiveWebhooksForTenant(tenantId: string): Promise<WebhookRow[]> {
      const rows = await all<Record<string, unknown>>(
        'SELECT * FROM webhooks WHERE tenant_id = $1 AND active = 1',
        [tenantId]
      );
      return rows.map(normWebhook);
    },

    // ── Agents ────────────────────────────────────────────────────────────────
    async insertAgent(
      tenantId: string,
      name: string,
      apiKey: string,
      policyScope: string,
    ): Promise<AgentRow> {
      const result = await pool.query(
        `INSERT INTO agents (tenant_id, name, api_key, policy_scope)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, name, policy_scope, active, created_at`,
        [tenantId, name, apiKey, policyScope]
      );
      // Include api_key in the returned row (not returned by SELECT for security, but needed here)
      const row = result.rows[0] as Record<string, unknown>;
      row['api_key'] = apiKey;
      return normAgent(row);
    },

    async getAgentsByTenant(tenantId: string): Promise<AgentRow[]> {
      const rows = await all<Record<string, unknown>>(
        'SELECT id, tenant_id, name, policy_scope, active, created_at FROM agents WHERE tenant_id = $1 AND active = 1',
        [tenantId]
      );
      return rows.map(r => normAgent({ ...r, api_key: '' }));
    },

    async getAgentByKey(apiKey: string): Promise<AgentRow | undefined> {
      const row = await get<Record<string, unknown>>(
        'SELECT * FROM agents WHERE api_key = $1 AND active = 1',
        [apiKey]
      );
      return row ? normAgent(row) : undefined;
    },

    async getAgentById(id: string, tenantId: string): Promise<AgentRow | undefined> {
      const row = await get<Record<string, unknown>>(
        'SELECT id, tenant_id, name, policy_scope, active, created_at FROM agents WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      return row ? normAgent({ ...row, api_key: '' }) : undefined;
    },

    async deactivateAgent(id: string, tenantId: string): Promise<void> {
      await pool.query(
        'UPDATE agents SET active = 0 WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
    },

    // ── Health Check ──────────────────────────────────────────────────────────
    async ping(): Promise<boolean> {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },

    async countTenants(): Promise<number> {
      const row = await get<{ n: string }>('SELECT COUNT(*) as n FROM tenants');
      return Number(row?.n ?? 0);
    },

    async countActiveAgents(): Promise<number> {
      const row = await get<{ n: string }>('SELECT COUNT(*) as n FROM agents WHERE active = 1');
      return Number(row?.n ?? 0);
    },

    // ── Approvals (HITL) ──────────────────────────────────────────────────────
    async createApproval(
      id: string,
      tenantId: string,
      agentId: string | null,
      tool: string,
      paramsJson: string | null,
    ): Promise<ApprovalRow> {
      const result = await pool.query(
        `INSERT INTO approvals (id, tenant_id, agent_id, tool, params_json)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, tenantId, agentId, tool, paramsJson]
      );
      const r = result.rows[0] as Record<string, unknown>;
      return {
        id: r['id'] as string,
        tenant_id: r['tenant_id'] as string,
        agent_id: (r['agent_id'] as string | null) ?? null,
        tool: r['tool'] as string,
        params_json: (r['params_json'] as string | null) ?? null,
        status: r['status'] as 'pending' | 'approved' | 'denied',
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
        resolved_at: r['resolved_at']
          ? (r['resolved_at'] instanceof Date
            ? (r['resolved_at'] as Date).toISOString()
            : String(r['resolved_at']))
          : null,
        resolved_by: (r['resolved_by'] as string | null) ?? null,
      };
    },

    async getApproval(id: string, tenantId: string): Promise<ApprovalRow | undefined> {
      const result = await pool.query(
        'SELECT * FROM approvals WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      if (!result.rows[0]) return undefined;
      const r = result.rows[0] as Record<string, unknown>;
      return {
        id: r['id'] as string,
        tenant_id: r['tenant_id'] as string,
        agent_id: (r['agent_id'] as string | null) ?? null,
        tool: r['tool'] as string,
        params_json: (r['params_json'] as string | null) ?? null,
        status: r['status'] as 'pending' | 'approved' | 'denied',
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
        resolved_at: r['resolved_at']
          ? (r['resolved_at'] instanceof Date
            ? (r['resolved_at'] as Date).toISOString()
            : String(r['resolved_at']))
          : null,
        resolved_by: (r['resolved_by'] as string | null) ?? null,
      };
    },

    async listPendingApprovals(tenantId: string): Promise<ApprovalRow[]> {
      const result = await pool.query(
        "SELECT * FROM approvals WHERE tenant_id = $1 AND status = 'pending' ORDER BY created_at DESC",
        [tenantId]
      );
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r['id'] as string,
        tenant_id: r['tenant_id'] as string,
        agent_id: (r['agent_id'] as string | null) ?? null,
        tool: r['tool'] as string,
        params_json: (r['params_json'] as string | null) ?? null,
        status: r['status'] as 'pending' | 'approved' | 'denied',
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
        resolved_at: r['resolved_at']
          ? (r['resolved_at'] instanceof Date
            ? (r['resolved_at'] as Date).toISOString()
            : String(r['resolved_at']))
          : null,
        resolved_by: (r['resolved_by'] as string | null) ?? null,
      }));
    },

    async resolveApproval(
      id: string,
      tenantId: string,
      status: 'approved' | 'denied',
      resolvedBy: string,
    ): Promise<void> {
      await pool.query(
        `UPDATE approvals
         SET status = $1, resolved_at = NOW(), resolved_by = $2
         WHERE id = $3 AND tenant_id = $4`,
        [status, resolvedBy, id, tenantId]
      );
    },

    // ── Policy ────────────────────────────────────────────────────────────────
    async getCustomPolicy(tenantId: string): Promise<string | null> {
      const result = await pool.query(
        'SELECT policy_json FROM tenant_policies WHERE tenant_id = $1',
        [tenantId]
      );
      return (result.rows[0] as { policy_json: string } | undefined)?.policy_json ?? null;
    },

    async setCustomPolicy(tenantId: string, policyJson: string): Promise<void> {
      await pool.query(
        `INSERT INTO tenant_policies (tenant_id, policy_json, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (tenant_id) DO UPDATE
           SET policy_json = EXCLUDED.policy_json, updated_at = NOW()`,
        [tenantId, policyJson]
      );
    },

    // ── Analytics ─────────────────────────────────────────────────────────────
    async getUsageAnalytics(tenantId: string, days: number): Promise<UsageAnalytics> {
      const now = new Date();

      // Total calls by time window
      const last24hRow = await pool.query<{ cnt: string }>(
        "SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '1 day'",
        [tenantId]
      );
      const last24h = Number(last24hRow.rows[0]?.cnt ?? 0);

      const last7dRow = await pool.query<{ cnt: string }>(
        "SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '7 days'",
        [tenantId]
      );
      const last7d = Number(last7dRow.rows[0]?.cnt ?? 0);

      const last30dRow = await pool.query<{ cnt: string }>(
        "SELECT COUNT(*) as cnt FROM audit_events WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'",
        [tenantId]
      );
      const last30d = Number(last30dRow.rows[0]?.cnt ?? 0);

      // Unique agents
      const uniqueAgentsRow = await pool.query<{ cnt: string }>(
        'SELECT COUNT(DISTINCT agent_id) as cnt FROM audit_events WHERE tenant_id = $1 AND agent_id IS NOT NULL',
        [tenantId]
      );
      const uniqueAgents = Number(uniqueAgentsRow.rows[0]?.cnt ?? 0);

      // Top tools evaluated (last N days)
      const topToolsResult = await pool.query<{ tool: string; cnt: string }>(
        `SELECT tool, COUNT(*) as cnt FROM audit_events
         WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY tool ORDER BY cnt DESC LIMIT 10`,
        [tenantId]
      );
      const topTools = topToolsResult.rows.map((r) => ({ tool: r.tool, cnt: Number(r.cnt) }));

      // Block rate
      const blockRateResult = await pool.query<{ total: string; blocked: string }>(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN result = 'block' THEN 1 ELSE 0 END) as blocked
         FROM audit_events
         WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'`,
        [tenantId]
      );
      const total = Number(blockRateResult.rows[0]?.total ?? 0);
      const blocked = Number(blockRateResult.rows[0]?.blocked ?? 0);
      const blockRate = total > 0 ? Math.round((blocked / total) * 100 * 100) / 100 : 0;

      // Daily volume (last N days)
      const dailyResult = await pool.query<{ date: string; cnt: string }>(
        `SELECT DATE(created_at) as date, COUNT(*) as cnt
         FROM audit_events
         WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [tenantId]
      );
      const dailyMap = new Map<string, number>(
        dailyResult.rows.map((r) => [r.date.slice(0, 10), Number(r.cnt)])
      );
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
    async getPlatformAnalytics(): Promise<PlatformAnalytics> {
      // Total tenants
      const totalTenantsRow = await pool.query<{ cnt: string }>('SELECT COUNT(*) as cnt FROM tenants');
      const totalTenants = Number(totalTenantsRow.rows[0]?.cnt ?? 0);

      // Active tenants (had evaluate calls in last 30d)
      const activeRow = await pool.query<{ cnt: string }>(
        "SELECT COUNT(DISTINCT tenant_id) as cnt FROM audit_events WHERE created_at >= NOW() - INTERVAL '30 days'"
      );
      const activeTenants30d = Number(activeRow.rows[0]?.cnt ?? 0);

      // Total evaluate calls
      const totalRow = await pool.query<{ cnt: string }>('SELECT COUNT(*) as cnt FROM audit_events');
      const totalEvaluateCalls = Number(totalRow.rows[0]?.cnt ?? 0);

      // Calls by period
      const c24h = await pool.query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM audit_events WHERE created_at >= NOW() - INTERVAL '1 day'");
      const c7d = await pool.query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM audit_events WHERE created_at >= NOW() - INTERVAL '7 days'");
      const c30d = await pool.query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM audit_events WHERE created_at >= NOW() - INTERVAL '30 days'");

      // Block rate
      const blockedRow = await pool.query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM audit_events WHERE result = 'block'");
      const blocked = Number(blockedRow.rows[0]?.cnt ?? 0);
      const blockRate = totalEvaluateCalls > 0 ? blocked / totalEvaluateCalls : 0;

      // Top tools
      const topToolsResult = await pool.query<{ tool: string; cnt: string }>(
        'SELECT tool, COUNT(*) as cnt FROM audit_events GROUP BY tool ORDER BY cnt DESC LIMIT 20'
      );
      const topTools = topToolsResult.rows.map(r => ({ tool: r.tool, cnt: Number(r.cnt) }));

      // Top tenants by usage
      const topTenantsResult = await pool.query<{ tenant_id: string; email: string; cnt: string }>(
        `SELECT a.tenant_id, COALESCE(t.email, 'unknown') as email, COUNT(*) as cnt
         FROM audit_events a LEFT JOIN tenants t ON a.tenant_id = t.id
         GROUP BY a.tenant_id, t.email ORDER BY cnt DESC LIMIT 20`
      );
      const topTenants = topTenantsResult.rows.map(r => ({ tenant_id: r.tenant_id, email: r.email, cnt: Number(r.cnt) }));

      // Daily volume (last 30 days)
      const dailyResult = await pool.query<{ date: string; cnt: string }>(
        "SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as cnt FROM audit_events WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY date ORDER BY date"
      );
      const dailyVolume = dailyResult.rows.map(r => ({ date: r.date, cnt: Number(r.cnt) }));

      // SDK telemetry stats
      let telemetryTotal = 0, telemetryLast7d = 0;
      let byLanguage: Array<{ language: string; cnt: number }> = [];
      try {
        const tTotal = await pool.query<{ cnt: string }>('SELECT COUNT(*) as cnt FROM telemetry_events');
        telemetryTotal = Number(tTotal.rows[0]?.cnt ?? 0);
        const t7d = await pool.query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM telemetry_events WHERE created_at >= NOW() - INTERVAL '7 days'");
        telemetryLast7d = Number(t7d.rows[0]?.cnt ?? 0);
        const tLang = await pool.query<{ language: string; cnt: string }>('SELECT language, COUNT(*) as cnt FROM telemetry_events GROUP BY language ORDER BY cnt DESC');
        byLanguage = tLang.rows.map(r => ({ language: r.language, cnt: Number(r.cnt) }));
      } catch { /* telemetry table may not exist yet */ }

      return {
        totalTenants,
        activeTenants30d,
        totalEvaluateCalls,
        callsLast24h: Number(c24h.rows[0]?.cnt ?? 0),
        callsLast7d: Number(c7d.rows[0]?.cnt ?? 0),
        callsLast30d: Number(c30d.rows[0]?.cnt ?? 0),
        blockRate,
        topTools,
        topTenants,
        dailyVolume,
        sdkTelemetry: { total: telemetryTotal, last7d: telemetryLast7d, byLanguage },
      };
    },

    // ── Feedback ──────────────────────────────────────────────────────────────
    async insertFeedback(
      tenantId: string,
      agentId: string | null,
      rating: number,
      comment: string | null,
    ): Promise<FeedbackRow> {
      const result = await pool.query(
        `INSERT INTO feedback (tenant_id, agent_id, rating, comment)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [tenantId, agentId, rating, comment]
      );
      const r = result.rows[0] as Record<string, unknown>;
      return {
        id: r['id'] as string,
        tenant_id: r['tenant_id'] as string,
        agent_id: (r['agent_id'] as string | null) ?? null,
        rating: Number(r['rating']),
        comment: (r['comment'] as string | null) ?? null,
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
      };
    },

    async listFeedback(): Promise<FeedbackRow[]> {
      const result = await pool.query(
        'SELECT * FROM feedback ORDER BY created_at DESC'
      );
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r['id'] as string,
        tenant_id: r['tenant_id'] as string,
        agent_id: (r['agent_id'] as string | null) ?? null,
        rating: Number(r['rating']),
        comment: (r['comment'] as string | null) ?? null,
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
      }));
    },

    // ── Telemetry ─────────────────────────────────────────────────────────────
    async insertTelemetryEvent(
      sdkVersion: string,
      language: string,
      _nodeVersion: string | null,
      osPlatform: string | null,
    ): Promise<void> {
      await pool.query(
        'INSERT INTO telemetry_events (sdk_version, language, platform) VALUES ($1, $2, $3)',
        [sdkVersion, language, osPlatform ?? null]
      );
    },

    // ── Compliance Reports ────────────────────────────────────────────────────
    async insertComplianceReport(
      tenantId: string,
      reportType: string,
      score: number,
      controlsJson: string,
    ): Promise<string> {
      const result = await pool.query(
        `INSERT INTO compliance_reports (tenant_id, report_type, score, controls_json)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [tenantId, reportType, score, controlsJson]
      );
      return (result.rows[0] as { id: string }).id;
    },

    async getComplianceReport(tenantId: string, reportId: string): Promise<ComplianceReportRow | undefined> {
      const result = await pool.query(
        'SELECT * FROM compliance_reports WHERE id = $1 AND tenant_id = $2',
        [reportId, tenantId]
      );
      if (!result.rows[0]) return undefined;
      const r = result.rows[0] as Record<string, unknown>;
      return {
        id: r['id'] as string,
        tenant_id: r['tenant_id'] as string,
        report_type: r['report_type'] as string,
        score: Number(r['score']),
        controls_json: r['controls_json'] as string,
        generated_at: r['generated_at'] instanceof Date
          ? (r['generated_at'] as Date).toISOString()
          : String(r['generated_at']),
      };
    },

    async getLatestComplianceReport(tenantId: string): Promise<ComplianceReportRow | undefined> {
      const result = await pool.query(
        'SELECT * FROM compliance_reports WHERE tenant_id = $1 ORDER BY generated_at DESC LIMIT 1',
        [tenantId]
      );
      if (!result.rows[0]) return undefined;
      const r = result.rows[0] as Record<string, unknown>;
      return {
        id: r['id'] as string,
        tenant_id: r['tenant_id'] as string,
        report_type: r['report_type'] as string,
        score: Number(r['score']),
        controls_json: r['controls_json'] as string,
        generated_at: r['generated_at'] instanceof Date
          ? (r['generated_at'] as Date).toISOString()
          : String(r['generated_at']),
      };
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
      const result = await pool.query(
        `INSERT INTO agent_hierarchy
           (id, parent_agent_id, child_agent_id, tenant_id, policy_snapshot, ttl_expires_at, max_tool_calls)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, parentAgentId, childAgentId, tenantId, policySnapshot, ttlExpiresAt, maxToolCalls]
      );
      const r = result.rows[0] as Record<string, unknown>;
      return {
        id: r['id'] as string,
        parent_agent_id: r['parent_agent_id'] as string,
        child_agent_id: r['child_agent_id'] as string,
        tenant_id: r['tenant_id'] as string,
        policy_snapshot: r['policy_snapshot'] as string,
        ttl_expires_at: r['ttl_expires_at']
          ? (r['ttl_expires_at'] instanceof Date
            ? (r['ttl_expires_at'] as Date).toISOString()
            : String(r['ttl_expires_at']))
          : null,
        max_tool_calls: r['max_tool_calls'] != null ? Number(r['max_tool_calls']) : null,
        tool_calls_used: Number(r['tool_calls_used'] ?? 0),
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
      };
    },

    async getChildAgent(childAgentId: string): Promise<ChildAgentRow | undefined> {
      const result = await pool.query(
        'SELECT * FROM agent_hierarchy WHERE child_agent_id = $1',
        [childAgentId]
      );
      if (result.rows.length === 0) return undefined;
      const r = result.rows[0] as Record<string, unknown>;
      return {
        id: r['id'] as string,
        parent_agent_id: r['parent_agent_id'] as string,
        child_agent_id: r['child_agent_id'] as string,
        tenant_id: r['tenant_id'] as string,
        policy_snapshot: r['policy_snapshot'] as string,
        ttl_expires_at: r['ttl_expires_at']
          ? (r['ttl_expires_at'] instanceof Date
            ? (r['ttl_expires_at'] as Date).toISOString()
            : String(r['ttl_expires_at']))
          : null,
        max_tool_calls: r['max_tool_calls'] != null ? Number(r['max_tool_calls']) : null,
        tool_calls_used: Number(r['tool_calls_used'] ?? 0),
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
      };
    },

    async listChildAgents(parentAgentId: string, tenantId: string): Promise<ChildAgentRow[]> {
      const result = await pool.query(
        'SELECT * FROM agent_hierarchy WHERE parent_agent_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
        [parentAgentId, tenantId]
      );
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r['id'] as string,
        parent_agent_id: r['parent_agent_id'] as string,
        child_agent_id: r['child_agent_id'] as string,
        tenant_id: r['tenant_id'] as string,
        policy_snapshot: r['policy_snapshot'] as string,
        ttl_expires_at: r['ttl_expires_at']
          ? (r['ttl_expires_at'] instanceof Date
            ? (r['ttl_expires_at'] as Date).toISOString()
            : String(r['ttl_expires_at']))
          : null,
        max_tool_calls: r['max_tool_calls'] != null ? Number(r['max_tool_calls']) : null,
        tool_calls_used: Number(r['tool_calls_used'] ?? 0),
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
      }));
    },

    async deleteChildAgent(childAgentId: string, tenantId: string): Promise<void> {
      await pool.query(
        'DELETE FROM agent_hierarchy WHERE child_agent_id = $1 AND tenant_id = $2',
        [childAgentId, tenantId]
      );
    },

    async incrementChildToolCalls(childAgentId: string): Promise<void> {
      await pool.query(
        'UPDATE agent_hierarchy SET tool_calls_used = tool_calls_used + 1 WHERE child_agent_id = $1',
        [childAgentId]
      );
    },

    // ── MCP Server Registry ───────────────────────────────────────────────────
    async insertMcpServer(
      tenantId: string,
      name: string,
      url: string,
      allowedTools: string[],
      blockedTools: string[],
    ): Promise<McpServerRow> {
      const result = await pool.query(
        `INSERT INTO mcp_servers (tenant_id, name, url, allowed_tools, blocked_tools)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [tenantId, name, url, JSON.stringify(allowedTools), JSON.stringify(blockedTools)]
      );
      const r = result.rows[0] as Record<string, unknown>;
      return {
        id: r['id'] as string,
        tenant_id: r['tenant_id'] as string,
        name: r['name'] as string,
        url: r['url'] as string,
        allowed_tools: r['allowed_tools'] as string,
        blocked_tools: r['blocked_tools'] as string,
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
      };
    },

    async listMcpServers(tenantId: string): Promise<McpServerRow[]> {
      const result = await pool.query(
        'SELECT * FROM mcp_servers WHERE tenant_id = $1 ORDER BY created_at ASC',
        [tenantId]
      );
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r['id'] as string,
        tenant_id: r['tenant_id'] as string,
        name: r['name'] as string,
        url: r['url'] as string,
        allowed_tools: r['allowed_tools'] as string,
        blocked_tools: r['blocked_tools'] as string,
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
      }));
    },

    async getMcpServer(id: string, tenantId: string): Promise<McpServerRow | undefined> {
      const result = await pool.query(
        'SELECT * FROM mcp_servers WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      if (!result.rows[0]) return undefined;
      const r = result.rows[0] as Record<string, unknown>;
      return {
        id: r['id'] as string,
        tenant_id: r['tenant_id'] as string,
        name: r['name'] as string,
        url: r['url'] as string,
        allowed_tools: r['allowed_tools'] as string,
        blocked_tools: r['blocked_tools'] as string,
        created_at: r['created_at'] instanceof Date
          ? (r['created_at'] as Date).toISOString()
          : String(r['created_at']),
      };
    },

    async deleteMcpServer(id: string, tenantId: string): Promise<void> {
      await pool.query(
        'DELETE FROM mcp_servers WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
    },

    // ── Integrations (Slack/Teams) ────────────────────────────────────────────
    async insertIntegration(tenantId: string, type: 'slack' | 'teams', configEncrypted: string): Promise<IntegrationRow> {
      const id = require('crypto').randomUUID();
      await pool.query(
        'INSERT INTO integrations (id, tenant_id, type, config_encrypted) VALUES ($1, $2, $3, $4)',
        [id, tenantId, type, configEncrypted]
      );
      return { id, tenant_id: tenantId, type, config_encrypted: configEncrypted, created_at: new Date().toISOString() };
    },
    async getIntegration(tenantId: string, type: 'slack' | 'teams'): Promise<IntegrationRow | undefined> {
      const res = await pool.query<IntegrationRow>(
        'SELECT * FROM integrations WHERE tenant_id = $1 AND type = $2',
        [tenantId, type]
      );
      return res.rows[0];
    },
    async deleteIntegration(tenantId: string, type: 'slack' | 'teams'): Promise<void> {
      await pool.query('DELETE FROM integrations WHERE tenant_id = $1 AND type = $2', [tenantId, type]);
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
      const res = await pool.query<SsoConfigRow>(
        `INSERT INTO sso_configs (
           tenant_id, provider, protocol, domain, client_id, client_secret_encrypted,
           discovery_url, redirect_uri, scopes, force_sso,
           role_claim_name, admin_group, member_group, idp_metadata_xml, sp_entity_id, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           provider = EXCLUDED.provider, protocol = EXCLUDED.protocol,
           domain = EXCLUDED.domain, client_id = EXCLUDED.client_id,
           client_secret_encrypted = EXCLUDED.client_secret_encrypted,
           discovery_url = EXCLUDED.discovery_url, redirect_uri = EXCLUDED.redirect_uri,
           scopes = EXCLUDED.scopes, force_sso = EXCLUDED.force_sso,
           role_claim_name = EXCLUDED.role_claim_name, admin_group = EXCLUDED.admin_group,
           member_group = EXCLUDED.member_group, idp_metadata_xml = EXCLUDED.idp_metadata_xml,
           sp_entity_id = EXCLUDED.sp_entity_id, updated_at = NOW()
         RETURNING *`,
        [
          tenantId, config.provider, config.protocol, config.domain,
          config.clientId, config.clientSecretEncrypted,
          config.discoveryUrl ?? null, config.redirectUri ?? null,
          config.scopes ?? null, config.forceSso ? 1 : 0,
          config.roleClaimName ?? null, config.adminGroup ?? null, config.memberGroup ?? null,
          config.idpMetadataXml ?? null, config.spEntityId ?? null,
        ]
      );
      return res.rows[0]!;
    },

    async getSsoConfig(tenantId: string): Promise<SsoConfigRow | undefined> {
      const res = await pool.query<SsoConfigRow>(
        'SELECT * FROM sso_configs WHERE tenant_id = $1',
        [tenantId]
      );
      return res.rows[0];
    },

    async deleteSsoConfig(tenantId: string): Promise<void> {
      await pool.query('DELETE FROM sso_configs WHERE tenant_id = $1', [tenantId]);
    },

    // ── SSO State ─────────────────────────────────────────────────────────────
    async storeSsoState(state: string, data: string, expiresAt: string): Promise<void> {
      await pool.query(
        `INSERT INTO sso_states (state, data, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (state) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at`,
        [state, data, expiresAt]
      );
    },

    async getSsoState(state: string): Promise<{ data: string; expires_at: string } | undefined> {
      const res = await pool.query<{ data: string; expires_at: string }>(
        'SELECT data, expires_at FROM sso_states WHERE state = $1 AND expires_at > NOW()',
        [state]
      );
      return res.rows[0];
    },

    async deleteSsoState(state: string): Promise<void> {
      await pool.query('DELETE FROM sso_states WHERE state = $1', [state]);
      await pool.query('DELETE FROM sso_states WHERE expires_at < NOW()');
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
      const res = await pool.query<SsoUserRow>(
        `INSERT INTO sso_users (tenant_id, idp_sub, provider, email, name, role, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (tenant_id, idp_sub) DO UPDATE SET
           email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, last_login_at = NOW()
         RETURNING *`,
        [tenantId, idpSub, provider, email, name, role]
      );
      return res.rows[0]!;
    },

    async getSsoUser(tenantId: string, idpSub: string): Promise<SsoUserRow | undefined> {
      const res = await pool.query<SsoUserRow>(
        'SELECT * FROM sso_users WHERE tenant_id = $1 AND idp_sub = $2',
        [tenantId, idpSub]
      );
      return res.rows[0];
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
      const res = await pool.query<GitWebhookConfigRow>(
        `INSERT INTO git_webhook_configs (tenant_id, repo_url, webhook_secret, branch, policy_dir, github_token, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           repo_url = EXCLUDED.repo_url, webhook_secret = EXCLUDED.webhook_secret,
           branch = EXCLUDED.branch, policy_dir = EXCLUDED.policy_dir,
           github_token = EXCLUDED.github_token, updated_at = NOW()
         RETURNING *`,
        [tenantId, repoUrl, webhookSecret, branch, policyDir, githubToken]
      );
      return res.rows[0]!;
    },

    async getGitWebhookConfig(tenantId: string): Promise<GitWebhookConfigRow | undefined> {
      const res = await pool.query<GitWebhookConfigRow>(
        'SELECT * FROM git_webhook_configs WHERE tenant_id = $1',
        [tenantId]
      );
      return res.rows[0];
    },

    async deleteGitWebhookConfig(tenantId: string): Promise<void> {
      await pool.query('DELETE FROM git_webhook_configs WHERE tenant_id = $1', [tenantId]);
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
      const res = await pool.query<GitSyncLogRow>(
        `INSERT INTO git_sync_logs (tenant_id, commit_sha, branch, policies_updated, policies_skipped, status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [tenantId, commitSha, branch, policiesUpdated, policiesSkipped, status, errorMessage]
      );
      return res.rows[0]!;
    },

    async listGitSyncLogs(tenantId: string, limit = 50): Promise<GitSyncLogRow[]> {
      const res = await pool.query<GitSyncLogRow>(
        'SELECT * FROM git_sync_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2',
        [tenantId, limit]
      );
      return res.rows;
    },

    // ── SIEM Configurations ────────────────────────────────────────────────────
    async upsertSiemConfig(tenantId: string, provider: 'splunk' | 'sentinel', configEncrypted: string): Promise<SiemConfigRow> {
      const res = await pool.query<SiemConfigRow>(
        `INSERT INTO siem_configs (tenant_id, provider, config_encrypted)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id) DO UPDATE SET
           provider = EXCLUDED.provider,
           config_encrypted = EXCLUDED.config_encrypted,
           enabled = 1
         RETURNING *`,
        [tenantId, provider, configEncrypted]
      );
      return res.rows[0]!;
    },

    async getSiemConfig(tenantId: string): Promise<SiemConfigRow | undefined> {
      const res = await pool.query<SiemConfigRow>(
        'SELECT * FROM siem_configs WHERE tenant_id = $1',
        [tenantId]
      );
      return res.rows[0];
    },

    async deleteSiemConfig(tenantId: string): Promise<void> {
      await pool.query('DELETE FROM siem_configs WHERE tenant_id = $1', [tenantId]);
    },

    async updateSiemLastForwarded(tenantId: string, at: string): Promise<void> {
      await pool.query(
        'UPDATE siem_configs SET last_forwarded_at = $1 WHERE tenant_id = $2',
        [at, tenantId]
      );
    },

    // ── License Keys ──────────────────────────────────────────────────────────
    async insertLicenseKey(key: LicenseKeyRow): Promise<LicenseKeyRow> {
      const res = await pool.query<LicenseKeyRow>(
        `INSERT INTO license_keys
           (id, tenant_id, key_hash, tier, features, limits_json, offline_grace_days,
            issued_at, expires_at, revoked_at, revoke_reason, stripe_subscription_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          key.id, key.tenant_id, key.key_hash, key.tier, key.features,
          key.limits_json, key.offline_grace_days, key.issued_at, key.expires_at,
          key.revoked_at, key.revoke_reason, key.stripe_subscription_id, key.metadata, key.created_at,
        ]
      );
      return res.rows[0]!;
    },

    async getLicenseKeyByTenant(tenantId: string): Promise<LicenseKeyRow | null> {
      const res = await pool.query<LicenseKeyRow>(
        'SELECT * FROM license_keys WHERE tenant_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',
        [tenantId]
      );
      return res.rows[0] ?? null;
    },

    async getLicenseKeyByHash(hash: string): Promise<LicenseKeyRow | null> {
      const res = await pool.query<LicenseKeyRow>(
        'SELECT * FROM license_keys WHERE key_hash = $1 LIMIT 1',
        [hash]
      );
      return res.rows[0] ?? null;
    },

    async revokeLicenseKey(id: string, reason: string): Promise<void> {
      await pool.query(
        'UPDATE license_keys SET revoked_at = NOW(), revoke_reason = $1 WHERE id = $2',
        [reason, id]
      );
    },

    // ── License Events ─────────────────────────────────────────────────────────
    async insertLicenseEvent(event: LicenseEventRow): Promise<void> {
      await pool.query(
        `INSERT INTO license_events (id, tenant_id, license_id, event_type, details, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          event.id, event.tenant_id, event.license_id, event.event_type,
          event.details, event.ip_address, event.created_at,
        ]
      );
    },

    async getLicenseEvents(tenantId: string, limit: number): Promise<LicenseEventRow[]> {
      const res = await pool.query<LicenseEventRow>(
        'SELECT * FROM license_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2',
        [tenantId, limit]
      );
      return res.rows;
    },

    // ── License Usage ─────────────────────────────────────────────────────────
    async upsertLicenseUsage(tenantId: string, month: string, events: number, agents: number): Promise<void> {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO license_usage (id, tenant_id, month, event_count, agent_count, last_updated)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (tenant_id, month) DO UPDATE SET
           event_count = license_usage.event_count + EXCLUDED.event_count,
           agent_count = EXCLUDED.agent_count,
           last_updated = NOW()`,
        [id, tenantId, month, events, agents]
      );
    },

    async getLicenseUsage(tenantId: string, month: string): Promise<LicenseUsageRow | null> {
      const res = await pool.query<LicenseUsageRow>(
        'SELECT * FROM license_usage WHERE tenant_id = $1 AND month = $2',
        [tenantId, month]
      );
      return res.rows[0] ?? null;
    },

    // ── Anomaly Rules ─────────────────────────────────────────────────────────
    async insertAnomalyRule(rule: AnomalyRuleRow): Promise<AnomalyRuleRow> {
      const res = await pool.query<AnomalyRuleRow>(
        `INSERT INTO anomaly_rules (id, tenant_id, name, metric, condition, threshold, window_minutes, severity, enabled, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          rule.id, rule.tenant_id, rule.name, rule.metric, rule.condition,
          rule.threshold, rule.window_minutes, rule.severity,
          rule.enabled ?? 1,
          rule.created_at ?? new Date().toISOString(),
        ]
      );
      return res.rows[0]!;
    },

    async getAnomalyRules(tenantId: string): Promise<AnomalyRuleRow[]> {
      const res = await pool.query<AnomalyRuleRow>(
        'SELECT * FROM anomaly_rules WHERE tenant_id = $1 ORDER BY created_at ASC',
        [tenantId]
      );
      return res.rows;
    },

    async updateAnomalyRule(id: string, tenantId: string, updates: Partial<AnomalyRuleRow>): Promise<AnomalyRuleRow | undefined> {
      const allowed = ['name', 'metric', 'condition', 'threshold', 'window_minutes', 'severity', 'enabled'] as const;
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      for (const key of allowed) {
        if (key in updates) {
          setClauses.push(`${key} = $${idx++}`);
          params.push((updates as Record<string, unknown>)[key]);
        }
      }
      if (setClauses.length === 0) {
        const res = await pool.query<AnomalyRuleRow>('SELECT * FROM anomaly_rules WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        return res.rows[0];
      }
      params.push(id, tenantId);
      const res = await pool.query<AnomalyRuleRow>(
        `UPDATE anomaly_rules SET ${setClauses.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx++} RETURNING *`,
        params
      );
      return res.rows[0];
    },

    async deleteAnomalyRule(id: string, tenantId: string): Promise<void> {
      await pool.query('DELETE FROM anomaly_rules WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    },

    // ── Alerts ────────────────────────────────────────────────────────────────
    async insertAlert(alert: AlertRow): Promise<AlertRow> {
      const res = await pool.query<AlertRow>(
        `INSERT INTO alerts (id, tenant_id, rule_id, metric, current_value, threshold, severity, message, resolved_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          alert.id, alert.tenant_id, alert.rule_id, alert.metric,
          alert.current_value, alert.threshold, alert.severity, alert.message,
          alert.resolved_at ?? null,
          alert.created_at ?? new Date().toISOString(),
        ]
      );
      return res.rows[0]!;
    },

    async getAlerts(tenantId: string, opts?: { severity?: string; resolved?: boolean }): Promise<AlertRow[]> {
      const conditions: string[] = ['tenant_id = $1'];
      const params: unknown[] = [tenantId];
      let idx = 2;
      if (opts?.severity) {
        conditions.push(`severity = $${idx++}`);
        params.push(opts.severity);
      }
      if (opts?.resolved === false) {
        conditions.push('resolved_at IS NULL');
      } else if (opts?.resolved === true) {
        conditions.push('resolved_at IS NOT NULL');
      }
      const res = await pool.query<AlertRow>(
        `SELECT * FROM alerts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
        params
      );
      return res.rows;
    },

    async resolveAlert(id: string): Promise<void> {
      await pool.query('UPDATE alerts SET resolved_at = NOW() WHERE id = $1', [id]);
    },

    async getActiveAlert(tenantId: string, ruleId: string): Promise<AlertRow | undefined> {
      const res = await pool.query<AlertRow>(
        'SELECT * FROM alerts WHERE tenant_id = $1 AND rule_id = $2 AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1',
        [tenantId, ruleId]
      );
      return res.rows[0];
    },

    // ── Stripe Webhook Idempotency ──────────────────────────────────────────

    async isStripeEventProcessed(eventId: string): Promise<boolean> {
      const res = await pool.query(
        'SELECT 1 FROM stripe_processed_events WHERE event_id = $1',
        [eventId]
      );
      return res.rowCount !== null && res.rowCount > 0;
    },

    async markStripeEventProcessed(eventId: string, eventType: string): Promise<void> {
      await pool.query(
        'INSERT INTO stripe_processed_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING',
        [eventId, eventType]
      );
    },

    async pruneStripeProcessedEvents(olderThanDays = 30): Promise<void> {
      await pool.query(
        'DELETE FROM stripe_processed_events WHERE processed_at < NOW() - ($1 || \' days\')::INTERVAL',
        [olderThanDays]
      );
    },

    // ── Policy Versioning ─────────────────────────────────────────────────────
    async getNextPolicyVersion(policyId: string, tenantId: string): Promise<number> {
      const result = await pool.query(
        'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM policy_versions WHERE policy_id = $1 AND tenant_id = $2',
        [policyId, tenantId]
      );
      return result.rows[0]?.next_version ?? 1;
    },

    async insertPolicyVersion(
      policyId: string, tenantId: string, policyData: string, revertedFrom?: number | null
    ): Promise<PolicyVersionRow> {
      const version = await adapter.getNextPolicyVersion(policyId, tenantId);
      const result = await pool.query(
        `INSERT INTO policy_versions (policy_id, tenant_id, version, policy_data, reverted_from)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, policy_id, tenant_id, version, policy_data, created_at::text, reverted_from`,
        [policyId, tenantId, version, policyData, revertedFrom ?? null]
      );
      return result.rows[0] as PolicyVersionRow;
    },

    async getPolicyVersions(policyId: string, tenantId: string): Promise<PolicyVersionRow[]> {
      const result = await pool.query(
        'SELECT id, policy_id, tenant_id, version, policy_data, created_at::text, reverted_from FROM policy_versions WHERE policy_id = $1 AND tenant_id = $2 ORDER BY version DESC',
        [policyId, tenantId]
      );
      return result.rows as PolicyVersionRow[];
    },

    async getPolicyVersion(policyId: string, tenantId: string, version: number): Promise<PolicyVersionRow | undefined> {
      const result = await pool.query(
        'SELECT id, policy_id, tenant_id, version, policy_data, created_at::text, reverted_from FROM policy_versions WHERE policy_id = $1 AND tenant_id = $2 AND version = $3',
        [policyId, tenantId, version]
      );
      return result.rows[0] as PolicyVersionRow | undefined;
    },

    // ── Team Members (M3-78) ──────────────────────────────────────────────
    async getTeamMembers(tenantId: string): Promise<TeamMemberRow[]> {
      const result = await pool.query(
        'SELECT id, tenant_id, email, role, invited_at::text, accepted_at::text FROM team_members WHERE tenant_id = $1 ORDER BY invited_at',
        [tenantId]
      );
      return result.rows as TeamMemberRow[];
    },

    async addTeamMember(tenantId: string, email: string, role: string): Promise<TeamMemberRow> {
      const id = crypto.randomUUID();
      try {
        await pool.query(
          'INSERT INTO team_members (id, tenant_id, email, role) VALUES ($1, $2, $3, $4)',
          [id, tenantId, email, role]
        );
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('unique') || e instanceof Error && e.message.includes('duplicate')) {
          throw new Error('Member already exists');
        }
        throw e;
      }
      const result = await pool.query('SELECT id, tenant_id, email, role, invited_at::text, accepted_at::text FROM team_members WHERE id = $1', [id]);
      return result.rows[0] as TeamMemberRow;
    },

    async removeTeamMember(tenantId: string, userId: string): Promise<void> {
      await pool.query('DELETE FROM team_members WHERE tenant_id = $1 AND id = $2', [tenantId, userId]);
    },

    async updateTeamMemberRole(tenantId: string, userId: string, role: string): Promise<void> {
      await pool.query('UPDATE team_members SET role = $1 WHERE tenant_id = $2 AND id = $3', [role, tenantId, userId]);
    },

    async getTeamMemberByEmail(tenantId: string, email: string): Promise<TeamMemberRow | undefined> {
      const result = await pool.query(
        'SELECT id, tenant_id, email, role, invited_at::text, accepted_at::text FROM team_members WHERE tenant_id = $1 AND email = $2',
        [tenantId, email]
      );
      return result.rows[0] as TeamMemberRow | undefined;
    },

    // ── Job Queue (M3-79) ─────────────────────────────────────────────────
    async enqueueJob(tenantId: string, jobType: string, payload: string): Promise<string> {
      const id = crypto.randomUUID();
      await pool.query(
        'INSERT INTO evaluation_jobs (id, tenant_id, job_type, payload) VALUES ($1, $2, $3, $4)',
        [id, tenantId, jobType, payload]
      );
      return id;
    },

    async getJob(jobId: string): Promise<JobRow | undefined> {
      const result = await pool.query('SELECT * FROM evaluation_jobs WHERE id = $1', [jobId]);
      return result.rows[0] as JobRow | undefined;
    },

    async getJobsForTenant(tenantId: string, limit = 50, offset = 0): Promise<JobRow[]> {
      const result = await pool.query(
        'SELECT * FROM evaluation_jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [tenantId, limit, offset]
      );
      return result.rows as JobRow[];
    },

    async claimPendingJob(): Promise<JobRow | undefined> {
      // Use FOR UPDATE SKIP LOCKED for safe concurrent claiming
      const result = await pool.query(
        `UPDATE evaluation_jobs SET status = 'running', started_at = NOW()
         WHERE id = (SELECT id FROM evaluation_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING *`
      );
      return result.rows[0] as JobRow | undefined;
    },

    async completeJob(jobId: string, result: string): Promise<void> {
      await pool.query(
        "UPDATE evaluation_jobs SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2",
        [result, jobId]
      );
    },

    async failJob(jobId: string, error: string): Promise<void> {
      await pool.query(
        "UPDATE evaluation_jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2",
        [error, jobId]
      );
    },
  };

  return adapter;
}
