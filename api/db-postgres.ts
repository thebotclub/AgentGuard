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
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
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
      await pool.query(
        `INSERT INTO audit_events
         (tenant_id, session_id, tool, action, result, rule_id, risk_score, reason,
          duration_ms, previous_hash, hash, created_at, agent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [tenantId, sessionId, tool, action, result, ruleId, riskScore, reason,
         durationMs, previousHash, hash, createdAt, agentId]
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
  };

  return adapter;
}
