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
