# AgentGuard Compliance Roadmap

## Current Compliance Features (v0.10.0)

### ✅ Audit & Accountability
- **Tamper-evident audit trail** — SHA-256 hash-chained event log, verifiable at any time
- **Audit export** — JSON/CSV export for SIEM integration (Splunk, Datadog, Elastic)
- **Per-tenant isolation** — PostgreSQL Row-Level Security (RLS) ensures data separation
- **Immutable decision records** — every evaluate call logged with full context, timestamp, and decision

### ✅ Access Control
- **API key authentication** — bcrypt-hashed, constant-time comparison
- **JWT + SSO** — Bearer token auth for enterprise identity providers
- **RBAC** — Role-based access control for multi-user tenants
- **Scoped agent keys** — Per-agent API keys with policy inheritance

### ✅ Policy Enforcement
- **Pre-built compliance templates:**
  - EU AI Act (Articles 5, 9, 12, 14)
  - SOC 2 (CC1-9 mapped to agent controls)
  - APRA CPS 234 (Australian financial services)
  - OWASP Top 10 for Agentic AI
  - Financial Services Baseline (AML, KYC)
- **OWASP compliance report generation** — auto-generated evidence from live audit trail
- **Kill switch** — instant tenant-wide agent halt

### ✅ Data Protection
- **PII detection & redaction** — 9 entity types, 3 modes (detect/redact/mask)
- **SSRF protection** — IPv4, IPv6, DNS rebinding, hostname alias blocking
- **XSS prevention** — agent name allowlisting + dangerous pattern blocking
- **CSRF protection** — on all state-changing endpoints
- **TLS everywhere** — SSL Full (Strict) via Cloudflare

### ✅ Monitoring & Detection
- **Anomaly detection** — statistical analysis of evaluation patterns
- **Real-time dashboard** — live decision feed, agent activity, usage analytics
- **Prompt injection detection** — heuristic + Lakera Guard adapter
- **Rate limiting** — per-tenant, per-endpoint, configurable

---

## Roadmap

### Q2 2026
- [ ] **SOC 2 Type I preparation** — policies, procedures, evidence collection
- [ ] **Data residency controls** — AU, US, EU region selection for data storage
- [ ] **Webhook signing** — HMAC-SHA256 signed webhook payloads
- [ ] **API request logging** — full request/response audit for sensitive endpoints

### Q3 2026
- [ ] **SOC 2 Type I audit** — engage auditor, provide evidence package
- [ ] **GDPR data subject requests** — automated data export and deletion
- [ ] **ISO 27001 gap analysis** — identify and address gaps
- [ ] **Encryption at rest** — AES-256 for stored audit data

### Q4 2026
- [ ] **SOC 2 Type II** — continuous monitoring period begins
- [ ] **HIPAA BAA availability** — for healthcare customers
- [ ] **FedRAMP assessment** — for US government customers
- [ ] **Penetration test** — third-party annual pentest with published summary

---

## Security Practices

| Practice | Status |
|----------|--------|
| Dependency scanning | ✅ `npm audit` in CI pipeline |
| Secret management | ✅ Azure Key Vault + GitHub Secrets |
| Code review | ✅ Required for all merges |
| Automated testing | ✅ 193 tests, CI-gated |
| Infrastructure as Code | ✅ Terraform for Azure resources |
| Incident response plan | 🔄 In progress |
| Bug bounty program | 📋 Planned Q3 2026 |

---

## Contact

For compliance inquiries, security reports, or enterprise licensing:
- 📧 security@agentguard.tech
- 🌐 [agentguard.tech](https://agentguard.tech)

© 2026 The Bot Club Pty Ltd (ABN 99 695 980 226) trading as AgentGuard.
