/**
 * AgentGuard API Client — connects to the hosted API
 */
export class AgentGuard {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.agentguard.tech';
  }

  async evaluate(action: { tool: string; params?: Record<string, unknown> }): Promise<{
    result: 'allow' | 'block' | 'monitor' | 'require_approval';
    matchedRuleId?: string;
    riskScore: number;
    reason: string;
    durationMs: number;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(action),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      result: 'allow' | 'block' | 'monitor' | 'require_approval';
      matchedRuleId?: string;
      riskScore: number;
      reason: string;
      durationMs: number;
    }>;
  }

  async getUsage(): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1/usage`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async getAudit(options?: { limit?: number; offset?: number }): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const res = await fetch(`${this.baseUrl}/api/v1/audit?${params}`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async killSwitch(active: boolean): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1/killswitch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }
}
