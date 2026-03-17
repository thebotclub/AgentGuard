/**
 * AgentGuard Local Policy Engine
 *
 * In-process policy evaluation — no HTTP, <5ms p99.
 *
 * Consumes a PolicyBundle (same JSON shape returned by GET /api/v1/policy/bundle)
 * and evaluates tool calls locally against the cached rules.
 *
 * Wildcard support: tool names may include glob patterns (e.g. "file_*")
 * via the existing toolIndex["*"] wildcard bucket used by the server-side engine.
 */
import micromatch from 'micromatch';
import type {
  PolicyBundle,
  CompiledRule,
  PolicyAction,
} from '../core/types.js';
import { BASE_RISK_SCORES } from '../core/types.js';

// ─── Result shape (mirrors HTTP evaluate response) ─────────────────────────

export interface EvaluateResult {
  result: 'allow' | 'block' | 'monitor' | 'require_approval';
  matchedRuleId?: string;
  riskScore: number;
  reason: string;
  durationMs: number;
}

// ─── Local Policy Engine ───────────────────────────────────────────────────

export class LocalPolicyEngine {
  private policy: PolicyBundle | null = null;

  // ─── Load ──────────────────────────────────────────────────────────────

  /**
   * Load a policy bundle from its JSON representation.
   * This is the only I/O-adjacent call — after loading, evaluate() is pure CPU.
   */
  loadPolicy(policyJson: string): void {
    const parsed = JSON.parse(policyJson) as PolicyBundle;
    // Basic sanity checks — don't crash on malformed bundles
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('LocalPolicyEngine: invalid policy JSON');
    }
    if (!Array.isArray(parsed.rules)) {
      throw new Error('LocalPolicyEngine: policy bundle missing rules array');
    }
    this.policy = parsed;
  }

  /** Load a pre-parsed PolicyBundle directly (avoids JSON.parse overhead). */
  loadBundle(bundle: PolicyBundle): void {
    this.policy = bundle;
  }

  /** Returns true when a policy is loaded and ready for evaluation. */
  isReady(): boolean {
    return this.policy !== null;
  }

  /** Returns the version of the currently loaded policy, or null if not loaded. */
  policyVersion(): string | null {
    return this.policy?.version ?? null;
  }

  /** Returns the checksum of the currently loaded policy bundle. */
  policyChecksum(): string | null {
    return this.policy?.checksum ?? null;
  }

  // ─── Evaluate ─────────────────────────────────────────────────────────

  /**
   * Evaluate a tool call locally against the cached policy.
   *
   * Pure CPU — no I/O, no async, <5ms p99.
   * Returns the same shape as the HTTP evaluate endpoint.
   *
   * @throws if no policy is loaded (caller must check isReady() or handle)
   */
  evaluate(
    tool: string,
    params?: Record<string, unknown>,
  ): EvaluateResult {
    if (!this.policy) {
      throw new Error(
        'LocalPolicyEngine: no policy loaded. Call loadPolicy() or syncPolicies() first.',
      );
    }

    const start = performance.now();
    const result = this._evaluate(tool, params ?? {});
    const durationMs = performance.now() - start;

    return { ...result, durationMs };
  }

  // ─── Core evaluation (pure sync, no I/O) ──────────────────────────────

  private _evaluate(
    tool: string,
    params: Record<string, unknown>,
  ): Omit<EvaluateResult, 'durationMs'> {
    const bundle = this.policy!;

    // ── Index lookup — O(1) ────────────────────────────────────────────
    const exactIndices = bundle.toolIndex[tool] ?? [];
    const wildcardIndices = bundle.toolIndex['*'] ?? [];
    const noToolIndices = bundle.toolIndex['__no_tool__'] ?? [];

    const candidateSet = new Set([
      ...exactIndices,
      ...wildcardIndices,
      ...noToolIndices,
    ]);

    const candidates: CompiledRule[] = [];
    for (const i of candidateSet) {
      const r = bundle.rules[i];
      if (r !== undefined) candidates.push(r);
    }

    // ── Sort by priority ASC (lowest number = highest priority) ────────
    candidates.sort((a, b) => a.priority - b.priority);

    // ── Separate monitor (accumulate) from terminal (first-match) ──────
    const monitorRules: CompiledRule[] = [];
    let monitorRiskBoost = 0;
    let terminalRule: CompiledRule | null = null;
    let winningPriority: number | null = null;
    const terminalGroup: CompiledRule[] = [];

    // Pass 1: collect all matching monitor rules
    for (const rule of candidates) {
      if (rule.action !== 'monitor') continue;
      if (this._matchesRule(rule, tool, params)) {
        monitorRules.push(rule);
        monitorRiskBoost += rule.riskBoost ?? 0;
      }
    }

    // Pass 2: find first matching terminal rule (by priority)
    for (const rule of candidates) {
      if (rule.action === 'monitor') continue;
      if (!this._matchesRule(rule, tool, params)) continue;

      if (winningPriority === null) {
        winningPriority = rule.priority;
        terminalGroup.push(rule);
      } else if (rule.priority === winningPriority) {
        terminalGroup.push(rule);
      } else {
        break; // already past winning priority
      }
    }

    // Conflict resolution within priority group: block > require_approval > allow
    if (terminalGroup.length === 1) {
      terminalRule = terminalGroup[0]!;
    } else if (terminalGroup.length > 1) {
      const rank: Record<PolicyAction, number> = {
        block: 3,
        require_approval: 2,
        monitor: 1,
        allow: 0,
      };
      let winner = terminalGroup[0]!;
      for (let i = 1; i < terminalGroup.length; i++) {
        const candidate = terminalGroup[i]!;
        if ((rank[candidate.action] ?? 0) > (rank[winner.action] ?? 0)) {
          winner = candidate;
        }
      }
      terminalRule = winner;
    }

    // ── Assemble decision ──────────────────────────────────────────────
    let result: PolicyAction;
    let reason: string;

    if (terminalRule === null) {
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
    }

    const riskScore = Math.min(
      1000,
      Math.round((BASE_RISK_SCORES[result] + monitorRiskBoost) * 1.5),
    );

    return {
      result,
      matchedRuleId: terminalRule?.id,
      riskScore,
      reason,
    };
  }

  // ─── Rule matching ─────────────────────────────────────────────────────

  private _matchesRule(
    rule: CompiledRule,
    tool: string,
    params: Record<string, unknown>,
  ): boolean {
    // Tool condition
    if (rule.toolCondition) {
      if (!this._matchesTool(rule.toolCondition, tool)) return false;
    }

    // Param conditions (AND logic across entries, AND logic within each map)
    for (const paramMap of rule.paramConditions ?? []) {
      if (!this._matchesParams(paramMap, params)) return false;
    }

    // Context and dataClass conditions are server-side concerns;
    // for local eval we skip them (conservative: treat absence as "matches")
    // Time window conditions are evaluated server-side only (clock-dependent)

    return true;
  }

  private _matchesTool(
    condition: { in?: string[]; not_in?: string[]; matches?: string[]; regex?: string },
    tool: string,
  ): boolean {
    if (condition.in !== undefined && condition.in.length > 0) {
      if (!condition.in.includes(tool)) return false;
    }
    if (condition.not_in !== undefined && condition.not_in.length > 0) {
      if (condition.not_in.includes(tool)) return false;
    }
    if (condition.matches !== undefined && condition.matches.length > 0) {
      if (!micromatch.isMatch(tool, condition.matches)) return false;
    }
    if (condition.regex !== undefined) {
      // eslint-disable-next-line security/detect-non-literal-regexp -- pattern comes from admin-authored policy config, not user input
      if (!new RegExp(condition.regex).test(tool)) return false;
    }
    return true;
  }

  private _matchesParams(
    conditions: Record<string, unknown>,
    params: Record<string, unknown>,
  ): boolean {
    for (const [field, constraint] of Object.entries(conditions)) {
      const value = params[field];
      if (value === undefined) {
        const c = constraint as Record<string, unknown>;
        if ('exists' in c && c['exists'] === false) continue;
        if ('is_null' in c && c['is_null'] === true) continue;
        return false; // absent param cannot satisfy a positive constraint
      }
      if (!this._evalConstraint(constraint as Record<string, unknown>, value)) return false;
    }
    return true;
  }

  private _evalConstraint(
    c: Record<string, unknown>,
    value: unknown,
  ): boolean {
    if ('eq' in c && c['eq'] !== undefined && value !== c['eq']) return false;
    if ('not_eq' in c && c['not_eq'] !== undefined && value === c['not_eq']) return false;
    if ('gt' in c && c['gt'] !== undefined && (typeof value !== 'number' || value <= (c['gt'] as number))) return false;
    if ('gte' in c && c['gte'] !== undefined && (typeof value !== 'number' || value < (c['gte'] as number))) return false;
    if ('lt' in c && c['lt'] !== undefined && (typeof value !== 'number' || value >= (c['lt'] as number))) return false;
    if ('lte' in c && c['lte'] !== undefined && (typeof value !== 'number' || value > (c['lte'] as number))) return false;
    if ('in' in c && Array.isArray(c['in']) && !(c['in'] as unknown[]).includes(value)) return false;
    if ('not_in' in c && Array.isArray(c['not_in']) && (c['not_in'] as unknown[]).includes(value)) return false;
    if ('contains' in c && typeof c['contains'] === 'string' && !String(value).includes(c['contains'])) return false;
    if ('contains_any' in c && Array.isArray(c['contains_any'])) {
      const str = String(value);
      if (!(c['contains_any'] as string[]).some((s) => str.includes(s))) return false;
    }
    if ('pattern' in c && typeof c['pattern'] === 'string') {
      if (!micromatch.isMatch(String(value), c['pattern'])) return false;
    }
    if ('regex' in c && typeof c['regex'] === 'string') {
      // eslint-disable-next-line security/detect-non-literal-regexp -- pattern comes from admin-authored policy config, not user input
      if (!new RegExp(c['regex']).test(String(value))) return false;
    }
    if ('exists' in c && c['exists'] !== undefined) {
      const exists = value !== undefined && value !== null;
      if (c['exists'] !== exists) return false;
    }
    if ('is_null' in c && c['is_null'] !== undefined) {
      const isNull = value === null || value === undefined;
      if (c['is_null'] !== isNull) return false;
    }
    return true;
  }

  private _buildReason(rule: CompiledRule, result: PolicyAction): string {
    switch (result) {
      case 'allow': return `Allowed by rule "${rule.id}"`;
      case 'block': return `Blocked by rule "${rule.id}"`;
      case 'monitor': return `Monitored by rule "${rule.id}"`;
      case 'require_approval': return `Human approval required by rule "${rule.id}"`;
    }
  }
}
