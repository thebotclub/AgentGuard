/**
 * E2E Test Seed Script — Prisma-only (no HTTP API calls)
 *
 * Creates deterministic test data for the E2E suite directly in the database:
 *  - 2 tenants: tenant-alpha, tenant-beta
 *  - 1 admin user + JWT per tenant
 *  - 3 policies per tenant (allow-all, block-all, require-approval)
 *  - 3 agents per tenant with API keys
 *
 * Run before tests:
 *   DATABASE_URL=postgresql://test:test@localhost:5433/agentguard_test \
 *   JWT_SECRET=test-jwt-secret-for-e2e-only \
 *   npx tsx tests/e2e/seed.ts
 *
 * Writes seed data to tests/e2e/.seed-data.json for test files to import.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { SignJWT } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://test:test@localhost:5433/agentguard_test';

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

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `ag_live_${randomBytes(24).toString('hex')}`;
  const hash = sha256(raw);
  const prefix = raw.slice(0, 12) + '****';
  return { raw, hash, prefix };
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

// ─── Seed Data Types ──────────────────────────────────────────────────────────

export interface SeedData {
  tenantAlpha: TenantSeedData;
  tenantBeta: TenantSeedData;
}

interface TenantSeedData {
  id: string;
  slug: string;
  jwt: string;
  userId: string;
  agents: Array<{ id: string; apiKey: string; policyName: string }>;
  policies: {
    allowAll: string;
    blockAll: string;
    requireApproval: string;
  };
}

// ─── Main seeding logic ───────────────────────────────────────────────────────

async function seedTenant(slug: string): Promise<TenantSeedData> {
  console.log(`  → Creating tenant: ${slug}`);

  // Create or find tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    create: { name: `${slug} (E2E)`, slug, plan: 'TEAM' },
    update: {},
  });
  const tenantId = tenant.id;

  // Create admin user
  console.log(`  → Creating admin user for ${slug}`);
  const userId = `e2e-admin-${slug}`;
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: `admin@${slug}.test` } },
    create: {
      tenantId,
      email: `admin@${slug}.test`,
      name: `Admin (${slug})`,
      role: 'OWNER',
    },
    update: {},
  });

  // Sign JWT for this tenant
  const jwt = await signJWT(tenantId, userId, 'OWNER');

  // Create policies directly via Prisma
  console.log(`  → Creating policies for ${slug}`);

  const policyConfigs = [
    { key: 'allowAll', name: 'Allow All E2E', yaml: ALLOW_ALL_YAML, defaultAction: 'allow' },
    { key: 'blockAll', name: 'Block All E2E', yaml: BLOCK_ALL_YAML, defaultAction: 'block' },
    { key: 'requireApproval', name: 'Require Approval E2E', yaml: REQUIRE_APPROVAL_YAML, defaultAction: 'allow' },
  ];

  const policyIds: Record<string, string> = {};
  for (const pc of policyConfigs) {
    const policy = await prisma.policy.create({
      data: {
        tenantId,
        name: pc.name,
        defaultAction: pc.defaultAction,
        activeVersion: '1.0.0',
        versions: {
          create: {
            tenantId,
            version: '1.0.0',
            yamlContent: pc.yaml,
            compiledBundle: { rules: [], default: pc.defaultAction },
            bundleChecksum: sha256(pc.yaml),
            ruleCount: 0,
          },
        },
      },
    });
    policyIds[pc.key] = policy.id;
  }

  // Create agents with API keys directly via Prisma
  console.log(`  → Creating agents for ${slug}`);

  const agentConfigs = [
    { name: `${slug}-agent-allow`, policyKey: 'allowAll', policyName: 'allow-all', failBehavior: 'OPEN' as const },
    { name: `${slug}-agent-block`, policyKey: 'blockAll', policyName: 'block-all', failBehavior: 'CLOSED' as const },
    { name: `${slug}-agent-approval`, policyKey: 'requireApproval', policyName: 'require-approval', failBehavior: 'CLOSED' as const },
  ];

  const agents: TenantSeedData['agents'] = [];
  for (const ac of agentConfigs) {
    const key = generateApiKey();
    const agent = await prisma.agent.create({
      data: {
        tenantId,
        name: ac.name,
        policyId: policyIds[ac.policyKey],
        failBehavior: ac.failBehavior,
        riskTier: 'MEDIUM',
        tags: ['e2e-test', slug],
        apiKeyHash: key.hash,
        apiKeyPrefix: key.prefix,
      },
    });
    agents.push({ id: agent.id, apiKey: key.raw, policyName: ac.policyName });
  }

  return {
    id: tenantId,
    slug,
    jwt,
    userId,
    agents,
    policies: {
      allowAll: policyIds['allowAll']!,
      blockAll: policyIds['blockAll']!,
      requireApproval: policyIds['requireApproval']!,
    },
  };
}

async function main(): Promise<SeedData> {
  console.log('🌱 Seeding E2E test data (Prisma-only, no HTTP)...\n');

  // Clean existing E2E data to make idempotent
  console.log('  → Cleaning existing E2E data...');
  const existingSlugs = ['tenant-alpha', 'tenant-beta'];
  for (const slug of existingSlugs) {
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (t) {
      // Delete in dependency order
      await prisma.auditEvent.deleteMany({ where: { tenantId: t.id } });
      await prisma.hITLGate.deleteMany({ where: { tenantId: t.id } });
      await prisma.killSwitchCommand.deleteMany({ where: { tenantId: t.id } });
      await prisma.agentSession.deleteMany({ where: { tenantId: t.id } });
      await prisma.agent.deleteMany({ where: { tenantId: t.id } });
      await prisma.policyVersion.deleteMany({ where: { tenantId: t.id } });
      await prisma.policy.deleteMany({ where: { tenantId: t.id } });
      await prisma.user.deleteMany({ where: { tenantId: t.id } });
      await prisma.tenant.delete({ where: { slug } });
    }
  }

  // Seed both tenants
  const [alpha, beta] = await Promise.all([
    seedTenant('tenant-alpha'),
    seedTenant('tenant-beta'),
  ]);

  const seedData: SeedData = {
    tenantAlpha: alpha,
    tenantBeta: beta,
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
