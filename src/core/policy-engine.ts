/**
 * AgentGuard Policy Engine
 *
 * Loads YAML policy files, validates them with Zod, and evaluates
 * Actions against them.  All evaluation is synchronous and runs in <1ms
 * for typical policies.  Rate-limit and spend-tracking state is kept
 * in-process; a production deployment would back these with Redis.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { load as loadYaml } from 'js-yaml';
import micromatch from 'micromatch';

import { PolicySchema } from '@/core/types.js';
import { PolicyError } from '@/core/errors.js';
import type {
  Policy,
  Action,
  AgentContext,
  EvaluationResult,
  PolicyVerdict,
} from '@/core/types.js';

// ─── Internal rate-limit / spend tracking ────────────────────────────────────

/** Rolling 1-minute bucket for call counting */
interface RateLimitBucket {
  count: number;
  windowStart: number; // epoch ms
}

/** Accumulated spend per session */
type SpendAccumulator = Map<string, number>; // sessionId → total USD

// ─── Policy Engine ────────────────────────────────────────────────────────────

export class PolicyEngine {
  private readonly policies = new Map<string, Policy>();

  /** sessionId → (tool → bucket) */
  private readonly rateLimitState = new Map<string, Map<string, RateLimitBucket>>();

  /** sessionId → accumulated spend (USD) */
  private readonly spendState: SpendAccumulator = new Map();

  // ─── Policy Management ──────────────────────────────────────────────────────

  /**
   * Load and validate a YAML policy file from disk.
   * Throws if the file is missing or fails Zod validation.
   */
  loadFromFile(filePath: string): Policy {
    const raw = readFileSync(filePath, 'utf-8');
    return this.loadFromYaml(raw);
  }

  /**
   * Parse and validate a YAML policy string.
   * Returns the validated Policy; throws a descriptive ZodError on failure.
   */
  loadFromYaml(yamlContent: string): Policy {
    const parsed = loadYaml(yamlContent);
    const result = PolicySchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Invalid policy schema:\n${result.error.toString()}`);
    }
    const policy = result.data;
    this.policies.set(policy.id, policy);
    return policy;
  }

  /** Register an already-validated Policy object directly. */
  register(policy: Policy): void {
    this.policies.set(policy.id, policy);
  }

  /** Retrieve a loaded policy by ID, or undefined if not found. */
  get(policyId: string): Policy | undefined {
    return this.policies.get(policyId);
  }

  // ─── Evaluation ─────────────────────────────────────────────────────────────

  /**
   * Evaluate an action against the agent's policy.
   *
   * Evaluation order (first match wins):
   *  1. Deny list (tool permissions)
   *  2. Rate limit
   *  3. Spending cap (per-action then cumulative)
   *  4. Allow list / default
   *  5. Data access
   *  6. HITL requirements
   *
   * @throws {PolicyError} with code POLICY_NOT_FOUND if policyId not loaded
   */
  evaluate(action: Action, ctx: AgentContext, policyId: string): EvaluationResult {
    const start = Date.now();

    const policy = this.policies.get(policyId);
    if (!policy) {
      throw PolicyError.policyNotFound(policyId, { agentId: ctx.agentId });
    }

    const verdict = this._evaluate(action, ctx, policy);
    const latencyMs = Date.now() - start;

    return { ...verdict, latencyMs };
  }

  // ─── Private evaluation logic ───────────────────────────────────────────────

  private _evaluate(
    action: Action,
    ctx: AgentContext,
    policy: Policy,
  ): Omit<EvaluationResult, 'latencyMs'> {
    const { tool } = action;

    // ── 1. Deny list takes absolute precedence ────────────────────────────────
    const denyList = policy.tools.deny ?? [];
    if (this._matchesPattern(tool, denyList)) {
      return {
        verdict: 'deny',
        reason: `Tool "${tool}" is on the deny list`,
        matchedRule: 'tools.deny',
        context: { deniedPatterns: denyList },
      };
    }

    // ── 2. Rate limits ────────────────────────────────────────────────────────
    if (policy.rateLimits) {
      const rateDenial = this._checkRateLimit(tool, ctx.sessionId, policy);
      if (rateDenial) return rateDenial;
    }

    // ── 3. Spending caps ──────────────────────────────────────────────────────
    if (policy.spending) {
      const spendDenial = this._checkSpend(action, ctx.sessionId, policy);
      if (spendDenial) return spendDenial;
    }

    // ── 4. Allow list / default verdict ──────────────────────────────────────
    const allowList = policy.tools.allow ?? [];
    const toolAllowed =
      allowList.length === 0 // no allow list = not yet restricted by tool
        ? policy.defaultAction !== 'deny'
        : this._matchesPattern(tool, allowList);

    if (!toolAllowed) {
      const defaultAction = policy.defaultAction ?? 'deny';
      if (defaultAction === 'deny') {
        return {
          verdict: 'deny',
          reason:
            allowList.length > 0
              ? `Tool "${tool}" is not in the allow list`
              : `Action denied by default policy`,
          matchedRule: allowList.length > 0 ? 'tools.allow' : 'defaultAction',
          context: { defaultAction, allowedPatterns: allowList },
        };
      }
    }

    // ── 5. Data access controls ───────────────────────────────────────────────
    if (action.dataClassification) {
      const dataDenial = this._checkDataAccess(action, policy);
      if (dataDenial) return dataDenial;
    }

    // ── 6. Human-in-the-loop gates ────────────────────────────────────────────
    if (policy.humanInTheLoop?.requireApprovalFor) {
      const hitlPatterns = policy.humanInTheLoop.requireApprovalFor;
      if (this._matchesPattern(tool, hitlPatterns)) {
        return {
          verdict: 'require-approval',
          reason: `Tool "${tool}" requires human approval before execution`,
          matchedRule: 'humanInTheLoop.requireApprovalFor',
          context: {
            timeoutSeconds: policy.humanInTheLoop.timeoutSeconds,
            matchedPatterns: hitlPatterns,
          },
        };
      }
    }

    // ── Allowed ───────────────────────────────────────────────────────────────
    // Optimistically record spend so subsequent actions see the updated total.
    if (policy.spending && action.estimatedCostUsd) {
      this._recordSpend(ctx.sessionId, action.estimatedCostUsd);
    }

    return {
      verdict: 'allow',
      reason: `Tool "${tool}" is permitted by policy`,
      matchedRule: allowList.length > 0 ? 'tools.allow' : 'defaultAction',
    };
  }

  // ─── Rate limit helpers ───────────────────────────────────────────────────

  private _checkRateLimit(
    tool: string,
    sessionId: string,
    policy: Policy,
  ): Omit<EvaluationResult, 'latencyMs'> | null {
    const limits = policy.rateLimits!;
    const now = Date.now();
    const windowMs = 60_000;

    const getOrCreate = (key: string): RateLimitBucket => {
      const sessionMap = this.rateLimitState.get(sessionId) ?? new Map<string, RateLimitBucket>();
      this.rateLimitState.set(sessionId, sessionMap);
      const existing = sessionMap.get(key);
      if (existing && now - existing.windowStart < windowMs) {
        return existing;
      }
      const fresh: RateLimitBucket = { count: 0, windowStart: now };
      sessionMap.set(key, fresh);
      return fresh;
    };

    // Per-tool limit
    const perToolLimit = limits.perTool?.[tool];
    if (perToolLimit !== undefined) {
      const bucket = getOrCreate(`tool:${tool}`);
      if (bucket.count >= perToolLimit) {
        return {
          verdict: 'deny',
          reason: `Rate limit exceeded for tool "${tool}": ${perToolLimit} calls/min`,
          matchedRule: 'rateLimits.perTool',
          context: {
            tool,
            limit: perToolLimit,
            count: bucket.count,
            windowResetMs: windowMs - (now - bucket.windowStart),
          },
        };
      }
      bucket.count += 1;
    }

    // Global limit
    if (limits.globalCallsPerMinute !== undefined) {
      const bucket = getOrCreate('global');
      if (bucket.count >= limits.globalCallsPerMinute) {
        return {
          verdict: 'deny',
          reason: `Global rate limit exceeded: ${limits.globalCallsPerMinute} calls/min`,
          matchedRule: 'rateLimits.globalCallsPerMinute',
          context: {
            limit: limits.globalCallsPerMinute,
            count: bucket.count,
            windowResetMs: windowMs - (now - bucket.windowStart),
          },
        };
      }
      bucket.count += 1;
    }

    return null;
  }

  // ─── Spend helpers ────────────────────────────────────────────────────────

  private _checkSpend(
    action: Action,
    sessionId: string,
    policy: Policy,
  ): Omit<EvaluationResult, 'latencyMs'> | null {
    const { spending } = policy;
    if (!spending) return null;

    const cost = action.estimatedCostUsd ?? 0;
    const current = this.spendState.get(sessionId) ?? 0;

    // Per-action cap
    if (spending.maxPerActionUsd !== undefined && cost > spending.maxPerActionUsd) {
      return {
        verdict: 'deny',
        reason: `Action cost $${cost.toFixed(2)} exceeds per-action limit of $${spending.maxPerActionUsd.toFixed(2)}`,
        matchedRule: 'spending.maxPerActionUsd',
        context: {
          costUsd: cost,
          limitUsd: spending.maxPerActionUsd,
          currency: spending.currency,
        },
      };
    }

    // Cumulative session cap
    if (spending.maxTotalUsd !== undefined && current + cost > spending.maxTotalUsd) {
      return {
        verdict: 'deny',
        reason: `Cumulative spend $${(current + cost).toFixed(2)} would exceed session cap of $${spending.maxTotalUsd.toFixed(2)}`,
        matchedRule: 'spending.maxTotalUsd',
        context: {
          currentUsd: current,
          actionCostUsd: cost,
          limitUsd: spending.maxTotalUsd,
          currency: spending.currency,
        },
      };
    }

    return null;
  }

  private _recordSpend(sessionId: string, amount: number): void {
    const current = this.spendState.get(sessionId) ?? 0;
    this.spendState.set(sessionId, current + amount);
  }

  /** Get current accumulated spend for a session (for testing / dashboards) */
  getSessionSpend(sessionId: string): number {
    return this.spendState.get(sessionId) ?? 0;
  }

  /** Reset spend and rate-limit counters for a session (use between test runs) */
  resetSession(sessionId: string): void {
    this.spendState.delete(sessionId);
    this.rateLimitState.delete(sessionId);
  }

  // ─── Data access helpers ──────────────────────────────────────────────────

  private _checkDataAccess(
    action: Action,
    policy: Policy,
  ): Omit<EvaluationResult, 'latencyMs'> | null {
    const { dataAccess } = policy;
    const classification = action.dataClassification;
    if (!classification) return null;

    // PII check
    if (classification === 'pii' && !dataAccess.allowPII) {
      return {
        verdict: 'deny',
        reason: `Access to PII data is not permitted by policy`,
        matchedRule: 'dataAccess.allowPII',
        context: { dataClassification: classification },
      };
    }

    // Denied classifications
    if (
      dataAccess.allowedClassifications &&
      dataAccess.allowedClassifications.length > 0 &&
      !dataAccess.allowedClassifications.includes(classification)
    ) {
      return {
        verdict: 'deny',
        reason: `Data classification "${classification}" is not in the allowed list`,
        matchedRule: 'dataAccess.allowedClassifications',
        context: {
          dataClassification: classification,
          allowedClassifications: dataAccess.allowedClassifications,
        },
      };
    }

    return null;
  }

  // ─── Pattern matching ─────────────────────────────────────────────────────

  /** Match a tool name against a list of patterns (supports globs via micromatch). */
  private _matchesPattern(tool: string, patterns: string[]): boolean {
    if (patterns.length === 0) return false;
    // Exact matches first (fast path), then glob
    return patterns.includes(tool) || micromatch.isMatch(tool, patterns);
  }

  // ─── Fingerprinting (for audit) ───────────────────────────────────────────

  /** Produce a stable hash of a policy for change detection. */
  static fingerprintPolicy(policy: Policy): string {
    const content = JSON.stringify(policy, Object.keys(policy).sort());
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}
