/**
 * AgentGuard MCP (Model Context Protocol) API Routes
 *
 * Provides REST endpoints for:
 *  - Evaluating MCP tool calls against the policy engine
 *  - Managing MCP proxy configuration (create, read, update)
 *  - Listing active MCP sessions
 *
 * Endpoints:
 *  POST /api/v1/mcp/evaluate   — evaluate an MCP tool call
 *  GET  /api/v1/mcp/config     — get MCP proxy config(s) for the tenant
 *  PUT  /api/v1/mcp/config     — create or update MCP proxy config
 *  GET  /api/v1/mcp/sessions   — list active MCP sessions
 */
import { Router, Request, Response, NextFunction } from 'express';
import type { IDatabase, TenantRow } from './db-interface.js';
import { getMcpMiddleware } from './mcp-middleware.js';
import type { McpRequest, McpToolCallParams } from './mcp-middleware.js';

// ── Types ──────────────────────────────────────────────────────────────────

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

async function lookupTenantFromDb(db: IDatabase, apiKey: string): Promise<TenantRow | null> {
  const keyRow = await db.getApiKey(apiKey) as ApiKeyRow | undefined;
  if (!keyRow) return null;
  await db.touchApiKey(apiKey);
  const tenant = await db.getTenant(keyRow.tenant_id);
  return tenant ?? null;
}

function makeRequireTenantAuth(db: IDatabase) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      res.status(401).json({ error: 'X-API-Key header required' });
      return;
    }
    if (apiKey.startsWith('ag_agent_')) {
      res.status(403).json({ error: 'Agent keys cannot manage MCP configuration. Use your tenant API key.' });
      return;
    }
    const tenant = await lookupTenantFromDb(db, apiKey);
    if (!tenant) {
      res.status(401).json({ error: 'Invalid or inactive API key' });
      return;
    }
    (req as AuthedRequest).tenant = tenant;
    (req as AuthedRequest).tenantId = tenant.id;
    next();
  };
}

function makeOptionalAuth(db: IDatabase) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      (req as AuthedRequest).tenantId = 'demo';
      next();
      return;
    }

    if (apiKey.startsWith('ag_agent_')) {
      const agentRow = await db.getAgentByKey(apiKey);
      if (agentRow) {
        const tenant = await db.getTenant(agentRow.tenant_id);
        if (tenant) (req as AuthedRequest).tenant = tenant;
        (req as AuthedRequest).tenantId = agentRow.tenant_id;
      } else {
        (req as AuthedRequest).tenantId = 'demo';
      }
    } else {
      const tenant = await lookupTenantFromDb(db, apiKey);
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

export function createMcpRoutes(db: IDatabase): Router {
  const router = Router();
  const requireAuth = makeRequireTenantAuth(db);
  const optionalAuth = makeOptionalAuth(db);
  const mcp = getMcpMiddleware(db);

  // ── POST /api/v1/mcp/evaluate ──────────────────────────────────────────────
  router.post('/api/v1/mcp/evaluate', optionalAuth, async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthedRequest).tenantId;
    const body = req.body as Record<string, unknown> ?? {};

    let toolName: string;
    let toolArguments: Record<string, unknown> = {};
    let mcpMessageId: string | number | null | undefined;

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
    const sessionIdInput = body['sessionId'] as string | undefined;
    let session = sessionIdInput ? mcp.getSession(sessionIdInput) : undefined;
    if (!session && sessionIdInput) {
      session = await mcp.getSessionAsync(sessionIdInput);
    }
    if (!session) {
      session = mcp.createSession({
        tenantId,
        agentId: body['agentId'] as string | null ?? null,
        actionMapping: (body['actionMapping'] as Record<string, string> | undefined) ?? {},
      });
    }

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

    if (evaluation.blocked && evaluation.mcpError) {
      responseBody['mcpErrorResponse'] = {
        jsonrpc: '2.0',
        id: mcpMessageId ?? null,
        error: evaluation.mcpError,
      };
    }

    res.json(responseBody);
  });

  // ── GET /api/v1/mcp/config ─────────────────────────────────────────────────
  router.get('/api/v1/mcp/config', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthedRequest).tenantId;
    const { id } = req.query as Record<string, string | undefined>;

    if (id) {
      const config = await mcp.getConfig(tenantId, id);
      if (!config) {
        res.status(404).json({ error: 'MCP config not found' });
        return;
      }
      res.json({ config });
      return;
    }

    const configs = await mcp.listConfigs(tenantId);
    res.json({ configs, count: configs.length });
  });

  // ── PUT /api/v1/mcp/config ─────────────────────────────────────────────────
  router.put('/api/v1/mcp/config', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthedRequest).tenantId;
    const body = req.body as Record<string, unknown> ?? {};

    if (body['id'] === undefined) {
      if (!body['name'] || typeof body['name'] !== 'string' || (body['name'] as string).trim().length < 1) {
        res.status(400).json({ error: 'name is required when creating a new MCP config' });
        return;
      }
    }

    if (body['upstreamUrl'] !== undefined && body['upstreamUrl'] !== null) {
      if (typeof body['upstreamUrl'] !== 'string' || !isValidUrl(body['upstreamUrl'] as string)) {
        res.status(400).json({ error: 'upstreamUrl must be a valid HTTP or HTTPS URL' });
        return;
      }
    }

    const transport = body['transport'] as string | undefined;
    if (transport !== undefined && transport !== 'sse' && transport !== 'stdio') {
      res.status(400).json({ error: 'transport must be "sse" or "stdio"' });
      return;
    }

    const defaultAction = body['defaultAction'] as string | undefined;
    if (defaultAction !== undefined && defaultAction !== 'allow' && defaultAction !== 'block') {
      res.status(400).json({ error: 'defaultAction must be "allow" or "block"' });
      return;
    }

    if (body['actionMapping'] !== undefined && body['actionMapping'] !== null) {
      if (typeof body['actionMapping'] !== 'object' || Array.isArray(body['actionMapping'])) {
        res.status(400).json({ error: 'actionMapping must be an object (key→value string mapping)' });
        return;
      }
    }

    const configId = body['id'] as string | undefined;

    if (configId) {
      const updated = await mcp.updateConfig(tenantId, configId, {
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
      try {
        const config = await mcp.createConfig(tenantId, {
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

  // ── GET /api/v1/mcp/sessions ───────────────────────────────────────────────
  router.get('/api/v1/mcp/sessions', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthedRequest).tenantId;
    const sessions = await mcp.listSessions(tenantId);

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
