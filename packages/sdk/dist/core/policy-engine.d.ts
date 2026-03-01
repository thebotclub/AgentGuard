import { type PolicyDocument, type PolicyBundle, type CompiledRule, type PolicyRule, type AgentContext, type ActionRequest, type PolicyDecision, type ToolCondition, type ValueConstraint, type TimeWindow } from './types.js';
export declare class PolicyEngine {
    private readonly bundles;
    private readonly documents;
    /** ruleId:keyBy:keyValue → bucket */
    private readonly rateLimitState;
    /**
     * Load and compile a YAML policy file from disk.
     * Returns the compiled PolicyBundle cached internally.
     */
    loadFromFile(filePath: string): PolicyBundle;
    /**
     * Parse, validate and compile a YAML policy string.
     * Stores both the source document and the compiled bundle.
     */
    loadFromYaml(yamlContent: string): PolicyBundle;
    /** Register an already-compiled PolicyBundle directly. */
    registerBundle(bundle: PolicyBundle): void;
    /** Register an already-validated PolicyDocument (compiles it). */
    registerDocument(doc: PolicyDocument): PolicyBundle;
    /** Get a loaded bundle by policy ID. */
    getBundle(policyId: string): PolicyBundle | undefined;
    /** Get a loaded document by policy ID. */
    getDocument(policyId: string): PolicyDocument | undefined;
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
    evaluate(request: ActionRequest, ctx: AgentContext, policyId: string): PolicyDecision;
    private _evaluate;
    /** Evaluate ALL conditions in a rule's when array (AND logic). */
    private _evalConditions;
    /**
     * Separate monitor rules (accumulate) from terminal rules (first-match).
     * Returns matched monitor rules + first terminal rule that matches.
     *
     * Extracted to avoid TypeScript control-flow narrowing to `never` inside loops
     * when checking `rule.action === 'monitor'` followed by continue.
     */
    private _partitionAndMatch;
    /**
     * Check and update the rate limit counter for a terminal rule.
     * Returns true if the rate limit is exceeded.
     */
    private _checkRateLimit;
    /**
     * Compute composite risk score per POLICY_ENGINE.md §4.4.
     *
     * base_score + monitor_boost, multiplied by context risk tier,
     * capped at 1000.
     */
    private _computeRiskScore;
    /** Among two terminal rules with equal priority, return the most restrictive. */
    private _mostRestrictive;
    private _buildReason;
    /** Reset rate-limit counters for a session (use between test runs). */
    resetSession(sessionId: string): void;
    /** Clear all rate-limit state (for testing). */
    resetAllRateLimits(): void;
    /** Produce a stable hash of a bundle for change detection. */
    static fingerprintBundle(bundle: PolicyBundle): string;
}
export declare class PolicyCompiler {
    /**
     * Compile a PolicyDocument into a PolicyBundle.
     *
     * The bundle is pre-indexed for O(1) tool lookups during evaluation.
     * Implements POLICY_ENGINE.md §1.2 Compiler step.
     */
    static compile(doc: PolicyDocument): PolicyBundle;
    /** Compile a single PolicyRule into a CompiledRule. */
    static compileRule(rule: PolicyRule): CompiledRule;
}
/** Evaluate a tool condition against a tool name. */
export declare function evalToolCondition(condition: ToolCondition, toolName: string): boolean;
/** Evaluate a map of field → ValueConstraint against a params object. */
export declare function evalParamConditions(conditions: Record<string, ValueConstraint>, params: Record<string, unknown>): boolean;
/** Evaluate a single ValueConstraint against a value. */
export declare function evalValueConstraint(constraint: ValueConstraint, value: unknown): boolean;
/** Evaluate a time window condition against the current time. */
export declare function evalTimeWindow(tw: TimeWindow): boolean;
/** Extract domain from email address or URL. */
export declare function extractDomain(emailOrUrl: string): string;
//# sourceMappingURL=policy-engine.d.ts.map