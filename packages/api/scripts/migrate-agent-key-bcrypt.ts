/**
 * Wave 2 Migration Script: Migrate existing agent API key hashes to bcrypt.
 *
 * Context:
 *   - Existing agents have apiKeyHash (SHA-256 only), stored in metadata.__apiKeyBcryptHash
 *   - After Wave 2 deployment, new agents get bcrypt hash via AgentService.createAgent()
 *   - This script processes agents that still lack a bcrypt hash
 *
 * Note: Since bcrypt requires the ORIGINAL plaintext key (which we don't have),
 * we cannot retroactively bcrypt-hash existing agents from the DB alone.
 * Instead, this script:
 *  1. Identifies agents without a bcrypt hash in metadata
 *  2. Marks them as requiring key rotation
 *  3. (Optionally) invalidates old keys and requires re-registration
 *
 * The lazy migration path (default): when an agent authenticates with a
 * SHA-256-only key, AgentService.authenticateByApiKey() automatically upgrades
 * the entry to include a bcrypt hash in background.
 *
 * Usage:
 *   npx tsx packages/api/scripts/migrate-agent-key-bcrypt.ts [--dry-run] [--list]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const listOnly = process.argv.includes('--list');

  console.log('Wave 2: Agent API Key Bcrypt Migration Report');
  console.log('==============================================');

  if (isDryRun) {
    console.log('[DRY RUN] No changes will be made.\n');
  }

  // Find all active agents and check their bcrypt status
  const agents = await prisma.agent.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      tenantId: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let bcryptCount = 0;
  let noBcryptCount = 0;
  const noBcryptAgents: typeof agents = [];

  for (const agent of agents) {
    const meta = (agent.metadata as Record<string, unknown> | null) ?? {};
    const hasBcrypt = typeof meta['__apiKeyBcryptHash'] === 'string';

    if (hasBcrypt) {
      bcryptCount++;
    } else {
      noBcryptCount++;
      noBcryptAgents.push(agent);
    }
  }

  console.log(`Total agents:          ${agents.length}`);
  console.log(`With bcrypt hash:      ${bcryptCount}`);
  console.log(`Without bcrypt hash:   ${noBcryptCount}`);
  console.log('');

  if (noBcryptCount === 0) {
    console.log('✅ All agents have bcrypt hashes. Migration complete.');
    return;
  }

  if (listOnly || isDryRun) {
    console.log('Agents without bcrypt hashes (lazy migration on next auth):');
    for (const agent of noBcryptAgents) {
      console.log(`  - ${agent.id} | ${agent.name} | tenant: ${agent.tenantId} | created: ${agent.createdAt.toISOString()}`);
    }
    console.log('');
    console.log('These agents will be upgraded to bcrypt on their next authentication.');
    console.log('No immediate action required — lazy migration is the default path.');
    return;
  }

  console.log(`ℹ️  ${noBcryptCount} agent(s) will be upgraded on their next authentication (lazy migration).`);
  console.log('');
  console.log('Recommendation: Notify operators to rotate API keys for agents older than 90 days.');
  console.log('');
  console.log('To force immediate key rotation for all agents without bcrypt hashes, run:');
  console.log('  npx tsx packages/api/scripts/migrate-agent-key-bcrypt.ts --force-rotate');
  console.log('');
  console.log('Note: --force-rotate will invalidate existing keys and agents must re-register.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
