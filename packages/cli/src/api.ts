/**
 * AgentGuard API client for the CLI.
 *
 * Provides thin wrappers around the AgentGuard REST API endpoints used by the
 * CLI commands. Direct HTTP (using Node's built-in `https` / `http` modules)
 * keeps the CLI dependency-free on the network layer.
 */

import https from 'https';
import http from 'http';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolResult {
  tool: string;
  decision: 'allow' | 'block' | 'monitor' | 'require_approval' | 'error';
  ruleId: string | null;
  riskScore: number;
  reason: string | null;
}

export interface CoverageCheckResult {
  admitted: boolean;
  coverage: number;
  uncovered: string[];
  results: ToolResult[];
  checkedAt: string;
}

export interface TenantStatus {
  tenantId?: string;
  plan?: string;
  agentCount?: number;
  [key: string]: unknown;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

interface HttpResponse {
  status: number;
  body: string;
}

function httpRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string> },
  body?: unknown,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (_e) {
      return reject(new Error(`Invalid URL: ${url}`));
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });

    req.on('error', reject);

    if (body !== undefined) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// ── API Client ────────────────────────────────────────────────────────────────

export class AgentGuardApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.agentguard.dev') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private authHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'User-Agent': 'agentguard-cli/0.1.0',
    };
  }

  /**
   * MCP admit — evaluate a list of tools against the policy engine.
   * The GitHub Action also uses this endpoint, so results are consistent.
   */
  async coverageCheck(tools: string[]): Promise<CoverageCheckResult> {
    const url = `${this.baseUrl}/api/v1/mcp/admit`;
    const body = {
      serverUrl: 'agentguard-cli-scan',
      tools: tools.map((name) => ({ name })),
    };

    const res = await httpRequest(url, { method: 'POST', headers: this.authHeaders() }, body);

    if (res.status !== 200) {
      throw new Error(`AgentGuard API returned ${res.status}: ${res.body.substring(0, 300)}`);
    }

    try {
      return JSON.parse(res.body) as CoverageCheckResult;
    } catch {
      throw new Error(`AgentGuard API returned non-JSON response: ${res.body.substring(0, 200)}`);
    }
  }

  /**
   * Ping the API and return tenant info (uses /health or /api/v1/usage).
   */
  async getTenantStatus(): Promise<TenantStatus> {
    const url = `${this.baseUrl}/api/v1/usage`;
    const res = await httpRequest(url, {
      method: 'GET',
      headers: this.authHeaders(),
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Authentication failed (HTTP ${res.status}). Check your API key.`);
    }
    if (res.status !== 200) {
      throw new Error(`AgentGuard API returned ${res.status}: ${res.body.substring(0, 200)}`);
    }

    try {
      return JSON.parse(res.body) as TenantStatus;
    } catch {
      return { raw: res.body };
    }
  }

  /**
   * Health check — just verifies the server is reachable.
   */
  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const url = `${this.baseUrl}/health`;
    const start = Date.now();

    const res = await httpRequest(url, { method: 'GET', headers: { 'User-Agent': 'agentguard-cli/0.1.0' } });
    const latencyMs = Date.now() - start;

    return { ok: res.status === 200, latencyMs };
  }
}
