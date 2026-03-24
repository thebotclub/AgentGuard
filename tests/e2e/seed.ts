/**
 * E2E Test Seed Script
 *
 * Creates deterministic test data for the E2E suite:
 *  - 2 tenants: tenant-alpha, tenant-beta
 *  - 1 admin JWT per tenant
 *  - 3 agents per tenant (via HTTP API so we get real API keys)
 *  - 3 policies per tenant: allow-all, block-all, require-approval
 *  - Some audit events via evaluate calls
 *
 * Run before tests:
 *   DATABASE_URL=postgresql://test:test@localhost:5433/agentguard_test \
 *   DATABASE_DIRECT_URL=postgresql://test:test@localhost:5433/agentguard_test \
 *   REDIS_URL=redis://localhost:6380 \
 *   JWT_SECRET=test-jwt-secret-for-e2e-only \
 *   BASE_URL=http://localhost:3001 \
 *   npx tsx tests/e2e/seed.ts
 *
 * Exports SEED_DATA as JSON to stdout (or writes to tests/e2e/.seed-data.json).
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { SignJWT } from 'jose';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://test:test@localhost:5433/agentguard_test';

const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3001';
const JWT_SECRET_RAW = process.env['JWT_SECRET'] ?? 'test-jwt-secret-for-e2e-only';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

// ─── Prisma client ────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function signJWT(tenantId: string, userId: string, role: string): Promise<string> {
  return new SignJWT({ sub: userId, tenantId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

async function apiRequest(
  method: string,
  path: string,
  body: unknown,
  jwt: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body: data };
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

// ─── Policy YAML templates ────────────────────────────────────────────────────

const ALLOW_ALL_YAML = `id: allow-all-policy
name: Allow All
version: 1.0.0
default: allow
rules: []
`;

const BLOCK_ALL_YAML = `id: block-all-policy
name: Block All
version: 1.0.0
default: block
rules: []
`;

const REQUIRE_APPROVAL_YAML = `id: require-approval-policy
name: Require Approval
version: 1.0.0
default: allow
rules:
  - id: require-approval-on-dangerous
    action: require_approval
    priority: 100
    severity: high
    when:
      - tool:
          in: [dangerous_tool, delete_file, drop_database]
    timeoutSec: 60
    on_timeout: block
`;

// ─── Main seeding logic ───────────────────────────────────────────────────────

export interface SeedData {
  tenantAlpha: {
    id: string;
    slug: string;
    jwt: string;
    agents: Array<{ id: string; apiKey: string; policyName: string }>;
    policies: {
      allowAll: string;
      blockAll: string;
      requireApproval: string;
    };
  };
  tenantBeta: {
    id: string;
    slug: string;
    jwt: string;
    agents: Array<{ id: string; apiKey: string; policyName: string }>;
    policies: {
      allowAll: string;
      blockAll: string;
      requireApproval: string;
    };
  };
}

async function seedTenant(
  slug: string,
  adminUserId: string,
): Promise<{
  tenantId: string;
  slug: string;
  jwt: string;
  agents: Array<{ id: string; apiKey: string; policyName: string }>;
  policies: { allowAll: string; blockAll: string; requireApproval: string };
}> {
  console.log(`  → Creating tenant: ${slug}`);

  // Create or upsert tenant directly via Prisma
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  let tenant = existing;

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: `${slug} (E2E)`,
        slug,
        plan: 'TEAM',
      },
    });
  }

  const tenantId = tenant.id;
  const jwt = await signJWT(tenantId, adminUserId, 'owner');

  // Create 3 policies via HTTP
  console.log(`  → Creating policies for ${slug}`);

  const policyYamls = [
    { name: 'Allow All E2E', yaml: ALLOW_ALL_YAML },
    { name: 'Block All E2E', yaml: BLOCK_ALL_YAML },
    { name: 'Require Approval E2E', yaml: REQUIRE_APPROVAL_YAML },
  ];

  const policyIds: Record<string, string> = {};
  for (const p of policyYamls) {
    const res = await apiRequest(
      'POST',
      '/v1/policies',
      { name: p.name, yamlContent: p.yaml, activate: true },
      jwt,
    );
    if (res.status !== 201) {
      throw new Error(`Failed to create policy "${p.name}" for ${slug}: ${JSON.stringify(res.body)}`);
    }
    const policyId = (res.body.policy as Record<string, unknown>)['id'] as string;
    policyIds[p.name] = policyId;
  }

  const allowAllPolicyId = policyIds['Allow All E2E']!;
  const blockAllPolicyId = policyIds['Block All E2E']!;
  const requireApprovalPolicyId = policyIds['Require Approval E2E']!;

  // Create 3 agents per tenant via HTTP
  console.log(`  → Creating agents for ${slug}`);

  const agentConfigs = [
    {
      name: `${slug}-agent-allow`,
      policyId: allowAllPolicyId,
      policyName: 'allow-all',
      failBehavior: 'OPEN' as const,
    },
    {
      name: `${slug}-agent-block`,
      policyId: blockAllPolicyId,
      policyName: 'block-all',
      failBehavior: 'CLOSED' as const,
    },
    {
      name: `${slug}-agent-approval`,
      policyId: requireApprovalPolicyId,
      policyName: 'require-approval',
      failBehavior: 'CLOSED' as const,
    },
  ];

  const agents: Array<{ id: string; apiKey: string; policyName: string }> = [];
  for (const cfg of agentConfigs) {
    const res = await apiRequest(
      'POST',
      '/v1/agents',
      {
        name: cfg.name,
        policyId: cfg.policyId,
        failBehavior: cfg.failBehavior,
        riskTier: 'MEDIUM',
        tags: ['e2e-test', slug],
      },
      jwt,
    );
    if (res.status !== 201) {
      throw new Error(`Failed to create agent "${cfg.name}": ${JSON.stringify(res.body)}`);
    }
    const agentData = res.body.agent as Record<string, unknown>;
    const apiKey = res.body.apiKey as string;
    agents.push({
      id: agentData['id'] as string,
      apiKey,
      policyName: cfg.policyName,
    });
  }

  // Generate a few audit events by calling evaluate
  console.log(`  → Generating audit events for ${slug}`);

  for (const agent of agents) {
    for (let i = 0; i < 3; i++) {
      try {
        await apiRequest(
          'POST',
          '/v1/actions/evaluate',
          {
            agentId: agent.id,
            sessionId: `seed-session-${slug}-${agent.id}`,
            tool: 'read_file',
            params: { path: `/tmp/test-${i}.txt` },
          },
          jwt,
        );
      } catch {
        // Non-fatal: audit events are nice-to-have for seed
      }
    }
  }

  // Small delay to let async audit logging settle
  await new Promise((r) => setTimeout(r, 500));

  return {
    tenantId,
    slug,
    jwt,
    agents,
    policies: {
      allowAll: allowAllPolicyId,
      blockAll: blockAllPolicyId,
      requireApproval: requireApprovalPolicyId,
    },
  };
}

async function main(): Promise<SeedData> {
  console.log('🌱 Seeding E2E test data...\n');

  // Check server is up
  let serverOk = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${BASE_URL}/v1/health`);
      if (res.ok) { serverOk = true; break; }
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 1000));
    console.log(`  Waiting for server... (attempt ${i + 1}/20)`);
  }
  if (!serverOk) throw new Error('Server did not start in time');

  const [alpha, beta] = await Promise.all([
    seedTenant('tenant-alpha', `admin-alpha-${Date.now()}`),
    seedTenant('tenant-beta', `admin-beta-${Date.now()}`),
  ]);

  const seedData: SeedData = {
    tenantAlpha: {
      id: alpha.tenantId,
      slug: alpha.slug,
      jwt: alpha.jwt,
      agents: alpha.agents,
      policies: alpha.policies,
    },
    tenantBeta: {
      id: beta.tenantId,
      slug: beta.slug,
      jwt: beta.jwt,
      agents: beta.agents,
      policies: beta.policies,
    },
  };

  // Write seed data to file for test files to import
  const outPath = join(__dirname, '.seed-data.json');
  writeFileSync(outPath, JSON.stringify(seedData, null, 2));
  console.log(`\n✅ Seed data written to: ${outPath}`);
  console.log(`   tenant-alpha id: ${seedData.tenantAlpha.id}`);
  console.log(`   tenant-beta  id: ${seedData.tenantBeta.id}`);

  return seedData;
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
