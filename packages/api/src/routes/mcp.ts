/**
 * MCP Enforcement Routes
 *
 * POST /v1/mcp/intercept    — evaluate an MCP tool call against policy
 * POST /v1/mcp/proxy/start  — start the MCP proxy server (admin)
 * GET  /v1/mcp/config       — get current MCP proxy configuration
 *
 * The /intercept endpoint is the primary integration point for:
 * 1. SDK wrappers that call it before forwarding to the MCP server
 * 2. The built-in MCP proxy mode (McpProxy → this endpoint)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { McpInterceptor } from '../services/mcp/mcp-interceptor.js';
import { ValidationError } from '../lib/errors.js';
import type { McpToolCallRequest, McpAgentIdentity } from '../services/mcp/types.js';

export const mcpRouter = new Hono();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const McpInterceptRequestSchema = z.object({
  /** The MCP tool call request to evaluate */
  request: z.object({
    method: z.literal('tools/call'),
    id: z.union([z.string(), z.number()]).optional(),
    params: z.object({
      name: z.string().min(1),
      arguments: z.record(z.unknown()).optional(),
    }),
  }),
  /** Agent identity context */
  identity: z.object({
    agentId: z.string().min(1),
    sessionId: z.string().min(1),
    tenantId: z.string().optional(),
    remoteAddress: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  /** Interceptor options */
  options: z.object({
    strict: z.boolean().optional(),
    skipAudit: z.boolean().optional(),
  }).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /v1/mcp/intercept
 *
 * Evaluate an MCP tool call against the agent's active policy.
 * Returns the policy decision and whether the call is permitted.
 *
 * Used by:
 * - AgentGuard Node SDK: `agentguard.mcp.createProxy(config)`
 * - AgentGuard Python SDK: `agentguard.mcp.wrap_server(server)`
 * - Direct API integrations
 */
mcpRouter.post('/intercept', async (c) => {
  const ctx = getContext(c);

  const body = await c.req.json<unknown>().catch(() => null);
  if (!body) {
    throw new ValidationError({ body: 'Request body must be valid JSON' });
  }

  const parsed = McpInterceptRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues);
  }

  const { request, identity, options } = parsed.data;

  // Use the authenticated tenant context, allowing override from identity if admin
  const effectiveIdentity: McpAgentIdentity = {
    ...identity,
    tenantId: ctx.tenantId,
  };

  const interceptor = new McpInterceptor(prisma, redis, ctx, {
    strict: options?.strict,
    skipAudit: options?.skipAudit,
  });

  const result = await interceptor.intercept(
    request as McpToolCallRequest,
    effectiveIdentity,
  );

  const status = result.allowed ? 200 : (result.decision === 'hitl' ? 202 : 403);

  return c.json(
    {
      allowed: result.allowed,
      decision: result.decision,
      reason: result.reason,
      riskScore: result.riskScore,
      matchedRuleId: result.matchedRuleId,
      gateId: result.gateId,
      gateTimeoutSec: result.gateTimeoutSec,
      auditEventId: result.auditEventId,
      evaluationMs: result.evaluationMs,
    },
    status,
  );
});

/**
 * GET /v1/mcp/config
 *
 * Returns current MCP proxy configuration and status.
 * Useful for debugging and monitoring.
 */
mcpRouter.get('/config', (c) => {
  return c.json({
    proxyMode: {
      enabled: Boolean(process.env['AGENTGUARD_MCP_PROXY_PORT']),
      port: parseInt(process.env['AGENTGUARD_MCP_PROXY_PORT'] ?? '3100', 10),
      upstreamUrl: process.env['AGENTGUARD_MCP_UPSTREAM_URL'] ?? null,
      strict: process.env['AGENTGUARD_MCP_STRICT'] !== 'false',
    },
    interceptor: {
      version: '1.0',
      auditEnabled: true,
      hitlEnabled: true,
      killSwitchEnabled: true,
    },
    supportedMethods: ['tools/call'],
    policyCheckTypes: ['mcp_tool_access', 'standard_rules'],
  });
});

/**
 * POST /v1/mcp/evaluate-batch
 *
 * Evaluate multiple MCP tool calls in a single request.
 * Useful for pre-validation or dry-run testing of policies.
 */
mcpRouter.post('/evaluate-batch', async (c) => {
  const ctx = getContext(c);

  const body = await c.req.json<unknown>().catch(() => null);
  if (!body || typeof body !== 'object' || !Array.isArray((body as { requests?: unknown }).requests)) {
    throw new ValidationError({ body: 'Request body must contain a "requests" array' });
  }

  const { requests, agentId, sessionId } = body as {
    requests: unknown[];
    agentId: string;
    sessionId: string;
  };

  if (!agentId || typeof agentId !== 'string') {
    throw new ValidationError({ agentId: 'agentId is required' });
  }

  const identity: McpAgentIdentity = {
    agentId,
    sessionId: sessionId ?? `batch_${Date.now()}`,
    tenantId: ctx.tenantId,
  };

  const interceptor = new McpInterceptor(prisma, redis, ctx, { skipAudit: true });

  const results = await Promise.all(
    requests.map(async (req) => {
      if (!req || typeof req !== 'object' || (req as { method?: unknown }).method !== 'tools/call') {
        return {
          error: 'Invalid request — must be a tools/call MCP request',
        };
      }

      try {
        return await interceptor.intercept(req as McpToolCallRequest, identity);
      } catch (err) {
        return { error: String(err) };
      }
    }),
  );

  return c.json({ results });
});
