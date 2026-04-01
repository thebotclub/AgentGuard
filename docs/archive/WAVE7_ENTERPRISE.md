# Wave 7: Enterprise Features — SSO/OIDC, OpenTelemetry, Policy-as-Code GitOps

> Implemented: 2026-03-22

Wave 7 delivers three major enterprise-grade capabilities that unlock larger deals and satisfy enterprise security/compliance requirements.

---

## Task 1: SSO / OIDC Integration

### Overview
Full enterprise SSO support via OIDC Authorization Code Flow with PKCE, plus basic SAML 2.0.

### Supported Identity Providers
| Provider | Protocol | Auto-Config |
|----------|----------|-------------|
| Okta | OIDC | ✅ Discovery URL auto-derived |
| Microsoft Azure AD / Entra ID | OIDC | ✅ Discovery URL auto-derived |
| Google Workspace | OIDC | ✅ Discovery URL auto-derived |
| Auth0 | OIDC | ✅ Discovery URL auto-derived |
| Custom OIDC | OIDC | Discovery URL required |
| Any SAML 2.0 IdP | SAML | IdP metadata XML required |

### New Files
- `api/lib/oidc-provider.ts` — OIDC discovery, PKCE code flow, JWKS token validation, user extraction, role mapping
- `api/lib/saml-provider.ts` — SAML 2.0 SP-initiated flow, IdP metadata parser, assertion validation
- `api/routes/sso.ts` — **Replaced/expanded**: full OIDC + SAML routes
- `packages/dashboard/src/app/settings/sso/page.tsx` — SSO configuration dashboard page

### API Routes
```
GET  /api/v1/auth/sso/config       — Get SSO configuration (secrets masked)
PUT  /api/v1/auth/sso/config       — Update SSO configuration
POST /api/v1/auth/sso/test         — Test IdP connectivity / validate metadata
GET  /api/v1/auth/sso/authorize    — Initiate SSO (redirect to IdP)
POST /api/v1/auth/sso/callback     — Handle OIDC/SAML callback, provision user
GET  /api/v1/auth/sso/callback     — Handle GET-style OIDC callback (some IdPs)
POST /api/v1/sso/configure         — Legacy configure endpoint (backwards compat)
GET  /api/v1/sso/config            — Legacy get endpoint (backwards compat)
DELETE /api/v1/sso/config          — Remove SSO configuration
```

### OIDC Flow
1. `GET /api/v1/auth/sso/authorize?tenant_id=xxx` → generates PKCE verifier + nonce, stores state, redirects to IdP
2. IdP authenticates user, redirects to callback with `?code=...&state=...`
3. `POST/GET /api/v1/auth/sso/callback` → exchanges code for tokens, validates ID token against JWKS, maps claims to role
4. User is provisioned (upserted) in `sso_users` table
5. Session returned to caller; dashboard flow redirects with `return_to`

### SAML 2.0 Flow
1. `GET /api/v1/auth/sso/authorize` → generates AuthnRequest, deflates+base64 encodes, redirects to IdP SSO URL
2. IdP authenticates, POSTs SAMLResponse to ACS URL (`/api/v1/auth/sso/callback`)
3. Response decoded, signature validated, assertions extracted, timing checked
4. User provisioned with mapped role

### Role Mapping (OIDC)
Priorities:
1. `roles` claim contains `admin`/`AgentGuard-Admin` → admin role
2. `roles` claim contains `member`/`AgentGuard-Member` → member role
3. Configured `adminGroup` in `groups` claim → admin role
4. Configured `memberGroup` in `groups` claim → member role
5. Default → viewer

### Database Changes
New tables: `sso_states` (PKCE/nonce storage), `sso_users` (provisioned IdP users)
Expanded columns on `sso_configs`: `protocol`, `discovery_url`, `redirect_uri`, `scopes`, `force_sso`, `role_claim_name`, `admin_group`, `member_group`, `idp_metadata_xml`, `sp_entity_id`, `updated_at`

### Security
- PKCE S256 prevents authorization code interception
- Nonce validation prevents replay attacks
- State parameter validated via DB lookup (10-minute TTL)
- Client secrets AES-256-GCM encrypted at rest
- Force SSO flag disables password login for tenant

### Dashboard
New page: `/settings/sso` — configure provider, credentials, role mapping, force SSO, test connection, view endpoint URLs.

---

## Task 2: OpenTelemetry Span Export

### Overview
Every policy decision is exported as an OTel span, giving full observability in Datadog, Honeycomb, Grafana Tempo, Jaeger, and any OTLP-compatible backend.

### New Files
- `api/lib/otel-exporter.ts` — OTLP/HTTP exporter, batch processor, `AgentGuardOtelExporter` singleton

### Configuration
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318    # Required to enable
OTEL_EXPORTER_OTLP_PROTOCOL=http/json               # Default: http/json
OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=abc123  # Auth headers
OTEL_SERVICE_NAME=agentguard-api                     # Default service name
OTEL_TRACES_EXPORTER=otlp                            # otlp | console | none
```

### Platform-Specific Quickstart
```bash
# Datadog
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
DD_API_KEY=your-key

# Honeycomb
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
HONEYCOMB_API_KEY=your-key
OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=your-key

# Grafana Tempo
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318

# Jaeger
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318

# Console (dev/debug)
OTEL_TRACES_EXPORTER=console
```

### Span Attributes
Every `policy.evaluate <tool_name>` span includes:

| Attribute | Description |
|-----------|-------------|
| `agentguard.agent_id` | Evaluating agent ID |
| `agentguard.tenant_id` | Tenant identifier |
| `agentguard.session_id` | Session UUID |
| `agentguard.tool_name` | Tool being evaluated |
| `agentguard.decision` | `allow` / `block` / `require_approval` / `monitor` |
| `agentguard.risk_tier` | `critical` / `high` / `medium` / `low` / `safe` |
| `agentguard.risk_score` | Numeric 0–100 |
| `agentguard.rule_id` | Matched rule ID |
| `agentguard.latency_ms` | Evaluation latency in ms |
| `agentguard.pii_detected` | Boolean |
| `agentguard.pii_entity_count` | Number of PII entities found |

### Batching
Spans are batched (default: 100/batch or 5s flush interval) to minimize API calls. The batch processor auto-drains on process shutdown. Failed exports are logged and dropped (not retried) to avoid memory leaks.

### Instrumentation Point
`api/routes/evaluate.ts` — `recordPolicyDecision()` called immediately after each evaluation, before the response is sent. OTel export never blocks or throws (wrapped in try-catch).

---

## Task 3: Policy-as-Code Git Webhook (GitOps)

### Overview
GitOps-style policy management: push YAML files to a GitHub repo → policies sync automatically.

### New Files
- `api/routes/policy-git-webhook.ts` — GitHub webhook receiver + sync engine + rollback

### API Routes
```
PUT    /api/v1/policies/git/config         — Configure git webhook (repo URL, secret, branch, dir)
GET    /api/v1/policies/git/config         — Get configuration + webhook setup instructions
DELETE /api/v1/policies/git/config         — Remove configuration
GET    /api/v1/policies/git/logs           — Sync history (per tenant)
POST   /api/v1/policies/git/sync           — Manual sync trigger
POST   /api/v1/policies/webhook/github     — Receive GitHub push webhook (HMAC-verified)
POST   /api/v1/policies/rollback/:version  — Rollback to a previous policy version
```

### Policy Directory Convention
```
your-repo/
  agentguard/
    policies/
      data-exfiltration.yaml
      tool-restrictions.yaml
      pii-protection.yaml
```

Each YAML file:
```yaml
id: data-exfiltration          # Optional — defaults to filename without extension
name: "Data Exfiltration Rules"
rules:
  - id: block-email-exfil
    tool: send_email
    action: block
    conditions:
      - field: params.to
        operator: not_in
        value: ["@yourcompany.com"]
    priority: 100
  - id: block-file-upload
    tool: upload_file
    action: require_approval
    priority: 90
```

### GitHub Webhook Setup
1. Configure in AgentGuard: `PUT /api/v1/policies/git/config`
2. GitHub repo → Settings → Webhooks → Add webhook:
   - URL: `https://api.agentguard.tech/api/v1/policies/webhook/github?tenant_id=YOUR_TENANT_ID`
   - Content type: `application/json`
   - Secret: _(your `webhookSecret`)_
   - Events: Just the **push** event
3. Push YAML files to `agentguard/policies/*.yaml` on your configured branch
4. Policies sync automatically within seconds

### Diff Detection
- Each YAML file's rules are serialized to JSON and hash-compared with current policy
- Only changed/new rules trigger an update
- Unchanged rules are counted as `skipped`

### Rollback
Every successful sync saves a `policy_versions` record. Rollback via:
```
POST /api/v1/policies/rollback/3?policyId=git-sync
```
This:
1. Fetches version 3's `policy_data`
2. Sets it as the current active policy
3. Creates a new version entry (for audit trail)
4. Records an audit event with rollback metadata

### Security
- HMAC-SHA256 signature verification (`X-Hub-Signature-256`)
- `crypto.timingSafeEqual` prevents timing attacks
- GitHub payload parsed only after signature verification
- `tenant_id` required as query parameter (webhook URL is tenant-scoped)
- Raw body captured for signature verification before JSON parse

### Audit Trail
Every sync and rollback creates an `audit_events` row:
- `tool`: `policy.git_sync` or `policy.rollback`
- `reason`: commit SHA, files changed, counts
- Standard chained hash integrity

### Database Changes
New tables: `git_webhook_configs`, `git_sync_logs`

---

## Summary

| Feature | Status | Key Files |
|---------|--------|-----------|
| OIDC Provider (Okta/Azure/Google) | ✅ Complete | `lib/oidc-provider.ts`, `routes/sso.ts` |
| SAML 2.0 (SP-initiated) | ✅ Complete | `lib/saml-provider.ts`, `routes/sso.ts` |
| SSO Dashboard Page | ✅ Complete | `dashboard/src/app/settings/sso/page.tsx` |
| User Provisioning | ✅ Complete | `sso_users` table, `upsertSsoUser()` |
| Force SSO | ✅ Complete | `force_sso` config flag |
| OTel OTLP/HTTP Exporter | ✅ Complete | `lib/otel-exporter.ts` |
| OTel Batching | ✅ Complete | `OtelBatchProcessor` (100/batch, 5s flush) |
| Policy Decision Instrumentation | ✅ Complete | `routes/evaluate.ts` |
| GitHub Webhook Receiver | ✅ Complete | `routes/policy-git-webhook.ts` |
| YAML Policy Sync | ✅ Complete | `syncPoliciesFromGithub()` |
| Diff Detection | ✅ Complete | Content hash comparison |
| Policy Rollback API | ✅ Complete | `POST /api/v1/policies/rollback/:version` |
| Sync Audit Log | ✅ Complete | `git_sync_logs` table + audit events |

Total new code: ~2,500 lines across 6 new files + 5 modified files.
