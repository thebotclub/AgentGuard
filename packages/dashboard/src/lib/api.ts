/**
 * AgentGuard Dashboard — API client.
 * All calls go to the Hono API (NEXT_PUBLIC_API_URL or localhost:4000).
 */

const BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000/v1';

/** Read auth token from localStorage (set at login or injected via env). */
function getAuthToken(): string {
  if (typeof window === 'undefined') return process.env['AGENTGUARD_JWT'] ?? '';
  return (
    localStorage.getItem('ag_token') ??
    (process.env['NEXT_PUBLIC_AGENTGUARD_JWT'] ?? '')
  );
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body?.error?.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  tenantId: string;
  agentId: string;
  sessionId: string;
  occurredAt: string;
  processingMs: number;
  actionType: string;
  toolName: string | null;
  toolTarget: string | null;
  policyDecision: string;
  policyId: string | null;
  policyVersion: string | null;
  matchedRuleId: string | null;
  blockReason: string | null;
  riskScore: number;
  riskTier: string;
  inputDataLabels: string[];
  outputDataLabels: string[];
  previousHash: string;
  eventHash: string;
}

export interface AuditListResponse {
  data: AuditEvent[];
  pagination: { cursor: string | null; hasMore: boolean };
}

export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  status: string;
  riskTier: string;
  failBehavior: string;
  framework: string | null;
  frameworkVersion: string | null;
  tags: string[];
  policyId: string | null;
  policyVersion: string | null;
  apiKeyPrefix: string;
  apiKeyExpiresAt: string | null;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

export interface AgentListResponse {
  data: Agent[];
  pagination: { cursor: string | null; hasMore: boolean };
}

export interface KillSwitchStatus {
  agentId: string;
  isKilled: boolean;
  tier: string | null;
  issuedAt: string | null;
  reason: string | null;
}

export interface ChainVerification {
  sessionId: string;
  eventCount: number;
  chainValid: boolean;
  firstBrokenAt?: { eventId: string; position: number; expected?: string; actual?: string };
  verifiedAt: string;
}

// ─── Audit API ────────────────────────────────────────────────────────────────

export interface AuditQueryParams {
  agentId?: string;
  decision?: string;
  riskTier?: string;
  toolName?: string;
  fromDate?: string;
  toDate?: string;
  cursor?: string;
  limit?: number;
}

export async function listAuditEvents(params: AuditQueryParams = {}): Promise<AuditListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return apiFetch<AuditListResponse>(`/audit?${qs.toString()}`);
}

export async function getAuditEvent(eventId: string): Promise<AuditEvent> {
  return apiFetch<AuditEvent>(`/audit/${eventId}`);
}

export async function verifySessionChain(sessionId: string): Promise<ChainVerification> {
  return apiFetch<ChainVerification>(`/audit/sessions/${sessionId}/verify`);
}

/** Build export URL (CSV or JSON) including auth token for stream download. */
export function buildExportUrl(params: AuditQueryParams, format: 'csv' | 'json'): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  qs.set('format', format);
  const token = getAuthToken();
  if (token) qs.set('token', token);
  return `${BASE_URL}/audit/export?${qs.toString()}`;
}

// ─── Agents API ───────────────────────────────────────────────────────────────

export async function listAgents(params: { status?: string; limit?: number; cursor?: string } = {}): Promise<AgentListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return apiFetch<AgentListResponse>(`/agents?${qs.toString()}`);
}

export async function getKillSwitchStatus(agentId: string): Promise<KillSwitchStatus> {
  return apiFetch<KillSwitchStatus>(`/killswitch/status/${agentId}`);
}

export async function killAgent(agentId: string, tier: 'SOFT' | 'HARD', reason: string): Promise<void> {
  await apiFetch(`/killswitch/halt/${agentId}`, {
    method: 'POST',
    body: JSON.stringify({ tier, reason }),
  });
}

export async function resumeAgent(agentId: string, reason?: string): Promise<void> {
  await apiFetch(`/killswitch/resume/${agentId}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ─── HITL API ─────────────────────────────────────────────────────────────────

export interface HITLGate {
  id: string;
  tenantId: string;
  agentId: string;
  sessionId: string;
  toolName: string | null;
  toolParams: Record<string, unknown> | null;
  matchedRuleId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'TIMED_OUT' | 'CANCELLED';
  timeoutAt: string;
  onTimeout: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface HITLListResponse {
  data: HITLGate[];
  pagination: { cursor: string | null; hasMore: boolean };
}

export async function listPendingGates(params: { limit?: number; cursor?: string } = {}): Promise<HITLListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  return apiFetch<HITLListResponse>(`/hitl/pending?${qs.toString()}`);
}

export async function listHistoricalGates(params: { limit?: number; cursor?: string; status?: string } = {}): Promise<HITLListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return apiFetch<HITLListResponse>(`/hitl/history?${qs.toString()}`);
}

export async function approveGate(gateId: string, note?: string): Promise<HITLGate> {
  return apiFetch<HITLGate>(`/hitl/${gateId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function rejectGate(gateId: string, note?: string): Promise<HITLGate> {
  return apiFetch<HITLGate>(`/hitl/${gateId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

// ─── Policy API ───────────────────────────────────────────────────────────────

export interface Policy {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  activeVersion: string | null;
  defaultAction: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyVersion {
  id: string;
  policyId: string;
  version: string;
  ruleCount: number;
  changelog: string | null;
  createdAt: string;
  bundleChecksum: string;
  yamlContent?: string;
}

export interface PolicyListResponse {
  data: Policy[];
  pagination: { cursor: string | null; hasMore: boolean };
}

export interface PolicyTestResult {
  policyId: string;
  summary: { total: number; passed: number; failed: number };
  results: Array<{
    name: string;
    passed: boolean;
    decision: string;
    expectedDecision?: string;
    riskScore?: number;
    matchedRuleId?: string | null;
    error?: string;
  }>;
}

export async function listPolicies(params: { limit?: number; cursor?: string } = {}): Promise<PolicyListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  return apiFetch<PolicyListResponse>(`/policies?${qs.toString()}`);
}

export async function getPolicy(policyId: string): Promise<Policy> {
  return apiFetch<Policy>(`/policies/${policyId}`);
}

export async function createPolicy(input: {
  name: string;
  description?: string;
  yamlContent: string;
  changelog?: string;
}): Promise<{ policy: Policy; version: PolicyVersion; warnings: string[] }> {
  return apiFetch(`/policies`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updatePolicy(
  policyId: string,
  input: { yamlContent?: string; description?: string; changelog?: string },
): Promise<{ policy: Policy; version: PolicyVersion | null; warnings: string[] }> {
  return apiFetch(`/policies/${policyId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deletePolicy(policyId: string): Promise<void> {
  await apiFetch(`/policies/${policyId}`, { method: 'DELETE' });
}

export async function listPolicyVersions(policyId: string): Promise<{ data: PolicyVersion[] }> {
  return apiFetch<{ data: PolicyVersion[] }>(`/policies/${policyId}/versions`);
}

export async function getPolicyVersion(policyId: string, version: string): Promise<PolicyVersion> {
  return apiFetch<PolicyVersion>(`/policies/${policyId}/versions/${version}`);
}

export async function testPolicy(policyId: string, tests: unknown[]): Promise<PolicyTestResult> {
  return apiFetch<PolicyTestResult>(`/policies/${policyId}/test`, {
    method: 'POST',
    body: JSON.stringify({ tests }),
  });
}

export async function activatePolicyVersion(policyId: string, version: string): Promise<Policy> {
  return apiFetch<Policy>(`/policies/${policyId}/activate`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

// ─── Agents (extended) ───────────────────────────────────────────────────────

export async function createAgent(input: {
  name: string;
  description?: string;
  framework?: string;
}): Promise<Agent & { apiKey: string }> {
  return apiFetch<Agent & { apiKey: string }>(`/agents`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ─── Compliance API ───────────────────────────────────────────────────────────

export interface OWASPControl {
  id: string;
  name: string;
  score: number;
  status: string;
}

export interface ComplianceReport {
  generatedAt: string;
  dateRange: { from: string; to: string };
  owasp: { overallScore: number; controls: OWASPControl[] };
  policies: Array<{ id: string; name: string; description: string | null; activeVersion: string | null; defaultAction: string; updatedAt: string }>;
  auditSummary: {
    total: number;
    allowed: number;
    blocked: number;
    monitored: number;
    highRisk: number;
    recentEvents: Array<{
      id: string;
      agentId: string;
      actionType: string;
      toolName: string | null;
      decision: string;
      riskScore: number;
      riskTier: string;
      occurredAt: string;
    }>;
  };
  agentHealth: {
    total: number;
    active: number;
    killed: number;
    quarantined: number;
    agents: Array<{ id: string; name: string; status: string; riskTier: string; framework: string | null; lastSeenAt: string | null }>;
  };
  hitlSummary: { total: number; approved: number; rejected: number; timedOut: number };
}

export async function getComplianceReport(params: { fromDate?: string; toDate?: string } = {}): Promise<ComplianceReport> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  return apiFetch<ComplianceReport>(`/compliance/report?${qs.toString()}`);
}

// ─── Kill Switch Extended API ─────────────────────────────────────────────────

export interface HaltAllResponse {
  success: boolean;
  affectedAgents: number;
  tier: string;
  reason: string | null;
}

/** Halt ALL active agents for the tenant immediately. */
export async function haltAllAgents(tier: 'SOFT' | 'HARD', reason: string): Promise<HaltAllResponse> {
  return apiFetch<HaltAllResponse>('/killswitch/halt-all', {
    method: 'POST',
    body: JSON.stringify({ tier, reason }),
  });
}

/** Get kill switch status for all agents (batch). */
export async function listAgentsWithKillStatus(params: { status?: string; limit?: number } = {}): Promise<AgentListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return apiFetch<AgentListResponse>(`/agents?${qs.toString()}`);
}

/** Get the stored token from localStorage. */
export function getStoredToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('ag_token') ?? '';
}

/** Save JWT token to localStorage. */
export function setStoredToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ag_token', token);
}

/** Clear token from localStorage. */
export function clearStoredToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('ag_token');
}
