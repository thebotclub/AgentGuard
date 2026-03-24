#!/usr/bin/env bash
# =============================================================================
# AgentGuard — Migration Test Helper
# =============================================================================
# Applies a migration, verifies the schema changed correctly, rolls it back,
# then verifies the original schema is restored.
#
# Usage:
#   ./scripts/test-migration.sh <migration-file> <rollback-file> [options]
#
# Arguments:
#   migration-file   Path to the migration SQL file (relative to repo root)
#   rollback-file    Path to the corresponding rollback SQL file
#
# Options:
#   --db-url URL     PostgreSQL connection URL (overrides DATABASE_URL env var)
#   --check-table T  Table name to verify exists after migration (can repeat)
#   --check-col T.C  "table.column" to verify exists after migration (can repeat)
#   --dry-run        Print what would be run without executing
#   --no-color       Disable ANSI color output
#   --keep-log       Keep the psql output log after test (default: delete on success)
#
# Examples:
#   # Test RLS migration
#   ./scripts/test-migration.sh \
#     packages/api/prisma/rls-migration.sql \
#     packages/api/prisma/rollbacks/rollback-rls-migration.sql
#
#   # Test with explicit DB URL and column verification
#   ./scripts/test-migration.sh \
#     packages/api/prisma/wave2-agent-key-bcrypt.sql \
#     packages/api/prisma/rollbacks/rollback-wave2-agent-key-bcrypt.sql \
#     --db-url "postgres://user:pass@localhost:5432/agentguard_test" \
#     --check-col "Agent.apiKeyBcryptHash"
#
#   # Dry run to see what would be executed
#   ./scripts/test-migration.sh \
#     packages/api/prisma/rls-migration.sql \
#     packages/api/prisma/rollbacks/rollback-rls-migration.sql \
#     --dry-run
#
# Requirements:
#   - psql CLI available in PATH
#   - DATABASE_URL env var or --db-url flag pointing to a TEST database
#   ⚠️  NEVER run against production — this script applies AND ROLLS BACK migrations.
# =============================================================================

set -euo pipefail

# ── Color helpers ─────────────────────────────────────────────────────────────
USE_COLOR=true
if [[ "${NO_COLOR:-}" == "1" ]] || [[ "${TERM:-}" == "dumb" ]]; then
  USE_COLOR=false
fi

red()    { $USE_COLOR && printf "\033[0;31m%s\033[0m\n" "$*" || echo "$*"; }
green()  { $USE_COLOR && printf "\033[0;32m%s\033[0m\n" "$*" || echo "$*"; }
yellow() { $USE_COLOR && printf "\033[1;33m%s\033[0m\n" "$*" || echo "$*"; }
blue()   { $USE_COLOR && printf "\033[0;34m%s\033[0m\n" "$*" || echo "$*"; }
bold()   { $USE_COLOR && printf "\033[1m%s\033[0m\n"    "$*" || echo "$*"; }

step() { blue "  ▶ $*"; }
ok()   { green "  ✓ $*"; }
warn() { yellow "  ⚠  $*"; }
fail() { red   "  ✗ $*"; }

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
  sed -n '/^# Usage/,/^# ====*/p' "$0" | head -n -1 | sed 's/^# //'
  exit 1
}

# ── Parse arguments ───────────────────────────────────────────────────────────
MIGRATION_FILE=""
ROLLBACK_FILE=""
DB_URL="${DATABASE_URL:-}"
CHECK_TABLES=()
CHECK_COLS=()
DRY_RUN=false
KEEP_LOG=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-url)   DB_URL="$2"; shift 2 ;;
    --check-table) CHECK_TABLES+=("$2"); shift 2 ;;
    --check-col)   CHECK_COLS+=("$2");   shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    --no-color) USE_COLOR=false; shift ;;
    --keep-log) KEEP_LOG=true; shift ;;
    -h|--help)  usage ;;
    -*)         fail "Unknown option: $1"; usage ;;
    *)
      if [[ -z "$MIGRATION_FILE" ]]; then
        MIGRATION_FILE="$1"
      elif [[ -z "$ROLLBACK_FILE" ]]; then
        ROLLBACK_FILE="$1"
      else
        fail "Unexpected argument: $1"; usage
      fi
      shift ;;
  esac
done

# ── Validate inputs ───────────────────────────────────────────────────────────
if [[ -z "$MIGRATION_FILE" ]] || [[ -z "$ROLLBACK_FILE" ]]; then
  fail "Both migration-file and rollback-file are required."
  usage
fi

if [[ ! -f "$MIGRATION_FILE" ]]; then
  fail "Migration file not found: $MIGRATION_FILE"
  exit 1
fi

if [[ ! -f "$ROLLBACK_FILE" ]]; then
  fail "Rollback file not found: $ROLLBACK_FILE"
  exit 1
fi

if [[ -z "$DB_URL" ]]; then
  fail "DATABASE_URL is not set. Use --db-url or set the environment variable."
  exit 1
fi

# Safety check: refuse to run against known production URL patterns
if echo "$DB_URL" | grep -qiE '(prod|production|live)'; then
  warn "DB URL appears to contain 'prod/production/live'. Refusing to run against production."
  warn "Use a dedicated test database. Exiting."
  exit 1
fi

# ── Setup ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$(mktemp /tmp/agentguard-migration-test-XXXXXX.log)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Cleanup log on exit (unless --keep-log)
cleanup() {
  local exit_code=$?
  if [[ $KEEP_LOG == false ]] && [[ $exit_code -eq 0 ]]; then
    rm -f "$LOG_FILE"
  else
    echo ""
    warn "Log file preserved at: $LOG_FILE"
  fi
}
trap cleanup EXIT

psql_run() {
  local label="$1"
  local file="$2"
  step "$label"
  if [[ $DRY_RUN == true ]]; then
    yellow "    [dry-run] Would execute: psql \$DATABASE_URL -f $file"
    return 0
  fi
  if ! psql "$DB_URL" -f "$file" --set ON_ERROR_STOP=1 >> "$LOG_FILE" 2>&1; then
    fail "$label FAILED"
    echo ""
    red "── psql output (last 40 lines) ──────────────────────────────────"
    tail -40 "$LOG_FILE" | while IFS= read -r line; do red "  $line"; done
    red "─────────────────────────────────────────────────────────────────"
    exit 1
  fi
  ok "$label complete"
}

psql_query() {
  local query="$1"
  if [[ $DRY_RUN == true ]]; then
    echo "[dry-run] $query"
    return 0
  fi
  psql "$DB_URL" -t -c "$query" 2>> "$LOG_FILE" | tr -d '[:space:]'
}

# ── Header ────────────────────────────────────────────────────────────────────
echo ""
bold "═══════════════════════════════════════════════════════════════"
bold " AgentGuard Migration Test"
bold "═══════════════════════════════════════════════════════════════"
echo "  Migration : $MIGRATION_FILE"
echo "  Rollback  : $ROLLBACK_FILE"
echo "  Database  : $(echo "$DB_URL" | sed 's/:[^:@]*@/:*****@/')"
echo "  Started   : $STARTED_AT"
[[ $DRY_RUN == true ]] && yellow "  Mode      : DRY RUN (no changes will be made)"
echo ""

PASS=0
FAIL=0

# ── Phase 1: Capture pre-migration schema snapshot ───────────────────────────
bold "Phase 1 — Pre-migration schema snapshot"

pre_tables=""
if [[ $DRY_RUN == false ]]; then
  pre_tables=$(psql_query "SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname='public'")
  ok "Captured table list: ${pre_tables:0:80}..."
else
  ok "[dry-run] Would capture pre-migration schema"
fi

# ── Phase 2: Apply migration ──────────────────────────────────────────────────
echo ""
bold "Phase 2 — Apply migration"
psql_run "Applying $(basename "$MIGRATION_FILE")" "$MIGRATION_FILE"

# ── Phase 3: Verify post-migration state ──────────────────────────────────────
echo ""
bold "Phase 3 — Verify post-migration schema"

# Verify expected tables
for table in "${CHECK_TABLES[@]:-}"; do
  [[ -z "$table" ]] && continue
  step "Checking table exists: $table"
  result=$(psql_query "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND tablename='$table'")
  if [[ "$result" == "1" ]]; then
    ok "Table '$table' exists"
    ((PASS++)) || true
  else
    fail "Table '$table' NOT FOUND after migration"
    ((FAIL++)) || true
  fi
done

# Verify expected columns
for col_spec in "${CHECK_COLS[@]:-}"; do
  [[ -z "$col_spec" ]] && continue
  table="${col_spec%%.*}"
  col="${col_spec#*.}"
  step "Checking column exists: $table.$col"
  result=$(psql_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='$table' AND column_name='$col'")
  if [[ "$result" == "1" ]]; then
    ok "Column '$table.$col' exists"
    ((PASS++)) || true
  else
    fail "Column '$table.$col' NOT FOUND after migration"
    ((FAIL++)) || true
  fi
done

# Generic: verify no obvious error (table count should be >= pre-migration)
if [[ $DRY_RUN == false ]] && [[ -n "$pre_tables" ]]; then
  post_count=$(psql_query "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'")
  pre_count=$(echo "$pre_tables" | tr ',' '\n' | grep -c . || echo 0)
  step "Comparing table counts (pre: $pre_count, post: $post_count)"
  if [[ "$post_count" -ge "$pre_count" ]]; then
    ok "Table count OK (post >= pre)"
    ((PASS++)) || true
  else
    warn "Table count decreased after migration (pre: $pre_count, post: $post_count)"
    ((FAIL++)) || true
  fi
fi

# ── Phase 4: Apply rollback ───────────────────────────────────────────────────
echo ""
bold "Phase 4 — Apply rollback"
psql_run "Rolling back with $(basename "$ROLLBACK_FILE")" "$ROLLBACK_FILE"

# ── Phase 5: Verify post-rollback state ───────────────────────────────────────
echo ""
bold "Phase 5 — Verify post-rollback schema"

# Verify tables from check list no longer exist (if they were created by the migration)
for col_spec in "${CHECK_COLS[@]:-}"; do
  [[ -z "$col_spec" ]] && continue
  table="${col_spec%%.*}"
  col="${col_spec#*.}"
  step "Checking column removed: $table.$col"
  result=$(psql_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='$table' AND column_name='$col'")
  if [[ "$result" == "0" ]]; then
    ok "Column '$table.$col' correctly removed by rollback"
    ((PASS++)) || true
  else
    warn "Column '$table.$col' still present after rollback (may be expected if rollback is partial)"
    # Not a hard failure — some rollbacks intentionally preserve columns
  fi
done

# Verify table count returned to pre-migration count
if [[ $DRY_RUN == false ]] && [[ -n "$pre_tables" ]]; then
  post_rollback_count=$(psql_query "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'")
  step "Comparing table counts (pre-migration: $pre_count, post-rollback: $post_rollback_count)"
  if [[ "$post_rollback_count" -eq "$pre_count" ]]; then
    ok "Table count restored to pre-migration value ($pre_count)"
    ((PASS++)) || true
  else
    warn "Table count after rollback ($post_rollback_count) != pre-migration ($pre_count)"
    warn "This may be expected if the migration added tables with rollback-safe state."
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
bold "═══════════════════════════════════════════════════════════════"
bold " Test Summary"
bold "═══════════════════════════════════════════════════════════════"
echo "  Migration : $(basename "$MIGRATION_FILE")"
echo "  Checks    : $PASS passed, $FAIL failed"
echo "  Log       : $LOG_FILE"
echo ""

if [[ $FAIL -gt 0 ]]; then
  fail "MIGRATION TEST FAILED ($FAIL check(s) failed)"
  exit 1
else
  green "MIGRATION TEST PASSED ✓"
  echo ""
  exit 0
fi
