/**
 * Database seed script — creates demo tenant, API keys, agents, and policies.
 * Run with: npx prisma db seed
 *
 * Creates:
 *   1 demo tenant (AgentGuard Demo)
 *   1 demo user (admin)
 *   1 demo API key (for testing)
 *   3 demo agents (finance-assistant, devops-agent, support-bot)
 *   2 demo policies (restrictive-finance, permissive-monitoring)
 */
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

// ─── Policy YAML fixtures ──────────────────────────────────────────────────────

const RESTRICTIVE_POLICY_YAML = `
id: finance-restrictive-v1
name: Finance Agent Restrictive Policy
description: >
  Highly restrictive policy for finance agents.
  Blocks external communications, requires approval for large transactions.
version: 1.0.0
default: block
budgets:
  maxActionsPerMinute: 20
  maxActionsPerSession: 200
rules:
  - id: block-external-email
    description: Block sending emails to external domains
    priority: 10
    action: block
    severity: high
    when:
      - tool: { in: [send_email, email_send] }
      - params:
          to: { domain_not_in: [company.internal, acme.com] }
    tags: [email, external, security]

  - id: require-approval-large-transfer
    description: Require human approval for transfers > $10,000
    priority: 20
    action: require_approval
    severity: critical
    timeoutSec: 600
    on_timeout: block
    approvers: [finance-ops@company.com]
    when:
      - tool: { in: [initiate_transfer, bank_transfer, wire_funds] }
      - params:
          amount: { gt: 10000 }
    tags: [finance, approval, high-value]

  - id: allow-read-only-db
    description: Allow read-only database operations
    priority: 50
    action: allow
    severity: low
    when:
      - tool: { matches: ["db:read", "db:query", "db:select"] }
    tags: [database, read]

  - id: block-db-write
    description: Block all database writes
    priority: 40
    action: block
    severity: high
    when:
      - tool: { matches: ["db:write", "db:insert", "db:update", "db:delete"] }
    tags: [database, write, blocked]

  - id: monitor-file-operations
    description: Monitor all file system operations
    priority: 100
    action: monitor
    severity: medium
    riskBoost: 20
    when:
      - tool: { matches: ["file:*", "fs:*"] }
    tags: [files, monitoring]
`.trim();

const PERMISSIVE_MONITORING_YAML = `
id: support-permissive-v1
name: Support Bot Permissive Policy
description: >
  Permissive policy for support bots with comprehensive monitoring.
  Allows most operations but monitors everything with rate limits.
version: 1.0.0
default: allow
budgets:
  maxActionsPerMinute: 60
  maxActionsPerSession: 1000
rules:
  - id: block-pii-export
    description: Block exporting PII data outside approved systems
    priority: 10
    action: block
    severity: critical
    when:
      - tool: { in: [export_data, download_report, generate_export] }
      - params:
          format: { in: [csv, xlsx, json] }
          contains_pii: { eq: true }
    tags: [pii, export, compliance]

  - id: rate-limit-api-calls
    description: Rate limit external API calls
    priority: 30
    action: allow
    severity: low
    rateLimit:
      maxCalls: 100
      windowSeconds: 60
      keyBy: agent
    when:
      - tool: { matches: ["api:*", "http:*"] }
    tags: [api, rate-limit]

  - id: monitor-sensitive-tools
    description: Monitor access to sensitive customer data tools
    priority: 50
    action: monitor
    severity: medium
    riskBoost: 30
    when:
      - tool: { in: [get_customer_details, view_payment_history, access_account] }
    tags: [sensitive, monitoring, customer-data]

  - id: require-approval-bulk-actions
    description: Require approval for bulk operations (>100 records)
    priority: 40
    action: require_approval
    severity: high
    timeoutSec: 300
    on_timeout: block
    when:
      - tool: { in: [bulk_update, mass_email, batch_delete] }
      - params:
          record_count: { gt: 100 }
    tags: [bulk, approval]

  - id: allow-all-other
    description: Allow all other operations (fail-open)
    priority: 1000
    action: allow
    severity: low
    when:
      - tool: { not_in: [] }
    tags: [catch-all]
`.trim();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateApiKey(prefix = 'ag_live_'): string {
  return `${prefix}${randomBytes(24).toString('hex')}`;
}

function generateAgentApiKey(): { apiKey: string; apiKeyHash: string; apiKeyPrefix: string } {
  const apiKey = generateApiKey();
  return {
    apiKey,
    apiKeyHash: sha256(apiKey),
    apiKeyPrefix: apiKey.slice(0, 16),
  };
}

function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  return `${parts[0] ?? 1}.${parts[1] ?? 0}.${(parts[2] ?? 0) + 1}`;
}

// Minimal policy compiler for seeding (inline version)
function compilePolicy(doc: Record<string, unknown>, policyId: string, tenantId: string): Record<string, unknown> {
  const rules = (doc['rules'] as Array<Record<string, unknown>>) ?? [];
  const compiledRules = rules.map((rule) => {
    const when = (rule['when'] as Array<Record<string, unknown>>) ?? [];
    return {
      id: rule['id'],
      priority: rule['priority'] ?? 100,
      action: rule['action'],
      toolCondition: when.find((w) => 'tool' in w)?.['tool'] ?? undefined,
      paramConditions: when.filter((w) => 'params' in w).map((w) => w['params']),
      contextConditions: [],
      dataClassConditions: [],
      timeConditions: [],
      rateLimit: rule['rateLimit'] ?? undefined,
      approvers: rule['approvers'] ?? undefined,
      timeoutSec: rule['timeoutSec'] ?? undefined,
      on_timeout: rule['on_timeout'] ?? 'block',
      severity: rule['severity'] ?? 'medium',
      riskBoost: rule['riskBoost'] ?? 0,
      tags: rule['tags'] ?? [],
    };
  });

  const toolIndex: Record<string, number[]> = {};
  for (let i = 0; i < compiledRules.length; i++) {
    const rule = compiledRules[i]!;
    const tc = rule.toolCondition as Record<string, string[]> | undefined;
    if (!tc) {
      (toolIndex['__no_tool__'] ??= []).push(i);
      continue;
    }
    for (const name of (tc['in'] ?? [])) {
      (toolIndex[name] ??= []).push(i);
    }
    if ((tc['matches']?.length ?? 0) > 0 || tc['regex']) {
      (toolIndex['*'] ??= []).push(i);
    }
  }

  const checksum = sha256(JSON.stringify(compiledRules));
  return {
    policyId,
    tenantId,
    version: doc['version'],
    compiledAt: new Date().toISOString(),
    defaultAction: doc['default'] ?? 'block',
    budgets: doc['budgets'] ?? undefined,
    rules: compiledRules,
    toolIndex,
    checksum,
    ruleCount: compiledRules.length,
  };
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  // ── Tenant ─────────────────────────────────────────────────────────────────
  console.log('  Creating demo tenant...');
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'AgentGuard Demo',
      slug: 'demo',
      plan: 'TEAM',
      failBehaviorDefault: 'CLOSED',
      maxAgents: 10,
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} (${tenant.id})`);

  // ── Admin user ─────────────────────────────────────────────────────────────
  console.log('  Creating demo admin user...');
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.agentguard.io' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.agentguard.io',
      name: 'Demo Admin',
      role: 'OWNER',
      passwordHash: sha256('demo-password-change-in-production'),
    },
  });
  console.log(`  ✓ User: ${user.email} (${user.id})`);

  // ── API key (for human dashboard auth) ─────────────────────────────────────
  const rawApiKey = generateApiKey('ag_demo_');
  const demoApiKey = await prisma.apiKey.upsert({
    where: { keyHash: sha256(rawApiKey) },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: user.id,
      name: 'Demo API Key',
      keyHash: sha256(rawApiKey),
      keyPrefix: rawApiKey.slice(0, 16),
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000), // 1 year
    },
  });
  console.log(`  ✓ API Key: ${demoApiKey.keyPrefix}...  (store this: ${rawApiKey})`);

  // ── Policies ───────────────────────────────────────────────────────────────
  console.log('  Creating demo policies...');
  const jsYaml = await import('js-yaml');
  const parseYaml = jsYaml.load.bind(jsYaml);

  // Restrictive finance policy
  const financeDoc = parseYaml(RESTRICTIVE_POLICY_YAML) as Record<string, unknown>;
  let financePolicy = await prisma.policy.findFirst({
    where: { tenantId: tenant.id, name: 'Finance Agent Restrictive Policy', deletedAt: null },
  });
  if (!financePolicy) {
    financePolicy = await prisma.policy.create({
      data: {
        tenantId: tenant.id,
        name: 'Finance Agent Restrictive Policy',
        description: 'Highly restrictive policy for finance agents',
        defaultAction: 'block',
      },
    });
  }

  const financeBundle = compilePolicy(financeDoc, financePolicy.id, tenant.id);
  const financeBundleJson = JSON.stringify(financeBundle);
  const financeVersion = await prisma.policyVersion.upsert({
    where: { policyId_version: { policyId: financePolicy.id, version: '1.0.1' } },
    update: {},
    create: {
      tenantId: tenant.id,
      policyId: financePolicy.id,
      version: '1.0.1',
      yamlContent: RESTRICTIVE_POLICY_YAML,
      compiledBundle: financeBundle as unknown as import('@prisma/client').Prisma.InputJsonValue,
      bundleChecksum: sha256(financeBundleJson),
      ruleCount: ((financeDoc['rules'] as unknown[]) ?? []).length,
      changelog: 'Initial seed version',
      createdByUserId: user.id,
    },
  });

  await prisma.policy.update({
    where: { id: financePolicy.id },
    data: { activeVersion: financeVersion.version },
  });
  console.log(`  ✓ Finance Policy: ${financePolicy.id} (v${financeVersion.version})`);

  // Permissive support policy
  const supportDoc = parseYaml(PERMISSIVE_MONITORING_YAML) as Record<string, unknown>;
  let supportPolicy = await prisma.policy.findFirst({
    where: { tenantId: tenant.id, name: 'Support Bot Permissive Policy', deletedAt: null },
  });
  if (!supportPolicy) {
    supportPolicy = await prisma.policy.create({
      data: {
        tenantId: tenant.id,
        name: 'Support Bot Permissive Policy',
        description: 'Permissive policy for support bots with monitoring',
        defaultAction: 'allow',
      },
    });
  }

  const supportBundle = compilePolicy(supportDoc, supportPolicy.id, tenant.id);
  const supportBundleJson = JSON.stringify(supportBundle);
  const supportVersion = await prisma.policyVersion.upsert({
    where: { policyId_version: { policyId: supportPolicy.id, version: '1.0.1' } },
    update: {},
    create: {
      tenantId: tenant.id,
      policyId: supportPolicy.id,
      version: '1.0.1',
      yamlContent: PERMISSIVE_MONITORING_YAML,
      compiledBundle: supportBundle as unknown as import('@prisma/client').Prisma.InputJsonValue,
      bundleChecksum: sha256(supportBundleJson),
      ruleCount: ((supportDoc['rules'] as unknown[]) ?? []).length,
      changelog: 'Initial seed version',
      createdByUserId: user.id,
    },
  });

  await prisma.policy.update({
    where: { id: supportPolicy.id },
    data: { activeVersion: supportVersion.version },
  });
  console.log(`  ✓ Support Policy: ${supportPolicy.id} (v${supportVersion.version})`);

  // ── Agents ─────────────────────────────────────────────────────────────────
  console.log('  Creating demo agents...');

  const agents = [
    {
      name: 'finance-assistant',
      description: 'AI assistant for financial analysis and reporting',
      riskTier: 'HIGH' as const,
      framework: 'LANGCHAIN' as const,
      policyId: financePolicy.id,
      tags: ['finance', 'high-value', 'restricted'],
    },
    {
      name: 'devops-agent',
      description: 'DevOps automation agent for CI/CD and infrastructure',
      riskTier: 'HIGH' as const,
      framework: 'OPENAI_SDK' as const,
      policyId: null,
      tags: ['devops', 'infrastructure', 'automation'],
    },
    {
      name: 'support-bot',
      description: 'Customer support bot for handling tickets and queries',
      riskTier: 'MEDIUM' as const,
      framework: 'CUSTOM' as const,
      policyId: supportPolicy.id,
      tags: ['support', 'customer-facing'],
    },
  ];

  for (const agentSpec of agents) {
    const { apiKey, apiKeyHash, apiKeyPrefix } = generateAgentApiKey();

    const existing = await prisma.agent.findFirst({
      where: { tenantId: tenant.id, name: agentSpec.name, deletedAt: null },
    });

    if (existing) {
      console.log(`  ✓ Agent (existing): ${agentSpec.name} (${existing.id})`);
      continue;
    }

    const agent = await prisma.agent.create({
      data: {
        tenantId: tenant.id,
        name: agentSpec.name,
        description: agentSpec.description,
        riskTier: agentSpec.riskTier,
        failBehavior: 'CLOSED',
        framework: agentSpec.framework,
        policyId: agentSpec.policyId,
        policyVersion: agentSpec.policyId ? '1.0.1' : null,
        tags: agentSpec.tags,
        apiKeyHash,
        apiKeyPrefix,
        status: 'ACTIVE',
      },
    });

    console.log(`  ✓ Agent: ${agent.name} (${agent.id})`);
    console.log(`    API Key (store this): ${apiKey}`);
  }

  console.log('');
  console.log('✅ Seed completed successfully!');
  console.log('');
  console.log('─────────────────────────────────────────────────────────');
  console.log('Summary:');
  console.log(`  Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`  Admin: admin@demo.agentguard.io`);
  console.log(`  Policies: finance-restrictive, support-permissive`);
  console.log(`  Agents: finance-assistant, devops-agent, support-bot`);
  console.log('─────────────────────────────────────────────────────────');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
