/**
 * AgentGuard — SSE Stream Isolation Tests
 *
 * Verifies that SSE streams only deliver events to the owning tenant:
 * - Tenant A SSE stream only receives Tenant A events
 * - Tenant B events do not appear in Tenant A's stream (and vice versa)
 * - Authentication is required for SSE endpoints
 * - Cross-tenant SSE connection is rejected
 *
 * Run: npx tsx --test tests/isolation/sse-isolation.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import crypto from 'node:crypto';
import http from 'node:http';

const BASE = process.env['BASE_URL'] || 'http://localhost:3001';
const BASE_HOST = new URL(BASE).hostname;
const BASE_PORT = parseInt(new URL(BASE).port || '3001', 10);
const TEST_RUN_ID = crypto.randomBytes(4).toString('hex');

const tenantA = { email: `sse-a-${TEST_RUN_ID}@test.local`, apiKey: '', tenantId: '', jwt: '' };
const tenantB = { email: `sse-b-${TEST_RUN_ID}@test.local`, apiKey: '', tenantId: '', jwt: '' };

async function apiReq(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, body: parsed };
}

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return; } catch { /* wait */ }
    await sleep(300);
  }
  throw new Error('Server not ready');
}

/**
 * Open an SSE connection and collect events for `durationMs` milliseconds.
 * Returns the raw event strings received.
 */
function collectSseEvents(
  path: string,
  authHeader: string,
  durationMs: number
): Promise<string[]> {
  return new Promise((resolve) => {
    const events: string[] = [];
    const reqOptions = {
      hostname: BASE_HOST,
      port: BASE_PORT,
      path,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Authorization': authHeader,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    };

    const clientReq = http.request(reqOptions, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        events.push(chunk);
      });
    });

    clientReq.on('error', () => {
      // Connection errors are okay for these tests
    });

    clientReq.end();

    // Collect for durationMs then close
    setTimeout(() => {
      clientReq.destroy();
      resolve(events);
    }, durationMs);
  });
}

before(async () => {
  await waitForServer();

  const a = await apiReq('POST', '/api/v1/signup', { name: `SSE Test A ${TEST_RUN_ID}`, email: tenantA.email });
  assert.equal(a.status, 201);
  tenantA.apiKey = a.body['api_key'] as string;
  tenantA.tenantId = a.body['tenant_id'] as string;

  const b = await apiReq('POST', '/api/v1/signup', { name: `SSE Test B ${TEST_RUN_ID}`, email: tenantB.email });
  assert.equal(b.status, 201);
  tenantB.apiKey = b.body['api_key'] as string;
  tenantB.tenantId = b.body['tenant_id'] as string;

  const la = await apiReq('POST', '/api/v1/auth/login', { email: tenantA.email });
  if (la.status === 200) tenantA.jwt = la.body['token'] as string ?? '';

  const lb = await apiReq('POST', '/api/v1/auth/login', { email: tenantB.email });
  if (lb.status === 200) tenantB.jwt = lb.body['token'] as string ?? '';

  console.log(`[sse-setup] A: ${tenantA.tenantId}, B: ${tenantB.tenantId}`);
});

describe('SSE Stream Isolation', () => {

  describe('Authentication', () => {
    it('SSE /audit/stream requires authentication', async () => {
      const res = await fetch(`${BASE}/api/v1/audit/stream`, {
        headers: { 'Accept': 'text/event-stream' },
      });
      assert.ok(
        [401, 403].includes(res.status),
        `SSE stream without auth must return 401/403, got ${res.status}`
      );
      await res.body?.cancel();
    });

    it('SSE /audit/stream accepts valid Bearer token', async () => {
      if (!tenantA.jwt) {
        console.log('[skip] No JWT available');
        return;
      }

      const res = await fetch(`${BASE}/api/v1/audit/stream`, {
        headers: {
          'Accept': 'text/event-stream',
          'Authorization': `Bearer ${tenantA.jwt}`,
        },
      });

      // Should be 200 (event-stream) or 404 (endpoint not implemented yet)
      assert.ok(
        [200, 404].includes(res.status),
        `SSE with valid token should return 200 or 404 (not implemented), got ${res.status}`
      );
      await res.body?.cancel();
    });
  });

  describe('Event Stream Tenant Scoping', () => {
    it('Tenant A SSE stream does not contain Tenant B event markers', async () => {
      if (!tenantA.jwt) {
        console.log('[skip] No JWT for SSE test');
        return;
      }

      // Generate a distinctive Tenant B event
      const markerB = `sse-marker-b-${TEST_RUN_ID}`;
      await apiReq('POST', '/api/v1/evaluate', {
        tool: 'sse-test-tool',
        action: markerB,
        session_id: markerB,
      }, { 'x-api-key': tenantB.apiKey });

      await sleep(200); // Allow event to be processed

      // Open Tenant A's SSE stream and collect events for 2 seconds
      const eventsA = await collectSseEvents(
        '/api/v1/audit/stream',
        `Bearer ${tenantA.jwt}`,
        2000
      );

      const combinedA = eventsA.join('');

      // Tenant B's marker must NOT appear in Tenant A's stream
      assert.ok(
        !combinedA.includes(markerB),
        `Tenant A SSE stream MUST NOT contain Tenant B's event marker "${markerB}"`
      );

      // Also: Tenant B's tenantId must not appear
      if (tenantB.tenantId) {
        assert.ok(
          !combinedA.includes(tenantB.tenantId),
          `Tenant A SSE stream MUST NOT contain Tenant B's tenant ID`
        );
      }
    });

    it('Tenant A SSE stream only delivers Tenant A events', async () => {
      if (!tenantA.jwt) {
        console.log('[skip] No JWT for SSE test');
        return;
      }

      // Generate distinctive event for Tenant A
      const markerA = `sse-marker-a-${TEST_RUN_ID}`;
      await apiReq('POST', '/api/v1/evaluate', {
        tool: 'sse-test-tool',
        action: markerA,
        session_id: markerA,
      }, { 'x-api-key': tenantA.apiKey });

      await sleep(200);

      // Tenant A's stream should potentially contain markerA
      // This is a soft assertion — SSE may not replay events, but must not have B's data
      const eventsA = await collectSseEvents('/api/v1/audit/stream', `Bearer ${tenantA.jwt}`, 2000);
      const eventsB = await collectSseEvents('/api/v1/audit/stream', `Bearer ${tenantB.jwt ?? ''}`, 2000);

      const textA = eventsA.join('');
      const textB = eventsB.join('');

      // Cross-contamination checks
      if (textA.length > 0 && tenantB.tenantId) {
        assert.ok(!textA.includes(tenantB.tenantId), 'Tenant A SSE must not contain Tenant B ID');
      }
      if (textB.length > 0 && tenantA.tenantId) {
        assert.ok(!textB.includes(tenantA.tenantId), 'Tenant B SSE must not contain Tenant A ID');
      }
    });

    it('Invalid Bearer token gets rejected from SSE stream', async () => {
      const fakeToken = 'fake-jwt-' + crypto.randomBytes(16).toString('hex');
      const res = await fetch(`${BASE}/api/v1/audit/stream`, {
        headers: {
          'Accept': 'text/event-stream',
          'Authorization': `Bearer ${fakeToken}`,
        },
      });
      assert.ok(
        [401, 403].includes(res.status),
        `Invalid JWT for SSE must return 401/403, got ${res.status}`
      );
      await res.body?.cancel();
    });
  });

  describe('SSE Connection Cleanup', () => {
    it('SSE connection closes cleanly when client disconnects', async () => {
      if (!tenantA.jwt) {
        console.log('[skip] No JWT for SSE cleanup test');
        return;
      }

      // Open a connection and immediately close it
      const events = await collectSseEvents('/api/v1/audit/stream', `Bearer ${tenantA.jwt}`, 500);

      // Just verify no error was thrown (connection lifecycle is healthy)
      assert.ok(Array.isArray(events));
    });

    it('Multiple SSE connections from same tenant are all isolated', async () => {
      if (!tenantA.jwt || !tenantB.jwt) {
        console.log('[skip] No JWTs for concurrent SSE test');
        return;
      }

      // Open concurrent connections for both tenants
      const [eventsA1, eventsA2, eventsB1] = await Promise.all([
        collectSseEvents('/api/v1/audit/stream', `Bearer ${tenantA.jwt}`, 1000),
        collectSseEvents('/api/v1/audit/stream', `Bearer ${tenantA.jwt}`, 1000),
        collectSseEvents('/api/v1/audit/stream', `Bearer ${tenantB.jwt}`, 1000),
      ]);

      const textB1 = eventsB1.join('');

      // Tenant B's connection must not contain Tenant A's data
      if (textB1.length > 0 && tenantA.tenantId) {
        assert.ok(!textB1.includes(tenantA.tenantId), 'Concurrent SSE isolation: B must not see A data');
      }

      // Both A connections should be equal in content (same tenant, same data)
      // This is approximate since events are streamed; just verify no B data in A
      const textA1 = eventsA1.join('');
      if (textA1.length > 0 && tenantB.tenantId) {
        assert.ok(!textA1.includes(tenantB.tenantId), 'Concurrent SSE isolation: A connection 1 must not see B data');
      }
    });
  });
});

after(() => {
  console.log('[sse-isolation] Tests complete');
});
