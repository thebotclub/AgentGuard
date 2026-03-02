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

  // ── Webhooks ────────────────────────────────────────────────────────────────

  async createWebhook(config: { url: string; events: string[]; secret?: string }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async listWebhooks(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/webhooks`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async deleteWebhook(id: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/webhooks/${id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── Agents ──────────────────────────────────────────────────────────────────

  async createAgent(config: { name: string; policyScope?: Record<string, any> }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async listAgents(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/agents`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async deleteAgent(id: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/agents/${id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  async listTemplates(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/templates`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async getTemplate(name: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/templates/${name}`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async applyTemplate(name: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/templates/${name}/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── Rate Limits ─────────────────────────────────────────────────────────────

  async setRateLimit(config: { agentId?: string; windowSeconds: number; maxRequests: number }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/rate-limits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async listRateLimits(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/rate-limits`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async deleteRateLimit(id: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/rate-limits/${id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── Cost ────────────────────────────────────────────────────────────────────

  async getCostSummary(options?: { agentId?: string; from?: string; to?: string; groupBy?: string }): Promise<any> {
    const params = new URLSearchParams();
    if (options?.agentId) params.set('agentId', options.agentId);
    if (options?.from) params.set('from', options.from);
    if (options?.to) params.set('to', options.to);
    if (options?.groupBy) params.set('groupBy', options.groupBy);
    const res = await fetch(`${this.baseUrl}/api/v1/cost/summary?${params}`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async getAgentCosts(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/cost/agents`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  async getDashboardStats(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/dashboard/stats`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async getDashboardFeed(options?: { since?: string }): Promise<any> {
    const params = new URLSearchParams();
    if (options?.since) params.set('since', options.since);
    const res = await fetch(`${this.baseUrl}/api/v1/dashboard/feed?${params}`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async getAgentActivity(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/dashboard/activity`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }
}
