/* eslint-disable @typescript-eslint/no-explicit-any -- HTTP client returns dynamic API response shapes; typed per-method in JSDoc */
import { randomUUID } from 'crypto';
import os from 'os';
import { LocalPolicyEngine } from './local-policy-engine.js';
import { LocalPolicyEvaluator } from '../core/local-evaluator.js';
import type { PolicyBundle } from '../core/types.js';
import type { SignedPolicyBundle, TrustedPublicKey } from '../core/bundle-types.js';

const SDK_VERSION = '0.9.0';

// ─── Telemetry batch event ─────────────────────────────────────────────────

interface AuditBatchEvent {
  tool: string;
  result: string;
  timestamp: string;
  agent_id?: string;
}

// ─── AgentGuard Client ─────────────────────────────────────────────────────

/**
 * AgentGuard API Client — connects to the hosted API.
 *
 * Supports optional in-process local evaluation mode (localEval: true)
 * for <5ms evaluation without HTTP round-trips after initial policy sync.
 */
export class AgentGuard {
  private apiKey: string;
  private baseUrl: string;
  private telemetryEnabled: boolean;
  private telemetrySent: boolean;
  private readonly traceId: string;

  // ── Local eval state ────────────────────────────────────────────────────
  private readonly localEval: boolean;
  private readonly policySyncIntervalMs: number;
  private readonly localEngine: LocalPolicyEngine;
  private readonly localEvaluator: LocalPolicyEvaluator | null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncInFlight = false;

  // ── Telemetry batching (local eval mode) ────────────────────────────────
  private readonly auditBatch: AuditBatchEvent[] = [];
  private auditFlushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly AUDIT_BATCH_MAX = 100;
  private readonly AUDIT_FLUSH_INTERVAL_MS = 5000;

  constructor(options: {
    apiKey: string;
    baseUrl?: string;
    telemetry?: boolean;
    /** Enable in-process local evaluation (no HTTP on evaluate()). */
    localEval?: boolean;
    /** How often to refresh the policy bundle in ms. Default: 60 000 (60s). */
    policySyncIntervalMs?: number;
    /**
     * Enable in-process evaluation with Ed25519 bundle verification.
     * When set, the SDK uses LocalPolicyEvaluator instead of the simpler
     * LocalPolicyEngine. Bundles are verified against trustedKeys before use.
     */
    useLocalEvaluation?: {
      /** Trusted Ed25519 public keys for bundle verification. */
      trustedKeys: TrustedPublicKey[];
      /** Cache TTL in ms. Default: 60 000. */
      cacheTtlMs?: number;
      /** Allow expired bundles in offline mode. Default: true. */
      allowExpired?: boolean;
      /** Warning callback for stale/expired bundle usage. */
      onWarning?: (message: string) => void;
    };
  }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.agentguard.tech';
    this.telemetryEnabled =
      options.telemetry !== false &&
      process.env['AGENTGUARD_NO_TELEMETRY'] !== '1';
    this.telemetrySent = false;

    // Determine local eval mode: explicit localEval flag OR useLocalEvaluation config
    const useLocalEvalConfig = options.useLocalEvaluation;
    this.localEval = options.localEval === true || useLocalEvalConfig !== undefined;
    this.policySyncIntervalMs = options.policySyncIntervalMs ?? 60_000;

    // Backwards-compatible: simple LocalPolicyEngine when localEval=true without config
    this.localEngine = new LocalPolicyEngine();

    // Enhanced: LocalPolicyEvaluator when useLocalEvaluation is configured
    this.localEvaluator = useLocalEvalConfig
      ? new LocalPolicyEvaluator({
          cacheTtlMs: useLocalEvalConfig.cacheTtlMs ?? this.policySyncIntervalMs,
          trustedKeys: useLocalEvalConfig.trustedKeys,
          allowExpired: useLocalEvalConfig.allowExpired,
          onWarning: useLocalEvalConfig.onWarning,
        })
      : null;

    this.traceId = randomUUID();

    if (this.localEval) {
      // Start background periodic sync (non-blocking)
      this._startPolicySync();
      // Start telemetry batch flush
      this._startAuditFlush();
    }
  }

  // ── Request Header Helpers ───────────────────────────────────────────────

  /** Build standard headers with correlation IDs. A new spanId is generated per call. */
  private _headers(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'X-Trace-ID': this.traceId,
      'X-Span-ID': randomUUID(),
    };
  }

  /** Build standard JSON headers with correlation IDs. */
  private _jsonHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this._headers(),
    };
  }

  // ── Telemetry (SDK usage ping) ──────────────────────────────────────────

  /**
   * Fire-and-forget telemetry ping (opt-in, anonymous).
   * Sends once per SDK instance lifetime on the first evaluate() call.
   */
  private sendTelemetry(): void {
    if (!this.telemetryEnabled || this.telemetrySent) return;
    this.telemetrySent = true;
    try {
      const payload = {
        sdk_version: SDK_VERSION,
        language: 'node',
        node_version: process.version,
        os_platform: os.platform(),
      };
      fetch(`${this.baseUrl}/api/v1/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Trace-ID': this.traceId },
        body: JSON.stringify(payload),
      }).catch(() => {/* silently ignore */});
    } catch {
      // Never throw from telemetry
    }
  }

  // ── Policy Sync ─────────────────────────────────────────────────────────

  /**
   * Download the tenant's compiled policy bundle and cache it in memory.
   *
   * Called automatically on a background timer when `localEval: true`.
   * Safe to call manually to force a sync (e.g. after updating your policy).
   *
   * Failures are swallowed — the existing cached policy remains active.
   */
  async syncPolicies(): Promise<void> {
    try {
      // When using LocalPolicyEvaluator, fetch signed bundle from bundles endpoint
      if (this.localEvaluator) {
        const res = await fetch(`${this.baseUrl}/api/v1/bundles/latest`, {
          headers: this._headers(),
        });
        if (!res.ok) return; // non-fatal
        const signed = await res.json() as SignedPolicyBundle;
        // loadSignedBundle returns false if verification fails — keep old bundle
        this.localEvaluator.loadSignedBundle(signed);
        return;
      }

      // Simple LocalPolicyEngine path (backwards-compatible)
      const res = await fetch(`${this.baseUrl}/api/v1/policy/bundle`, {
        headers: this._headers(),
      });
      if (!res.ok) {
        // Non-fatal: keep the previous bundle
        return;
      }
      const bundle = await res.json() as PolicyBundle;
      this.localEngine.loadBundle(bundle);
    } catch {
      // Network failure, parse failure, etc. — never crash the host process
    }
  }

  /** Start the background policy refresh timer. */
  private _startPolicySync(): void {
    // Kick off an immediate initial sync (non-blocking)
    this.syncPolicies().catch(() => {});

    this.syncTimer = setInterval(() => {
      if (this.syncInFlight) return; // skip if already syncing
      this.syncInFlight = true;
      this.syncPolicies()
        .catch(() => {})
        .finally(() => { this.syncInFlight = false; });
    }, this.policySyncIntervalMs);

    // Allow the process to exit normally even with the timer running
    if (this.syncTimer.unref) this.syncTimer.unref();
  }

  /** Stop background timers (call when tearing down). */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.auditFlushTimer) {
      clearInterval(this.auditFlushTimer);
      this.auditFlushTimer = null;
    }
    if (this.localEvaluator) {
      this.localEvaluator.destroy();
    }
    // Best-effort final flush
    this._flushAudit().catch(() => {});
  }

  // ── Telemetry Batching (local eval mode) ────────────────────────────────

  private _startAuditFlush(): void {
    this.auditFlushTimer = setInterval(() => {
      if (this.auditBatch.length > 0) {
        this._flushAudit().catch(() => {});
      }
    }, this.AUDIT_FLUSH_INTERVAL_MS);

    if (this.auditFlushTimer.unref) this.auditFlushTimer.unref();
  }

  private _queueAuditEvent(event: AuditBatchEvent): void {
    this.auditBatch.push(event);
    if (this.auditBatch.length >= this.AUDIT_BATCH_MAX) {
      // Fire-and-forget flush when batch is full
      this._flushAudit().catch(() => {});
    }
  }

  private async _flushAudit(): Promise<void> {
    if (this.auditBatch.length === 0) return;
    const events = this.auditBatch.splice(0, this.auditBatch.length);
    try {
      fetch(`${this.baseUrl}/api/v1/audit`, {
        method: 'POST',
        headers: this._jsonHeaders(),
        body: JSON.stringify({ events }),
      }).catch(() => {/* fire-and-forget */});
    } catch {
      // Never throw
    }
  }

  // ── Core Evaluate ───────────────────────────────────────────────────────

  // ── Batch Evaluate ──────────────────────────────────────────────────────────

  /**
   * Evaluate multiple tool calls in a single HTTP round-trip.
   *
   * Agents running pipelines (e.g. ReAct loops, plan-and-execute) can
   * pre-screen a sequence of tool calls without paying N × latency.
   *
   * @param request  Batch request with `calls` array (1–50 items)
   * @returns        Batch response with per-call results and a summary
   *
   * @example
   * const batch = await guard.evaluateBatch({
   *   agentId: 'my-agent',
   *   calls: [
   *     { tool: 'file_read', params: { path: '/data/report.csv' } },
   *     { tool: 'send_email', params: { to: 'boss@example.com' } },
   *   ],
   * });
   * for (const result of batch.results) {
   *   if (result.decision === 'block') {
   *     console.error(`Blocked ${result.tool}: ${result.reason}`);
   *   }
   * }
   */
  async evaluateBatch(request: {
    agentId?: string;
    sessionId?: string;
    calls: Array<{ tool: string; params?: Record<string, unknown> }>;
  }): Promise<{
    batchId: string;
    results: Array<{
      index: number;
      tool: string;
      decision: 'allow' | 'block' | 'monitor' | 'require_approval';
      riskScore: number;
      matchedRuleId?: string;
      durationMs: number;
      reason?: string;
      suggestion?: string;
      docs?: string;
      alternatives?: string[];
      approvalId?: string;
      approvalUrl?: string;
      warnings?: string[];
    }>;
    summary: {
      total: number;
      allowed: number;
      monitored: number;
      blocked: number;
      requireApproval: number;
    };
    batchDurationMs: number;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/evaluate/batch`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      batchId: string;
      results: Array<{
        index: number;
        tool: string;
        decision: 'allow' | 'block' | 'monitor' | 'require_approval';
        riskScore: number;
        matchedRuleId?: string;
        durationMs: number;
        reason?: string;
        suggestion?: string;
        docs?: string;
        alternatives?: string[];
        approvalId?: string;
        approvalUrl?: string;
        warnings?: string[];
      }>;
      summary: {
        total: number;
        allowed: number;
        monitored: number;
        blocked: number;
        requireApproval: number;
      };
      batchDurationMs: number;
    }>;
  }

  async evaluate(action: { tool: string; params?: Record<string, unknown> }): Promise<{
    result: 'allow' | 'block' | 'monitor' | 'require_approval';
    matchedRuleId?: string;
    riskScore: number;
    reason: string;
    durationMs: number;
  }> {
    this.sendTelemetry();

    // ── Local eval path: LocalPolicyEvaluator (signed bundles) ─────────
    if (this.localEvaluator && this.localEvaluator.isReady()) {
      const actionReq = {
        id: randomUUID(),
        agentId: 'local-sdk',
        tool: action.tool,
        params: action.params ?? {},
        inputDataLabels: [],
        timestamp: new Date().toISOString(),
      };
      const evalResult = this.localEvaluator.evaluate(actionReq);

      // Queue for batched audit
      this._queueAuditEvent({
        tool: action.tool,
        result: evalResult.result,
        timestamp: new Date().toISOString(),
      });

      return {
        result: evalResult.result,
        matchedRuleId: evalResult.matchedRuleId != null ? String(evalResult.matchedRuleId) : undefined,
        riskScore: evalResult.riskScore,
        reason: evalResult.reason,
        durationMs: evalResult.durationMs,
      };
    }

    // ── Local eval path: LocalPolicyEngine (simple, unsigned) ──────────
    if (this.localEval && this.localEngine.isReady()) {
      const evalResult = this.localEngine.evaluate(action.tool, action.params);

      // Queue for batched audit
      this._queueAuditEvent({
        tool: action.tool,
        result: evalResult.result,
        timestamp: new Date().toISOString(),
      });

      return evalResult;
    }

    // ── HTTP fallback (also used when localEval=true but policy not yet synced) ─
    const res = await fetch(`${this.baseUrl}/api/v1/evaluate`, {
      method: 'POST',
      headers: this._jsonHeaders(),
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
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async getAudit(options?: { limit?: number; offset?: number }): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const res = await fetch(`${this.baseUrl}/api/v1/audit?${params}`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async killSwitch(active: boolean): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1/killswitch`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify({ active }),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────

  async createWebhook(config: { url: string; events: string[]; secret?: string }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/webhooks`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async listWebhooks(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/webhooks`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async deleteWebhook(id: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/webhooks/${id}`, {
      method: 'DELETE',
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── Agents ──────────────────────────────────────────────────────────────────

  async createAgent(config: { name: string; policyScope?: string[] }): Promise<any> {
    const payload: { name: string; policy_scope?: string[] } = { name: config.name };
    if (config.policyScope !== undefined) payload.policy_scope = config.policyScope;
    const res = await fetch(`${this.baseUrl}/api/v1/agents`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async listAgents(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/agents`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async deleteAgent(id: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/agents/${id}`, {
      method: 'DELETE',
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  async listTemplates(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/templates`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async getTemplate(name: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/templates/${name}`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async applyTemplate(name: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/templates/${name}/apply`, {
      method: 'POST',
      headers: this._jsonHeaders(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── Rate Limits ─────────────────────────────────────────────────────────────

  async setRateLimit(config: { agentId?: string; windowSeconds: number; maxRequests: number }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/rate-limits`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async listRateLimits(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/rate-limits`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async deleteRateLimit(id: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/rate-limits/${id}`, {
      method: 'DELETE',
      headers: this._headers(),
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
    const res = await fetch(`${this.baseUrl}/api/v1/costs/summary?${params}`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async getAgentCosts(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/costs/agents`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async trackCost(data: { tool: string; agentId?: string; estimatedCostCents?: number }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/costs/track`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  async getDashboardStats(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/dashboard/stats`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async getDashboardFeed(options?: { since?: string }): Promise<any> {
    const params = new URLSearchParams();
    if (options?.since) params.set('since', options.since);
    const res = await fetch(`${this.baseUrl}/api/v1/dashboard/feed?${params}`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  async getAgentActivity(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/dashboard/agents`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status}`);
    return res.json();
  }

  // ── MCP (Model Context Protocol) ────────────────────────────────────────

  /**
   * Evaluate an MCP tool call against the AgentGuard policy engine.
   *
   * Use this to intercept MCP `tools/call` requests before forwarding them
   * to the actual MCP tool server. If `blocked` is true, do not forward.
   *
   * @param toolName  The MCP tool name (e.g. "write_file", "execute_command")
   * @param options   Optional evaluation parameters
   * @returns         Decision object including blocked flag and optional MCP error response
   *
   * @example
   * const result = await client.evaluateMcp('write_file', {
   *   arguments: { path: '/etc/passwd', content: '...' },
   *   actionMapping: { write_file: 'file:write' },
   * });
   * if (result.blocked) {
   *   // Return result.mcpErrorResponse to the MCP client
   *   return result.mcpErrorResponse;
   * }
   * // Otherwise forward to the upstream MCP tool server
   */
  async evaluateMcp(
    toolName: string,
    options?: {
      arguments?: Record<string, unknown>;
      sessionId?: string;
      agentId?: string;
      actionMapping?: Record<string, string>;
      /** Raw MCP JSON-RPC message (alternative to toolName + arguments) */
      mcpMessage?: {
        jsonrpc: '2.0';
        id?: string | number | null;
        method: 'tools/call';
        params: { name: string; arguments?: Record<string, unknown> };
      };
    },
  ): Promise<{
    decision: 'allow' | 'block' | 'monitor' | 'require_approval';
    blocked: boolean;
    matchedRuleId?: string;
    riskScore: number;
    reason?: string;
    durationMs: number;
    sessionId: string;
    mcpErrorResponse?: {
      jsonrpc: '2.0';
      id: string | number | null;
      error: { code: number; message: string; data?: unknown };
    };
  }> {
    const body: Record<string, unknown> = { toolName };
    if (options?.arguments) body['arguments'] = options.arguments;
    if (options?.sessionId) body['sessionId'] = options.sessionId;
    if (options?.agentId) body['agentId'] = options.agentId;
    if (options?.actionMapping) body['actionMapping'] = options.actionMapping;
    if (options?.mcpMessage) body['mcpMessage'] = options.mcpMessage;

    const res = await fetch(`${this.baseUrl}/api/v1/mcp/evaluate`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      decision: 'allow' | 'block' | 'monitor' | 'require_approval';
      blocked: boolean;
      matchedRuleId?: string;
      riskScore: number;
      reason?: string;
      durationMs: number;
      sessionId: string;
      mcpErrorResponse?: {
        jsonrpc: '2.0';
        id: string | number | null;
        error: { code: number; message: string; data?: unknown };
      };
    }>;
  }

  /**
   * Get MCP proxy configuration(s) for the tenant.
   *
   * @param configId  Optional config ID to retrieve a specific config
   * @returns         Single config (if ID provided) or list of all configs
   *
   * @example
   * // List all configs
   * const { configs } = await client.getMcpConfig();
   *
   * // Get specific config
   * const { config } = await client.getMcpConfig('cfg-abc123');
   */
  async getMcpConfig(configId?: string): Promise<any> {
    const url = configId
      ? `${this.baseUrl}/api/v1/mcp/config?id=${encodeURIComponent(configId)}`
      : `${this.baseUrl}/api/v1/mcp/config`;
    const res = await fetch(url, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * Create or update an MCP proxy configuration.
   *
   * When `id` is provided, updates the existing config.
   * When `id` is omitted, creates a new config.
   *
   * @param config  Configuration object
   * @returns       The created or updated config
   *
   * @example
   * // Create new config
   * const { config } = await client.setMcpConfig({
   *   name: 'filesystem-guarded',
   *   upstreamUrl: 'http://localhost:4000/mcp',
   *   transport: 'sse',
   *   actionMapping: { write_file: 'file:write', read_file: 'file:read' },
   * });
   *
   * // Update existing
   * await client.setMcpConfig({ id: config.id, enabled: false });
   */
  async setMcpConfig(config: {
    id?: string;
    name?: string;
    upstreamUrl?: string | null;
    transport?: 'sse' | 'stdio';
    agentId?: string | null;
    actionMapping?: Record<string, string>;
    defaultAction?: 'allow' | 'block';
    enabled?: boolean;
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/mcp/config`, {
      method: 'PUT',
      headers: this._jsonHeaders(),
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * List active MCP sessions for the tenant.
   *
   * @returns  List of active MCP sessions with call counts
   *
   * @example
   * const { sessions } = await client.listMcpSessions();
   * console.log(`${sessions.length} active MCP sessions`);
   */
  async listMcpSessions(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/mcp/sessions`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // ── Validation & Certification ───────────────────────────────────────────

  /**
   * Dry-run an agent's declared tools through the policy engine.
   *
   * Validates every tool in `declaredTools` against the active policy rules
   * without executing any real actions. Returns a coverage score and per-tool
   * results. An agent must reach 100% coverage before it can be certified.
   *
   * @param agentId       The agent ID to validate
   * @param declaredTools Array of tool names the agent intends to use
   * @returns             Validation result including coverage %, risk score, and per-tool decisions
   *
   * @example
   * const result = await client.validateAgent('agt_abc123', [
   *   'file_read', 'http_post', 'llm_query',
   * ]);
   * console.log(`Coverage: ${result.coverage}%  Risk: ${result.riskScore}`);
   * if (result.uncovered.length > 0) {
   *   console.warn('Uncovered tools:', result.uncovered);
   * }
   */
  async validateAgent(
    agentId: string,
    declaredTools: string[],
  ): Promise<{
    agentId: string;
    valid: boolean;
    coverage: number;
    riskScore: number;
    results: Array<{ tool: string; decision: string; ruleId: string | null; riskScore: number; reason: string | null }>;
    uncovered: string[];
    validatedAt: string;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/agents/${encodeURIComponent(agentId)}/validate`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify({ declaredTools }),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      agentId: string;
      valid: boolean;
      coverage: number;
      riskScore: number;
      results: Array<{ tool: string; decision: string; ruleId: string | null; riskScore: number; reason: string | null }>;
      uncovered: string[];
      validatedAt: string;
    }>;
  }

  /**
   * Get the current readiness / certification status of an agent.
   *
   * Possible statuses:
   * - `"registered"` — agent exists but has never been validated
   * - `"validated"`  — agent has been validated but not certified (or coverage < 100%)
   * - `"certified"`  — agent has a valid, unexpired certification
   * - `"expired"`    — agent's certification has expired; re-validate and re-certify
   *
   * @param agentId  The agent ID to check
   * @returns        Readiness status object
   *
   * @example
   * const status = await client.getAgentReadiness('agt_abc123');
   * if (status.status !== 'certified') {
   *   console.warn('Agent is not certified!', status.status);
   * }
   */
  async getAgentReadiness(agentId: string): Promise<{
    agentId: string;
    name: string;
    status: 'certified' | 'validated' | 'registered' | 'expired';
    lastValidated: string | null;
    coverage: number | null;
    certifiedAt: string | null;
    expiresAt: string | null;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/agents/${encodeURIComponent(agentId)}/readiness`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      agentId: string;
      name: string;
      status: 'certified' | 'validated' | 'registered' | 'expired';
      lastValidated: string | null;
      coverage: number | null;
      certifiedAt: string | null;
      expiresAt: string | null;
    }>;
  }

  /**
   * Certify an agent that has passed validation with 100% policy coverage.
   *
   * Certification is valid for 30 days. The returned `certificationToken` can
   * be stored and passed to deployment pipelines as proof the agent is certified.
   *
   * Requirements:
   * - Agent must have been validated via `validateAgent()` first
   * - Validation must have achieved 100% coverage (all declared tools matched a rule)
   *
   * @param agentId  The agent ID to certify
   * @returns        Certification details including token and expiry date
   *
   * @example
   * const cert = await client.certifyAgent('agt_abc123');
   * console.log(`Certified until ${cert.expiresAt}`);
   * console.log('Token:', cert.certificationToken);
   */
  async certifyAgent(agentId: string): Promise<{
    agentId: string;
    name: string;
    certified: boolean;
    certifiedAt: string;
    expiresAt: string;
    certificationToken: string;
    coverage: number;
    message: string;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/agents/${encodeURIComponent(agentId)}/certify`, {
      method: 'POST',
      headers: this._jsonHeaders(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      agentId: string;
      name: string;
      certified: boolean;
      certifiedAt: string;
      expiresAt: string;
      certificationToken: string;
      coverage: number;
      message: string;
    }>;
  }

  /**
   * Pre-flight admission check for an MCP server.
   *
   * Evaluates all tools provided by the MCP server against the policy engine
   * before allowing the server to be connected. Returns `admitted: true` only
   * if every tool passes evaluation (no blocks, 100% coverage).
   *
   * Use this in CI/CD pipelines or at MCP proxy startup to gate tool server
   * admission.
   *
   * @param serverUrl  The URL or identifier of the MCP tool server
   * @param tools      Array of tool descriptors from the MCP server's tools/list
   * @returns          Admission result with per-tool decisions
   *
   * @example
   * const result = await client.admitMcpServer(
   *   'http://localhost:4000/mcp',
   *   [
   *     { name: 'read_file', description: 'Read a file', inputSchema: {} },
   *     { name: 'write_file', description: 'Write a file', inputSchema: {} },
   *   ],
   * );
   * if (!result.admitted) {
   *   throw new Error('MCP server rejected by policy engine');
   * }
   */
  async admitMcpServer(
    serverUrl: string,
    tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
  ): Promise<{
    serverUrl: string;
    admitted: boolean;
    coverage: number;
    uncovered: string[];
    results: Array<{ tool: string; decision: string; ruleId: string | null; riskScore: number; reason: string | null }>;
    checkedAt: string;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/mcp/admit`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify({ serverUrl, tools }),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      serverUrl: string;
      admitted: boolean;
      coverage: number;
      uncovered: string[];
      results: Array<{ tool: string; decision: string; ruleId: string | null; riskScore: number; reason: string | null }>;
      checkedAt: string;
    }>;
  }

  // ── Additional SDK methods ───────────────────────────────────────────────

  /**
   * Verify the audit hash chain integrity for the authenticated tenant.
   *
   * Walks every audit event in order and validates that each event's
   * `previous_hash` and `hash` fields are consistent. Returns `valid: true`
   * only when the entire chain is intact.
   *
   * @returns Verification result with event count and any detected errors
   *
   * @example
   * const result = await client.verifyAuditChain();
   * if (!result.valid) console.error('Audit chain tampered!', result.errors);
   */
  async verifyAuditChain(): Promise<{
    valid: boolean;
    eventCount: number;
    errors?: string[];
    message: string;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/audit/verify`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      valid: boolean;
      eventCount: number;
      errors?: string[];
      message: string;
    }>;
  }

  /**
   * Check which tools in a list have matching policy rules (coverage check).
   *
   * Useful in CI/CD to ensure every tool your agent uses is covered by at
   * least one explicit policy rule before deploying.
   *
   * @param tools  Array of tool names to check
   * @returns      Coverage report with per-tool decisions and overall coverage %
   *
   * @example
   * const cov = await client.coverageCheck(['file_read', 'http_post', 'llm_query']);
   * if (cov.coverage < 100) console.warn('Uncovered tools:', cov.uncovered);
   */
  async coverageCheck(tools: string[]): Promise<{
    coverage: number;
    covered: string[];
    uncovered: string[];
    results: Array<{
      tool: string;
      decision: string;
      ruleId: string | null;
      riskScore: number;
      reason: string | null;
    }>;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/policy/coverage`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify({ tools }),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      coverage: number;
      covered: string[];
      uncovered: string[];
      results: Array<{
        tool: string;
        decision: string;
        ruleId: string | null;
        riskScore: number;
        reason: string | null;
      }>;
    }>;
  }

  /**
   * Evaluate an MCP tool call against the policy engine.
   * Alias for `evaluateMcp` — prefer `evaluateMcp` for full option support.
   *
   * @param params  MCP evaluation parameters
   * @returns       Decision object
   */
  async mcpEvaluate(params: {
    toolName: string;
    arguments?: Record<string, unknown>;
    sessionId?: string;
    agentId?: string;
    actionMapping?: Record<string, string>;
  }): Promise<{
    decision: 'allow' | 'block' | 'monitor' | 'require_approval';
    blocked: boolean;
    matchedRuleId?: string;
    riskScore: number;
    reason?: string;
    durationMs: number;
    sessionId: string;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/mcp/evaluate`, {
      method: 'POST',
      headers: this._jsonHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      decision: 'allow' | 'block' | 'monitor' | 'require_approval';
      blocked: boolean;
      matchedRuleId?: string;
      riskScore: number;
      reason?: string;
      durationMs: number;
      sessionId: string;
    }>;
  }

  /**
   * Get the MCP proxy configuration for a specific agent.
   *
   * @param agentId  The agent ID whose MCP config to retrieve
   * @returns        MCP configuration for the agent
   *
   * @example
   * const { config } = await client.getMcpConfigForAgent('agt_abc123');
   */
  async getMcpConfigForAgent(agentId: string): Promise<unknown> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/mcp/config/${encodeURIComponent(agentId)}`,
      { headers: this._headers() },
    );
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * Create or update the MCP proxy configuration for a specific agent.
   *
   * @param agentId  The agent ID to configure
   * @param config   Configuration object (actionMapping, defaultAction, enabled…)
   * @returns        The saved configuration
   *
   * @example
   * await client.putMcpConfig('agt_abc123', {
   *   actionMapping: { write_file: 'file:write' },
   *   defaultAction: 'block',
   * });
   */
  async putMcpConfig(
    agentId: string,
    config: {
      name?: string;
      upstreamUrl?: string | null;
      transport?: 'sse' | 'stdio';
      actionMapping?: Record<string, string>;
      defaultAction?: 'allow' | 'block';
      enabled?: boolean;
    },
  ): Promise<unknown> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/mcp/config/${encodeURIComponent(agentId)}`,
      {
        method: 'PUT',
        headers: this._jsonHeaders(),
        body: JSON.stringify({ agentId, ...config }),
      },
    );
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * List all pending HITL approval requests for the tenant.
   *
   * @returns List of pending approval items
   *
   * @example
   * const { approvals } = await client.listApprovals();
   * for (const a of approvals) { console.log(a.tool, a.status); }
   */
  async listApprovals(): Promise<{
    approvals: Array<{
      id: string;
      agentId: string | null;
      tool: string;
      params: unknown;
      status: 'pending' | 'approved' | 'denied';
      createdAt: string;
    }>;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v1/approvals`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      approvals: Array<{
        id: string;
        agentId: string | null;
        tool: string;
        params: unknown;
        status: 'pending' | 'approved' | 'denied';
        createdAt: string;
      }>;
    }>;
  }

  /**
   * Approve a pending HITL approval request.
   * @param id  Approval ID from the evaluate response or listApprovals
   */
  async approveRequest(id: string): Promise<{ id: string; status: 'approved'; resolvedAt: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/approvals/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{ id: string; status: 'approved'; resolvedAt: string }>;
  }

  /**
   * Deny a pending HITL approval request.
   * @param id  Approval ID from the evaluate response or listApprovals
   */
  async denyRequest(id: string): Promise<{ id: string; status: 'denied'; resolvedAt: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/approvals/${encodeURIComponent(id)}/deny`, {
      method: 'POST',
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{ id: string; status: 'denied'; resolvedAt: string }>;
  }

  /**
   * Get the current custom policy rules for the tenant.
   *
   * @returns The tenant's policy rules array (or the default policy if none set)
   */
  async getPolicy(): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1/policy`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * Replace the tenant's custom policy rules.
   *
   * @param rules  Array of policy rule objects
   * @returns      Confirmation with rule count
   *
   * @example
   * await client.setPolicy([
   *   { id: 'allow-read', action: 'allow', tool: 'file_read', riskScore: 0 },
   * ]);
   */
  async setPolicy(rules: unknown[]): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1/policy`, {
      method: 'PUT',
      headers: this._jsonHeaders(),
      body: JSON.stringify(rules),
    });
    if (!res.ok) throw new Error(`AgentGuard API error: ${res.status} ${await res.text()}`);
    return res.json();
  }
}
