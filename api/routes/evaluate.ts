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
import { checkRateLimit as checkPhase2RateLimit, incrementRateCounter } from '../lib/rate-limit-db.js';
import { DEFAULT_POLICY } from '../lib/policy-engine-setup.js';
import { getGlobalKillSwitch, storeAuditEvent, fireWebhooksAsync } from './audit.js';
import { createPendingApproval } from './approvals.js';
import { defaultDetector } from '../lib/pii/regex-detector.js';
import { DetectionEngine } from '../lib/detection/engine.js';
import { HeuristicDetectionPlugin } from '../lib/detection/heuristic.js';
import type { DetectionResult } from '../lib/detection/types.js';
import { evaluateToolAgainstPolicy, type AgentPolicy } from '../lib/policy-inheritance.js';
import { enrichDecision } from '../lib/decision-enricher.js';
import { getOtelExporter } from '../lib/otel-exporter.js';
import { publishEvent } from '../lib/redis-pubsub.js';

// getLastHash is no longer called directly — storeAuditEvent is now atomic
const NOOP_PREV_HASH = '';

// Singleton detection engine (heuristic as both primary and fallback)
const _heuristic = new HeuristicDetectionPlugin();
const _detectionEngine = new DetectionEngine(_heuristic, _heuristic);

// ── PII helpers ─────────────────────────────────────────────────────────────

/**
 * Check if PII detection is enabled for the tenant by reading their custom
 * policy JSON for a `piiDetection.enabled` flag.
 */
function isPiiEnabled(customPolicyRaw: string | null): boolean {
  if (!customPolicyRaw) return false;
  try {
    const parsed = JSON.parse(customPolicyRaw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const policy = parsed as Record<string, unknown>;
      const piiConfig = policy['piiDetection'];
      if (piiConfig && typeof piiConfig === 'object' && !Array.isArray(piiConfig)) {
        return (piiConfig as Record<string, unknown>)['enabled'] === true;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return false;
}

/**
 * Recursively scan all string values in a params object for PII.
 * Returns the redacted params, total entities found, and the set of PII types.
 */
async function scanParamsForPII(
  params: Record<string, unknown>,
): Promise<{
  redactedParams: Record<string, unknown>;
  totalEntities: number;
  typeSet: Set<string>;
}> {
  const typeSet = new Set<string>();
  let totalEntities = 0;

  async function redactValue(value: unknown): Promise<unknown> {
    if (typeof value === 'string') {
      const result = await defaultDetector.scan(value);
      if (result.entitiesFound > 0) {
        totalEntities += result.entitiesFound;
        for (const e of result.entities) {
          typeSet.add(e.type);
        }
        return result.redactedContent;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return Promise.all(value.map(redactValue));
    }
    if (value !== null && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = await redactValue(v);
      }
      return out;
    }
    return value;
  }

  const redactedParams = (await redactValue(params)) as Record<string, unknown>;
  return { redactedParams, totalEntities, typeSet };
}

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
  /**
   * @openapi
   * /evaluate:
   *   post:
   *     summary: Evaluate a tool call
   *     description: |
   *       Core policy evaluation endpoint. Evaluates an agent's tool call against
   *       configured policies and returns allow/block/require_approval/monitor decision.
   *       Optionally persists to audit trail and fires webhooks.
   *     tags: [Evaluate]
   *     security:
   *       - apiKey: []
   *       - agentKey: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tool]
   *             properties:
   *               tool:
   *                 type: string
   *                 description: Tool/function name being called
   *                 example: file_write
   *               params:
   *                 type: object
   *                 description: Tool parameters
   *               agentId:
   *                 type: string
   *                 description: Identifier of the calling agent
   *               context:
   *                 type: object
   *                 description: Additional evaluation context
   *     responses:
   *       200:
   *         description: Evaluation decision
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 decision:
   *                   type: string
   *                   enum: [allow, block, require_approval, monitor]
   *                 reason:
   *                   type: string
   *                 riskScore:
   *                   type: number
   *                 ruleId:
   *                   type: string
   *       401:
   *         description: Unauthorized
   *       429:
   *         description: Rate limit exceeded
   */
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
              signup: {
                hint: 'Sign up for a free API key to get higher rate limits',
                method: 'POST',
                url: 'https://api.agentguard.tech/api/v1/signup',
                body: { name: 'Your Agent Name' },
              },
            });
          }
        } catch {
          // Phase 2 tables may not exist yet — skip rate limiting
        }
      }

      // Check global kill switch
      if (ks.active) {
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
          NOOP_PREV_HASH,
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
          NOOP_PREV_HASH,
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

      // ── Child Agent Checks (A2A) ───────────────────────────────────────────
      // If the evaluating agent is a child agent, check TTL + budget + inherited policy
      let childAgentPolicy: AgentPolicy | null = null;
      if (agentId) {
        try {
          const hierarchyRow = await db.getChildAgent(agentId);
          if (hierarchyRow) {
            // TTL check
            if (hierarchyRow.ttl_expires_at && new Date(hierarchyRow.ttl_expires_at).getTime() < Date.now()) {
              await storeAuditEvent(
                db,
                tenantId,
                null,
                req.body?.tool ?? 'unknown',
                'block',
                'AGENT_EXPIRED',
                1000,
                'Child agent TTL has expired',
                0,
                NOOP_PREV_HASH,
                agentId,
              );
              return res.json({
                result: 'block',
                matchedRuleId: 'AGENT_EXPIRED',
                riskScore: 1000,
                reason: 'Child agent has expired (TTL exceeded).',
                durationMs: 0,
                agentId,
              });
            }

            // Budget check
            if (
              hierarchyRow.max_tool_calls !== null &&
              hierarchyRow.tool_calls_used >= hierarchyRow.max_tool_calls
            ) {
              await storeAuditEvent(
                db,
                tenantId,
                null,
                req.body?.tool ?? 'unknown',
                'block',
                'BUDGET_EXCEEDED',
                1000,
                `Child agent tool call budget exhausted (${hierarchyRow.tool_calls_used}/${hierarchyRow.max_tool_calls})`,
                0,
                NOOP_PREV_HASH,
                agentId,
              );
              return res.json({
                result: 'block',
                matchedRuleId: 'BUDGET_EXCEEDED',
                riskScore: 1000,
                reason: `Child agent has exhausted its tool call budget (${hierarchyRow.tool_calls_used}/${hierarchyRow.max_tool_calls}).`,
                durationMs: 0,
                agentId,
              });
            }

            // Parse and store inherited policy for tool-level check below
            try {
              childAgentPolicy = JSON.parse(hierarchyRow.policy_snapshot) as AgentPolicy;
            } catch {
              childAgentPolicy = null;
            }
          }
        } catch {
          // Non-blocking — if hierarchy table doesn't exist yet, skip
        }
      }

      const evalParsed = EvaluateRequest.safeParse(req.body ?? {});
      if (!evalParsed.success) {
        const firstIssue = evalParsed.error.issues[0]!;
        const fieldPath = firstIssue.path.join('.') || 'body';
        return res.status(400).json({
          error: 'validation_error',
          field: fieldPath,
          expected: firstIssue.message,
          received: fieldPath === 'body'
            ? typeof req.body
            : typeof (req.body as Record<string, unknown>)[fieldPath],
          docs: 'https://agentguard.tech/docs/api#evaluate',
        });
      }
      const { tool, params } = evalParsed.data;

      // ── Child Agent Policy: tool-level check ───────────────────────────────
      if (childAgentPolicy && agentId) {
        const toolCheck = evaluateToolAgainstPolicy(tool, childAgentPolicy);
        if (!toolCheck.allowed) {
          await storeAuditEvent(
            db,
            tenantId,
            null,
            tool,
            'block',
            'CHILD_POLICY_VIOLATION',
            800,
            toolCheck.reason ?? 'Tool blocked by child agent policy',
            0,
            NOOP_PREV_HASH,
            agentId,
          );
          return res.json({
            result: 'block',
            matchedRuleId: 'CHILD_POLICY_VIOLATION',
            riskScore: 800,
            reason: toolCheck.reason ?? 'Tool blocked by child agent inherited policy.',
            durationMs: 0,
            agentId,
          });
        }
        // Increment tool call counter for child agents
        try {
          await db.incrementChildToolCalls(agentId);
        } catch {
          // Non-blocking
        }
      }

      // ── PII Detection (opt-in via tenant policy piiDetection.enabled) ──────
      let piiBlock: {
        entitiesFound: number;
        types: string[];
        redactedInput: Record<string, unknown>;
      } | undefined;

      if (tenantId !== 'demo') {
        try {
          const customPolicyRaw = await db.getCustomPolicy(tenantId);
          const piiEnabled = isPiiEnabled(customPolicyRaw);

          if (piiEnabled && params && typeof params === 'object') {
            const { redactedParams, totalEntities, typeSet } =
              await scanParamsForPII(params as Record<string, unknown>);

            if (totalEntities > 0) {
              piiBlock = {
                entitiesFound: totalEntities,
                types: [...typeSet],
                redactedInput: redactedParams,
              };
            }
          }
        } catch {
          // PII scanning is best-effort — never block evaluation on failure
        }
      }
      // Note: tool length (max 200) and character validation (alphanumeric/_.-:)
      // are now enforced by the EvaluateRequest Zod schema.

      // ── Prompt Injection Detection ─────────────────────────────────────────
      // Run before policy evaluation so injections can be caught early.
      let detectionResult: DetectionResult | undefined;
      const messageHistory = evalParsed.data.messageHistory;

      try {
        detectionResult = await _detectionEngine.detect({
          toolName: tool,
          toolInput: typeof params === 'object' && params !== null
            ? (params as Record<string, unknown>)
            : {},
          messageHistory,
        });
      } catch {
        // Detection is non-blocking — never fail evaluation because of it
      }

      // Check if detection should short-circuit evaluation (above threshold + block/hitl)
      if (detectionResult && _detectionEngine.isAboveThreshold(detectionResult)) {
        // Determine relevant policy action — peek at default policy action for the tool
        // We use 'block' as the safe default when injection is detected above threshold.
        // The operator can configure a lower threshold or "monitor" to just log.
        const injectionAction = 'block'; // Conservative default

        await storeAuditEvent(
          db,
          tenantId,
          null,
          tool,
          injectionAction,
          'INJECTION_DETECTED',
          900,
          `Prompt injection detected (score: ${detectionResult.score.toFixed(2)}, category: ${detectionResult.category})`,
          0,
          NOOP_PREV_HASH,
          agentId,
          detectionResult.score,
          detectionResult.provider,
          detectionResult.category,
        );

        return res.status(200).json({
          result: injectionAction,
          matchedRuleId: 'INJECTION_DETECTED',
          riskScore: 900,
          reason: 'Request blocked: prompt injection detected in tool input.',
          durationMs: 0,
          ...(agentId ? { agentId } : {}),
        });
      }

      // Load the effective policy for this tenant (custom if set, else default)
      let effectivePolicy = DEFAULT_POLICY;
      if (tenantId !== 'demo') {
        try {
          const customPolicyRaw = await db.getCustomPolicy(tenantId);
          if (customPolicyRaw) {
            const parsed = JSON.parse(customPolicyRaw) as unknown;
            if (Array.isArray(parsed)) {
              effectivePolicy = { ...DEFAULT_POLICY, rules: parsed as typeof DEFAULT_POLICY['rules'] };
            } else if (parsed && typeof parsed === 'object') {
              effectivePolicy = parsed as typeof DEFAULT_POLICY;
            }
          }
        } catch {
          // Fall back to default policy if custom policy is corrupt/unavailable
        }
      }

      const engine = new PolicyEngine();
      engine.registerDocument(effectivePolicy);

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
        decision = engine.evaluate(actionRequest, ctx, effectivePolicy.id);
      } catch (_e: unknown) {
        return res.status(500).json({ error: 'Evaluation failed. Please try again.' });
      }
      const ms = Math.round((performance.now() - start) * 100) / 100;

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
        NOOP_PREV_HASH,
        agentId,
        detectionResult?.score ?? null,
        detectionResult?.provider ?? null,
        detectionResult?.category ?? null,
      );

      // ── SSE: publish audit event for real-time dashboard streaming ────────
      if (tenantId && tenantId !== 'demo') {
        publishEvent({
          type: 'audit_event',
          tenantId,
          data: {
            tool,
            result: decision.result,
            riskScore: decision.riskScore,
            reason: decision.reason ?? null,
            ruleId: decision.matchedRuleId ?? null,
            agentId: agentId ?? null,
            sessionId: ctx.sessionId ?? null,
            durationMs: ms,
          },
          ts: new Date().toISOString(),
        }).catch(() => { /* non-critical */ });
      }

      // Log PII detection event to audit trail (redacted content only)
      if (piiBlock && tenantId !== 'demo') {
        await storeAuditEvent(
          db,
          tenantId,
          ctx.sessionId,
          'pii.detect',
          'monitor',
          'PII_DETECTED',
          0,
          `PII detected in evaluate input: ${piiBlock.entitiesFound} entit${piiBlock.entitiesFound === 1 ? 'y' : 'ies'} (${piiBlock.types.join(', ')}) — input redacted`,
          0,
          NOOP_PREV_HASH,
          agentId,
        );
      }

      // ── OpenTelemetry: export policy decision span ─────────────────────────
      try {
        getOtelExporter().recordPolicyDecision({
          agentId: resolvedAgentId,
          tenantId: tenantId ?? undefined,
          sessionId: ctx.sessionId,
          toolName: tool,
          decision: decision.result as 'allow' | 'block' | 'require_approval' | 'monitor',
          riskScore: decision.riskScore ?? undefined,
          ruleId: decision.matchedRuleId ?? null,
          latencyMs: ms,
          piiDetected: piiBlock ? true : false,
          piiEntityCount: piiBlock?.entitiesFound ?? 0,
        });
      } catch {
        // OTel export must never break the evaluation path
      }

      // Increment custom rate limit counter after successful evaluation
      if (tenantId !== 'demo') {
        try {
          await incrementRateCounter(db, tenantId, req.agent?.id);
        } catch {
          // Phase 2 tables may not exist
        }
      }

      // ── HITL: auto-create pending approval record ──────────────────────────
      let approvalId: string | undefined;
      if (decision.result === 'require_approval' && tenantId !== 'demo') {
        try {
          approvalId = await createPendingApproval(
            db,
            tenantId,
            agentId,
            tool,
            typeof params === 'object' && params !== null
              ? (params as Record<string, unknown>)
              : {},
          );
          // Notify Slack if configured (fire-and-forget)
          try {
            const { sendSlackApprovalRequest } = await import('../lib/slack-hitl.js');
            const { getSlackIntegrationConfig } = await import('./slack-hitl.js');
            const slackConfig = await getSlackIntegrationConfig(db, tenantId);
            if (slackConfig && approvalId) {
              sendSlackApprovalRequest({
                webhookUrl: slackConfig.webhookUrl,
                approval: {
                  id: approvalId,
                  tenant_id: tenantId,
                  agent_id: agentId || null,
                  tool,
                  params_json: typeof params === 'object' ? JSON.stringify(params) : null,
                  status: 'pending',
                  created_at: new Date().toISOString(),
                  resolved_at: null,
                  resolved_by: null,
                },
                agentName: agentId || 'unknown',
                riskReason: decision.matchedRuleId || 'policy_requires_approval',
                autoRejectMinutes: slackConfig.autoRejectMinutes || 30,
              }).catch((e: unknown) => console.error('[evaluate] slack notification failed:', e));
            }
          } catch { /* slack module optional */ }

          // ── SSE: notify HITL watchers ──────────────────────────────────────
          if (approvalId) {
            publishEvent({
              type: 'hitl_gate_created',
              tenantId,
              data: {
                approvalId,
                tool,
                agentId: agentId ?? null,
                riskScore: decision.riskScore,
                reason: decision.matchedRuleId || 'policy_requires_approval',
                params: typeof params === 'object' && params !== null ? params : {},
              },
              ts: new Date().toISOString(),
            }).catch(() => { /* non-critical */ });
          }
        } catch (e) {
          console.error('[evaluate] failed to create approval record:', e);
        }
      }

      // ── P1: warn when no rule matched and result is monitor (fail-open) ────
      const warnings: string[] = [];
      if (
        decision.result === 'monitor' &&
        (decision.matchedRuleId === null ||
          decision.matchedRuleId === undefined ||
          decision.matchedRuleId === '')
      ) {
        warnings.push(
          `No policy rules match tool '${tool}'. This tool is in fail-open monitor mode. Consider adding explicit rules.`,
        );
      }

      // Fire webhooks async for block/require_approval events
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
              ...(approvalId ? { approval_id: approvalId } : {}),
            },
            timestamp: new Date().toISOString(),
          },
        );
      }

      // Enrich block/require_approval decisions with actionable context (Feature 2)
      const enriched = (decision.result === 'block' || decision.result === 'require_approval')
        ? enrichDecision(decision, tool, effectivePolicy)
        : {};

      // Add transparency notice when allowed by the default catch-all rule
      const isCatchAllAllow = decision.result === 'allow' &&
        typeof decision.matchedRuleId === 'string' &&
        decision.matchedRuleId.includes('allow-all');

      res.json({
        result: decision.result,
        matchedRuleId: decision.matchedRuleId,
        riskScore: decision.riskScore,
        reason: decision.reason,
        durationMs: ms,
        // Actionable enrichment fields — only present on block/require_approval
        ...(enriched.suggestion ? { suggestion: enriched.suggestion } : {}),
        ...(enriched.docs ? { docs: enriched.docs } : {}),
        ...(enriched.alternatives !== undefined ? { alternatives: enriched.alternatives } : {}),
        // Transparency notice for default catch-all allow
        ...(isCatchAllAllow ? { notice: 'Allowed by default policy. Configure a custom policy for production use at PUT /api/v1/policy.' } : {}),
        // Existing optional fields
        ...(agentId ? { agentId } : {}),
        ...(approvalId ? { approvalId } : {}),
        ...(approvalId ? { approvalUrl: `https://app.agentguard.tech/approvals/${approvalId}` } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(piiBlock ? { pii: piiBlock } : {}),
      });
    },
  );

  return router;
}
