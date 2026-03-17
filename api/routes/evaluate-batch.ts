/**
 * AgentGuard — Batch Evaluate Route
 * POST /api/v1/evaluate/batch
 *
 * Evaluates up to 50 tool calls in a single request, all in parallel.
 * Each call goes through the same policy engine as /evaluate.
 * Individual call failures do not fail the batch.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { PolicyEngine } from '../../packages/sdk/src/core/policy-engine.js';
import type { ActionRequest, AgentContext } from '../../packages/sdk/src/core/types.js';
import { BatchEvaluateRequestSchema } from '../schemas.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { getGlobalKillSwitch, storeAuditEvent, fireWebhooksAsync } from './audit.js';
import { checkRateLimit as checkPhase2RateLimit, incrementRateCounter } from '../lib/rate-limit-db.js';
import { DEFAULT_POLICY } from '../lib/policy-engine-setup.js';
import { createPendingApproval } from './approvals.js';
import { enrichDecision } from '../lib/decision-enricher.js';

// Constant for audit event chain (no longer used for hashing — kept for API compat)
const NOOP_PREV_HASH = '';

export function createBatchEvaluateRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  router.post(
    '/api/v1/evaluate/batch',
    auth.requireEvaluateAuth,
    async (req: Request, res: Response) => {
      const batchStart = performance.now();
      const batchId = crypto.randomUUID();
      const tenantId = req.tenantId ?? 'demo';
      const agentId = req.agent?.id ?? null;

      // ── 1. Validate request ──────────────────────────────────────────────
      const parsed = BatchEvaluateRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]!;
        return res.status(400).json({
          error: 'validation_error',
          field: firstIssue.path.join('.') || 'calls',
          expected: firstIssue.message,
          received: typeof req.body,
        });
      }
      const { calls, sessionId } = parsed.data;

      // ── 2. Kill switch checks (shared — fail-fast before per-call work) ──
      const ks = await getGlobalKillSwitch(db);
      if (ks.active) {
        const results = calls.map((call, index) => ({
          index,
          tool: call.tool,
          decision: 'block' as const,
          riskScore: 1000,
          matchedRuleId: 'KILL_SWITCH',
          durationMs: 0,
          reason: 'Global kill switch is ACTIVE — all agent actions are blocked.',
          suggestion: 'All actions are blocked. Contact your system administrator.',
          docs: 'https://agentguard.tech/docs/kill-switch',
          alternatives: [] as string[],
        }));
        return res.json({
          batchId,
          results,
          summary: {
            total: calls.length,
            allowed: 0,
            monitored: 0,
            blocked: calls.length,
            requireApproval: 0,
          },
          batchDurationMs: Math.round(performance.now() - batchStart),
        });
      }

      if (req.tenant?.kill_switch_active === 1) {
        const results = calls.map((call, index) => ({
          index,
          tool: call.tool,
          decision: 'block' as const,
          riskScore: 1000,
          matchedRuleId: 'TENANT_KILL_SWITCH',
          durationMs: 0,
          reason: 'Tenant kill switch is ACTIVE — all your agent actions are blocked.',
          suggestion: 'Your account kill switch is active. Log into the dashboard to deactivate it.',
          docs: 'https://agentguard.tech/docs/kill-switch',
          alternatives: [] as string[],
        }));
        return res.json({
          batchId,
          results,
          summary: {
            total: calls.length,
            allowed: 0,
            monitored: 0,
            blocked: calls.length,
            requireApproval: 0,
          },
          batchDurationMs: Math.round(performance.now() - batchStart),
        });
      }

      // ── 3. Phase 2 rate limiting (checked once for the whole batch) ──────
      if (tenantId !== 'demo') {
        try {
          const rateLimitResult = await checkPhase2RateLimit(db, tenantId, agentId ?? undefined);
          if (!rateLimitResult.allowed) {
            return res.status(429).json({
              error: 'rate_limit_exceeded',
              retryAfter: Math.ceil(
                (new Date(rateLimitResult.resetAt ?? Date.now() + 60000).getTime() - Date.now()) / 1000,
              ),
              message: 'Rate limit exceeded. Please wait before retrying.',
              signup: {
                hint: 'Sign up for a free API key to get higher rate limits',
                method: 'POST',
                url: 'https://api.agentguard.tech/api/v1/signup',
                body: { name: 'Your Agent Name' },
              },
            });
          }
        } catch {
          // Phase 2 tables may not exist yet — skip
        }
      }

      // ── 4. Load effective policy once (shared across all calls) ──────────
      let effectivePolicy = DEFAULT_POLICY;
      if (tenantId !== 'demo') {
        try {
          const customPolicyRaw = await db.getCustomPolicy(tenantId);
          if (customPolicyRaw) {
            const p = JSON.parse(customPolicyRaw) as unknown;
            if (Array.isArray(p)) {
              effectivePolicy = { ...DEFAULT_POLICY, rules: p as typeof DEFAULT_POLICY['rules'] };
            } else if (p && typeof p === 'object') {
              effectivePolicy = p as typeof DEFAULT_POLICY;
            }
          }
        } catch {
          // Fall back to default policy
        }
      }

      // ── 5. Evaluate all calls in parallel ────────────────────────────────
      const resolvedSessionId = sessionId ?? batchId; // use batchId as session if none provided

      const evaluationPromises = calls.map(async (call, index) => {
        const callStart = performance.now();
        try {
          const engine = new PolicyEngine();
          engine.registerDocument(effectivePolicy);

          const actionRequest: ActionRequest = {
            id: crypto.randomUUID(),
            agentId: req.agent?.name ?? 'batch-eval',
            tool: call.tool,
            params:
              typeof call.params === 'object' && call.params !== null
                ? (call.params as Record<string, unknown>)
                : {},
            inputDataLabels: [],
            timestamp: new Date().toISOString(),
          };

          const ctx: AgentContext = {
            agentId: req.agent?.name ?? 'batch-eval',
            sessionId: resolvedSessionId,
            policyVersion: '1.0.0',
          };

          const decision = engine.evaluate(actionRequest, ctx, effectivePolicy.id);
          const durationMs = Math.round((performance.now() - callStart) * 100) / 100;

          // Store audit event (non-blocking — catch individually)
          storeAuditEvent(
            db,
            tenantId,
            resolvedSessionId,
            call.tool,
            decision.result,
            decision.matchedRuleId ?? null,
            decision.riskScore,
            decision.reason ?? null,
            durationMs,
            NOOP_PREV_HASH,
            agentId,
          ).catch(() => {/* audit write failures are non-blocking */});

          // Create approval record if required
          let approvalId: string | undefined;
          let approvalUrl: string | undefined;
          if (decision.result === 'require_approval' && tenantId !== 'demo') {
            try {
              approvalId = await createPendingApproval(
                db,
                tenantId,
                agentId,
                call.tool,
                typeof call.params === 'object' && call.params !== null
                  ? (call.params as Record<string, unknown>)
                  : {},
              );
              approvalUrl = `https://app.agentguard.tech/approvals/${approvalId}`;
            } catch {
              // Approval creation is non-blocking
            }
          }

          // Enrich block/flag decisions with actionable info
          const needsEnrichment =
            decision.result === 'block' || decision.result === 'require_approval';
          const enriched = needsEnrichment
            ? enrichDecision(decision, call.tool, effectivePolicy)
            : {};

          // Warn if no rule matched (fail-open monitor mode)
          const warnings: string[] = [];
          if (
            decision.result === 'monitor' &&
            (!decision.matchedRuleId || decision.matchedRuleId === '')
          ) {
            warnings.push(
              `No policy rules match tool '${call.tool}'. This tool is in fail-open monitor mode.`,
            );
          }

          return {
            index,
            tool: call.tool,
            decision: decision.result,
            riskScore: decision.riskScore,
            matchedRuleId: decision.matchedRuleId,
            durationMs,
            ...(enriched.reason ? { reason: enriched.reason } : {}),
            ...(enriched.suggestion ? { suggestion: enriched.suggestion } : {}),
            ...(enriched.docs ? { docs: enriched.docs } : {}),
            ...(enriched.alternatives?.length ? { alternatives: enriched.alternatives } : {}),
            ...(approvalId ? { approvalId } : {}),
            ...(approvalUrl ? { approvalUrl } : {}),
            ...(warnings.length ? { warnings } : {}),
          };
        } catch (_err) {
          // Individual failure — return a safe blocked result, never fail the batch
          return {
            index,
            tool: call.tool,
            decision: 'block' as const,
            riskScore: 500,
            matchedRuleId: 'EVAL_ERROR',
            durationMs: Math.round((performance.now() - callStart) * 100) / 100,
            reason: 'Evaluation failed for this tool call. Blocked as a safety measure.',
            suggestion: 'An internal error occurred during evaluation. Please retry. If the problem persists, contact support.',
            docs: 'https://agentguard.tech/docs/troubleshooting',
            alternatives: [] as string[],
          };
        }
      });

      const results = await Promise.all(evaluationPromises);

      // ── 6. Increment usage counter N times (one per call in the batch) ───
      if (tenantId !== 'demo') {
        // Increment in parallel for efficiency
        const incrementPromises = calls.map(() =>
          incrementRateCounter(db, tenantId, agentId ?? undefined).catch(() => {/* non-blocking */}),
        );
        await Promise.all(incrementPromises);
      }

      // ── 7. Build summary ─────────────────────────────────────────────────
      const summary = results.reduce(
        (acc, r) => {
          acc.total++;
          if (r.decision === 'allow') acc.allowed++;
          else if (r.decision === 'monitor') acc.monitored++;
          else if (r.decision === 'block') acc.blocked++;
          else if (r.decision === 'require_approval') acc.requireApproval++;
          return acc;
        },
        { total: 0, allowed: 0, monitored: 0, blocked: 0, requireApproval: 0 },
      );

      // ── 8. Fire webhooks for any blocks (fire-and-forget) ────────────────
      const blockedCount = summary.blocked + summary.requireApproval;
      if (blockedCount > 0 && tenantId !== 'demo') {
        fireWebhooksAsync(db, tenantId, 'block', {
          event_type: 'batch_block',
          tenant_id: tenantId,
          agent_id: agentId,
          data: {
            batchId,
            blockedCount,
            totalCount: calls.length,
          },
          timestamp: new Date().toISOString(),
        });
      }

      return res.json({
        batchId,
        results,
        summary,
        batchDurationMs: Math.round(performance.now() - batchStart),
      });
    },
  );

  return router;
}
