/**
 * AgentGuard — Batch Evaluate Tests
 *
 * Tests for POST /api/v1/evaluate/batch endpoint.
 *
 * Run: npx tsx --test tests/batch-evaluate.test.ts
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// ── Server lifecycle ──────────────────────────────────────────────────────────

const BASE = 'http://localhost:3002'; // use 3002 to not conflict with other test suites
let serverProcess: ChildProcess | null = null;
let apiKey = '';

async function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, string> }> {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  let responseBody: Record<string, unknown> = {};
  try {
    responseBody = (await res.json()) as Record<string, unknown>;
  } catch {
    // non-JSON
  }
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });
  return { status: res.status, body: responseBody, headers: responseHeaders };
}

async function waitForServer(retries = 25, delayMs = 300): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(delayMs);
  }
  throw new Error('Batch-evaluate test server did not start in time');
}

before(async () => {
  serverProcess = spawn('npx', ['tsx', 'api/server.ts'], {
    cwd: '/home/vector/.openclaw/workspace/agentguard-project',
    env: {
      ...process.env,
      PORT: '3002',
      NODE_ENV: 'test',
      ADMIN_KEY: 'batch-test-admin-key',
      AG_DB_PATH: ':memory:',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitForServer();

  // Sign up to get an API key for authenticated tests
  const signupRes = await request('POST', '/api/v1/signup', {
    name: 'Batch Test Tenant',
    email: `batch-test-${Date.now()}@agentguard-test.local`,
  });
  apiKey = signupRes.body['apiKey'] as string ?? '';
  assert.ok(apiKey, 'Failed to get API key from signup');
});

after(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await sleep(300);
  }
});

// ── Helper — all batch posts use the API key ───────────────────────────────────

async function batchPost(
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, string> }> {
  return request('POST', '/api/v1/evaluate/batch', body, { 'X-API-Key': apiKey });
}

// ── Happy path ────────────────────────────────────────────────────────────────

describe('POST /api/v1/evaluate/batch — happy path', () => {
  it('TC-B01: single call returns single result with index 0', async () => {
    const res = await batchPost({
      calls: [{ tool: 'file_read', params: { path: '/tmp/test.txt' } }],
    });
    assert.equal(res.status, 200);
    const results = res.body['results'] as Record<string, unknown>[];
    assert.equal(results.length, 1);
    assert.equal(results[0]!['index'], 0);
    assert.equal(results[0]!['tool'], 'file_read');
    assert.match(res.body['batchId'] as string, /^[0-9a-f-]{36}$/);
    const summary = res.body['summary'] as Record<string, number>;
    assert.equal(summary['total'], 1);
  });

  it('TC-B02: 3 calls return 3 results in correct order', async () => {
    const res = await batchPost({
      calls: [
        { tool: 'file_read', params: {} },
        { tool: 'send_email', params: {} },
        { tool: 'db_read_public', params: {} },
      ],
    });
    assert.equal(res.status, 200);
    const results = res.body['results'] as Record<string, unknown>[];
    assert.equal(results.length, 3);
    assert.equal(results[0]!['index'], 0);
    assert.equal(results[1]!['index'], 1);
    assert.equal(results[2]!['index'], 2);
    assert.equal(results[0]!['tool'], 'file_read');
    assert.equal(results[1]!['tool'], 'send_email');
    assert.equal(results[2]!['tool'], 'db_read_public');
  });

  it('TC-B03: blocked call does not fail other calls in batch', async () => {
    const res = await batchPost({
      calls: [
        { tool: 'file_read', params: {} },
        { tool: 'sudo', params: {} },
        { tool: 'file_read', params: {} },
      ],
    });
    assert.equal(res.status, 200);
    const results = res.body['results'] as Record<string, unknown>[];
    assert.equal(results.length, 3);
    // All three should have a valid decision — batch never partially fails
    for (const r of results) {
      assert.ok(
        ['allow', 'block', 'monitor', 'require_approval'].includes(r['decision'] as string),
        `Unexpected decision: ${r['decision']}`,
      );
    }
  });

  it('TC-B04: summary counts are accurate across results', async () => {
    const res = await batchPost({
      calls: [
        { tool: 'file_read', params: {} },
        { tool: 'sudo', params: {} },
        { tool: 'file_read', params: {} },
      ],
    });
    assert.equal(res.status, 200);
    const summary = res.body['summary'] as Record<string, number>;
    assert.equal(summary['total'], 3);
    // sum of all decision types should equal total
    const decisionSum =
      (summary['allowed'] ?? 0) +
      (summary['blocked'] ?? 0) +
      (summary['monitored'] ?? 0) +
      (summary['requireApproval'] ?? 0);
    assert.equal(decisionSum, 3);
  });

  it('TC-B05: batchDurationMs is present and reasonable', async () => {
    const res = await batchPost({
      calls: [{ tool: 'file_read', params: {} }],
    });
    assert.equal(res.status, 200);
    const ms = res.body['batchDurationMs'] as number;
    assert.ok(ms >= 0, 'batchDurationMs should be non-negative');
    assert.ok(ms < 10000, 'batchDurationMs should be under 10 seconds');
  });

  it('TC-B06: durationMs present in each result', async () => {
    const res = await batchPost({
      calls: [
        { tool: 'file_read', params: {} },
        { tool: 'sudo', params: {} },
      ],
    });
    assert.equal(res.status, 200);
    const results = res.body['results'] as Record<string, unknown>[];
    for (const r of results) {
      assert.ok(typeof r['durationMs'] === 'number', 'durationMs should be a number');
      assert.ok((r['durationMs'] as number) >= 0, 'durationMs should be non-negative');
    }
  });

  it('TC-B07: 50 calls (max) returns 50 results', async () => {
    const calls = Array.from({ length: 50 }, (_, i) => ({
      tool: `tool_${i}`,
      params: {},
    }));
    const res = await batchPost({ calls });
    assert.equal(res.status, 200);
    const results = res.body['results'] as Record<string, unknown>[];
    assert.equal(results.length, 50);
  });

  it('TC-B08: block decisions include reason and docs fields', async () => {
    const res = await batchPost({
      calls: [{ tool: 'sudo', params: {} }],
    });
    assert.equal(res.status, 200);
    const results = res.body['results'] as Record<string, unknown>[];
    const blocked = results.find((r) => r['decision'] === 'block');
    if (blocked) {
      assert.ok(
        typeof blocked['reason'] === 'string' && blocked['reason'].length > 0,
        'blocked result should have a reason string',
      );
      assert.ok(
        typeof blocked['docs'] === 'string' &&
          (blocked['docs'] as string).startsWith('https://'),
        'blocked result should have a docs URL',
      );
    }
  });

  it('TC-B09: batchId is a UUID v4', async () => {
    const res = await batchPost({
      calls: [{ tool: 'file_read', params: {} }],
    });
    assert.equal(res.status, 200);
    assert.match(
      res.body['batchId'] as string,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('TC-B10: sessionId in request groups all results under same batchId', async () => {
    const sessionId = `test-session-${Date.now()}`;
    const res = await batchPost({
      sessionId,
      calls: [
        { tool: 'file_read', params: {} },
        { tool: 'sudo', params: {} },
      ],
    });
    assert.equal(res.status, 200);
    assert.ok(res.body['batchId'], 'batchId should be present');
    const results = res.body['results'] as Record<string, unknown>[];
    assert.equal(results.length, 2);
  });
});

// ── Validation errors ─────────────────────────────────────────────────────────

describe('POST /api/v1/evaluate/batch — validation errors', () => {
  it('TC-B11: empty calls array returns 400 validation_error', async () => {
    const res = await batchPost({ calls: [] });
    assert.equal(res.status, 400);
    assert.equal(res.body['error'], 'validation_error');
    assert.ok(
      (res.body['field'] as string).includes('calls'),
      `expected field to include 'calls', got: ${res.body['field']}`,
    );
  });

  it('TC-B12: 51 calls returns 400 validation_error', async () => {
    const calls = Array.from({ length: 51 }, () => ({ tool: 'file_read', params: {} }));
    const res = await batchPost({ calls });
    assert.equal(res.status, 400);
    assert.equal(res.body['error'], 'validation_error');
  });

  it('TC-B13: missing calls field returns 400 with field=calls', async () => {
    const res = await batchPost({ agentId: 'test-agent' });
    assert.equal(res.status, 400);
    assert.equal(res.body['error'], 'validation_error');
    assert.ok(
      (res.body['field'] as string).includes('calls'),
      `expected field to include 'calls', got: ${res.body['field']}`,
    );
  });

  it('TC-B14: invalid tool name with special chars returns 400', async () => {
    const res = await batchPost({
      calls: [{ tool: 'tool<script>alert(1)</script>', params: {} }],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body['error'], 'validation_error');
  });

  it('TC-B15: calls is not an array returns 400', async () => {
    const res = await batchPost({ calls: 'not-an-array' });
    assert.equal(res.status, 400);
    assert.equal(res.body['error'], 'validation_error');
  });
});

// ── Response structure ────────────────────────────────────────────────────────

describe('POST /api/v1/evaluate/batch — response structure', () => {
  it('TC-B16: response always has batchId, results, summary, batchDurationMs', async () => {
    const res = await batchPost({
      calls: [{ tool: 'file_read', params: {} }],
    });
    assert.equal(res.status, 200);
    assert.ok('batchId' in res.body, 'missing batchId');
    assert.ok('results' in res.body, 'missing results');
    assert.ok('summary' in res.body, 'missing summary');
    assert.ok('batchDurationMs' in res.body, 'missing batchDurationMs');
  });

  it('TC-B17: summary has total, allowed, monitored, blocked, requireApproval', async () => {
    const res = await batchPost({
      calls: [{ tool: 'file_read', params: {} }],
    });
    assert.equal(res.status, 200);
    const summary = res.body['summary'] as Record<string, unknown>;
    assert.ok('total' in summary, 'missing summary.total');
    assert.ok('allowed' in summary, 'missing summary.allowed');
    assert.ok('monitored' in summary, 'missing summary.monitored');
    assert.ok('blocked' in summary, 'missing summary.blocked');
    assert.ok('requireApproval' in summary, 'missing summary.requireApproval');
  });

  it('TC-B18: each result has index, tool, decision, riskScore, durationMs', async () => {
    const res = await batchPost({
      calls: [
        { tool: 'file_read', params: {} },
        { tool: 'sudo', params: {} },
      ],
    });
    assert.equal(res.status, 200);
    const results = res.body['results'] as Record<string, unknown>[];
    for (const r of results) {
      assert.ok('index' in r, 'missing result.index');
      assert.ok('tool' in r, 'missing result.tool');
      assert.ok('decision' in r, 'missing result.decision');
      assert.ok('riskScore' in r, 'missing result.riskScore');
      assert.ok('durationMs' in r, 'missing result.durationMs');
    }
  });
});

// ── Allow vs block enrichment ─────────────────────────────────────────────────

describe('POST /api/v1/evaluate/batch — allow/block enrichment', () => {
  it('TC-B19: allow decisions do NOT have suggestion/docs/alternatives', async () => {
    const res = await batchPost({
      calls: [{ tool: 'file_read', params: {} }],
    });
    assert.equal(res.status, 200);
    const results = res.body['results'] as Record<string, unknown>[];
    const allowed = results.filter((r) => r['decision'] === 'allow');
    for (const r of allowed) {
      assert.ok(!('suggestion' in r), 'allow result should not have suggestion');
      assert.ok(!('docs' in r), 'allow result should not have docs');
      assert.ok(!('alternatives' in r), 'allow result should not have alternatives');
    }
  });

  it('TC-B20: tool name is echoed back in each result', async () => {
    const res = await batchPost({
      calls: [
        { tool: 'file_read', params: {} },
        { tool: 'sudo', params: {} },
      ],
    });
    assert.equal(res.status, 200);
    const results = res.body['results'] as Record<string, unknown>[];
    assert.equal(results[0]!['tool'], 'file_read');
    assert.equal(results[1]!['tool'], 'sudo');
  });
});

// ── Auth tests ────────────────────────────────────────────────────────────────

describe('POST /api/v1/evaluate/batch — auth', () => {
  it('TC-B21: returns 401 without API key', async () => {
    const res = await request('POST', '/api/v1/evaluate/batch', {
      calls: [{ tool: 'file_read', params: {} }],
    });
    assert.equal(res.status, 401);
    assert.equal(res.body['error'], 'unauthorized');
  });
});
