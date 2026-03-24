/**
 * E2E: Human-in-the-Loop (HITL) gate tests
 *
 * - Evaluate creates pending approval
 * - GET approvals returns the pending one
 * - POST approve resolves it
 * - Subsequent evaluate passes (gate is resolved)
 * - Double-resolve returns 409
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

describe('HITL Gate Flow — real HTTP + DB', () => {
  it('POST evaluate with require_approval policy creates a HITL gate', async () => {
    if (shouldSkip()) return;
    const agent = seed.tenantAlpha.agents.find((a) => a.policyName === 'require-approval')!;
    const sessionId = `hitl-flow-${uid()}`;

    const evalRes = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId,
        tool: 'dangerous_tool',
        params: { target: 'critical-service' },
      },
    });

    expect(evalRes.status).toBe(200);
    const evalBody = evalRes.body as Record<string, unknown>;
    expect(evalBody['result']).toBe('require_approval');
    expect(evalBody['gateId']).toBeTruthy();

    const gateId = evalBody['gateId'] as string;

    // Wait for async gate creation
    await new Promise((r) => setTimeout(r, 300));

    // Verify gate in DB
    const gate = await prisma.hITLGate.findUnique({ where: { id: gateId } });
    expect(gate).not.toBeNull();
    expect(gate!.status).toBe('PENDING');
    expect(gate!.tenantId).toBe(seed.tenantAlpha.id);
    expect(gate!.agentId).toBe(agent.id);
  });

  it('GET /v1/hitl/pending lists pending gates', async () => {
    if (shouldSkip()) return;
    const agent = seed.tenantAlpha.agents.find((a) => a.policyName === 'require-approval')!;

    // Create a gate
    const evalRes = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId: `hitl-list-${uid()}`,
        tool: 'dangerous_tool',
        params: {},
      },
    });
    expect(evalRes.status).toBe(200);
    const gateId = (evalRes.body as Record<string, unknown>)['gateId'] as string;
    await new Promise((r) => setTimeout(r, 300));

    // List pending gates
    const listRes = await request('/v1/hitl/pending', { jwt: seed.tenantAlpha.jwt });
    expect(listRes.status).toBe(200);
    const body = listRes.body as Record<string, unknown>;
    const gates = body['data'] as Array<Record<string, unknown>>;
    expect(Array.isArray(gates)).toBe(true);

    // Our gate should be in the list
    const found = gates.find((g) => g['id'] === gateId);
    expect(found).toBeDefined();
    expect(found!['status']).toBe('PENDING');
  });

  it('POST /v1/hitl/:gateId/approve resolves the gate', async () => {
    if (shouldSkip()) return;
    const agent = seed.tenantAlpha.agents.find((a) => a.policyName === 'require-approval')!;

    // Create a gate
    const evalRes = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId: `hitl-approve-${uid()}`,
        tool: 'dangerous_tool',
        params: {},
      },
    });
    expect(evalRes.status).toBe(200);
    const gateId = (evalRes.body as Record<string, unknown>)['gateId'] as string;
    await new Promise((r) => setTimeout(r, 300));

    // Approve the gate
    const approveRes = await request(`/v1/hitl/${gateId}/approve`, {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: { note: 'E2E test approval' },
    });
    expect([200, 201]).toContain(approveRes.status);

    // Verify gate is resolved in DB
    const gate = await prisma.hITLGate.findUnique({ where: { id: gateId } });
    expect(gate).not.toBeNull();
    expect(gate!.status).toBe('APPROVED');
    expect(gate!.decidedAt).not.toBeNull();
  });

  it('POST /v1/hitl/:gateId/reject resolves gate as rejected', async () => {
    if (shouldSkip()) return;
    const agent = seed.tenantAlpha.agents.find((a) => a.policyName === 'require-approval')!;

    const evalRes = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId: `hitl-reject-${uid()}`,
        tool: 'dangerous_tool',
        params: {},
      },
    });
    expect(evalRes.status).toBe(200);
    const gateId = (evalRes.body as Record<string, unknown>)['gateId'] as string;
    await new Promise((r) => setTimeout(r, 300));

    // Reject the gate
    const rejectRes = await request(`/v1/hitl/${gateId}/reject`, {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: { note: 'E2E test rejection' },
    });
    expect([200, 201]).toContain(rejectRes.status);

    const gate = await prisma.hITLGate.findUnique({ where: { id: gateId } });
    expect(gate!.status).toBe('REJECTED');
  });

  it('Double-resolve returns error (400/409/422)', async () => {
    if (shouldSkip()) return;
    const agent = seed.tenantAlpha.agents.find((a) => a.policyName === 'require-approval')!;

    const evalRes = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId: `hitl-double-${uid()}`,
        tool: 'dangerous_tool',
        params: {},
      },
    });
    const gateId = (evalRes.body as Record<string, unknown>)['gateId'] as string;
    await new Promise((r) => setTimeout(r, 300));

    // First approval succeeds
    const first = await request(`/v1/hitl/${gateId}/approve`, {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: { note: 'first approval' },
    });
    expect([200, 201]).toContain(first.status);

    // Second approval should fail (gate already resolved)
    const second = await request(`/v1/hitl/${gateId}/approve`, {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: { note: 'double approval' },
    });
    // Service throws ValidationError (400) when gate is already resolved
    expect([400, 409, 422]).toContain(second.status);
  });

  it('GET /v1/hitl/:gateId returns gate details', async () => {
    if (shouldSkip()) return;
    const agent = seed.tenantAlpha.agents.find((a) => a.policyName === 'require-approval')!;

    const evalRes = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: agent.id,
        sessionId: `hitl-get-${uid()}`,
        tool: 'dangerous_tool',
        params: { detail: 'test' },
      },
    });
    const gateId = (evalRes.body as Record<string, unknown>)['gateId'] as string;
    await new Promise((r) => setTimeout(r, 300));

    const getRes = await request(`/v1/hitl/${gateId}`, { jwt: seed.tenantAlpha.jwt });
    expect(getRes.status).toBe(200);
    const body = getRes.body as Record<string, unknown>;
    expect(body['id']).toBe(gateId);
    expect(body['status']).toBe('PENDING');
    expect(body['agentId']).toBe(agent.id);
  });

  it('Cross-tenant: alpha cannot access beta HITL gates', async () => {
    if (shouldSkip()) return;

    // Check any beta-tenant gate (from DB direct lookup)
    const betaGate = await prisma.hITLGate.findFirst({
      where: { tenantId: seed.tenantAlpha.id }, // same tenant, we just check routing works
    });
    if (!betaGate) return;

    // Try to access with a new tenant's JWT (just an unrelated tenantId)
    const { makeJWT: _makeJWT } = await import('./setup.js');
    const otherJwt = await _makeJWT({
      tenantId: 'totally-different-tenant-id',
      userId: 'other-user',
      role: 'owner',
    });
    const res = await request(`/v1/hitl/${betaGate.id}`, { jwt: otherJwt });
    expect([403, 404]).toContain(res.status);
  });
});
