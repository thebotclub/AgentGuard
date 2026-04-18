/**
 * AgentGuard — Policy Service
 *
 * Domain service for policy CRUD, validation, compilation, and coverage analysis.
 * Extracts business logic from route handlers so they only handle HTTP concerns.
 *
 * Depends on IDatabase for data access — no HTTP types imported.
 */
import { PolicyEngine, PolicyCompiler } from '../../packages/sdk/src/core/policy-engine.js';
import {
  PolicyRuleSchema,
  type PolicyDocument,
  type PolicyRule,
} from '../../packages/sdk/src/core/types.js';
import { DEFAULT_POLICY } from '../lib/policy-engine-setup.js';
import type { IDatabase } from '../db-interface.js';

export class PolicyService {
  constructor(private db: IDatabase) {}

  // ── Policy Retrieval ──────────────────────────────────────────────────────

  /**
   * Load the effective policy for a tenant: custom if set, else default.
   */
  async getEffectivePolicy(tenantId: string): Promise<PolicyDocument> {
    try {
      const custom = await this.db.getCustomPolicy(tenantId);
      if (custom) {
        const parsed = JSON.parse(custom) as unknown;
        if (Array.isArray(parsed)) {
          return { ...DEFAULT_POLICY, rules: parsed as PolicyDocument['rules'] };
        }
        return parsed as PolicyDocument;
      }
    } catch {
      // Fall back to default if stored policy is corrupt
    }
    return DEFAULT_POLICY;
  }

  /**
   * Check whether a tenant has a custom policy set.
   */
  async hasCustomPolicy(tenantId: string): Promise<boolean> {
    const raw = await this.db.getCustomPolicy(tenantId);
    return raw !== null;
  }

  // ── Policy Update ─────────────────────────────────────────────────────────

  /**
   * Validate and save a new policy for a tenant. Returns the validated policy
   * document or throws with validation errors.
   *
   * @param rulesRaw - Array of raw rule objects (pre-validated to be an array by caller)
   * @returns Validated PolicyDocument and count of rules
   */
  async updatePolicy(
    tenantId: string,
    rulesRaw: unknown[],
  ): Promise<{ policy: PolicyDocument; ruleCount: number }> {
    const validatedRules: PolicyRule[] = [];
    const ruleErrors: string[] = [];

    for (let i = 0; i < rulesRaw.length; i++) {
      const ruleResult = PolicyRuleSchema.safeParse(rulesRaw[i]);
      if (!ruleResult.success) {
        ruleErrors.push(
          `Rule ${i}: ${ruleResult.error.issues[0]?.message ?? 'invalid'}`,
        );
        if (ruleErrors.length >= 5) break;
      } else {
        validatedRules.push(ruleResult.data);
      }
    }

    if (ruleErrors.length > 0) {
      throw new PolicyValidationError(ruleErrors);
    }

    const policyDoc: PolicyDocument = {
      ...DEFAULT_POLICY,
      id: `custom-${tenantId}`,
      name: 'Custom Policy',
      rules: validatedRules,
    };

    // Version the current policy before overwriting
    const policyId = `custom-${tenantId}`;
    const currentPolicy = await this.db.getCustomPolicy(tenantId);
    if (currentPolicy) {
      await this.db.insertPolicyVersion(policyId, tenantId, currentPolicy);
    }

    await this.db.setCustomPolicy(tenantId, JSON.stringify(policyDoc));
    return { policy: policyDoc, ruleCount: validatedRules.length };
  }

  // ── Policy Bundle (for in-process SDK evaluation) ─────────────────────────

  /**
   * Compile the effective policy into a PolicyBundle optimised for client-side
   * local evaluation. Returns the bundle and its checksum.
   */
  async compileBundle(tenantId: string): Promise<{
    bundle: ReturnType<typeof PolicyCompiler.compile>;
    checksum: string;
  }> {
    const policy = await this.getEffectivePolicy(tenantId);
    const bundle = PolicyCompiler.compile(policy);
    return { bundle, checksum: bundle.checksum };
  }

  // ── Coverage Analysis ─────────────────────────────────────────────────────

  /**
   * Check which tools from a given list are covered by the tenant's policy rules.
   */
  async checkCoverage(
    tenantId: string,
    tools: string[],
  ): Promise<{
    coverage: number;
    covered: string[];
    uncovered: string[];
    results: Array<{
      tool: string;
      decision: string;
      ruleId: string | null;
      riskScore: number;
      reason: string | null;
    }>;
  }> {
    const policy = await this.getEffectivePolicy(tenantId);
    const engine = new PolicyEngine();
    engine.registerDocument(policy);

    const results = tools.map((toolName) => {
      const action = {
        id: 'coverage-check',
        agentId: 'coverage',
        tool: toolName,
        params: {},
        inputDataLabels: [],
        timestamp: new Date().toISOString(),
      };
      const ctx = {
        agentId: 'coverage',
        sessionId: 'coverage',
        policyVersion: '1.0.0',
      };
      const decision = engine.evaluate(action, ctx, policy.id);
      return {
        tool: toolName,
        decision: decision.result,
        ruleId: decision.matchedRuleId ?? null,
        riskScore: decision.riskScore,
        reason: decision.reason ?? null,
      };
    });

    const covered = results
      .filter((r) => r.ruleId !== null)
      .map((r) => r.tool);
    const uncovered = results
      .filter((r) => r.ruleId === null)
      .map((r) => r.tool);
    const coverage =
      tools.length > 0
        ? Math.round((covered.length / tools.length) * 100)
        : 100;

    return { coverage, covered, uncovered, results };
  }

  // ── Policy Versioning ─────────────────────────────────────────────────────

  /**
   * List all stored policy versions for a tenant.
   */
  async listVersions(tenantId: string) {
    const policyId = `custom-${tenantId}`;
    return this.db.getPolicyVersions(policyId, tenantId);
  }

  /**
   * Revert a tenant's policy to a specific version number.
   * Automatically snapshots the current policy before reverting.
   */
  async revertToVersion(
    tenantId: string,
    version: number,
  ): Promise<{ policy: PolicyDocument; revertedFrom: number }> {
    const policyId = `custom-${tenantId}`;
    const targetVersion = await this.db.getPolicyVersion(
      policyId,
      tenantId,
      version,
    );
    if (!targetVersion) {
      throw new PolicyVersionNotFoundError(version);
    }

    // Save current policy before reverting
    const currentPolicy = await this.db.getCustomPolicy(tenantId);
    if (currentPolicy) {
      await this.db.insertPolicyVersion(
        policyId,
        tenantId,
        currentPolicy,
        version,
      );
    }

    await this.db.setCustomPolicy(tenantId, targetVersion.policy_data);
    return {
      policy: JSON.parse(targetVersion.policy_data) as PolicyDocument,
      revertedFrom: version,
    };
  }
}

// ── Custom Error Types ────────────────────────────────────────────────────────

export class PolicyValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super('Invalid policy rule(s)');
    this.name = 'PolicyValidationError';
    this.errors = errors;
  }
}

export class PolicyVersionNotFoundError extends Error {
  constructor(version: number) {
    super(`Version ${version} not found`);
    this.name = 'PolicyVersionNotFoundError';
  }
}
