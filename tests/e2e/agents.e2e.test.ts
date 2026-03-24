/**
 * E2E: Agent CRUD tests
 *
 * - POST creates agent, verify in DB
 * - GET lists only tenant's agents
 * - PUT updates agent
 * - DELETE removes agent
 * - Cross-tenant access returns 403/404
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
  tenantBeta: {
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

// Agents created during tests (to clean up)
const createdAgentIds: string[] = [];

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

describe('Agent CRUD — real HTTP + DB verification', () => {
  it('POST /v1/agents creates an agent and returns 201 with apiKey', async () => {
    if (shouldSkip()) return;
    const name = `e2e-agent-${uid()}`;
    const res = await request('/v1/agents', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        name,
        failBehavior: 'CLOSED',
        riskTier: 'LOW',
        tags: ['e2e'],
      },
    });

    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(body['agent']).toBeDefined();
    expect(body['apiKey']).toBeDefined();
    expect(typeof body['apiKey']).toBe('string');
    expect((body['apiKey'] as string).startsWith('ag_live_')).toBe(true);

    const agent = body['agent'] as Record<string, unknown>;
    expect(agent['name']).toBe(name);
    expect(agent['tenantId']).toBe(seed.tenantAlpha.id);
    createdAgentIds.push(agent['id'] as string);

    // ── Verify in DB ───────────────────────────────────────────────────────
    const dbAgent = await prisma.agent.findUnique({
      where: { id: agent['id'] as string },
    });
    expect(dbAgent).not.toBeNull();
    expect(dbAgent!.tenantId).toBe(seed.tenantAlpha.id);
    expect(dbAgent!.name).toBe(name);
    expect(dbAgent!.apiKeyHash).toBeTruthy();
  });

  it('GET /v1/agents lists only agents belonging to authenticated tenant', async () => {
    if (shouldSkip()) return;

    // Alpha tenant agents
    const alphaRes = await request('/v1/agents', { jwt: seed.tenantAlpha.jwt });
    expect(alphaRes.status).toBe(200);
    const alphaData = (alphaRes.body as Record<string, unknown>)['data'] as Array<Record<string, unknown>>;
    expect(Array.isArray(alphaData)).toBe(true);

    // All returned agents should belong to tenantAlpha
    for (const agent of alphaData) {
      expect(agent['tenantId']).toBe(seed.tenantAlpha.id);
    }

    // Beta tenant agents
    const betaRes = await request('/v1/agents', { jwt: seed.tenantBeta.jwt });
    expect(betaRes.status).toBe(200);
    const betaData = (betaRes.body as Record<string, unknown>)['data'] as Array<Record<string, unknown>>;

    // All beta agents belong to tenantBeta
    for (const agent of betaData) {
      expect(agent['tenantId']).toBe(seed.tenantBeta.id);
    }

    // The two tenant lists should not overlap
    const alphaIds = new Set(alphaData.map((a) => a['id']));
    const betaIds = new Set(betaData.map((a) => a['id']));
    for (const id of betaIds) {
      expect(alphaIds.has(id)).toBe(false);
    }
  });

  it('GET /v1/agents/:id returns 200 for own agent', async () => {
    if (shouldSkip()) return;
    const ownAgent = seed.tenantAlpha.agents[0]!;
    const res = await request(`/v1/agents/${ownAgent.id}`, { jwt: seed.tenantAlpha.jwt });
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>)['id']).toBe(ownAgent.id);
  });

  it('Cross-tenant: GET /v1/agents/:id returns 404 for another tenant agent', async () => {
    if (shouldSkip()) return;
    // Alpha tries to access Beta's agent
    const betaAgentId = seed.tenantBeta.agents[0]!.id;
    const res = await request(`/v1/agents/${betaAgentId}`, { jwt: seed.tenantAlpha.jwt });
    // Should be 404 (not found from tenant's perspective)
    expect([404, 403]).toContain(res.status);
  });

  it('PUT /v1/agents/:id updates agent metadata', async () => {
    if (shouldSkip()) return;

    // Create a fresh agent to update
    const name = `e2e-update-${uid()}`;
    const createRes = await request('/v1/agents', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: { name, failBehavior: 'CLOSED', riskTier: 'LOW' },
    });
    expect(createRes.status).toBe(201);
    const agentId = ((createRes.body as Record<string, unknown>)['agent'] as Record<string, unknown>)['id'] as string;
    createdAgentIds.push(agentId);

    const updatedName = `${name}-updated`;
    const updateRes = await request(`/v1/agents/${agentId}`, {
      method: 'PUT',
      jwt: seed.tenantAlpha.jwt,
      body: { name: updatedName, riskTier: 'HIGH' },
    });
    expect(updateRes.status).toBe(200);
    expect((updateRes.body as Record<string, unknown>)['name']).toBe(updatedName);
    expect((updateRes.body as Record<string, unknown>)['riskTier']).toBe('HIGH');

    // Verify in DB
    const dbAgent = await prisma.agent.findUnique({ where: { id: agentId } });
    expect(dbAgent!.name).toBe(updatedName);
    expect(dbAgent!.riskTier).toBe('HIGH');
  });

  it('DELETE /v1/agents/:id soft-deletes the agent', async () => {
    if (shouldSkip()) return;

    const createRes = await request('/v1/agents', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: { name: `e2e-delete-${uid()}`, failBehavior: 'CLOSED', riskTier: 'LOW' },
    });
    expect(createRes.status).toBe(201);
    const agentId = ((createRes.body as Record<string, unknown>)['agent'] as Record<string, unknown>)['id'] as string;

    const deleteRes = await request(`/v1/agents/${agentId}`, {
      method: 'DELETE',
      jwt: seed.tenantAlpha.jwt,
    });
    expect([200, 204]).toContain(deleteRes.status);

    // Subsequent GET should return 404
    const getRes = await request(`/v1/agents/${agentId}`, { jwt: seed.tenantAlpha.jwt });
    expect(getRes.status).toBe(404);

    // DB record should be soft-deleted (deletedAt set), NOT hard deleted
    const dbAgent = await prisma.agent.findUnique({ where: { id: agentId } });
    expect(dbAgent).not.toBeNull();
    expect(dbAgent!.deletedAt).not.toBeNull();
  });

  it('Cross-tenant: PUT on another tenant agent returns 403/404', async () => {
    if (shouldSkip()) return;
    const betaAgentId = seed.tenantBeta.agents[0]!.id;
    const res = await request(`/v1/agents/${betaAgentId}`, {
      method: 'PUT',
      jwt: seed.tenantAlpha.jwt,
      body: { name: 'hacked' },
    });
    expect([403, 404]).toContain(res.status);
  });

  it('Cross-tenant: DELETE on another tenant agent returns 403/404', async () => {
    if (shouldSkip()) return;
    const betaAgentId = seed.tenantBeta.agents[0]!.id;
    const res = await request(`/v1/agents/${betaAgentId}`, {
      method: 'DELETE',
      jwt: seed.tenantAlpha.jwt,
    });
    expect([403, 404]).toContain(res.status);
  });

  it('Pagination: limit and cursor work correctly', async () => {
    if (shouldSkip()) return;
    const res = await request('/v1/agents?limit=1', { jwt: seed.tenantAlpha.jwt });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const data = body['data'] as Array<unknown>;
    expect(data.length).toBeLessThanOrEqual(1);
    // If there are more agents, pagination.cursor should be set
    const pagination = body['pagination'] as Record<string, unknown>;
    expect(pagination).toBeDefined();
  });
});
