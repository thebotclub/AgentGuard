/**
 * Mock IDatabase factory for route tests.
 * All methods are vi.fn() stubs returning safe defaults.
 * Override per-test: mockDb.getSetting.mockResolvedValue('1')
 */
import { vi } from 'vitest';
import type { IDatabase, TenantRow, AgentRow, ApiKeyRow } from '../../db-interface.js';

export const MOCK_TENANT: TenantRow = {
  id: 'tenant-123',
  name: 'Test Tenant',
  email: 'test@example.com',
  plan: 'free',
  created_at: '2024-01-01T00:00:00.000Z',
  kill_switch_active: 0,
  kill_switch_at: null,
};

export const MOCK_AGENT: AgentRow = {
  id: 'agent-456',
  tenant_id: 'tenant-123',
  name: 'Test Agent',
  api_key: 'ag_agent_abc123',
  policy_scope: '[]',
  active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
};

export const MOCK_API_KEY: ApiKeyRow = {
  key: 'ag_live_testkey123',
  tenant_id: 'tenant-123',
  name: 'default',
  created_at: '2024-01-01T00:00:00.000Z',
  last_used_at: null,
  is_active: 1,
  key_hash: null,
  key_prefix: 'ag_live_',
  key_sha256: null,
};

export function createMockDb(): IDatabase {
  return {
    run: vi.fn().mockResolvedValue(undefined),
    all: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),

    // Tenant
    getTenant: vi.fn().mockResolvedValue(MOCK_TENANT),
    getTenantByEmail: vi.fn().mockResolvedValue(undefined),
    createTenant: vi.fn().mockResolvedValue(undefined),
    updateTenantKillSwitch: vi.fn().mockResolvedValue(undefined),

    // API Keys
    getApiKey: vi.fn().mockResolvedValue(undefined),
    getApiKeyBySha256: vi.fn().mockResolvedValue(undefined),
    createApiKey: vi.fn().mockResolvedValue(undefined),
    deactivateApiKeyBySha256: vi.fn().mockResolvedValue(undefined),
    touchApiKey: vi.fn().mockResolvedValue(undefined),
    listApiKeys: vi.fn().mockResolvedValue([]),
    rotateApiKey: vi.fn().mockResolvedValue(undefined),
    deactivateApiKey: vi.fn().mockResolvedValue(undefined),

    // Audit events
    updateAuditEventHashes: vi.fn().mockResolvedValue(undefined),
    insertAuditEventSafe: vi.fn().mockResolvedValue({ id: 1, hash: 'abc123' }),
    insertAuditEvent: vi.fn().mockResolvedValue({ id: 1, hash: 'abc123' }),
    getLastAuditHash: vi.fn().mockResolvedValue(undefined),
    getAuditEvents: vi.fn().mockResolvedValue([]),
    getAuditEventsCursor: vi.fn().mockResolvedValue([]),
    getAllAuditEvents: vi.fn().mockResolvedValue([]),

    // Settings
    getSetting: vi.fn().mockResolvedValue(undefined),
    setSetting: vi.fn().mockResolvedValue(undefined),

    // Webhooks
    insertWebhook: vi.fn().mockResolvedValue({ id: 'wh-1', tenant_id: 'tenant-123', url: 'https://example.com', events: '[]', secret: null, active: 1, created_at: '2024-01-01T00:00:00.000Z' }),
    getWebhooksByTenant: vi.fn().mockResolvedValue([]),
    getWebhookById: vi.fn().mockResolvedValue(undefined),
    deleteWebhook: vi.fn().mockResolvedValue(undefined),
    getActiveWebhooksForTenant: vi.fn().mockResolvedValue([]),
    updateWebhook: vi.fn().mockResolvedValue(undefined),

    // Agents
    insertAgent: vi.fn().mockResolvedValue(MOCK_AGENT),
    getAgentsByTenant: vi.fn().mockResolvedValue([MOCK_AGENT]),
    getAgentById: vi.fn().mockResolvedValue(MOCK_AGENT),
    getAgentByKey: vi.fn().mockResolvedValue(undefined),
    deactivateAgent: vi.fn().mockResolvedValue(undefined),
    updateAgent: vi.fn().mockResolvedValue(undefined),

    // Policy
    getCustomPolicy: vi.fn().mockResolvedValue(null),
    setCustomPolicy: vi.fn().mockResolvedValue(undefined),
    insertPolicyVersion: vi.fn().mockResolvedValue({ id: 1, policy_id: 'p1', tenant_id: 'tenant-123', version: 1, policy_data: '{}', created_at: '2024-01-01T00:00:00.000Z', reverted_from: null }),
    getPolicyVersions: vi.fn().mockResolvedValue([]),
    getPolicyVersion: vi.fn().mockResolvedValue(undefined),
    getNextPolicyVersion: vi.fn().mockResolvedValue(1),

    // Rate limits
    insertRateLimit: vi.fn().mockResolvedValue(undefined),
    getRateLimitsByTenant: vi.fn().mockResolvedValue([]),
    deleteRateLimit: vi.fn().mockResolvedValue(undefined),
    getRateCounter: vi.fn().mockResolvedValue(undefined),
    upsertRateCounter: vi.fn().mockResolvedValue(undefined),

    // Sessions
    getOrCreateSession: vi.fn().mockResolvedValue({ id: 'session-1', tenant_id: 'tenant-123', created_at: '2024-01-01T00:00:00.000Z', last_activity: null }),
    getSession: vi.fn().mockResolvedValue(undefined),
    updateSessionActivity: vi.fn().mockResolvedValue(undefined),

    // Approvals
    createApproval: vi.fn().mockResolvedValue({ id: 'approval-1', tenant_id: 'tenant-123', agent_id: null, tool: 'test', params_json: null, status: 'pending', created_at: '2024-01-01T00:00:00.000Z', resolved_at: null, resolved_by: null }),
    getApproval: vi.fn().mockResolvedValue(undefined),
    getApprovalsByTenant: vi.fn().mockResolvedValue([]),
    resolveApproval: vi.fn().mockResolvedValue(undefined),

    // Feedback
    insertFeedback: vi.fn().mockResolvedValue(undefined),
    getFeedbackByTenant: vi.fn().mockResolvedValue([]),

    // Compliance
    upsertComplianceReport: vi.fn().mockResolvedValue(undefined),
    getComplianceReport: vi.fn().mockResolvedValue(undefined),

    // Integration
    insertIntegration: vi.fn().mockResolvedValue(undefined),
    getIntegration: vi.fn().mockResolvedValue(undefined),
    deleteIntegration: vi.fn().mockResolvedValue(undefined),

    // SSO
    upsertSsoConfig: vi.fn().mockResolvedValue(undefined),
    getSsoConfig: vi.fn().mockResolvedValue(undefined),
    deleteSsoConfig: vi.fn().mockResolvedValue(undefined),
    storeSsoState: vi.fn().mockResolvedValue(undefined),
    getSsoState: vi.fn().mockResolvedValue(undefined),
    deleteSsoState: vi.fn().mockResolvedValue(undefined),
    upsertSsoUser: vi.fn().mockResolvedValue(undefined),
    getSsoUser: vi.fn().mockResolvedValue(undefined),

    // Git webhook
    upsertGitWebhookConfig: vi.fn().mockResolvedValue(undefined),
    getGitWebhookConfig: vi.fn().mockResolvedValue(undefined),
    deleteGitWebhookConfig: vi.fn().mockResolvedValue(undefined),
    insertGitSyncLog: vi.fn().mockResolvedValue(undefined),
    listGitSyncLogs: vi.fn().mockResolvedValue([]),

    // SIEM
    upsertSiemConfig: vi.fn().mockResolvedValue(undefined),
    getSiemConfig: vi.fn().mockResolvedValue(undefined),
    deleteSiemConfig: vi.fn().mockResolvedValue(undefined),
    updateSiemLastForwarded: vi.fn().mockResolvedValue(undefined),

    // Agent hierarchy
    insertChildAgent: vi.fn().mockResolvedValue(undefined),
    getChildAgent: vi.fn().mockResolvedValue(undefined),
    listChildAgents: vi.fn().mockResolvedValue([]),
    deleteChildAgent: vi.fn().mockResolvedValue(undefined),
    incrementChildToolCalls: vi.fn().mockResolvedValue(undefined),

    // License
    insertLicenseKey: vi.fn().mockResolvedValue({} as any),
    getLicenseKeyByTenant: vi.fn().mockResolvedValue(null),
    getLicenseKeyByHash: vi.fn().mockResolvedValue(null),
    revokeLicenseKey: vi.fn().mockResolvedValue(undefined),
    insertLicenseEvent: vi.fn().mockResolvedValue(undefined),
    getLicenseEvents: vi.fn().mockResolvedValue([]),
    upsertLicenseUsage: vi.fn().mockResolvedValue(undefined),
    getLicenseUsage: vi.fn().mockResolvedValue(null),

    // Anomaly / Alerts
    insertAnomalyRule: vi.fn().mockResolvedValue({} as any),
    getAnomalyRules: vi.fn().mockResolvedValue([]),
    updateAnomalyRule: vi.fn().mockResolvedValue(undefined),
    deleteAnomalyRule: vi.fn().mockResolvedValue(undefined),
    insertAlert: vi.fn().mockResolvedValue({} as any),
    getAlerts: vi.fn().mockResolvedValue([]),
    resolveAlert: vi.fn().mockResolvedValue(undefined),
    getActiveAlert: vi.fn().mockResolvedValue(undefined),

    // Stripe
    isStripeEventProcessed: vi.fn().mockResolvedValue(false),
    markStripeEventProcessed: vi.fn().mockResolvedValue(undefined),
    pruneStripeProcessedEvents: vi.fn().mockResolvedValue(undefined),

    // Team
    getTeamMembers: vi.fn().mockResolvedValue([]),
    addTeamMember: vi.fn().mockResolvedValue({} as any),
    removeTeamMember: vi.fn().mockResolvedValue(undefined),
    updateTeamMemberRole: vi.fn().mockResolvedValue(undefined),
    getTeamMemberByEmail: vi.fn().mockResolvedValue(undefined),

    // Jobs
    enqueueJob: vi.fn().mockResolvedValue('job-1'),
    getJob: vi.fn().mockResolvedValue(undefined),
    getJobsForTenant: vi.fn().mockResolvedValue([]),
    claimPendingJob: vi.fn().mockResolvedValue(undefined),
    completeJob: vi.fn().mockResolvedValue(undefined),
    failJob: vi.fn().mockResolvedValue(undefined),

    // SCIM
    createScimToken: vi.fn().mockResolvedValue({} as any),
    getScimTokenByHash: vi.fn().mockResolvedValue(undefined),
    listScimTokens: vi.fn().mockResolvedValue([]),
    revokeScimToken: vi.fn().mockResolvedValue(undefined),
    touchScimToken: vi.fn().mockResolvedValue(undefined),
    createScimUser: vi.fn().mockResolvedValue({} as any),
    getScimUser: vi.fn().mockResolvedValue(undefined),
    getScimUserByUserName: vi.fn().mockResolvedValue(undefined),
    listScimUsers: vi.fn().mockResolvedValue({ users: [], total: 0 }),
    updateScimUser: vi.fn().mockResolvedValue(undefined),
    deleteScimUser: vi.fn().mockResolvedValue(undefined),
    createScimGroup: vi.fn().mockResolvedValue({} as any),
    getScimGroup: vi.fn().mockResolvedValue(undefined),
    listScimGroups: vi.fn().mockResolvedValue({ groups: [], total: 0 }),
    updateScimGroup: vi.fn().mockResolvedValue(undefined),
    deleteScimGroup: vi.fn().mockResolvedValue(undefined),
    getScimGroupMembers: vi.fn().mockResolvedValue([]),
    addScimGroupMember: vi.fn().mockResolvedValue(undefined),
    removeScimGroupMember: vi.fn().mockResolvedValue(undefined),
    replaceScimGroupMembers: vi.fn().mockResolvedValue(undefined),

    // Telemetry
    insertSdkTelemetry: vi.fn().mockResolvedValue(undefined),
    getSdkTelemetryStats: vi.fn().mockResolvedValue({ total: 0, last7d: 0, byLanguage: [] }),

    // Dashboard stats
    getUsageStats: vi.fn().mockResolvedValue({ calls: { total: 0, allowed: 0, blocked: 0 }, uniqueAgents: 0, topTools: [], blockRate: 0, dailyVolume: [] }),
    getAdminStats: vi.fn().mockResolvedValue({ totalTenants: 0, totalAgents: 0, totalEvaluateCalls: 0, callsLast24h: 0, callsLast7d: 0, callsLast30d: 0, blockRate: 0, topTools: [], dailyVolume: [], sdkTelemetry: { total: 0, last7d: 0, byLanguage: [] } }),

    // Cost tracking
    insertCostEvent: vi.fn().mockResolvedValue(undefined),
    getCostEvents: vi.fn().mockResolvedValue([]),
    getCostSummary: vi.fn().mockResolvedValue([]),

    // Infra
    ping: vi.fn().mockResolvedValue(true),
    countTenants: vi.fn().mockResolvedValue(0),
    countActiveAgents: vi.fn().mockResolvedValue(0),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as IDatabase;
}
