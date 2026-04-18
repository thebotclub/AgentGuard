# Enterprise Security

AgentGuard is built with security and compliance as a first-class concern. This document covers data handling, encryption, audit integrity, compliance mappings, and incident response.

---

## Table of Contents

1. [Data Handling](#data-handling)
2. [Encryption](#encryption)
3. [Audit Trail Integrity](#audit-trail-integrity)
4. [Compliance Mappings](#compliance-mappings)
5. [Access Control](#access-control)
6. [Vulnerability Management](#vulnerability-management)
7. [Incident Response](#incident-response)
8. [Third-Party Security](#third-party-security)

---

## Data Handling

### What We Collect

AgentGuard processes the following data in the normal course of operation:

| Data Type | Source | Retention | Purpose |
|---|---|---|---|
| Agent tool calls | API (`/evaluate`) | Per-tier (30 days – 7 years) | Policy enforcement & audit |
| Policies (YAML) | Dashboard / API | Until deleted | Policy evaluation |
| Agent metadata | API (`/agents`) | Until deleted | Agent management |
| API keys | API (`/auth`) | Hashed (bcrypt) — never stored plaintext | Authentication |
| Tenant information | Signup flow | Until account deleted | Account management |
| Webhook URLs | API (`/webhooks`) | Encrypted at rest | Alerting integrations |

### What We Don't Collect

- **Model outputs or prompts** — AgentGuard evaluates tool calls, not LLM inputs/outputs
- **Training data** — we never use your data to train models
- **Network payloads** — tool call bodies are logged in full per policy, but we don't inspect or store network traffic beyond what the API receives
- **Personal information** — unless your agent submits it in a tool call (PII detection can identify and redact this)

### Data Isolation

Every tenant's data is strictly isolated:

- **Database:** All queries include `WHERE tenant_id = $authenticatedTenantId` — no cross-tenant access is possible
- **Application:** No endpoint accepts a `tenant_id` parameter from the client; it's always derived from the authenticated credential
- **Encryption at rest:** Integration secrets (webhook URLs, API tokens) are encrypted with AES-256 using a per-deployment key
- **In transit:** All connections use TLS 1.2+

See [Data Isolation Architecture](/docs/DATA_ISOLATION.md) for the full technical specification.

### Data Subject Requests

GDPR data subject access and deletion requests are supported. Contact us at `privacy@thebot.club` with your tenant ID. See the [Compliance Roadmap](/docs/compliance-roadmap.md) for automation timeline.

---

## Encryption

### At Rest

| Data | Encryption | Details |
|---|---|---|
| PostgreSQL database | AES-256 (cloud) | Azure managed encryption; self-hosted uses filesystem encryption |
| Integration secrets | AES-256-CBC | Encrypted with `INTEGRATION_ENCRYPTION_KEY` before storage |
| API keys | bcrypt (cost 12) | One-way hash — never reversible |
| Audit events | Database encryption | Inherits from PostgreSQL encryption layer |

### In Transit

| Connection | Protocol | Details |
|---|---|---|
| API (cloud) | TLS 1.2+ | Cloudflare SSL Full (Strict) |
| Dashboard (cloud) | TLS 1.2+ | Cloudflare SSL Full (Strict) |
| SDK → API | HTTPS | TLS 1.2+ enforced |
| Self-hosted API | HTTP (internal) | Terminate TLS at reverse proxy (Nginx/Caddy) |

### Key Management

| Key | Rotation | Storage |
|---|---|---|
| `JWT_SECRET` | Rotate per deployment | Environment variable / secrets manager |
| `INTEGRATION_ENCRYPTION_KEY` | Rotate per deployment | Environment variable / secrets manager |
| `ADMIN_KEY` | Rotate periodically | Environment variable / secrets manager |
| Cloud encryption keys | Managed by provider | Azure Key Vault / KMS |
| TLS certificates | Auto-renewed (cloud) | Cloudflare; Let's Encrypt (self-hosted) |

> **Best practice:** Store all secrets in a secrets manager (Azure Key Vault, HashiCorp Vault, 1Password), never in plaintext `.env` files.

---

## Audit Trail Integrity

AgentGuard's audit log is designed to be tamper-evident by construction.

### SHA-256 Hash Chain

Every audit event contains a hash of the previous event:

```
event[N].previous_hash = SHA-256(event[N-1])
event[N].hash = SHA-256(event[N] || event[N].previous_hash)
```

This creates an unbroken chain. If any event is modified, deleted, or inserted, the chain breaks and the tamper is detectable:

```bash
# Verify audit trail integrity
curl -s https://api.agentguard.tech/api/v1/audit/verify \
  -H "x-api-key: $API_KEY" \
  | jq '.valid'
# true = chain is intact
```

### Immutability Guarantees

| Property | Mechanism |
|---|---|
| Append-only | No UPDATE or DELETE operations on audit events table |
| Tamper detection | SHA-256 hash chain verified on read |
| Ordering | Events stored with monotonically increasing sequence numbers |
| Completeness | Gap detection — alerts if sequence numbers are missing |
| Export | JSON/CSV export for SIEM integration (Splunk, Datadog, Elastic) |

### Audit Event Schema

Each audit event captures:

- `event_id` — unique identifier
- `trace_id` — SDK correlation ID (links to the originating request)
- `tenant_id` — owning tenant
- `agent_id` — originating agent
- `decision` — ALLOW, BLOCK, or HITL
- `tool_name` — tool being called
- `action` — full tool call parameters
- `policy_name` — policy that was evaluated
- `risk_score` — computed risk score (0–100)
- `timestamp` — UTC, millisecond precision
- `hash` — SHA-256 of this event + previous hash
- `previous_hash` — link in the chain

---

## Compliance Mappings

### SOC 2 Type II

AgentGuard is on track for SOC 2 Type II certification. Current readiness: **82% of required controls implemented**.

| Trust Service | Status | Details |
|---|---|---|
| CC1 — Control Environment | ⚠️ In progress | Formal audit committee needed |
| CC2 — Communication & Information | ✅ Implemented | Structured logging, public docs |
| CC3 — Risk Assessment | ✅ Implemented | Threat model, pentest results, remediation plans |
| CC4 — Monitoring Activities | ✅ Implemented | Continuous monitoring, anomaly detection |
| CC5 — Control Activities | ✅ Implemented | RBAC, JWT auth, API key auth, rate limiting, CSRF |
| CC6 — Logical & Physical Access | ✅ Implemented | Tenant isolation, bcrypt keys, TLS everywhere |
| CC7 — System Operations | ✅ Implemented | Health checks, runbooks, backup/restore |
| CC8 — Change Management | ✅ Implemented | CI/CD, code review, staged rollouts |
| CC9 — Risk Mitigation | ⚠️ In progress | Incident response formalization |

📄 Full assessment: [SOC 2 Readiness Report](/docs/enterprise/SOC2-READINESS.md)

### HIPAA

HIPAA BAA (Business Associate Agreement) availability is planned for Q4 2026. Current capabilities relevant to HIPAA:

- ✅ Audit trail immutability (hash-chained)
- ✅ Access control (RBAC, scoped API keys)
- ✅ Data encryption (at rest and in transit)
- ✅ Tenant isolation (database-level, RLS)
- ⏳ BAA agreement availability
- ⏳ PHI-specific policy templates

📄 Roadmap: [Compliance Roadmap](/docs/compliance-roadmap.md)

### EU AI Act

Pre-built compliance templates mapped to EU AI Act articles:

| Article | AgentGuard Capability |
|---|---|
| Art. 5 (Prohibited practices) | Kill switch, content blocking rules |
| Art. 9 (Risk management) | Risk scoring, anomaly detection |
| Art. 12 (Transparency) | Audit trail, decision logging |
| Art. 14 (Human oversight) | HITL gates, Slack approval workflows |

### OWASP Top 10 for Agentic AI

Full mapping available. Auto-generated OWASP compliance reports can be produced from the live audit trail.

📄 [OWASP Agentic Mapping](/docs/OWASP_AGENTIC_MAPPING.md)

---

## Access Control

### Authentication Methods

| Method | Use Case | Security |
|---|---|---|
| API key (`x-api-key`) | Service-to-service | Bcrypt-hashed, constant-time comparison |
| JWT Bearer token | User sessions, SSO | RS256/HS256, JWKS verification |
| SSO / SAML | Enterprise identity | JWKS endpoint verification (Enterprise tier) |

### Authorization Model

- **Tenant isolation:** Every resource scoped by `tenant_id` from the authenticated credential
- **RBAC:** Role-based access for multi-user tenants (Enterprise tier)
- **Scoped agent keys:** Per-agent API keys with policy inheritance
- **Admin key:** Global kill switch control — separate from tenant keys

### API Key Security

- Keys are bcrypt-hashed with cost factor 12 before storage
- Lookup uses a SHA-256 index to avoid timing attacks
- Constant-time comparison on the final bcrypt check
- Keys include a prefix (`agkey_`) for easy identification in logs and code

---

## Vulnerability Management

### Responsible Disclosure

We run a coordinated vulnerability disclosure program. Security researchers are encouraged to report findings.

**Contact:** `security@thebot.club`

📄 [Security Disclosure Policy](https://agentguard.dev/security/disclosure-policy)

### Penetration Testing

- Third-party penetration tests conducted annually
- Chaos testing suite in `tests/chaos/` validates resilience under adversarial conditions
- Results documented in threat reports and remediation tracked in the roadmap

### Dependency Management

- Automated Dependabot scanning for known vulnerabilities
- npm audit and pip audit in CI pipeline
- Container image scanning (Trivy) before deployment

---

## Incident Response

### Security Contact

| Channel | Details |
|---|---|
| **Email** | security@thebot.club |
| **Security.txt** | https://agentguard.dev/.well-known/security.txt |
| **Acknowledgements** | https://agentguard.dev/security/acknowledgements |

### Incident Response Process

1. **Detection** — Automated monitoring (anomaly detection, rate limit alerts, Sentry errors)
2. **Triage** — Severity assessment by engineering team
3. **Containment** — Tenant-level kill switch available immediately; service-level kill switch for broader issues
4. **Investigation** — Full audit trail available for forensics (tamper-evident, exportable)
5. **Resolution** — Fix deployed through CI/CD with staged rollout
6. **Communication** — Affected tenants notified via email and status page
7. **Post-incident** — Root cause analysis, remediation tracking, policy updates

### Kill Switch

Every tenant has an instant kill switch that halts all agent activity immediately:

```bash
# Activate kill switch
curl -X POST https://api.agentguard.tech/api/v1/kill-switch \
  -H "x-api-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"active": true}'
```

Agent-level kill switches allow granular control — halt one agent without affecting others.

---

## Third-Party Security

### Infrastructure (Cloud)

| Provider | Controls |
|---|---|
| Azure Container Apps | SOC 2, ISO 27001, HIPAA-eligible |
| Cloudflare | SSL termination, DDoS mitigation, WAF |
| PostgreSQL (cloud) | Azure managed, encrypted at rest |
| Redis (cloud) | Azure managed, encrypted in transit |

### Self-Hosted

For organizations that require full control, the self-hosted deployment runs entirely on your infrastructure with no external dependencies beyond Docker images.

- ✅ No data leaves your environment
- ✅ No phone-home telemetry (can be disabled with `AGENTGUARD_NO_TELEMETRY=1`)
- ✅ Air-gapped deployment supported (Enterprise tier)
- ✅ Offline grace period for license validation (up to 30 days)

---

## Next Steps

- **Self-host with full control:** [Deployment Guide](/docs/deployment)
- **Compliance roadmap:** [Compliance Roadmap](/docs/compliance-roadmap.md)
- **SOC 2 readiness details:** [SOC 2 Report](/docs/enterprise/SOC2-READINESS.md)
- **Report a vulnerability:** security@thebot.club
- **Enterprise inquiry:** Contact us for custom terms, BAA, or dedicated support
