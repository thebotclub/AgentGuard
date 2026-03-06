/**
 * AgentGuard — MCP Server Policy Enforcement Routes
 *
 * POST /api/v1/mcp/evaluate        — evaluate an MCP tool call with SSRF protection
 * POST /api/v1/mcp/servers         — register an MCP server
 * GET  /api/v1/mcp/servers         — list registered MCP servers
 * DELETE /api/v1/mcp/servers/:id   — remove an MCP server
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { PolicyEngine } from '../../packages/sdk/src/core/policy-engine.js';
import type { ActionRequest, AgentContext } from '../../packages/sdk/src/core/types.js';
import { DEFAULT_POLICY } from '../lib/policy-engine-setup.js';
import { checkArgumentsForSsrf } from '../lib/mcp-ssrf.js';
import {
  McpEvaluateRequestSchema,
  RegisterMcpServerRequestSchema,
} from '../schemas.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

// ── Route factory ──────────────────────────────────────────────────────────

export function createMcpPolicyRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── POST /api/v1/mcp/evaluate ───────────────────────────────────────────
  router.post(
    '/api/v1/mcp/evaluate',
    auth.requireEvaluateAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId ?? 'demo';
      const agentId = req.agent?.id ?? null;

      const parsed = McpEvaluateRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]!.message });
      }

      const { server, tool, arguments: toolArguments, agentId: bodyAgentId } = parsed.data;
      const resolvedAgentId = bodyAgentId ?? agentId ?? 'mcp-agent';

      // ── SSRF protection: scan URL args ──────────────────────────────────
      const ssrfResult = checkArgumentsForSsrf(toolArguments ?? {});
      if (!ssrfResult.safe) {
        return res.status(200).json({
          action: 'block',
          reason: ssrfResult.reason ?? 'SSRF risk detected in tool arguments',
        });
      }

      // ── Check MCP server registry tool allowlist/blocklist ──────────────
      if (server) {
        try {
          const servers = await db.listMcpServers(tenantId);
          const registeredServer = servers.find((s) => s.name === server || s.id === server);

          if (registeredServer) {
            const allowedTools: string[] = JSON.parse(registeredServer.allowed_tools) as string[];
            const blockedTools: string[] = JSON.parse(registeredServer.blocked_tools) as string[];

            // Blocklist takes priority
            if (blockedTools.length > 0 && blockedTools.includes(tool)) {
              return res.status(200).json({
                action: 'block',
                reason: `Tool '${tool}' is in the blocklist for MCP server '${server}'`,
              });
            }

            // Allowlist enforcement (only if non-empty)
            if (allowedTools.length > 0 && !allowedTools.includes(tool)) {
              return res.status(200).json({
                action: 'block',
                reason: `Tool '${tool}' is not in the allowlist for MCP server '${server}'`,
              });
            }
          }
        } catch {
          // Non-blocking: continue to policy engine if registry check fails
        }
      }

      // ── Run through the policy engine ───────────────────────────────────
      const engine = new PolicyEngine();
      engine.registerDocument(DEFAULT_POLICY);

      const actionRequest: ActionRequest = {
        id: crypto.randomUUID(),
        agentId: resolvedAgentId,
        tool,
        params: toolArguments ?? {},
        inputDataLabels: [],
        timestamp: new Date().toISOString(),
      };
      const ctx: AgentContext = {
        agentId: resolvedAgentId,
        sessionId: crypto.randomUUID(),
        policyVersion: '1.0.0',
      };

      let decision;
      try {
        decision = engine.evaluate(actionRequest, ctx, DEFAULT_POLICY.id);
      } catch {
        return res.status(500).json({ error: 'Evaluation failed. Please try again.' });
      }

      // Map policy decision result to mcp-policy action format
      const action = decision.result === 'monitor' ? 'warn' : decision.result;

      return res.status(200).json({
        action,
        ...(decision.reason ? { reason: decision.reason } : {}),
      });
    },
  );

  // ── POST /api/v1/mcp/servers ────────────────────────────────────────────
  router.post(
    '/api/v1/mcp/servers',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      const parsed = RegisterMcpServerRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]!.message });
      }

      const { name, url, allowedTools = [], blockedTools = [] } = parsed.data;

      try {
        const server = await db.insertMcpServer(tenantId, name, url, allowedTools, blockedTools);
        return res.status(201).json({
          server: {
            id: server.id,
            name: server.name,
            url: server.url,
            allowedTools: JSON.parse(server.allowed_tools) as string[],
            blockedTools: JSON.parse(server.blocked_tools) as string[],
            createdAt: server.created_at,
          },
        });
      } catch (e) {
        console.error('[mcp/servers] insert error:', e);
        return res.status(500).json({ error: 'Failed to register MCP server' });
      }
    },
  );

  // ── GET /api/v1/mcp/servers ─────────────────────────────────────────────
  router.get(
    '/api/v1/mcp/servers',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      try {
        const servers = await db.listMcpServers(tenantId);
        return res.status(200).json({
          servers: servers.map((s) => ({
            id: s.id,
            name: s.name,
            url: s.url,
            allowedTools: JSON.parse(s.allowed_tools) as string[],
            blockedTools: JSON.parse(s.blocked_tools) as string[],
            createdAt: s.created_at,
          })),
          count: servers.length,
        });
      } catch (e) {
        console.error('[mcp/servers] list error:', e);
        return res.status(500).json({ error: 'Failed to list MCP servers' });
      }
    },
  );

  // ── DELETE /api/v1/mcp/servers/:serverId ────────────────────────────────
  router.delete(
    '/api/v1/mcp/servers/:serverId',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const serverId = req.params['serverId'] as string;

      try {
        const existing = await db.getMcpServer(serverId, tenantId);
        if (!existing) {
          return res.status(404).json({ error: 'MCP server not found' });
        }

        await db.deleteMcpServer(serverId, tenantId);
        return res.status(200).json({ deleted: true });
      } catch (e) {
        console.error('[mcp/servers] delete error:', e);
        return res.status(500).json({ error: 'Failed to delete MCP server' });
      }
    },
  );

  return router;
}
