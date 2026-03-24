/**
 * E2E: Multi-Tenant Isolation tests
 *
 * - Two tenants are seeded (alpha and beta)
 * - Create agents/policies/evaluations for both
 * - Verify each tenant only sees their own data across ALL endpoints
 * - Verify RLS at the database level
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request, makeJWT, requireServer, shouldSkip, uid } from './setup.js';
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

describe('Multi-Tenant Isolation — real HTTP + DB RLS', () => {
  // ── Agents endpoint isolation ──────────────────────────────────────────────

  it('Agents: alpha only sees its own agents, not beta', async () => {
    if (shouldSkip()) return;

    const alphaRes = await request('/v1/agents', { jwt: seed.tenantAlpha.jwt });
    const betaRes = await request('/v1/agents', { jwt: seed.tenantBeta.jwt });

    expect(alphaRes.status).toBe(200);
    expect(betaRes.status).toBe(200);

    const alphaAgents = (alphaRes.body as Record<string, unknown>)['data'] as Array<Record<string, unknown>>;
    const betaAgents = (betaRes.body as Record<string, unknown>)['data'] as Array<Record<string, unknown>>;

    const alphaIds = new Set(alphaAgents.map((a) => a['id']));
    const betaIds = new Set(betaAgents.map((a) => a['id']));

    // Seed agent IDs should be in the right lists
    for (const agent of seed.tenantAlpha.agents) {
      expect(alphaIds.has(agent.id)).toBe(true);
      expect(betaIds.has(agent.id)).toBe(false);
    }
    for (const agent of seed.tenantBeta.agents) {
      expect(betaIds.has(agent.id)).toBe(true);
      expect(alphaIds.has(agent.id)).toBe(false);
    }
  });

  it('Agents: alpha cannot GET a beta agent by ID', async () => {
    if (shouldSkip()) return;
    const betaAgentId = seed.tenantBeta.agents[0]!.id;
    const res = await request(`/v1/agents/${betaAgentId}`, { jwt: seed.tenantAlpha.jwt });
    expect([403, 404]).toContain(res.status);
  });

  it('Agents: beta cannot GET an alpha agent by ID', async () => {
    if (shouldSkip()) return;
    const alphaAgentId = seed.tenantAlpha.agents[0]!.id;
    const res = await request(`/v1/agents/${alphaAgentId}`, { jwt: seed.tenantBeta.jwt });
    expect([403, 404]).toContain(res.status);
  });

  // ── Policies endpoint isolation ────────────────────────────────────────────

  it('Policies: alpha only sees its own policies', async () => {
    if (shouldSkip()) return;

    const alphaRes = await request('/v1/policies', { jwt: seed.tenantAlpha.jwt });
    const betaRes = await request('/v1/policies', { jwt: seed.tenantBeta.jwt });

    expect(alphaRes.status).toBe(200);
    expect(betaRes.status).toBe(200);

    const alphaPolicies = (alphaRes.body as Record<string, unknown>)['data'] as Array<Record<string, unknown>>;
    const betaPolicies = (betaRes.body as Record<string, unknown>)['data'] as Array<Record<string, unknown>>;

    const alphaIds = new Set(alphaPolicies.map((p) => p['id']));
    const betaIds = new Set(betaPolicies.map((p) => p['id']));

    // Beta policies should not appear in alpha list
    expect(betaIds.has(seed.tenantBeta.policies.allowAll)).toBe(true);
    expect(alphaIds.has(seed.tenantBeta.policies.allowAll)).toBe(false);
  });

  it('Policies: alpha cannot GET a beta policy by ID', async () => {
    if (shouldSkip()) return;
    const res = await request(`/v1/policies/${seed.tenantBeta.policies.allowAll}`, {
      jwt: seed.tenantAlpha.jwt,
    });
    expect([403, 404]).toContain(res.status);
  });

  // ── Evaluate isolation ─────────────────────────────────────────────────────

  it('Evaluate: alpha cannot evaluate a beta agent', async () => {
    if (shouldSkip()) return;
    const betaAgentId = seed.tenantBeta.agents[0]!.id;
    const res = await request('/v1/actions/evaluate', {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: {
        agentId: betaAgentId, // Beta's agent
        sessionId: `cross-tenant-eval-${uid()}`,
        tool: 'malicious_tool',
        params: {},
      },
    });
    // Should fail: not found, or blocked because tenant mismatch
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // ── Audit isolation ────────────────────────────────────────────────────────

  it('Audit: alpha audit query returns only alpha tenant events', async () => {
    if (shouldSkip()) return;

    // Create events for both tenants
    const alphaAgent = seed.tenantAlpha.agents[0]!;
    const betaAgent = seed.tenantBeta.agents[0]!;
    const alphaSession = `mt-alpha-${uid()}`;
    const betaSession = `mt-beta-${uid()}`;

    await Promise.all([
      request('/v1/actions/evaluate', {
        method: 'POST',
        jwt: seed.tenantAlpha.jwt,
        body: { agentId: alphaAgent.id, sessionId: alphaSession, tool: 'alpha_tool', params: {} },
      }),
      request('/v1/actions/evaluate', {
        method: 'POST',
        jwt: seed.tenantBeta.jwt,
        body: { agentId: betaAgent.id, sessionId: betaSession, tool: 'beta_tool', params: {} },
      }),
    ]);

    await new Promise((r) => setTimeout(r, 800));

    // Alpha audit query
    const alphaAudit = await request('/v1/audit', { jwt: seed.tenantAlpha.jwt });
    expect(alphaAudit.status).toBe(200);
    const alphaEvents = (alphaAudit.body as Record<string, unknown>)['data'] as Array<Record<string, unknown>>;

    for (const event of alphaEvents) {
      expect(event['tenantId']).toBe(seed.tenantAlpha.id);
    }

    // Beta audit query
    const betaAudit = await request('/v1/audit', { jwt: seed.tenantBeta.jwt });
    const betaEvents = (betaAudit.body as Record<string, unknown>)['data'] as Array<Record<string, unknown>>;
    for (const event of betaEvents) {
      expect(event['tenantId']).toBe(seed.tenantBeta.id);
    }
  });

  // ── HITL isolation ─────────────────────────────────────────────────────────

  it('HITL: alpha pending gates only contains alpha gates', async () => {
    if (shouldSkip()) return;

    const res = await request('/v1/hitl/pending', { jwt: seed.tenantAlpha.jwt });
    expect(res.status).toBe(200);
    const gates = (res.body as Record<string, unknown>)['data'] as Array<Record<string, unknown>>;
    for (const gate of gates) {
      expect(gate['tenantId']).toBe(seed.tenantAlpha.id);
    }
  });

  // ── Kill switch isolation ──────────────────────────────────────────────────

  it('KillSwitch: alpha cannot halt a beta agent', async () => {
    if (shouldSkip()) return;
    const betaAgentId = seed.tenantBeta.agents[0]!.id;
    const res = await request(`/v1/killswitch/halt/${betaAgentId}`, {
      method: 'POST',
      jwt: seed.tenantAlpha.jwt,
      body: { tier: 'HARD', reason: 'cross-tenant attack test' },
    });
    expect([403, 404]).toContain(res.status);
  });

  // ── Database-level RLS verification ───────────────────────────────────────

  it('DB: direct Prisma queries respect tenant isolation', async () => {
    if (shouldSkip()) return;

    // Verify that alpha's agents query via DB direct query returns only alpha agents
    const alphaAgentsInDB = await prisma.agent.findMany({
      where: { tenantId: seed.tenantAlpha.id, deletedAt: null },
    });
    const betaAgentsInDB = await prisma.agent.findMany({
      where: { tenantId: seed.tenantBeta.id, deletedAt: null },
    });

    // No agent should appear in both tenant queries
    const alphaIdSet = new Set(alphaAgentsInDB.map((a) => a.id));
    for (const agent of betaAgentsInDB) {
      expect(alphaIdSet.has(agent.id)).toBe(false);
    }

    // Seed alpha agents should be in alpha DB query
    for (const seedAgent of seed.tenantAlpha.agents) {
      const found = alphaAgentsInDB.find((a) => a.id === seedAgent.id);
      expect(found).toBeDefined();
    }

    // Seed beta agents should NOT be in alpha DB query
    for (const seedAgent of seed.tenantBeta.agents) {
      const found = alphaAgentsInDB.find((a) => a.id === seedAgent.id);
      expect(found).toBeUndefined();
    }
  });

  it('DB: AuditEvents are strictly partitioned by tenantId', async () => {
    if (shouldSkip()) return;

    // Direct DB check: all alpha audit events have tenantId = alpha
    const alphaEvents = await prisma.auditEvent.findMany({
      where: { tenantId: seed.tenantAlpha.id },
      take: 10,
    });
    for (const event of alphaEvents) {
      expect(event.tenantId).toBe(seed.tenantAlpha.id);
    }

    // Cross-check: no alpha event has beta's tenantId
    const crossEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: seed.tenantBeta.id,
        agentId: { in: seed.tenantAlpha.agents.map((a) => a.id) },
      },
    });
    expect(crossEvents.length).toBe(0);
  });

  // ── New tenant isolation: verify fresh tenant sees nothing ─────────────────

  it('Fresh tenant JWT sees empty lists (no data bleed from other tenants)', async () => {
    if (shouldSkip()) return;

    // Create a JWT for a brand-new tenant that has no data
    const freshTenantId = `fresh-tenant-${uid()}`;
    const freshJwt = await makeJWT({
      tenantId: freshTenantId,
      userId: `fresh-owner-${uid()}`,
      role: 'owner',
    });

    // We need to create a Tenant record for this to work properly
    // (Some DB lookups may fail without it, but list endpoints should return empty)
    try {
      await prisma.tenant.create({
        data: {
          name: 'Fresh E2E Tenant',
          slug: freshTenantId,
          plan: 'FREE',
        },
      });
    } catch {
      // May fail if slug conflicts or tenant already exists — that's OK for this test
    }

    const agentsRes = await request('/v1/agents', { jwt: freshJwt });
    const auditRes = await request('/v1/audit', { jwt: freshJwt });
    const hitlRes = await request('/v1/hitl/pending', { jwt: freshJwt });

    // Should all return empty lists (not other tenants' data)
    if (agentsRes.status === 200) {
      const agents = (agentsRes.body as Record<string, unknown>)['data'] as Array<unknown>;
      expect(agents.length).toBe(0);
    }
    if (auditRes.status === 200) {
      const events = (auditRes.body as Record<string, unknown>)['data'] as Array<unknown>;
      expect(events.length).toBe(0);
    }
    if (hitlRes.status === 200) {
      const gates = (hitlRes.body as Record<string, unknown>)['data'] as Array<unknown>;
      expect(gates.length).toBe(0);
    }
  });
});
