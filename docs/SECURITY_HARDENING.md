# AgentGuard — Security Hardening Guide

Production security reference for AgentGuard deployments. Follow this guide before going live.

---

## Table of Contents

1. [Rate Limiting](#1-rate-limiting)
2. [Brute-Force & Lockout Protection](#2-brute-force--lockout-protection)
3. [Input Validation](#3-input-validation)
4. [Security Headers](#4-security-headers)
5. [CORS Configuration](#5-cors-configuration)
6. [SQL Injection Prevention](#6-sql-injection-prevention)
7. [XSS Prevention](#7-xss-prevention)
8. [Secrets Rotation](#8-secrets-rotation)
9. [Audit & Monitoring](#9-audit--monitoring)

---

## 1. Rate Limiting

AgentGuard uses a sliding-window rate limiter (Redis-backed, in-memory fallback) with multiple per-purpose buckets.

### Rate Limit Buckets

| Bucket | Limit | Applies To |
|--------|-------|-----------|
| `unauth` | 10 req/min | Unauthenticated requests (no API key) |
| `auth` | 100 req/min | Authenticated requests (valid API key) |
| `auth-ep` | 20 req/min | Auth endpoints: `/api/v1/signup`, `/api/v1/auth/*`, `/api/v1/sso/*` |
| `scim` | 30 req/min | SCIM provisioning: `/api/scim/v2/*` |

Signup-specific: **5 signups/hour/IP** (separate in-memory bucket, no Redis dependency).

Recovery endpoints: **2 recovery requests/hour/IP**.

### Rate Limit Headers

Every response includes:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 94
Retry-After: 60   (only on 429)
```

### Redis Configuration

For production deployments, set `REDIS_URL` to enable distributed rate limiting across multiple API instances:

```bash
REDIS_URL=redis://:yourpassword@redis-host:6379/0
```

Without `REDIS_URL`, the limiter uses in-memory counters (single-instance only — not suitable for horizontally scaled deployments).

### Tuning Rate Limits

Override defaults via environment variables (restart required):

```bash
# Increase for high-traffic tenants
RATE_LIMIT_AUTH=200
RATE_LIMIT_UNAUTH=20
RATE_LIMIT_AUTH_ENDPOINT=30
RATE_LIMIT_SCIM=60
```

---

## 2. Brute-Force & Lockout Protection

### Login Lockout

Failed authentication attempts are tracked per client IP:

| Parameter | Value |
|-----------|-------|
| Max failures | **5** per window |
| Window | 15 minutes |
| Cooldown | 30 minutes |
| Storage | Redis (in-memory fallback) |

After 5 consecutive failures within 15 minutes, the IP is locked out for 30 minutes. Successful authentication clears the counter.

**Response on lockout (HTTP 429):**

```json
{
  "error": "rate_limit_exceeded",
  "retryAfter": 1800,
  "message": "Too many failed authentication attempts. Please try again later.",
  "limit": 5,
  "window": "15m"
}
```

### Protected Endpoints

Brute-force middleware runs on:
- `POST /api/v1/signup`
- `POST /api/v1/evaluate`
- `POST /api/v1/evaluate/batch`
- `POST /api/v1/mcp/evaluate`

### Manual IP Unblock (Emergency)

If a legitimate user is locked out due to misconfigured clients:

```bash
# Via Redis CLI
redis-cli DEL "bf:block:<ip>" "bf:count:<ip>" "bf:first:<ip>"

# Example
redis-cli DEL "bf:block:203.0.113.42" "bf:count:203.0.113.42" "bf:first:203.0.113.42"
```

---

## 3. Input Validation

### Zod Schema Coverage

All API input bodies are validated with Zod schemas defined in `api/schemas.ts`:

| Endpoint | Schema |
|----------|--------|
| `POST /api/v1/evaluate` | `EvaluateRequestSchema` |
| `POST /api/v1/evaluate/batch` | `BatchEvaluateRequestSchema` |
| `POST /api/v1/signup` | `SignupRequestSchema` |
| `POST /api/v1/killswitch` | `KillswitchRequestSchema` |
| `POST /api/v1/agents` | `CreateAgentSchema` |
| `POST /api/v1/webhooks` | `WebhookSchema` |
| `POST /api/v1/policies` | `PolicySchema` |
| SCIM Users/Groups | Inline Zod validation |

Validation failures return HTTP 400 with a structured error:

```json
{ "error": "tool is required and must be a string" }
```

### Agent Name Allowlist

Agent names are validated against a strict allowlist pattern:

```
Pattern: /^[a-zA-Z0-9 \-_.()]+$/
Max length: 200 characters
```

Blocked patterns include HTML tags, `javascript:` URIs, event handlers (`onerror=`), SQL keywords (`UNION SELECT`, `DROP TABLE`), and comment sequences (`--`, `/*`).

### Body Size Limits

```
Standard JSON body: 50 KB
Stripe webhook: 1 MB
GitHub webhook: 2 MB
```

---

## 4. Security Headers

Headers are set by [Helmet.js](https://helmetjs.github.io/) plus custom middleware.

### Current Headers

| Header | Value |
|--------|-------|
| `X-DNS-Prefetch-Control` | `off` |
| `X-Frame-Options` | `SAMEORIGIN` (Helmet default) |
| `X-Content-Type-Options` | `nosniff` |
| `X-XSS-Protection` | `0` (disabled — modern browsers use CSP) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` (Helmet default) |

> **Note:** `contentSecurityPolicy` is disabled for the API server (it does not serve HTML). If you add a dashboard served from the same origin, enable CSP.

### Dashboard CSP

If your dashboard is served from the same Express app, add:

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],   // tighten after nonce implementation
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.agentguard.tech"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));
```

### HSTS Preloading

For maximum HSTS coverage, add `preload` to the Helmet config:

```typescript
app.use(helmet({
  hsts: {
    maxAge: 31536000,         // 1 year
    includeSubDomains: true,
    preload: true,            // submit to https://hstspreload.org
  },
}));
```

---

## 5. CORS Configuration

Allowed origins are explicitly allowlisted. Unknown origins receive no CORS headers (not a 500).

### Default Allowlist

```
https://agentguard.tech
https://www.agentguard.tech
https://app.agentguard.tech
https://demo.agentguard.tech
https://docs.agentguard.tech
```

### Adding Origins

Use the environment variable (comma-separated, no trailing slashes):

```bash
CORS_ORIGINS=https://your-custom-domain.com,https://partner.example.com
```

### Wildcard Subdomains (Enterprise)

For self-hosted enterprise deployments with dynamic subdomains, use an origin validator function:

```typescript
const TENANT_DOMAIN = process.env['TENANT_BASE_DOMAIN'] ?? '';
cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl
    const allowed = ALLOWED_ORIGINS.includes(origin) ||
      (TENANT_DOMAIN && origin.endsWith(`.${TENANT_DOMAIN}`));
    cb(null, allowed ? origin : false);
  },
})
```

---

## 6. SQL Injection Prevention

AgentGuard uses parameterized queries throughout. All database access goes through:

1. **Prisma ORM** (`packages/api/`) — parameterized by design; never uses raw string concatenation.
2. **Custom DB layer** (`api/db-sqlite.ts`, `api/db-postgres.ts`) — all queries use `?` placeholders (SQLite) or `$1` placeholders (PostgreSQL).

### Verification Checklist

Run this audit before production:

```bash
# Search for string concatenation in SQL queries (red flags)
grep -rn "query\s*=\s*['\`].*\${" api/ packages/api/src/ --include="*.ts"

# Search for raw template literals in DB calls
grep -rn "db\.all\|db\.exec\|db\.get\|db\.run" api/ --include="*.ts" | grep "\`\|+\s*"
```

Expected result: **zero matches**. All DB calls should use bound parameters.

### Row-Level Security (PostgreSQL)

All tables have RLS enabled via `packages/api/prisma/rls-migration.sql`. This is a defence-in-depth layer: even if application code omits a `WHERE tenantId =` clause, the database rejects cross-tenant reads.

See `DATABASE_OPS.md` for migration instructions.

---

## 7. XSS Prevention

### Dashboard

- **React escaping:** All user-controlled values are rendered via JSX (escaped by default). No use of `dangerouslySetInnerHTML`.
- **API responses:** JSON responses. No HTML rendering server-side.
- **URL parameters:** Never reflected into HTML responses.

### Input Sanitization

Agent names go through a two-pass filter:

1. **Blocklist check:** Reject strings matching XSS/SQLi patterns (HTML tags, `javascript:`, event handlers, SQL keywords).
2. **Allowlist check:** Only `[a-zA-Z0-9 \-_.()]` characters permitted.

For any free-text user input rendered in the dashboard (e.g., agent descriptions, policy names), apply DOMPurify on the frontend before display.

---

## 8. Secrets Rotation

Rotate secrets without downtime using the blue/green strategy below.

### 8.1 JWT Signing Keys

JWT tokens sign authentication sessions. Rotation requires a brief dual-validation window.

**Step 1: Generate new key**
```bash
openssl rand -base64 64
```

**Step 2: Add new key alongside old (dual validation)**

Set both `JWT_SECRET` and `JWT_SECRET_OLD` in your environment:
```bash
JWT_SECRET=<new-key>
JWT_SECRET_OLD=<current-key>
```

Update `api/middleware/jwt-auth.ts` to try both:
```typescript
const secrets = [process.env.JWT_SECRET, process.env.JWT_SECRET_OLD].filter(Boolean);
// verify token against each secret until one succeeds
```

**Step 3: Deploy new version** — existing sessions (signed with old key) still validate.

**Step 4: Wait for session TTL to pass** (default: 7 days).

**Step 5: Remove `JWT_SECRET_OLD`** and redeploy.

**Step 6: Revoke old key** — sessions signed with old key now fail (all users re-auth).

---

### 8.2 API Keys (Tenant)

API keys are stored as SHA-256 hashes. Rotation is self-service via the signup endpoint:

```bash
# Send signup request with same email — rotates key automatically
curl -X POST https://api.agentguard.tech/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"name": "My Tenant", "email": "me@example.com"}'
```

The response includes the new key. The old key is immediately deactivated.

**Admin rotation (all tenant keys):**
```sql
-- Deactivate all keys for a tenant
UPDATE api_keys SET is_active = 0, deactivated_at = CURRENT_TIMESTAMP
WHERE tenant_id = '<tenant-id>' AND is_active = 1;
```

---

### 8.3 SCIM Bearer Tokens

SCIM tokens authenticate IdP connectors (Okta, Azure AD).

**Step 1: Issue a new token**
```bash
curl -X POST https://api.agentguard.tech/api/scim/v2/tokens \
  -H "Authorization: Bearer ag_live_<your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"name": "okta-prod-v2"}'
```

**Step 2: Update the token in your IdP connector** (Okta: Settings → Provisioning → Authentication).

**Step 3: Revoke the old token**
```bash
# List tokens to find the old one
curl https://api.agentguard.tech/api/scim/v2/tokens \
  -H "Authorization: Bearer ag_live_<your-api-key>"

# Revoke by ID
curl -X DELETE https://api.agentguard.tech/api/scim/v2/tokens/<token-id> \
  -H "Authorization: Bearer ag_live_<your-api-key>"
```

**Step 4: Verify** — trigger a test sync in the IdP and confirm it succeeds with the new token.

---

### 8.4 Webhook Secrets

Outgoing webhooks are HMAC-SHA256 signed. The signature is in the `X-AgentGuard-Signature` header.

**Step 1: Generate a new secret**
```bash
openssl rand -hex 32
```

**Step 2: Update the webhook**
```bash
curl -X PUT https://api.agentguard.tech/api/v1/webhooks/<webhook-id> \
  -H "Authorization: Bearer ag_live_<your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"secret": "<new-secret>"}'
```

**Step 3: Update your receiver** to validate with the new secret before the old one is removed.

**Step 4: Use dual validation during the transition window:**
```python
import hmac, hashlib

def verify_webhook(payload: bytes, signature: str, secrets: list[str]) -> bool:
    for secret in secrets:
        expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
        if hmac.compare_digest(f"sha256={expected}", signature):
            return True
    return False
```

**Step 5: Remove old secret from your receiver** after confirming all in-flight webhooks have been processed (typically 1 hour).

---

### 8.5 Database Credentials

**Step 1: Create new DB user**
```sql
CREATE USER agentguard_api_v2 WITH PASSWORD '<new-strong-password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agentguard_api_v2;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO agentguard_api_v2;
```

**Step 2: Update `DATABASE_URL` in your secrets store** (Azure Key Vault / 1Password / Vault).

**Step 3: Rolling restart API containers** — new containers use new credentials.

**Step 4: Revoke old user** once all old containers are terminated:
```sql
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM agentguard_api_v1;
DROP USER agentguard_api_v1;
```

---

## 9. Audit & Monitoring

### Audit Chain Integrity

Every decision event is hash-chained. Verify integrity:

```bash
GET /api/v1/audit/verify
Authorization: Bearer ag_live_<key>
```

Returns `{ "valid": true, "events": 4821 }` if the chain is intact.

### Failed Auth Monitoring

Watch for brute-force attempts in logs:

```bash
# Grep for lockout events
docker logs agentguard-api 2>&1 | grep "rate_limit_exceeded" | tail -50

# Or via your log aggregator (structured JSON)
# Filter: error="rate_limit_exceeded" AND window="15m"
```

### Security Alerts

Configure webhook alerts for:
- Kill switch activation
- High decision block rates (>20% in 5 min)
- Anomaly detection triggers

See `docs/LAUNCH_GUIDE.md` for alerting setup.

---

*Last updated: Wave 12 Production Hardening. See git log for revision history.*
