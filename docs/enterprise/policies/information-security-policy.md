# Information Security Policy

**Document ID:** ISP-001  
**Version:** 1.0  
**Effective Date:** 2026-03-23  
**Review Cycle:** Annual (next review: 2027-03-23)  
**Owner:** Head of Engineering / CISO  
**Classification:** Internal

---

## 1. Purpose

This policy establishes AgentGuard's commitment to protecting the confidentiality, integrity, and availability of information assets — including customer data processed through the AgentGuard AI governance platform. It defines the principles, responsibilities, and controls governing how information is handled across all systems, teams, and operational processes.

AgentGuard processes sensitive customer workloads, AI agent evaluations, and audit trails on behalf of enterprise clients. Maintaining strong information security is not only a compliance requirement but a core product promise.

---

## 2. Scope

This policy applies to:

- **All personnel:** Full-time employees, contractors, consultants, and third parties with access to AgentGuard systems
- **All systems:** Production infrastructure (Azure Container Apps, PostgreSQL, Redis, Cloudflare), internal tooling, development environments, and CI/CD pipelines
- **All data:** Customer data, internal data, audit logs, credentials, and configuration secrets
- **All environments:** Production, staging, development, and local development machines

---

## 3. Roles and Responsibilities

### 3.1 Head of Engineering / CISO
- Owns this policy and the overall information security program
- Approves exceptions and material changes
- Chairs the Change Advisory Board (CAB) for major changes
- Reports security posture to leadership quarterly

### 3.2 Security Lead
- Maintains day-to-day operations of security controls
- Coordinates vulnerability management, access reviews, and incident response
- Manages vendor risk register and third-party due diligence
- Ensures evidence collection for SOC 2 audit readiness

### 3.3 Engineering Team
- Implements security controls in code and infrastructure
- Follows secure development guidelines (see §6)
- Reports potential security issues immediately to the Security Lead
- Completes required security training (see [Security Training Policy](security-training-policy.md))

### 3.4 All Personnel
- Protect credentials and access tokens — never share them
- Report suspected security incidents immediately (see [Incident Response Plan](incident-response-plan.md))
- Complete annual security awareness training
- Comply with the Acceptable Use Policy (see §5)

---

## 4. Data Classification

All information handled by AgentGuard must be classified into one of four tiers. Classification determines handling, storage, transmission, and disposal requirements.

### 4.1 Classification Tiers

| Tier | Label | Description | Examples |
|------|-------|-------------|---------|
| 1 | **Public** | Information intended for public consumption | Marketing content, public documentation, open-source code |
| 2 | **Internal** | Internal business information; not intended for public release | Internal runbooks, team communications, product roadmaps |
| 3 | **Confidential** | Sensitive business or customer information requiring protection | Customer tenant configurations, API keys (hashed), audit logs, contracts |
| 4 | **Restricted** | Highest sensitivity; exposure could cause material harm | Customer PII, plaintext secrets, database credentials, encryption keys |

### 4.2 Handling Requirements

| Requirement | Public | Internal | Confidential | Restricted |
|-------------|--------|----------|-------------|------------|
| Encryption at rest | Not required | Recommended | Required | Required (AES-256-GCM) |
| Encryption in transit | Recommended | Required | Required | Required (TLS 1.2+) |
| Access logging | Not required | Recommended | Required | Required (tamper-evident) |
| Multi-factor auth | Not required | Required | Required | Required |
| Retention limits | Not defined | 3 years | 3 years | 2 years (or per contract) |
| Disposal | Standard delete | Secure delete | Secure delete + verification | Cryptographic erasure |

### 4.3 Customer Data Handling

Customer data processed by AgentGuard (AI agent inputs, outputs, evaluation results) is classified **Confidential** by default. Data containing PII detected by `api/lib/pii/` is automatically reclassified as **Restricted** and subject to enhanced protections including:

- Automatic PII detection and redaction in audit logs
- Encryption via `api/lib/integration-crypto.ts` (AES-256-GCM)
- PostgreSQL Row-Level Security (RLS) enforcing per-tenant isolation
- SIEM export with PII fields masked

---

## 5. Acceptable Use Policy

### 5.1 Authorized Use

AgentGuard systems and data may only be used for legitimate business purposes. Personnel may use company resources for their job functions, reasonable incidental personal use, and professional development directly related to their role.

### 5.2 Prohibited Activities

The following are strictly prohibited:

- Accessing customer data beyond what is necessary for a specific job function
- Sharing credentials, API keys, or access tokens with any other person
- Bypassing security controls, MFA, or access restrictions
- Installing unauthorized software on production systems
- Storing Restricted data on personal devices or unauthorized cloud services
- Using AgentGuard infrastructure for personal projects, mining, or non-business workloads
- Attempting to access systems, data, or tenants you are not authorized for
- Committing secrets or credentials to any code repository

### 5.3 Credential Management

- All credentials (passwords, API keys, tokens) must be stored in approved secret management systems (Kubernetes Secrets, Azure Key Vault)
- Secrets must never be committed to source code repositories — `git-secrets` or Trufflehog scanning enforces this in CI
- Credentials must be rotated if compromise is suspected; see [Incident Response Plan](incident-response-plan.md)
- Production database credentials are accessible only via approved privileged access procedures

---

## 6. Access Control Principles

AgentGuard implements access control based on two principles:

### 6.1 Least Privilege

Personnel and systems are granted only the minimum access required to perform their function. This applies to:

- **Human access:** Production system access is restricted to engineers who require it; access is revoked within 24 hours of role change or departure
- **Service accounts:** Each service has its own identity with scoped permissions (Kubernetes RBAC, Azure Managed Identities)
- **API access:** AgentGuard RBAC enforces `owner/admin/member/viewer` roles per tenant (`api/lib/rbac.ts`); customers cannot access other tenants
- **Database access:** PostgreSQL RLS enforces row-level isolation; application service accounts cannot read other tenants' data

### 6.2 Need-to-Know

Access to **Confidential** and **Restricted** data requires both a legitimate business need and explicit approval. Access reviews are conducted quarterly to verify that granted access remains appropriate.

### 6.3 Access Review Cadence

| Access Type | Review Frequency | Owner |
|-------------|-----------------|-------|
| Production system access | Quarterly | Security Lead |
| Database access | Quarterly | Security Lead |
| Cloud console access (Azure) | Quarterly | Head of Engineering |
| Customer tenant data access | Per-incident (logged) | Security Lead |
| Third-party vendor access | Annual (or on change) | Security Lead |

Access reviews use AgentGuard's own audit log (`api/routes/audit.ts`) to verify access events against approved access lists.

### 6.4 Multi-Factor Authentication

MFA is mandatory for:
- All production system access
- Cloud console access (Azure Portal)
- Code repository access (GitHub)
- Any access to Restricted data

SSO/OIDC/SAML integration (`api/middleware/auth.ts`) enforces organizational MFA policy for customer-facing access.

---

## 7. Incident Response Overview

Security incidents must be reported immediately. AgentGuard maintains a formal Incident Response Plan that defines:

- Incident classification (P1–P4)
- Response team roles and escalation chain
- Containment, eradication, and recovery procedures
- Customer and public communication templates

See the full [Incident Response Plan](incident-response-plan.md).

**To report a security incident:** Contact the on-call engineer or email security@agentguard.tech immediately.

---

## 8. Secure Development

All code changes must:

1. Pass automated security scans (SAST via Snyk; dependency scanning via Dependabot)
2. Be reviewed by at least one other engineer before merging (see [Change Management Policy](change-management-policy.md))
3. Not introduce hardcoded credentials or secrets
4. Follow the principle of least privilege when adding new service integrations
5. Include appropriate input validation and output encoding

AgentGuard's own policy enforcement engine (the product) is applied to internal AI agents used in development workflows, ensuring AI-generated code is subject to the same policy controls as customer deployments.

---

## 9. Physical Security

AgentGuard operates as a cloud-native platform. Physical infrastructure is hosted on Microsoft Azure Container Apps, which holds SOC 2 Type II certification and maintains physical security controls on our behalf. AgentGuard employees work remotely; team members must:

- Use encrypted storage on all devices
- Enable device lock with a short idle timeout (5 minutes maximum)
- Report lost or stolen devices immediately to the Security Lead
- Not access production systems from untrusted public networks without VPN

---

## 10. Exceptions

Any exception to this policy requires written approval from the Head of Engineering or CISO. Exceptions must:

- State the specific control being excepted
- Document the business justification
- Define a compensating control
- Set an expiry date (maximum 90 days)
- Be recorded in the exception register

---

## 11. Policy Violations

Violations of this policy may result in disciplinary action up to and including termination of employment or contract, and may be referred to law enforcement where applicable.

---

## 12. Review and Maintenance

This policy is reviewed annually by the Head of Engineering and Security Lead. Material changes to the platform, infrastructure, or regulatory environment may trigger an out-of-cycle review. All changes require approval from the Head of Engineering or CISO.

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-23 | Security Lead | Initial version |

---

*Related documents:*
- [Incident Response Plan](incident-response-plan.md)
- [Change Management Policy](change-management-policy.md)
- [Vendor Risk Management](vendor-risk-management.md)
- [Security Training Policy](security-training-policy.md)
- [SOC2 Readiness Assessment](../SOC2-READINESS.md)
