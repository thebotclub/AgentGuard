/**
 * AgentGuard MCP (Model Context Protocol) API Routes
 *
 * Provides REST endpoints for:
 *  - Evaluating MCP tool calls against the policy engine
 *  - Managing MCP proxy configuration (create, read, update)
 *  - Listing active MCP sessions
 *
 * All routes are mounted under /api/v1/mcp/ in server.ts.
 *
 * Endpoints:
 *  POST /api/v1/mcp/evaluate   — evaluate an MCP tool call
 *  GET  /api/v1/mcp/config     — get MCP proxy config(s) for the tenant
 *  PUT  /api/v1/mcp/config     — create or update MCP proxy config
 *  GET  /api/v1/mcp/sessions   — list active MCP sessions
 */
import { Router, Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { getMcpMiddleware } from './mcp-middleware.js';
import type { McpRequest, McpToolCallParams } from './mcp-middleware.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface TenantRow {
  id: string;
  name: string;
  email: string;
  plan: string;
  created_at: string;
  kill_switch_active: number;
  kill_switch_at: string | null;
}

interface ApiKeyRow {
  key: string;
  tenant_id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: number;
}

interface AuthedRequest extends Request {
  tenant: TenantRow;
  tenantId: string;
}

// ── Auth helpers ───────────────────────────────────────────────────────────

function lookupTenantFromDb(db: Database.Database, apiKey: string): TenantRow | null {
  const keyRow = db
    .prepare<[string]>('SELECT * FROM api_keys WHERE key = ? AND is_active = 1')
    .get(apiKey) as ApiKeyRow | undefined;
  if (!keyRow) return null;

  db.prepare<[string]>("UPDATE api_keys SET last_used_at = datetime('now') WHERE key = ?")
    .run(apiKey);

  const tenant = db
    .prepare<[string]>('SELECT * FROM tenants WHERE id = ?')
    .get(keyRow.tenant_id) as TenantRow | undefined;
  return tenant ?? null;
}

function makeRequireTenantAuth(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      res.status(401).json({ error: 'X-API-Key header required' });
      return;
    }
    // Agent keys are not allowed for MCP config management
    if (apiKey.startsWith('ag_agent_')) {
      res.status(403).json({ error: 'Agent keys cannot manage MCP configuration. Use your tenant API key.' });
      return;
    }
    const tenant = lookupTenantFromDb(db, apiKey);
    if (!tenant) {
      res.status(401).json({ error: 'Invalid or inactive API key' });
      return;
    }
    (req as AuthedRequest).tenant = tenant;
    (req as AuthedRequest).tenantId = tenant.id;
    next();
  };
}

// Allow agent keys too (for evaluate endpoint)
function makeOptionalAuth(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      // Public/demo mode
      (req as AuthedRequest).tenantId = 'demo';
      next();
      return;
    }

    if (apiKey.startsWith('ag_agent_')) {
      // Agent key — look up via agents table
      const agentRow = db
        .prepare<[string]>('SELECT * FROM agents WHERE api_key = ? AND active = 1')
        .get(apiKey) as { id: string; tenant_id: string; name: string } | undefined;

      if (agentRow) {
        const tenant = db
          .prepare<[string]>('SELECT * FROM tenants WHERE id = ?')
          .get(agentRow.tenant_id) as TenantRow | undefined;
        (req as AuthedRequest).tenant = tenant!;
        (req as AuthedRequest).tenantId = agentRow.tenant_id;
      } else {
        (req as AuthedRequest).tenantId = 'demo';
      }
    } else {
      const tenant = lookupTenantFromDb(db, apiKey);
      if (tenant) {
        (req as AuthedRequest).tenant = tenant;
        (req as AuthedRequest).tenantId = tenant.id;
      } else {
        (req as AuthedRequest).tenantId = 'demo';
      }
    }
    next();
  };
}

// ── Validation helpers ─────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// ── Router factory ─────────────────────────────────────────────────────────

export function createMcpRoutes(db: Database.Database): Router {
  const router = Router();
  const requireAuth = makeRequireTenantAuth(db);
  const optionalAuth = makeOptionalAuth(db);
  const mcp = getMcpMiddleware(db);

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/mcp/evaluate
  // Evaluate an MCP tool call against the AgentGuard policy engine.
  //
  // This is the primary integration endpoint for MCP-aware agents.
  // The caller provides the MCP tool name + arguments; AgentGuard returns
  // a policy decision. The caller is responsible for blocking or forwarding
  // based on the decision.
  //
  // Request body:
  //   {
  //     toolName: string,          // MCP tool name (e.g. "write_file")
  //     arguments?: object,        // Tool arguments
  //     sessionId?: string,        // Optional existing MCP session ID
  //     agentId?: string,          // Optional AgentGuard agent ID
  //     actionMapping?: object,    // Optional custom tool→action mapping
  //     // Raw MCP JSON-RPC message (alternative to toolName/arguments):
  //     mcpMessage?: {
  //       jsonrpc: "2.0",
  //       method: "tools/call",
  //       params: { name: string, arguments?: object }
  //     }
  //   }
  //
  // Response:
  //   {
  //     decision: "allow" | "block" | "monitor" | "require_approval",
  //     blocked: boolean,
  //     matchedRuleId?: string,
  //     riskScore: number,
  //     reason?: string,
  //     durationMs: number,
  //     sessionId: string,
  //     // If blocked, a ready-to-send MCP error response:
  //     mcpErrorResponse?: { jsonrpc: "2.0", id: ..., error: { code, message, data } }
  //   }
  // ──────────────────────────────────────────────────────────────────────────
  router.post('/api/v1/mcp/evaluate', optionalAuth, async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthedRequest).tenantId;
    const body = req.body as Record<string, unknown> ?? {};

    let toolName: string;
    let toolArguments: Record<string, unknown> = {};
    let mcpMessageId: string | number | null | undefined;

    // Support either direct toolName/arguments OR a raw MCP message
    if (body['mcpMessage']) {
      const msg = body['mcpMessage'] as McpRequest;
      if (msg.method !== 'tools/call') {
        res.status(400).json({
          error: 'Only tools/call MCP messages can be evaluated',
          hint: 'Non-tool messages (resources/read, prompts/get) should pass through without evaluation',
        });
        return;
      }
      const params = msg.params as McpToolCallParams | undefined;
      if (!params?.name || typeof params.name !== 'string') {
        res.status(400).json({ error: 'mcpMessage.params.name is required and must be a string' });
        return;
      }
      toolName = params.name;
      toolArguments = (params.arguments ?? {}) as Record<string, unknown>;
      mcpMessageId = msg.id;
    } else {
      if (!body['toolName'] || typeof body['toolName'] !== 'string') {
        res.status(400).json({ error: 'toolName is required and must be a string' });
        return;
      }
      toolName = body['toolName'] as string;
      if (toolName.length > 200) {
        res.status(400).json({ error: 'toolName too long (max 200 chars)' });
        return;
      }
      toolArguments = (typeof body['arguments'] === 'object' && body['arguments'] !== null)
        ? body['arguments'] as Record<string, unknown>
        : {};
    }

    // Resolve or create session
    let session = body['sessionId'] ? mcp.getSession(body['sessionId'] as string) : undefined;
    if (!session) {
      session = mcp.createSession({
        tenantId,
        agentId: body['agentId'] as string | null ?? null,
        actionMapping: (body['actionMapping'] as Record<string, string> | undefined) ?? {},
      });
    }

    // Evaluate
    const evaluation = mcp.evaluateToolCall({
      toolName,
      toolArguments,
      session,
      tenantId,
      agentId: body['agentId'] as string | null ?? session.agentId,
      actionMapping: (body['actionMapping'] as Record<string, string> | undefined) ?? {},
    });

    const responseBody: Record<string, unknown> = {
      decision: evaluation.decision,
      blocked: evaluation.blocked,
      riskScore: evaluation.riskScore,
      durationMs: evaluation.durationMs,
      sessionId: session.id,
    };

    if (evaluation.matchedRuleId !== undefined) {
      responseBody['matchedRuleId'] = evaluation.matchedRuleId;
    }
    if (evaluation.reason !== undefined) {
      responseBody['reason'] = evaluation.reason;
    }

    // If blocked, include a ready-to-use MCP error response
    if (evaluation.blocked && evaluation.mcpError) {
      responseBody['mcpErrorResponse'] = {
        jsonrpc: '2.0',
        id: mcpMessageId ?? null,
        error: evaluation.mcpError,
      };
    }

    res.json(responseBody);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/mcp/config
  // List all MCP proxy configurations for the authenticated tenant.
  //
  // Query params:
  //   id — optional config ID to retrieve a specific config
  //
  // Response:
  //   { configs: McpConfig[] }  (list)
  //   { config: McpConfig }     (single, when ?id= provided)
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/api/v1/mcp/config', requireAuth, (req: Request, res: Response): void => {
    const tenantId = (req as AuthedRequest).tenantId;
    const { id } = req.query as Record<string, string | undefined>;

    if (id) {
      const config = mcp.getConfig(tenantId, id);
      if (!config) {
        res.status(404).json({ error: 'MCP config not found' });
        return;
      }
      res.json({ config });
      return;
    }

    const configs = mcp.listConfigs(tenantId);
    res.json({ configs, count: configs.length });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PUT /api/v1/mcp/config
  // Create or update an MCP proxy configuration.
  //
  // When `id` is provided in the body, updates the existing config.
  // When `id` is omitted, creates a new config.
  //
  // Request body:
  //   {
  //     id?: string,               // Existing config ID to update
  //     name: string,              // Human-readable name for this proxy config
  //     upstreamUrl?: string,      // URL of the actual MCP tool server
  //     transport?: "sse"|"stdio", // Transport type (default: "sse")
  //     agentId?: string,          // Scope to a specific AgentGuard agent
  //     actionMapping?: object,    // Map tool names to AgentGuard action names
  //     defaultAction?: "allow"|"block",  // Default when no rule matches
  //     enabled?: boolean          // Whether this config is active
  //   }
  //
  // Response: { config: McpConfig }
  // ──────────────────────────────────────────────────────────────────────────
  router.put('/api/v1/mcp/config', requireAuth, (req: Request, res: Response): void => {
    const tenantId = (req as AuthedRequest).tenantId;
    const body = req.body as Record<string, unknown> ?? {};

    // Validate name
    if (body['id'] === undefined) {
      // Creating new config — name is required
      if (!body['name'] || typeof body['name'] !== 'string' || (body['name'] as string).trim().length < 1) {
        res.status(400).json({ error: 'name is required when creating a new MCP config' });
        return;
      }
    }

    // Validate upstreamUrl if provided
    if (body['upstreamUrl'] !== undefined && body['upstreamUrl'] !== null) {
      if (typeof body['upstreamUrl'] !== 'string' || !isValidUrl(body['upstreamUrl'] as string)) {
        res.status(400).json({ error: 'upstreamUrl must be a valid HTTP or HTTPS URL' });
        return;
      }
    }

    // Validate transport
    const transport = body['transport'] as string | undefined;
    if (transport !== undefined && transport !== 'sse' && transport !== 'stdio') {
      res.status(400).json({ error: 'transport must be "sse" or "stdio"' });
      return;
    }

    // Validate defaultAction
    const defaultAction = body['defaultAction'] as string | undefined;
    if (defaultAction !== undefined && defaultAction !== 'allow' && defaultAction !== 'block') {
      res.status(400).json({ error: 'defaultAction must be "allow" or "block"' });
      return;
    }

    // Validate actionMapping
    if (body['actionMapping'] !== undefined && body['actionMapping'] !== null) {
      if (typeof body['actionMapping'] !== 'object' || Array.isArray(body['actionMapping'])) {
        res.status(400).json({ error: 'actionMapping must be an object (key→value string mapping)' });
        return;
      }
    }

    const configId = body['id'] as string | undefined;

    if (configId) {
      // Update existing
      const updated = mcp.updateConfig(tenantId, configId, {
        name: body['name'] as string | undefined,
        upstreamUrl: body['upstreamUrl'] as string | null | undefined,
        transport: transport as 'sse' | 'stdio' | undefined,
        agentId: body['agentId'] as string | null | undefined,
        actionMapping: body['actionMapping'] as Record<string, string> | undefined,
        defaultAction: defaultAction as 'allow' | 'block' | undefined,
        enabled: body['enabled'] as boolean | undefined,
      });

      if (!updated) {
        res.status(404).json({ error: 'MCP config not found or access denied' });
        return;
      }

      res.json({ config: updated, updated: true });
    } else {
      // Create new
      try {
        const config = mcp.createConfig(tenantId, {
          name: (body['name'] as string).trim(),
          upstreamUrl: body['upstreamUrl'] as string | null | undefined,
          transport: transport as 'sse' | 'stdio' | undefined,
          agentId: body['agentId'] as string | null | undefined,
          actionMapping: body['actionMapping'] as Record<string, string> | undefined,
          defaultAction: defaultAction as 'allow' | 'block' | undefined,
        });
        res.status(201).json({ config, created: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('UNIQUE')) {
          res.status(409).json({ error: 'An MCP config with this name already exists for your tenant' });
          return;
        }
        console.error('[mcp/config] create error:', msg);
        res.status(500).json({ error: 'Failed to create MCP config' });
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/mcp/sessions
  // List active MCP sessions for the authenticated tenant.
  //
  // Query params:
  //   limit  — max sessions (default 50)
  //
  // Response:
  //   {
  //     sessions: McpSession[],
  //     count: number
  //   }
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/api/v1/mcp/sessions', requireAuth, (req: Request, res: Response): void => {
    const tenantId = (req as AuthedRequest).tenantId;
    const sessions = mcp.listSessions(tenantId);

    // Map to public shape (omit internal fields)
    const publicSessions = sessions.map(s => ({
      id: s.id,
      tenantId: s.tenantId,
      agentId: s.agentId,
      configId: s.configId,
      transport: s.transport,
      upstreamUrl: s.upstreamUrl,
      toolCallCount: s.toolCallCount,
      blockedCount: s.blockedCount,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
    }));

    res.json({ sessions: publicSessions, count: publicSessions.length });
  });

  return router;
}
