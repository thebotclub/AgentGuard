/**
 * AgentGuard Phase 1 Tests — Webhook Alerts, Policy Templates, Agent Identity
 *
 * Run: npx tsx --test tests/phase1.test.ts
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// ─── Server lifecycle ─────────────────────────────────────────────────────────

const BASE = 'http://localhost:3002';
let serverProcess: ChildProcess | null = null;

// Unique test run identifiers
const RUN = Date.now();
const testEmail = `phase1-tenant-${RUN}@test.local`;
let tenantApiKey = '';
let tenantId = '';

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
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let responseBody: Record<string, unknown> = {};
  try { responseBody = await res.json() as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, body: responseBody };
}

async function waitForServer(retries = 25, delayMs = 300): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await sleep(delayMs);
  }
  throw new Error('Server did not start in time');
}

before(async () => {
  serverProcess = spawn('npx', ['tsx', 'api/server.ts'], {
    cwd: '/home/vector/.openclaw/workspace/agentguard-project',
    env: { ...process.env, PORT: '3002', NODE_ENV: 'test', ADMIN_KEY: 'phase1-admin-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitForServer();

  // Create a tenant for all tests
  const signup = await request('POST', '/api/v1/signup', { name: 'Phase1 Test Corp', email: testEmail });
  assert.equal(signup.status, 201, 'Tenant signup should succeed');
  tenantApiKey = signup.body['apiKey'] as string;
  tenantId = signup.body['tenantId'] as string;
});

after(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await sleep(300);
  }
});

// ─── Policy Templates ─────────────────────────────────────────────────────────

describe('Policy Templates', () => {
  it('GET /api/v1/templates returns all 5 templates', async () => {
    const res = await request('GET', '/api/v1/templates');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body['templates']));
    const templates = res.body['templates'] as Array<Record<string, unknown>>;
    assert.ok(templates.length >= 5, `Expected at least 5 templates, got ${templates.length}`);
  });

  it('GET /api/v1/templates includes expected template IDs', async () => {
    const res = await request('GET', '/api/v1/templates');
    const templates = res.body['templates'] as Array<Record<string, unknown>>;
    const ids = templates.map(t => t['id'] as string);
    assert.ok(ids.includes('soc2-starter'), 'should include soc2-starter');
    assert.ok(ids.includes('apra-cps234'), 'should include apra-cps234');
    assert.ok(ids.includes('eu-ai-act'), 'should include eu-ai-act');
    assert.ok(ids.includes('owasp-agentic'), 'should include owasp-agentic');
    assert.ok(ids.includes('financial-services'), 'should include financial-services');
  });

  it('GET /api/v1/templates each entry has required fields', async () => {
    const res = await request('GET', '/api/v1/templates');
    const templates = res.body['templates'] as Array<Record<string, unknown>>;
    for (const t of templates) {
      assert.ok(typeof t['id'] === 'string', 'template must have id');
      assert.ok(typeof t['name'] === 'string', 'template must have name');
      assert.ok(typeof t['description'] === 'string', 'template must have description');
      assert.ok(typeof t['ruleCount'] === 'number', 'template must have ruleCount');
      assert.ok((t['ruleCount'] as number) >= 5, `template ${t['id']} should have >= 5 rules`);
    }
  });

  it('GET /api/v1/templates is public (no auth required)', async () => {
    const res = await request('GET', '/api/v1/templates');
    assert.equal(res.status, 200);
  });

  it('GET /api/v1/templates/soc2-starter returns template detail', async () => {
    const res = await request('GET', '/api/v1/templates/soc2-starter');
    assert.equal(res.status, 200);
    const tmpl = res.body['template'] as Record<string, unknown>;
    assert.equal(tmpl['id'], 'soc2-starter');
    assert.equal(tmpl['version'], '1.0');
    assert.ok(Array.isArray(tmpl['rules']));
    assert.ok((tmpl['rules'] as unknown[]).length >= 5);
  });

  it('GET /api/v1/templates/:name returns 404 for unknown template', async () => {
    const res = await request('GET', '/api/v1/templates/nonexistent-template');
    assert.equal(res.status, 404);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('POST /api/v1/templates/soc2-starter/apply requires auth', async () => {
    const res = await request('POST', '/api/v1/templates/soc2-starter/apply');
    assert.equal(res.status, 401);
  });

  it('POST /api/v1/templates/soc2-starter/apply succeeds with auth', async () => {
    const res = await request('POST', '/api/v1/templates/soc2-starter/apply', {},
      { 'X-API-Key': tenantApiKey });
    assert.equal(res.status, 200);
    assert.equal(res.body['applied'], true);
    assert.equal(res.body['templateId'], 'soc2-starter');
    assert.ok(typeof res.body['rulesInTemplate'] === 'number');
    assert.ok((res.body['rulesInTemplate'] as number) >= 5);
  });

  it('POST /api/v1/templates/nonexistent/apply returns 404', async () => {
    const res = await request('POST', '/api/v1/templates/nonexistent/apply', {},
      { 'X-API-Key': tenantApiKey });
    assert.equal(res.status, 404);
  });

  it('GET /api/v1/templates/financial-services has correct category', async () => {
    const res = await request('GET', '/api/v1/templates/financial-services');
    assert.equal(res.status, 200);
    const tmpl = res.body['template'] as Record<string, unknown>;
    assert.equal(tmpl['category'], 'industry');
    assert.ok(Array.isArray(tmpl['tags']));
  });
});

// ─── Webhook CRUD ─────────────────────────────────────────────────────────────

describe('Webhook CRUD', () => {
  let webhookId = '';

  it('POST /api/v1/webhooks requires auth', async () => {
    const res = await request('POST', '/api/v1/webhooks', { url: 'https://example.com/hook' });
    assert.equal(res.status, 401);
  });

  it('POST /api/v1/webhooks creates a webhook', async () => {
    const res = await request('POST', '/api/v1/webhooks',
      { url: 'https://hooks.example.com/agentguard', events: ['block', 'killswitch'] },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(res.status, 201);
    assert.ok(typeof res.body['id'] === 'string');
    assert.equal(res.body['url'], 'https://hooks.example.com/agentguard');
    assert.ok(Array.isArray(res.body['events']));
    assert.equal(res.body['active'], true);
    webhookId = res.body['id'] as string;
  });

  it('POST /api/v1/webhooks creates a webhook with secret', async () => {
    const res = await request('POST', '/api/v1/webhooks',
      { url: 'https://secure.example.com/hook', events: ['block'], secret: 'my-signing-secret' },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(res.status, 201);
    assert.ok(typeof res.body['id'] === 'string');
    // Secret should NOT be returned in response
    assert.ok(!('secret' in res.body), 'secret should not be returned');
  });

  it('POST /api/v1/webhooks uses default events when not provided', async () => {
    const res = await request('POST', '/api/v1/webhooks',
      { url: 'https://default-events.example.com/hook' },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(res.status, 201);
    assert.ok(Array.isArray(res.body['events']));
    assert.ok((res.body['events'] as string[]).length > 0);
  });

  it('POST /api/v1/webhooks rejects missing url', async () => {
    const res = await request('POST', '/api/v1/webhooks',
      { events: ['block'] },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('POST /api/v1/webhooks rejects invalid url', async () => {
    const res = await request('POST', '/api/v1/webhooks',
      { url: 'not-a-url' },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(res.status, 400);
  });

  it('GET /api/v1/webhooks requires auth', async () => {
    const res = await request('GET', '/api/v1/webhooks');
    assert.equal(res.status, 401);
  });

  it('GET /api/v1/webhooks lists tenant webhooks', async () => {
    const res = await request('GET', '/api/v1/webhooks', undefined, { 'X-API-Key': tenantApiKey });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body['webhooks']));
    const hooks = res.body['webhooks'] as Array<Record<string, unknown>>;
    assert.ok(hooks.length >= 1);
    const hook = hooks.find(h => h['id'] === webhookId);
    assert.ok(hook, 'created webhook should be in list');
    assert.equal(hook!['url'], 'https://hooks.example.com/agentguard');
  });

  it('GET /api/v1/webhooks does not expose secrets', async () => {
    const res = await request('GET', '/api/v1/webhooks', undefined, { 'X-API-Key': tenantApiKey });
    const hooks = res.body['webhooks'] as Array<Record<string, unknown>>;
    for (const h of hooks) {
      assert.ok(!('secret' in h), 'webhooks list should not expose secrets');
    }
  });

  it('DELETE /api/v1/webhooks/:id requires auth', async () => {
    const res = await request('DELETE', `/api/v1/webhooks/${webhookId}`);
    assert.equal(res.status, 401);
  });

  it('DELETE /api/v1/webhooks/:id deletes webhook', async () => {
    const res = await request('DELETE', `/api/v1/webhooks/${webhookId}`,
      undefined, { 'X-API-Key': tenantApiKey });
    assert.equal(res.status, 200);
    assert.equal(res.body['id'], webhookId);
    assert.equal(res.body['deleted'], true);
  });

  it('DELETE /api/v1/webhooks/:id removes it from list', async () => {
    const res = await request('GET', '/api/v1/webhooks', undefined, { 'X-API-Key': tenantApiKey });
    const hooks = res.body['webhooks'] as Array<Record<string, unknown>>;
    const deleted = hooks.find(h => h['id'] === webhookId);
    assert.ok(!deleted, 'deleted webhook should not appear in list');
  });

  it('DELETE /api/v1/webhooks/:id returns 404 for nonexistent id', async () => {
    const res = await request('DELETE', '/api/v1/webhooks/nonexistent-id',
      undefined, { 'X-API-Key': tenantApiKey });
    assert.equal(res.status, 404);
  });

  it('Agent key cannot manage webhooks (403)', async () => {
    // Create an agent first to get its key
    const agentRes = await request('POST', '/api/v1/agents',
      { name: 'webhook-test-agent' },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(agentRes.status, 201);
    const agentKey = agentRes.body['apiKey'] as string;

    const res = await request('POST', '/api/v1/webhooks',
      { url: 'https://example.com/hook' },
      { 'X-API-Key': agentKey },
    );
    assert.equal(res.status, 403);
  });
});

// ─── Agent Identity & Scoping ─────────────────────────────────────────────────

describe('Agent Identity & Scoping', () => {
  let agentId = '';
  let agentKey = '';

  it('POST /api/v1/agents requires tenant API key', async () => {
    const res = await request('POST', '/api/v1/agents', { name: 'test-bot' });
    assert.equal(res.status, 401);
  });

  it('POST /api/v1/agents creates an agent with ag_agent_ prefixed key', async () => {
    const res = await request('POST', '/api/v1/agents',
      { name: 'sales-bot', policy_scope: [] },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(res.status, 201);
    assert.ok(typeof res.body['id'] === 'string');
    assert.equal(res.body['name'], 'sales-bot');
    assert.ok(typeof res.body['apiKey'] === 'string');
    assert.ok((res.body['apiKey'] as string).startsWith('ag_agent_'),
      `Agent key should start with ag_agent_, got: ${res.body['apiKey']}`);
    assert.equal(res.body['tenantId'], tenantId);
    assert.ok(Array.isArray(res.body['policyScope']));
    assert.equal(res.body['active'], true);

    agentId = res.body['id'] as string;
    agentKey = res.body['apiKey'] as string;
  });

  it('POST /api/v1/agents apiKey is 32 hex chars after prefix', async () => {
    // ag_agent_ is 9 chars, then 32 hex chars = total 41
    assert.ok(agentKey.length === 41, `Key length should be 41, got ${agentKey.length}`);
    assert.match(agentKey, /^ag_agent_[0-9a-f]{32}$/);
  });

  it('POST /api/v1/agents rejects missing name', async () => {
    const res = await request('POST', '/api/v1/agents',
      {},
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(res.status, 400);
    assert.ok(typeof res.body['error'] === 'string');
  });

  it('POST /api/v1/agents rejects duplicate name', async () => {
    const res = await request('POST', '/api/v1/agents',
      { name: 'sales-bot' },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(res.status, 409);
  });

  it('GET /api/v1/agents requires auth', async () => {
    const res = await request('GET', '/api/v1/agents');
    assert.equal(res.status, 401);
  });

  it('GET /api/v1/agents lists tenant agents', async () => {
    const res = await request('GET', '/api/v1/agents', undefined, { 'X-API-Key': tenantApiKey });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body['agents']));
    const agents = res.body['agents'] as Array<Record<string, unknown>>;
    const agent = agents.find(a => a['id'] === agentId);
    assert.ok(agent, 'created agent should be in list');
    // API keys must NOT appear in list response
    assert.ok(!('apiKey' in agent!), 'apiKey should not be in agents list');
    assert.ok(!('api_key' in agent!), 'api_key should not be in agents list');
  });

  it('POST /api/v1/evaluate with agent key uses agent identity', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read', params: { path: '/reports/q4.csv' } },
      { 'X-API-Key': agentKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'allow');
    // agentId should be present in response
    assert.ok(typeof res.body['agentId'] === 'string', 'agentId should be in evaluate response');
    assert.equal(res.body['agentId'], agentId);
  });

  it('POST /api/v1/evaluate with agent key is backwards-compatible (still evaluates)', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'sudo', params: { command: 'whoami' } },
      { 'X-API-Key': agentKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'block');
  });

  it('POST /api/v1/evaluate with invalid agent key returns 401', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read' },
      { 'X-API-Key': 'ag_agent_invalidkey00000000000000' },
    );
    assert.equal(res.status, 401);
  });

  it('POST /api/v1/evaluate with tenant key still works (backward compat)', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read', params: { path: '/reports/q4.csv' } },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'allow');
    // No agentId in tenant-key response
    assert.ok(!('agentId' in res.body), 'agentId should not be present for tenant key evaluate');
  });

  it('POST /api/v1/evaluate without any key (demo mode) still works', async () => {
    const res = await request('POST', '/api/v1/evaluate', { tool: 'file_read' });
    assert.equal(res.status, 200);
    assert.ok(['allow', 'block', 'monitor', 'require_approval'].includes(res.body['result'] as string));
  });

  it('Agent key cannot access tenant admin endpoints (403)', async () => {
    const auditRes = await request('GET', '/api/v1/audit', undefined, { 'X-API-Key': agentKey });
    assert.equal(auditRes.status, 403);

    const agentsRes = await request('GET', '/api/v1/agents', undefined, { 'X-API-Key': agentKey });
    assert.equal(agentsRes.status, 403);
  });

  it('DELETE /api/v1/agents/:id requires tenant key', async () => {
    const res = await request('DELETE', `/api/v1/agents/${agentId}`);
    assert.equal(res.status, 401);
  });

  it('DELETE /api/v1/agents/:id deactivates agent', async () => {
    // Create a throwaway agent to delete
    const createRes = await request('POST', '/api/v1/agents',
      { name: 'throwaway-bot' },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(createRes.status, 201);
    const throwawayId = createRes.body['id'] as string;
    const throwawayKey = createRes.body['apiKey'] as string;

    // Delete it
    const deleteRes = await request('DELETE', `/api/v1/agents/${throwawayId}`,
      undefined, { 'X-API-Key': tenantApiKey });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body['deactivated'], true);

    // Deactivated agent key should now fail
    const evalRes = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read' },
      { 'X-API-Key': throwawayKey },
    );
    assert.equal(evalRes.status, 401, 'Deactivated agent key should return 401');
  });

  it('DELETE /api/v1/agents/:id returns 404 for nonexistent id', async () => {
    const res = await request('DELETE', '/api/v1/agents/nonexistent-id',
      undefined, { 'X-API-Key': tenantApiKey });
    assert.equal(res.status, 404);
  });

  it('Multiple agents can be created independently', async () => {
    const bot1 = await request('POST', '/api/v1/agents',
      { name: 'support-bot' },
      { 'X-API-Key': tenantApiKey },
    );
    const bot2 = await request('POST', '/api/v1/agents',
      { name: 'analytics-bot' },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(bot1.status, 201);
    assert.equal(bot2.status, 201);
    // Each gets a unique key
    assert.notEqual(bot1.body['apiKey'], bot2.body['apiKey']);
    assert.notEqual(bot1.body['id'], bot2.body['id']);
  });
});

// ─── Backward Compatibility ───────────────────────────────────────────────────

describe('Backward Compatibility', () => {
  it('Existing tenant keys (ag_live_) continue to work for /evaluate', async () => {
    const res = await request('POST', '/api/v1/evaluate',
      { tool: 'file_read' },
      { 'X-API-Key': tenantApiKey },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'allow');
  });

  it('Demo mode (no auth) continues to work for /evaluate', async () => {
    const res = await request('POST', '/api/v1/evaluate', { tool: 'sudo' });
    assert.equal(res.status, 200);
    assert.equal(res.body['result'], 'block');
  });

  it('Audit trail endpoint still works with tenant key', async () => {
    const res = await request('GET', '/api/v1/audit', undefined, { 'X-API-Key': tenantApiKey });
    assert.equal(res.status, 200);
    assert.ok(typeof res.body['total'] === 'number');
  });

  it('Kill switch endpoints unchanged', async () => {
    const ks = await request('GET', '/api/v1/killswitch');
    assert.equal(ks.status, 200);
  });

  it('Playground endpoints unchanged', async () => {
    const session = await request('POST', '/api/v1/playground/session');
    assert.equal(session.status, 200);
    assert.ok(typeof session.body['sessionId'] === 'string');
  });

  it('/health endpoint unchanged', async () => {
    const health = await request('GET', '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body['status'], 'ok');
    assert.equal(health.body['engine'], 'agentguard');
  });

  it('Usage endpoint unchanged', async () => {
    const usage = await request('GET', '/api/v1/usage', undefined, { 'X-API-Key': tenantApiKey });
    assert.equal(usage.status, 200);
    assert.ok(typeof usage.body['totalEvaluations'] === 'number');
  });
});
