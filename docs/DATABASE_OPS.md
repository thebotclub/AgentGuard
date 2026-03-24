# AgentGuard — Database Operations Guide

Production database management reference: migrations, rollbacks, backups, and recovery.

---

## Table of Contents

1. [Migration Overview](#1-migration-overview)
2. [Applying Migrations](#2-applying-migrations)
3. [Rollback Scripts](#3-rollback-scripts)
4. [Migration Testing](#4-migration-testing)
5. [Backup Procedures](#5-backup-procedures)
6. [Point-in-Time Recovery](#6-point-in-time-recovery)
7. [Connection & Maintenance](#7-connection--maintenance)

---

## 1. Migration Overview

AgentGuard uses two migration systems:

| System | Where | Purpose |
|--------|-------|---------|
| **Prisma** | `packages/api/prisma/schema.prisma` | Primary schema management (ORM-generated) |
| **Raw SQL** | `packages/api/prisma/*.sql` | Advanced features Prisma can't express (RLS, partitioning, triggers) |

### Migration Execution Order

Run migrations in this order for a fresh database:

```
1. prisma migrate deploy              ← creates all base tables
2. rls-migration.sql                  ← enables Row-Level Security
3. wave2-agent-key-bcrypt.sql         ← adds bcrypt hash column to Agent
4. partition-audit-events.sql         ← converts AuditEvent to partitioned table
5. partition-maintenance.sql          ← installs monthly maintenance function
6. partition-auto-trigger.sql         ← installs pg_cron job (if pg_cron available)
```

### Rollback Order

Rollbacks must be applied in REVERSE order:

```
6. rollback-partition-auto-trigger.sql
5. rollback-partition-maintenance.sql
4. rollback-partition-audit-events.sql
3. rollback-wave2-agent-key-bcrypt.sql
2. rollback-rls-migration.sql
1. prisma migrate reset               ← destroys all data — use only in dev/test
```

---

## 2. Applying Migrations

### Prisma Migrations (ORM)

```bash
# Apply all pending migrations (production safe — no data loss)
npx prisma migrate deploy

# Check migration status
npx prisma migrate status

# Generate migration from schema changes (dev only)
npx prisma migrate dev --name "describe-your-change"
```

### Raw SQL Migrations

```bash
# Set your connection URL
export DATABASE_URL="postgres://agentguard_api:password@db-host:5432/agentguard"

# Apply RLS
psql $DATABASE_URL -f packages/api/prisma/rls-migration.sql

# Apply bcrypt column migration
psql $DATABASE_URL -f packages/api/prisma/wave2-agent-key-bcrypt.sql

# Then run the key migration backfill script
npx tsx packages/api/scripts/migrate-agent-key-bcrypt.ts

# Apply partitioning (maintenance window recommended for large tables)
psql $DATABASE_URL -f packages/api/prisma/partition-audit-events.sql

# Set up automatic partition maintenance
psql $DATABASE_URL -f packages/api/prisma/partition-maintenance.sql
psql $DATABASE_URL -f packages/api/prisma/partition-auto-trigger.sql
```

### Pre-Migration Checklist

Before running any migration in production:

- [ ] Take a full database backup (`pg_dump` — see [Backup Procedures](#5-backup-procedures))
- [ ] Verify backup is restorable (test restore to a clone)
- [ ] Run the migration against staging first
- [ ] Use `scripts/test-migration.sh` to validate apply + rollback
- [ ] Schedule a maintenance window for large-table migrations (>1M rows)
- [ ] Notify on-call engineer
- [ ] Have the rollback script ready

---

## 3. Rollback Scripts

Rollback scripts are in `packages/api/prisma/rollbacks/`.

| Migration | Rollback Script |
|-----------|----------------|
| `rls-migration.sql` | `rollbacks/rollback-rls-migration.sql` |
| `wave2-agent-key-bcrypt.sql` | `rollbacks/rollback-wave2-agent-key-bcrypt.sql` |
| `partition-audit-events.sql` | `rollbacks/rollback-partition-audit-events.sql` |
| `partition-maintenance.sql` | `rollbacks/rollback-partition-maintenance.sql` |
| `partition-auto-trigger.sql` | `rollbacks/rollback-partition-auto-trigger.sql` |

### Running a Rollback

```bash
# Roll back RLS migration
psql $DATABASE_URL -f packages/api/prisma/rollbacks/rollback-rls-migration.sql

# Roll back bcrypt column (must also redeploy API with Wave 1 code first)
psql $DATABASE_URL -f packages/api/prisma/rollbacks/rollback-wave2-agent-key-bcrypt.sql

# Roll back partition migration (requires _AuditEvent_old backup table to still exist)
psql $DATABASE_URL -f packages/api/prisma/rollbacks/rollback-partition-audit-events.sql
```

### Important Notes

- **Partition rollback** (`rollback-partition-audit-events.sql`) requires the `_AuditEvent_old` backup table. If this table was dropped post-migration, restore from a pg_dump backup instead.
- **RLS rollback** removes a critical security control. Only roll back with explicit security lead approval.
- **Bcrypt column rollback** requires a coordinated API code rollback — the API must be reverted to read from the JSON metadata field before running the SQL rollback.

---

## 4. Migration Testing

Use `scripts/test-migration.sh` to safely test migrations on a non-production database.

### Basic Usage

```bash
# Test RLS migration (apply → verify → rollback → verify)
./scripts/test-migration.sh \
  packages/api/prisma/rls-migration.sql \
  packages/api/prisma/rollbacks/rollback-rls-migration.sql

# Test bcrypt column migration with column verification
./scripts/test-migration.sh \
  packages/api/prisma/wave2-agent-key-bcrypt.sql \
  packages/api/prisma/rollbacks/rollback-wave2-agent-key-bcrypt.sql \
  --check-col "Agent.apiKeyBcryptHash"

# Test with explicit database URL
./scripts/test-migration.sh \
  packages/api/prisma/rls-migration.sql \
  packages/api/prisma/rollbacks/rollback-rls-migration.sql \
  --db-url "postgres://user:pass@localhost:5432/agentguard_test"

# Dry run to see what would execute
./scripts/test-migration.sh \
  packages/api/prisma/rls-migration.sql \
  packages/api/prisma/rollbacks/rollback-rls-migration.sql \
  --dry-run
```

### What the Script Does

1. **Phase 1** — Captures pre-migration schema snapshot (table list, counts)
2. **Phase 2** — Applies the migration (aborts on error)
3. **Phase 3** — Verifies schema changes (tables, columns, counts)
4. **Phase 4** — Applies the rollback
5. **Phase 5** — Verifies original schema is restored
6. **Summary** — Reports pass/fail and exits 0 (success) or 1 (failure)

### CI Integration

Add to your GitHub Actions workflow:

```yaml
- name: Test migration apply + rollback
  env:
    DATABASE_URL: postgres://postgres:postgres@localhost:5432/agentguard_test
  run: |
    ./scripts/test-migration.sh \
      packages/api/prisma/wave2-agent-key-bcrypt.sql \
      packages/api/prisma/rollbacks/rollback-wave2-agent-key-bcrypt.sql \
      --check-col "Agent.apiKeyBcryptHash"
```

---

## 5. Backup Procedures

### Full Database Backup (pg_dump)

```bash
# Standard compressed backup
pg_dump \
  --format=custom \
  --compress=9 \
  --no-acl \
  --no-owner \
  "$DATABASE_URL" \
  > "agentguard_$(date +%Y%m%d_%H%M%S).dump"

# With progress reporting (useful for large databases)
pg_dump \
  --format=custom \
  --compress=9 \
  --no-acl \
  --no-owner \
  --verbose \
  "$DATABASE_URL" \
  > "agentguard_$(date +%Y%m%d_%H%M%S).dump" \
  2> "agentguard_$(date +%Y%m%d_%H%M%S).dump.log"

# Schema-only backup (no data — useful for migration testing)
pg_dump \
  --format=custom \
  --schema-only \
  --no-acl \
  --no-owner \
  "$DATABASE_URL" \
  > "agentguard_schema_$(date +%Y%m%d).dump"

# Data-only backup (useful for seeding or debugging)
pg_dump \
  --format=custom \
  --data-only \
  --no-owner \
  "$DATABASE_URL" \
  > "agentguard_data_$(date +%Y%m%d_%H%M%S).dump"
```

### Specific Table Backups

```bash
# Backup only the audit events table (often the largest)
pg_dump \
  --format=custom \
  --table='"AuditEvent"' \
  --no-owner \
  "$DATABASE_URL" \
  > "audit_events_$(date +%Y%m%d_%H%M%S).dump"

# Backup a single partition (e.g., January 2026 audit events)
pg_dump \
  --format=custom \
  --table='"AuditEvent_2026_01"' \
  --no-owner \
  "$DATABASE_URL" \
  > "audit_2026_01_$(date +%Y%m%d).dump"
```

### Restoring from Backup

```bash
# Restore to an existing (empty) database
pg_restore \
  --format=custom \
  --no-acl \
  --no-owner \
  --dbname="$DATABASE_URL" \
  agentguard_20260101_120000.dump

# Restore to a new database (create it first)
createdb --owner=agentguard_api agentguard_restore
pg_restore \
  --format=custom \
  --no-acl \
  --no-owner \
  --dbname="postgres://agentguard_api:pass@host:5432/agentguard_restore" \
  agentguard_20260101_120000.dump

# Restore a single table into an existing database
pg_restore \
  --format=custom \
  --table='"AuditEvent"' \
  --no-owner \
  --dbname="$DATABASE_URL" \
  audit_events_20260101_120000.dump
```

### Verifying Backup Integrity

```bash
# List backup contents (no database connection needed)
pg_restore --list agentguard_20260101_120000.dump | head -30

# Verify backup can be read without errors
pg_restore --list agentguard_20260101_120000.dump > /dev/null && echo "Backup OK"

# Test restore to a throwaway database (full smoke test)
createdb agentguard_restore_test
pg_restore \
  --format=custom \
  --no-acl \
  --no-owner \
  --dbname="postgres://user:pass@host:5432/agentguard_restore_test" \
  agentguard_20260101_120000.dump \
  && echo "Restore test passed" \
  || echo "Restore test FAILED"
dropdb agentguard_restore_test
```

### Backup Schedule (Recommended)

| Frequency | Retention | Storage |
|-----------|-----------|---------|
| Hourly (last 24h) | 24 backups | Hot (SSD/NVMe) |
| Daily | 7 days | Warm (object storage) |
| Weekly | 4 weeks | Warm (object storage) |
| Monthly | 12 months | Cold (archival tier) |

**Azure:** Use Azure Database for PostgreSQL built-in automated backups (7–35 days retention, configurable). Enable geo-redundant backup for DR.

**Self-hosted:** Use `pg_dump` via cron + upload to Azure Blob Storage or S3:

```bash
#!/bin/bash
# /etc/cron.d/agentguard-backup
# Runs daily at 02:00 UTC

DUMP_FILE="/tmp/agentguard_$(date +%Y%m%d_%H%M%S).dump"
pg_dump --format=custom --compress=9 "$DATABASE_URL" > "$DUMP_FILE"

# Upload to Azure Blob Storage
az storage blob upload \
  --account-name agentguardbackups \
  --container-name pg-backups \
  --name "$(basename "$DUMP_FILE")" \
  --file "$DUMP_FILE"

rm "$DUMP_FILE"
```

---

## 6. Point-in-Time Recovery

### Azure Database for PostgreSQL (Managed)

Azure provides built-in PITR with up to 35 days retention.

**Restore to a specific time:**

```bash
# Via Azure CLI
az postgres flexible-server restore \
  --resource-group agentguard-rg \
  --name agentguard-db-restored \
  --source-server agentguard-db-prod \
  --restore-time "2026-03-15T02:30:00Z"
```

Or via the Azure Portal:
1. Navigate to your PostgreSQL Flexible Server
2. Click **Restore** in the left menu
3. Select **Point-in-time restore**
4. Enter the target timestamp (UTC)
5. Provide a new server name (cannot restore in-place without downtime)
6. Click **Review + create**

**Estimated recovery time:** 15–60 minutes depending on database size.

### Self-Hosted PostgreSQL (WAL-based PITR)

Enable WAL archiving for self-hosted instances:

**`postgresql.conf` settings:**

```ini
wal_level = replica
archive_mode = on
archive_command = 'az storage blob upload --account-name agentguardwal --container-name wal-archive --name "%f" --file "%p" --auth-mode login'
archive_timeout = 300            # Archive WAL every 5 minutes even if not full
```

**Base backup (required for PITR):**

```bash
# Take a base backup (run periodically — e.g., daily)
pg_basebackup \
  --pgdata=/var/lib/postgresql/basebackup/$(date +%Y%m%d) \
  --format=tar \
  --compress=9 \
  --checkpoint=fast \
  --progress \
  --verbose

# Upload base backup to object storage
az storage blob upload-batch \
  --account-name agentguardbackups \
  --destination pg-basebackups/$(date +%Y%m%d) \
  --source /var/lib/postgresql/basebackup/$(date +%Y%m%d)
```

**Recovery to a specific time:**

1. Stop PostgreSQL: `systemctl stop postgresql`
2. Restore the base backup to the data directory
3. Create `recovery.conf` (PostgreSQL 11) or `postgresql.auto.conf` (PostgreSQL 12+):

```ini
# PostgreSQL 12+ (add to postgresql.auto.conf or create standby.signal)
restore_command = 'az storage blob download --account-name agentguardwal --container-name wal-archive --name "%f" --file "%p" --auth-mode login'
recovery_target_time = '2026-03-15 02:30:00 UTC'
recovery_target_action = 'promote'
```

4. Create `recovery.signal` file: `touch /var/lib/postgresql/data/recovery.signal`
5. Start PostgreSQL: `systemctl start postgresql`
6. PostgreSQL will replay WAL up to the target time, then promote.

**Verify recovery:**

```sql
-- Check the current time of the recovered database
SELECT now();

-- Check latest audit event timestamp to confirm recovery point
SELECT MAX("occurredAt") FROM "AuditEvent";
```

### RTO / RPO Targets

| Scenario | RTO | RPO |
|----------|-----|-----|
| Azure managed PITR | 30–90 min | < 5 min |
| Self-hosted WAL PITR | 1–4 hours | < 5 min (with 5-min archive_timeout) |
| From pg_dump backup | 1–8 hours | Up to 24 hours (last daily backup) |

---

## 7. Connection & Maintenance

### Connection Pooling

Use PgBouncer or Azure's built-in connection pooling for production:

```bash
# PgBouncer config (pgbouncer.ini)
[databases]
agentguard = host=db-host port=5432 dbname=agentguard

[pgbouncer]
pool_mode = transaction          # Use transaction mode for stateless APIs
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3
max_db_connections = 50
```

Update `DATABASE_URL` to point to PgBouncer:

```bash
DATABASE_URL=postgres://agentguard_api:pass@pgbouncer-host:5432/agentguard
```

### Routine Maintenance

```bash
# VACUUM — reclaim dead tuple space
psql $DATABASE_URL -c "VACUUM ANALYZE;"

# VACUUM FULL — rewrite tables (requires exclusive lock — use during maintenance window)
psql $DATABASE_URL -c "VACUUM FULL ANALYZE;"

# Check table bloat
psql $DATABASE_URL -c "
  SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(quote_ident(tablename))) AS size,
    n_dead_tup,
    n_live_tup,
    round(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 1) AS dead_pct
  FROM pg_stat_user_tables
  ORDER BY n_dead_tup DESC
  LIMIT 10;
"

# Partition health check
psql $DATABASE_URL -c "
  SELECT
    c.relname AS partition,
    pg_get_expr(c.relpartbound, c.oid) AS range,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS size
  FROM pg_class c
  JOIN pg_inherits i ON c.oid = i.inhrelid
  JOIN pg_class p    ON i.inhparent = p.oid
  WHERE p.relname = 'AuditEvent'
  ORDER BY c.relname;
"
```

### Monthly Partition Maintenance

If pg_cron is not available, run manually on the 1st of each month:

```bash
psql $DATABASE_URL -f packages/api/prisma/partition-maintenance.sql
# or
psql $DATABASE_URL -c "SELECT auto_provision_audit_partitions();"
```

---

*Last updated: Wave 12 Production Hardening. See git log for revision history.*
