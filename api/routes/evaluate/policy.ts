/**
 * AgentGuard — Evaluate Core Policy Processing
 *
 * Handles PII detection, prompt-injection detection, policy engine
 * evaluation, audit trail, OTel export, HITL approval, and webhook
 * notification for the evaluate POST handler.
 */
import crypto from 'crypto';
import { logger } from '../../lib/logger.js';
import { PolicyEngine } from '../../../packages/sdk/src/core/policy-engine.js';
import type { ActionRequest, AgentContext, PolicyDecision } from '../../../packages/sdk/src/core/types.js';
import { DEFAULT_POLICY } from '../../lib/policy-engine-setup.js';
import { storeAuditEvent, fireWebhooksAsync } from '../audit.js';
import { createPendingApproval } from '../approvals.js';
import { enrichDecision } from '../../lib/decision-enricher.js';
import { getOtelExporter } from '../../lib/otel-exporter.js';
import { publishEvent } from '../../lib/redis-pubsub.js';
import { incrementRateCounter } from '../../lib/rate-limit-db.js';
import {
  NOOP_PREV_HASH,
  _detectionEngine,
  isPiiEnabled,
  loadEffectivePolicy,
  scanParamsForPII,
} from './helpers.js';
import type { AgentPolicy } from '../../lib/policy-inheritance.js';
import { evaluateToolAgainstPolicy } from '../../lib/policy-inheritance.js';
import type { DetectionResult } from '../../lib/detection/types.js';
import type { IDatabase } from '../../db-interface.js';

export interface EvaluationInput {
  db: IDatabase;
  tenantId: string;
  agentId: string | null;
  tool: string;
  params: Record<string, unknown> | null;
  evalParsed: { success: boolean; data?: any; error?: any };
  childAgentPolicy: AgentPolicy | null;
  req: any; // Express Request (loose to avoid circular import)
}

export interface EvaluationResult {
  decision: PolicyDecision;
  ctx: AgentContext;
  ms: number;
  resolvedAgentId: string;
  piiBlock?: {
    entitiesFound: number;
    types: string[];
    redactedInput: Record<string, unknown>;
  };
  approvalId?: string;
  warnings: string[];
  enriched: Record<string, unknown>;
  isCatchAllAllow: boolean;
  effectivePolicy: typeof DEFAULT_POLICY;
}

/**
 * Core policy evaluation: PII → injection → policy engine → audit → OTel → SSE → HITL → webhooks → enrichment.
 */
export async function processEvaluation(input: EvaluationInput): Promise<EvaluationResult> {
  const { db, tenantId, agentId, tool, params, childAgentPolicy, req } = input;
  const warnings: string[] = [];

  // ── Child Agent Policy: tool-level check ──────────────────────────────────
  if (childAgentPolicy && agentId) {
    const toolCheck = evaluateToolAgainstPolicy(tool, childAgentPolicy);
    if (!toolCheck.allowed) {
      await storeAuditEvent(db, tenantId, null, tool, 'block', 'CHILD_POLICY_VIOLATION', 800,
        toolCheck.reason ?? 'Tool blocked by child agent policy', 0, NOOP_PREV_HASH, agentId);
      const decision: PolicyDecision = {
        result: 'block', matchedRuleId: 'CHILD_POLICY_VIOLATION', riskScore: 800,
        reason: toolCheck.reason ?? 'Tool blocked by child agent inherited policy.',
      };
      return { decision, ctx: {} as AgentContext, ms: 0, resolvedAgentId: 'unknown',
        warnings: [], enriched: {}, isCatchAllAllow: false, effectivePolicy: DEFAULT_POLICY };
    }
    try { await db.incrementChildToolCalls(agentId); } catch { /* non-blocking */ }
  }

  // ── PII Detection ────────────────────────────────────────────────────────
  let piiBlock: EvaluationResult['piiBlock'];
  if (tenantId !== 'demo') {
    try {
      const customPolicyRaw = await db.getCustomPolicy(tenantId);
      if (isPiiEnabled(customPolicyRaw) && params && typeof params === 'object') {
        const { redactedParams, totalEntities, typeSet } = await scanParamsForPII(params as Record<string, unknown>);
        if (totalEntities > 0) {
          piiBlock = { entitiesFound: totalEntities, types: [...typeSet], redactedInput: redactedParams };
        }
      }
    } catch { /* PII scanning is best-effort */ }
  }

  // ── Prompt Injection Detection ───────────────────────────────────────────
  let detectionResult: DetectionResult | undefined;
  const messageHistory = input.evalParsed.data?.messageHistory;
  try {
    detectionResult = await _detectionEngine.detect({
      toolName: tool,
      toolInput: typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {},
      messageHistory,
    });
  } catch { /* non-blocking */ }

  if (detectionResult && _detectionEngine.isAboveThreshold(detectionResult)) {
    await storeAuditEvent(db, tenantId, null, tool, 'block', 'INJECTION_DETECTED', 900,
      `Prompt injection detected (score: ${detectionResult.score.toFixed(2)}, category: ${detectionResult.category})`,
      0, NOOP_PREV_HASH, agentId, detectionResult.score, detectionResult.provider, detectionResult.category);
    const decision: PolicyDecision = {
      result: 'block', matchedRuleId: 'INJECTION_DETECTED', riskScore: 900,
      reason: 'Request blocked: prompt injection detected in tool input.',
    };
    return { decision, ctx: {} as AgentContext, ms: 0, resolvedAgentId: 'unknown',
      warnings: [], enriched: {}, isCatchAllAllow: false, effectivePolicy: DEFAULT_POLICY };
  }

  // ── Load effective policy ────────────────────────────────────────────────
  const effectivePolicy = await loadEffectivePolicy(db, tenantId);

  const engine = new PolicyEngine();
  engine.registerDocument(effectivePolicy);
  const resolvedAgentId = req.agent ? req.agent.name : 'quick-eval';
  const actionRequest: ActionRequest = {
    id: crypto.randomUUID(), agentId: resolvedAgentId, tool,
    params: typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {},
    inputDataLabels: [], timestamp: new Date().toISOString(),
  };
  const ctx: AgentContext = {
    agentId: resolvedAgentId, sessionId: crypto.randomUUID(), policyVersion: '1.0.0',
  };

  const start = performance.now();
  let decision: PolicyDecision;
  try {
    decision = engine.evaluate(actionRequest, ctx, effectivePolicy.id);
  } catch {
    throw new Error('Evaluation failed. Please try again.');
  }
  const ms = Math.round((performance.now() - start) * 100) / 100;

  // ── Store audit event ────────────────────────────────────────────────────
  await storeAuditEvent(db, tenantId, ctx.sessionId, tool, decision.result,
    decision.matchedRuleId ?? null, decision.riskScore, decision.reason ?? null,
    ms, NOOP_PREV_HASH, agentId, detectionResult?.score ?? null,
    detectionResult?.provider ?? null, detectionResult?.category ?? null);

  // ── SSE: publish audit event ─────────────────────────────────────────────
  if (tenantId && tenantId !== 'demo') {
    publishEvent({
      type: 'audit_event', tenantId,
      data: { tool, result: decision.result, riskScore: decision.riskScore,
        reason: decision.reason ?? null, ruleId: decision.matchedRuleId ?? null,
        agentId: agentId ?? null, sessionId: ctx.sessionId ?? null, durationMs: ms },
      ts: new Date().toISOString(),
    }).catch(() => {});
  }

  // PII audit trail
  if (piiBlock && tenantId !== 'demo') {
    await storeAuditEvent(db, tenantId, ctx.sessionId, 'pii.detect', 'monitor', 'PII_DETECTED', 0,
      `PII detected in evaluate input: ${piiBlock.entitiesFound} entit${piiBlock.entitiesFound === 1 ? 'y' : 'ies'} (${piiBlock.types.join(', ')}) — input redacted`,
      0, NOOP_PREV_HASH, agentId);
  }

  // ── OTel export ──────────────────────────────────────────────────────────
  try {
    getOtelExporter().recordPolicyDecision({
      agentId: resolvedAgentId, tenantId: tenantId ?? undefined, sessionId: ctx.sessionId,
      toolName: tool, decision: decision.result as 'allow' | 'block' | 'require_approval' | 'monitor',
      riskScore: decision.riskScore ?? undefined, ruleId: decision.matchedRuleId ?? null,
      latencyMs: ms, piiDetected: piiBlock ? true : false, piiEntityCount: piiBlock?.entitiesFound ?? 0,
    });
  } catch { /* non-blocking */ }

  // ── Rate limit increment ─────────────────────────────────────────────────
  if (tenantId !== 'demo') {
    try { await incrementRateCounter(db, tenantId, req.agent?.id); } catch { /* tables may not exist */ }
  }

  // ── HITL approval ────────────────────────────────────────────────────────
  let approvalId: string | undefined;
  if (decision.result === 'require_approval' && tenantId !== 'demo') {
    try {
      approvalId = await createPendingApproval(db, tenantId, agentId, tool,
        typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {});
      // Slack notification
      try {
        const { sendSlackApprovalRequest } = await import('../../lib/slack-hitl.js');
        const { getSlackIntegrationConfig } = await import('../slack-hitl.js');
        const slackConfig = await getSlackIntegrationConfig(db, tenantId);
        if (slackConfig && approvalId) {
          sendSlackApprovalRequest({
            webhookUrl: slackConfig.webhookUrl,
            approval: { id: approvalId, tenant_id: tenantId, agent_id: agentId || null, tool,
              params_json: typeof params === 'object' ? JSON.stringify(params) : null,
              status: 'pending', created_at: new Date().toISOString(),
              resolved_at: null, resolved_by: null },
            agentName: agentId || 'unknown', riskReason: decision.matchedRuleId || 'policy_requires_approval',
            autoRejectMinutes: slackConfig.autoRejectMinutes || 30,
          }).catch((e: unknown) => logger.error({ err: e instanceof Error ? e : String(e) }, '[evaluate] slack notification failed'));
        }
      } catch { /* slack module optional */ }

      // SSE: notify HITL watchers
      if (approvalId) {
        publishEvent({
          type: 'hitl_gate_created', tenantId,
          data: { approvalId, tool, agentId: agentId ?? null, riskScore: decision.riskScore,
            reason: decision.matchedRuleId || 'policy_requires_approval',
            params: typeof params === 'object' && params !== null ? params : {} },
          ts: new Date().toISOString(),
        }).catch(() => {});
      }
    } catch (e) {
      logger.error({ err: e instanceof Error ? e : String(e) }, '[evaluate] failed to create approval record');
    }
  }

  // ── Warnings ─────────────────────────────────────────────────────────────
  if (decision.result === 'monitor' && (!decision.matchedRuleId || decision.matchedRuleId === '')) {
    warnings.push(`No policy rules match tool '${tool}'. This tool is in fail-open monitor mode. Consider adding explicit rules.`);
  }

  // ── Fire webhooks ────────────────────────────────────────────────────────
  if ((decision.result === 'block' || decision.result === 'require_approval') && tenantId !== 'demo') {
    fireWebhooksAsync(db, tenantId, decision.result === 'require_approval' ? 'hitl' : 'block', {
      event_type: decision.result === 'require_approval' ? 'hitl' : 'block',
      tenant_id: tenantId, agent_id: agentId,
      data: { decision: decision.result, tool, rule_matched: decision.matchedRuleId ?? null,
        risk_score: decision.riskScore, reason: decision.reason ?? null,
        ...(approvalId ? { approval_id: approvalId } : {}) },
      timestamp: new Date().toISOString(),
    });
  }

  // ── Enrichment ───────────────────────────────────────────────────────────
  const enriched = (decision.result === 'block' || decision.result === 'require_approval')
    ? enrichDecision(decision, tool, effectivePolicy) : {};
  const isCatchAllAllow = decision.result === 'allow' &&
    typeof decision.matchedRuleId === 'string' && decision.matchedRuleId.includes('allow-all');

  return { decision, ctx, ms, resolvedAgentId, piiBlock, approvalId, warnings, enriched, isCatchAllAllow, effectivePolicy };
}
