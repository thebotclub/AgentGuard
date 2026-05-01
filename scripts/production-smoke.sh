#!/usr/bin/env bash
set -u -o pipefail

API_HOST="${AGENTGUARD_API_HOST:-api.agentguard.tech}"
API_URL="${AGENTGUARD_API_URL:-https://${API_HOST}}"
API_KEY="${AGENTGUARD_API_KEY:-}"
CURL_TIMEOUT="${AGENTGUARD_SMOKE_TIMEOUT:-10}"
CURL_RETRIES="${AGENTGUARD_SMOKE_RETRIES:-3}"
CURL_RETRY_DELAY="${AGENTGUARD_SMOKE_RETRY_DELAY:-2}"
WAIT_SECONDS="${AGENTGUARD_SMOKE_WAIT_SECONDS:-0}"
RUN_SIGNUP="${AGENTGUARD_SMOKE_SIGNUP:-0}"
SITES="${AGENTGUARD_SMOKE_SITES:-api.agentguard.tech agentguard.tech app.agentguard.tech docs.agentguard.tech}"

FAILURES=0
WARNINGS=0
CURL_API_STATUS="000"

log() {
  printf '%s\n' "$*"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  printf '::warning::%s\n' "$*"
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf '::error::%s\n' "$*"
}

json_get() {
  local file="$1"
  local expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)

value = data
for part in sys.argv[2].split("."):
    if isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break

if value is None:
    sys.exit(1)
print(value)
PY
}

resolve_host() {
  local host="$1"
  {
    dig +short A "$host" 2>/dev/null || true
    dig +short A "$host" @1.1.1.1 2>/dev/null || true
    dig +short A "$host" @8.8.8.8 2>/dev/null || true
    curl -sS --max-time 5 --retry 1 --resolve cloudflare-dns.com:443:1.1.1.1 \
      -H 'accept: application/dns-json' \
      "https://cloudflare-dns.com/dns-query?name=${host}&type=A" 2>/dev/null \
      | python3 -c 'import json,sys; data=json.load(sys.stdin); [print(a["data"]) for a in data.get("Answer", []) if a.get("type") == 1 and "data" in a]' 2>/dev/null || true
    curl -sS --max-time 5 --retry 1 --resolve dns.google:443:8.8.8.8 \
      -H 'accept: application/dns-json' \
      "https://dns.google/resolve?name=${host}&type=A" 2>/dev/null \
      | python3 -c 'import json,sys; data=json.load(sys.stdin); [print(a["data"]) for a in data.get("Answer", []) if a.get("type") == 1 and "data" in a]' 2>/dev/null || true
  } | awk '/^[0-9]+(\.[0-9]+){3}$/ && !seen[$0]++'
}

print_dns_diagnostics() {
  local host="$1"
  local ips
  ips="$(resolve_host "$host" | tr '\n' ' ')"
  if [ -n "$ips" ]; then
    log "DNS $host -> $ips"
  else
    warn "No A records resolved for $host through system DNS, direct resolver DNS, or resolver-pinned DNS-over-HTTPS"
  fi
}

curl_api() {
  local label="$1"
  local output="$2"
  local method="$3"
  local path="$4"
  shift 4

  local url="${API_URL}${path}"
  local code
  local exit_code
  local stderr_file
  stderr_file="$(mktemp)"

  code="$(curl -sS -o "$output" -w '%{http_code}' \
    --max-time "$CURL_TIMEOUT" \
    --retry "$CURL_RETRIES" \
    --retry-delay "$CURL_RETRY_DELAY" \
    --retry-all-errors \
    -X "$method" "$@" "$url" 2>"$stderr_file")"
  exit_code=$?

  if [ "$exit_code" -eq 0 ] && [ "$code" != "000" ]; then
    CURL_API_STATUS="$code"
    log "$label: $code"
    rm -f "$stderr_file"
    return 0
  fi

  warn "$label normal DNS failed: curl_exit=$exit_code http=$code $(tr '\n' ' ' < "$stderr_file")"

  local ip
  while IFS= read -r ip; do
    [ -n "$ip" ] || continue
    code="$(curl -sS -o "$output" -w '%{http_code}' \
      --max-time "$CURL_TIMEOUT" \
      --retry "$CURL_RETRIES" \
      --retry-delay "$CURL_RETRY_DELAY" \
      --retry-all-errors \
      --resolve "${API_HOST}:443:${ip}" \
      -X "$method" "$@" "$url" 2>"$stderr_file")"
    exit_code=$?
    if [ "$exit_code" -eq 0 ] && [ "$code" != "000" ]; then
      CURL_API_STATUS="$code"
      log "$label: $code via ${ip}"
      rm -f "$stderr_file"
      return 0
    fi
    warn "$label fallback via $ip failed: curl_exit=$exit_code http=$code $(tr '\n' ' ' < "$stderr_file")"
  done < <(resolve_host "$API_HOST")

  rm -f "$stderr_file"
  CURL_API_STATUS="000"
  log "$label: 000"
  return 1
}

curl_site() {
  local host="$1"
  local code
  local exit_code
  local stderr_file
  stderr_file="$(mktemp)"

  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    --max-time "$CURL_TIMEOUT" \
    --retry "$CURL_RETRIES" \
    --retry-delay "$CURL_RETRY_DELAY" \
    --retry-all-errors \
    "https://${host}" 2>"$stderr_file")"
  exit_code=$?

  if [ "$exit_code" -eq 0 ] && [ "$code" != "000" ]; then
    log "$host: $code"
    rm -f "$stderr_file"
    return 0
  fi

  warn "$host normal DNS failed: curl_exit=$exit_code http=$code $(tr '\n' ' ' < "$stderr_file")"

  local ip
  while IFS= read -r ip; do
    [ -n "$ip" ] || continue
    code="$(curl -sS -o /dev/null -w '%{http_code}' \
      --max-time "$CURL_TIMEOUT" \
      --retry "$CURL_RETRIES" \
      --retry-delay "$CURL_RETRY_DELAY" \
      --retry-all-errors \
      --resolve "${host}:443:${ip}" \
      "https://${host}" 2>"$stderr_file")"
    exit_code=$?
    if [ "$exit_code" -eq 0 ] && [ "$code" != "000" ]; then
      log "$host: $code via ${ip}"
      rm -f "$stderr_file"
      return 0
    fi
    warn "$host fallback via $ip failed: curl_exit=$exit_code http=$code $(tr '\n' ' ' < "$stderr_file")"
  done < <(resolve_host "$host")

  rm -f "$stderr_file"
  log "$host: 000"
  return 1
}

if [ "$WAIT_SECONDS" -gt 0 ]; then
  log "Waiting ${WAIT_SECONDS}s before smoke checks..."
  sleep "$WAIT_SECONDS"
fi

log "Production smoke target: ${API_URL}"
print_dns_diagnostics "$API_HOST"

health_file="$(mktemp)"
if curl_api "API health" "$health_file" GET "/health"; then
  status="$(json_get "$health_file" status 2>/dev/null || true)"
  version="$(json_get "$health_file" version 2>/dev/null || true)"
  if [ "$status" = "ok" ]; then
    log "API healthy: version ${version:-unknown}"
  else
    fail "API health returned unexpected body: $(cat "$health_file")"
  fi
else
  fail "API health did not respond"
fi
rm -f "$health_file"

if [ -n "$API_KEY" ]; then
  evaluate_file="$(mktemp)"
  if curl_api "Authenticated evaluate" "$evaluate_file" POST "/api/v1/evaluate" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d '{"tool":"sudo","params":{"command":"test"}}'; then
    log "Authenticated evaluate body: $(cat "$evaluate_file")"
  else
    fail "Authenticated evaluate failed"
  fi
  rm -f "$evaluate_file"
else
  warn "AGENTGUARD_API_KEY not set; skipping authenticated evaluate smoke"
fi

unauth_code_file="$(mktemp)"
if curl_api "Unauthenticated evaluate" "$unauth_code_file" POST "/api/v1/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"tool":"test","params":{}}'; then
  if [ "$CURL_API_STATUS" = "401" ]; then
    log "Auth enforcement verified"
  else
    warn "Unauthenticated evaluate returned ${CURL_API_STATUS} instead of 401"
  fi
else
  fail "Unauthenticated evaluate did not respond"
fi
rm -f "$unauth_code_file"

playground_file="$(mktemp)"
if curl_api "Public playground" "$playground_file" POST "/api/v1/playground/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"tool":"sudo","params":{"command":"test"}}'; then
  if [ "$CURL_API_STATUS" = "200" ]; then
    log "Public playground verified"
  else
    warn "Public playground returned ${CURL_API_STATUS} instead of 200"
  fi
else
  fail "Public playground failed"
fi
rm -f "$playground_file"

if [ "$RUN_SIGNUP" = "1" ]; then
  signup_file="$(mktemp)"
  email="smoke-$(date +%s)@agentguard-test.local"
  if curl_api "Signup canary" "$signup_file" POST "/api/v1/signup" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Production Smoke\",\"email\":\"${email}\"}"; then
    signup_key="$(json_get "$signup_file" apiKey 2>/dev/null || true)"
    tenant_id="$(json_get "$signup_file" tenantId 2>/dev/null || true)"
    if [ -n "$signup_key" ] && [ -n "$tenant_id" ]; then
      log "Signup canary verified: tenant ${tenant_id}"
    else
      fail "Signup canary did not return tenantId/apiKey"
    fi
  else
    fail "Signup canary failed"
  fi
  rm -f "$signup_file"
fi

for site in $SITES; do
  print_dns_diagnostics "$site"
  if ! curl_site "$site"; then
    warn "$site unreachable after DNS fallback"
  fi
done

if [ "$FAILURES" -gt 0 ]; then
  log "Production smoke failed: ${FAILURES} failure(s), ${WARNINGS} warning(s)"
  exit 1
fi

log "Production smoke passed with ${WARNINGS} warning(s)"
