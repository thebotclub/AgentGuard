# Vendor Risk Management Policy

**Document ID:** VRM-001  
**Version:** 1.0  
**Effective Date:** 2026-03-23  
**Review Cycle:** Annual (vendors reviewed annually; high-risk vendors semi-annually)  
**Owner:** Security Lead  
**Classification:** Internal

---

## 1. Purpose

AgentGuard relies on third-party vendors for critical infrastructure, payment processing, and security services. This policy ensures that vendor relationships are assessed for risk, tracked formally, and reviewed regularly. It addresses SOC 2 criteria CC6.6 and CC9.2 — logical access restriction for third parties and vendor/partner risk management.

As an AI governance platform, AgentGuard has a particular responsibility to ensure that vendors handling customer data meet strong security standards consistent with what we promise our own customers.

---

## 2. Scope

This policy applies to any vendor that:

- Has access to Confidential or Restricted data (including customer data)
- Provides infrastructure or services essential to AgentGuard's availability
- Processes payments or financial data on behalf of AgentGuard
- Provides security tooling (scanning, monitoring, WAF)

Low-risk vendors (e.g., productivity tools with no access to production data) are tracked in the inventory but do not require formal risk assessment.

---

## 3. Risk Assessment Criteria

Each in-scope vendor is assessed across five dimensions:

### 3.1 Data Sensitivity Score (1–5)

| Score | Criteria |
|-------|----------|
| 5 | Processes Restricted data (PII, encryption keys, credentials) |
| 4 | Processes Confidential data (customer tenant data, audit logs) |
| 3 | Processes Internal data (code, internal metrics) |
| 2 | No direct data access; provides infrastructure only |
| 1 | Minimal integration; no data access |

### 3.2 Availability Criticality (1–5)

| Score | Criteria |
|-------|----------|
| 5 | Failure causes complete AgentGuard outage |
| 4 | Failure degrades core functionality significantly |
| 3 | Failure affects non-critical features or increases latency |
| 2 | Failure is inconvenient but has workarounds |
| 1 | Failure has minimal operational impact |

### 3.3 Security Posture Assessment

Minimum requirements for vendors with Data Sensitivity ≥ 3 or Availability Criticality ≥ 4:

- [ ] SOC 2 Type II report (or equivalent: ISO 27001, CSA STAR Level 2)
- [ ] Active bug bounty program or regular penetration testing
- [ ] Clear incident notification procedure (breach notification within 72 hours)
- [ ] Data Processing Agreement (DPA) signed
- [ ] Documented data retention and deletion capabilities

### 3.4 Composite Risk Rating

```
Risk Rating = Data Sensitivity × Availability Criticality

1–5   → Low Risk
6–10  → Medium Risk
11–15 → High Risk
16–25 → Critical Risk
```

Critical and High risk vendors require semi-annual reviews and executive sign-off for onboarding.

---

## 4. Vendor Inventory

### 4.1 Current Sub-Processors and Critical Vendors

| Vendor | Category | Purpose | Data Sensitivity | Availability Criticality | Risk Rating | SOC 2 Status | DPA Signed | Last Review |
|--------|----------|---------|-----------------|------------------------|------------|--------------|-----------|-------------|
| **Microsoft Azure** | Infrastructure | Container Apps (hosting), PostgreSQL (primary DB), Key Vault (secrets), Blob Storage | 5 | 5 | **Critical (25)** | SOC 2 Type II ✅ | Required | 2026-03-23 |
| **Cloudflare** | Security / CDN | CDN, WAF, DDoS protection, TLS termination, Full Strict SSL | 3 | 5 | **High (15)** | SOC 2 Type II ✅ | Required | 2026-03-23 |
| **Stripe** | Payments | Payment processing, subscription management | 4 | 3 | **High (12)** | SOC 2 Type II ✅ | Required (as controller) | 2026-03-23 |
| **GitHub** | Development | Source code hosting, CI/CD (GitHub Actions), issue tracking | 3 | 4 | **High (12)** | SOC 2 Type II ✅ | Required | 2026-03-23 |
| **Redis / Azure Cache for Redis** | Infrastructure | Session state, rate limiting, pub/sub | 3 | 4 | **High (12)** | SOC 2 Type II ✅ (via Azure) | Covered by Azure DPA | 2026-03-23 |
| **Lakera Guard** | Security | Optional prompt injection detection | 4 | 2 | **Medium (8)** | Verify with vendor | Required if enabled | 2026-03-23 |

### 4.2 Vendor Inventory Template

Use the following template when adding new vendors:

```markdown
| Vendor | Category | Purpose | Data Sensitivity (1-5) | Availability Criticality (1-5) | Risk Rating | SOC 2 / Cert Status | DPA Signed | Review Date |
|--------|----------|---------|----------------------|-------------------------------|------------|---------------------|-----------|-------------|
| {Name} | {Infra/Security/SaaS/etc} | {Brief purpose} | {1-5} | {1-5} | {score} | {Yes/No/Pending} | {Yes/No} | {YYYY-MM-DD} |
```

---

## 5. Vendor Onboarding Process

Before any new vendor is granted access to production systems or customer data:

### Step 1: Vendor Risk Assessment

1. Complete the risk assessment (§3) and calculate composite risk rating
2. For High or Critical risk vendors: Security Lead reviews; Head of Engineering approves
3. For Critical risk vendors: CAB approval required (see [Change Management Policy](change-management-policy.md))

### Step 2: Due Diligence

Collect and review:

- [ ] SOC 2 Type II report (or equivalent certification) — must be less than 12 months old
- [ ] Penetration test summary (if no SOC 2)
- [ ] Security questionnaire responses (CAIQ or equivalent)
- [ ] Incident notification policy
- [ ] Data retention and deletion procedures
- [ ] Sub-processor list (who do they share data with?)

### Step 3: Contractual Controls

- [ ] Data Processing Agreement (DPA) signed before any data transfer
- [ ] DPA includes: breach notification within 72 hours; data deletion on termination; sub-processor restrictions; audit rights
- [ ] If vendor is in the EU or handles EU resident data: GDPR-compliant DPA with Standard Contractual Clauses (SCCs) if applicable

### Step 4: Access Provisioning

- [ ] Grant minimum necessary access (see [Information Security Policy §6](information-security-policy.md))
- [ ] Document access granted in vendor inventory
- [ ] Configure audit logging for all vendor access where possible (via `api/lib/siem-forwarder.ts` and cloud audit trails)

---

## 6. Annual Review Process

All vendors are reviewed annually (High/Critical vendors semi-annually):

### Review Checklist

- [ ] Is the vendor's SOC 2 report still current (< 12 months)?
- [ ] Have there been any material security incidents at the vendor in the past year?
- [ ] Has the vendor changed their sub-processors or data handling practices?
- [ ] Is the DPA still valid and current?
- [ ] Is the access granted still necessary and appropriate?
- [ ] Are there any unresolved open exceptions or concerns from the previous review?

### Review Outcome

| Outcome | Action |
|---------|--------|
| No issues found | Update review date in vendor inventory |
| Minor gaps | Document remediation plan; re-review within 90 days |
| Material gaps | Escalate to Head of Engineering; negotiate remediation plan or begin vendor replacement |
| Critical gap (e.g., SOC 2 lapsed, security incident not disclosed) | Immediate escalation; consider suspension of vendor access pending resolution |

---

## 7. Data Processing Agreement (DPA) Tracking

| Vendor | DPA Status | DPA Date | Expiry / Review Due | GDPR SCCs Required | Notes |
|--------|-----------|----------|--------------------|--------------------|-------|
| Microsoft Azure | Signed ✅ | — | Annual | Yes (Azure DPA includes SCCs) | Covers Redis/Key Vault/PostgreSQL |
| Cloudflare | Signed ✅ | — | Annual | Yes | |
| Stripe | Signed ✅ | — | Annual | Yes | Stripe as sub-processor |
| GitHub | Signed ✅ | — | Annual | Yes | GitHub DPA covers Actions runners |
| Lakera Guard | Pending ⚠️ | — | — | Yes (if EU data processed) | Required before production use with EU customer data |

*Note: This table must be updated whenever a DPA is signed, renewed, or when a vendor's sub-processor list changes materially.*

---

## 8. Vendor Offboarding

When a vendor relationship ends:

1. **Immediately revoke** all access credentials, API keys, and integrations
2. **Request data deletion** confirmation in writing (per DPA terms)
3. **Verify deletion** — confirm the vendor has deleted AgentGuard and customer data within the DPA-specified timeframe (typically 30–90 days)
4. **Update vendor inventory** — mark as offboarded with date
5. **Retain DPA and due diligence records** for 3 years after offboarding

---

## 9. Vendor Security Incident Response

If a vendor reports a security incident or breach:

1. **Assess impact:** Does the breach affect AgentGuard customer data?
2. **Notify Incident Commander:** If customer data may be affected, declare an internal incident (see [Incident Response Plan](incident-response-plan.md))
3. **Document:** Record the vendor's notification, timeline, and remediation steps
4. **Evaluate regulatory obligations:** If personal data is affected, assess GDPR notification requirements
5. **Post-incident review:** Re-assess vendor risk rating and DPA adequacy

---

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-23 | Security Lead | Initial version |

---

*Related documents:*
- [Information Security Policy](information-security-policy.md)
- [Incident Response Plan](incident-response-plan.md)
- [SOC2 Readiness Assessment](../SOC2-READINESS.md)
