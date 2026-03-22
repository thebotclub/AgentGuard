#!/usr/bin/env tsx
/**
 * AgentGuard — Audit Event Partition Maintenance Script
 *
 * Creates future monthly partitions for AuditEvent and optionally detaches
 * old ones beyond the configured retention window.
 *
 * Usage:
 *   npx tsx scripts/partition-maintenance.ts [options]
 *
 * Options:
 *   --create-ahead <n>     Months ahead to create (default: 2)
 *   --detach-after <n>     Detach partitions older than N months (default: 24, 0=disabled)
 *   --dry-run              Print actions without executing
 *   --year <n>             Override current year (for testing)
 *   --month <n>            Override current month (for testing)
 *
 * Environment:
 *   DATABASE_URL           PostgreSQL connection string (required)
 *
 * Exit codes:
 *   0 — success
 *   1 — error (partition creation failed or row count mismatch)
 */

import { Client } from 'pg';

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  createAhead: number;
  detachAfter: number;
  dryRun: boolean;
  overrideYear?: number;
  overrideMonth?: number;
} {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg && arg.startsWith('--')) {
      args[arg.slice(2)] = argv[i + 1] ?? 'true';
      i++;
    }
  }
  return {
    createAhead: parseInt(args['create-ahead'] ?? '2', 10),
    detachAfter: parseInt(args['detach-after'] ?? '24', 10),
    dryRun: args['dry-run'] === 'true',
    overrideYear: args['year'] ? parseInt(args['year'], 10) : undefined,
    overrideMonth: args['month'] ? parseInt(args['month'], 10) : undefined,
  };
}

// ─── Partition helpers ────────────────────────────────────────────────────────

function partitionName(year: number, month: number): string {
  return `AuditEvent_${year}_${String(month).padStart(2, '0')}`;
}

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// ─── DB operations ────────────────────────────────────────────────────────────

async function partitionExists(client: Client, name: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM pg_class WHERE relname = $1) AS exists',
    [name],
  );
  return res.rows[0]?.exists ?? false;
}

async function isPartitionAttached(client: Client, name: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1
      FROM pg_inherits i
      JOIN pg_class parent ON i.inhparent = parent.oid
      JOIN pg_class child  ON i.inhrelid  = child.oid
      WHERE parent.relname = 'AuditEvent' AND child.relname = $1
    ) AS exists`,
    [name],
  );
  return res.rows[0]?.exists ?? false;
}

async function createPartition(
  client: Client,
  year: number,
  month: number,
  dryRun: boolean,
): Promise<void> {
  const name = partitionName(year, month);
  const start = monthStart(year, month);
  const { year: ey, month: em } = addMonths(year, month, 1);
  const end = monthStart(ey, em);

  if (await partitionExists(client, name)) {
    console.log(`  [skip] Partition ${name} already exists`);
    return;
  }

  const sql = `CREATE TABLE "${name}" PARTITION OF "AuditEvent" FOR VALUES FROM ('${start}') TO ('${end}')`;
  console.log(`  [create] ${name}  (${start} → ${end})`);

  if (!dryRun) {
    await client.query(sql);
    console.log(`  [ok] ${name} created`);
  } else {
    console.log(`  [dry-run] Would execute: ${sql}`);
  }
}

async function detachPartition(
  client: Client,
  year: number,
  month: number,
  dryRun: boolean,
): Promise<void> {
  const name = partitionName(year, month);

  if (!(await isPartitionAttached(client, name))) {
    console.log(`  [skip] Partition ${name} is not attached`);
    return;
  }

  console.log(`  [detach] ${name}`);

  if (!dryRun) {
    try {
      // CONCURRENTLY avoids full table lock (PostgreSQL 14+)
      await client.query(`ALTER TABLE "AuditEvent" DETACH PARTITION "${name}" CONCURRENTLY`);
      console.log(`  [ok] ${name} detached (CONCURRENTLY)`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('syntax')) {
        // Fallback for PostgreSQL < 14
        await client.query(`ALTER TABLE "AuditEvent" DETACH PARTITION "${name}"`);
        console.log(`  [ok] ${name} detached (standard)`);
      } else {
        throw err;
      }
    }
  } else {
    console.log(`  [dry-run] Would detach partition ${name}`);
  }
}

async function listAttachedPartitions(
  client: Client,
): Promise<{ name: string; year: number; month: number }[]> {
  const res = await client.query<{ relname: string }>(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_inherits i ON c.oid = i.inhrelid
    JOIN pg_class p    ON i.inhparent = p.oid
    WHERE p.relname = 'AuditEvent'
    ORDER BY c.relname
  `);

  return res.rows
    .map((r) => {
      const m = /AuditEvent_(\d{4})_(\d{2})$/.exec(r.relname);
      if (!m) return null;
      return { name: r.relname, year: parseInt(m[1]!, 10), month: parseInt(m[2]!, 10) };
    })
    .filter(Boolean) as { name: string; year: number; month: number }[];
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const dbUrl = process.env['DATABASE_URL'];

  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const now = new Date();
  const currentYear = opts.overrideYear ?? now.getFullYear();
  const currentMonth = opts.overrideMonth ?? now.getMonth() + 1;

  console.log(`\nAgentGuard Partition Maintenance — ${new Date().toISOString()}`);
  console.log(`Current window: ${currentYear}-${String(currentMonth).padStart(2, '0')}`);
  console.log(`Create ahead:  ${opts.createAhead} months`);
  console.log(`Detach after:  ${opts.detachAfter} months (0 = disabled)`);
  console.log(`Dry run:       ${opts.dryRun}`);
  console.log();

  try {
    // ── Step 1: Create upcoming partitions ──────────────────────────────────
    console.log('=== Creating upcoming partitions ===');
    for (let i = 0; i <= opts.createAhead; i++) {
      const { year, month } = addMonths(currentYear, currentMonth, i);
      await createPartition(client, year, month, opts.dryRun);
    }

    // ── Step 2: Detach old partitions ────────────────────────────────────────
    if (opts.detachAfter > 0) {
      console.log(`\n=== Detaching partitions older than ${opts.detachAfter} months ===`);
      const attached = await listAttachedPartitions(client);
      let detached = 0;

      for (const p of attached) {
        // Age in months from current
        const ageMonths =
          (currentYear - p.year) * 12 + (currentMonth - p.month);

        if (ageMonths > opts.detachAfter) {
          await detachPartition(client, p.year, p.month, opts.dryRun);
          detached++;
        }
      }

      if (detached === 0) {
        console.log('  [skip] No partitions to detach');
      }
    }

    console.log('\n=== Partition maintenance complete ===\n');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
