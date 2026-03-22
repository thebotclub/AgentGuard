/**
 * MCP Proxy Mode
 *
 * AgentGuard can run as an MCP proxy server, sitting transparently between
 * Claude/agents and the real MCP server. All tool calls are intercepted
 * and evaluated against policies before being forwarded.
 *
 * Architecture:
 *   Agent (Claude) → AgentGuard MCP Proxy → Real MCP Server
 *                         ↓
 *                   Policy Evaluation
 *                         ↓
 *                   Audit Trail
 *
 * Configuration:
 *   AGENTGUARD_MCP_PROXY_PORT=3100  (default)
 *   AGENTGUARD_UPSTREAM_URL=http://localhost:3000  (real MCP server)
 *   AGENTGUARD_API_KEY=ag_...
 *   AGENTGUARD_AGENT_ID=agent_...
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { PrismaClient } from '../../lib/prisma.js';
import type { Redis } from '../../lib/redis.js';
import type { ServiceContext } from '@agentguard/shared';
import { McpInterceptor } from './mcp-interceptor.js';
import type {
  McpToolCallRequest,
  McpProxyConfig,
  McpAgentIdentity,
} from './types.js';

// ─── MCP Proxy Server ─────────────────────────────────────────────────────────

/**
 * Creates an MCP proxy server that intercepts tool calls.
 * The proxy is transparent — the agent connects to the proxy endpoint,
 * which forwards allowed calls to the real MCP server.
 */
export function createMcpProxy(
  db: PrismaClient,
  redis: Redis,
  ctx: ServiceContext,
  config: McpProxyConfig,
): { app: Hono; start: () => Promise<void>; stop: () => void } {
  const interceptor = new McpInterceptor(db, redis, ctx, { strict: config.strict });
  const app = new Hono();
  let serverInstance: ReturnType<typeof serve> | null = null;

  /**
   * Main MCP JSON-RPC endpoint.
   * Accepts all MCP protocol messages, intercepts tools/call.
   */
  app.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: -32700, message: 'Parse error: invalid JSON' } }, 400);
    }

    // Handle batch requests (JSON-RPC array)
    if (Array.isArray(body)) {
      const results = await Promise.all(
        body.map((req) => handleSingleRequest(req, c, interceptor, config)),
      );
      return c.json(results);
    }

    const result = await handleSingleRequest(body, c, interceptor, config);
    return c.json(result);
  });

  /**
   * Passthrough endpoint for MCP SSE/streaming connections.
   * For SSE-based MCP, we proxy the connection after auth.
   */
  app.get('/sse', async (c) => {
    // For SSE connections, establish a proxied stream
    const upstreamUrl = `${config.upstreamUrl}/sse`;
    const response = await fetchWithTimeout(upstreamUrl, {
      method: 'GET',
      headers: buildForwardHeaders((name: string) => c.req.header(name)),
    }, config.upstreamTimeoutMs ?? 30000);

    // Stream the SSE response (tool call interception happens on POST /messages)
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-AgentGuard-Proxy': '1',
      },
    });
  });

  /**
   * SSE message endpoint — intercept tool call messages sent via SSE transport.
   */
  app.post('/messages', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: -32700, message: 'Parse error: invalid JSON' } }, 400);
    }

    const result = await handleSingleRequest(body, c, interceptor, config);
    return c.json(result);
  });

  /**
   * Health check endpoint.
   */
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      mode: 'mcp-proxy',
      upstreamUrl: config.upstreamUrl,
      agentId: config.agentId,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Proxy info endpoint — returns proxy configuration for debugging.
   */
  app.get('/.well-known/agentguard-mcp', (c) => {
    return c.json({
      agentguard: {
        version: '1.0',
        mode: 'proxy',
        policyEnforcement: true,
        hitlEnabled: true,
        auditEnabled: true,
      },
    });
  });

  const start = async (): Promise<void> => {
    return new Promise((resolve) => {
      serverInstance = serve({
        fetch: app.fetch,
        port: config.port,
      });
      console.log(
        `[AgentGuard MCP Proxy] Listening on port ${config.port} → upstream: ${config.upstreamUrl}`,
      );
      resolve();
    });
  };

  const stop = (): void => {
    if (serverInstance && typeof (serverInstance as unknown as { close?: () => void }).close === 'function') {
      (serverInstance as unknown as { close: () => void }).close();
    }
  };

  return { app, start, stop };
}

// ─── Request handler ──────────────────────────────────────────────────────────

async function handleSingleRequest(
  body: unknown,
  c: { req: { header: (name: string) => string | undefined } },
  interceptor: McpInterceptor,
  config: McpProxyConfig,
): Promise<unknown> {
  if (!isValidMcpRequest(body)) {
    return { error: { code: -32600, message: 'Invalid Request: not a valid JSON-RPC request' } };
  }

  const request = body as { method: string; id?: string | number; params?: unknown };

  // Only intercept tools/call — pass everything else through
  if (request.method !== 'tools/call') {
    return forwardToUpstream(body, config);
  }

  const mcpRequest = body as McpToolCallRequest;
  const identity = buildIdentity(c, config);

  // Intercept the tool call
  const result = await interceptor.intercept(mcpRequest, identity);

  // If blocked — return error without forwarding
  if (!result.allowed && result.decision === 'block') {
    return interceptor.buildBlockedResponse(mcpRequest, result);
  }

  // If HITL pending — return pending status without forwarding
  if (result.decision === 'hitl') {
    return interceptor.buildHitlPendingResponse(mcpRequest, result);
  }

  // Allowed (or monitor) — forward to upstream MCP server
  const upstreamResponse = await forwardToUpstream(body, config);

  // Add AgentGuard metadata to response (non-breaking extension)
  if (typeof upstreamResponse === 'object' && upstreamResponse !== null) {
    (upstreamResponse as Record<string, unknown>)['_agentguard'] = {
      decision: result.decision,
      riskScore: result.riskScore,
      evaluationMs: result.evaluationMs,
      auditEventId: result.auditEventId,
    };
  }

  return upstreamResponse;
}

/**
 * Forward a JSON-RPC request to the upstream MCP server.
 */
async function forwardToUpstream(
  body: unknown,
  config: McpProxyConfig,
): Promise<unknown> {
  const timeoutMs = config.upstreamTimeoutMs ?? 30000;
  try {
    const response = await fetchWithTimeout(config.upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, timeoutMs);

    if (!response.ok) {
      return {
        error: {
          code: -32603,
          message: `Upstream MCP server error: ${response.status} ${response.statusText}`,
        },
      };
    }

    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        error: {
          code: -32603,
          message: `Upstream MCP server timed out after ${timeoutMs}ms`,
        },
      };
    }
    return {
      error: {
        code: -32603,
        message: `Failed to connect to upstream MCP server: ${String(err)}`,
      },
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidMcpRequest(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'method' in body &&
    typeof (body as { method: unknown }).method === 'string'
  );
}

function buildIdentity(
  c: { req: { header: (name: string) => string | undefined } },
  config: McpProxyConfig,
): McpAgentIdentity {
  const sessionId =
    c.req.header('x-session-id') ??
    `${config.sessionPrefix ?? 'mcp'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    agentId: config.agentId,
    sessionId,
    tenantId: 'proxy', // Will be resolved from API key by the service layer
    metadata: {
      proxyMode: true,
      upstreamUrl: config.upstreamUrl,
    },
  };
}

function buildForwardHeaders(
  headers: (name: string) => string | undefined,
): Record<string, string> {
  const forwarded: Record<string, string> = {};
  const passthrough = ['accept', 'content-type', 'x-session-id', 'x-trace-id'];
  for (const header of passthrough) {
    const val = headers(header);
    if (val) forwarded[header] = val;
  }
  return forwarded;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Convenience factory from env vars ────────────────────────────────────────

/**
 * Create MCP proxy config from environment variables.
 * Used when running AgentGuard as a standalone MCP proxy process.
 */
export function mcpProxyConfigFromEnv(): McpProxyConfig {
  const port = parseInt(process.env['AGENTGUARD_MCP_PROXY_PORT'] ?? '3100', 10);
  const upstreamUrl = process.env['AGENTGUARD_MCP_UPSTREAM_URL'] ?? 'http://localhost:3000';
  const agentguardUrl = process.env['AGENTGUARD_API_URL'] ?? 'http://localhost:3001';
  const agentguardApiKey = process.env['AGENTGUARD_API_KEY'] ?? '';
  const agentId = process.env['AGENTGUARD_AGENT_ID'] ?? '';
  const strict = process.env['AGENTGUARD_MCP_STRICT'] !== 'false';

  if (!agentguardApiKey) {
    console.warn('[AgentGuard MCP Proxy] WARNING: AGENTGUARD_API_KEY is not set');
  }
  if (!agentId) {
    console.warn('[AgentGuard MCP Proxy] WARNING: AGENTGUARD_AGENT_ID is not set');
  }

  return {
    port,
    upstreamUrl,
    agentguardUrl,
    agentguardApiKey,
    agentId,
    upstreamTimeoutMs: parseInt(process.env['AGENTGUARD_MCP_UPSTREAM_TIMEOUT_MS'] ?? '30000', 10),
    strict,
  };
}
