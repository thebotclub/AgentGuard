/**
 * AgentGuard MCP (Model Context Protocol) Middleware
 *
 * A transparent proxy/interceptor that sits between MCP clients and MCP servers,
 * routing all `tools/call` requests through AgentGuard's policy engine before
 * forwarding them upstream. Non-tool messages (resources/read, prompts/get, etc.)
 * pass through without evaluation.
 *
 * Supports:
 *  - SSE transport (HTTP + Server-Sent Events, the standard MCP HTTP transport)
 *  - stdio transport interception (JSON-RPC over stdin/stdout)
 *  - In-process policy evaluation (no extra network hop)
 *  - Audit trail for every MCP tool call
 *  - Per-session tracking
 *
 * Architecture:
 *  MCP Client → AgentGuard MCP Proxy → [PolicyEngine] → MCP Tool Server
 *
 * The proxy intercepts JSON-RPC requests. For `tools/call`, it evaluates the
 * action via the policy engine. ALLOW/MONITOR → forward upstream. BLOCK → return
 * a JSON-RPC error without contacting the upstream server.
 */
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { PolicyEngine } from '../packages/sdk/src/core/policy-engine.js';
import type { PolicyDocument, ActionRequest, AgentContext } from '../packages/sdk/src/core/types.js';
import { GENESIS_HASH } from '../packages/sdk/src/core/types.js';

// ── MCP JSON-RPC Types ────────────────────────────────────────────────────

/** Standard JSON-RPC 2.0 request */
export interface McpRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

/** Standard JSON-RPC 2.0 response */
export interface McpResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** JSON-RPC error codes */
export const McpErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // AgentGuard custom codes
  PolicyBlocked: -32001,
  KillSwitchActive: -32002,
  RateLimitExceeded: -32003,
} as const;

/** MCP `tools/call` params shape */
export interface McpToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

// ── MCP Session ───────────────────────────────────────────────────────────

export interface McpSession {
  id: string;
  tenantId: string;
  agentId: string | null;
  configId: string | null;
  transport: 'sse' | 'stdio';
  upstreamUrl: string | null;
  actionMapping: Record<string, string>;
  createdAt: string;
  lastActivityAt: string;
  toolCallCount: number;
  blockedCount: number;
}

// ── MCP Config ────────────────────────────────────────────────────────────

export interface McpConfig {
  id: string;
  tenantId: string;
  name: string;
  upstreamUrl: string | null;
  transport: 'sse' | 'stdio';
  agentId: string | null;
  enabled: boolean;
  actionMapping: Record<string, string>;
  defaultAction: 'allow' | 'block';
  createdAt: string;
  updatedAt: string;
}

// ── Evaluation Result ─────────────────────────────────────────────────────

export interface McpEvaluationResult {
  decision: 'allow' | 'block' | 'monitor' | 'require_approval';
  matchedRuleId?: string;
  riskScore: number;
  reason?: string;
  durationMs: number;
  blocked: boolean;
  mcpError?: McpResponse['error'];
}

// ── Default Demo Policy for MCP ───────────────────────────────────────────

const MCP_DEFAULT_POLICY: PolicyDocument = {
  id: 'mcp-default-policy',
  name: 'AgentGuard MCP Default Policy',
  description: 'Default security policy for MCP tool calls',
  version: '1.0.0',
  default: 'allow',
  rules: [
    {
      id: 'mcp-block-file-write',
      description: 'Block file write operations via MCP',
      priority: 10,
      action: 'block',
      severity: 'high',
      when: [{ tool: { in: ['write_file', 'file:write', 'file_write', 'create_file', 'overwrite_file'] } }],
      tags: ['mcp', 'file-safety'],
      riskBoost: 150,
    },
    {
      id: 'mcp-block-shell-exec',
      description: 'Block shell/command execution via MCP',
      priority: 5,
      action: 'block',
      severity: 'critical',
      when: [{ tool: { in: ['execute_command', 'shell_exec', 'system:execute', 'run_command', 'bash', 'sh'] } }],
      tags: ['mcp', 'execution-safety'],
      riskBoost: 300,
    },
    {
      id: 'mcp-monitor-reads',
      description: 'Monitor all file/data read operations',
      priority: 50,
      action: 'monitor',
      severity: 'low',
      when: [{ tool: { in: ['read_file', 'file:read', 'file_read', 'list_directory', 'search_files'] } }],
      tags: ['mcp', 'observability'],
      riskBoost: 0,
    },
  ],
};

// ── McpMiddleware Core Class ──────────────────────────────────────────────

export class McpMiddleware {
  private db: Database.Database;
  private sessions = new Map<string, McpSession>();
  private policyEngine: PolicyEngine;

  constructor(db: Database.Database) {
    this.db = db;
    this.policyEngine = new PolicyEngine();
    this.policyEngine.registerDocument(MCP_DEFAULT_POLICY);
    this.initializeTables();
  }

  // ── Database Setup ──────────────────────────────────────────────────────

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_configs (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        name TEXT NOT NULL,
        upstream_url TEXT,
        transport TEXT NOT NULL DEFAULT 'sse',
        agent_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        action_mapping TEXT NOT NULL DEFAULT '{}',
        default_action TEXT NOT NULL DEFAULT 'allow',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, name)
      );

      CREATE TABLE IF NOT EXISTS mcp_sessions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        agent_id TEXT,
        config_id TEXT,
        transport TEXT NOT NULL DEFAULT 'sse',
        upstream_url TEXT,
        action_mapping TEXT NOT NULL DEFAULT '{}',
        tool_call_count INTEGER NOT NULL DEFAULT 0,
        blocked_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_activity_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS mcp_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        action_name TEXT NOT NULL,
        arguments TEXT,
        decision TEXT NOT NULL,
        matched_rule_id TEXT,
        risk_score INTEGER NOT NULL DEFAULT 0,
        reason TEXT,
        duration_ms REAL,
        blocked INTEGER NOT NULL DEFAULT 0,
        previous_hash TEXT,
        hash TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_mcp_configs_tenant ON mcp_configs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_sessions_tenant ON mcp_sessions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_audit_tenant ON mcp_audit_events(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_mcp_audit_session ON mcp_audit_events(session_id);
    `);
  }

  // ── Session Management ──────────────────────────────────────────────────

  /** Create or retrieve a session. Returns a session object. */
  createSession(opts: {
    tenantId: string;
    agentId?: string | null;
    configId?: string | null;
    transport?: 'sse' | 'stdio';
    upstreamUrl?: string | null;
    actionMapping?: Record<string, string>;
  }): McpSession {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const session: McpSession = {
      id,
      tenantId: opts.tenantId,
      agentId: opts.agentId ?? null,
      configId: opts.configId ?? null,
      transport: opts.transport ?? 'sse',
      upstreamUrl: opts.upstreamUrl ?? null,
      actionMapping: opts.actionMapping ?? {},
      createdAt: now,
      lastActivityAt: now,
      toolCallCount: 0,
      blockedCount: 0,
    };

    this.sessions.set(id, session);

    // Persist to DB
    this.db.prepare<[string, string, string | null, string | null, string, string | null, string, string, string]>(
      `INSERT INTO mcp_sessions
       (id, tenant_id, agent_id, config_id, transport, upstream_url, action_mapping, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      session.tenantId,
      session.agentId,
      session.configId,
      session.transport,
      session.upstreamUrl,
      JSON.stringify(session.actionMapping),
      now,
      now,
    );

    return session;
  }

  getSession(sessionId: string): McpSession | undefined {
    // Check in-memory first
    if (this.sessions.has(sessionId)) return this.sessions.get(sessionId);

    // Fall back to DB
    const row = this.db.prepare<[string]>(
      'SELECT * FROM mcp_sessions WHERE id = ?'
    ).get(sessionId) as {
      id: string; tenant_id: string; agent_id: string | null;
      config_id: string | null; transport: string; upstream_url: string | null;
      action_mapping: string; tool_call_count: number; blocked_count: number;
      created_at: string; last_activity_at: string;
    } | undefined;

    if (!row) return undefined;

    const session: McpSession = {
      id: row.id,
      tenantId: row.tenant_id,
      agentId: row.agent_id,
      configId: row.config_id,
      transport: row.transport as 'sse' | 'stdio',
      upstreamUrl: row.upstream_url,
      actionMapping: JSON.parse(row.action_mapping) as Record<string, string>,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      toolCallCount: row.tool_call_count,
      blockedCount: row.blocked_count,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  listSessions(tenantId: string): McpSession[] {
    const rows = this.db.prepare<[string]>(
      `SELECT * FROM mcp_sessions WHERE tenant_id = ? ORDER BY last_activity_at DESC LIMIT 100`
    ).all(tenantId) as Array<{
      id: string; tenant_id: string; agent_id: string | null;
      config_id: string | null; transport: string; upstream_url: string | null;
      action_mapping: string; tool_call_count: number; blocked_count: number;
      created_at: string; last_activity_at: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      tenantId: r.tenant_id,
      agentId: r.agent_id,
      configId: r.config_id,
      transport: r.transport as 'sse' | 'stdio',
      upstreamUrl: r.upstream_url,
      actionMapping: JSON.parse(r.action_mapping) as Record<string, string>,
      createdAt: r.created_at,
      lastActivityAt: r.last_activity_at,
      toolCallCount: r.tool_call_count,
      blockedCount: r.blocked_count,
    }));
  }

  private updateSession(session: McpSession): void {
    session.lastActivityAt = new Date().toISOString();
    this.db.prepare<[string, number, number, string]>(
      `UPDATE mcp_sessions
       SET last_activity_at = ?, tool_call_count = ?, blocked_count = ?
       WHERE id = ?`
    ).run(session.lastActivityAt, session.toolCallCount, session.blockedCount, session.id);
  }

  // ── Config CRUD ─────────────────────────────────────────────────────────

  createConfig(tenantId: string, opts: {
    name: string;
    upstreamUrl?: string | null;
    transport?: 'sse' | 'stdio';
    agentId?: string | null;
    actionMapping?: Record<string, string>;
    defaultAction?: 'allow' | 'block';
  }): McpConfig {
    const row = this.db.prepare<[string, string, string | null, string, string | null, string, string]>(
      `INSERT INTO mcp_configs
       (tenant_id, name, upstream_url, transport, agent_id, action_mapping, default_action, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       RETURNING *`
    ).get(
      tenantId,
      opts.name,
      opts.upstreamUrl ?? null,
      opts.transport ?? 'sse',
      opts.agentId ?? null,
      JSON.stringify(opts.actionMapping ?? {}),
      opts.defaultAction ?? 'allow',
    ) as {
      id: string; tenant_id: string; name: string; upstream_url: string | null;
      transport: string; agent_id: string | null; enabled: number;
      action_mapping: string; default_action: string; created_at: string; updated_at: string;
    };

    return this.rowToConfig(row);
  }

  listConfigs(tenantId: string): McpConfig[] {
    const rows = this.db.prepare<[string]>(
      'SELECT * FROM mcp_configs WHERE tenant_id = ? ORDER BY created_at DESC'
    ).all(tenantId) as Array<{
      id: string; tenant_id: string; name: string; upstream_url: string | null;
      transport: string; agent_id: string | null; enabled: number;
      action_mapping: string; default_action: string; created_at: string; updated_at: string;
    }>;
    return rows.map(r => this.rowToConfig(r));
  }

  getConfig(tenantId: string, configId: string): McpConfig | undefined {
    const row = this.db.prepare<[string, string]>(
      'SELECT * FROM mcp_configs WHERE id = ? AND tenant_id = ?'
    ).get(configId, tenantId) as {
      id: string; tenant_id: string; name: string; upstream_url: string | null;
      transport: string; agent_id: string | null; enabled: number;
      action_mapping: string; default_action: string; created_at: string; updated_at: string;
    } | undefined;

    return row ? this.rowToConfig(row) : undefined;
  }

  updateConfig(tenantId: string, configId: string, opts: Partial<{
    name: string;
    upstreamUrl: string | null;
    transport: 'sse' | 'stdio';
    agentId: string | null;
    actionMapping: Record<string, string>;
    defaultAction: 'allow' | 'block';
    enabled: boolean;
  }>): McpConfig | undefined {
    const existing = this.getConfig(tenantId, configId);
    if (!existing) return undefined;

    const updated = {
      name: opts.name ?? existing.name,
      upstreamUrl: opts.upstreamUrl !== undefined ? opts.upstreamUrl : existing.upstreamUrl,
      transport: opts.transport ?? existing.transport,
      agentId: opts.agentId !== undefined ? opts.agentId : existing.agentId,
      actionMapping: opts.actionMapping ?? existing.actionMapping,
      defaultAction: opts.defaultAction ?? existing.defaultAction,
      enabled: opts.enabled !== undefined ? opts.enabled : existing.enabled,
    };

    const row = this.db.prepare<[string, string | null, string, string | null, string, string, number, string, string]>(
      `UPDATE mcp_configs
       SET name = ?, upstream_url = ?, transport = ?, agent_id = ?,
           action_mapping = ?, default_action = ?, enabled = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?
       RETURNING *`
    ).get(
      updated.name,
      updated.upstreamUrl,
      updated.transport,
      updated.agentId,
      JSON.stringify(updated.actionMapping),
      updated.defaultAction,
      updated.enabled ? 1 : 0,
      configId,
      tenantId,
    ) as {
      id: string; tenant_id: string; name: string; upstream_url: string | null;
      transport: string; agent_id: string | null; enabled: number;
      action_mapping: string; default_action: string; created_at: string; updated_at: string;
    } | undefined;

    return row ? this.rowToConfig(row) : undefined;
  }

  private rowToConfig(row: {
    id: string; tenant_id: string; name: string; upstream_url: string | null;
    transport: string; agent_id: string | null; enabled: number;
    action_mapping: string; default_action: string; created_at: string; updated_at: string;
  }): McpConfig {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      upstreamUrl: row.upstream_url,
      transport: row.transport as 'sse' | 'stdio',
      agentId: row.agent_id,
      enabled: row.enabled === 1,
      actionMapping: JSON.parse(row.action_mapping) as Record<string, string>,
      defaultAction: row.default_action as 'allow' | 'block',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ── Policy Evaluation ───────────────────────────────────────────────────

  /**
   * Core evaluation: given an MCP `tools/call` payload, evaluate against the
   * policy engine. Maps tool name through actionMapping, then evaluates.
   *
   * Returns the decision + metadata needed to respond or forward the call.
   */
  evaluateToolCall(opts: {
    toolName: string;
    toolArguments?: Record<string, unknown>;
    session?: McpSession;
    tenantId: string;
    agentId?: string | null;
    actionMapping?: Record<string, string>;
  }): McpEvaluationResult {
    const {
      toolName,
      toolArguments = {},
      session,
      tenantId,
      agentId,
      actionMapping = {},
    } = opts;

    // Map tool name to AgentGuard action (e.g. "write_file" → "file:write")
    const effectiveMapping = { ...actionMapping, ...(session?.actionMapping ?? {}) };
    const actionName = effectiveMapping[toolName] ?? toolName;

    const requestId = crypto.randomUUID();
    const agentName = agentId ?? session?.agentId ?? 'mcp-agent';

    const actionRequest: ActionRequest = {
      id: requestId,
      agentId: agentName,
      tool: actionName,
      params: toolArguments,
      inputDataLabels: [],
      timestamp: new Date().toISOString(),
    };

    const ctx: AgentContext = {
      agentId: agentName,
      sessionId: session?.id ?? requestId,
      policyVersion: '1.0.0',
    };

    const start = performance.now();
    let decision;
    try {
      decision = this.policyEngine.evaluate(actionRequest, ctx, MCP_DEFAULT_POLICY.id);
    } catch (_e) {
      // On evaluation error, fail closed
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        decision: 'block',
        riskScore: 500,
        reason: 'Policy evaluation failed — failing closed',
        durationMs,
        blocked: true,
        mcpError: {
          code: McpErrorCode.InternalError,
          message: 'AgentGuard policy evaluation failed',
          data: { blocked: true, reason: 'Policy evaluation error' },
        },
      };
    }
    const durationMs = Math.round((performance.now() - start) * 100) / 100;

    const blocked = decision.result === 'block' || decision.result === 'require_approval';

    // Build MCP error if blocked
    const mcpError: McpResponse['error'] | undefined = blocked
      ? {
          code: McpErrorCode.PolicyBlocked,
          message: `Tool '${toolName}' blocked by AgentGuard policy`,
          data: {
            blocked: true,
            decision: decision.result,
            matchedRuleId: decision.matchedRuleId ?? null,
            riskScore: decision.riskScore,
            reason: decision.reason ?? 'Policy violation',
          },
        }
      : undefined;

    // Write audit trail entry
    this.writeAuditEntry({
      sessionId: session?.id ?? requestId,
      tenantId,
      toolName,
      actionName,
      arguments: toolArguments,
      decision: decision.result,
      matchedRuleId: decision.matchedRuleId ?? null,
      riskScore: decision.riskScore,
      reason: decision.reason ?? null,
      durationMs,
      blocked,
    });

    // Update session counters
    if (session) {
      session.toolCallCount++;
      if (blocked) session.blockedCount++;
      this.updateSession(session);
    }

    return {
      decision: decision.result,
      matchedRuleId: decision.matchedRuleId,
      riskScore: decision.riskScore,
      reason: decision.reason,
      durationMs,
      blocked,
      mcpError,
    };
  }

  // ── Audit Trail ─────────────────────────────────────────────────────────

  private getLastMcpHash(tenantId: string): string {
    const row = this.db.prepare<[string]>(
      'SELECT hash FROM mcp_audit_events WHERE tenant_id = ? ORDER BY id DESC LIMIT 1'
    ).get(tenantId) as { hash: string } | undefined;
    return row?.hash ?? GENESIS_HASH;
  }

  private makeHash(data: string, prev: string): string {
    return crypto.createHash('sha256').update(prev + '|' + data).digest('hex');
  }

  private writeAuditEntry(opts: {
    sessionId: string;
    tenantId: string;
    toolName: string;
    actionName: string;
    arguments?: Record<string, unknown>;
    decision: string;
    matchedRuleId: string | null;
    riskScore: number;
    reason: string | null;
    durationMs: number;
    blocked: boolean;
  }): void {
    const now = new Date().toISOString();
    const prevHash = this.getLastMcpHash(opts.tenantId);
    const eventData = `mcp:${opts.toolName}|${opts.decision}|${now}`;
    const hash = this.makeHash(eventData, prevHash);

    this.db.prepare<[string, string, string, string, string | null, string, string | null, number, string | null, number, number, string, string, string]>(
      `INSERT INTO mcp_audit_events
       (session_id, tenant_id, tool_name, action_name, arguments, decision,
        matched_rule_id, risk_score, reason, duration_ms, blocked, previous_hash, hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      opts.sessionId,
      opts.tenantId,
      opts.toolName,
      opts.actionName,
      opts.arguments ? JSON.stringify(opts.arguments) : null,
      opts.decision,
      opts.matchedRuleId,
      opts.riskScore,
      opts.reason,
      opts.durationMs,
      opts.blocked ? 1 : 0,
      prevHash,
      hash,
      now,
    );
  }

  // ── MCP JSON-RPC Message Interception ────────────────────────────────────

  /**
   * Process an incoming MCP JSON-RPC message.
   *
   * Returns an object with:
   *  - `response`: If non-null, send this back to the client immediately (blocked or error)
   *  - `forward`: If true, forward the original request to the upstream server
   *  - `evaluation`: The evaluation result (for `tools/call` requests)
   */
  async interceptMessage(
    message: McpRequest,
    session: McpSession,
  ): Promise<{
    response: McpResponse | null;
    forward: boolean;
    evaluation?: McpEvaluationResult;
  }> {
    // Only intercept `tools/call` — everything else passes through
    if (message.method !== 'tools/call') {
      return { response: null, forward: true };
    }

    // Validate params
    const params = message.params as McpToolCallParams | undefined;
    if (!params || typeof params.name !== 'string') {
      return {
        response: {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: McpErrorCode.InvalidParams,
            message: 'tools/call requires params.name (string)',
          },
        },
        forward: false,
      };
    }

    // Evaluate through policy engine
    const evaluation = this.evaluateToolCall({
      toolName: params.name,
      toolArguments: (params.arguments ?? {}) as Record<string, unknown>,
      session,
      tenantId: session.tenantId,
      agentId: session.agentId,
    });

    if (evaluation.blocked) {
      // Return a JSON-RPC error — do NOT forward to upstream
      return {
        response: {
          jsonrpc: '2.0',
          id: message.id,
          error: evaluation.mcpError!,
        },
        forward: false,
        evaluation,
      };
    }

    // ALLOW or MONITOR — forward upstream
    return { response: null, forward: true, evaluation };
  }

  /**
   * Forward an MCP JSON-RPC request to the upstream server via HTTP.
   * Used for SSE transport where the upstream is an HTTP endpoint.
   */
  async forwardToUpstream(
    upstreamUrl: string,
    message: McpRequest,
    timeoutMs = 30_000,
  ): Promise<McpResponse> {
    const body = JSON.stringify(message);
    let response: Response;
    try {
      response = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: McpErrorCode.InternalError,
          message: `Upstream MCP server unreachable: ${msg}`,
        },
      };
    }

    if (!response.ok) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: McpErrorCode.InternalError,
          message: `Upstream MCP server returned HTTP ${response.status}`,
          data: { status: response.status },
        },
      };
    }

    try {
      return (await response.json()) as McpResponse;
    } catch {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: McpErrorCode.ParseError,
          message: 'Upstream MCP server returned non-JSON response',
        },
      };
    }
  }

  /**
   * Parse a raw JSON string as an MCP request.
   * Returns null if the message is not valid JSON-RPC.
   */
  parseMessage(raw: string): McpRequest | null {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'jsonrpc' in parsed &&
        'method' in parsed
      ) {
        return parsed as McpRequest;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Process a raw JSON-RPC string (used by stdio transport interceptor).
   *
   * Returns the JSON string to write back, or null if the message should be
   * forwarded to the upstream stdio process unchanged.
   */
  async processStdioLine(
    line: string,
    session: McpSession,
    upstreamUrl?: string,
  ): Promise<string | null> {
    const message = this.parseMessage(line);
    if (!message) return null;

    const { response, forward, evaluation: _ev } = await this.interceptMessage(message, session);

    if (!forward && response) {
      return JSON.stringify(response) + '\n';
    }

    // If it's allowed and we have an upstream URL, proxy there
    if (forward && upstreamUrl) {
      const upstreamResponse = await this.forwardToUpstream(upstreamUrl, message);
      return JSON.stringify(upstreamResponse) + '\n';
    }

    // No upstream — pass through for the caller to handle
    return null;
  }
}

// ── Singleton instance management ─────────────────────────────────────────

let _instance: McpMiddleware | null = null;

export function getMcpMiddleware(db: Database.Database): McpMiddleware {
  if (!_instance) {
    _instance = new McpMiddleware(db);
  }
  return _instance;
}

export function resetMcpMiddleware(): void {
  _instance = null;
}
