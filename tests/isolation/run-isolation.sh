#!/bin/bash
# AgentGuard — Run All Isolation Tests
#
# Usage:
#   ./tests/isolation/run-isolation.sh
#   BASE_URL=https://api.agentguard.tech ./tests/isolation/run-isolation.sh
#
# Environment:
#   BASE_URL  — API base URL (default: http://localhost:3001)
#
# Requirements:
#   - Node.js >= 22
#   - npx tsx available
#   - API server running at BASE_URL

set -e

BASE_URL="${BASE_URL:-http://localhost:3001}"
PASS=0
FAIL=0
RESULTS_DIR="tests/isolation/results"

echo "========================================"
echo "AgentGuard Multi-Tenant Isolation Tests"
echo "========================================"
echo "BASE_URL: $BASE_URL"
echo ""

mkdir -p "$RESULTS_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

run_test() {
  local name="$1"
  local file="$2"
  local output="$RESULTS_DIR/${name}-${TIMESTAMP}.txt"

  echo -n "Running: $name ... "
  if BASE_URL="$BASE_URL" npx tsx --test "$file" > "$output" 2>&1; then
    echo "✅ PASS"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL (see $output)"
    FAIL=$((FAIL + 1))
    # Show last 20 lines of output for quick diagnosis
    echo "--- Last 20 lines ---"
    tail -20 "$output"
    echo "---"
  fi
}

# Wait for server to be ready
echo "Checking server health at $BASE_URL ..."
for i in $(seq 1 10); do
  if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
    echo "✅ Server is ready"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "❌ Server not ready after 10 retries. Abort."
    exit 1
  fi
  echo "  Retry $i/10..."
  sleep 2
done

echo ""
echo "--- Running Tests ---"

run_test "tenant-isolation"   "tests/isolation/tenant-isolation.test.ts"
run_test "scim-isolation"     "tests/isolation/scim-isolation.test.ts"
run_test "sse-isolation"      "tests/isolation/sse-isolation.test.ts"

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
echo "========================================"

if [ $FAIL -gt 0 ]; then
  echo "❌ ISOLATION TESTS FAILED"
  exit 1
else
  echo "✅ All isolation tests passed"
  exit 0
fi
