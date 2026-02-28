/**
 * PolicyEngine test suite
 * 13 test cases covering: allow, deny, glob deny, rate limits, spend caps,
 * HITL, PII data access, unknown action default-deny, policy composition,
 * and policy fingerprinting.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';

import { PolicyEngine } from '@/core/policy-engine.js';
import { PolicyError } from '@/core/errors.js';
import type { Policy, AgentContext, Action } from '@/core/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_POLICY: Policy = {
  id: 'test-policy-v1',
  version: '1.0.0',
  description: 'Test policy',
  tools: {
    allow: ['search:web', 'data:query', 'finance:read_balance'],
    deny: ['finance:transfer', 'db:delete'],
  },
  dataAccess: {
    allowedClassifications: ['public', 'internal'],
    allowExport: false,
    allowPII: false,
  },
  rateLimits: {
    globalCallsPerMinute: 100,
    perTool: {
      'data:query': 5,
    },
  },
  spending: {
    maxTotalUsd: 50,
    maxPerActionUsd: 10,
    currency: 'USD',
  },
  humanInTheLoop: {
    requireApprovalFor: ['send_email', 'finance:generate_report'],
    timeoutSeconds: 60,
  },
  defaultAction: 'deny',
};

function makeCtx(overrides?: Partial<AgentContext>): AgentContext {
  return {
    agentId: 'agent-test-001',
    sessionId: randomUUID(),
    policyVersion: '1.0.0',
    ...overrides,
  };
}

function makeAction(tool: string, extra?: Partial<Action>): Action {
  return {
    id: randomUUID(),
    agentId: 'agent-test-001',
    tool,
    parameters: {},
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
    engine.register(BASE_POLICY);
  });

  // ── 1. Allowed tool ────────────────────────────────────────────────────────
  it('allows a tool that is on the allow list', () => {
    const ctx = makeCtx();
    const result = engine.evaluate(makeAction('search:web'), ctx, BASE_POLICY.id);

    expect(result.verdict).toBe('allow');
    expect(result.matchedRule).toBe('tools.allow');
  });

  // ── 2. Denied tool (explicit deny list) ───────────────────────────────────
  it('denies a tool that is on the explicit deny list', () => {
    const ctx = makeCtx();
    const result = engine.evaluate(makeAction('finance:transfer'), ctx, BASE_POLICY.id);

    expect(result.verdict).toBe('deny');
    expect(result.matchedRule).toBe('tools.deny');
    expect(result.reason).toMatch(/deny list/i);
  });

  // ── 3. Deny list takes precedence over allow list ─────────────────────────
  it('deny list takes precedence even if tool is also in allow list', () => {
    const policy: Policy = {
      ...BASE_POLICY,
      id: 'conflict-policy',
      tools: {
        allow: ['db:delete'],
        deny: ['db:delete'],
      },
    };
    engine.register(policy);
    const ctx = makeCtx();
    const result = engine.evaluate(makeAction('db:delete'), ctx, policy.id);

    expect(result.verdict).toBe('deny');
    expect(result.matchedRule).toBe('tools.deny');
  });

  // ── 4. Unknown tool defaults to deny ─────────────────────────────────────
  it('denies an unknown tool not in any list (default deny)', () => {
    const ctx = makeCtx();
    const result = engine.evaluate(makeAction('mystery:action'), ctx, BASE_POLICY.id);

    expect(result.verdict).toBe('deny');
  });

  // ── 5. Glob deny pattern ──────────────────────────────────────────────────
  it('denies tools matching a glob deny pattern', () => {
    const policy: Policy = {
      ...BASE_POLICY,
      id: 'glob-policy',
      tools: {
        allow: ['infra:read_status'],
        deny: ['*.delete', '*.destroy'],
      },
    };
    engine.register(policy);
    const ctx = makeCtx();

    expect(engine.evaluate(makeAction('resource.delete'), ctx, policy.id).verdict).toBe('deny');
    expect(engine.evaluate(makeAction('cluster.destroy'), ctx, policy.id).verdict).toBe('deny');
    expect(engine.evaluate(makeAction('infra:read_status'), ctx, policy.id).verdict).toBe('allow');
  });

  // ── 6. Rate limit (per-tool) ──────────────────────────────────────────────
  it('denies when per-tool rate limit is exceeded', () => {
    const ctx = makeCtx();
    // Limit is 5/min for data:query
    for (let i = 0; i < 5; i++) {
      const r = engine.evaluate(makeAction('data:query'), ctx, BASE_POLICY.id);
      expect(r.verdict).toBe('allow');
    }
    const over = engine.evaluate(makeAction('data:query'), ctx, BASE_POLICY.id);
    expect(over.verdict).toBe('deny');
    expect(over.matchedRule).toBe('rateLimits.perTool');
    expect(over.reason).toMatch(/rate limit/i);
  });

  // ── 7. Rate limit does not bleed across sessions ──────────────────────────
  it('rate limits are scoped per session', () => {
    const ctx1 = makeCtx({ sessionId: 'session-A' });
    const ctx2 = makeCtx({ sessionId: 'session-B' });

    for (let i = 0; i < 5; i++) {
      engine.evaluate(makeAction('data:query'), ctx1, BASE_POLICY.id);
    }
    // ctx2 should not be affected
    const result = engine.evaluate(makeAction('data:query'), ctx2, BASE_POLICY.id);
    expect(result.verdict).toBe('allow');
  });

  // ── 8. Per-action spend cap ────────────────────────────────────────────────
  it('denies when estimated cost exceeds per-action cap', () => {
    const ctx = makeCtx();
    const result = engine.evaluate(
      makeAction('data:query', { estimatedCostUsd: 15 }), // limit = $10
      ctx,
      BASE_POLICY.id,
    );

    expect(result.verdict).toBe('deny');
    expect(result.matchedRule).toBe('spending.maxPerActionUsd');
    expect(result.context?.['costUsd']).toBe(15);
  });

  // ── 9. Cumulative spend cap ────────────────────────────────────────────────
  it('denies when cumulative spend would exceed session cap', () => {
    const ctx = makeCtx();
    // Manually load up spend to $48
    (engine as unknown as { spendState: Map<string, number> }).spendState.set(ctx.sessionId, 48);

    const result = engine.evaluate(
      makeAction('search:web', { estimatedCostUsd: 5 }), // $48 + $5 = $53 > $50
      ctx,
      BASE_POLICY.id,
    );

    expect(result.verdict).toBe('deny');
    expect(result.matchedRule).toBe('spending.maxTotalUsd');
  });

  // ── 10. HITL required ─────────────────────────────────────────────────────
  it('returns require-approval for HITL-gated tools', () => {
    const ctx = makeCtx();
    const result = engine.evaluate(makeAction('send_email'), ctx, BASE_POLICY.id);

    expect(result.verdict).toBe('require-approval');
    expect(result.matchedRule).toBe('humanInTheLoop.requireApprovalFor');
    expect(result.context?.['timeoutSeconds']).toBe(60);
  });

  // ── 11. Data access: PII denied ───────────────────────────────────────────
  it('denies access to PII data when allowPII is false', () => {
    const ctx = makeCtx();
    const result = engine.evaluate(
      makeAction('data:query', { dataClassification: 'pii' }),
      ctx,
      BASE_POLICY.id,
    );

    expect(result.verdict).toBe('deny');
    expect(result.matchedRule).toBe('dataAccess.allowPII');
  });

  // ── 12. Data access: classification not in allowed list ──────────────────
  it('denies access to disallowed data classifications', () => {
    const ctx = makeCtx();
    const result = engine.evaluate(
      makeAction('data:query', { dataClassification: 'top-secret' }),
      ctx,
      BASE_POLICY.id,
    );

    expect(result.verdict).toBe('deny');
    expect(result.matchedRule).toBe('dataAccess.allowedClassifications');
  });

  // ── 13. Policy not found throws PolicyError ───────────────────────────────
  it('throws PolicyError with code POLICY_NOT_FOUND for unknown policy ID', () => {
    const ctx = makeCtx();
    expect(() =>
      engine.evaluate(makeAction('search:web'), ctx, 'nonexistent-policy'),
    ).toThrow(PolicyError);

    try {
      engine.evaluate(makeAction('search:web'), ctx, 'nonexistent-policy');
    } catch (err) {
      expect(err).toBeInstanceOf(PolicyError);
      expect((err as PolicyError).code).toBe('POLICY_NOT_FOUND');
    }
  });

  // ── 14. Policy composition: multiple policies independent ─────────────────
  it('evaluates actions against the correct policy when multiple are loaded', () => {
    const permissive: Policy = {
      ...BASE_POLICY,
      id: 'permissive-policy',
      tools: { allow: ['finance:transfer'], deny: [] },
      defaultAction: 'allow',
    };
    engine.register(permissive);

    const ctx = makeCtx();
    const strict = engine.evaluate(makeAction('finance:transfer'), ctx, BASE_POLICY.id);
    const lenient = engine.evaluate(makeAction('finance:transfer'), ctx, permissive.id);

    expect(strict.verdict).toBe('deny');
    expect(lenient.verdict).toBe('allow');
  });

  // ── 15. PolicyEngine.fingerprintPolicy is stable ──────────────────────────
  it('produces the same fingerprint for the same policy content', () => {
    const fp1 = PolicyEngine.fingerprintPolicy(BASE_POLICY);
    const fp2 = PolicyEngine.fingerprintPolicy({ ...BASE_POLICY });
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(16);
  });
});

// ─── PolicyError factory tests ────────────────────────────────────────────────

describe('PolicyError', () => {
  it('PolicyError.denied sets correct code and verdict', () => {
    const err = PolicyError.denied('not allowed', { tool: 'transfer' });
    expect(err.code).toBe('DENIED');
    expect(err.meta.verdict).toBe('deny');
    expect(err.meta.tool).toBe('transfer');
    expect(err.isSecurityBlock()).toBe(true);
    expect(err.isRetryable()).toBe(false);
  });

  it('PolicyError.rateLimited is retryable', () => {
    const err = PolicyError.rateLimited('too fast');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.isRetryable()).toBe(true);
    expect(err.isSecurityBlock()).toBe(false);
  });

  it('PolicyError.requiresApproval sets require-approval verdict', () => {
    const err = PolicyError.requiresApproval('needs HITL', { tool: 'send_email' });
    expect(err.code).toBe('REQUIRES_APPROVAL');
    expect(err.meta.verdict).toBe('require-approval');
  });

  it('PolicyError.spendCapExceeded is a security block', () => {
    const err = PolicyError.spendCapExceeded('over budget');
    expect(err.code).toBe('SPEND_CAP_EXCEEDED');
    expect(err.isSecurityBlock()).toBe(true);
  });

  it('PolicyError.globalHalt includes reason in message', () => {
    const err = PolicyError.globalHalt('breach detected');
    expect(err.code).toBe('GLOBAL_HALT');
    expect(err.message).toMatch(/breach detected/);
    expect(err.isSecurityBlock()).toBe(true);
  });

  it('PolicyError.toJSON serialises correctly', () => {
    const err = PolicyError.denied('no access', { tool: 'admin:delete' });
    const json = err.toJSON();
    expect(json['code']).toBe('DENIED');
    expect(json['message']).toBe('no access');
    expect((json['meta'] as { tool: string })['tool']).toBe('admin:delete');
  });
});
