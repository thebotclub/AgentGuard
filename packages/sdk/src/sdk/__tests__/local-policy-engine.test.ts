/**
 * LocalPolicyEngine & AgentGuard local eval — unit tests
 *
 * Covers:
 *   - Basic allow/block/monitor/require_approval decisions
 *   - Glob / wildcard tool matching
 *   - Parameter condition matching
 *   - Default action when no rule matches
 *   - Error when no policy loaded
 *   - AgentGuard constructor with localEval: true
 *   - Falls back to HTTP when no policy cached
 *   - Uses local engine when policy is cached
 *   - syncPolicies() swallows errors (never crashes)
 *   - Telemetry batching accumulates & flushes
 *   - durationMs is set and < 5ms for local eval
 *   - policyVersion / policyChecksum accessors
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LocalPolicyEngine } from '../local-policy-engine.js';
import { AgentGuard } from '../client.js';
import { PolicyCompiler } from '../../core/policy-engine.js';
import type { PolicyDocument } from '../../core/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_DOC: PolicyDocument = {
  id: 'local-test-policy',
  name: 'Local Test Policy',
  version: '2.0.0',
  default: 'block',
  rules: [
    {
      id: 'allow-read',
      priority: 50,
      action: 'allow',
      when: [{ tool: { in: ['file_read', 'list_files', 'get_config'] } }],
      severity: 'low',
      tags: [],
      riskBoost: 0,
    },
    {
      id: 'block-exec',
      priority: 10,
      action: 'block',
      when: [{ tool: { matches: ['exec_*', 'run_*', 'bash', 'shell'] } }],
      severity: 'critical',
      tags: [],
      riskBoost: 300,
    },
    {
      id: 'block-pii',
      priority: 20,
      action: 'block',
      when: [
        { tool: { in: ['db_query'] } },
        { params: { table: { in: ['users', 'customers'] } } },
      ],
      severity: 'high',
      tags: [],
      riskBoost: 150,
    },
    {
      id: 'monitor-llm',
      priority: 80,
      action: 'monitor',
      when: [{ tool: { in: ['llm_query', 'openai_chat'] } }],
      severity: 'low',
      tags: [],
      riskBoost: 5,
    },
    {
      id: 'hitl-transfer',
      priority: 15,
      action: 'require_approval',
      approvers: ['finance'],
      timeoutSec: 300,
      when: [
        { tool: { in: ['transfer_funds'] } },
        { params: { amount: { gt: 1000 } } },
      ],
      severity: 'high',
      tags: [],
      riskBoost: 100,
    },
  ],
};

function compiledBundleJson(): string {
  return JSON.stringify(PolicyCompiler.compile(TEST_DOC));
}

// ─── LocalPolicyEngine ────────────────────────────────────────────────────────

describe('LocalPolicyEngine', () => {
  let engine: LocalPolicyEngine;

  beforeEach(() => {
    engine = new LocalPolicyEngine();
    engine.loadPolicy(compiledBundleJson());
  });

  it('reports isReady() true after loading a policy', () => {
    expect(engine.isReady()).toBe(true);
  });

  it('reports isReady() false before loading a policy', () => {
    const fresh = new LocalPolicyEngine();
    expect(fresh.isReady()).toBe(false);
  });

  it('throws when evaluating without a loaded policy', () => {
    const fresh = new LocalPolicyEngine();
    expect(() => fresh.evaluate('file_read')).toThrow(/no policy loaded/i);
  });

  it('exposes policyVersion after loading', () => {
    expect(engine.policyVersion()).toBe('2.0.0');
  });

  it('exposes policyChecksum after loading', () => {
    expect(engine.policyChecksum()).toBeTruthy();
    expect(engine.policyChecksum()).toHaveLength(64);
  });

  // ── Allow ──────────────────────────────────────────────────────────────────

  it('allows file_read (exact match in "in" list)', () => {
    const r = engine.evaluate('file_read');
    expect(r.result).toBe('allow');
    expect(r.matchedRuleId).toBe('allow-read');
  });

  it('allows list_files', () => {
    expect(engine.evaluate('list_files').result).toBe('allow');
  });

  // ── Block ─────────────────────────────────────────────────────────────────

  it('blocks exec_python via glob "exec_*"', () => {
    const r = engine.evaluate('exec_python');
    expect(r.result).toBe('block');
    expect(r.matchedRuleId).toBe('block-exec');
  });

  it('blocks bash (exact glob literal)', () => {
    expect(engine.evaluate('bash').result).toBe('block');
  });

  it('blocks run_script via glob "run_*"', () => {
    expect(engine.evaluate('run_script').result).toBe('block');
  });

  // ── Param conditions ───────────────────────────────────────────────────────

  it('blocks db_query on "users" table (param condition)', () => {
    const r = engine.evaluate('db_query', { table: 'users' });
    expect(r.result).toBe('block');
    expect(r.matchedRuleId).toBe('block-pii');
  });

  it('does NOT apply block-pii when table is absent (absent-param security fix)', () => {
    const r = engine.evaluate('db_query', {});
    // No allow rule for db_query → default block, but NOT via block-pii
    if (r.result === 'block') {
      expect(r.matchedRuleId).not.toBe('block-pii');
    }
  });

  it('does NOT apply block-pii for non-PII tables', () => {
    const r = engine.evaluate('db_query', { table: 'products' });
    if (r.result === 'block') {
      expect(r.matchedRuleId).not.toBe('block-pii');
    }
  });

  // ── require_approval ───────────────────────────────────────────────────────

  it('returns require_approval for transfer_funds > 1000', () => {
    const r = engine.evaluate('transfer_funds', { amount: 5000 });
    expect(r.result).toBe('require_approval');
    expect(r.matchedRuleId).toBe('hitl-transfer');
  });

  it('does NOT require approval for transfer_funds <= 1000', () => {
    const r = engine.evaluate('transfer_funds', { amount: 500 });
    // no terminal rule → default block
    expect(r.result).not.toBe('require_approval');
  });

  // ── Monitor (non-terminal) ─────────────────────────────────────────────────

  it('applies default action (block) for llm_query even though monitor rule fires', () => {
    // monitor never terminates — llm_query has no terminal rule → default block
    const r = engine.evaluate('llm_query');
    expect(r.result).toBe('block'); // default
  });

  // ── Default action ─────────────────────────────────────────────────────────

  it('applies default block for unknown tool', () => {
    const r = engine.evaluate('completely_unknown_tool_xyz');
    expect(r.result).toBe('block');
    expect(r.matchedRuleId).toBeUndefined();
    expect(r.reason).toMatch(/default/i);
  });

  it('applies default allow when policy default is allow', () => {
    const openDoc: PolicyDocument = {
      ...TEST_DOC,
      id: 'open-policy',
      default: 'allow',
      rules: [],
    };
    const openEngine = new LocalPolicyEngine();
    openEngine.loadBundle(PolicyCompiler.compile(openDoc));
    const r = openEngine.evaluate('any_tool');
    expect(r.result).toBe('allow');
  });

  // ── Performance ────────────────────────────────────────────────────────────

  it('evaluates in <5ms (no I/O)', () => {
    // Warm-up
    engine.evaluate('file_read');
    // Measure
    const r = engine.evaluate('file_read');
    expect(r.durationMs).toBeLessThan(5);
  });

  it('returns durationMs on every call', () => {
    const r = engine.evaluate('exec_python');
    expect(typeof r.durationMs).toBe('number');
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ── Result shape ───────────────────────────────────────────────────────────

  it('returns a reason string on every result', () => {
    expect(engine.evaluate('file_read').reason).toBeTruthy();
    expect(engine.evaluate('exec_python').reason).toBeTruthy();
    expect(engine.evaluate('unknown_tool').reason).toBeTruthy();
  });

  it('returns a numeric riskScore between 0 and 1000', () => {
    const r = engine.evaluate('exec_python');
    expect(r.riskScore).toBeGreaterThanOrEqual(0);
    expect(r.riskScore).toBeLessThanOrEqual(1000);
  });

  // ── loadBundle (direct object) ─────────────────────────────────────────────

  it('loadBundle() works as an alternative to loadPolicy()', () => {
    const fresh = new LocalPolicyEngine();
    fresh.loadBundle(PolicyCompiler.compile(TEST_DOC));
    expect(fresh.isReady()).toBe(true);
    expect(fresh.evaluate('file_read').result).toBe('allow');
  });

  // ── Constraint coverage ────────────────────────────────────────────────────

  it('supports "gt" numeric constraint', () => {
    const doc: PolicyDocument = {
      id: 'num-test',
      name: 'Numeric Test',
      version: '1.0.0',
      default: 'allow',
      rules: [{
        id: 'block-large',
        priority: 10,
        action: 'block',
        when: [
          { tool: { in: ['pay'] } },
          { params: { amount: { gt: 100 } } },
        ],
        severity: 'high',
        tags: [],
        riskBoost: 0,
      }],
    };
    const e = new LocalPolicyEngine();
    e.loadBundle(PolicyCompiler.compile(doc));
    expect(e.evaluate('pay', { amount: 200 }).result).toBe('block');
    expect(e.evaluate('pay', { amount: 50 }).result).toBe('allow');
    expect(e.evaluate('pay', { amount: 100 }).result).toBe('allow'); // gt not gte
  });

  it('supports "contains_any" string constraint', () => {
    const doc: PolicyDocument = {
      id: 'contains-test',
      name: 'Contains Test',
      version: '1.0.0',
      default: 'allow',
      rules: [{
        id: 'block-pii-fields',
        priority: 10,
        action: 'block',
        when: [
          { tool: { in: ['export'] } },
          { params: { fields: { contains_any: ['ssn', 'dob'] } } },
        ],
        severity: 'high',
        tags: [],
        riskBoost: 0,
      }],
    };
    const e = new LocalPolicyEngine();
    e.loadBundle(PolicyCompiler.compile(doc));
    expect(e.evaluate('export', { fields: 'ssn,name,email' }).result).toBe('block');
    expect(e.evaluate('export', { fields: 'name,email' }).result).toBe('allow');
  });

  it('supports regex tool condition', () => {
    const doc: PolicyDocument = {
      id: 'regex-test',
      name: 'Regex Test',
      version: '1.0.0',
      default: 'allow',
      rules: [{
        id: 'block-shells',
        priority: 10,
        action: 'block',
        when: [{ tool: { regex: '^(bash|sh|zsh)$' } }],
        severity: 'critical',
        tags: [],
        riskBoost: 0,
      }],
    };
    const e = new LocalPolicyEngine();
    e.loadBundle(PolicyCompiler.compile(doc));
    expect(e.evaluate('bash').result).toBe('block');
    expect(e.evaluate('sh').result).toBe('block');
    expect(e.evaluate('python').result).toBe('allow');
  });
});

// ─── AgentGuard local eval integration ───────────────────────────────────────

describe('AgentGuard localEval mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('evaluate() falls back to HTTP when no policy is cached yet', async () => {
    // When policy not synced, we should hit HTTP
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/policy/bundle')) {
        // Simulate 404 — policy bundle not available
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      if (urlStr.includes('/api/v1/evaluate')) {
        return new Response(JSON.stringify({
          result: 'allow',
          riskScore: 0,
          reason: 'http-fallback',
          durationMs: 50,
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const client = new AgentGuard({ apiKey: 'test-key', localEval: true });
    // Don't call syncPolicies() — engine not ready

    const result = await client.evaluate({ tool: 'file_read' });
    expect(result.result).toBe('allow');
    expect(result.reason).toBe('http-fallback');

    // HTTP evaluate endpoint should have been called
    const evaluateCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/api/v1/evaluate'),
    );
    expect(evaluateCalls.length).toBeGreaterThan(0);

    client.destroy();
  });

  it('evaluate() uses local engine after syncPolicies()', async () => {
    const bundle = PolicyCompiler.compile(TEST_DOC);

    const _fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/policy/bundle')) {
        return new Response(JSON.stringify(bundle), { status: 200 });
      }
      // HTTP evaluate should NOT be called after sync
      if (urlStr.includes('/api/v1/evaluate')) {
        throw new Error('HTTP evaluate should not be called when policy is cached');
      }
      return new Response('{}', { status: 200 });
    });

    const client = new AgentGuard({
      apiKey: 'test-key',
      localEval: true,
      policySyncIntervalMs: 999_999, // disable auto-sync after initial
    });

    // Manually sync to load the policy
    await client.syncPolicies();

    const result = await client.evaluate({ tool: 'file_read' });
    expect(result.result).toBe('allow');
    expect(result.matchedRuleId).toBe('allow-read');
    expect(result.durationMs).toBeLessThan(5); // local, not HTTP

    client.destroy();
  });

  it('syncPolicies() swallows network errors (never crashes)', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network failure'));

    const client = new AgentGuard({ apiKey: 'test-key', localEval: true });

    // Should not throw
    await expect(client.syncPolicies()).resolves.toBeUndefined();

    client.destroy();
  });

  it('syncPolicies() swallows non-OK HTTP responses', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    );

    const client = new AgentGuard({ apiKey: 'bad-key', localEval: true });
    await expect(client.syncPolicies()).resolves.toBeUndefined();

    client.destroy();
  });

  it('localEval: false uses HTTP for every evaluate()', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/v1/evaluate')) {
        return new Response(JSON.stringify({
          result: 'block',
          riskScore: 50,
          reason: 'blocked by rule',
          durationMs: 200,
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const client = new AgentGuard({ apiKey: 'test-key', localEval: false });
    const result = await client.evaluate({ tool: 'file_read' });
    expect(result.result).toBe('block');

    const evaluateCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/api/v1/evaluate'),
    );
    expect(evaluateCalls.length).toBe(1);
  });

  it('telemetry is batched and flushed on destroy()', async () => {
    const bundle = PolicyCompiler.compile(TEST_DOC);
    const auditEvents: unknown[] = [];

    vi.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/policy/bundle')) {
        return new Response(JSON.stringify(bundle), { status: 200 });
      }
      if (urlStr.includes('/api/v1/audit')) {
        // Capture the batch
        const body = JSON.parse((opts as RequestInit).body as string) as { events: unknown[] };
        auditEvents.push(...body.events);
      }
      return new Response('{}', { status: 200 });
    });

    const client = new AgentGuard({
      apiKey: 'test-key',
      localEval: true,
      policySyncIntervalMs: 999_999,
    });

    await client.syncPolicies();
    await client.evaluate({ tool: 'file_read' });
    await client.evaluate({ tool: 'exec_python' });

    // Destroy triggers final flush
    client.destroy();

    // Give the fire-and-forget fetch a tick to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(auditEvents.length).toBeGreaterThanOrEqual(2);
    const tools = (auditEvents as Array<{ tool: string }>).map((e) => e.tool);
    expect(tools).toContain('file_read');
    expect(tools).toContain('exec_python');
  });

  it('audit batch auto-flushes at 100 events', async () => {
    const bundle = PolicyCompiler.compile(TEST_DOC);
    let auditFlushCount = 0;

    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/policy/bundle')) {
        return new Response(JSON.stringify(bundle), { status: 200 });
      }
      if (urlStr.includes('/api/v1/audit')) {
        auditFlushCount++;
      }
      return new Response('{}', { status: 200 });
    });

    const client = new AgentGuard({
      apiKey: 'test-key',
      localEval: true,
      policySyncIntervalMs: 999_999,
    });
    await client.syncPolicies();

    // Queue 100 events — should trigger an auto-flush
    for (let i = 0; i < 100; i++) {
      await client.evaluate({ tool: 'file_read' });
    }

    // Give the fire-and-forget a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(auditFlushCount).toBeGreaterThanOrEqual(1);

    client.destroy();
  });
});
