/**
 * AgentGuard Phase 3 Tests — MCP (Model Context Protocol) Middleware
 *
 * Tests cover:
 *  - POST /api/v1/mcp/evaluate  — evaluate an MCP tool call
 *  - GET  /api/v1/mcp/config    — get MCP proxy config(s)
 *  - PUT  /api/v1/mcp/config    — create / update MCP proxy config
 *  - GET  /api/v1/mcp/sessions  — list active MCP sessions
 *  - McpMiddleware unit tests   — evaluateToolCall, interceptMessage, parseMessage
 *  - SDK TypeScript methods     — evaluateMcp(), getMcpConfig(), setMcpConfig(), listMcpSessions()
 *
 * Run: npx tsx --test tests/mcp.test.ts
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

// ─── Server lifecycle ──────────────────────────────────────────────────────

const PORT = 3004;
const BASE = `http://localhost:${PORT}`;
let serverProcess: ChildProcess | null = null;

const RUN = Date.now();
const testEmail = `mcp-tenant-${RUN}@test.local`;
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
  try {
    responseBody = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, body: responseBody };
}

async function authedRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return request(method, path, body, { 'X-API-Key': tenantApiKey });
}

async function waitForServer(retries = 30, delayMs = 300): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await sleep(delayMs);
  }
  throw new Error('Test server did not start in time');
}

before(async () => {
  // Start the API server on an isolated port with an in-memory SQLite database
  serverProcess = spawn(
    'npx',
    ['tsx', path.resolve('./api/server.ts')],
    {
      env: {
        ...process.env,
        PORT: String(PORT),
        AG_DB_PATH: ':memory:',
        NODE_ENV: 'test',
        ADMIN_KEY: 'test-admin-key',
      },
      cwd: path.resolve('.'),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  serverProcess.stdout?.on('data', (d: Buffer) => {
    // Uncomment for debugging: process.stdout.write(`[server] ${d}`);
    void d;
  });
  serverProcess.stderr?.on('data', (d: Buffer) => {
    void d;
  });

  await waitForServer();

  // Register a test tenant
  const { status, body } = await request('POST', '/api/v1/signup', {
    name: 'MCP Test Tenant',
    email: testEmail,
  });
  assert.equal(status, 201, `signup failed: ${JSON.stringify(body)}`);
  tenantApiKey = body['apiKey'] as string;
  tenantId = body['tenantId'] as string;
  assert.ok(tenantApiKey, 'expected apiKey in signup response');
  assert.ok(tenantId, 'expected tenantId in signup response');
});

after(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await sleep(500);
  }
});

// ─── 1. McpMiddleware Unit Tests (direct import) ───────────────────────────

describe('McpMiddleware — unit', () => {
  // We import and test the middleware class directly without HTTP
  let McpMiddlewareClass: typeof import('../api/mcp-middleware.js').McpMiddleware;
  let getMcpMiddlewareFn: typeof import('../api/mcp-middleware.js').getMcpMiddleware;
  let resetFn: typeof import('../api/mcp-middleware.js').resetMcpMiddleware;
  let McpErrorCode: typeof import('../api/mcp-middleware.js').McpErrorCode;
  let createSqliteAdapterFn: typeof import('../api/db-sqlite.js').createSqliteAdapter;

  before(async () => {
    const mod = await import('../api/mcp-middleware.js');
    McpMiddlewareClass = mod.McpMiddleware;
    getMcpMiddlewareFn = mod.getMcpMiddleware;
    resetFn = mod.resetMcpMiddleware;
    McpErrorCode = mod.McpErrorCode;
    const dbMod = await import('../api/db-sqlite.js');
    createSqliteAdapterFn = dbMod.createSqliteAdapter;
  });

  it('getMcpMiddleware returns a singleton', () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    resetFn();
    const a = getMcpMiddlewareFn(db);
    const b = getMcpMiddlewareFn(db);
    assert.strictEqual(a, b, 'should return same instance');
    resetFn();
  });

  it('evaluateToolCall — allows safe reads', () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);
    const session = middleware.createSession({ tenantId: 'test-tenant' });

    const result = middleware.evaluateToolCall({
      toolName: 'read_file',
      toolArguments: { path: '/tmp/test.txt' },
      session,
      tenantId: 'test-tenant',
    });

    // "read_file" is in the monitor rule — expect monitor (not blocked)
    assert.ok(['allow', 'monitor'].includes(result.decision), `expected allow or monitor, got ${result.decision}`);
    assert.strictEqual(result.blocked, false);
    assert.ok(typeof result.durationMs === 'number');
    assert.ok(result.durationMs >= 0);
  });

  it('evaluateToolCall — blocks shell execution', () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);
    const session = middleware.createSession({ tenantId: 'test-tenant' });

    const result = middleware.evaluateToolCall({
      toolName: 'execute_command',
      toolArguments: { command: 'rm -rf /' },
      session,
      tenantId: 'test-tenant',
    });

    assert.strictEqual(result.blocked, true, 'execute_command should be blocked');
    assert.strictEqual(result.decision, 'block');
    assert.ok(result.mcpError, 'should include mcpError');
    assert.strictEqual(result.mcpError!.code, McpErrorCode.PolicyBlocked);
    assert.ok(result.mcpError!.message.includes("execute_command"));
  });

  it('evaluateToolCall — blocks file writes', () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);
    const session = middleware.createSession({ tenantId: 'test-tenant' });

    const result = middleware.evaluateToolCall({
      toolName: 'write_file',
      toolArguments: { path: '/etc/passwd', content: 'evil' },
      session,
      tenantId: 'test-tenant',
    });

    assert.strictEqual(result.blocked, true, 'write_file should be blocked');
    assert.strictEqual(result.decision, 'block');
  });

  it('evaluateToolCall — applies actionMapping', () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);
    // Map custom tool name "my_shell_tool" → "execute_command" which is blocked
    const session = middleware.createSession({
      tenantId: 'test-tenant',
      actionMapping: { my_shell_tool: 'execute_command' },
    });

    const result = middleware.evaluateToolCall({
      toolName: 'my_shell_tool',
      toolArguments: {},
      session,
      tenantId: 'test-tenant',
    });

    assert.strictEqual(result.blocked, true, 'mapped tool should be blocked');
  });

  it('evaluateToolCall — increments session counters', () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);
    const session = middleware.createSession({ tenantId: 'test-tenant' });

    assert.strictEqual(session.toolCallCount, 0);
    assert.strictEqual(session.blockedCount, 0);

    // One blocked call
    middleware.evaluateToolCall({ toolName: 'execute_command', session, tenantId: 'test-tenant' });
    assert.strictEqual(session.toolCallCount, 1);
    assert.strictEqual(session.blockedCount, 1);

    // One allowed call
    middleware.evaluateToolCall({ toolName: 'read_file', session, tenantId: 'test-tenant' });
    assert.strictEqual(session.toolCallCount, 2);
    // blockedCount stays at 1
    assert.strictEqual(session.blockedCount, 1);
  });

  it('parseMessage — valid tools/call', () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);

    const raw = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/tmp/test.txt' } },
    });
    const parsed = middleware.parseMessage(raw);
    assert.ok(parsed, 'should parse valid JSON-RPC message');
    assert.strictEqual(parsed!.method, 'tools/call');
  });

  it('parseMessage — returns null for invalid JSON', () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);

    const parsed = middleware.parseMessage('not json {{{');
    assert.strictEqual(parsed, null);
  });

  it('interceptMessage — passes through non-tool messages', async () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);
    const session = middleware.createSession({ tenantId: 'test-tenant' });

    const msg = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'resources/read',
      params: { uri: 'file:///tmp/test.txt' },
    };

    const { response, forward } = await middleware.interceptMessage(msg, session);
    assert.strictEqual(response, null, 'non-tool messages should not produce a response');
    assert.strictEqual(forward, true, 'non-tool messages should be forwarded');
  });

  it('interceptMessage — blocks dangerous tools/call', async () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);
    const session = middleware.createSession({ tenantId: 'test-tenant' });

    const msg = {
      jsonrpc: '2.0' as const,
      id: 42,
      method: 'tools/call',
      params: { name: 'execute_command', arguments: { command: 'ls' } },
    };

    const { response, forward, evaluation } = await middleware.interceptMessage(msg, session);
    assert.strictEqual(forward, false, 'blocked tool should not be forwarded');
    assert.ok(response, 'blocked tool should produce a response');
    assert.strictEqual(response!.id, 42, 'response should carry the request ID');
    assert.ok(response!.error, 'response should contain an error');
    assert.strictEqual(response!.error!.code, McpErrorCode.PolicyBlocked);
    assert.ok(evaluation?.blocked);
  });

  it('interceptMessage — allows safe tools/call', async () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);
    const session = middleware.createSession({ tenantId: 'test-tenant' });

    const msg = {
      jsonrpc: '2.0' as const,
      id: 99,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/tmp/test.txt' } },
    };

    const { response, forward } = await middleware.interceptMessage(msg, session);
    assert.strictEqual(forward, true, 'safe tool should be forwarded');
    assert.strictEqual(response, null, 'safe tool should not produce a blocking response');
  });

  it('interceptMessage — returns error for tools/call without params.name', async () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    const middleware = new McpMiddlewareClass(db);
    const session = middleware.createSession({ tenantId: 'test-tenant' });

    const msg = {
      jsonrpc: '2.0' as const,
      id: 7,
      method: 'tools/call',
      params: { /* no name */ arguments: {} },
    };

    const { response, forward } = await middleware.interceptMessage(msg as any, session);
    assert.strictEqual(forward, false);
    assert.ok(response?.error);
    assert.strictEqual(response!.error!.code, McpErrorCode.InvalidParams);
  });

  it('session persists to DB and can be retrieved', async () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    await db.initialize();
    const middleware = new McpMiddlewareClass(db);

    const session = middleware.createSession({
      tenantId: 'persist-tenant',
      transport: 'stdio',
    });

    // Retrieve from DB via adapter
    // Give fire-and-forget INSERT a moment to complete
    await new Promise(r => setTimeout(r, 50));
    const row = await db.get<{ id: string; tenant_id: string; transport: string }>(
      'SELECT * FROM mcp_sessions WHERE id = ?', [session.id]
    );

    assert.ok(row, 'session should be persisted to DB');
    assert.strictEqual(row!.id, session.id);
    assert.strictEqual(row!.tenant_id, 'persist-tenant');
    assert.strictEqual(row!.transport, 'stdio');
  });

  it('listSessions returns sessions for the correct tenant', async () => {
    const { adapter: db } = createSqliteAdapterFn(':memory:');
    await db.initialize();
    const middleware = new McpMiddlewareClass(db);

    middleware.createSession({ tenantId: 'tenant-A' });
    middleware.createSession({ tenantId: 'tenant-A' });
    middleware.createSession({ tenantId: 'tenant-B' });

    // Give fire-and-forget INSERTs time to complete
    await new Promise(r => setTimeout(r, 100));

    const sessionsA = await middleware.listSessions('tenant-A');
    const sessionsB = await middleware.listSessions('tenant-B');

    assert.strictEqual(sessionsA.length, 2, 'tenant-A should have 2 sessions');
    assert.strictEqual(sessionsB.length, 1, 'tenant-B should have 1 session');
    for (const s of sessionsA) {
      assert.strictEqual(s.tenantId, 'tenant-A');
    }
  });
});

// ─── 2. POST /api/v1/mcp/evaluate ─────────────────────────────────────────

describe('POST /api/v1/mcp/evaluate', () => {
  it('evaluates an allowed MCP tool call (unauthenticated/demo)', async () => {
    const { status, body } = await request('POST', '/api/v1/mcp/evaluate', {
      toolName: 'list_directory',
      arguments: { path: '/tmp' },
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(['allow', 'monitor'].includes(body['decision'] as string), `unexpected decision: ${body['decision']}`);
    assert.strictEqual(body['blocked'], false);
    assert.ok(typeof body['sessionId'] === 'string', 'should return sessionId');
    assert.ok(typeof body['riskScore'] === 'number');
    assert.ok(typeof body['durationMs'] === 'number');
  });

  it('evaluates a blocked MCP tool call and returns MCP error', async () => {
    const { status, body } = await request('POST', '/api/v1/mcp/evaluate', {
      toolName: 'execute_command',
      arguments: { command: 'rm -rf /' },
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.strictEqual(body['decision'], 'block');
    assert.strictEqual(body['blocked'], true);
    assert.ok(body['mcpErrorResponse'], 'should include mcpErrorResponse for blocked tool');

    const errResp = body['mcpErrorResponse'] as Record<string, unknown>;
    assert.strictEqual(errResp['jsonrpc'], '2.0');
    assert.ok(errResp['error'], 'mcpErrorResponse should have error field');
    const err = errResp['error'] as Record<string, unknown>;
    assert.strictEqual(err['code'], -32001, 'should use PolicyBlocked code');
    assert.ok(typeof err['message'] === 'string');
  });

  it('evaluates using a raw MCP JSON-RPC message', async () => {
    const mcpMessage = {
      jsonrpc: '2.0',
      id: 123,
      method: 'tools/call',
      params: { name: 'write_file', arguments: { path: '/etc/hosts', content: 'evil' } },
    };

    const { status, body } = await request('POST', '/api/v1/mcp/evaluate', { mcpMessage });

    assert.equal(status, 200, JSON.stringify(body));
    assert.strictEqual(body['blocked'], true, 'write_file should be blocked');
    const errResp = body['mcpErrorResponse'] as Record<string, unknown>;
    // mcpErrorResponse id should match the original request id
    assert.strictEqual(errResp['id'], 123, 'should carry original request ID');
  });

  it('rejects mcpMessage with non-tools/call method', async () => {
    const mcpMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'file:///tmp/test.txt' },
    };

    const { status, body } = await request('POST', '/api/v1/mcp/evaluate', { mcpMessage });
    assert.equal(status, 400, JSON.stringify(body));
    assert.ok(body['error'], 'should return error for non-tools/call method');
  });

  it('continues an existing session by sessionId', async () => {
    // First call to create a session
    const { body: first } = await request('POST', '/api/v1/mcp/evaluate', {
      toolName: 'read_file',
      arguments: { path: '/tmp/a.txt' },
    });
    const sessionId = first['sessionId'] as string;
    assert.ok(sessionId, 'first call should return sessionId');

    // Second call uses the same session
    const { status, body: second } = await request('POST', '/api/v1/mcp/evaluate', {
      toolName: 'read_file',
      arguments: { path: '/tmp/b.txt' },
      sessionId,
    });
    assert.equal(status, 200);
    assert.strictEqual(second['sessionId'], sessionId, 'should use the same session');
  });

  it('returns 400 for missing toolName', async () => {
    const { status, body } = await request('POST', '/api/v1/mcp/evaluate', {
      arguments: { path: '/tmp/test.txt' },
    });
    assert.equal(status, 400);
    assert.ok(body['error']);
  });

  it('returns 400 for toolName too long', async () => {
    const { status, body } = await request('POST', '/api/v1/mcp/evaluate', {
      toolName: 'a'.repeat(201),
    });
    assert.equal(status, 400);
    assert.ok(body['error']);
  });

  it('applies custom actionMapping from request body', async () => {
    // Map "my_delete_tool" → "execute_command" which is blocked by default policy
    const { status, body } = await request('POST', '/api/v1/mcp/evaluate', {
      toolName: 'my_delete_tool',
      arguments: {},
      actionMapping: { my_delete_tool: 'execute_command' },
    });
    assert.equal(status, 200);
    assert.strictEqual(body['blocked'], true, 'mapped to execute_command should be blocked');
  });

  it('works with tenant API key', async () => {
    const { status, body } = await authedRequest('POST', '/api/v1/mcp/evaluate', {
      toolName: 'read_file',
      arguments: { path: '/tmp/test.txt' },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.strictEqual(body['blocked'], false);
  });
});

// ─── 3. GET /api/v1/mcp/config ────────────────────────────────────────────

describe('GET /api/v1/mcp/config', () => {
  it('requires authentication', async () => {
    const { status } = await request('GET', '/api/v1/mcp/config');
    assert.equal(status, 401);
  });

  it('returns empty list initially', async () => {
    const { status, body } = await authedRequest('GET', '/api/v1/mcp/config');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body['configs']), 'configs should be an array');
    assert.ok(typeof body['count'] === 'number');
  });

  it('returns 404 for unknown config ID', async () => {
    const { status, body } = await authedRequest('GET', '/api/v1/mcp/config?id=nonexistent-id');
    assert.equal(status, 404);
    assert.ok(body['error']);
  });

  it('rejects agent keys (403)', async () => {
    // Create an agent, get its key, try to use it for config
    const { body: agentBody } = await authedRequest('POST', '/api/v1/agents', {
      name: `mcp-test-agent-${RUN}`,
    });
    const agentKey = agentBody['apiKey'] as string;
    assert.ok(agentKey, 'should create agent key');

    const { status } = await request('GET', '/api/v1/mcp/config', undefined, {
      'X-API-Key': agentKey,
    });
    assert.equal(status, 403, 'agent keys should be rejected for config endpoints');
  });
});

// ─── 4. PUT /api/v1/mcp/config ────────────────────────────────────────────

describe('PUT /api/v1/mcp/config', () => {
  it('requires authentication', async () => {
    const { status } = await request('PUT', '/api/v1/mcp/config', {
      name: 'test-config',
    });
    assert.equal(status, 401);
  });

  it('creates a new MCP config', async () => {
    const { status, body } = await authedRequest('PUT', '/api/v1/mcp/config', {
      name: `fs-guarded-${RUN}`,
      upstreamUrl: 'http://localhost:4000/mcp',
      transport: 'sse',
      actionMapping: { write_file: 'file:write', read_file: 'file:read' },
      defaultAction: 'allow',
    });

    assert.equal(status, 201, JSON.stringify(body));
    assert.strictEqual(body['created'], true);
    const config = body['config'] as Record<string, unknown>;
    assert.ok(config['id'], 'should return config id');
    assert.strictEqual(config['name'], `fs-guarded-${RUN}`);
    assert.strictEqual(config['transport'], 'sse');
    assert.strictEqual(config['defaultAction'], 'allow');
    assert.deepStrictEqual(
      config['actionMapping'],
      { write_file: 'file:write', read_file: 'file:read' }
    );
  });

  it('lists the created config', async () => {
    // Create
    const name = `listed-config-${RUN}`;
    await authedRequest('PUT', '/api/v1/mcp/config', { name });

    // List
    const { status, body } = await authedRequest('GET', '/api/v1/mcp/config');
    assert.equal(status, 200);
    const configs = body['configs'] as Array<Record<string, unknown>>;
    const found = configs.find(c => c['name'] === name);
    assert.ok(found, 'created config should appear in list');
  });

  it('retrieves a specific config by ID', async () => {
    const name = `get-by-id-${RUN}`;
    const { body: createBody } = await authedRequest('PUT', '/api/v1/mcp/config', { name });
    const configId = (createBody['config'] as Record<string, unknown>)['id'] as string;

    const { status, body } = await authedRequest('GET', `/api/v1/mcp/config?id=${configId}`);
    assert.equal(status, 200, JSON.stringify(body));
    const config = body['config'] as Record<string, unknown>;
    assert.strictEqual(config['id'], configId);
    assert.strictEqual(config['name'], name);
  });

  it('updates an existing config', async () => {
    const name = `update-me-${RUN}`;
    const { body: createBody } = await authedRequest('PUT', '/api/v1/mcp/config', { name });
    const configId = (createBody['config'] as Record<string, unknown>)['id'] as string;

    // Update it
    const { status, body } = await authedRequest('PUT', '/api/v1/mcp/config', {
      id: configId,
      enabled: false,
      defaultAction: 'block',
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.strictEqual(body['updated'], true);
    const updated = body['config'] as Record<string, unknown>;
    assert.strictEqual(updated['enabled'], false);
    assert.strictEqual(updated['defaultAction'], 'block');
    assert.strictEqual(updated['name'], name, 'name should be unchanged');
  });

  it('returns 404 when updating non-existent config', async () => {
    const { status, body } = await authedRequest('PUT', '/api/v1/mcp/config', {
      id: 'does-not-exist',
      enabled: false,
    });
    assert.equal(status, 404);
    assert.ok(body['error']);
  });

  it('returns 400 when creating without name', async () => {
    const { status, body } = await authedRequest('PUT', '/api/v1/mcp/config', {
      upstreamUrl: 'http://localhost:4000/mcp',
    });
    assert.equal(status, 400);
    assert.ok(body['error']);
  });

  it('returns 400 for invalid upstreamUrl', async () => {
    const { status, body } = await authedRequest('PUT', '/api/v1/mcp/config', {
      name: `bad-url-${RUN}`,
      upstreamUrl: 'not-a-url',
    });
    assert.equal(status, 400);
    assert.ok(body['error']);
  });

  it('returns 400 for invalid transport value', async () => {
    const { status, body } = await authedRequest('PUT', '/api/v1/mcp/config', {
      name: `bad-transport-${RUN}`,
      transport: 'websocket',
    });
    assert.equal(status, 400);
    assert.ok(body['error']);
  });

  it('returns 400 for invalid defaultAction value', async () => {
    const { status, body } = await authedRequest('PUT', '/api/v1/mcp/config', {
      name: `bad-action-${RUN}`,
      defaultAction: 'deny',
    });
    assert.equal(status, 400);
    assert.ok(body['error']);
  });

  it('returns 409 for duplicate config name', async () => {
    const name = `duplicate-${RUN}`;
    await authedRequest('PUT', '/api/v1/mcp/config', { name });
    const { status, body } = await authedRequest('PUT', '/api/v1/mcp/config', { name });
    assert.equal(status, 409);
    assert.ok(body['error']);
  });

  it('creates config with stdio transport', async () => {
    const { status, body } = await authedRequest('PUT', '/api/v1/mcp/config', {
      name: `stdio-config-${RUN}`,
      transport: 'stdio',
    });
    assert.equal(status, 201, JSON.stringify(body));
    const config = body['config'] as Record<string, unknown>;
    assert.strictEqual(config['transport'], 'stdio');
  });
});

// ─── 5. GET /api/v1/mcp/sessions ──────────────────────────────────────────

describe('GET /api/v1/mcp/sessions', () => {
  it('requires authentication', async () => {
    const { status } = await request('GET', '/api/v1/mcp/sessions');
    assert.equal(status, 401);
  });

  it('returns empty list initially (fresh tenant)', async () => {
    // Create a fresh tenant to avoid sessions from other tests
    const freshEmail = `mcp-sessions-tenant-${RUN}@test.local`;
    const { body: signup } = await request('POST', '/api/v1/signup', {
      name: 'Sessions Test Tenant',
      email: freshEmail,
    });
    const freshKey = signup['apiKey'] as string;

    const { status, body } = await request('GET', '/api/v1/mcp/sessions', undefined, {
      'X-API-Key': freshKey,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body['sessions']));
    assert.strictEqual(body['count'], 0);
  });

  it('lists sessions created by /mcp/evaluate calls', async () => {
    // Make a couple of evaluate calls which implicitly create sessions
    await authedRequest('POST', '/api/v1/mcp/evaluate', { toolName: 'read_file' });
    await authedRequest('POST', '/api/v1/mcp/evaluate', { toolName: 'write_file' });

    const { status, body } = await authedRequest('GET', '/api/v1/mcp/sessions');
    assert.equal(status, 200, JSON.stringify(body));
    const sessions = body['sessions'] as Array<Record<string, unknown>>;
    // We should have at least 2 sessions (from this test's evaluate calls)
    // (may be more if other tests shared the same tenant — only assert >= 2)
    assert.ok(sessions.length >= 2, `expected >= 2 sessions, got ${sessions.length}`);

    // Validate session shape
    const s = sessions[0];
    assert.ok(typeof s['id'] === 'string', 'session should have id');
    assert.ok(typeof s['toolCallCount'] === 'number', 'session should have toolCallCount');
    assert.ok(typeof s['blockedCount'] === 'number', 'session should have blockedCount');
    assert.ok(typeof s['createdAt'] === 'string', 'session should have createdAt');
    assert.ok(typeof s['lastActivityAt'] === 'string', 'session should have lastActivityAt');
  });

  it('blocked calls are reflected in blockedCount', async () => {
    // Create a new session via evaluate
    const { body: evalBody } = await authedRequest('POST', '/api/v1/mcp/evaluate', {
      toolName: 'execute_command',
    });
    const sessionId = evalBody['sessionId'] as string;
    assert.ok(sessionId);

    // Call the same session again (allowed)
    await authedRequest('POST', '/api/v1/mcp/evaluate', {
      toolName: 'read_file',
      sessionId,
    });

    // Check session listing
    const { body: sessBody } = await authedRequest('GET', '/api/v1/mcp/sessions');
    const sessions = sessBody['sessions'] as Array<Record<string, unknown>>;
    const targetSession = sessions.find(s => s['id'] === sessionId);
    assert.ok(targetSession, 'the session should appear in listing');
    assert.strictEqual(targetSession!['toolCallCount'], 2, 'should have 2 tool calls');
    assert.strictEqual(targetSession!['blockedCount'], 1, 'should have 1 blocked call');
  });
});

// ─── 6. SDK TypeScript method tests (integration via HTTP) ─────────────────

describe('TypeScript SDK — MCP methods', () => {
  // Dynamically import the SDK client to test its methods
  let AgentGuardClass: typeof import('../packages/sdk/src/sdk/client.js').AgentGuard;

  before(async () => {
    const mod = await import('../packages/sdk/src/sdk/client.js');
    AgentGuardClass = mod.AgentGuard;
  });

  it('evaluateMcp() allows safe tool', async () => {
    const client = new AgentGuardClass({
      apiKey: tenantApiKey,
      baseUrl: BASE,
    });

    const result = await client.evaluateMcp('search_files', {
      arguments: { query: 'test' },
    });

    assert.ok(['allow', 'monitor'].includes(result.decision));
    assert.strictEqual(result.blocked, false);
    assert.ok(typeof result.sessionId === 'string');
    assert.ok(typeof result.riskScore === 'number');
    assert.ok(typeof result.durationMs === 'number');
  });

  it('evaluateMcp() blocks dangerous tool', async () => {
    const client = new AgentGuardClass({
      apiKey: tenantApiKey,
      baseUrl: BASE,
    });

    const result = await client.evaluateMcp('bash', {
      arguments: { command: 'cat /etc/passwd' },
    });

    assert.strictEqual(result.decision, 'block');
    assert.strictEqual(result.blocked, true);
    assert.ok(result.mcpErrorResponse, 'should include mcpErrorResponse');
    assert.strictEqual(result.mcpErrorResponse!.jsonrpc, '2.0');
    assert.ok(result.mcpErrorResponse!.error.code === -32001);
  });

  it('evaluateMcp() propagates sessionId', async () => {
    const client = new AgentGuardClass({
      apiKey: tenantApiKey,
      baseUrl: BASE,
    });

    const first = await client.evaluateMcp('read_file');
    const sessionId = first.sessionId;

    const second = await client.evaluateMcp('list_directory', { sessionId });
    assert.strictEqual(second.sessionId, sessionId, 'should reuse session');
  });

  it('getMcpConfig() returns all configs', async () => {
    const client = new AgentGuardClass({
      apiKey: tenantApiKey,
      baseUrl: BASE,
    });

    const result = await client.getMcpConfig();
    assert.ok(Array.isArray(result.configs));
    assert.ok(typeof result.count === 'number');
  });

  it('setMcpConfig() creates a config', async () => {
    const client = new AgentGuardClass({
      apiKey: tenantApiKey,
      baseUrl: BASE,
    });

    const configName = `sdk-config-${RUN}`;
    const result = await client.setMcpConfig({
      name: configName,
      transport: 'sse',
      defaultAction: 'allow',
      actionMapping: { my_tool: 'safe:action' },
    });

    assert.strictEqual(result.created, true);
    assert.strictEqual(result.config.name, configName);
    assert.strictEqual(result.config.transport, 'sse');
  });

  it('setMcpConfig() updates a config', async () => {
    const client = new AgentGuardClass({
      apiKey: tenantApiKey,
      baseUrl: BASE,
    });

    const { config: created } = await client.setMcpConfig({
      name: `sdk-update-${RUN}`,
    });

    const { config: updated, updated: wasUpdated } = await client.setMcpConfig({
      id: created.id,
      enabled: false,
    });

    assert.strictEqual(wasUpdated, true);
    assert.strictEqual(updated.enabled, false);
  });

  it('getMcpConfig() retrieves specific config by ID', async () => {
    const client = new AgentGuardClass({
      apiKey: tenantApiKey,
      baseUrl: BASE,
    });

    const { config: created } = await client.setMcpConfig({ name: `sdk-get-${RUN}` });
    const { config: fetched } = await client.getMcpConfig(created.id);

    assert.strictEqual(fetched.id, created.id);
    assert.strictEqual(fetched.name, created.name);
  });

  it('listMcpSessions() returns sessions', async () => {
    const client = new AgentGuardClass({
      apiKey: tenantApiKey,
      baseUrl: BASE,
    });

    const result = await client.listMcpSessions();
    assert.ok(Array.isArray(result.sessions));
    assert.ok(typeof result.count === 'number');
  });
});

// ─── 7. End-to-end MCP interception flow ──────────────────────────────────

describe('MCP end-to-end flow', () => {
  it('simulates a full MCP tool interception cycle', async () => {
    // 1. Configure a proxy
    const { body: configBody } = await authedRequest('PUT', '/api/v1/mcp/config', {
      name: `e2e-config-${RUN}`,
      transport: 'sse',
      actionMapping: {
        write_file: 'file:write',
        read_file: 'file:read',
        run_command: 'execute_command',
      },
      defaultAction: 'allow',
    });
    assert.equal(configBody['created'], true);
    const configId = (configBody['config'] as Record<string, unknown>)['id'] as string;

    // 2. Safe tool — should be allowed
    const { body: allowBody } = await authedRequest('POST', '/api/v1/mcp/evaluate', {
      toolName: 'read_file',
      arguments: { path: '/tmp/test.txt' },
      actionMapping: { read_file: 'file:read' },
    });
    assert.strictEqual(allowBody['blocked'], false, 'read_file should be allowed');
    const sessionId = allowBody['sessionId'] as string;

    // 3. Dangerous tool (via mapping) — should be blocked
    const { body: blockBody } = await authedRequest('POST', '/api/v1/mcp/evaluate', {
      toolName: 'run_command',
      arguments: { cmd: 'rm -rf /' },
      actionMapping: { run_command: 'execute_command' },
      sessionId,
    });
    assert.strictEqual(blockBody['blocked'], true, 'run_command (mapped to execute_command) should be blocked');
    assert.ok(blockBody['mcpErrorResponse'], 'blocked call should have mcpErrorResponse');

    // 4. Session should show both calls
    const { body: sessBody } = await authedRequest('GET', '/api/v1/mcp/sessions');
    const sessions = sessBody['sessions'] as Array<Record<string, unknown>>;
    const targetSession = sessions.find(s => s['id'] === sessionId);
    assert.ok(targetSession, 'session should be listed');
    assert.strictEqual(targetSession!['toolCallCount'], 2, 'should have 2 calls in session');
    assert.strictEqual(targetSession!['blockedCount'], 1, 'should have 1 block in session');

    // 5. Verify the config is queryable
    const { body: getConfigBody } = await authedRequest('GET', `/api/v1/mcp/config?id=${configId}`);
    assert.ok((getConfigBody['config'] as Record<string, unknown>)['id'] === configId);

    // 6. Disable the config
    const { body: updateBody } = await authedRequest('PUT', '/api/v1/mcp/config', {
      id: configId,
      enabled: false,
    });
    assert.strictEqual((updateBody['config'] as Record<string, unknown>)['enabled'], false);
  });

  it('MCP tool call audit is reflected in sessions immediately', async () => {
    // Make a fresh evaluate call
    const { body: evalBody } = await authedRequest('POST', '/api/v1/mcp/evaluate', {
      toolName: 'shell_exec',
    });
    assert.strictEqual(evalBody['blocked'], true);
    const sessionId = evalBody['sessionId'] as string;

    // Immediately list sessions and find ours
    const { body: listBody } = await authedRequest('GET', '/api/v1/mcp/sessions');
    const sessions = listBody['sessions'] as Array<Record<string, unknown>>;
    const found = sessions.find(s => s['id'] === sessionId);
    assert.ok(found, 'session should appear in listing immediately');
    assert.ok((found!['blockedCount'] as number) >= 1, 'blocked count should be at least 1');
  });
});
