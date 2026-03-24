/**
 * E2E: Policy Evaluation tests
 *
 * - Allow policy → 200 with allow decision
 * - Block policy → 200 with block decision
 * - HITL policy → 200 with require_approval + real HITL gate in DB
 * - Kill switch active → 403 with block decision
 * - Verify audit events created in DB after each evaluate
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request, requireServer, shouldSkip, uid } from './setup.js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
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
let pool: Pool;
let prisma: PrismaClient;

beforeAll(async () => {
  await requireServer();
  if (shouldSkip()) return;

  const seedPath = join(__dirname, '.seed-data.json');
  if (!existsSync(seedPath)) {
    throw new Error('Seed data not found. Run: npx tsx tests/e2e/seed.ts');
  }
  seed = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedData;

  const dbUrl =
    process.env['DATABASE_URL'] ?? 'postgresql://test:test@localhost:5433/agentguard_test';
  pool = new Pool({ connectionString: dbUrl, max: 3 });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
});

function getAgent(policyName: string) {
  return seed.tenantAlpha.agents.find((a) => a.policyName === policyName)!;
}

describe('Policy Evaluation — real HTTP + DB', () => {
  it('Allow policy: evaluate returns 200 with result=allow', async () => {
    if (shouldSkip()) return;
    const agent = getAgent('allow-all');
    const sessionId = `eval-allow-${uid()}`;

    const res = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId,
        tool: 'read_file',
        params: { path: '/tmp/safe.txt' },
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body['result']).toBe('allow');
    expect(body['evaluatedAt']).toBeDefined();
    expect(typeof body['riskScore']).toBe('number');
  });

  it('Block policy: evaluate returns 200 with result=block', async () => {
    if (shouldSkip()) return;
    const agent = getAgent('block-all');
    const sessionId = `eval-block-${uid()}`;

    const res = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId,
        tool: 'read_file',
        params: { path: '/tmp/file.txt' },
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body['result']).toBe('block');
  });

  it('Require-approval policy: evaluate returns 200 with result=require_approval on matching tool', async () => {
    if (shouldSkip()) return;
    const agent = getAgent('require-approval');
    const sessionId = `eval-hitl-${uid()}`;

    const res = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId,
        tool: 'dangerous_tool', // matches the require_approval rule
        params: { target: 'production-db' },
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body['result']).toBe('require_approval');
    expect(body['gateId']).toBeTruthy();

    // ── Verify HITL gate was created in DB ─────────────────────────────────
    await new Promise((r) => setTimeout(r, 300)); // let async persist complete
    const gateId = body['gateId'] as string;
    const gate = await prisma.hITLGate.findUnique({ where: { id: gateId } });
    expect(gate).not.toBeNull();
    expect(gate!.tenantId).toBe(seed.tenantAlpha.id);
    expect(gate!.agentId).toBe(agent.id);
    expect(gate!.status).toBe('PENDING');
  });

  it('Require-approval policy: non-matching tool gets allow (default)', async () => {
    if (shouldSkip()) return;
    const agent = getAgent('require-approval');
    const sessionId = `eval-allow-default-${uid()}`;

    const res = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId,
        tool: 'list_files', // does NOT match require_approval rule
        params: { path: '/tmp' },
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    // Policy default is 'allow', so this tool should be allowed
    expect(body['result']).toBe('allow');
  });

  it('Kill switch: halted agent returns 403 with block result', async () => {
    if (shouldSkip()) return;

    // Create a dedicated agent for kill switch test
    const createRes = await request('/v1/agents', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        name: `e2e-killswitch-agent-${uid()}`,
        failBehavior: 'OPEN', // fail-open so without kill switch it would allow
        riskTier: 'LOW',
      },
    });
    expect(createRes.status).toBe(201);
    const agentId = ((createRes.body as Record<string, unknown>)['agent'] as Record<string, unknown>)['id'] as string;

    // Issue a kill switch
    const killRes = await request(`/v1/killswitch/halt/${agentId}`, {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: { tier: 'HARD', reason: 'E2E test kill switch' },
    });
    expect(killRes.status).toBe(201);

    // Small delay for Redis to persist
    await new Promise((r) => setTimeout(r, 200));

    // Evaluate should return 403 with block
    const evalRes = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId,
        sessionId: `kill-test-${uid()}`,
        tool: 'any_tool',
        params: {},
      },
    });

    expect(evalRes.status).toBe(403);
    const body = evalRes.body as Record<string, unknown>;
    expect(body['result']).toBe('block');
    expect(body['killSwitch']).toBeDefined();

    // Clean up: resume agent
    await request(`/v1/killswitch/resume/${agentId}`, {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: { reason: 'E2E test cleanup' },
    });
  });

  it('Evaluate creates audit event in DB (async)', async () => {
    if (shouldSkip()) return;
    const agent = getAgent('allow-all');
    const sessionId = `eval-audit-${uid()}`;

    await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId,
        tool: 'write_file',
        params: { path: '/tmp/log.txt', content: 'test' },
      },
    });

    // Wait for async audit log to persist
    await new Promise((r) => setTimeout(r, 800));

    // Check audit events in DB
    const events = await prisma.auditEvent.findMany({
      where: { agentId: agent.id, sessionId },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.tenantId).toBe(seed.tenantAlpha.id);
    expect(events[0]!.toolName).toBe('write_file');
  });

  it('Agent API key auth also works for evaluate', async () => {
    if (shouldSkip()) return;
    const agent = getAgent('allow-all');

    const res = await request('/v1/actions/evaluate', {
      method: 'POST',
      apiKey: agent.apiKey,
      body: {
        agentId: agent.id,
        sessionId: `apikey-eval-${uid()}`,
        tool: 'ping',
        params: {},
      },
    });

    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>)['result']).toBeDefined();
  });

  it('Evaluate on non-existent agent returns 4xx', async () => {
    if (shouldSkip()) return;
    const res = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: 'nonexistent-agent-id-xyz',
        sessionId: `bad-agent-${uid()}`,
        tool: 'read_file',
        params: {},
      },
    });
    // Should get some error, not a 200
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
