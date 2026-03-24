/**
 * MCP Interceptor
 *
 * Middleware that sits between MCP client and MCP server.
 * Intercepts tools/call requests, evaluates them against AgentGuard policies,
 * and blocks/allows/escalates based on the result.
 *
 * Architecture:
 *   MCP Client → McpInterceptor → [policy eval] → MCP Server (if allowed)
 *
 * The interceptor integrates with:
 * - PolicyService: loads the agent's compiled policy bundle
 * - McpPolicyEvaluator: applies MCP-specific and standard rules
 * - AuditService: logs every interception to the tamper-evident audit trail
 * - HITLService: creates approval gates for require_approval decisions
 */
import { createHash } from 'node:crypto';
import type { PrismaClient } from '../../lib/prisma.js';
import type { Redis } from '../../lib/redis.js';
import type { ServiceContext } from '@agentguard/shared';
import { PolicyService } from '../policy.js';
import { AuditService } from '../audit.js';
import { HITLService } from '../hitl.js';
import { KillSwitchService } from '../killswitch.js';
import { McpPolicyEvaluator } from './mcp-policy-evaluator.js';
import type {
  McpToolCallRequest,
  McpToolCallResponse,
  McpAgentIdentity,
  McpInterceptionResult,
} from './types.js';

// ─── McpInterceptor ───────────────────────────────────────────────────────────

export interface McpInterceptorConfig {
  /** If true, fail closed when policy cannot be loaded */
  strict?: boolean;
  /** If true, skip audit logging (not recommended for production) */
  skipAudit?: boolean;
}

export class McpInterceptor {
  private readonly policyService: PolicyService;
  private readonly auditService: AuditService;
  private readonly hitlService: HITLService;
  private readonly killSwitchService: KillSwitchService;
  private readonly evaluator: McpPolicyEvaluator;

  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
    ctx: ServiceContext,
    private readonly config: McpInterceptorConfig = {},
  ) {
    this.policyService = new PolicyService(db, ctx, redis);
    this.auditService = new AuditService(db, ctx, redis);
    this.hitlService = new HITLService(db, ctx, redis);
    this.killSwitchService = new KillSwitchService(db, ctx, redis);
    this.evaluator = new McpPolicyEvaluator();
  }

  /**
   * Intercept an MCP tools/call request.
   *
   * Flow:
   * 1. Verify it's a tools/call request
   * 2. Check kill switch for the agent
   * 3. Load the agent's active policy bundle
   * 4. Evaluate the tool call against the policy
   * 5. Log the decision to the audit trail
   * 6. If HITL, create an approval gate
   * 7. Return the interception result
   *
   * @param request - The incoming MCP tool call request
   * @param identity - Identity of the calling agent
   * @returns Promise<McpInterceptionResult>
   */
  async intercept(
    request: McpToolCallRequest,
    identity: McpAgentIdentity,
  ): Promise<McpInterceptionResult> {
    const startTime = performance.now();

    // ── Step 1: Only intercept tools/call requests ─────────────────────────
    if (request.method !== 'tools/call') {
      return this.buildPassthroughResult(performance.now() - startTime);
    }

    const toolName = request.params.name;
    const toolArgs = request.params.arguments ?? {};

    try {
      // ── Step 2: Check kill switch ─────────────────────────────────────────
      const killStatus = await this.killSwitchService.getKillStatus(identity.agentId);
      if (killStatus.isKilled) {
        const result = this.buildKillSwitchResult(killStatus, performance.now() - startTime);
        void this.logInterception(identity, toolName, toolArgs, result);
        return result;
      }

      // ── Step 3: Load policy bundle ────────────────────────────────────────
      const bundle = await this.policyService.getBundleForAgent(identity.agentId);

      if (!bundle) {
        // No policy — apply fail-closed or fail-open based on config
        const decision = this.config.strict !== false ? 'block' : 'allow';
        const result: McpInterceptionResult = {
          allowed: decision === 'allow',
          decision,
          reason: decision === 'block'
            ? 'No policy configured — failing closed (strict mode)'
            : 'No policy configured — allowing (permissive mode)',
          riskScore: decision === 'block' ? 700 : 50,
          matchedRuleId: null,
          gateId: null,
          gateTimeoutSec: null,
          evaluationMs: performance.now() - startTime,
        };
        void this.logInterception(identity, toolName, toolArgs, result);
        return result;
      }

      // ── Step 4: Evaluate against policy ───────────────────────────────────
      const evalResult = this.evaluator.evaluate(request, identity, bundle);
      const evaluationMs = performance.now() - startTime;

      const result: McpInterceptionResult = {
        ...evalResult,
        evaluationMs,
      };

      // ── Step 5: Create HITL gate if required ──────────────────────────────
      if (evalResult.decision === 'hitl') {
        try {
          const gate = await this.hitlService.createGate({
            agentId: identity.agentId,
            sessionId: identity.sessionId,
            toolName,
            toolParams: toolArgs,
            matchedRuleId: evalResult.matchedRuleId ?? 'mcp-policy',
            timeoutSec: evalResult.gateTimeoutSec ?? 300,
          });
          result.gateId = gate.id;
        } catch (err) {
          // Gate creation failure → block as safe default
          result.allowed = false;
          result.decision = 'block';
          result.reason = `HITL gate creation failed — blocking as safe default: ${String(err)}`;
        }
      }

      // ── Step 6: Audit log (async, non-blocking) ───────────────────────────
      if (!this.config.skipAudit) {
        void this.logInterception(identity, toolName, toolArgs, result);
      }

      return result;
    } catch (err) {
      const evaluationMs = performance.now() - startTime;
      // On unexpected errors, block if strict, allow if permissive
      const blocked = this.config.strict !== false;
      return {
        allowed: !blocked,
        decision: blocked ? 'block' : 'allow',
        reason: `Policy evaluation error — ${blocked ? 'blocking' : 'allowing'}: ${String(err)}`,
        riskScore: blocked ? 800 : 100,
        matchedRuleId: null,
        gateId: null,
        gateTimeoutSec: null,
        evaluationMs,
      };
    }
  }

  /**
   * Build an MCP error response for blocked tool calls.
   */
  buildBlockedResponse(
    request: McpToolCallRequest,
    result: McpInterceptionResult,
  ): McpToolCallResponse {
    return {
      id: request.id,
      error: {
        code: -32603, // Internal error in JSON-RPC
        message: `Tool call blocked by AgentGuard policy: ${result.reason}`,
        data: {
          decision: result.decision,
          riskScore: result.riskScore,
          matchedRuleId: result.matchedRuleId,
          gateId: result.gateId,
          auditEventId: result.auditEventId,
        },
      },
    };
  }

  /**
   * Build an MCP response for HITL-pending calls.
   */
  buildHitlPendingResponse(
    request: McpToolCallRequest,
    result: McpInterceptionResult,
  ): McpToolCallResponse {
    return {
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'hitl_pending',
              message: 'Tool call is pending human approval',
              gateId: result.gateId,
              gateTimeoutSec: result.gateTimeoutSec,
              reason: result.reason,
            }),
          },
        ],
        isError: false,
      },
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private buildPassthroughResult(evaluationMs: number): McpInterceptionResult {
    return {
      allowed: true,
      decision: 'allow',
      reason: 'Non-tool-call MCP request — not subject to tool policy',
      riskScore: 0,
      matchedRuleId: null,
      gateId: null,
      gateTimeoutSec: null,
      evaluationMs,
    };
  }

  private buildKillSwitchResult(
    killStatus: { tier?: string | null; reason?: string | null },
    evaluationMs: number,
  ): McpInterceptionResult {
    return {
      allowed: false,
      decision: 'block',
      reason: `Agent is halted (kill switch: ${killStatus.tier ?? 'unknown'}) — ${killStatus.reason ?? 'no reason given'}`,
      riskScore: 1000,
      matchedRuleId: null,
      gateId: null,
      gateTimeoutSec: null,
      evaluationMs,
    };
  }

  /**
   * Log the interception to the audit trail using the existing telemetry pipeline.
   */
  private async logInterception(
    identity: McpAgentIdentity,
    toolName: string,
    toolArgs: Record<string, unknown>,
    result: McpInterceptionResult,
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      const clientEventId = createHash('sha256')
        .update(`${identity.agentId}:${identity.sessionId}:${toolName}:${now}`)
        .digest('hex')
        .slice(0, 16);

      await this.auditService.ingestBatch({
        agentId: identity.agentId,
        events: [
          {
            clientEventId,
            sessionId: identity.sessionId,
            occurredAt: now,
            processingMs: Math.round(result.evaluationMs),
            actionType: 'TOOL_CALL',
            toolName,
            toolTarget: 'mcp',
            actionParams: toolArgs as Record<string, string | number | boolean | null>,
            decision: mapDecisionToAudit(result.decision),
            riskScore: result.riskScore,
            matchedRuleId: result.matchedRuleId ?? undefined,
            matchedRuleIds: result.matchedRuleId ? [result.matchedRuleId] : [],
            blockReason: !result.allowed ? result.reason : undefined,
            inputDataLabels: [],
            outputDataLabels: [],
            ragSourceIds: [],
            priorEventIds: [],
          },
        ],
      });
    } catch {
      // Audit failures are non-fatal — we never block a tool call just because logging failed
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapDecisionToAudit(decision: string): string {
  switch (decision) {
    case 'block': return 'block';
    case 'hitl': return 'require_approval';
    case 'monitor': return 'monitor';
    case 'allow': return 'allow';
    default: return 'allow';
  }
}
