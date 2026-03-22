# AgentGuard — Multi-Tenant Data Isolation Architecture

## Overview

AgentGuard is a multi-tenant SaaS platform. Every resource (audit logs, policies, agents,
webhooks, SCIM users, SSE streams) is strictly scoped to its owning tenant.
**No data from Tenant A is ever accessible to Tenant B under any circumstance.**

---

## Isolation Model

### Tenant Identification

Every request is authenticated, and the authenticated identity determines the tenant scope:

| Auth Method | How Tenant is Determined |
|-------------|--------------------------|
| `x-api-key` | Key is looked up in DB; `api_keys.tenant_id` is the scope |
| `Authorization: Bearer <JWT>` | JWT contains `tenantId` claim; verified cryptographically |
| SCIM `Authorization: Bearer <token>` | Token hash looked up in `scim_tokens`; `tenant_id` is the scope |

**No endpoint accepts a `tenant_id` parameter from the client.** The tenant ID is always
derived server-side from the authenticated credential.

### Database-Level Isolation

Every table that holds tenant data includes a `tenant_id` column. All queries include
a `WHERE tenant_id = $tenantId` clause derived from the authenticated credential.

```sql
-- Example: audit events query
SELECT * FROM audit_events
WHERE tenant_id = $authenticatedTenantId   -- ALWAYS present
  AND created_at > $startTime
ORDER BY created_at DESC
LIMIT 100;
```

There are **no cross-tenant JOINs** and no admin-visible data bypass in production.

---

## Per-Resource Isolation Details

### Audit Logs (`audit_events`)

- `tenant_id` column is set on every write (from authenticated API key/JWT)
- All read queries (`GET /api/v1/audit`) include `WHERE tenant_id = ?`
- Hash chain integrity is per-tenant (each tenant has its own chain)
- Export endpoints (CSV, Splunk forward) are tenant-scoped
- **Test:** `tests/isolation/tenant-isolation.test.ts` — "Audit Log Isolation" suite

### Policies (`tenant_policies`)

- Policies are stored with `tenant_id` as a primary key component
- `GET /api/v1/policy` returns the calling tenant's policy only
- Policy cache (Redis) is keyed by `policy:{tenantId}` — no cross-tenant sharing
- **Test:** `tests/isolation/tenant-isolation.test.ts` — "Policy Isolation" suite

### API Keys (`api_keys`)

- Each key is linked to exactly one tenant via `tenant_id`
- SHA-256 hash lookup + bcrypt verify; never returned in API responses
- Key scope: `x-api-key` header is matched to exactly one tenant
- **Test:** `tests/isolation/tenant-isolation.test.ts` — "API Key Scope" suite

### Agents (`agents`)

- Agents belong to one tenant (`tenant_id` column)
- `GET /api/v1/agents` returns only the authenticated tenant's agents
- Agent API keys are generated per-agent and scoped to the agent's tenant
- Cross-tenant agent ID lookups return 404 (not 403, to avoid ID enumeration)
- **Test:** `tests/isolation/tenant-isolation.test.ts` — "Agent Isolation" suite

### Webhooks (`webhooks`)

- `tenant_id` is set at creation time from authenticated credentials
- Delivery: only the owning tenant's audit events trigger webhooks
- Webhook secrets are stored encrypted; never returned in API responses
- Cross-tenant webhook deletion attempt returns 404
- **Test:** `tests/isolation/tenant-isolation.test.ts` — "Webhook Isolation" suite

### SCIM Users & Groups (`scim_users`, `scim_groups`, `scim_group_members`)

- All SCIM tables include `tenant_id` column
- SCIM bearer tokens (`scim_tokens`) are issued per-tenant and stored as SHA-256 hashes
- All SCIM endpoints (`/api/scim/v2/Users`, `/api/scim/v2/Groups`) enforce tenant scope
- SCIM filter queries (`?filter=userName eq "..."`) are tenant-scoped before filtering
- Cross-tenant user/group access returns 404
- Group membership cannot cross tenant boundaries (FK + tenant_id on `scim_group_members`)
- **Test:** `tests/isolation/scim-isolation.test.ts` — full SCIM isolation suite

### SSE Streams (`/api/v1/audit/stream`)

- SSE connections require JWT authentication
- Server-side event router is keyed by `tenantId` from JWT
- Events are pushed only to SSE connections authenticated for the emitting tenant
- New events from Tenant B are **never pushed** to Tenant A's connection
- SSE connection close/cleanup is isolated (no shared broadcast)
- **Test:** `tests/isolation/sse-isolation.test.ts` — "Event Stream Tenant Scoping" suite

### Approvals (`approvals`)

- `tenant_id` is set at creation and enforced on all reads/writes
- Slack/Teams HITL notifications are tenant-scoped via tenant's own webhook config
- **Test:** `tests/isolation/tenant-isolation.test.ts` — "Approval Isolation" suite

### Analytics (`analytics`)

- Aggregation queries include `WHERE tenant_id = ?`
- Materialized views (if used) are refreshed per-tenant
- Platform-wide analytics are admin-only (not exposed to tenant API)
- **Test:** `tests/isolation/tenant-isolation.test.ts` — "Analytics Isolation" suite

### Compliance Reports (`compliance_reports`)

- Reports are generated per-tenant and stored with `tenant_id`
- No cross-tenant comparison or benchmark data exposed
- **Test:** `tests/isolation/tenant-isolation.test.ts` — "Compliance Report Isolation" suite

---

## Defense in Depth

### Layer 1: Authentication (Entry Point)

Every request must carry a valid credential. No public endpoints exist that return
tenant data without authentication.

```typescript
// middleware/auth.ts — enforced on all /api/v1/* and /api/scim/v2/* routes
app.use(requireTenantAuth);  // Rejects without API key or JWT
```

### Layer 2: Middleware Tenant Resolution

The auth middleware resolves the tenant from the credential and attaches it to `req.tenantId`.
Routes read `req.tenantId` — they **never** read `tenantId` from request parameters.

```typescript
// All routes use:
const tenantId = req.tenantId!;  // Set by auth middleware, never from req.params
```

### Layer 3: Database Queries Always Include Tenant Filter

Every database read/write operation takes `tenantId` as an explicit parameter:

```typescript
// Good ✅
const events = await db.getAuditEvents(req.tenantId!, limit, offset);

// Bad — would be rejected in code review ❌
const events = await db.get('SELECT * FROM audit_events WHERE id = ?', [id]);
```

### Layer 4: SCIM-Specific Token Isolation

SCIM tokens are separate from main API keys/JWTs. They are:
- Generated with `crypto.randomBytes(32)` (256-bit entropy)
- Stored only as SHA-256 hashes (never plaintext)
- Returned once at creation time, never again
- Revocable independently of API keys

### Layer 5: Audit Trail for All Privileged Operations

All SCIM provisioning events, policy changes, and credential operations are logged
to the tenant's tamper-evident audit chain.

---

## Running Isolation Tests

```bash
# Run all isolation tests
./tests/isolation/run-isolation.sh

# Against a remote environment
BASE_URL=https://api.agentguard.tech ./tests/isolation/run-isolation.sh

# Run a specific suite
npx tsx --test tests/isolation/tenant-isolation.test.ts
npx tsx --test tests/isolation/scim-isolation.test.ts
npx tsx --test tests/isolation/sse-isolation.test.ts
```

### Test Coverage Matrix

| Resource | Cross-Read | Cross-Write | Cross-Delete | Auth Required |
|----------|-----------|-------------|--------------|---------------|
| Audit logs | ✅ Tested | N/A | N/A | ✅ Tested |
| Policy | ✅ Tested | ✅ Tested | N/A | ✅ Tested |
| API Keys | ✅ Tested | N/A | N/A | ✅ Tested |
| Agents | ✅ Tested | N/A | ✅ Tested | ✅ Tested |
| Webhooks | ✅ Tested | N/A | ✅ Tested | ✅ Tested |
| SCIM Users | ✅ Tested | ✅ Tested | ✅ Tested | ✅ Tested |
| SCIM Groups | ✅ Tested | ✅ Tested | N/A | ✅ Tested |
| SCIM Tokens | ✅ Tested | N/A | N/A | ✅ Tested |
| SSE Stream | ✅ Tested | N/A | N/A | ✅ Tested |
| Approvals | ✅ Tested | N/A | N/A | ✅ Tested |
| Analytics | ✅ Tested | N/A | N/A | ✅ Tested |
| Compliance | ✅ Tested | N/A | N/A | ✅ Tested |

---

## Security Considerations

### Tenant ID Enumeration

To prevent tenant ID enumeration, cross-tenant resource access returns **404 Not Found**
rather than **403 Forbidden**. This prevents an attacker from confirming whether a
resource exists in another tenant.

### Timing Attacks

Credential lookup uses constant-time comparison (bcrypt verify + SHA-256 hash lookup)
to prevent timing-based tenant enumeration.

### SQL Injection Prevention

All database queries use parameterized queries (no string concatenation). SQLite uses
`better-sqlite3` prepared statements; PostgreSQL uses parameterized pool queries.

### Shared Infrastructure

Although tenants share the same database instance and API server, all data access is
logically isolated via `tenant_id`. For customers requiring physical isolation,
AgentGuard Self-Hosted provides a dedicated deployment model.

---

## Compliance Mapping

| Requirement | How AgentGuard Addresses It |
|-------------|----------------------------|
| SOC 2 CC6.3 — Logical access controls | Tenant-scoped auth on every endpoint |
| GDPR Art. 25 — Data protection by design | Default deny; tenant scope enforced at DB layer |
| ISO 27001 A.9 — Access control | Role-based access + tenant isolation documented here |
| HIPAA §164.312(a) — Access control | API key + JWT auth required; no anonymous access |

---

## See Also

- [Load Testing Guide](LOAD_TESTING.md) — performance validation at scale
- [SCIM 2.0 Provisioning](../api/routes/scim.ts) — implementation details
- [Wave 9 Summary](WAVE9_SCALE.md) — what was built in Wave 9
