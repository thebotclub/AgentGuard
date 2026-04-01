# AgentGuard — Wave 1 Security Fixes (P0)

**Status:** ✅ ALL 8 FIXES COMPLETE  
**Date:** 2026-03-21  
**Branch:** main  
**Tests:** 24 new tests, 0 failures. 78 existing tests, 0 regressions.

---

## Overview

This document describes all P0 security fixes applied in Wave 1. Each fix has corresponding tests in `tests/security-fixes-wave1.test.ts`.

---

## Fix 1 — Slack HITL `sendSlackApprovalRequest` Never Called

**Severity:** CRITICAL  
**File:** `packages/api/src/services/hitl.ts`  
**Status:** ✅ Fixed + verified (already fixed in `api/routes/evaluate.ts`)

### Problem
The HITL approval flow in `packages/api` created database gate records but never sent Slack notifications. The `notifiedViaSlack` field on `HITLGate` was always `false`. Operators never received Block Kit approval messages.

### Fix
- Added `fireAlertWebhooksForGate()` to `HITLService` — called after every `createGate()`
- Looks up all active `AlertWebhook` entries for the tenant that include `hitl_gate_created` or `hitl` events
- For Slack webhook URLs (`hooks.slack.com`): sends Block Kit messages with ✅/❌ Approve/Reject buttons, agent context, tool params, and auto-reject countdown
- For other HTTPS URLs: sends generic JSON payload
- Sets `notifiedViaSlack: true` on the gate after successful Slack delivery
- The `api/routes/evaluate.ts` path (Express server) was already correctly calling `sendSlackApprovalRequest` via `getSlackIntegrationConfig` — no change needed there

---

## Fix 2 — SSRF in Slack `webhookUrl`

**Severity:** HIGH  
**Files:** `api/routes/slack-hitl.ts`, `packages/api/src/services/hitl.ts`  
**Status:** ✅ Fixed

### Problem
Webhook URLs were passed to `fetch()` without validating the destination. An attacker who configured a webhook URL pointing to internal services (AWS IMDS, private network endpoints, database hosts) could read internal data via SSRF.

### Fix (api/ Express server)
The `SlackIntegrationConfigSchema` Zod schema already has:
```typescript
.refine((u) => u.startsWith('https://hooks.slack.com/'), {
  message: 'webhookUrl must be a Slack webhook URL (https://hooks.slack.com/...)',
})
```
This restricts all Slack webhook URLs to Slack's servers only.

### Fix (packages/api Hono server)
Added `isSafeWebhookUrl()` SSRF protection method to `HITLService`:
- Must be HTTPS
- Blocks: `localhost`, `127.0.0.1`, `::1`
- Blocks AWS/Azure IMDS: `169.254.x.x` (link-local)
- Blocks GCP metadata: `metadata.google.internal`
- Blocks private IPv4 ranges: `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`
- All webhook calls go through this check before any HTTP request is made

---

## Fix 3 — JWT_SECRET Production Startup Guard

**Severity:** CRITICAL  
**File:** `packages/api/src/middleware/auth.ts`  
**Status:** ✅ Fixed

### Problem
```typescript
const JWT_SECRET = new TextEncoder().encode(
  process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
);
```
If `JWT_SECRET` was not set in production, the API used a known public default secret. Any attacker knowing this secret could forge admin JWTs and gain full access.

### Fix
Added production startup guard that throws `FATAL` error if:
- `JWT_SECRET` is not set
- `JWT_SECRET` is shorter than 32 characters
- `JWT_SECRET` contains `dev-` or `change-in` (default placeholder detection)

The process crashes at startup rather than running insecurely. In development (`NODE_ENV !== 'production'`), the default is still accepted.

**Generate a strong secret:**
```bash
openssl rand -hex 32
```

---

## Fix 4 — INTEGRATION_ENCRYPTION_KEY Production Startup Guard

**Severity:** HIGH  
**File:** `api/lib/integration-crypto.ts`  
**Status:** ✅ Already fixed (verified)

### Problem
The integration encryption key (used to encrypt Slack signing secrets and webhook URLs at rest) fell back to a deterministic dev key derived from a public seed. In production without the env var, all stored secrets could be decrypted by anyone with the source code.

### Fix (already present)
The `getEncryptionKey()` function already includes:
```typescript
if (process.env['NODE_ENV'] === 'production') {
  throw new Error(
    'INTEGRATION_ENCRYPTION_KEY is required in production. Generate with: openssl rand -hex 32',
  );
}
```
The guard was already in place. Tests confirm it is correctly wired.

**Generate a strong key:**
```bash
openssl rand -hex 32
```

---

## Fix 5 — Stale OWASP Compliance Checks

**Severity:** MEDIUM  
**File:** `api/lib/compliance-checker.ts`  
**Status:** ✅ Already fixed (verified)

### Problem
The original compliance checker had hardcoded `not_covered` returns for several controls regardless of actual tenant state, making the compliance report misleading.

### Fix (already present)
The compliance checker now uses live database queries for all controls:
- **ASI01 (Prompt Injection)**: Checks `getUsageAnalytics()` — `covered` if `calls.last30d > 0` (detection engine actively scanning), `partial` if deployed but no calls yet
- **ASI02 (Tool Policy)**: Checks `getCustomPolicy()` — `covered` if custom policy with rules configured, `partial` if using default policy
- **ASI03 (HITL)**: Counts actual approvals in DB — `covered` if approvals have been processed
- **ASI05 (PII Detection)**: Checks `piiDetection.enabled` in tenant policy — `covered` if enabled in policy
- **ASI06 (Audit Hash Chain)**: Checks actual `countAuditEvents()` and `getLastAuditHash()` — `covered` with live chain
- **ASI08 (Webhook Secrets)**: Counts secured vs. unsecured active webhooks
- **ASI09 (Monitoring)**: Checks both audit events AND active webhooks for full observability

---

## Fix 6 — PostgreSQL RLS Disabled

**Severity:** CRITICAL  
**Files:** `packages/api/src/app.ts`, `packages/api/prisma/rls-migration.sql`  
**Status:** ✅ Fixed

### Problem
```typescript
// Note: tenantRLSMiddleware is disabled by default until PostgreSQL RLS is
// enabled in the database. Uncomment after running migration SQL.
// app.use('/v1/*', tenantRLSMiddleware);
```
The RLS middleware was commented out, meaning PostgreSQL had no database-level tenant isolation. A bug in application code could expose cross-tenant data.

### Fix

**1. Enable middleware** (`packages/api/src/app.ts`):
```typescript
app.use('/v1/*', tenantRLSMiddleware);
```

**2. Create RLS migration** (`packages/api/prisma/rls-migration.sql`):
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on all 11 tenant-scoped tables
- Each table gets a `tenant_isolation` policy:
  ```sql
  CREATE POLICY tenant_isolation ON "Agent"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));
  ```
- The `tenantRLSMiddleware` sets this session variable on every authenticated request via `set_config('app.current_tenant_id', tenantId, true)`

**Tables protected:** `Tenant`, `User`, `ApiKey`, `Agent`, `AgentSession`, `Policy`, `PolicyBundle`, `AuditEvent`, `KillSwitchCommand`, `HITLGate`, `SIEMIntegration`, `AlertWebhook`

**Deployment:** Run `packages/api/prisma/rls-migration.sql` once against PostgreSQL before deploying this update. The migration file includes a rollback section and a verification query.

---

## Fix 7 — Telemetry Rate Map Memory Leak

**Severity:** MEDIUM  
**File:** `api/routes/telemetry.ts`  
**Status:** ✅ Already fixed (verified)

### Problem
The in-memory telemetry rate limiter used an unbounded `Map<string, RateEntry>`. With enough unique IP addresses, the Map would grow indefinitely until OOM.

### Fix (already present)
```typescript
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of telemetryRateMap) {
    if (now - entry.windowStart > TELEMETRY_WINDOW_MS * 2) {
      telemetryRateMap.delete(ip);
    }
  }
}, 5 * 60_000).unref(); // cleanup every 5 minutes, .unref() to not block process exit
```
Stale entries (older than 2× the rate window) are evicted every 5 minutes. `.unref()` ensures the interval does not prevent clean process exit.

---

## Fix 8 — No Dependency Vulnerability Scanning in CI

**Severity:** HIGH  
**File:** `.github/workflows/test-coverage.yml`  
**Status:** ✅ Fixed

### Problem
The CI pipeline had no dependency audit step. HIGH/CRITICAL CVEs in `node_modules` could ship undetected.

### Fix
Added `npm audit --audit-level=high` as a mandatory CI gate that runs after dependency installation and before tests:

```yaml
- name: Audit dependencies for HIGH/CRITICAL vulnerabilities
  run: npm audit --audit-level=high
```

This blocks the pipeline if any HIGH or CRITICAL CVEs are found. Developers must run `npm audit fix` locally to resolve, or acknowledge false positives with an `.nsprc` entry.

---

## Test Results

```
Wave 1 security tests:  24 pass, 0 fail
Existing Vitest tests:  78 pass, 0 fail
Regressions:            0
```

Run security tests:
```bash
npx tsx --test tests/security-fixes-wave1.test.ts
```

Run full suite:
```bash
npm run test:coverage
```

---

## Commits

| Hash | Fix | Description |
|------|-----|-------------|
| `4096488` | Fix 3 | JWT_SECRET production startup guard |
| `e8b4073` | Fix 1+2 | Slack HITL wired + SSRF protection in HITLService |
| `bb104a7` | Fix 6 | PostgreSQL RLS enabled + migration SQL |
| `8af05fc` | Fix 8 | CI: npm audit --audit-level=high |
| `61e1ae2` | Tests | 24-test Wave 1 security test suite |

---

## Required Deployment Actions

Before deploying these fixes to production:

1. **Set `JWT_SECRET`** (packages/api): `export JWT_SECRET=$(openssl rand -hex 32)`
2. **Set `INTEGRATION_ENCRYPTION_KEY`** (api/): `export INTEGRATION_ENCRYPTION_KEY=$(openssl rand -hex 32)`
3. **Run RLS migration**: `psql $DATABASE_URL < packages/api/prisma/rls-migration.sql`
4. **Configure app DB user**: Ensure the application DB role is NOT the table owner (so RLS applies to it)
5. **Register Slack AlertWebhook entries** for tenants that need HITL Slack notifications, including `hitl_gate_created` in the `events` array
