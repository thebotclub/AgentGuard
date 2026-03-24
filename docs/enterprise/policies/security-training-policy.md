# Security Training Policy

**Document ID:** STP-001  
**Version:** 1.0  
**Effective Date:** 2026-03-23  
**Review Cycle:** Annual  
**Owner:** Head of Engineering / Security Lead  
**Classification:** Internal

---

## 1. Purpose

This policy establishes AgentGuard's security training program. As a company that builds AI governance and policy enforcement software for enterprise customers, our team must demonstrate the same security competence we ask of our customers' operations teams.

Security training serves multiple purposes:
- Reduce human error as a vector for security incidents
- Meet SOC 2 Type II requirements (CC1.4 — competence commitment)
- Maintain a culture where security is everyone's responsibility
- Provide evidence to auditors that personnel are trained on their security obligations

---

## 2. Scope

This policy applies to all AgentGuard personnel:
- Full-time employees
- Part-time employees
- Contractors and consultants with access to production systems or customer data
- New hires during their onboarding period

---

## 3. Onboarding Security Training

All new personnel must complete security onboarding training **within 14 days of their start date**. Access to production systems is not granted until onboarding security training is completed.

### 3.1 Required Onboarding Modules

| Module | Format | Estimated Time | Coverage |
|--------|--------|----------------|---------|
| **Information Security Policy** | Self-study + acknowledgment sign-off | 30 min | Data classification, acceptable use, access control principles |
| **Incident Response Overview** | Walkthrough with Security Lead | 30 min | How to recognize and report an incident; escalation chain |
| **Secure Development Practices** | Self-study | 45 min | OWASP Top 10 applied to AgentGuard stack; secrets management; input validation |
| **Data Handling and Privacy** | Self-study + quiz | 30 min | Data classification tiers; PII handling; customer data obligations; GDPR basics |
| **Credential and Access Management** | Hands-on setup | 30 min | Setting up MFA; using approved secret managers; SSH key hygiene |
| **Social Engineering Awareness** | Interactive module | 20 min | Phishing recognition; pretexting; reporting suspicious contact |

**Total onboarding security training: ~3 hours**

### 3.2 Acknowledgment

Upon completing onboarding training, all personnel must sign an acknowledgment confirming they have read and understood:
- Information Security Policy
- Acceptable Use Policy
- Incident Reporting obligations

Signed acknowledgments are retained in HR records for the duration of employment plus 3 years.

---

## 4. Annual Security Awareness Refresher

All personnel complete an annual security refresher to maintain awareness of evolving threats and policy updates.

**Deadline:** Must be completed within 30 days of the annual training window (January 1 – January 31 each year).

### 4.1 Annual Refresher Content

The annual refresher is updated each year based on:
- Incidents experienced by AgentGuard or published in the industry
- Changes to policies or compliance requirements
- New threat patterns relevant to AI/SaaS platforms

**Core topics (updated annually):**

| Topic | Why It Matters for AgentGuard |
|-------|-------------------------------|
| Phishing and social engineering | Engineers with production access are high-value targets |
| Supply chain and dependency attacks | npm/PyPI package poisoning; Dependabot alerts must be acted on |
| Prompt injection and AI-specific threats | AgentGuard defends against these — our team must understand them deeply |
| Cloud security hygiene | Azure credential exposure; IAM misconfiguration |
| Incident reporting and response | Annual refresher of escalation chain and reporting obligations |
| Access hygiene | MFA, credential rotation, session management |

### 4.2 Format

- 60–90 minute interactive online module (tool: TBD — KnowBe4, Wizer, or equivalent)
- Assessed via quiz (minimum 80% pass rate; remediation available for failures)
- Policy acknowledgment re-signed annually

---

## 5. Role-Specific Training

In addition to universal training, role-specific training is required based on system access and responsibilities.

### 5.1 Developers

**Required training (annual + on major framework/tooling changes):**

| Topic | Format | Frequency |
|-------|--------|-----------|
| Secure coding for TypeScript/Node.js | Workshop or online course | Annual |
| OWASP Top 10 for APIs | Self-study + quiz | Annual |
| Dependency management and supply chain security | Hands-on lab | Annual |
| AgentGuard-specific: JWT/auth middleware security patterns | Internal walkthrough | On onboarding + major auth changes |
| AgentGuard-specific: Audit log integrity and tamper-evidence | Internal walkthrough | On onboarding |
| Database security: PostgreSQL RLS, injection prevention | Internal walkthrough | On onboarding |
| AI security: Prompt injection, model output handling | Self-study | Annual |

### 5.2 Operations / Infrastructure

**Required training (annual + on major infrastructure changes):**

| Topic | Format | Frequency |
|-------|--------|-----------|
| Kubernetes security (RBAC, NetworkPolicy, secrets) | Workshop | Annual |
| Azure security (IAM, Key Vault, Container Apps hardening) | Online course | Annual |
| Incident response hands-on | Tabletop exercise participation | Quarterly |
| Cloud security monitoring (SIEM, anomaly detection) | Internal walkthrough | On onboarding + annual refresher |
| Secrets management and rotation procedures | Hands-on lab | Annual |

### 5.3 Leadership / Management

**Required training (annual):**

| Topic | Format | Frequency |
|-------|--------|-----------|
| Executive briefing on cyber threats | 60-min briefing | Annual |
| Social engineering and executive targeting | Module | Annual |
| Incident Command responsibilities | Tabletop exercise | Annual (Q4) |
| Data breach notification obligations | Legal briefing | Annual |

---

## 6. Phishing Simulation Schedule

Regular phishing simulations test employee readiness and identify training gaps before a real attack.

### 6.1 Simulation Schedule

| Quarter | Simulation Type | Target Group |
|---------|----------------|-------------|
| Q1 | Credential harvesting (fake login page) | All personnel |
| Q2 | Spear phishing (personalized, referencing real tools/vendors) | Engineering + Leadership |
| Q3 | Malicious attachment (fake invoice, "urgent update") | All personnel |
| Q4 | Business email compromise (CEO/leadership impersonation) | Finance + Leadership |

### 6.2 Process

1. Security Lead coordinates simulation via phishing simulation platform
2. Simulations are unannounced — personnel are not pre-warned
3. Personnel who click/engage receive **immediate just-in-time training** (not punitive — educational)
4. Results are reported to Head of Engineering (aggregate, not individual shame)
5. Repeated failures (3+ consecutive simulations) trigger 1:1 follow-up training with Security Lead
6. Aggregate results are shared with the team quarterly to build awareness

### 6.3 Reporting Suspicious Emails

Personnel who receive suspicious emails (real or simulated) should:
1. **Do not click links or open attachments**
2. Report to security@agentguard.tech with the email as an attachment
3. If you clicked something: report immediately to Security Lead (no judgment — speed is critical)

---

## 7. Training Completion Tracking

The Security Lead maintains training completion records for all personnel.

### 7.1 Tracking Register

A training register is maintained at `docs/enterprise/training-records/` (internal, not in public repository). It includes:

| Employee | Role | Start Date | Onboarding Complete | Last Annual Refresher | Role-Specific Complete | Phishing (last 4 quarters) |
|----------|------|-----------|--------------------|-----------------------|----------------------|--------------------------|
| {name} | {role} | {date} | {date} | {date} | {date} | {Pass/Fail/Pass/Pass} |

### 7.2 Compliance Deadlines

| Training | Deadline | Escalation if Missed |
|----------|----------|---------------------|
| Onboarding modules | 14 days from start | Block production access until complete |
| Annual refresher | January 31 | Reminder on Feb 1; Head of Engineering notified at Feb 15 |
| Role-specific annual | Per schedule | Security Lead follows up; Head of Engineering notified after 30-day overdue |

### 7.3 SOC 2 Evidence

Training completion records are provided to SOC 2 auditors as evidence of CC1.4 compliance. Records must demonstrate:
- 100% of personnel completed onboarding training before production access
- ≥95% of personnel completed annual refresher within the required window (5% allowance for leave/contractor gaps with documentation)
- Phishing simulation cadence was maintained quarterly with follow-up training where needed

---

## 8. Exceptions

Exceptions (e.g., extended leave during the annual training window) must be:
- Documented by the Security Lead
- Completed within 30 days of return from leave
- Noted in the training register with reason

---

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-23 | Security Lead | Initial version |

---

*Related documents:*
- [Information Security Policy](information-security-policy.md)
- [Incident Response Plan](incident-response-plan.md)
- [SOC2 Readiness Assessment](../SOC2-READINESS.md)
