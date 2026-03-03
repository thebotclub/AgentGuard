/**
 * AgentGuard — Evaluate Routes
 *
 * POST /api/v1/evaluate  — stateless policy evaluation with optional tenant auth
 * GET  /api/v1/evaluate  — discovery/help response
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { PolicyEngine } from '../../packages/sdk/src/core/policy-engine.js';
import type {
  ActionRequest,
  AgentContext,
  PolicyDecision,
} from '../../packages/sdk/src/core/types.js';
import { EvaluateRequest } from '../schemas.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { checkRateLimit as checkPhase2RateLimit, incrementRateCounter } from '../phase2-routes.js';
import { DEFAULT_POLICY } from '../lib/policy-engine-setup.js';
import { getGlobalKillSwitch, getLastHash, storeAuditEvent, fireWebhooksAsync } from './audit.js';

export function createEvaluateRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── GET /api/v1/evaluate — discovery ─────────────────────────────────────
  router.get('/api/v1/evaluate', (_req: Request, res: Response) => {
    res.json({
      endpoint: 'POST /api/v1/evaluate',
      method: 'POST required',
      description: 'Evaluate an agent action against the policy engine',
      example: {
        curl: 'curl -X POST https://api.agentguard.tech/api/v1/evaluate -H "Content-Type: application/json" -d \'{"tool":"sudo","params":{"command":"cat /etc/shadow"}}\'',
        body: { tool: 'sudo', params: { command: 'cat /etc/shadow' } },
      },
      try_interactive: 'https://app.agentguard.tech',
    });
  });

  // ── POST /api/v1/evaluate ─────────────────────────────────────────────────
  router.post(
    '/api/v1/evaluate',
    auth.requireEvaluateAuth,
    async (req: Request, res: Response) => {
      const ks = await getGlobalKillSwitch(db);
      const tenantId = req.tenantId ?? 'demo';
      const agentId = req.agent?.id ?? null;

      const rawKey = req.headers['x-api-key'] as string | undefined;
      if (rawKey?.startsWith('ag_agent_') && !req.agent) {
        return res.status(401).json({ error: 'Invalid or inactive agent key' });
      }

      // Check custom rate limits (Phase 2) — gracefully skip if tables don't exist yet
      if (tenantId !== 'demo') {
        try {
          const rateLimitResult = await checkPhase2RateLimit(db, tenantId, req.agent?.id);
          if (!rateLimitResult.allowed) {
            return res.status(429).json({
              error: 'Rate limit exceeded',
              remaining: 0,
              resetAt: rateLimitResult.resetAt,
            });
          }
        } catch {
          // Phase 2 tables may not exist yet — skip rate limiting
        }
      }

      // Check global kill switch
      if (ks.active) {
        const prevHash = await getLastHash(db, tenantId);
        await storeAuditEvent(
          db,
          tenantId,
          null,
          req.body?.tool ?? 'unknown',
          'block',
          'KILL_SWITCH',
          1000,
          'Global kill switch active',
          0,
          prevHash,
          agentId,
        );
        if (tenantId !== 'demo') {
          fireWebhooksAsync(db, tenantId, 'killswitch', {
            event_type: 'killswitch',
            tenant_id: tenantId,
            agent_id: agentId,
            data: {
              decision: 'block',
              rule: 'KILL_SWITCH',
              tool: req.body?.tool ?? 'unknown',
            },
            timestamp: new Date().toISOString(),
          });
        }
        return res.json({
          result: 'block',
          matchedRuleId: 'KILL_SWITCH',
          riskScore: 1000,
          reason: 'Global kill switch is ACTIVE — all agent actions are blocked.',
          durationMs: 0,
          killSwitchActive: true,
        });
      }

      // Check tenant-level kill switch
      if (req.tenant && req.tenant.kill_switch_active === 1) {
        const prevHash = await getLastHash(db, tenantId);
        await storeAuditEvent(
          db,
          tenantId,
          null,
          req.body?.tool ?? 'unknown',
          'block',
          'TENANT_KILL_SWITCH',
          1000,
          'Tenant kill switch active',
          0,
          prevHash,
          agentId,
        );
        fireWebhooksAsync(db, tenantId, 'killswitch', {
          event_type: 'killswitch',
          tenant_id: tenantId,
          agent_id: agentId,
          data: {
            decision: 'block',
            rule: 'TENANT_KILL_SWITCH',
            tool: req.body?.tool ?? 'unknown',
          },
          timestamp: new Date().toISOString(),
        });
        return res.json({
          result: 'block',
          matchedRuleId: 'TENANT_KILL_SWITCH',
          riskScore: 1000,
          reason: 'Tenant kill switch is ACTIVE — all your agent actions are blocked.',
          durationMs: 0,
          killSwitchActive: true,
        });
      }

      const evalParsed = EvaluateRequest.safeParse(req.body ?? {});
      if (!evalParsed.success) {
        return res.status(400).json({ error: evalParsed.error.issues[0]!.message });
      }
      const { tool, params } = evalParsed.data;
      if (tool.length > 200) {
        return res.status(400).json({ error: 'tool name too long (max 200 chars)' });
      }

      const engine = new PolicyEngine();
      engine.registerDocument(DEFAULT_POLICY);

      const resolvedAgentId = req.agent ? req.agent.name : 'quick-eval';
      const actionRequest: ActionRequest = {
        id: crypto.randomUUID(),
        agentId: resolvedAgentId,
        tool,
        params:
          typeof params === 'object' && params !== null
            ? (params as Record<string, unknown>)
            : {},
        inputDataLabels: [],
        timestamp: new Date().toISOString(),
      };
      const ctx: AgentContext = {
        agentId: resolvedAgentId,
        sessionId: crypto.randomUUID(),
        policyVersion: '1.0.0',
      };

      const start = performance.now();
      let decision: PolicyDecision;
      try {
        decision = engine.evaluate(actionRequest, ctx, DEFAULT_POLICY.id);
      } catch (_e: unknown) {
        return res.status(500).json({ error: 'Evaluation failed. Please try again.' });
      }
      const ms = Math.round((performance.now() - start) * 100) / 100;

      const prevHash = await getLastHash(db, tenantId);
      await storeAuditEvent(
        db,
        tenantId,
        ctx.sessionId,
        tool,
        decision.result,
        decision.matchedRuleId ?? null,
        decision.riskScore,
        decision.reason ?? null,
        ms,
        prevHash,
        agentId,
      );

      // Increment custom rate limit counter after successful evaluation
      if (tenantId !== 'demo') {
        try {
          await incrementRateCounter(db, tenantId, req.agent?.id);
        } catch {
          // Phase 2 tables may not exist
        }
      }

      // Fire webhooks async for block/killswitch events
      if (
        (decision.result === 'block' || decision.result === 'require_approval') &&
        tenantId !== 'demo'
      ) {
        fireWebhooksAsync(
          db,
          tenantId,
          decision.result === 'require_approval' ? 'hitl' : 'block',
          {
            event_type: decision.result === 'require_approval' ? 'hitl' : 'block',
            tenant_id: tenantId,
            agent_id: agentId,
            data: {
              decision: decision.result,
              tool,
              rule_matched: decision.matchedRuleId ?? null,
              risk_score: decision.riskScore,
              reason: decision.reason ?? null,
            },
            timestamp: new Date().toISOString(),
          },
        );
      }

      res.json({
        result: decision.result,
        matchedRuleId: decision.matchedRuleId,
        riskScore: decision.riskScore,
        reason: decision.reason,
        durationMs: ms,
        ...(agentId ? { agentId } : {}),
      });
    },
  );

  return router;
}
