/**
 * AgentGuard Dashboard — API Client
 *
 * Reads the API key from localStorage (key: 'ag_api_key') and baseUrl
 * from the NEXT_PUBLIC_API_URL env var (defaults to window.location.origin).
 */

export function getApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('ag_api_key') ?? '';
}

export function setApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ag_api_key', key);
}

export function getBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return (
    process.env['NEXT_PUBLIC_API_URL'] ??
    (typeof window !== 'undefined' ? window.location.origin : '')
  );
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiKey = getApiKey();
  const base = getBaseUrl();
  const url = base ? `${base}${path}` : path;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuditEvent {
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
  created_at: string;
  hash: string | null;
  agent_id: string | null;
}

export interface AuditListResponse {
  tenantId: string;
  total: number;
  limit: number;
  offset: number;
  events: AuditEvent[];
}

export interface Agent {
  id: string;
  name: string;
  policyScope: string[];
  active: boolean;
  createdAt: string;
}

export interface AgentsListResponse {
  agents: Agent[];
}

export interface KillSwitchStatus {
  global?: { active: boolean; activatedAt: string | null };
  tenant?: { active: boolean; activatedAt: string | null };
  active?: boolean;
  activatedAt?: string | null;
}

export interface DashboardStats {
  totalEvents: number;
  blockRate: number;
  activeAgents: number;
  last24h: number;
}

// ── Audit ──────────────────────────────────────────────────────────────────

export async function getAuditEvents(
  limit = 50,
  offset = 0,
): Promise<AuditListResponse> {
  return apiFetch<AuditListResponse>(
    `/api/v1/audit?limit=${limit}&offset=${offset}`,
  );
}

export async function getAuditExportUrl(
  format: 'csv' | 'json',
  from?: string,
  to?: string,
): Promise<string> {
  const apiKey = getApiKey();
  const base = getBaseUrl();
  const params = new URLSearchParams({ format });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (apiKey) params.set('x-api-key', apiKey);
  return `${base}/api/v1/audit/export?${params.toString()}`;
}

// Separate function for direct download with proper auth header
export async function downloadAuditExport(
  format: 'csv' | 'json',
  from?: string,
  to?: string,
): Promise<void> {
  const apiKey = getApiKey();
  const base = getBaseUrl();
  const params = new URLSearchParams({ format });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const url = `${base}/api/v1/audit/export?${params.toString()}`;

  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `agentguard-audit-${dateStr}.${format}`;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

// ── Agents ─────────────────────────────────────────────────────────────────

export async function getAgents(): Promise<AgentsListResponse> {
  return apiFetch<AgentsListResponse>('/api/v1/agents');
}

export async function deactivateAgent(id: string): Promise<{ id: string; deactivated: boolean }> {
  return apiFetch(`/api/v1/agents/${id}`, { method: 'DELETE' });
}

// ── Kill Switch ────────────────────────────────────────────────────────────

export async function getKillSwitchStatus(): Promise<KillSwitchStatus> {
  return apiFetch<KillSwitchStatus>('/api/v1/killswitch');
}

export async function setKillSwitch(active: boolean): Promise<KillSwitchStatus> {
  return apiFetch<KillSwitchStatus>('/api/v1/killswitch', {
    method: 'POST',
    body: JSON.stringify({ active }),
  });
}

// ── Dashboard Stats ────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>('/api/v1/dashboard/stats');
}
