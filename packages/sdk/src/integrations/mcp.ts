/**
 * AgentGuard MCP Integration — Node SDK
 *
 * Provides MCP (Model Context Protocol) enforcement for Node.js MCP servers.
 *
 * Usage:
 * ```typescript
 * import { AgentGuard } from 'agentguard';
 * import { createMcpProxy, wrapMcpServer } from 'agentguard/mcp';
 *
 * // Option 1: Wrap an existing MCP server (in-process)
 * const server = new MyMcpServer();
 * const protected = agentguard.mcp.wrapServer(server, { agentId: 'my-agent' });
 *
 * // Option 2: Create a proxy MCP server
 * const proxy = agentguard.mcp.createProxy({
 *   upstreamUrl: 'http://localhost:3000',
 *   agentId: 'my-agent',
 *   port: 3100, // AGENTGUARD_MCP_PROXY_PORT
 * });
 * await proxy.start();
 * ```
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface McpProxyOptions {
  /** Port to listen on (default: 3100, or AGENTGUARD_MCP_PROXY_PORT env var) */
  port?: number;
  /** Upstream MCP server URL */
  upstreamUrl: string;
  /** AgentGuard agent ID */
  agentId: string;
  /** AgentGuard API base URL (default: https://api.agentguard.tech) */
  agentguardUrl?: string;
  /** AgentGuard API key (default: AGENTGUARD_API_KEY env var) */
  apiKey?: string;
  /** Session ID prefix */
  sessionPrefix?: string;
  /** Upstream request timeout in ms (default: 30000) */
  upstreamTimeoutMs?: number;
  /** Block on policy eval errors (default: true) */
  strict?: boolean;
}

export interface McpServerWrapOptions {
  /** AgentGuard agent ID */
  agentId: string;
  /** Session ID (or prefix for generated IDs) */
  sessionId?: string;
  /** AgentGuard API base URL */
  agentguardUrl?: string;
  /** AgentGuard API key */
  apiKey?: string;
  /** Block on policy eval errors */
  strict?: boolean;
}

export interface McpInterceptResult {
  allowed: boolean;
  decision: 'allow' | 'block' | 'hitl' | 'monitor';
  reason: string;
  riskScore: number;
  matchedRuleId?: string | null;
  gateId?: string | null;
  gateTimeoutSec?: number | null;
  evaluationMs: number;
}

export interface McpProxyServer {
  /** Start the proxy server */
  start(): Promise<void>;
  /** Stop the proxy server */
  stop(): void;
  /** The port the server is listening on */
  port: number;
}

// ─── McpClient — calls AgentGuard API for policy evaluation ──────────────────

class McpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly agentId: string;

  constructor(options: { baseUrl: string; apiKey: string; agentId: string }) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.agentId = options.agentId;
  }

  async intercept(
    toolName: string,
    args: Record<string, unknown>,
    sessionId: string,
  ): Promise<McpInterceptResult> {
    const response = await fetch(`${this.baseUrl}/v1/mcp/intercept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        request: {
          method: 'tools/call',
          id: `sdk-${Date.now()}`,
          params: { name: toolName, arguments: args },
        },
        identity: {
          agentId: this.agentId,
          sessionId,
        },
      }),
    });

    const data = await response.json() as McpInterceptResult;
    return data;
  }
}

// ─── createProxy — creates a standalone MCP proxy server ─────────────────────

/**
 * Create an MCP proxy server that intercepts tool calls.
 *
 * The proxy sits transparently between the AI agent and the MCP server:
 *   Agent → AgentGuard MCP Proxy (port 3100) → Upstream MCP Server
 *
 * @param options - Proxy configuration
 * @returns McpProxyServer with start/stop methods
 *
 * @example
 * ```typescript
 * const proxy = createMcpProxy({
 *   upstreamUrl: 'http://localhost:3000',
 *   agentId: 'my-agent',
 *   port: 3100,
 * });
 * await proxy.start();
 * console.log('MCP proxy running on port 3100');
 * ```
 */
export function createMcpProxy(options: McpProxyOptions): McpProxyServer {
  const port = options.port ?? parseInt(process.env['AGENTGUARD_MCP_PROXY_PORT'] ?? '3100', 10);
  const apiKey = options.apiKey ?? process.env['AGENTGUARD_API_KEY'] ?? '';
  const agentguardUrl = options.agentguardUrl ?? process.env['AGENTGUARD_API_URL'] ?? 'https://api.agentguard.tech';
  const client = new McpClient({ baseUrl: agentguardUrl, apiKey, agentId: options.agentId });

  let server: { close: () => void } | null = null;
  const upstreamTimeoutMs = options.upstreamTimeoutMs ?? 30000;

  const start = async (): Promise<void> => {
    // Dynamically import Hono to avoid hard dependency when proxy mode isn't used
    const { Hono } = await import('hono');
    const { serve } = await import('@hono/node-server');

    const app = new Hono();

    // Intercept POST requests (JSON-RPC)
    app.post('/', async (c) => {
      const body = await c.req.json<{ method?: string; id?: string | number; params?: { name?: string; arguments?: Record<string, unknown> } }>().catch(() => null);

      if (!body) {
        return c.json({ error: { code: -32700, message: 'Parse error' } }, 400);
      }

      // Only intercept tools/call
      if (body.method !== 'tools/call') {
        return c.json(await forwardRequest(options.upstreamUrl, body, upstreamTimeoutMs));
      }

      const toolName = body.params?.name ?? '';
      const toolArgs = body.params?.arguments ?? {};
      const sessionId = c.req.header('x-session-id') ??
        `${options.sessionPrefix ?? 'mcp'}_${Date.now()}`;

      // Evaluate against policy
      let result: McpInterceptResult;
      try {
        result = await client.intercept(toolName, toolArgs, sessionId);
      } catch (err) {
        if (options.strict !== false) {
          return c.json({
            id: body.id,
            error: { code: -32603, message: `AgentGuard policy evaluation failed: ${String(err)}` },
          }, 503);
        }
        // Permissive mode — allow on error
        return c.json(await forwardRequest(options.upstreamUrl, body, upstreamTimeoutMs));
      }

      // Handle blocked
      if (!result.allowed && result.decision === 'block') {
        return c.json({
          id: body.id,
          error: {
            code: -32603,
            message: `Tool call blocked by AgentGuard: ${result.reason}`,
            data: { decision: result.decision, riskScore: result.riskScore },
          },
        }, 403);
      }

      // Handle HITL pending
      if (result.decision === 'hitl') {
        return c.json({
          id: body.id,
          result: {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'hitl_pending',
                gateId: result.gateId,
                gateTimeoutSec: result.gateTimeoutSec,
                message: 'Tool call pending human approval',
              }),
            }],
          },
        }, 202);
      }

      // Allowed — forward to upstream
      const upstream = await forwardRequest(options.upstreamUrl, body, upstreamTimeoutMs);
      return c.json(upstream);
    });

    app.get('/health', (c) => c.json({ status: 'ok', agentId: options.agentId, port }));

    return new Promise<void>((resolve) => {
      const s = serve({ fetch: app.fetch, port });
      server = s as unknown as { close: () => void };
      console.log(`[AgentGuard MCP Proxy] Listening on :${port} → ${options.upstreamUrl}`);
      resolve();
    });
  };

  const stop = (): void => {
    if (server?.close) server.close();
  };

  return { start, stop, port };
}

// ─── wrapMcpServer — wraps an MCP server object in-process ───────────────────

/**
 * Wrap an existing MCP server with AgentGuard policy enforcement.
 *
 * This wraps the server's tool handler to intercept every tool call
 * before execution, evaluating it against the agent's policy.
 *
 * @param server - An MCP server instance with a `handleToolCall` method
 * @param options - Wrap options
 * @returns A wrapped server with the same interface
 *
 * @example
 * ```typescript
 * import { Server } from '@modelcontextprotocol/sdk/server/index.js';
 * import { wrapMcpServer } from 'agentguard/mcp';
 *
 * const server = new Server({ name: 'my-server', version: '1.0' });
 * const protected = wrapMcpServer(server, { agentId: 'my-agent' });
 *
 * // Use protected instead of server
 * protected.connect(transport);
 * ```
 */
export function wrapMcpServer<T extends Record<string, unknown>>(
  server: T,
  options: McpServerWrapOptions,
): T {
  const apiKey = options.apiKey ?? process.env['AGENTGUARD_API_KEY'] ?? '';
  const agentguardUrl = options.agentguardUrl ?? process.env['AGENTGUARD_API_URL'] ?? 'https://api.agentguard.tech';
  const client = new McpClient({ baseUrl: agentguardUrl, apiKey, agentId: options.agentId });

  // Create a proxy that intercepts tool call handler methods
  return new Proxy(server, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop as string];

      // Wrap setRequestHandler to intercept tools/call registration
      if (prop === 'setRequestHandler' && typeof value === 'function') {
        return function (schema: unknown, handler: (...args: unknown[]) => Promise<unknown>) {
          // Check if this is a tools/call handler
          const schemaAny = schema as { method?: string };
          if (schemaAny?.method === 'tools/call') {
            const wrappedHandler = async (...args: unknown[]) => {
              const requestArg = args[0] as { params?: { name?: string; arguments?: Record<string, unknown> } };
              const toolName = requestArg?.params?.name ?? 'unknown';
              const toolArgs = requestArg?.params?.arguments ?? {};
              const sessionId = options.sessionId ?? `server-${Date.now()}`;

              // Evaluate policy
              let result: McpInterceptResult;
              try {
                result = await client.intercept(toolName, toolArgs, sessionId);
              } catch (err) {
                if (options.strict !== false) {
                  throw new Error(`AgentGuard policy evaluation failed: ${String(err)}`);
                }
                // Allow on error in permissive mode
                return handler(...args);
              }

              if (!result.allowed && result.decision === 'block') {
                throw new Error(`AgentGuard: Tool "${toolName}" blocked — ${result.reason}`);
              }

              if (result.decision === 'hitl') {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      status: 'hitl_pending',
                      gateId: result.gateId,
                      message: `Tool "${toolName}" requires human approval`,
                    }),
                  }],
                };
              }

              return handler(...args);
            };

            return (value as (...a: unknown[]) => unknown).call(target, schema, wrappedHandler);
          }

          return (value as (...a: unknown[]) => unknown).call(target, schema, handler);
        };
      }

      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }

      return value;
    },
  }) as T;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function forwardRequest(
  upstreamUrl: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}
