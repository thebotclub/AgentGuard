import type { Policy, PolicyVersion } from '@prisma/client';
import type { ServiceContext, CreatePolicyInput, UpdatePolicyInput, PolicyDocument, PolicyBundle, CompiledRule, PolicyRule, ActionRequest, AgentContext, PolicyDecision } from '@agentguard/shared';
import { BaseService } from './base.js';
import type { PrismaClient } from '../lib/prisma.js';
import type { Redis } from '../lib/redis.js';
export interface EvaluationResult {
    decision: PolicyDecision;
    policyId: string | null;
}
export interface TestResult {
    name: string;
    passed: boolean;
    skipped: boolean;
    expected: string;
    actual: string;
    matchedRuleId: string | null;
    riskScore: number;
    reason: string | null;
}
export interface TestSummary {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
}
export declare class PolicyService extends BaseService {
    private readonly redis;
    /** In-process rate-limit state — keyed ruleId:keyBy:value */
    private readonly rateLimitState;
    constructor(db: PrismaClient, ctx: ServiceContext, redis: Redis);
    listPolicies(limit?: number, cursor?: string): Promise<Policy[]>;
    getPolicy(policyId: string): Promise<Policy>;
    createPolicy(input: CreatePolicyInput): Promise<{
        policy: Policy;
        version: PolicyVersion;
        warnings: string[];
    }>;
    updatePolicy(policyId: string, input: UpdatePolicyInput): Promise<{
        policy: Policy;
        version?: PolicyVersion;
        warnings: string[];
    }>;
    deletePolicy(policyId: string): Promise<void>;
    listVersions(policyId: string): Promise<PolicyVersion[]>;
    getVersion(policyId: string, version: string): Promise<PolicyVersion>;
    activateVersion(policyId: string, version?: string): Promise<Policy>;
    /**
     * Fetch compiled bundle for an agent's active policy.
     * Redis-first (60s TTL), falls back to DB on miss.
     */
    getBundleForAgent(agentId: string): Promise<PolicyBundle | null>;
    /**
     * Get compiled bundle for a policy (for SDK bundle endpoint).
     */
    getCompiledBundle(policyId: string, version?: string): Promise<PolicyBundle>;
    /**
     * Evaluate an action request against a policy bundle.
     * Used by POST /v1/actions/evaluate.
     */
    evaluate(bundle: PolicyBundle, request: ActionRequest, ctx: AgentContext): PolicyDecision;
    /**
     * Run test cases against a policy without persisting anything.
     */
    testPolicy(policyId: string, tests: Array<{
        name: string;
        input: {
            tool: string;
            params: Record<string, unknown>;
            context: Record<string, unknown>;
        };
        expected: {
            decision: string;
            matchedRule?: string;
            minRiskScore?: number;
            maxRiskScore?: number;
        };
    }>): Promise<{
        summary: TestSummary;
        results: TestResult[];
    }>;
    private _evaluate;
    private _evalConditions;
    private _partitionAndMatch;
    private _checkRateLimit;
    private _computeRiskScore;
    private _mostRestrictive;
    private _buildReason;
    private parseAndValidateYaml;
    private persistVersion;
    private cacheBundle;
}
export declare class PolicyCompilerService {
    static compile(doc: PolicyDocument, policyId: string, tenantId: string): PolicyBundle;
    static compileRule(rule: PolicyRule): CompiledRule;
}
//# sourceMappingURL=policy.d.ts.map