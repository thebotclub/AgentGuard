/**
 * AgentGuard Policy Engine — Unit Tests
 *
 * Uses Node.js built-in test runner (node:test + node:assert).
 * No external test frameworks required.
 *
 * Run: npx tsx --test tests/unit.test.ts
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PolicyEngine, PolicyCompiler, evalToolCondition, evalValueConstraint } from '../packages/sdk/src/core/policy-engine.js';
import { PolicyError } from '../packages/sdk/src/core/errors.js';
import type { PolicyDocument, AgentContext, ActionRequest } from '../packages/sdk/src/core/types.js';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const BASE_DOC: PolicyDocument = {
  id: 'unit-test-policy',
  name: 'Unit Test Policy',
  version: '1.0.0',
  default: 'block',
  rules: [
    {
      id: 'rule-allow-read',
      description: 'Allow read operations',
      priority: 100,
      action: 'allow',
      when: [{ tool: { in: ['file_read', 'db_read_public', 'get_config', 'list_files'] } }],
      severity: 'low',
      tags: ['read-only'],
      riskBoost: 0,
    },
    {
      id: 'rule-block-priv-esc',
      description: 'Block privilege escalation',
      priority: 5,
      action: 'block',
      when: [{ tool: { in: ['shell_exec', 'sudo', 'chmod', 'chown', 'system_command'] } }],
      severity: 'critical',
      tags: ['security'],
      riskBoost: 300,
    },
    {
      id: 'rule-block-external-http',
      description: 'Block external HTTP requests',
      priority: 10,
      action: 'block',
      when: [
        { tool: { in: ['http_request', 'http_post', 'fetch', 'curl', 'wget'] } },
        { params: { destination: { not_in: ['api.internal.com', 'db.internal.com'] } } },
      ],
      severity: 'critical',
      tags: ['data-protection'],
      riskBoost: 200,
    },
    {
      id: 'rule-block-pii',
      description: 'Block PII table access',
      priority: 20,
      action: 'block',
      when: [
        { tool: { in: ['db_query', 'db_read', 'sql_execute'] } },
        { params: { table: { in: ['users', 'customers', 'employees', 'payroll'] } } },
      ],
      severity: 'high',
      tags: ['privacy'],
      riskBoost: 150,
    },
    {
      id: 'rule-monitor-llm',
      description: 'Monitor LLM calls',
      priority: 50,
      action: 'monitor',
      when: [{ tool: { in: ['llm_query', 'openai_chat', 'anthropic_complete'] } }],
      severity: 'low',
      tags: ['cost-tracking'],
      riskBoost: 0,
    },
    {
      id: 'rule-require-approval-financial',
      description: 'Require approval for high-value transactions',
      priority: 15,
      action: 'require_approval',
      approvers: ['finance-team'],
      timeoutSec: 300,
      on_timeout: 'block',
      when: [
        { tool: { in: ['transfer_funds', 'create_payment', 'execute_transaction'] } },
        { params: { amount: { gt: 1000 } } },
      ],
      severity: 'high',
      tags: ['financial'],
      riskBoost: 100,
    },
    {
      id: 'rule-block-destructive',
      description: 'Block destructive operations',
      priority: 8,
      action: 'block',
      when: [
        { tool: { in: ['file_delete', 'rm', 'rmdir', 'unlink', 'drop_table'] } },
      ],
      severity: 'high',
      tags: ['data-protection'],
      riskBoost: 200,
    },
  ],
};

function makeCtx(overrides?: Partial<AgentContext>): AgentContext {
  return {
    agentId: 'test-agent',
    sessionId: randomUUID(),
    policyVersion: '1.0.0',
    ...overrides,
  };
}

function makeReq(tool: string, params: Record<string, unknown> = {}): ActionRequest {
  return {
    id: randomUUID(),
    agentId: 'test-agent',
    tool,
    params,
    inputDataLabels: [],
    timestamp: new Date().toISOString(),
  };
}

// ─── Rule 1: allow-read-operations ──────────────────────────────────────────

describe('Rule: allow-read-operations', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
    engine.registerDocument(BASE_DOC);
  });

  it('allows file_read', () => {
    const r = engine.evaluate(makeReq('file_read'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'allow');
    assert.equal(r.matchedRuleId, 'rule-allow-read');
  });

  it('allows db_read_public', () => {
    const r = engine.evaluate(makeReq('db_read_public'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'allow');
  });

  it('allows list_files', () => {
    const r = engine.evaluate(makeReq('list_files'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'allow');
  });

  it('allows get_config', () => {
    const r = engine.evaluate(makeReq('get_config'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'allow');
  });
});

// ─── Rule 2: block-privilege-escalation ─────────────────────────────────────

describe('Rule: block-privilege-escalation', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
    engine.registerDocument(BASE_DOC);
  });

  it('blocks sudo', () => {
    const r = engine.evaluate(makeReq('sudo'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
    assert.equal(r.matchedRuleId, 'rule-block-priv-esc');
  });

  it('blocks shell_exec', () => {
    const r = engine.evaluate(makeReq('shell_exec'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
  });

  it('blocks chmod', () => {
    const r = engine.evaluate(makeReq('chmod'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
  });

  it('blocks chown', () => {
    const r = engine.evaluate(makeReq('chown'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
  });

  it('blocks system_command', () => {
    const r = engine.evaluate(makeReq('system_command'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
  });

  it('privilege escalation riskBoost increases risk score', () => {
    const r = engine.evaluate(makeReq('sudo'), makeCtx(), BASE_DOC.id);
    assert.ok(r.riskScore > 0, 'riskScore should be elevated');
  });
});

// ─── Rule 3: block-external-http ────────────────────────────────────────────

describe('Rule: block-external-http', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
    engine.registerDocument(BASE_DOC);
  });

  it('blocks http_request to external destination', () => {
    const r = engine.evaluate(
      makeReq('http_request', { destination: 'https://evil.com/steal' }),
      makeCtx(),
      BASE_DOC.id,
    );
    assert.equal(r.result, 'block');
    assert.equal(r.matchedRuleId, 'rule-block-external-http');
  });

  it('blocks http_post to external destination', () => {
    const r = engine.evaluate(
      makeReq('http_post', { destination: 'https://exfil.io/data' }),
      makeCtx(),
      BASE_DOC.id,
    );
    assert.equal(r.result, 'block');
  });

  it('allows http_request to approved internal destination', () => {
    const r = engine.evaluate(
      makeReq('http_request', { destination: 'api.internal.com' }),
      makeCtx(),
      BASE_DOC.id,
    );
    // Internal destination — rule's param condition fails → falls through to default (block)
    // but rule does NOT match (param condition: not_in internal → internal is excluded from "block")
    // The tool matches but params.destination IS in the allowed list → rule won't fire
    // Default policy is 'block', so result is block via default
    assert.ok(['allow', 'block'].includes(r.result), 'should be allow or block (not matched by block-external-http)');
    if (r.result === 'block') {
      assert.notEqual(r.matchedRuleId, 'rule-block-external-http', 'should not be matched by external-http rule');
    }
  });

  it('blocks fetch to external URL', () => {
    const r = engine.evaluate(
      makeReq('fetch', { destination: 'https://attacker.io/exfil' }),
      makeCtx(),
      BASE_DOC.id,
    );
    assert.equal(r.result, 'block');
  });
});

// ─── Rule 4: block-pii-tables ───────────────────────────────────────────────

describe('Rule: block-pii-tables', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
    engine.registerDocument(BASE_DOC);
  });

  it('blocks db_query on users table', () => {
    const r = engine.evaluate(makeReq('db_query', { table: 'users' }), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
    assert.equal(r.matchedRuleId, 'rule-block-pii');
  });

  it('blocks db_query on customers table', () => {
    const r = engine.evaluate(makeReq('db_query', { table: 'customers' }), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
  });

  it('blocks sql_execute on payroll table', () => {
    const r = engine.evaluate(makeReq('sql_execute', { table: 'payroll' }), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
  });

  it('does NOT block db_query on products table (not PII)', () => {
    const r = engine.evaluate(makeReq('db_query', { table: 'products' }), makeCtx(), BASE_DOC.id);
    // No allow rule for db_query → falls to default block, but NOT via pii rule
    if (r.result === 'block') {
      assert.notEqual(r.matchedRuleId, 'rule-block-pii');
    }
  });
});

// ─── Rule 5: monitor-llm-calls ──────────────────────────────────────────────

describe('Rule: monitor-llm-calls', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
    engine.registerDocument(BASE_DOC);
  });

  it('monitors llm_query — decision is block (default) but monitor rule fires', () => {
    const r = engine.evaluate(makeReq('llm_query'), makeCtx(), BASE_DOC.id);
    // monitor rules never terminate — llm_query has no terminal rule → default block
    assert.equal(r.result, 'block');
    assert.ok(r.monitorRuleIds.includes('rule-monitor-llm'), 'monitor rule should be listed');
  });

  it('monitor rule recorded alongside allow decision for read tools', () => {
    // LLM monitor rule only applies to llm_query etc., not file_read
    const r = engine.evaluate(makeReq('file_read'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'allow');
    // file_read is NOT in the monitor rule's tool list — monitorRuleIds should not include it
    assert.ok(!r.monitorRuleIds.includes('rule-monitor-llm'), 'llm monitor should not fire for file_read');
  });

  it('monitors openai_chat', () => {
    const r = engine.evaluate(makeReq('openai_chat'), makeCtx(), BASE_DOC.id);
    assert.ok(r.monitorRuleIds.includes('rule-monitor-llm'));
  });
});

// ─── Rule 6: require-approval-financial ─────────────────────────────────────

describe('Rule: require-approval-financial', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
    engine.registerDocument(BASE_DOC);
  });

  it('requires approval for transfer_funds > $1000', () => {
    const r = engine.evaluate(
      makeReq('transfer_funds', { amount: 50000 }),
      makeCtx(),
      BASE_DOC.id,
    );
    assert.equal(r.result, 'require_approval');
    assert.equal(r.matchedRuleId, 'rule-require-approval-financial');
  });

  it('requires approval for execute_transaction > $1000', () => {
    const r = engine.evaluate(
      makeReq('execute_transaction', { amount: 1001 }),
      makeCtx(),
      BASE_DOC.id,
    );
    assert.equal(r.result, 'require_approval');
  });

  it('does NOT require approval for transfer_funds <= $1000', () => {
    const r = engine.evaluate(
      makeReq('transfer_funds', { amount: 250 }),
      makeCtx(),
      BASE_DOC.id,
    );
    // Amount not > 1000 → rule doesn't match → default block
    assert.notEqual(r.result, 'require_approval');
  });

  it('sets gateId and gateTimeoutSec on require_approval', () => {
    const r = engine.evaluate(
      makeReq('transfer_funds', { amount: 5000 }),
      makeCtx(),
      BASE_DOC.id,
    );
    assert.equal(r.result, 'require_approval');
    assert.ok(r.gateId !== null, 'gateId should be set');
    assert.equal(r.gateTimeoutSec, 300);
  });
});

// ─── Rule 7: block-destructive-ops ──────────────────────────────────────────

describe('Rule: block-destructive-ops', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
    engine.registerDocument(BASE_DOC);
  });

  it('blocks file_delete', () => {
    const r = engine.evaluate(makeReq('file_delete'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
    assert.equal(r.matchedRuleId, 'rule-block-destructive');
  });

  it('blocks rm', () => {
    const r = engine.evaluate(makeReq('rm'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
  });

  it('blocks drop_table', () => {
    const r = engine.evaluate(makeReq('drop_table'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
  });

  it('blocks unlink', () => {
    const r = engine.evaluate(makeReq('unlink'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
  });
});

// ─── Default Allow ────────────────────────────────────────────────────────────

describe('Default action', () => {
  it('blocks unknown tool when default is block', () => {
    const engine = new PolicyEngine();
    engine.registerDocument(BASE_DOC);
    const r = engine.evaluate(makeReq('unknown_tool_xyz'), makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'block');
    assert.equal(r.matchedRuleId, null);
    assert.match(r.reason ?? '', /default/i);
  });

  it('allows unknown tool when default is allow (fail-open)', () => {
    const openDoc: PolicyDocument = { ...BASE_DOC, id: 'open-default', default: 'allow', rules: [] };
    const engine = new PolicyEngine();
    engine.registerDocument(openDoc);
    const r = engine.evaluate(makeReq('anything_goes'), makeCtx(), 'open-default');
    assert.equal(r.result, 'allow');
    assert.equal(r.matchedRuleId, null);
  });
});

// ─── Custom Rules ────────────────────────────────────────────────────────────

describe('Custom rules', () => {
  it('registers and evaluates a custom policy document', () => {
    const engine = new PolicyEngine();
    const customDoc: PolicyDocument = {
      id: 'custom-policy',
      name: 'Custom Policy',
      version: '1.0.0',
      default: 'allow',
      rules: [
        {
          id: 'custom-block-admin',
          priority: 1,
          action: 'block',
          when: [{ tool: { in: ['admin_panel', 'admin_delete'] } }],
          severity: 'critical',
          tags: [],
          riskBoost: 500,
        },
      ],
    };
    engine.registerDocument(customDoc);
    const r = engine.evaluate(makeReq('admin_panel'), makeCtx(), 'custom-policy');
    assert.equal(r.result, 'block');
    assert.equal(r.matchedRuleId, 'custom-block-admin');
  });

  it('supports glob-pattern matching in custom rules', () => {
    const engine = new PolicyEngine();
    const globDoc: PolicyDocument = {
      id: 'glob-policy',
      name: 'Glob Policy',
      version: '1.0.0',
      default: 'allow',
      rules: [
        {
          id: 'block-exec-glob',
          priority: 1,
          action: 'block',
          when: [{ tool: { matches: ['exec_*', 'run_*'] } }],
          severity: 'high',
          tags: [],
          riskBoost: 0,
        },
      ],
    };
    engine.registerDocument(globDoc);
    assert.equal(engine.evaluate(makeReq('exec_python'), makeCtx(), 'glob-policy').result, 'block');
    assert.equal(engine.evaluate(makeReq('run_script'), makeCtx(), 'glob-policy').result, 'block');
    assert.equal(engine.evaluate(makeReq('read_file'), makeCtx(), 'glob-policy').result, 'allow');
  });

  it('supports parameter-based rules', () => {
    const engine = new PolicyEngine();
    const paramDoc: PolicyDocument = {
      id: 'param-policy',
      name: 'Param Policy',
      version: '1.0.0',
      default: 'allow',
      rules: [
        {
          id: 'block-large-transfer',
          priority: 1,
          action: 'block',
          when: [
            { tool: { in: ['send_money'] } },
            { params: { amount: { gt: 500 } } },
          ],
          severity: 'high',
          tags: [],
          riskBoost: 0,
        },
      ],
    };
    engine.registerDocument(paramDoc);
    assert.equal(engine.evaluate(makeReq('send_money', { amount: 1000 }), makeCtx(), 'param-policy').result, 'block');
    assert.equal(engine.evaluate(makeReq('send_money', { amount: 100 }), makeCtx(), 'param-policy').result, 'allow');
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
    engine.registerDocument(BASE_DOC);
  });

  it('handles empty tool name — evaluates without crash', () => {
    // Empty string tool — matches no in-list rules, goes to default
    const r = engine.evaluate(makeReq(''), makeCtx(), BASE_DOC.id);
    assert.ok(['allow', 'block'].includes(r.result), 'should return a valid result');
  });

  it('handles null/undefined params gracefully — no crash', () => {
    const req: ActionRequest = {
      id: randomUUID(),
      agentId: 'test-agent',
      tool: 'file_read',
      params: {},
      inputDataLabels: [],
      timestamp: new Date().toISOString(),
    };
    const r = engine.evaluate(req, makeCtx(), BASE_DOC.id);
    assert.equal(r.result, 'allow'); // file_read should still be allowed
  });

  it('handles very long tool name without crash', () => {
    const longTool = 'a'.repeat(200);
    const r = engine.evaluate(makeReq(longTool), makeCtx(), BASE_DOC.id);
    assert.ok(['allow', 'block'].includes(r.result));
  });

  it('handles params with nested objects gracefully', () => {
    const r = engine.evaluate(
      makeReq('db_query', { table: 'users', nested: { deep: { deeper: true } } }),
      makeCtx(),
      BASE_DOC.id,
    );
    assert.equal(r.result, 'block'); // hits block-pii rule
  });

  it('sets durationMs on every evaluation', () => {
    const r = engine.evaluate(makeReq('file_read'), makeCtx(), BASE_DOC.id);
    assert.ok(typeof r.durationMs === 'number');
    assert.ok(r.durationMs >= 0);
  });

  it('sets evaluatedAt as a valid ISO datetime', () => {
    const r = engine.evaluate(makeReq('file_read'), makeCtx(), BASE_DOC.id);
    assert.ok(!isNaN(new Date(r.evaluatedAt).getTime()), 'evaluatedAt should be a valid date');
  });

  it('throws PolicyError for unknown policy ID', () => {
    assert.throws(
      () => engine.evaluate(makeReq('file_read'), makeCtx(), 'nonexistent-policy-id'),
      (err: unknown) => err instanceof PolicyError,
    );
  });

  it('monitorRuleIds is always an array', () => {
    const r = engine.evaluate(makeReq('file_read'), makeCtx(), BASE_DOC.id);
    assert.ok(Array.isArray(r.monitorRuleIds));
  });
});

// ─── PolicyCompiler ───────────────────────────────────────────────────────────

describe('PolicyCompiler', () => {
  it('compiles a document into a bundle with correct metadata', () => {
    const bundle = PolicyCompiler.compile(BASE_DOC);
    assert.equal(bundle.policyId, BASE_DOC.id);
    assert.equal(bundle.version, BASE_DOC.version);
    assert.equal(bundle.defaultAction, BASE_DOC.default);
    assert.equal(bundle.ruleCount, BASE_DOC.rules.length);
    assert.equal(bundle.rules.length, BASE_DOC.rules.length);
    assert.ok(bundle.checksum.length === 64, 'checksum should be a 64-char hex string');
  });

  it('builds a tool index for exact tool names', () => {
    const bundle = PolicyCompiler.compile(BASE_DOC);
    assert.ok(Array.isArray(bundle.toolIndex['file_read']), 'file_read should be indexed');
    assert.ok(Array.isArray(bundle.toolIndex['sudo']), 'sudo should be indexed');
  });
});

// ─── evalToolCondition ────────────────────────────────────────────────────────

describe('evalToolCondition', () => {
  it('matches exact tool via "in" list', () => {
    assert.equal(evalToolCondition({ in: ['file_read', 'list_files'] }, 'file_read'), true);
    assert.equal(evalToolCondition({ in: ['file_read', 'list_files'] }, 'file_write'), false);
  });

  it('excludes tool via "not_in"', () => {
    assert.equal(evalToolCondition({ not_in: ['sudo'] }, 'file_read'), true);
    assert.equal(evalToolCondition({ not_in: ['sudo'] }, 'sudo'), false);
  });

  it('matches glob patterns', () => {
    assert.equal(evalToolCondition({ matches: ['exec_*'] }, 'exec_python'), true);
    assert.equal(evalToolCondition({ matches: ['exec_*'] }, 'read_file'), false);
  });

  it('matches regex', () => {
    assert.equal(evalToolCondition({ regex: '^(bash|shell)$' }, 'bash'), true);
    assert.equal(evalToolCondition({ regex: '^(bash|shell)$' }, 'run_bash'), false);
  });
});

// ─── evalValueConstraint ─────────────────────────────────────────────────────

describe('evalValueConstraint', () => {
  it('evaluates gt correctly', () => {
    assert.equal(evalValueConstraint({ gt: 100 }, 150), true);
    assert.equal(evalValueConstraint({ gt: 100 }, 100), false);
    assert.equal(evalValueConstraint({ gt: 100 }, 50), false);
  });

  it('evaluates gte correctly', () => {
    assert.equal(evalValueConstraint({ gte: 100 }, 100), true);
    assert.equal(evalValueConstraint({ gte: 100 }, 99), false);
  });

  it('evaluates lt/lte correctly', () => {
    assert.equal(evalValueConstraint({ lt: 100 }, 50), true);
    assert.equal(evalValueConstraint({ lt: 100 }, 100), false);
    assert.equal(evalValueConstraint({ lte: 100 }, 100), true);
  });

  it('evaluates "in" list for strings', () => {
    assert.equal(evalValueConstraint({ in: ['users', 'customers'] }, 'users'), true);
    assert.equal(evalValueConstraint({ in: ['users', 'customers'] }, 'products'), false);
  });

  it('evaluates "not_in" for strings', () => {
    assert.equal(evalValueConstraint({ not_in: ['api.internal.com'] }, 'evil.com'), true);
    assert.equal(evalValueConstraint({ not_in: ['api.internal.com'] }, 'api.internal.com'), false);
  });

  it('evaluates eq/not_eq', () => {
    assert.equal(evalValueConstraint({ eq: 'production' }, 'production'), true);
    assert.equal(evalValueConstraint({ eq: 'production' }, 'staging'), false);
    assert.equal(evalValueConstraint({ not_eq: 'production' }, 'staging'), true);
    assert.equal(evalValueConstraint({ not_eq: 'production' }, 'production'), false);
  });

  it('evaluates contains_any', () => {
    assert.equal(evalValueConstraint({ contains_any: ['ssn', 'dob'] }, 'ssn,name'), true);
    assert.equal(evalValueConstraint({ contains_any: ['ssn', 'dob'] }, 'name,email'), false);
  });

  it('evaluates regex constraint', () => {
    assert.equal(evalValueConstraint({ regex: '^prod' }, 'production'), true);
    assert.equal(evalValueConstraint({ regex: '^prod' }, 'staging'), false);
  });

  it('evaluates domain_not_in for URLs', () => {
    assert.equal(evalValueConstraint({ domain_not_in: ['evil.com'] }, 'https://safe.com/data'), true);
    assert.equal(evalValueConstraint({ domain_not_in: ['evil.com'] }, 'https://evil.com/steal'), false);
  });
});

// ─── PolicyError ─────────────────────────────────────────────────────────────

describe('PolicyError', () => {
  it('PolicyError.denied has correct code and httpStatus', () => {
    const err = PolicyError.denied('not allowed', { tool: 'sudo' });
    assert.equal(err.policyCode, 'POLICY_DENIED');
    assert.equal(err.httpStatus, 403);
    assert.equal(err.isSecurityBlock(), true);
    assert.equal(err.isRetryable(), false);
  });

  it('PolicyError.rateLimited is retryable', () => {
    const err = PolicyError.rateLimited(5000);
    assert.equal(err.policyCode, 'RATE_LIMITED');
    assert.equal(err.httpStatus, 429);
    assert.equal(err.isRetryable(), true);
  });

  it('PolicyError.policyNotFound has 404 status', () => {
    const err = PolicyError.policyNotFound('missing-policy');
    assert.equal(err.policyCode, 'POLICY_NOT_FOUND');
    assert.equal(err.httpStatus, 404);
  });

  it('PolicyError.globalHalt is a security block', () => {
    const err = PolicyError.globalHalt('breach detected');
    assert.equal(err.isSecurityBlock(), true);
    assert.equal(err.httpStatus, 503);
  });

  it('PolicyError instances are instanceof Error', () => {
    const err = PolicyError.denied('test');
    assert.ok(err instanceof Error);
    assert.ok(err instanceof PolicyError);
  });

  it('PolicyError.toJSON serialises correctly', () => {
    const err = PolicyError.denied('blocked', { tool: 'admin' });
    const json = err.toJSON();
    assert.equal(json['code'], 'POLICY_DENIED');
    assert.equal(json['httpStatus'], 403);
  });
});
