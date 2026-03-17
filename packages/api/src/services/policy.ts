/**
 * PolicyService — full CRUD, compilation, caching, and evaluation.
 * Ports PolicyCompiler + PolicyEngine from packages/sdk/src/core/policy-engine.ts.
 * Adds DB persistence (PostgreSQL via Prisma) and Redis bundle caching.
 */
import { createHash } from 'node:crypto';
import { load as loadYaml } from 'js-yaml';
import micromatch from 'micromatch';
import type { Policy, PolicyVersion } from '@prisma/client';
import type {
  ServiceContext,
  CreatePolicyInput,
  UpdatePolicyInput,
  PolicyDocument,
  PolicyBundle,
  CompiledRule,
  PolicyRule,
  PolicyAction,
  ToolCondition,
  ValueConstraint,
  TimeWindow,
  ActionRequest,
  AgentContext,
  PolicyDecision,
  WhenCondition,
} from '@agentguard/shared';
import {
  PolicyDocumentSchema,
  BASE_RISK_SCORES,
  POLICY_BUNDLE_TTL_SECONDS,
} from '@agentguard/shared';
import { BaseService } from './base.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { PrismaClient } from '../lib/prisma.js';
import type { Redis } from '../lib/redis.js';
import { RedisKeys } from '../lib/redis.js';

// ─── Rate-limit bucket (in-process, per service instance) ────────────────────
interface RateLimitBucket {
  count: number;
  windowStart: number;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RateLimitState = Map<string, RateLimitBucket>;

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

// ─── PolicyService ────────────────────────────────────────────────────────────

export class PolicyService extends BaseService {
  /** In-process rate-limit state — keyed ruleId:keyBy:value */
  private readonly rateLimitState: RateLimitState = new Map();

  constructor(
    db: PrismaClient,
    ctx: ServiceContext,
    private readonly redis: Redis,
  ) {
    super(db, ctx);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async listPolicies(limit = 50, cursor?: string): Promise<Policy[]> {
    return this.db.policy.findMany({
      where: {
        ...this.tenantScope(),
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async getPolicy(policyId: string): Promise<Policy> {
    const policy = await this.db.policy.findFirst({
      where: {
        ...this.tenantScope(),
        id: policyId,
        deletedAt: null,
      },
    });
    if (!policy) throw new NotFoundError('Policy', policyId);
    return policy;
  }

  async createPolicy(input: CreatePolicyInput): Promise<{ policy: Policy; version: PolicyVersion; warnings: string[] }> {
    this.assertRole('owner', 'admin');

    const { doc, warnings } = this.parseAndValidateYaml(input.yamlContent);

    return this.withTransaction(async (tx) => {
      const policy = await tx.policy.create({
        data: {
          tenantId: this.tenantId,
          name: input.name,
          description: input.description ?? null,
          defaultAction: doc.default,
        },
      });

      const bundle = PolicyCompilerService.compile(doc, policy.id, this.tenantId);
      const version = await this.persistVersion(tx, policy.id, doc, bundle, input);

      if (input.activate) {
        await tx.policy.update({
          where: { id: policy.id },
          data: { activeVersion: version.version },
        });
        await this.cacheBundle(policy.id, bundle);
      }

      return { policy, version, warnings };
    });
  }

  async updatePolicy(policyId: string, input: UpdatePolicyInput): Promise<{ policy: Policy; version?: PolicyVersion; warnings: string[] }> {
    this.assertRole('owner', 'admin');
    await this.getPolicy(policyId);

    return this.withTransaction(async (tx) => {
      let newVersion: PolicyVersion | undefined;
      const warnings: string[] = [];

      if (input.yamlContent) {
        const { doc, warnings: w } = this.parseAndValidateYaml(input.yamlContent);
        warnings.push(...w);
        const bundle = PolicyCompilerService.compile(doc, policyId, this.tenantId);
        newVersion = await this.persistVersion(tx, policyId, doc, bundle, {
          yamlContent: input.yamlContent,
          changelog: input.changelog,
          name: input.name,
          activate: input.activate ?? false,
        });

        if (input.activate && newVersion) {
          await this.cacheBundle(policyId, bundle);
        }
      }

      const policy = await tx.policy.update({
        where: { id: policyId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.activate && newVersion ? { activeVersion: newVersion.version } : {}),
        },
      });

      return { policy, version: newVersion, warnings };
    });
  }

  async deletePolicy(policyId: string): Promise<void> {
    this.assertRole('owner', 'admin');
    await this.getPolicy(policyId);

    await this.db.policy.update({
      where: { id: policyId },
      data: { deletedAt: new Date() },
    });

    // Invalidate Redis cache
    await this.redis.del(RedisKeys.policyBundle(this.tenantId, policyId));
  }

  async listVersions(policyId: string): Promise<PolicyVersion[]> {
    await this.getPolicy(policyId);

    return this.db.policyVersion.findMany({
      where: { policyId, tenantId: this.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVersion(policyId: string, version: string): Promise<PolicyVersion> {
    await this.getPolicy(policyId);

    const pv = await this.db.policyVersion.findUnique({
      where: { policyId_version: { policyId, version } },
    });
    if (!pv) throw new NotFoundError('PolicyVersion', `${policyId}@${version}`);
    return pv;
  }

  async activateVersion(policyId: string, version?: string): Promise<Policy> {
    this.assertRole('owner', 'admin');
    const _policy = await this.getPolicy(policyId); // validates existence before activation

    let targetVersion = version;
    if (!targetVersion) {
      const latest = await this.db.policyVersion.findFirst({
        where: { policyId, tenantId: this.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      if (!latest) throw new NotFoundError('PolicyVersion', 'latest');
      targetVersion = latest.version;
    } else {
      await this.getVersion(policyId, targetVersion);
    }

    const pv = await this.db.policyVersion.findUnique({
      where: { policyId_version: { policyId, version: targetVersion } },
    });
    if (!pv) throw new NotFoundError('PolicyVersion', targetVersion);

    // Cache the bundle in Redis with TTL
    const bundle = pv.compiledBundle as unknown as PolicyBundle;
    await this.cacheBundle(policyId, bundle);

    return this.db.policy.update({
      where: { id: policyId },
      data: { activeVersion: targetVersion },
    });
  }

  /**
   * Fetch compiled bundle for an agent's active policy.
   * Redis-first (60s TTL), falls back to DB on miss.
   */
  async getBundleForAgent(agentId: string): Promise<PolicyBundle | null> {
    const agent = await this.db.agent.findFirst({
      where: { id: agentId, tenantId: this.tenantId, deletedAt: null },
    });
    if (!agent || !agent.policyId) return null;

    // Try Redis first
    const cached = await this.redis.get(RedisKeys.policyBundle(this.tenantId, agent.policyId));
    if (cached) {
      return JSON.parse(cached) as PolicyBundle;
    }

    // DB fallback
    const policy = await this.db.policy.findFirst({
      where: { id: agent.policyId, tenantId: this.tenantId, deletedAt: null },
    });
    if (!policy || !policy.activeVersion) return null;

    const pv = await this.db.policyVersion.findUnique({
      where: { policyId_version: { policyId: agent.policyId, version: policy.activeVersion } },
    });
    if (!pv) return null;

    const bundle = pv.compiledBundle as unknown as PolicyBundle;
    await this.cacheBundle(agent.policyId, bundle);
    return bundle;
  }

  /**
   * Get compiled bundle for a policy (for SDK bundle endpoint).
   */
  async getCompiledBundle(policyId: string, version?: string): Promise<PolicyBundle> {
    const policy = await this.getPolicy(policyId);
    const v = version ?? policy.activeVersion;
    if (!v) throw new NotFoundError('PolicyVersion', 'active');

    // Try Redis cache first
    const cached = await this.redis.get(RedisKeys.policyBundle(this.tenantId, policyId));
    if (cached) {
      const bundle = JSON.parse(cached) as PolicyBundle;
      if (bundle.version === v) return bundle;
    }

    const pv = await this.getVersion(policyId, v);
    const bundle = pv.compiledBundle as unknown as PolicyBundle;
    await this.cacheBundle(policyId, bundle);
    return bundle;
  }

  /**
   * Evaluate an action request against a policy bundle.
   * Used by POST /v1/actions/evaluate.
   */
  evaluate(bundle: PolicyBundle, request: ActionRequest, ctx: AgentContext): PolicyDecision {
    const start = performance.now();
    const decision = this._evaluate(request, ctx, bundle);
    const durationMs = performance.now() - start;

    return {
      ...decision,
      policyVersion: bundle.version,
      evaluatedAt: new Date().toISOString(),
      durationMs,
    };
  }

  /**
   * Run test cases against a policy without persisting anything.
   */
  async testPolicy(
    policyId: string,
    tests: Array<{
      name: string;
      input: { tool: string; params: Record<string, unknown>; context: Record<string, unknown> };
      expected: { decision: string; matchedRule?: string; minRiskScore?: number; maxRiskScore?: number };
    }>,
  ): Promise<{ summary: TestSummary; results: TestResult[] }> {
    const bundle = await this.getCompiledBundle(policyId);
    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      const request: ActionRequest = {
        id: crypto.randomUUID(),
        agentId: 'test-agent',
        tool: test.input.tool,
        params: test.input.params,
        inputDataLabels: [],
        timestamp: new Date().toISOString(),
      };

      const ctx: AgentContext = {
        agentId: 'test-agent',
        sessionId: 'test-session',
        policyVersion: bundle.version,
        tenantId: this.tenantId,
        sessionContext: test.input.context,
      };

      const decision = this.evaluate(bundle, request, ctx);
      const actualDecision = decision.result;
      const expectedDecision = test.expected.decision;

      let testPassed = actualDecision === expectedDecision;
      if (testPassed && test.expected.matchedRule) {
        testPassed = decision.matchedRuleId === test.expected.matchedRule;
      }
      if (testPassed && test.expected.minRiskScore !== undefined) {
        testPassed = decision.riskScore >= test.expected.minRiskScore;
      }
      if (testPassed && test.expected.maxRiskScore !== undefined) {
        testPassed = decision.riskScore <= test.expected.maxRiskScore;
      }

      if (testPassed) passed++;
      else failed++;

      results.push({
        name: test.name,
        passed: testPassed,
        skipped: false,
        expected: expectedDecision,
        actual: actualDecision,
        matchedRuleId: decision.matchedRuleId,
        riskScore: decision.riskScore,
        reason: decision.reason,
      });
    }

    return {
      summary: { total: tests.length, passed, failed, skipped: 0 },
      results,
    };
  }

  // ── Core evaluation (ported from sdk/src/core/policy-engine.ts) ────────────

  private _evaluate(
    request: ActionRequest,
    ctx: AgentContext,
    bundle: PolicyBundle,
  ): Omit<PolicyDecision, 'policyVersion' | 'evaluatedAt' | 'durationMs'> {
    const exactIndices = bundle.toolIndex[request.tool] ?? [];
    const wildcardIndices = bundle.toolIndex['*'] ?? [];
    const noToolIndices = bundle.toolIndex['__no_tool__'] ?? [];

    const candidateIndices = new Set([...exactIndices, ...wildcardIndices, ...noToolIndices]);
    const candidateRules: CompiledRule[] = [];
    for (const i of candidateIndices) {
      const r = bundle.rules[i];
      if (r !== undefined) candidateRules.push(r);
    }

    candidateRules.sort((a, b) => a.priority - b.priority);

    const { monitorMatches, terminalMatch } = this._partitionAndMatch(candidateRules, request, ctx);

    const monitorRules = monitorMatches;
    let monitorRiskBoost = 0;
    for (const r of monitorRules) monitorRiskBoost += r.riskBoost;

    // Rate limit check on terminal rule
    if (terminalMatch?.rateLimit) {
      const rateLimitHit = this._checkRateLimit(terminalMatch, request, ctx);
      if (rateLimitHit) {
        return {
          result: 'block',
          matchedRuleId: terminalMatch.id,
          monitorRuleIds: monitorRules.map((r) => r.id),
          riskScore: this._computeRiskScore('block', monitorRiskBoost, ctx),
          reason: `Rate limit exceeded for rule "${terminalMatch.id}"`,
          gateId: null,
          gateTimeoutSec: null,
        };
      }
    }

    let result: PolicyAction;
    let reason: string;
    let gateId: string | null = null;
    let gateTimeoutSec: number | null = null;

    if (terminalMatch === null) {
      result = bundle.defaultAction;
      reason =
        result === 'block'
          ? 'No matching rule — default action is block (fail-closed)'
          : 'No matching rule — default action is allow (fail-open)';
    } else {
      result = terminalMatch.action;
      reason = this._buildReason(terminalMatch, result);

      if (result === 'require_approval') {
        gateId = crypto.randomUUID();
        gateTimeoutSec = terminalMatch.timeoutSec ?? 300;
      }
    }

    const riskScore = this._computeRiskScore(result, monitorRiskBoost, ctx);

    return {
      result,
      matchedRuleId: terminalMatch?.id ?? null,
      monitorRuleIds: monitorRules.map((r) => r.id),
      riskScore,
      reason,
      gateId,
      gateTimeoutSec,
    };
  }

  private _evalConditions(rule: CompiledRule, request: ActionRequest, ctx: AgentContext): boolean {
    if (rule.toolCondition && !evalToolCondition(rule.toolCondition, request.tool)) return false;

    for (const paramMap of rule.paramConditions) {
      if (!evalParamConditions(paramMap, request.params)) return false;
    }

    for (const ctxMap of rule.contextConditions) {
      const sessionCtx = { ...(ctx.sessionContext ?? {}) };
      if (!evalParamConditions(ctxMap, sessionCtx)) return false;
    }

    for (const dataMap of rule.dataClassConditions) {
      const dataCtx: Record<string, unknown> = {
        inputLabels: request.inputDataLabels.join(','),
      };
      if (!evalParamConditions(dataMap, dataCtx)) return false;
    }

    for (const tw of rule.timeConditions) {
      if (!evalTimeWindow(tw)) return false;
    }

    return true;
  }

  private _partitionAndMatch(
    rules: CompiledRule[],
    request: ActionRequest,
    ctx: AgentContext,
  ): { monitorMatches: CompiledRule[]; terminalMatch: CompiledRule | null } {
    const monitorMatches: CompiledRule[] = [];
    let terminalMatch: CompiledRule | null = null;

    for (const rule of rules) {
      if (rule.action !== 'monitor') continue;
      if (this._evalConditions(rule, request, ctx)) {
        monitorMatches.push(rule);
      }
    }

    let winningPriority: number | null = null;
    const terminalGroup: CompiledRule[] = [];

    for (const rule of rules) {
      if (rule.action === 'monitor') continue;
      if (this._evalConditions(rule, request, ctx)) {
        const rulePriority: number = rule.priority;
        if (winningPriority === null) {
          winningPriority = rulePriority;
          terminalGroup.push(rule);
        } else if (rulePriority === winningPriority) {
          terminalGroup.push(rule);
        } else {
          break;
        }
      }
    }

    if (terminalGroup.length === 1) {
      terminalMatch = terminalGroup[0] ?? null;
    } else if (terminalGroup.length > 1) {
      let winner: CompiledRule = terminalGroup[0]!;
      for (let i = 1; i < terminalGroup.length; i++) {
        winner = this._mostRestrictive(winner, terminalGroup[i]!);
      }
      terminalMatch = winner;
    }

    return { monitorMatches, terminalMatch };
  }

  private _checkRateLimit(rule: CompiledRule, request: ActionRequest, ctx: AgentContext): boolean {
    const rl = rule.rateLimit!;
    const windowMs = rl.windowSeconds * 1000;
    const now = Date.now();

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
      bucket = { count: 1, windowStart: now };
      this.rateLimitState.set(rateKey, bucket);
      return false;
    }

    bucket = existing;
    if (bucket.count >= rl.maxCalls) return true;
    bucket.count += 1;
    return false;
  }

  private _computeRiskScore(result: PolicyAction, monitorBoost: number, ctx: AgentContext): number {
    const base = BASE_RISK_SCORES[result];
    const riskTier = (ctx.sessionContext?.['riskTier'] as string | undefined) ?? 'medium';
    const multiplier =
      riskTier === 'critical' ? 3.0 : riskTier === 'high' ? 2.0 : riskTier === 'medium' ? 1.5 : 1.0;
    return Math.min(1000, Math.round((base + monitorBoost) * multiplier));
  }

  private _mostRestrictive(a: CompiledRule, b: CompiledRule): CompiledRule {
    const rank: Record<PolicyAction, number> = { block: 3, require_approval: 2, monitor: 1, allow: 0 };
    return (rank[a.action] ?? 0) >= (rank[b.action] ?? 0) ? a : b;
  }

  private _buildReason(rule: CompiledRule, result: PolicyAction): string {
    switch (result) {
      case 'allow': return `Allowed by rule "${rule.id}"`;
      case 'block': return `Blocked by rule "${rule.id}"`;
      case 'monitor': return `Monitored by rule "${rule.id}"`;
      case 'require_approval': return `Human approval required by rule "${rule.id}"`;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private parseAndValidateYaml(yamlContent: string): { doc: PolicyDocument; warnings: string[] } {
    let parsed: unknown;
    try {
      parsed = loadYaml(yamlContent);
    } catch (err) {
      throw new ValidationError({ yaml: `Invalid YAML: ${String(err)}` });
    }

    const result = PolicyDocumentSchema.safeParse(parsed);
    if (!result.success) {
      throw new ValidationError(result.error.issues);
    }

    const warnings: string[] = [];
    if (result.data.rules.length === 0) {
      warnings.push('Policy has no rules — all actions will use default action');
    }

    return { doc: result.data, warnings };
  }

  private async persistVersion(
    tx: import('@prisma/client').Prisma.TransactionClient,
    policyId: string,
    doc: PolicyDocument,
    bundle: PolicyBundle,
    input: { yamlContent?: string; changelog?: string | undefined; name?: string; activate?: boolean },
  ): Promise<PolicyVersion> {
    const compiledBundle = bundle as unknown as import('@prisma/client').Prisma.InputJsonValue;
    const bundleJson = JSON.stringify(compiledBundle);
    const bundleChecksum = createHash('sha256').update(bundleJson).digest('hex');

    const latestVersion = await tx.policyVersion.findFirst({
      where: { policyId, tenantId: this.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const nextVersion = incrementVersion(latestVersion?.version ?? '0.0.0');

    return tx.policyVersion.create({
      data: {
        tenantId: this.tenantId,
        policyId,
        version: nextVersion,
        yamlContent: input.yamlContent ?? JSON.stringify(doc),
        compiledBundle,
        bundleChecksum,
        ruleCount: doc.rules.length,
        changelog: input.changelog ?? null,
        createdByUserId: this.userId !== this.tenantId ? this.userId : null,
      },
    });
  }

  private async cacheBundle(policyId: string, bundle: PolicyBundle): Promise<void> {
    await this.redis.set(
      RedisKeys.policyBundle(this.tenantId, policyId),
      JSON.stringify(bundle),
      'EX',
      POLICY_BUNDLE_TTL_SECONDS,
    );
  }
}

// ─── PolicyCompilerService (ported from SDK) ──────────────────────────────────

export class PolicyCompilerService {
  static compile(doc: PolicyDocument, policyId: string, tenantId: string): PolicyBundle {
    const compiledRules: CompiledRule[] = doc.rules.map((rule) =>
      PolicyCompilerService.compileRule(rule),
    );

    const toolIndex: Record<string, number[]> = {};

    for (let i = 0; i < compiledRules.length; i++) {
      const rule = compiledRules[i];
      if (!rule) continue;
      const tc = rule.toolCondition;

      if (!tc) {
        if (!toolIndex['__no_tool__']) toolIndex['__no_tool__'] = [];
        toolIndex['__no_tool__'].push(i);
        continue;
      }

      for (const name of tc.in ?? []) {
        if (!toolIndex[name]) toolIndex[name] = [];
        toolIndex[name].push(i);
      }

      if (tc.matches && tc.matches.length > 0) {
        if (!toolIndex['*']) toolIndex['*'] = [];
        toolIndex['*'].push(i);
      }

      if (tc.regex) {
        if (!toolIndex['*']) toolIndex['*'] = [];
        toolIndex['*'].push(i);
      }

      if (tc.not_in && !tc.in && !tc.matches && !tc.regex) {
        if (!toolIndex['*']) toolIndex['*'] = [];
        toolIndex['*'].push(i);
      }
    }

    const checksum = createHash('sha256')
      .update(JSON.stringify(compiledRules))
      .digest('hex');

    return {
      policyId,
      tenantId,
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

  static compileRule(rule: PolicyRule): CompiledRule {
    const paramConditions: Array<Record<string, ValueConstraint>> = [];
    const contextConditions: Array<Record<string, ValueConstraint>> = [];
    const dataClassConditions: Array<Record<string, ValueConstraint>> = [];
    const timeConditions: TimeWindow[] = [];
    let toolCondition: ToolCondition | undefined;

    for (const when of rule.when as WhenCondition[]) {
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

// ─── Condition Evaluators (ported from SDK) ───────────────────────────────────

function evalToolCondition(condition: ToolCondition, toolName: string): boolean {
  if (condition.in !== undefined && condition.in.length > 0) {
    if (!condition.in.includes(toolName)) return false;
  }
  if (condition.not_in !== undefined && condition.not_in.length > 0) {
    if (condition.not_in.includes(toolName)) return false;
  }
  if (condition.matches !== undefined && condition.matches.length > 0) {
    if (!micromatch.isMatch(toolName, condition.matches)) return false;
  }
  if (condition.regex !== undefined) {
    // eslint-disable-next-line security/detect-non-literal-regexp -- pattern comes from admin-authored policy config, not user input
    if (!new RegExp(condition.regex).test(toolName)) return false;
  }
  return true;
}

function evalParamConditions(
  conditions: Record<string, ValueConstraint>,
  params: Record<string, unknown>,
): boolean {
  for (const [field, constraint] of Object.entries(conditions)) {
    if (field === '_any') {
      const values = Object.values(params).map(String);
      const anyMatches = values.some((v) => evalValueConstraint(constraint, v));
      if (!anyMatches) return false;
    } else {
      const value = params[field];
      if (value === undefined) {
        if ('exists' in constraint && constraint.exists === true) return false;
        if ('is_null' in constraint && (constraint as { is_null?: boolean }).is_null === false) return false;
        continue;
      }
      if (!evalValueConstraint(constraint, value)) return false;
    }
  }
  return true;
}

function evalValueConstraint(constraint: ValueConstraint, value: unknown): boolean {
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
  if ('contains_any' in constraint && (constraint as { contains_any?: string[] }).contains_any !== undefined) {
    const str = String(value);
    if (!(constraint as { contains_any?: string[] }).contains_any!.some((s) => str.includes(s))) return false;
  }
  if ('pattern' in constraint && (constraint as { pattern?: string }).pattern !== undefined) {
    if (!micromatch.isMatch(String(value), (constraint as { pattern?: string }).pattern!)) return false;
  }
  if ('regex' in constraint && (constraint as { regex?: string }).regex !== undefined) {
    // eslint-disable-next-line security/detect-non-literal-regexp -- pattern comes from admin-authored policy config, not user input
    if (!new RegExp((constraint as { regex?: string }).regex!).test(String(value))) return false;
  }
  if ('domain_not_in' in constraint && (constraint as { domain_not_in?: string[] }).domain_not_in !== undefined) {
    const domain = extractDomain(String(value));
    if ((constraint as { domain_not_in?: string[] }).domain_not_in!.includes(domain)) return false;
  }
  if ('exists' in constraint && constraint.exists !== undefined) {
    if (constraint.exists !== (value !== undefined && value !== null)) return false;
  }
  if ('is_null' in constraint && (constraint as { is_null?: boolean }).is_null !== undefined) {
    const isNull = value === null || value === undefined;
    if ((constraint as { is_null?: boolean }).is_null !== isNull) return false;
  }
  return true;
}

function evalTimeWindow(tw: TimeWindow): boolean {
  const now = new Date();
  if (tw.within) {
    return isInTimeRange(now, tw.within.days, tw.within.hours.start, tw.within.hours.end, tw.within.hours.tz);
  }
  if (tw.outside) {
    return !isInTimeRange(now, tw.outside.days, tw.outside.hours.start, tw.outside.hours.end, tw.outside.hours.tz);
  }
  return true;
}

function isInTimeRange(
  now: Date,
  days: readonly string[],
  startTime: string,
  endTime: string,
  tz: string,
): boolean {
  try {
    const dayName = now.toLocaleString('en-US', { timeZone: tz, weekday: 'long' }).toLowerCase();
    const timeStr = now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const dayMatches = days.map((d) => d.toLowerCase()).includes(dayName);
    if (!dayMatches) return false;
    return timeStr >= startTime && timeStr <= endTime;
  } catch {
    return false;
  }
}

function extractDomain(emailOrUrl: string): string {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  const patch = (parts[2] ?? 0) + 1;
  return `${parts[0] ?? 1}.${parts[1] ?? 0}.${patch}`;
}
