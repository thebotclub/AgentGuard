#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AgentGuard Self-Hosted Setup Script
#
# What this script does:
#   1. Checks prerequisites (Docker, Docker Compose)
#   2. Generates JWT_SECRET and INTEGRATION_ENCRYPTION_KEY if not set
#   3. Generates a strong POSTGRES_PASSWORD if not set
#   4. Generates an ADMIN_KEY if not set
#   5. Writes .env from .env.example (safe — never overwrites existing secrets)
#   6. Builds Docker images
#   7. Starts all services
#   8. Runs Prisma DB migrations (via API container)
#   9. Creates an initial admin user (optional — interactive)
#  10. Verifies all services are healthy
#  11. Prints access URLs
#
# Usage:
#   bash scripts/self-hosted-setup.sh [--non-interactive] [--skip-build]
#
# Requirements:
#   Docker >= 24.0, Docker Compose v2, curl or wget, openssl
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Flags ─────────────────────────────────────────────────────────────────────
NON_INTERACTIVE=false
SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=true ;;
    --skip-build)      SKIP_BUILD=true ;;
  esac
done

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${GREEN}✓${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*" >&2; }
step()    { echo -e "\n${BOLD}${BLUE}▶ $*${NC}"; }
divider() { echo -e "${DIM}──────────────────────────────────────────${NC}"; }

banner() {
  echo ""
  echo -e "${BLUE}${BOLD}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}${BOLD}║  🔒  AgentGuard Self-Hosted Setup              ║${NC}"
  echo -e "${BLUE}${BOLD}╚════════════════════════════════════════════════╝${NC}"
  echo ""
}

# Generate a cryptographically random hex string of N bytes
generate_hex() {
  local n="${1:-32}"
  if command -v openssl &>/dev/null; then
    openssl rand -hex "$n"
  elif command -v python3 &>/dev/null; then
    python3 -c "import secrets; print(secrets.token_hex($n))"
  else
    od -vAn -N"$n" -tx1 /dev/urandom | tr -d ' \n'; echo
  fi
}

# Generate a safe alphanumeric key prefixed with 'ag_'
generate_admin_key() {
  echo "ag_$(generate_hex 24)"
}

# Get current value of a key from .env file (empty if not set or missing)
get_env_val() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    # Strip inline comments, trim whitespace
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | sed "s/^${key}=//" | sed 's/[[:space:]]*#.*//' | xargs || true
  fi
}

# Set or update a key in .env
set_env_val() {
  local key="$1"
  local val="$2"
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # Update existing (BSD and GNU sed compatible)
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
      sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    fi
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

# ── Preflight Checks ──────────────────────────────────────────────────────────
banner

step "Checking prerequisites"
divider

check_command() {
  local cmd="$1" url="$2"
  if ! command -v "$cmd" &>/dev/null; then
    error "$cmd is not installed — install from: $url"
    exit 1
  fi
  info "$cmd found ($(command -v "$cmd"))"
}

check_command docker  "https://docs.docker.com/get-docker/"
check_command curl    "https://curl.se/download.html"

# Check Docker Compose v2 (plugin) or v1 (standalone)
if docker compose version &>/dev/null 2>&1; then
  info "docker compose v2 found"
  DC="docker compose"
elif command -v docker-compose &>/dev/null; then
  warn "docker-compose v1 detected — upgrade to v2 recommended"
  DC="docker-compose"
else
  error "Docker Compose not found — install: https://docs.docker.com/compose/install/"
  exit 1
fi

# Verify Docker is running
if ! docker info &>/dev/null; then
  error "Docker daemon is not running — start Docker and retry"
  exit 1
fi
info "Docker daemon is running"

# Minimum memory check (warn only)
DOCKER_MEM_BYTES=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)
FOUR_GB=$((4 * 1024 * 1024 * 1024))
if [ "$DOCKER_MEM_BYTES" -gt 0 ] && [ "$DOCKER_MEM_BYTES" -lt "$FOUR_GB" ]; then
  warn "Docker has less than 4 GB memory available — recommended minimum is 4 GB"
fi

# ── Environment File ──────────────────────────────────────────────────────────
step "Setting up environment"
divider

cd "$PROJECT_ROOT"

# Seed .env from .env.example if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    info "Created .env from .env.example"
  else
    touch "$ENV_FILE"
    info "Created empty .env"
  fi
else
  info ".env already exists — preserving existing values"
fi

# ── Generate Secrets ──────────────────────────────────────────────────────────
step "Generating secrets"
divider

# JWT_SECRET
JWT_SECRET_VAL=$(get_env_val "JWT_SECRET")
if [ -z "$JWT_SECRET_VAL" ] || echo "$JWT_SECRET_VAL" | grep -qi "dev\|change\|secret\|example"; then
  JWT_SECRET_VAL=$(generate_hex 32)
  set_env_val "JWT_SECRET" "$JWT_SECRET_VAL"
  info "Generated JWT_SECRET"
else
  info "JWT_SECRET already set"
fi

# INTEGRATION_ENCRYPTION_KEY (must be exactly 64 hex chars = 32 bytes)
ENC_KEY_VAL=$(get_env_val "INTEGRATION_ENCRYPTION_KEY")
if [ -z "$ENC_KEY_VAL" ] || [ ${#ENC_KEY_VAL} -lt 64 ]; then
  ENC_KEY_VAL=$(generate_hex 32)
  set_env_val "INTEGRATION_ENCRYPTION_KEY" "$ENC_KEY_VAL"
  info "Generated INTEGRATION_ENCRYPTION_KEY"
else
  info "INTEGRATION_ENCRYPTION_KEY already set"
fi

# POSTGRES_PASSWORD
PG_PASS_VAL=$(get_env_val "POSTGRES_PASSWORD")
if [ -z "$PG_PASS_VAL" ] || echo "$PG_PASS_VAL" | grep -qi "change\|password\|example"; then
  PG_PASS_VAL=$(generate_hex 24)
  set_env_val "POSTGRES_PASSWORD" "$PG_PASS_VAL"
  info "Generated POSTGRES_PASSWORD"
else
  info "POSTGRES_PASSWORD already set"
fi

# ADMIN_KEY
ADMIN_KEY_VAL=$(get_env_val "ADMIN_KEY")
if [ -z "$ADMIN_KEY_VAL" ] || echo "$ADMIN_KEY_VAL" | grep -qi "your_key\|example\|change"; then
  ADMIN_KEY_VAL=$(generate_admin_key)
  set_env_val "ADMIN_KEY" "$ADMIN_KEY_VAL"
  info "Generated ADMIN_KEY"
else
  info "ADMIN_KEY already set"
fi

# ── License Key (optional, interactive) ───────────────────────────────────────
if [ "$NON_INTERACTIVE" = false ]; then
  echo ""
  echo -e "  ${BOLD}License Key${NC} ${DIM}(optional — press Enter to skip for Free tier)${NC}"
  echo -e "  ${DIM}Free tier: 100,000 events/month, 3 agent seats${NC}"
  echo -e "  ${DIM}Get a key at: https://agentguard.tech/pricing${NC}"
  echo ""
  read -r -p "  License key [blank = Free tier]: " LICENSE_KEY_INPUT || true
  if [ -n "$LICENSE_KEY_INPUT" ]; then
    set_env_val "AGENTGUARD_LICENSE_KEY" "$LICENSE_KEY_INPUT"
    info "License key saved"
  fi
fi

# ── Build ─────────────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = false ]; then
  step "Building Docker images (this may take a few minutes on first run)"
  divider
  $DC build --parallel 2>&1 | grep -E "^(Step|#|Building|Successfully|ERROR|error)" || $DC build --parallel
  info "Build complete"
fi

# ── Start Services ────────────────────────────────────────────────────────────
step "Starting services"
divider

$DC up -d postgres redis
info "Starting postgres and redis..."

# Wait for postgres to be healthy before starting the API
echo -e "  ${DIM}Waiting for postgres to be ready...${NC}"
MAX=60; ELAPSED=0
while [ $ELAPSED -lt $MAX ]; do
  if $DC exec -T postgres pg_isready -U agentguard -d agentguard &>/dev/null 2>&1; then
    info "PostgreSQL is ready"
    break
  fi
  printf "."
  sleep 2; ELAPSED=$((ELAPSED + 2))
done
echo ""

$DC up -d agentguard-api
info "Starting agentguard-api..."

# Wait for API health
echo -e "  ${DIM}Waiting for API to be ready...${NC}"
MAX=90; ELAPSED=0; API_PORT=$(get_env_val "API_PORT"); API_PORT="${API_PORT:-3000}"
while [ $ELAPSED -lt $MAX ]; do
  STATUS=$(curl -sf "http://localhost:${API_PORT}/health" 2>/dev/null || true)
  if echo "$STATUS" | grep -q '"status"'; then
    info "API is healthy"
    break
  fi
  printf "."
  sleep 3; ELAPSED=$((ELAPSED + 3))
done
echo ""

# Start remaining services
$DC up -d agentguard-dashboard agentguard-worker
info "Started dashboard and worker"

# ── Database Migrations ───────────────────────────────────────────────────────
step "Running database migrations"
divider

# Try Prisma migrate deploy if schema exists
if [ -f "$PROJECT_ROOT/prisma/schema.prisma" ]; then
  $DC exec -T agentguard-api npx prisma migrate deploy 2>&1 | tail -5 || \
    warn "Prisma migrate encountered an issue — check logs with: $DC logs agentguard-api"
  info "Migrations complete"
else
  # Fallback: hit the API's /v1/admin/migrate endpoint
  MIGRATE_RESP=$(curl -sf -X POST \
    -H "x-admin-key: $ADMIN_KEY_VAL" \
    "http://localhost:${API_PORT}/api/v1/admin/migrate" 2>/dev/null || echo '{}')
  if echo "$MIGRATE_RESP" | grep -qi '"ok"\|"success"\|"migrated"'; then
    info "Migrations applied via API"
  else
    warn "Could not apply migrations — the API may handle them on startup"
  fi
fi

# ── Initial Admin User ────────────────────────────────────────────────────────
if [ "$NON_INTERACTIVE" = false ]; then
  echo ""
  divider
  echo -e "  ${BOLD}Create initial admin user?${NC} ${DIM}(optional — you can do this later via the dashboard)${NC}"
  read -r -p "  Create admin user? [Y/n]: " CREATE_ADMIN || true
  CREATE_ADMIN="${CREATE_ADMIN:-Y}"

  if [[ "$CREATE_ADMIN" =~ ^[Yy] ]]; then
    read -r -p "  Admin email: " ADMIN_EMAIL || true
    read -r -s -p "  Admin password (min 12 chars): " ADMIN_PASS || true
    echo ""

    if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASS" ]; then
      REGISTER_RESP=$(curl -sf -X POST \
        -H "Content-Type: application/json" \
        -H "x-admin-key: $ADMIN_KEY_VAL" \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"role\":\"admin\"}" \
        "http://localhost:${API_PORT}/api/v1/auth/register" 2>/dev/null || echo '{}')

      if echo "$REGISTER_RESP" | grep -qi '"id"\|"token"\|"user"'; then
        info "Admin user created: $ADMIN_EMAIL"
      else
        warn "Could not create admin user via API — register manually at http://localhost:${DASHBOARD_PORT:-3001}"
      fi
    fi
  fi
fi

# ── Verify All Services Healthy ───────────────────────────────────────────────
step "Verifying service health"
divider

all_healthy=true
check_service() {
  local name="$1" url="$2"
  local status
  status=$(curl -sf "$url" 2>/dev/null || echo "")
  if [ -n "$status" ]; then
    info "$name — healthy"
  else
    warn "$name — did not respond at $url (may still be starting)"
    all_healthy=false
  fi
}

API_PORT=$(get_env_val "API_PORT"); API_PORT="${API_PORT:-3000}"
DASH_PORT=$(get_env_val "DASHBOARD_PORT"); DASH_PORT="${DASH_PORT:-3001}"

check_service "PostgreSQL"     "http://localhost:${API_PORT}/health"  # proxied via API
check_service "AgentGuard API" "http://localhost:${API_PORT}/health"
check_service "Dashboard"      "http://localhost:${DASH_PORT}"

# Print compose ps for overview
echo ""
$DC ps 2>/dev/null || true

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
if [ "$all_healthy" = true ]; then
  echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}${BOLD}║  ✅  AgentGuard is running!                    ║${NC}"
  echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════╝${NC}"
else
  echo -e "${YELLOW}${BOLD}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}${BOLD}║  ⚠   AgentGuard started (some services slow)  ║${NC}"
  echo -e "${YELLOW}${BOLD}╚════════════════════════════════════════════════╝${NC}"
fi

echo ""
echo -e "  ${BOLD}Dashboard:${NC}   ${CYAN}http://localhost:${DASH_PORT}${NC}"
echo -e "  ${BOLD}API:${NC}         ${CYAN}http://localhost:${API_PORT}${NC}"
echo -e "  ${BOLD}Health:${NC}      ${CYAN}http://localhost:${API_PORT}/health${NC}"
echo -e "  ${BOLD}Admin key:${NC}   ${DIM}${ADMIN_KEY_VAL:0:16}...${NC} ${DIM}(see .env for full value)${NC}"
echo ""
echo -e "  ${DIM}View logs:    $DC logs -f${NC}"
echo -e "  ${DIM}Stop:         $DC down${NC}"
echo -e "  ${DIM}Full docs:    docs/SELF_HOSTED.md${NC}"
echo ""
