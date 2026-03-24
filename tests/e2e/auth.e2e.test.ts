/**
 * E2E: Authentication tests
 *
 * Real HTTP requests to a live server. Tests that:
 *  - Valid API key returns 200
 *  - Invalid API key returns 401
 *  - Expired JWT returns 401
 *  - Missing auth returns 401
 *  - Wrong format returns 401
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { request, makeJWT, makeExpiredJWT, requireServer, shouldSkip, uid } from './setup.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SeedData {
  tenantAlpha: {
    id: string;
    slug: string;
    jwt: string;
    agents: Array<{ id: string; apiKey: string; policyName: string }>;
    policies: { allowAll: string; blockAll: string; requireApproval: string };
  };
}

let seed: SeedData;
let validJwt: string;
let validApiKey: string;
let agentId: string;

beforeAll(async () => {
  await requireServer();
  if (shouldSkip()) return;

  const seedPath = join(__dirname, '.seed-data.json');
  if (!existsSync(seedPath)) {
    throw new Error('Seed data not found. Run: npx tsx tests/e2e/seed.ts');
  }
  seed = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedData;
  validJwt = seed.tenantAlpha.jwt;

  // Use the allow-all agent for auth tests (no policy block)
  const allowAgent = seed.tenantAlpha.agents.find((a) => a.policyName === 'allow-all');
  if (!allowAgent) throw new Error('allow-all agent not found in seed data');
  validApiKey = allowAgent.apiKey;
  agentId = allowAgent.id;
});

describe('Authentication — real HTTP', () => {
  it('GET /v1/health requires no auth and returns 200', async () => {
    if (shouldSkip()) return;
    const res = await request('/v1/health');
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>)['status']).toBe('ok');
  });

  it('Missing Authorization header returns 401', async () => {
    if (shouldSkip()) return;
    const res = await request('/v1/agents');
    expect(res.status).toBe(401);
  });

  it('Invalid API key returns 401', async () => {
    if (shouldSkip()) return;
    const res = await request('/v1/agents', {
      apiKey: 'ag_live_this_is_totally_invalid_key_xyz',
    });
    expect(res.status).toBe(401);
  });

  it('Malformed Authorization header (no prefix) returns 401', async () => {
    if (shouldSkip()) return;
    const res = await request('/v1/agents', {
      headers: { Authorization: 'justaplaintoken' },
    });
    expect(res.status).toBe(401);
  });

  it('Expired JWT returns 401', async () => {
    if (shouldSkip()) return;
    const expiredJwt = await makeExpiredJWT({
      tenantId: seed.tenantAlpha.id,
      userId: `user-${uid()}`,
      role: 'owner',
    });
    const res = await request('/v1/agents', { jwt: expiredJwt });
    expect(res.status).toBe(401);
  });

  it('JWT with missing tenantId claim returns 401', async () => {
    if (shouldSkip()) return;
    // Sign a JWT without tenantId
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(
      process.env['JWT_SECRET'] ?? 'test-jwt-secret-for-e2e-only',
    );
    const badJwt = await new SignJWT({ sub: 'user-abc', role: 'owner' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);

    const res = await request('/v1/agents', { jwt: badJwt });
    expect(res.status).toBe(401);
  });

  it('JWT signed with wrong secret returns 401', async () => {
    if (shouldSkip()) return;
    const { SignJWT } = await import('jose');
    const wrongSecret = new TextEncoder().encode('completely-wrong-secret-12345678');
    const badJwt = await new SignJWT({
      sub: 'user-abc',
      tenantId: seed.tenantAlpha.id,
      role: 'owner',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(wrongSecret);

    const res = await request('/v1/agents', { jwt: badJwt });
    expect(res.status).toBe(401);
  });

  it('Valid JWT (admin role) returns 200 on /v1/agents', async () => {
    if (shouldSkip()) return;
    const res = await request('/v1/agents', { jwt: validJwt });
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>)['data']).toBeDefined();
  });

  it('Valid agent API key authenticates and gets agent-scoped access', async () => {
    if (shouldSkip()) return;
    // Agent API keys are used for evaluate calls
    const res = await request('/v1/actions/evaluate', {
      method: 'POST',
      apiKey: validApiKey,
      body: {
        agentId,
        sessionId: `auth-test-session-${uid()}`,
        tool: 'read_file',
        params: { path: '/tmp/test.txt' },
      },
    });
    // Should get a policy decision (200) not a 401
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>)['result']).toBeDefined();
  });

  it('Valid JWT can also call evaluate', async () => {
    if (shouldSkip()) return;
    const res = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: validJwt,
      body: {
        agentId,
        sessionId: `auth-test-session-${uid()}`,
        tool: 'list_files',
        params: {},
      },
    });
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>)['result']).toBeDefined();
  });

  it('Analyst role JWT can read data (non-mutating operations)', async () => {
    if (shouldSkip()) return;
    const analystJwt = await makeJWT({
      tenantId: seed.tenantAlpha.id,
      userId: `analyst-${uid()}`,
      role: 'analyst',
    });
    const res = await request('/v1/agents', { jwt: analystJwt });
    expect(res.status).toBe(200);
  });
});
