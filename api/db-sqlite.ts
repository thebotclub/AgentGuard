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
import type {
  IDatabase,
  TenantRow,
  ApiKeyRow,
  AuditEventRow,
  WebhookRow,
  AgentRow,
} from './db-interface.js';

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

  CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_events(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_events(session_id);
  CREATE INDEX IF NOT EXISTS idx_apikeys_tenant ON api_keys(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_agents_key ON agents(api_key);
  CREATE INDEX IF NOT EXISTS idx_rate_limits_tenant ON rate_limits(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_cost_events_tenant ON cost_events(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_mcp_proxy_tenant ON mcp_proxy_configs(tenant_id);
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
      return getSync<ApiKeyRow>('SELECT * FROM api_keys WHERE key = ? AND is_active = 1', [key]);
    },

    async createApiKey(key: string, tenantId: string, name: string): Promise<void> {
      db.prepare('INSERT INTO api_keys (key, tenant_id, name) VALUES (?, ?, ?)').run(key, tenantId, name);
    },

    async touchApiKey(key: string): Promise<void> {
      db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE key = ?").run(key);
    },

    // ── Audit Events ──────────────────────────────────────────────────────────
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
    ): Promise<void> {
      db.prepare(
        `INSERT INTO audit_events
         (tenant_id, session_id, tool, action, result, rule_id, risk_score, reason,
          duration_ms, previous_hash, hash, created_at, agent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        tenantId, sessionId, tool, action, result, ruleId, riskScore, reason,
        durationMs, previousHash, hash, createdAt, agentId
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
      const row = db.prepare<[string, string, string, string]>(
        `INSERT INTO agents (tenant_id, name, api_key, policy_scope)
         VALUES (?, ?, ?, ?)
         RETURNING id, tenant_id, name, policy_scope, active, created_at`
      ).get(tenantId, name, apiKey, policyScope) as Record<string, unknown>;
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
  };

  return { adapter, raw: db };
}
