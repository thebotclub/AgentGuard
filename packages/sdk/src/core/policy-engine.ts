/**
 * AgentGuard Policy Engine
 *
 * Implements the evaluation algorithm from POLICY_ENGINE.md §4.
 *
 * Key properties:
 *   - Monitor rules NEVER terminate evaluation — they always accumulate
 *   - Terminal rules (allow/block/require_approval) sorted by priority ASC
 *   - First matching terminal rule wins
 *   - Among same-priority rules: block beats require_approval beats allow
 *   - Global budgets pre-empt rule evaluation
 *   - All evaluation is synchronous, <10ms p95 (no I/O on hot path)
 *   - Rate limit state is in-process (production: back with Redis)
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { load as loadYaml } from 'js-yaml';

import {
  PolicyDocumentSchema,
  type PolicyDocument,
  type PolicyBundle,
  type CompiledRule,
  type PolicyRule,
  type PolicyAction,
  type AgentContext,
  type ActionRequest,
  type PolicyDecision,
  type ToolCondition,
  type WhenCondition,
  type ValueConstraint,
  type TimeWindow,
  type RateLimitBucket,
  BASE_RISK_SCORES,
} from './types.js';
import { PolicyError } from './errors.js';

// ─── Micromatch for glob matching ─────────────────────────────────────────────
import micromatch from 'micromatch';

// ─── In-process rate-limit state ─────────────────────────────────────────────

/** rateKey → bucket */
type RateLimitState = Map<string, RateLimitBucket>;

// ─── Policy Engine ────────────────────────────────────────────────────────────

export class PolicyEngine {
  private readonly bundles = new Map<string, PolicyBundle>();
  private readonly documents = new Map<string, PolicyDocument>();

  /** ruleId:keyBy:keyValue → bucket */
  private readonly rateLimitState: RateLimitState = new Map();

  // ─── Policy Loading ────────────────────────────────────────────────────────

  /**
   * Load and compile a YAML policy file from disk.
   * Returns the compiled PolicyBundle cached internally.
   */
  loadFromFile(filePath: string): PolicyBundle {
    const raw = readFileSync(filePath, 'utf-8');
    return this.loadFromYaml(raw);
  }

  /**
   * Parse, validate and compile a YAML policy string.
   * Stores both the source document and the compiled bundle.
   */
  loadFromYaml(yamlContent: string): PolicyBundle {
    const parsed = loadYaml(yamlContent) as unknown;
    const result = PolicyDocumentSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Invalid policy schema:\n${result.error.toString()}`);
    }
    const doc = result.data;
    this.documents.set(doc.id, doc);
    const bundle = PolicyCompiler.compile(doc);
    this.bundles.set(doc.id, bundle);
    return bundle;
  }

  /** Register an already-compiled PolicyBundle directly. */
  registerBundle(bundle: PolicyBundle): void {
    this.bundles.set(bundle.policyId, bundle);
  }

  /** Register an already-validated PolicyDocument (compiles it). */
  registerDocument(doc: PolicyDocument): PolicyBundle {
    this.documents.set(doc.id, doc);
    const bundle = PolicyCompiler.compile(doc);
    this.bundles.set(doc.id, bundle);
    return bundle;
  }

  /** Get a loaded bundle by policy ID. */
  getBundle(policyId: string): PolicyBundle | undefined {
    return this.bundles.get(policyId);
  }

  /** Get a loaded document by policy ID. */
  getDocument(policyId: string): PolicyDocument | undefined {
    return this.documents.get(policyId);
  }

  // ─── Evaluation ────────────────────────────────────────────────────────────

  /**
   * Evaluate an action request against a loaded policy bundle.
   *
   * Implements POLICY_ENGINE.md §4.1 evaluation algorithm:
   *   1. Pre-checks (kill switch, budget counters) — handled by caller
   *   2. Index lookup O(1) → candidate rules
   *   3. Rule evaluation O(k candidates) — monitor accumulates, terminal breaks
   *   4. Rate limit check on matched terminal rule
   *   5. Decision assembly with risk scoring
   *
   * @throws {PolicyError} with code POLICY_NOT_FOUND if bundle not loaded
   */
  evaluate(request: ActionRequest, ctx: AgentContext, policyId: string): PolicyDecision {
    const start = performance.now();
    const bundle = this.bundles.get(policyId);
    if (!bundle) {
      throw PolicyError.policyNotFound(policyId, { agentId: ctx.agentId });
    }

    const decision = this._evaluate(request, ctx, bundle);
    const durationMs = performance.now() - start;

    return {
      ...decision,
      policyVersion: bundle.version,
      evaluatedAt: new Date().toISOString(),
      durationMs,
    };
  }

  // ─── Core evaluation algorithm ────────────────────────────────────────────

  private _evaluate(
    request: ActionRequest,
    ctx: AgentContext,
    bundle: PolicyBundle,
  ): Omit<PolicyDecision, 'policyVersion' | 'evaluatedAt' | 'durationMs'> {
    // ── Step 2: Index Lookup O(1) ─────────────────────────────────────────
    // Get candidate rule indices: exact tool name + wildcard "*"
    const exactIndices = bundle.toolIndex[request.tool] ?? [];
    const wildcardIndices = bundle.toolIndex['*'] ?? [];
    // Also include rules with no tool condition (param-only, context-only, time-only rules)
    const noToolIndices = bundle.toolIndex['__no_tool__'] ?? [];

    const candidateIndices = new Set([...exactIndices, ...wildcardIndices, ...noToolIndices]);
    const candidateRules: CompiledRule[] = [];
    for (const i of candidateIndices) {
      const r = bundle.rules[i];
      if (r !== undefined) candidateRules.push(r);
    }

    // ── Step 3: Rule Evaluation O(k) ─────────────────────────────────────
    // Sort by priority ASC (lowest number = highest priority)
    candidateRules.sort((a, b) => a.priority - b.priority);

    const monitorRules: CompiledRule[] = [];
    let monitorRiskBoost = 0;
    let terminalRule: CompiledRule | null = null;

    // Separate monitor from terminal rules to avoid TS control-flow narrowing to never
    const { monitorMatches, terminalMatch } = this._partitionAndMatch(
      candidateRules,
      request,
      ctx,
    );

    for (const r of monitorMatches) {
      monitorRules.push(r);
      monitorRiskBoost += r.riskBoost;
    }
    terminalRule = terminalMatch;

    // ── Step 4: Rate Limit Check ─────────────────────────────────────────
    if (terminalRule?.rateLimit) {
      const rateLimitHit = this._checkRateLimit(terminalRule, request, ctx);
      if (rateLimitHit) {
        return {
          result: 'block',
          matchedRuleId: terminalRule.id,
          monitorRuleIds: monitorRules.map((r) => r.id),
          riskScore: this._computeRiskScore('block', monitorRiskBoost, ctx),
          reason: `Rate limit exceeded for rule "${terminalRule.id}"`,
          gateId: null,
          gateTimeoutSec: null,
        };
      }
    }

    // ── Step 5: Decision ─────────────────────────────────────────────────
    let result: PolicyAction;
    let reason: string;
    let gateId: string | null = null;
    let gateTimeoutSec: number | null = null;

    if (terminalRule === null) {
      // No terminal rule matched — apply bundle default
      result = bundle.defaultAction;
      reason =
        result === 'block'
          ? 'No matching rule — default action is block (fail-closed)'
          : result === 'monitor'
            ? 'No matching rule — default action is monitor (unknown tool flagged for review)'
            : 'No matching rule — default action is allow (fail-open)';
    } else {
      result = terminalRule.action;
      reason = this._buildReason(terminalRule, result);

      if (result === 'require_approval') {
        gateId = crypto.randomUUID();
        gateTimeoutSec = terminalRule.timeoutSec ?? 300;
      }
    }

    const riskScore = this._computeRiskScore(result, monitorRiskBoost, ctx);

    return {
      result,
      matchedRuleId: terminalRule?.id ?? null,
      monitorRuleIds: monitorRules.map((r) => r.id),
      riskScore,
      reason,
      gateId,
      gateTimeoutSec,
    };
  }

  // ─── Condition Evaluation ─────────────────────────────────────────────────

  /** Evaluate ALL conditions in a rule's when array (AND logic). */
  private _evalConditions(rule: CompiledRule, request: ActionRequest, ctx: AgentContext): boolean {
    // Tool condition
    if (rule.toolCondition && !evalToolCondition(rule.toolCondition, request.tool)) {
      return false;
    }

    // Param conditions (each element is a record of field → constraint)
    for (const paramMap of rule.paramConditions) {
      if (!evalParamConditions(paramMap, request.params)) return false;
    }

    // Context conditions
    for (const ctxMap of rule.contextConditions) {
      const sessionCtx = { ...(ctx.sessionContext ?? {}) };
      if (!evalParamConditions(ctxMap, sessionCtx)) return false;
    }

    // Data classification conditions
    for (const dataMap of rule.dataClassConditions) {
      const dataCtx: Record<string, unknown> = {
        inputLabels: request.inputDataLabels.join(','),
      };
      if (!evalParamConditions(dataMap, dataCtx)) return false;
    }

    // Time window conditions
    for (const tw of rule.timeConditions) {
      if (!evalTimeWindow(tw)) return false;
    }

    // Composite conditions (AND/OR/NOT)
    for (const composite of rule.compositeConditions ?? []) {
      if (!evalCompositeCondition(composite as WhenCondition, request, ctx)) return false;
    }

    return true;
  }

  // ─── Rule Partitioning ──────────────────────────────────────────────────

  /**
   * Separate monitor rules (accumulate) from terminal rules (first-match).
   * Returns matched monitor rules + first terminal rule that matches.
   *
   * Extracted to avoid TypeScript control-flow narrowing to `never` inside loops
   * when checking `rule.action === 'monitor'` followed by continue.
   */
  private _partitionAndMatch(
    rules: CompiledRule[],
    request: ActionRequest,
    ctx: AgentContext,
  ): { monitorMatches: CompiledRule[]; terminalMatch: CompiledRule | null } {
    const monitorMatches: CompiledRule[] = [];
    let terminalMatch: CompiledRule | null = null;

    // ─ Pass 1: Evaluate ALL monitor rules (they accumulate; never terminate)
    for (let i = 0; i < rules.length; i++) {
      const rule: CompiledRule = rules[i]!;
      if (rule.action !== 'monitor') continue;
      if (this._evalConditions(rule, request, ctx)) {
        monitorMatches.push(rule);
      }
    }

    // ─ Pass 2: Find first matching terminal rule (priority ASC, block > hitl > allow at equal priority)
    // terminalGroup collects all rules at the current winning priority level
    let winningPriority: number | null = null;
    const terminalGroup: CompiledRule[] = [];

    for (let i = 0; i < rules.length; i++) {
      const rule: CompiledRule = rules[i]!;
      if (rule.action === 'monitor') continue; // skip in terminal pass

      if (this._evalConditions(rule, request, ctx)) {
        const rulePriority: number = rule.priority;

        if (winningPriority === null) {
          winningPriority = rulePriority;
          terminalGroup.push(rule);
        } else if (rulePriority === winningPriority) {
          // Same priority group — collect for conflict resolution
          terminalGroup.push(rule);
        } else {
          // Higher priority number = lower precedence — stop collecting
          break;
        }
      }
    }

    // Resolve conflicts within the priority group
    if (terminalGroup.length === 1) {
      terminalMatch = terminalGroup[0]!;
    } else if (terminalGroup.length > 1) {
      // Most restrictive wins: block > require_approval > allow
      let winner: CompiledRule = terminalGroup[0]!;
      for (let i = 1; i < terminalGroup.length; i++) {
        winner = this._mostRestrictive(winner, terminalGroup[i]!);
      }
      terminalMatch = winner;
    }

    return { monitorMatches, terminalMatch };
  }

  // ─── Rate Limit ───────────────────────────────────────────────────────────

  /**
   * Check and update the rate limit counter for a terminal rule.
   * Returns true if the rate limit is exceeded.
   */
  private _checkRateLimit(
    rule: CompiledRule,
    request: ActionRequest,
    ctx: AgentContext,
  ): boolean {
    const rl = rule.rateLimit!;
    const windowMs = rl.windowSeconds * 1000;
    const now = Date.now();

    // Build rate key based on keyBy
    let keyValue: string;
    switch (rl.keyBy) {
      case 'session':
        keyValue = ctx.sessionId;
        break;
      case 'agent':
        keyValue = ctx.agentId;
        break;
      case 'tenant':
        keyValue = ctx.tenantId ?? ctx.agentId;
        break;
      case 'tool':
        keyValue = request.tool;
        break;
    }
    const rateKey = `${rule.id}:${rl.keyBy}:${keyValue}`;

    const existing = this.rateLimitState.get(rateKey);
    let bucket: RateLimitBucket;

    if (!existing || now - existing.windowStart >= windowMs) {
      // New or expired window
      bucket = { count: 1, windowStart: now };
      this.rateLimitState.set(rateKey, bucket);
      return false; // First call in window is always allowed
    }

    bucket = existing;
    if (bucket.count >= rl.maxCalls) {
      return true; // Rate limit exceeded
    }

    bucket.count += 1;
    return false;
  }

  // ─── Risk Score ───────────────────────────────────────────────────────────

  /**
   * Compute composite risk score per POLICY_ENGINE.md §4.4.
   *
   * base_score + monitor_boost, multiplied by context risk tier,
   * capped at 1000.
   */
  private _computeRiskScore(
    result: PolicyAction,
    monitorBoost: number,
    ctx: AgentContext,
  ): number {
    const base = BASE_RISK_SCORES[result];

    const riskTier = (ctx.sessionContext?.['riskTier'] as string | undefined) ?? 'medium';
    const multiplier =
      riskTier === 'critical'
        ? 3.0
        : riskTier === 'high'
          ? 2.0
          : riskTier === 'medium'
            ? 1.5
            : 1.0;

    return Math.min(1000, Math.round((base + monitorBoost) * multiplier));
  }

  // ─── Conflict Resolution ──────────────────────────────────────────────────

  /** Among two terminal rules with equal priority, return the most restrictive. */
  private _mostRestrictive(a: CompiledRule, b: CompiledRule): CompiledRule {
    // POLICY_ENGINE.md §6: block > require_approval > allow
    const rank: Record<PolicyAction, number> = {
      block: 3,
      require_approval: 2,
      monitor: 1,
      allow: 0,
    };
    return (rank[a.action] ?? 0) >= (rank[b.action] ?? 0) ? a : b;
  }

  private _buildReason(rule: CompiledRule, result: PolicyAction): string {
    const desc = rule.id;
    switch (result) {
      case 'allow':
        return `Allowed by rule "${desc}"`;
      case 'block':
        return `Blocked by rule "${desc}"`;
      case 'monitor':
        return `Monitored by rule "${desc}"`;
      case 'require_approval':
        return `Human approval required by rule "${desc}"`;
    }
  }

  // ─── Session Reset ────────────────────────────────────────────────────────

  /** Reset rate-limit counters for a session (use between test runs). */
  resetSession(sessionId: string): void {
    for (const key of this.rateLimitState.keys()) {
      if (key.includes(`:session:${sessionId}`)) {
        this.rateLimitState.delete(key);
      }
    }
  }

  /** Clear all rate-limit state (for testing). */
  resetAllRateLimits(): void {
    this.rateLimitState.clear();
  }

  // ─── Fingerprinting ───────────────────────────────────────────────────────

  /** Produce a stable hash of a bundle for change detection. */
  static fingerprintBundle(bundle: PolicyBundle): string {
    const content = JSON.stringify(bundle.rules, Object.keys(bundle.rules).sort() as never);
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}

// ─── Policy Compiler ──────────────────────────────────────────────────────────

export class PolicyCompiler {
  /**
   * Compile a PolicyDocument into a PolicyBundle.
   *
   * The bundle is pre-indexed for O(1) tool lookups during evaluation.
   * Implements POLICY_ENGINE.md §1.2 Compiler step.
   */
  static compile(doc: PolicyDocument): PolicyBundle {
    const compiledRules: CompiledRule[] = doc.rules.map((rule) =>
      PolicyCompiler.compileRule(rule),
    );

    // Build tool index: tool name → [rule indices]
    // Also: "*" → [indices of rules with glob "matches: [*]" or no tool condition]
    const toolIndex: Record<string, number[]> = {};

    for (let i = 0; i < compiledRules.length; i++) {
      const rule = compiledRules[i];
      if (!rule) continue;
      const tc = rule.toolCondition;

      if (!tc) {
        // No tool condition — this rule matches any tool
        if (!toolIndex['__no_tool__']) toolIndex['__no_tool__'] = [];
        toolIndex['__no_tool__'].push(i);
        continue;
      }

      // Exact "in" list
      for (const name of tc.in ?? []) {
        if (!toolIndex[name]) toolIndex[name] = [];
        toolIndex[name].push(i);
      }

      // Glob "matches" patterns — index under "*" for evaluation-time filtering
      if (tc.matches && tc.matches.length > 0) {
        if (!toolIndex['*']) toolIndex['*'] = [];
        toolIndex['*'].push(i);
      }

      // Regex — index under "*" for evaluation-time filtering
      if (tc.regex) {
        if (!toolIndex['*']) toolIndex['*'] = [];
        toolIndex['*'].push(i);
      }

      // not_in only — still needs to apply to all tools
      if (tc.not_in && !tc.in && !tc.matches && !tc.regex) {
        if (!toolIndex['*']) toolIndex['*'] = [];
        toolIndex['*'].push(i);
      }
    }

    const checksum = createHash('sha256')
      .update(JSON.stringify(compiledRules))
      .digest('hex');

    return {
      policyId: doc.id,
      tenantId: doc.tenantId,
      version: doc.version,
      compiledAt: new Date().toISOString(),
      defaultAction: doc.default,
      budgets: doc.budgets,
      rules: compiledRules,
      toolIndex,
      checksum,
      ruleCount: compiledRules.length,
    };
  }

  /** Compile a single PolicyRule into a CompiledRule. */
  static compileRule(rule: PolicyRule): CompiledRule {
    const paramConditions: Array<Record<string, ValueConstraint>> = [];
    const contextConditions: Array<Record<string, ValueConstraint>> = [];
    const dataClassConditions: Array<Record<string, ValueConstraint>> = [];
    const timeConditions: TimeWindow[] = [];
    const compositeConditions: WhenCondition[] = [];
    let toolCondition: ToolCondition | undefined;

    for (const when of rule.when) {
      if ('tool' in when) {
        toolCondition = when.tool;
      } else if ('params' in when) {
        paramConditions.push(when.params as Record<string, ValueConstraint>);
      } else if ('context' in when) {
        contextConditions.push(when.context as Record<string, ValueConstraint>);
      } else if ('dataClass' in when) {
        dataClassConditions.push(when.dataClass as Record<string, ValueConstraint>);
      } else if ('timeWindow' in when) {
        timeConditions.push(when.timeWindow);
      } else if ('AND' in when || 'OR' in when || 'NOT' in when) {
        compositeConditions.push(when as WhenCondition);
      }
    }

    return {
      id: rule.id,
      priority: rule.priority ?? 100,
      action: rule.action,
      toolCondition,
      paramConditions,
      contextConditions,
      dataClassConditions,
      timeConditions,
      compositeConditions,
      rateLimit: rule.rateLimit,
      approvers: rule.approvers,
      timeoutSec: rule.timeoutSec,
      on_timeout: rule.on_timeout,
      severity: rule.severity ?? 'medium',
      riskBoost: rule.riskBoost ?? 0,
      tags: rule.tags ?? [],
    };
  }
}

// ─── Condition Evaluators ─────────────────────────────────────────────────────

/** Evaluate a tool condition against a tool name. */
export function evalToolCondition(condition: ToolCondition, toolName: string): boolean {
  // "in" — exact match list
  if (condition.in !== undefined && condition.in.length > 0) {
    if (!condition.in.includes(toolName)) return false;
  }

  // "not_in" — exclusion list
  if (condition.not_in !== undefined && condition.not_in.length > 0) {
    if (condition.not_in.includes(toolName)) return false;
  }

  // "matches" — glob patterns (via micromatch)
  if (condition.matches !== undefined && condition.matches.length > 0) {
    const matches = micromatch.isMatch(toolName, condition.matches);
    if (!matches) return false;
  }

  // "regex"
  if (condition.regex !== undefined) {
    // eslint-disable-next-line security/detect-non-literal-regexp -- pattern comes from admin-authored policy YAML/JSON, not user input
    if (!new RegExp(condition.regex).test(toolName)) return false;
  }

  return true;
}

/** Evaluate a map of field → ValueConstraint against a params object. */
export function evalParamConditions(
  conditions: Record<string, ValueConstraint>,
  params: Record<string, unknown>,
): boolean {
  for (const [field, constraint] of Object.entries(conditions)) {
    if (field === '_any') {
      // Special: any field value must match
      const values = Object.values(params).map(String);
      const anyMatches = values.some((v) => evalValueConstraint(constraint, v));
      if (!anyMatches) return false;
    } else {
      const value = params[field];
      if (value === undefined) {
        if ('exists' in constraint && constraint.exists === false) continue; // exists:false matches absent field
        if ('is_null' in constraint && constraint.is_null === true) continue; // is_null:true matches absent field
        // Field absent — rule cannot match; absent field should NOT satisfy param conditions
        return false;
      }
      if (!evalValueConstraint(constraint, value)) return false;
    }
  }
  return true;
}

/** Evaluate a single ValueConstraint against a value. */
export function evalValueConstraint(constraint: ValueConstraint, value: unknown): boolean {
  if ('eq' in constraint && constraint.eq !== undefined) {
    if (value !== constraint.eq) return false;
  }
  if ('not_eq' in constraint && constraint.not_eq !== undefined) {
    if (value === constraint.not_eq) return false;
  }
  if ('gt' in constraint && constraint.gt !== undefined) {
    if (typeof value !== 'number' || value <= constraint.gt) return false;
  }
  if ('gte' in constraint && constraint.gte !== undefined) {
    if (typeof value !== 'number' || value < constraint.gte) return false;
  }
  if ('lt' in constraint && constraint.lt !== undefined) {
    if (typeof value !== 'number' || value >= constraint.lt) return false;
  }
  if ('lte' in constraint && constraint.lte !== undefined) {
    if (typeof value !== 'number' || value > constraint.lte) return false;
  }
  if ('in' in constraint && constraint.in !== undefined) {
    if (!constraint.in.includes(value as string & number)) return false;
  }
  if ('not_in' in constraint && constraint.not_in !== undefined) {
    if (constraint.not_in.includes(value as string & number)) return false;
  }
  if ('contains' in constraint && constraint.contains !== undefined) {
    if (!String(value).includes(constraint.contains)) return false;
  }
  if ('contains_any' in constraint && constraint.contains_any !== undefined) {
    const str = String(value);
    if (!constraint.contains_any.some((s) => str.includes(s))) return false;
  }
  if ('pattern' in constraint && constraint.pattern !== undefined) {
    if (!micromatch.isMatch(String(value), constraint.pattern)) return false;
  }
  if ('regex' in constraint && constraint.regex !== undefined) {
    // eslint-disable-next-line security/detect-non-literal-regexp -- pattern comes from admin-authored policy YAML/JSON, not user input
    if (!new RegExp(constraint.regex).test(String(value))) return false;
  }
  if ('domain_not_in' in constraint && constraint.domain_not_in !== undefined) {
    const domain = extractDomain(String(value));
    if (constraint.domain_not_in.includes(domain)) return false;
  }
  if ('exists' in constraint && constraint.exists !== undefined) {
    if (constraint.exists !== (value !== undefined && value !== null)) return false;
  }
  if ('is_null' in constraint && constraint.is_null !== undefined) {
    const isNull = value === null || value === undefined;
    if (constraint.is_null !== isNull) return false;
  }
  return true;
}

/** Evaluate a time window condition against the current time. */
export function evalTimeWindow(tw: TimeWindow): boolean {
  const now = new Date();

  if (tw.within) {
    return isInTimeRange(now, tw.within.days, tw.within.hours.start, tw.within.hours.end, tw.within.hours.tz);
  }

  if (tw.outside) {
    return !isInTimeRange(now, tw.outside.days, tw.outside.hours.start, tw.outside.hours.end, tw.outside.hours.tz);
  }

  return true; // No constraint
}

function isInTimeRange(
  now: Date,
  days: readonly string[],
  startTime: string,
  endTime: string,
  tz: string,
): boolean {
  try {
    const _localStr = now.toLocaleString('en-US', { timeZone: tz, weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false }); // combined locale string, kept for debugging time-window checks
    const dayName = now.toLocaleString('en-US', { timeZone: tz, weekday: 'long' }).toLowerCase();
    const timeStr = now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });

    const dayMatches = days.map((d) => d.toLowerCase()).includes(dayName);
    if (!dayMatches) return false;

    // Compare times as HH:MM strings
    return timeStr >= startTime && timeStr <= endTime;
  } catch {
    // Unknown timezone — conservative: assume not in window
    return false;
  }
}

// ─── Composite Condition Evaluator (AND/OR/NOT) ──────────────────────────────

/** Recursively evaluate a composite WhenCondition (AND/OR/NOT + leaf types). */
export function evalCompositeCondition(
  condition: WhenCondition,
  request: ActionRequest,
  ctx: AgentContext,
): boolean {
  if ('AND' in condition) {
    return condition.AND.every((c) => evalCompositeCondition(c, request, ctx));
  }
  if ('OR' in condition) {
    return condition.OR.some((c) => evalCompositeCondition(c, request, ctx));
  }
  if ('NOT' in condition) {
    return !evalCompositeCondition(condition.NOT, request, ctx);
  }
  // Leaf conditions
  if ('tool' in condition) {
    return evalToolCondition(condition.tool, request.tool);
  }
  if ('params' in condition) {
    return evalParamConditions(condition.params as Record<string, ValueConstraint>, request.params);
  }
  if ('context' in condition) {
    return evalParamConditions(condition.context as Record<string, ValueConstraint>, ctx.sessionContext ?? {});
  }
  if ('dataClass' in condition) {
    const dataCtx: Record<string, unknown> = { inputLabels: request.inputDataLabels.join(',') };
    return evalParamConditions(condition.dataClass as Record<string, ValueConstraint>, dataCtx);
  }
  if ('timeWindow' in condition) {
    return evalTimeWindow(condition.timeWindow);
  }
  return true;
}

/** Extract domain from email address or URL. */
export function extractDomain(emailOrUrl: string): string {
  if (emailOrUrl.includes('@')) {
    return (emailOrUrl.split('@')[1] ?? '').toLowerCase().trim();
  }
  try {
    const url = new URL(emailOrUrl.startsWith('http') ? emailOrUrl : `https://${emailOrUrl}`);
    return url.hostname.toLowerCase();
  } catch {
    return emailOrUrl.toLowerCase();
  }
}
