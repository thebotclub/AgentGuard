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
  detection_score: number | null;
  detection_provider: string | null;
  detection_category: string | null;
  /** Number of PII entities detected in this event's input (nullable, default 0) */
  pii_entities_count: number | null;
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

export interface McpServerRow {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  allowed_tools: string; // JSON array
  blocked_tools: string; // JSON array
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

export interface ComplianceReportRow {
  id: string;
  tenant_id: string;
  report_type: string;
  score: number;
  controls_json: string;
  generated_at: string;
}

export interface IntegrationRow {
  id: string;
  tenant_id: string;
  type: 'slack' | 'teams';
  /** AES-GCM encrypted JSON config — never returned raw to callers */
  config_encrypted: string;
  created_at: string;
}

export type SsoProvider = 'auth0' | 'okta' | 'azure_ad';

export interface SsoConfigRow {
  id: string;
  tenant_id: string;
  provider: SsoProvider;
  domain: string;
  client_id: string;
  /** AES-GCM encrypted client secret — never returned raw to callers */
  client_secret_encrypted: string;
  created_at: string;
}

// ── License Row Types ──────────────────────────────────────────────────────

export interface LicenseKeyRow {
  id: string;
  tenant_id: string;
  key_hash: string;             // SHA-256 of the full AGKEY-... string
  tier: string;                 // 'free' | 'pro' | 'enterprise'
  features: string;             // JSON array of LicenseFeature
  limits_json: string;          // JSON of limits object
  offline_grace_days: number;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  stripe_subscription_id: string | null;
  metadata: string | null;      // JSON blob
  created_at: string;
}

export interface LicenseEventRow {
  id: string;
  tenant_id: string;
  license_id: string | null;
  event_type: string;           // 'issued' | 'validated' | 'revoked' | 'expired' | 'limit_exceeded' | 'feature_gated'
  details: string | null;       // JSON
  ip_address: string | null;
  created_at: string;
}

export interface LicenseUsageRow {
  id: string;
  tenant_id: string;
  month: string;                // 'YYYY-MM' format
  event_count: number;
  agent_count: number;
  last_updated: string;
}

export interface ChildAgentRow {
  id: string;
  parent_agent_id: string;
  child_agent_id: string;
  tenant_id: string;
  policy_snapshot: string;
  ttl_expires_at: string | null;
  max_tool_calls: number | null;
  tool_calls_used: number;
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

export interface PlatformAnalytics {
  totalTenants: number;
  activeTenants30d: number;
  totalEvaluateCalls: number;
  callsLast24h: number;
  callsLast7d: number;
  callsLast30d: number;
  blockRate: number;
  topTools: Array<{ tool: string; cnt: number }>;
  topTenants: Array<{ tenant_id: string; email: string; cnt: number }>;
  dailyVolume: Array<{ date: string; cnt: number }>;
  sdkTelemetry: { total: number; last7d: number; byLanguage: Array<{ language: string; cnt: number }> };
}

// ── Anomaly Detection ─────────────────────────────────────────────────────

export interface AnomalyRuleRow {
  id: string;
  tenant_id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  window_minutes: number;
  severity: string;
  enabled: number;
  created_at: string;
}

export interface AlertRow {
  id: string;
  tenant_id: string;
  rule_id: string;
  metric: string;
  current_value: number;
  threshold: number;
  severity: string;
  message: string;
  resolved_at: string | null;
  created_at: string;
}

// ── Count/Aggregate helpers ────────────────────────────────────────────────

export interface CountRow {
  cnt: number;
}

export interface AvgRow {
  avg: number | null;
}

export interface SiemConfigRow {
  id: string;
  tenant_id: string;
  provider: 'splunk' | 'sentinel';
  /** AES-256-GCM encrypted JSON config — never returned raw to callers */
  config_encrypted: string;
  enabled: number;
  last_forwarded_at: string | null;
  created_at: string;
}

export interface PolicyVersionRow {
  id: number;
  policy_id: string;
  tenant_id: string;
  version: number;
  policy_data: string;
  created_at: string;
  reverted_from: number | null;
}

export interface TeamMemberRow {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  invited_at: string;
  accepted_at: string | null;
}

export interface JobRow {
  id: string;
  tenant_id: string;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  payload: string;
  result: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
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
    detectionScore?: number | null,
    detectionProvider?: string | null,
    detectionCategory?: string | null,
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
    detectionScore?: number | null,
    detectionProvider?: string | null,
    detectionCategory?: string | null,
  ): Promise<void>;

  getLastAuditHash(tenantId: string): Promise<string | undefined>;
  countAuditEvents(tenantId: string): Promise<number>;
  getAuditEvents(tenantId: string, limit: number, offset: number): Promise<AuditEventRow[]>;
  getAuditEventsCursor(tenantId: string, limit: number, before?: string): Promise<AuditEventRow[]>;
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
  getPlatformAnalytics(): Promise<PlatformAnalytics>;

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

  // ── Compliance Reports ────────────────────────────────────────────────────
  insertComplianceReport(
    tenantId: string,
    reportType: string,
    score: number,
    controlsJson: string,
  ): Promise<string>;
  getComplianceReport(tenantId: string, reportId: string): Promise<ComplianceReportRow | undefined>;
  getLatestComplianceReport(tenantId: string): Promise<ComplianceReportRow | undefined>;

  // ── MCP Server Registry ───────────────────────────────────────────────────
  insertMcpServer(
    tenantId: string,
    name: string,
    url: string,
    allowedTools: string[],
    blockedTools: string[],
  ): Promise<McpServerRow>;
  listMcpServers(tenantId: string): Promise<McpServerRow[]>;
  getMcpServer(id: string, tenantId: string): Promise<McpServerRow | undefined>;
  deleteMcpServer(id: string, tenantId: string): Promise<void>;

  // ── Child Agents (A2A) ───────────────────────────────────────────────────
  insertChildAgent(
    id: string,
    parentAgentId: string,
    childAgentId: string,
    tenantId: string,
    policySnapshot: string,
    ttlExpiresAt: string | null,
    maxToolCalls: number | null,
  ): Promise<ChildAgentRow>;
  getChildAgent(childAgentId: string): Promise<ChildAgentRow | undefined>;
  listChildAgents(parentAgentId: string, tenantId: string): Promise<ChildAgentRow[]>;
  deleteChildAgent(childAgentId: string, tenantId: string): Promise<void>;
  incrementChildToolCalls(childAgentId: string): Promise<void>;

  // ── Integrations (Slack / Teams) ──────────────────────────────────────────
  insertIntegration(
    tenantId: string,
    type: 'slack' | 'teams',
    configEncrypted: string,
  ): Promise<IntegrationRow>;
  getIntegration(tenantId: string, type: 'slack' | 'teams'): Promise<IntegrationRow | undefined>;
  deleteIntegration(tenantId: string, type: 'slack' | 'teams'): Promise<void>;

  // ── SSO Configurations ────────────────────────────────────────────────────
  upsertSsoConfig(
    tenantId: string,
    provider: SsoProvider,
    domain: string,
    clientId: string,
    clientSecretEncrypted: string,
  ): Promise<SsoConfigRow>;
  getSsoConfig(tenantId: string): Promise<SsoConfigRow | undefined>;
  deleteSsoConfig(tenantId: string): Promise<void>;

  // ── SIEM Configurations ───────────────────────────────────────────────────
  upsertSiemConfig(
    tenantId: string,
    provider: 'splunk' | 'sentinel',
    configEncrypted: string,
  ): Promise<SiemConfigRow>;
  getSiemConfig(tenantId: string): Promise<SiemConfigRow | undefined>;
  deleteSiemConfig(tenantId: string): Promise<void>;
  updateSiemLastForwarded(tenantId: string, at: string): Promise<void>;

  // ── Health Check ──────────────────────────────────────────────────────────
  ping(): Promise<boolean>;
  countTenants(): Promise<number>;
  countActiveAgents(): Promise<number>;

  // ── License Keys ──────────────────────────────────────────────────────────
  insertLicenseKey(key: LicenseKeyRow): Promise<LicenseKeyRow>;
  getLicenseKeyByTenant(tenantId: string): Promise<LicenseKeyRow | null>;
  getLicenseKeyByHash(hash: string): Promise<LicenseKeyRow | null>;
  revokeLicenseKey(id: string, reason: string): Promise<void>;

  // ── License Events ────────────────────────────────────────────────────────
  insertLicenseEvent(event: LicenseEventRow): Promise<void>;
  getLicenseEvents(tenantId: string, limit: number): Promise<LicenseEventRow[]>;

  // ── License Usage ─────────────────────────────────────────────────────────
  upsertLicenseUsage(tenantId: string, month: string, events: number, agents: number): Promise<void>;
  getLicenseUsage(tenantId: string, month: string): Promise<LicenseUsageRow | null>;

  // ── Anomaly Rules ─────────────────────────────────────────────────────────
  insertAnomalyRule(rule: AnomalyRuleRow): Promise<AnomalyRuleRow>;
  getAnomalyRules(tenantId: string): Promise<AnomalyRuleRow[]>;
  updateAnomalyRule(id: string, tenantId: string, updates: Partial<AnomalyRuleRow>): Promise<AnomalyRuleRow | undefined>;
  deleteAnomalyRule(id: string, tenantId: string): Promise<void>;

  // ── Alerts ────────────────────────────────────────────────────────────────
  insertAlert(alert: AlertRow): Promise<AlertRow>;
  getAlerts(tenantId: string, opts?: { severity?: string; resolved?: boolean }): Promise<AlertRow[]>;
  resolveAlert(id: string): Promise<void>;
  getActiveAlert(tenantId: string, ruleId: string): Promise<AlertRow | undefined>;

  // ── Stripe Webhook Idempotency ────────────────────────────────────────────
  isStripeEventProcessed(eventId: string): Promise<boolean>;
  markStripeEventProcessed(eventId: string, eventType: string): Promise<void>;
  pruneStripeProcessedEvents(olderThanDays?: number): Promise<void>;

  // ── Policy Versioning ─────────────────────────────────────────────────────
  insertPolicyVersion(policyId: string, tenantId: string, policyData: string, revertedFrom?: number | null): Promise<PolicyVersionRow>;
  getPolicyVersions(policyId: string, tenantId: string): Promise<PolicyVersionRow[]>;
  getPolicyVersion(policyId: string, tenantId: string, version: number): Promise<PolicyVersionRow | undefined>;
  getNextPolicyVersion(policyId: string, tenantId: string): Promise<number>;

  // ── Team Members (RBAC) ─────────────────────────────────────────────────
  getTeamMembers(tenantId: string): Promise<TeamMemberRow[]>;
  addTeamMember(tenantId: string, email: string, role: string): Promise<TeamMemberRow>;
  removeTeamMember(tenantId: string, userId: string): Promise<void>;
  updateTeamMemberRole(tenantId: string, userId: string, role: string): Promise<void>;
  getTeamMemberByEmail(tenantId: string, email: string): Promise<TeamMemberRow | undefined>;

  // ── Job Queue ───────────────────────────────────────────────────────────
  enqueueJob(tenantId: string, jobType: string, payload: string): Promise<string>;
  getJob(jobId: string): Promise<JobRow | undefined>;
  getJobsForTenant(tenantId: string, limit?: number, offset?: number): Promise<JobRow[]>;
  claimPendingJob(): Promise<JobRow | undefined>;
  completeJob(jobId: string, result: string): Promise<void>;
  failJob(jobId: string, error: string): Promise<void>;
}
