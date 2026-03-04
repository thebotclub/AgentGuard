#!/usr/bin/env tsx
/**
 * AgentGuard — Audit Chain Repair Script
 *
 * Recalculates the entire hash chain for a given tenant from event 1,
 * updating every row's `previous_hash` and `hash` in-place.
 *
 * Usage:
 *   npx tsx api/scripts/repair-audit-chain.ts <tenantId>
 *
 * Dry-run (shows what would change without writing):
 *   DRY_RUN=1 npx tsx api/scripts/repair-audit-chain.ts <tenantId>
 *
 * Hash algorithm (matches storeAuditEvent in audit.ts):
 *   hash = SHA-256(previousHash + '|' + tool + '|' + result + '|' + createdAt)
 *   The very first event uses GENESIS_HASH (64 zeroes) as previousHash.
 */

import crypto from 'crypto';
import { createDb } from '../db-factory.js';

const GENESIS_HASH = '0'.repeat(64);

function makeHash(prevHash: string, tool: string, result: string, createdAt: string): string {
  const eventData = `${tool}|${result}|${createdAt}`;
  return crypto.createHash('sha256').update(prevHash + '|' + eventData).digest('hex');
}

async function repairChain(tenantId: string, dryRun: boolean): Promise<void> {
  console.log(`\n🔧  AgentGuard Audit Chain Repair`);
  console.log(`    Tenant:  ${tenantId}`);
  console.log(`    Mode:    ${dryRun ? 'DRY RUN (no writes)' : 'LIVE — will update rows'}\n`);

  const { db } = await createDb();

  // Fetch all audit events for the tenant ordered by rowid/id
  const events = await db.getAllAuditEvents(tenantId);

  if (events.length === 0) {
    console.log('ℹ️  No audit events found for this tenant.');
    await db.close();
    return;
  }

  console.log(`📋  Found ${events.length} event(s). Recalculating chain...\n`);

  let prevHash = GENESIS_HASH;
  let changed = 0;
  let ok = 0;

  for (const event of events) {
    const expectedHash = makeHash(prevHash, event.tool, event.result, event.created_at);
    const needsUpdate = event.previous_hash !== prevHash || event.hash !== expectedHash;

    if (needsUpdate) {
      changed++;
      console.log(`  ⚠️  Event #${event.id} (${event.tool} → ${event.result} @ ${event.created_at})`);
      console.log(`       prev_hash stored: ${(event.previous_hash ?? '').slice(0, 16)}...`);
      console.log(`       prev_hash expect: ${prevHash.slice(0, 16)}...`);
      console.log(`       hash stored:      ${(event.hash ?? '').slice(0, 16)}...`);
      console.log(`       hash expected:    ${expectedHash.slice(0, 16)}...`);

      if (!dryRun) {
        await db.run(
          'UPDATE audit_events SET previous_hash = ?, hash = ? WHERE id = ?',
          [prevHash, expectedHash, event.id],
        );
        console.log(`       ✅  Updated.`);
      }
    } else {
      ok++;
    }

    prevHash = expectedHash; // advance chain with corrected hash
  }

  console.log(`\n📊  Summary:`);
  console.log(`    Total events:   ${events.length}`);
  console.log(`    Already valid:  ${ok}`);
  console.log(`    Repaired:       ${changed}${dryRun ? ' (dry run — no writes)' : ''}`);

  if (changed > 0 && dryRun) {
    console.log(`\n💡  Re-run without DRY_RUN=1 to apply changes.`);
  } else if (changed === 0) {
    console.log(`\n✅  Chain is already intact — no repairs needed.`);
  } else {
    console.log(`\n✅  Chain repaired successfully.`);
  }

  await db.close();
}

// ── Entry point ─────────────────────────────────────────────────────────────

const tenantId = process.argv[2];
if (!tenantId) {
  console.error('Usage: npx tsx api/scripts/repair-audit-chain.ts <tenantId>');
  console.error('       DRY_RUN=1 npx tsx api/scripts/repair-audit-chain.ts <tenantId>');
  process.exit(1);
}

const dryRun = process.env['DRY_RUN'] === '1';

repairChain(tenantId, dryRun).catch((err) => {
  console.error('[repair] Fatal error:', err);
  process.exit(1);
});
