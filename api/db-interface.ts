/**
 * AgentGuard Database Interface
 *
 * Shared typed interface that both SQLite and PostgreSQL adapters implement.
 * All methods are async for maximum compatibility.
 */

// ── Row Types ──────────────────────────────────────────────────────────────

export interface TenantRow {
  id: string;
  name: string;
  email: string;
  plan: string;
  created_at: string;
  kill_switch_active: number;
  kill_switch_at: string | null;
}

export interface ApiKeyRow {
  key: string;
  tenant_id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: number;
  key_hash: string | null;
  key_prefix: string | null;
  key_sha256: string | null;
}

export interface AuditEventRow {
  id: number;
  tenant_id: string | null;
  session_id: string | null;
  tool: string;
  action: string | null;
  result: string;
  rule_id: string | null;
  risk_score: number | null;
  reason: string | null;
  duration_ms: number | null;
  previous_hash: string | null;
  hash: string | null;
  created_at: string;
  agent_id: string | null;
}

export interface SessionRow {
  id: string;
  tenant_id: string | null;
  created_at: string;
  last_activity: string | null;
}

export interface WebhookRow {
  id: string;
  tenant_id: string;
  url: string;
  events: string;
  secret: string | null;
  active: number;
  created_at: string;
}

export interface AgentRow {
  id: string;
  tenant_id: string;
  name: string;
  api_key: string;
  policy_scope: string;
  active: number;
  created_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
}

export interface RateLimitRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  window_seconds: number;
  max_requests: number;
  created_at: string;
}

export interface RateCounterRow {
  tenant_id: string;
  agent_id: string | null;
  window_start: number;
  count: number;
}

export interface CostEventRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  tool: string;
  estimated_cost_cents: number;
  currency: string;
  metadata: string | null;
  created_at: string;
}

export interface McpConfigRow {
  id: string;
  tenant_id: string;
  name: string;
  upstream_url: string;
  allowed_tools: string;
  blocked_tools: string;
  active: number;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  tool: string;
  params_json: string | null;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface FeedbackRow {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface TelemetryEventRow {
  id: string;
  sdk_version: string;
  language: string;
  platform: string | null;
  created_at: string;
}

export interface UsageAnalytics {
  calls: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
  uniqueAgents: number;
  topTools: Array<{ tool: string; cnt: number }>;
  blockRate: number;
  dailyVolume: Array<{ date: string; cnt: number }>;
}

// ── Count/Aggregate helpers ────────────────────────────────────────────────

export interface CountRow {
  cnt: number;
}

export interface AvgRow {
  avg: number | null;
}

// ── Database Interface ─────────────────────────────────────────────────────

export interface IDatabase {
  readonly type: 'sqlite' | 'postgres';

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  /** Initialize schema (create tables, run migrations) */
  initialize(): Promise<void>;
  /** Clean up connections */
  close(): Promise<void>;

  // ── Raw query (for places that still use raw SQL) ─────────────────────────
  /** Execute a SQL statement (no return value) */
  exec(sql: string, params?: unknown[]): Promise<void>;
  /** Execute and return first matching row, or undefined */
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Execute and return all matching rows */
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Execute an INSERT/UPDATE/DELETE */
  run(sql: string, params?: unknown[]): Promise<void>;

  // ── Tenants ───────────────────────────────────────────────────────────────
  getTenant(id: string): Promise<TenantRow | undefined>;
  getTenantByEmail(email: string): Promise<TenantRow | undefined>;
  createTenant(id: string, name: string, email: string): Promise<void>;
  updateTenantKillSwitch(tenantId: string, active: number, at: string | null): Promise<void>;

  // ── API Keys ──────────────────────────────────────────────────────────────
  getApiKey(key: string): Promise<ApiKeyRow | undefined>;
  getApiKeyBySha256(sha256: string): Promise<ApiKeyRow | undefined>;
  createApiKey(key: string, tenantId: string, name: string): Promise<void>;
  touchApiKey(key: string): Promise<void>;
  deactivateApiKeyBySha256(sha256: string): Promise<void>;
  updateAuditEventHashes(eventId: number, previousHash: string, hash: string): Promise<void>;

  // ── Audit Events ──────────────────────────────────────────────────────────
  /**
   * Atomically reads the last hash and inserts a new audit event in a
   * serialized manner to prevent hash chain corruption under concurrent writes.
   * Returns the new hash.
   */
  insertAuditEventSafe(
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
  ): Promise<string>;

  insertAuditEvent(
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
  ): Promise<void>;

  getLastAuditHash(tenantId: string): Promise<string | undefined>;
  countAuditEvents(tenantId: string): Promise<number>;
  getAuditEvents(tenantId: string, limit: number, offset: number): Promise<AuditEventRow[]>;
  getAllAuditEvents(tenantId: string): Promise<AuditEventRow[]>;

  // ── Usage Stats ───────────────────────────────────────────────────────────
  usageTotal(tenantId: string): Promise<number>;
  usageByResult(tenantId: string): Promise<Array<{ result: string; cnt: number }>>;
  usageLast24h(tenantId: string): Promise<number>;
  topBlockedTools(tenantId: string): Promise<Array<{ tool: string; cnt: number }>>;
  avgDurationMs(tenantId: string): Promise<number | null>;

  // ── Sessions ──────────────────────────────────────────────────────────────
  upsertSession(id: string, tenantId: string | null): Promise<void>;

  // ── Settings ──────────────────────────────────────────────────────────────
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;

  // ── Webhooks ──────────────────────────────────────────────────────────────
  insertWebhook(
    tenantId: string,
    url: string,
    events: string,
    secret: string | null,
  ): Promise<WebhookRow>;
  getWebhooksByTenant(tenantId: string): Promise<WebhookRow[]>;
  getWebhookById(id: string, tenantId: string): Promise<WebhookRow | undefined>;
  deleteWebhook(id: string, tenantId: string): Promise<void>;
  getActiveWebhooksForTenant(tenantId: string): Promise<WebhookRow[]>;

  // ── Agents ────────────────────────────────────────────────────────────────
  insertAgent(
    tenantId: string,
    name: string,
    apiKey: string,
    policyScope: string,
  ): Promise<AgentRow>;
  getAgentsByTenant(tenantId: string): Promise<AgentRow[]>;
  getAgentByKey(apiKey: string): Promise<AgentRow | undefined>;
  getAgentById(id: string, tenantId: string): Promise<AgentRow | undefined>;
  deactivateAgent(id: string, tenantId: string): Promise<void>;

  // ── Approvals (HITL) ──────────────────────────────────────────────────────
  createApproval(
    id: string,
    tenantId: string,
    agentId: string | null,
    tool: string,
    paramsJson: string | null,
  ): Promise<ApprovalRow>;
  getApproval(id: string, tenantId: string): Promise<ApprovalRow | undefined>;
  listPendingApprovals(tenantId: string): Promise<ApprovalRow[]>;
  resolveApproval(
    id: string,
    tenantId: string,
    status: 'approved' | 'denied',
    resolvedBy: string,
  ): Promise<void>;

  // ── Policy ────────────────────────────────────────────────────────────────
  getCustomPolicy(tenantId: string): Promise<string | null>;
  setCustomPolicy(tenantId: string, policyJson: string): Promise<void>;

  // ── Analytics ─────────────────────────────────────────────────────────────
  getUsageAnalytics(tenantId: string, days: number): Promise<UsageAnalytics>;

  // ── Feedback ──────────────────────────────────────────────────────────────
  insertFeedback(
    tenantId: string,
    agentId: string | null,
    rating: number,
    comment: string | null,
  ): Promise<FeedbackRow>;
  listFeedback(): Promise<FeedbackRow[]>;

  // ── Telemetry ─────────────────────────────────────────────────────────────
  insertTelemetryEvent(
    sdkVersion: string,
    language: string,
    nodeVersion: string | null,
    osPlatform: string | null,
  ): Promise<void>;

  // ── Health Check ──────────────────────────────────────────────────────────
  ping(): Promise<boolean>;
  countTenants(): Promise<number>;
  countActiveAgents(): Promise<number>;
}
