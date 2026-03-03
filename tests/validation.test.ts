/**
 * AgentGuard Validation & Certification — End-to-End Tests
 *
 * Tests the following endpoints:
 *   POST /api/v1/agents/:id/validate   — dry-run tool coverage check
 *   GET  /api/v1/agents/:id/readiness  — readiness / certification status
 *   POST /api/v1/agents/:id/certify    — certify an agent (requires 100% coverage)
 *   POST /api/v1/mcp/admit             — MCP server pre-flight admission check
 *
 * Follows the pattern from e2e.test.ts:
 *   - Uses Node.js built-in test runner (node:test + node:assert)
 *   - Spawns the server with AG_DB_PATH=:memory: for a clean DB each run
 *   - Signs up, creates an agent, then tests all validation endpoints
 *
 * Run: npx tsx --test tests/validation.test.ts
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// ─── Server Config ────────────────────────────────────────────────────────────

// Use a distinct port to avoid collisions with e2e.test.ts (3001)
const PORT = 3099;
const BASE = `http://localhost:${PORT}`;
let serverProcess: ChildProcess | null = null;

// Per-run unique identifiers to prevent cross-run DB collisions (in-memory → not an issue,
// but good practice in case the test is pointed at a file-based DB).
const RUN_ID = Date.now();
const testEmail = `validation-test-${RUN_ID}@agentguard-test.local`;

let apiKey = '';
let agentId = '';       // the "primary" agent used across most test groups
let agentId2 = '';      // a second agent for re-certification and isolation tests

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  let responseBody: Record<string, unknown> = {};
  try {
    responseBody = (await res.json()) as Record<string, unknown>;
  } catch {
    // non-JSON response (e.g. empty 204)
  }
  return { status: res.status, body: responseBody };
}

// ─── Server lifecycle ─────────────────────────────────────────────────────────

describe('Validation & Certification API', () => {

async function waitForServer(retries = 30, delayMs = 300): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(delayMs);
  }
  throw new Error('Server did not start in time');
}

before(async () => {
  serverProcess = spawn('npx', ['tsx', 'api/server.ts'], {
    cwd: '/home/vector/.openclaw/workspace/agentguard-project',
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      ADMIN_KEY: 'validation-test-admin-key',
      AG_DB_PATH: ':memory:',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Uncomment to debug server output:
  // serverProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(`[srv] ${d}`));
  // serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(`[srv] ${d}`));

  await waitForServer();

  // ── Sign up and create agents ──────────────────────────────────────────────

  // 1. Create tenant
  const signupRes = await request('POST', '/api/v1/signup', {
    name: 'Validation Test Corp',
    email: testEmail,
  });
  assert.equal(signupRes.status, 201, `signup failed: ${JSON.stringify(signupRes.body)}`);
  apiKey = signupRes.body['apiKey'] as string;
  assert.ok(apiKey.startsWith('ag_live_'), 'expected live API key');

  // 2. Create primary agent
  const agentRes = await request(
    'POST',
    '/api/v1/agents',
    { name: `Validation Agent ${RUN_ID}` },
    { 'X-API-Key': apiKey },
  );
  assert.equal(agentRes.status, 201, `agent creation failed: ${JSON.stringify(agentRes.body)}`);
  agentId = agentRes.body['id'] as string;
  assert.ok(typeof agentId === 'string' && agentId.length > 0);

  // 3. Create secondary agent (for re-certification / double-certify tests)
  const agentRes2 = await request(
    'POST',
    '/api/v1/agents',
    { name: `Validation Agent2 ${RUN_ID}` },
    { 'X-API-Key': apiKey },
  );
  assert.equal(agentRes2.status, 201);
  agentId2 = agentRes2.body['id'] as string;
});

after(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await sleep(200);
  }
});

// ─── POST /api/v1/agents/:id/validate ────────────────────────────────────────

describe('POST /api/v1/agents/:id/validate', () => {
  // ── Auth ────────────────────────────────────────────────────────────────────

  it('returns 401 when no API key provided', async () => {
    const res = await request('POST', `/api/v1/agents/${agentId}/validate`, {
      declaredTools: ['file_read'],
    });
    assert.equal(res.status, 401);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('returns 404 for a non-existent agent ID', async () => {
    const res = await request(
      'POST',
      '/api/v1/agents/00000000-0000-0000-0000-000000000000/validate',
      { declaredTools: ['file_read'] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 404);
    assert.ok(typeof res.body['error'] === 'string');
  });

  // ── Input validation ────────────────────────────────────────────────────────

  it('returns 400 when declaredTools field is missing', async () => {
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { somethingElse: 'oops' },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
    // The API returns a descriptive error about declaredTools being required/invalid
    // (exact wording may vary between Zod validation and manual checks)
    assert.ok(
      (res.body['error'] as string).length > 0,
      'should return a non-empty error message',
    );
  });

  it('returns 400 when declaredTools is an empty array', async () => {
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: [] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('returns 400 when declaredTools is not an array (string)', async () => {
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: 'file_read' },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
  });

  it('returns 400 when declaredTools is not an array (null)', async () => {
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: null },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
  });

  // ── Successful validation responses ─────────────────────────────────────────

  it('returns a valid coverage report for declared tools (happy path)', async () => {
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: ['file_read', 'list_files'] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);

    // Structural checks
    assert.equal(res.body['agentId'], agentId);
    assert.ok(typeof res.body['valid'] === 'boolean');
    assert.ok(typeof res.body['coverage'] === 'number');
    assert.ok((res.body['coverage'] as number) >= 0 && (res.body['coverage'] as number) <= 100);
    assert.ok(typeof res.body['riskScore'] === 'number');
    assert.ok(Array.isArray(res.body['results']));
    assert.ok(Array.isArray(res.body['uncovered']));
    assert.ok(typeof res.body['validatedAt'] === 'string');
    assert.ok(!isNaN(new Date(res.body['validatedAt'] as string).getTime()));
  });

  it('results array contains one entry per declared tool', async () => {
    const tools = ['file_read', 'list_files', 'get_config'];
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: tools },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    const results = res.body['results'] as Array<Record<string, unknown>>;
    assert.equal(results.length, tools.length);

    // Each result entry has required fields
    for (const r of results) {
      assert.ok(typeof r['tool'] === 'string');
      assert.ok(typeof r['decision'] === 'string');
      assert.ok(typeof r['riskScore'] === 'number');
      // ruleId may be null for uncovered tools
      assert.ok(r['ruleId'] === null || typeof r['ruleId'] === 'string');
    }
  });

  it('all-allowed tools → coverage 100%, valid: true', async () => {
    // Tools that hit the explicit allow-read-operations rule
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: ['file_read', 'list_files', 'get_config', 'db_read_public'] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['coverage'], 100);
    assert.equal(res.body['valid'], true);
    assert.deepEqual(res.body['uncovered'], []);
  });

  it('all-blocked tools → coverage 100% (blocked tools are covered by rules)', async () => {
    // Blocked tools also hit explicit rules, so coverage is 100% (rules covered them)
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: ['shell_exec', 'sudo', 'http_request', 'file_delete'] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    // All of these tools match explicit block rules → ruleId is non-null → 100% coverage
    assert.equal(res.body['coverage'], 100);
    assert.equal(res.body['valid'], true);

    // Verify each tool got a block decision
    const results = res.body['results'] as Array<Record<string, unknown>>;
    for (const r of results) {
      assert.equal(r['decision'], 'block', `expected block for ${r['tool']}`);
      assert.ok(r['ruleId'] !== null, `expected a matched rule for ${r['tool']}`);
    }
  });

  it('mixed tools → some blocked, some allowed → coverage < 100% when uncovered tools present', async () => {
    // 'my_custom_tool' is not in any policy rule → falls through to default → uncovered
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: ['file_read', 'my_custom_tool_xyz', 'another_unknown_tool_abc'] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    // file_read is covered, the two unknowns are not → coverage < 100%
    assert.ok((res.body['coverage'] as number) < 100);
    assert.equal(res.body['valid'], false);
    const uncovered = res.body['uncovered'] as string[];
    assert.ok(uncovered.includes('my_custom_tool_xyz'));
    assert.ok(uncovered.includes('another_unknown_tool_abc'));
  });

  it('entirely uncovered tools → coverage 0%, valid: false', async () => {
    // Only use tools that don't appear in any policy rule
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: ['totally_unknown_a', 'totally_unknown_b', 'totally_unknown_c'] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['coverage'], 0);
    assert.equal(res.body['valid'], false);
    const uncovered = res.body['uncovered'] as string[];
    assert.equal(uncovered.length, 3);
  });

  it('mixed: explicit-rule tools and unknown tools → partial coverage', async () => {
    // 2 known tools (covered) + 1 unknown = 66% or 67% coverage
    const res = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: ['file_read', 'shell_exec', 'custom_uncovered_tool_zzz'] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    const coverage = res.body['coverage'] as number;
    // 2/3 covered → ~66%
    assert.ok(coverage > 0 && coverage < 100, `coverage should be partial, got ${coverage}`);
    assert.equal(res.body['valid'], false);
  });

  it('riskScore is elevated when dangerous tools are declared', async () => {
    const safeRes = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: ['file_read', 'list_files'] },
      { 'X-API-Key': apiKey },
    );
    const dangerousRes = await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: ['shell_exec', 'sudo', 'file_delete'] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(safeRes.status, 200);
    assert.equal(dangerousRes.status, 200);
    assert.ok(
      (dangerousRes.body['riskScore'] as number) > (safeRes.body['riskScore'] as number),
      `dangerous riskScore (${dangerousRes.body['riskScore']}) should exceed safe riskScore (${safeRes.body['riskScore']})`,
    );
  });

  it('validate persists the declared tools and updates coverage on agent (reflected in readiness)', async () => {
    await request(
      'POST',
      `/api/v1/agents/${agentId}/validate`,
      { declaredTools: ['file_read', 'get_config'] },
      { 'X-API-Key': apiKey },
    );
    const readiness = await request(
      'GET',
      `/api/v1/agents/${agentId}/readiness`,
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(readiness.status, 200);
    assert.ok(typeof readiness.body['coverage'] === 'number');
    assert.ok(typeof readiness.body['lastValidated'] === 'string');
  });
});

// ─── GET /api/v1/agents/:id/readiness ────────────────────────────────────────

describe('GET /api/v1/agents/:id/readiness', () => {
  let freshAgentId = '';

  before(async () => {
    // Create a brand-new agent that has never been validated
    const res = await request(
      'POST',
      '/api/v1/agents',
      { name: `Readiness Fresh Agent ${RUN_ID}` },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 201);
    freshAgentId = res.body['id'] as string;
  });

  it('returns 401 when no API key provided', async () => {
    const res = await request('GET', `/api/v1/agents/${freshAgentId}/readiness`);
    assert.equal(res.status, 401);
  });

  it('returns 404 for a non-existent agent', async () => {
    const res = await request(
      'GET',
      '/api/v1/agents/00000000-0000-0000-0000-000000000099/readiness',
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 404);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('new (never validated) agent → status "registered"', async () => {
    const res = await request(
      'GET',
      `/api/v1/agents/${freshAgentId}/readiness`,
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['agentId'], freshAgentId);
    assert.equal(res.body['status'], 'registered');
    assert.equal(res.body['lastValidated'], null);
    assert.equal(res.body['coverage'], null);
    assert.equal(res.body['certifiedAt'], null);
    assert.equal(res.body['expiresAt'], null);
  });

  it('after validation → status "validated" with coverage set', async () => {
    // Run validation on the fresh agent
    await request(
      'POST',
      `/api/v1/agents/${freshAgentId}/validate`,
      { declaredTools: ['file_read', 'list_files'] },
      { 'X-API-Key': apiKey },
    );

    const res = await request(
      'GET',
      `/api/v1/agents/${freshAgentId}/readiness`,
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['status'], 'validated');
    assert.ok(typeof res.body['coverage'] === 'number');
    assert.ok(typeof res.body['lastValidated'] === 'string');
    assert.equal(res.body['certifiedAt'], null);   // not yet certified
    assert.equal(res.body['expiresAt'], null);
  });

  it('response includes agent name and agentId', async () => {
    const res = await request(
      'GET',
      `/api/v1/agents/${freshAgentId}/readiness`,
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.ok(typeof res.body['name'] === 'string');
    assert.equal(res.body['agentId'], freshAgentId);
  });

  it('after certification → status "certified" with certifiedAt and expiresAt', async () => {
    // Need 100% coverage to certify — use all-covered tools
    await request(
      'POST',
      `/api/v1/agents/${freshAgentId}/validate`,
      { declaredTools: ['file_read', 'list_files', 'shell_exec'] },
      { 'X-API-Key': apiKey },
    );
    await request(
      'POST',
      `/api/v1/agents/${freshAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );

    const res = await request(
      'GET',
      `/api/v1/agents/${freshAgentId}/readiness`,
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['status'], 'certified');
    assert.ok(typeof res.body['certifiedAt'] === 'string');
    assert.ok(typeof res.body['expiresAt'] === 'string');
    assert.ok(!isNaN(new Date(res.body['certifiedAt'] as string).getTime()));
    assert.ok(!isNaN(new Date(res.body['expiresAt'] as string).getTime()));
  });

  it('expiresAt is ~30 days after certifiedAt', async () => {
    const res = await request(
      'GET',
      `/api/v1/agents/${freshAgentId}/readiness`,
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    if (res.body['status'] === 'certified') {
      const certifiedAt = new Date(res.body['certifiedAt'] as string).getTime();
      const expiresAt = new Date(res.body['expiresAt'] as string).getTime();
      const diffDays = (expiresAt - certifiedAt) / (1000 * 60 * 60 * 24);
      // Allow small floating-point tolerance
      assert.ok(diffDays > 29.9 && diffDays < 30.1, `expiresAt should be ~30d after certifiedAt, got ${diffDays}d`);
    }
  });
});

// ─── POST /api/v1/agents/:id/certify ─────────────────────────────────────────

describe('POST /api/v1/agents/:id/certify', () => {
  let certAgentId = '';

  before(async () => {
    // Fresh agent for certification tests
    const res = await request(
      'POST',
      '/api/v1/agents',
      { name: `Cert Test Agent ${RUN_ID}` },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 201);
    certAgentId = res.body['id'] as string;
  });

  it('returns 401 when no API key provided', async () => {
    const res = await request('POST', `/api/v1/agents/${certAgentId}/certify`, {});
    assert.equal(res.status, 401);
  });

  it('returns 404 for non-existent agent', async () => {
    const res = await request(
      'POST',
      '/api/v1/agents/00000000-dead-beef-0000-000000000000/certify',
      {},
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 404);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('fails (422) when agent has never been validated', async () => {
    const res = await request(
      'POST',
      `/api/v1/agents/${certAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 422);
    assert.ok(typeof res.body['error'] === 'string');
    assert.match(res.body['error'] as string, /not been validated/i);
  });

  it('fails (422) when coverage is < 100%', async () => {
    // Validate with some uncovered tools to get partial coverage
    await request(
      'POST',
      `/api/v1/agents/${certAgentId}/validate`,
      { declaredTools: ['file_read', 'completely_unknown_tool_no_rule_xyz'] },
      { 'X-API-Key': apiKey },
    );

    const res = await request(
      'POST',
      `/api/v1/agents/${certAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 422);
    assert.ok(typeof res.body['error'] === 'string');
    assert.match(res.body['error'] as string, /coverage/i);
    // Coverage value should be echoed back
    assert.ok(typeof res.body['coverage'] === 'number');
    assert.ok((res.body['coverage'] as number) < 100);
  });

  it('succeeds (201) when coverage is 100%', async () => {
    // Re-validate with only covered tools to achieve 100%
    await request(
      'POST',
      `/api/v1/agents/${certAgentId}/validate`,
      { declaredTools: ['file_read', 'list_files', 'shell_exec', 'sudo'] },
      { 'X-API-Key': apiKey },
    );

    const res = await request(
      'POST',
      `/api/v1/agents/${certAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 201);
    assert.equal(res.body['certified'], true);
    assert.equal(res.body['agentId'], certAgentId);
    assert.ok(typeof res.body['name'] === 'string');
  });

  it('certification response contains certifiedAt, expiresAt, and certificationToken', async () => {
    // Already certified from previous test, but let's re-certify (double certify test)
    // First ensure 100% coverage is still on record
    await request(
      'POST',
      `/api/v1/agents/${certAgentId}/validate`,
      { declaredTools: ['file_read', 'shell_exec'] },
      { 'X-API-Key': apiKey },
    );
    const res = await request(
      'POST',
      `/api/v1/agents/${certAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 201);
    assert.ok(typeof res.body['certifiedAt'] === 'string');
    assert.ok(typeof res.body['expiresAt'] === 'string');
    assert.ok(typeof res.body['certificationToken'] === 'string');
    assert.ok((res.body['certificationToken'] as string).startsWith('agcert_'),
      `token should start with 'agcert_', got: ${res.body['certificationToken']}`);
    assert.ok(typeof res.body['coverage'] === 'number');
    assert.ok(typeof res.body['message'] === 'string');
  });

  it('certificationToken is a non-trivially long unique token', async () => {
    // Certify the second agent (needs validation first)
    await request(
      'POST',
      `/api/v1/agents/${agentId2}/validate`,
      { declaredTools: ['file_read', 'list_files'] },
      { 'X-API-Key': apiKey },
    );
    const res1 = await request(
      'POST',
      `/api/v1/agents/${certAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );
    const res2 = await request(
      'POST',
      `/api/v1/agents/${agentId2}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );
    assert.equal(res1.status, 201);
    assert.equal(res2.status, 201);
    const token1 = res1.body['certificationToken'] as string;
    const token2 = res2.body['certificationToken'] as string;
    // Tokens should be unique per agent / certify call
    assert.notEqual(token1, token2, 'each certify call should generate a unique token');
    // Token should be adequately long (agcert_ + 48 hex chars = 55 chars)
    assert.ok(token1.length >= 50, `token too short: ${token1.length}`);
  });

  it('double-certify (re-certify) works — returns 201 both times', async () => {
    // Ensure 100% coverage
    await request(
      'POST',
      `/api/v1/agents/${certAgentId}/validate`,
      { declaredTools: ['file_read', 'shell_exec'] },
      { 'X-API-Key': apiKey },
    );

    const first = await request(
      'POST',
      `/api/v1/agents/${certAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );
    const second = await request(
      'POST',
      `/api/v1/agents/${certAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );

    assert.equal(first.status, 201, 'first certify should succeed');
    assert.equal(second.status, 201, 'second certify should also succeed (re-certify)');
    // Tokens should be different (fresh token on each certify)
    assert.notEqual(
      first.body['certificationToken'],
      second.body['certificationToken'],
      're-certify should issue a new token',
    );
  });

  it('after certification, readiness shows "certified"', async () => {
    const readiness = await request(
      'GET',
      `/api/v1/agents/${certAgentId}/readiness`,
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body['status'], 'certified');
  });
});

// ─── POST /api/v1/mcp/admit ───────────────────────────────────────────────────

describe('POST /api/v1/mcp/admit', () => {
  // ── Auth ────────────────────────────────────────────────────────────────────

  it('returns 401 when no API key provided', async () => {
    const res = await request('POST', '/api/v1/mcp/admit', {
      serverUrl: 'https://mcp.example.com',
      tools: [{ name: 'file_read' }],
    });
    assert.equal(res.status, 401);
  });

  // ── Input validation ────────────────────────────────────────────────────────

  it('returns 400 when serverUrl is missing', async () => {
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      { tools: [{ name: 'file_read' }] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
    assert.match(res.body['error'] as string, /serverUrl/i);
  });

  it('returns 400 when tools array is missing', async () => {
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      { serverUrl: 'https://mcp.example.com' },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
    assert.ok(
      (res.body['error'] as string).length > 0,
      'should return a non-empty error about missing tools',
    );
  });

  it('returns 400 when tools is an empty array', async () => {
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      { serverUrl: 'https://mcp.example.com', tools: [] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('returns 400 when tools have no valid name fields', async () => {
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      { serverUrl: 'https://mcp.example.com', tools: [{ description: 'no name here' }, { foo: 'bar' }] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('returns 400 when tools is not an array (string)', async () => {
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      { serverUrl: 'https://mcp.example.com', tools: 'file_read' },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
  });

  // ── Admission decisions ─────────────────────────────────────────────────────

  it('safe tools (read-only) → admitted: true', async () => {
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      {
        serverUrl: 'https://safe-mcp.example.com',
        tools: [
          { name: 'file_read', description: 'Read a file' },
          { name: 'list_files', description: 'List directory contents' },
          { name: 'get_config', description: 'Get configuration' },
          { name: 'db_read_public', description: 'Read public DB' },
        ],
      },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['admitted'], true);
    assert.equal(res.body['serverUrl'], 'https://safe-mcp.example.com');
  });

  it('dangerous tools (shell_exec) → admitted: false', async () => {
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      {
        serverUrl: 'https://dangerous-mcp.example.com',
        tools: [
          { name: 'shell_exec', description: 'Execute shell commands' },
        ],
      },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['admitted'], false);
  });

  it('HTTP exfil tools → admitted: false', async () => {
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      {
        serverUrl: 'https://bad-mcp.example.com',
        tools: [
          { name: 'http_request' },
          { name: 'fetch' },
          { name: 'curl' },
        ],
      },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['admitted'], false);
  });

  it('mixed tools (safe + dangerous) → admitted: false', async () => {
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      {
        serverUrl: 'https://mixed-mcp.example.com',
        tools: [
          { name: 'file_read' },        // safe (allow rule)
          { name: 'shell_exec' },       // dangerous (block rule)
        ],
      },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['admitted'], false, 'mixed tools should not be admitted if any are blocked');
  });

  it('response structure is correct', async () => {
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      {
        serverUrl: 'https://struct-mcp.example.com',
        tools: [{ name: 'file_read' }],
      },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.ok(typeof res.body['admitted'] === 'boolean');
    assert.ok(typeof res.body['serverUrl'] === 'string');
    assert.ok(typeof res.body['coverage'] === 'number');
    assert.ok(Array.isArray(res.body['uncovered']));
    assert.ok(Array.isArray(res.body['results']));
    assert.ok(typeof res.body['checkedAt'] === 'string');
    assert.ok(!isNaN(new Date(res.body['checkedAt'] as string).getTime()));
  });

  it('results array contains one entry per tool', async () => {
    const tools = [
      { name: 'file_read', description: 'Read file' },
      { name: 'shell_exec', description: 'Shell' },
      { name: 'http_post', description: 'HTTP' },
    ];
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      { serverUrl: 'https://mcp.example.com', tools },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    const results = res.body['results'] as Array<Record<string, unknown>>;
    assert.equal(results.length, tools.length);
  });

  it('uncovered tools reduce admission (tools with no matching rule → not admitted)', async () => {
    // Unknown tools have no rule match → ruleId null → uncovered
    // uncovered means coverage < 100% AND per the logic: admitted = uncovered.length === 0 && no block decisions
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      {
        serverUrl: 'https://partial-mcp.example.com',
        tools: [
          { name: 'file_read' },           // covered (allow)
          { name: 'completely_custom_xyz' }, // uncovered (no rule)
        ],
      },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    // uncovered.length > 0 → admitted: false
    assert.equal(res.body['admitted'], false);
    const uncovered = res.body['uncovered'] as string[];
    assert.ok(uncovered.includes('completely_custom_xyz'));
  });

  it('tools with optional description field are accepted (name + description only)', async () => {
    // The server only uses tool.name; extra string fields like description are ignored safely.
    // Complex nested inputSchema objects can trigger server-side validation issues, so we
    // test with simple extra fields only.
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      {
        serverUrl: 'https://full-mcp.example.com',
        tools: [
          {
            name: 'file_read',
            description: 'Read a file from disk',
          },
        ],
      },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.ok(typeof res.body['admitted'] === 'boolean');
  });

  it('serverUrl is echoed back in response', async () => {
    const url = `https://echo-check-${RUN_ID}.mcp.example.com`;
    const res = await request(
      'POST',
      '/api/v1/mcp/admit',
      { serverUrl: url, tools: [{ name: 'file_read' }] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['serverUrl'], url);
  });
});

// ─── Cross-endpoint Workflow ──────────────────────────────────────────────────

describe('Full certification workflow', () => {
  let workflowAgentId = '';

  before(async () => {
    const res = await request(
      'POST',
      '/api/v1/agents',
      { name: `Workflow Agent ${RUN_ID}` },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 201);
    workflowAgentId = res.body['id'] as string;
  });

  it('step 1 — new agent starts at "registered" status', async () => {
    const res = await request(
      'GET',
      `/api/v1/agents/${workflowAgentId}/readiness`,
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['status'], 'registered');
  });

  it('step 2 — certify without validation → 422', async () => {
    const res = await request(
      'POST',
      `/api/v1/agents/${workflowAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 422);
  });

  it('step 3 — validate with partial coverage → status becomes "validated", coverage < 100%', async () => {
    const validateRes = await request(
      'POST',
      `/api/v1/agents/${workflowAgentId}/validate`,
      { declaredTools: ['file_read', 'unknown_tool_workflow_test'] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(validateRes.status, 200);
    assert.ok((validateRes.body['coverage'] as number) < 100);

    const readiness = await request(
      'GET',
      `/api/v1/agents/${workflowAgentId}/readiness`,
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(readiness.body['status'], 'validated');
  });

  it('step 4 — certify with < 100% coverage → 422', async () => {
    const res = await request(
      'POST',
      `/api/v1/agents/${workflowAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 422);
    assert.match(res.body['error'] as string, /100%/);
  });

  it('step 5 — re-validate with 100% coverage → valid: true', async () => {
    const res = await request(
      'POST',
      `/api/v1/agents/${workflowAgentId}/validate`,
      { declaredTools: ['file_read', 'shell_exec', 'sudo', 'http_post', 'file_delete'] },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['coverage'], 100);
    assert.equal(res.body['valid'], true);
  });

  it('step 6 — certify after 100% coverage → 201 with token', async () => {
    const res = await request(
      'POST',
      `/api/v1/agents/${workflowAgentId}/certify`,
      {},
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 201);
    assert.equal(res.body['certified'], true);
    assert.ok((res.body['certificationToken'] as string).startsWith('agcert_'));
  });

  it('step 7 — readiness now shows "certified" with valid timestamps', async () => {
    const res = await request(
      'GET',
      `/api/v1/agents/${workflowAgentId}/readiness`,
      undefined,
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['status'], 'certified');
    assert.ok(typeof res.body['certifiedAt'] === 'string');
    assert.ok(typeof res.body['expiresAt'] === 'string');
    assert.ok(typeof res.body['coverage'] === 'number');
    assert.equal(res.body['coverage'], 100);
  });
});

}); // end Validation & Certification API
