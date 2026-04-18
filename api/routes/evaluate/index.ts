/**
 * AgentGuard — Evaluate Routes
 *
 * POST /api/v1/evaluate  — stateless policy evaluation with optional tenant auth
 * GET  /api/v1/evaluate  — discovery/help response
 */
import { Router, Request, Response } from 'express';
import { logger } from '../../lib/logger.js';
import { EvaluateRequest } from '../../schemas.js';
import type { IDatabase } from '../../db-interface.js';
import type { AuthMiddleware } from '../../middleware/auth.js';
import { checkRateLimit } from '../../lib/rate-limit-db.js';
import { checkKillSwitches, checkChildAgent, NOOP_PREV_HASH } from './helpers.js';
import { processEvaluation } from './policy.js';

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
      const tenantId = req.tenantId ?? 'demo';
      const agentId = req.agent?.id ?? null;

      const rawKey = req.headers['x-api-key'] as string | undefined;
      if (rawKey?.startsWith('ag_agent_') && !req.agent) {
        return res.status(401).json({ error: 'Invalid or inactive agent key' });
      }

      // Check custom rate limits (Phase 2)
      if (tenantId !== 'demo') {
        try {
          const rateLimitResult = await checkRateLimit(db, tenantId, req.agent?.id);
          if (!rateLimitResult.allowed) {
            return res.status(429).json({
              error: 'Rate limit exceeded', remaining: 0, resetAt: rateLimitResult.resetAt,
              signup: { hint: 'Sign up for a free API key to get higher rate limits', method: 'POST',
                url: 'https://api.agentguard.tech/api/v1/signup', body: { name: 'Your Agent Name' } },
            });
          }
        } catch { /* Phase 2 tables may not exist yet */ }
      }

      // Kill switch checks
      const ksResult = await checkKillSwitches(db, tenantId, req.body?.tool ?? 'unknown', agentId, req.tenant);
      if (ksResult.blocked) {
        return res.json(ksResult.response);
      }

      // Child agent checks
      const childResult = await checkChildAgent(db, tenantId, req.body?.tool ?? 'unknown', agentId);
      if (childResult.blocked) {
        return res.json(childResult.response);
      }

      // Validate request body
      const evalParsed = EvaluateRequest.safeParse(req.body ?? {});
      if (!evalParsed.success) {
        const firstIssue = evalParsed.error.issues[0]!;
        const fieldPath = firstIssue.path.join('.') || 'body';
        return res.status(400).json({
          error: 'validation_error', field: fieldPath, expected: firstIssue.message,
          received: fieldPath === 'body' ? typeof req.body : typeof (req.body as Record<string, unknown>)[fieldPath],
          docs: 'https://agentguard.tech/docs/api#evaluate',
        });
      }
      const { tool, params } = evalParsed.data;

      // Run core evaluation
      try {
        const result = await processEvaluation({
          db, tenantId, agentId, tool, params,
          evalParsed, childAgentPolicy: childResult.policy, req,
        });

        if (result.decision.result === 'block' && result.ms === 0 && (result.decision.matchedRuleId === 'CHILD_POLICY_VIOLATION' || result.decision.matchedRuleId === 'INJECTION_DETECTED')) {
          return res.json({
            result: result.decision.result, matchedRuleId: result.decision.matchedRuleId,
            riskScore: result.decision.riskScore, reason: result.decision.reason, durationMs: 0,
            ...(agentId ? { agentId } : {}),
          });
        }

        res.json({
          result: result.decision.result, matchedRuleId: result.decision.matchedRuleId,
          riskScore: result.decision.riskScore, reason: result.decision.reason, durationMs: result.ms,
          ...(result.enriched.suggestion ? { suggestion: result.enriched.suggestion } : {}),
          ...(result.enriched.docs ? { docs: result.enriched.docs } : {}),
          ...(result.enriched.alternatives !== undefined ? { alternatives: result.enriched.alternatives } : {}),
          ...(result.isCatchAllAllow ? { notice: 'Allowed by default policy. Configure a custom policy for production use at PUT /api/v1/policy.' } : {}),
          ...(agentId ? { agentId } : {}),
          ...(result.approvalId ? { approvalId: result.approvalId } : {}),
          ...(result.approvalId ? { approvalUrl: `https://app.agentguard.tech/approvals/${result.approvalId}` } : {}),
          ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
          ...(result.piiBlock ? { pii: result.piiBlock } : {}),
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'Evaluation failed. Please try again.') {
          return res.status(500).json({ error: err.message });
        }
        throw err;
      }
    },
  );

  return router;
}
