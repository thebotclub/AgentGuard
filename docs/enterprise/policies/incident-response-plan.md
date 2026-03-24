# Incident Response Plan

**Document ID:** IRP-001  
**Version:** 1.0  
**Effective Date:** 2026-03-23  
**Review Cycle:** Annual + after each P1/P2 incident  
**Owner:** Head of Engineering / Security Lead  
**Classification:** Internal

---

## 1. Purpose

This plan defines how AgentGuard detects, responds to, and recovers from security incidents. Given that AgentGuard processes AI agent evaluations, policy enforcement decisions, and audit logs on behalf of enterprise customers, any breach or disruption has direct impact on customer trust and contractual obligations.

This plan is a living document — it must be updated after every major incident and tested quarterly via tabletop exercises.

---

## 2. Incident Classification

### Severity Levels

| Level | Name | Criteria | Response Time | Examples |
|-------|------|----------|--------------|---------|
| **P1** | Critical | Active data breach, customer data exposed, service fully down, ransomware | Immediate (< 15 min) | Database breach exposing customer audit logs; complete API unavailability; compromised production credentials |
| **P2** | High | Partial breach or unauthorized access contained, significant service degradation (>20% error rate), active exploitation attempt | < 1 hour | Brute-force attack succeeding on one account; policy evaluation errors affecting multiple tenants; encryption key material exposed in logs |
| **P3** | Medium | Limited impact, no confirmed data access, single-tenant disruption | < 4 hours | Suspected unauthorized access (no confirmation); single-tenant availability issue; anomaly detector flagging unusual patterns |
| **P4** | Low | No impact, near-miss, policy violation with no breach | < 24 hours | Secret found in a feature branch (unexposed); failed login spike from known IP range; minor config drift detected |

### Classification Decision Tree

```
Is customer data (Confidential/Restricted) confirmed or suspected exposed?
  YES → P1 immediately (escalate, then investigate)
  NO  → Is the platform substantially degraded or unavailable?
          YES → P1 or P2 depending on scope
          NO  → Is there evidence of unauthorized access or active exploitation?
                  YES → P2 (investigate urgently)
                  NO  → Is there a confirmed policy violation or near-miss?
                          YES → P3 or P4
                          NO  → P4 or not an incident
```

---

## 3. Response Team

### 3.1 Roles

| Role | Responsibilities | Primary | Backup |
|------|-----------------|---------|--------|
| **Incident Commander (IC)** | Overall coordination; makes go/no-go decisions; owns communication timeline | Head of Engineering | Security Lead |
| **Security Lead** | Technical investigation; containment and eradication actions; evidence preservation | Security Lead | Senior Engineer |
| **Communications Lead** | Customer notifications; public statements; internal updates | Head of Product / CEO | IC |
| **Engineering On-Call** | Immediate technical response; system access; infrastructure changes | On-call rotation (PagerDuty) | Senior Engineer |
| **Legal / Compliance** | Regulatory notifications; DPA obligations; litigation hold if needed | External counsel | Head of Engineering |

### 3.2 Contact Chain

For P1/P2 incidents, activate the chain in this order:

1. **Engineering On-Call** (PagerDuty alert — immediate)
2. **Security Lead** (notify within 5 minutes of P1 confirmation)
3. **Head of Engineering / IC** (notify within 10 minutes)
4. **CEO** (notify within 30 minutes for P1; within 2 hours for P2)
5. **Legal** (notify within 1 hour for P1 involving data breach)

For P3/P4: Security Lead coordinates with Engineering On-Call; notify Head of Engineering within 4 hours.

### 3.3 Incident Communication Channel

All incident coordination happens in a dedicated private channel (e.g., `#incident-YYYY-MM-DD-<slug>` in Slack). The IC creates this channel at the start of a P1/P2. All decisions and timeline events are logged there in real time.

---

## 4. Response Procedures

### Phase 1: Detection

AgentGuard has multiple detection mechanisms that may trigger an incident:

| Source | Mechanism |
|--------|-----------|
| Anomaly detection | `api/lib/anomaly-detector.ts` — statistical analysis of evaluation patterns; flags unusual volumes, error rates, or access patterns |
| SIEM alerts | Splunk/Datadog/Elastic export via `api/lib/siem-forwarder.ts`; alert rules for authentication failures, privilege escalation, data exfiltration patterns |
| Audit log monitoring | `packages/compliance/src/monitoring/continuous-monitor.ts` — detects gaps or tampering in the hash-chained audit log |
| External report | Customer reports unusual behavior; security researcher reports via security@agentguard.tech |
| Internal discovery | Engineer notices anomalous behavior during normal work |

**Detection checklist:**
- [ ] Record the exact time of detection and initial indicator
- [ ] Preserve raw evidence (logs, alerts, screenshots) before any remediation
- [ ] Assign an initial severity level
- [ ] Page the on-call engineer

---

### Phase 2: Triage

*Goal: Confirm whether an incident occurred and assign final severity.*

**Triage checklist (complete within 30 minutes for P1/P2):**
- [ ] Is this a real incident or a false positive?
- [ ] What systems are affected? (API, Dashboard, Worker, Database, specific tenant)
- [ ] Is customer data confirmed or suspected to be accessed/exfiltrated?
- [ ] Is the attack/breach ongoing or contained?
- [ ] What is the blast radius? (single tenant, all tenants, internal systems only)
- [ ] Assign final P1–P4 severity
- [ ] Activate Incident Commander if P1 or P2
- [ ] Open incident channel; start timeline log

**Evidence preservation (before any changes):**
```bash
# Export current audit log state
# AgentGuard audit chain provides tamper-evident timeline
GET /api/audit?limit=1000&format=export

# Capture system metrics snapshot
# Preserve application logs (do not rotate)
kubectl logs -n agentguard --all-containers --timestamps > incident-$(date +%Y%m%d-%H%M%S).log

# Capture database audit trail (pg_audit)
# Preserve Redis state if rate-limit or session data is relevant
```

---

### Phase 3: Containment

*Goal: Stop the bleeding. Limit impact without destroying evidence.*

#### P1 Containment Actions (in order)

1. **Isolate affected systems** — if a specific service is compromised, scale it to zero or take it offline
2. **Revoke compromised credentials** — API keys (`DELETE /api/keys/{id}`), JWT sessions (flush token store), SCIM tokens
3. **Block attacker access** — Cloudflare WAF rule to block malicious IPs/ASNs; rate limit escalation
4. **Activate kill switch** if broad API abuse is detected (documented in ops runbook)
5. **Disable affected tenant access** if breach is tenant-specific (RBAC role revocation via `api/lib/rbac.ts`)
6. **Snapshot database** before any eradication steps — preserve forensic state

#### Short-term Containment vs. Long-term Containment

- **Short-term:** Take immediate action to stop active harm (block IP, revoke key, isolate service)
- **Long-term:** Implement durable fixes that allow systems to return to service safely (patch, config change, architecture improvement)

Document all containment actions with timestamps in the incident channel.

---

### Phase 4: Eradication

*Goal: Remove the root cause from all systems.*

- [ ] Identify root cause (vulnerability, misconfiguration, compromised credential, social engineering)
- [ ] Remove malicious artifacts (unauthorized code, backdoors, unexpected accounts)
- [ ] Patch or mitigate the vulnerability that was exploited
- [ ] Rotate all credentials that may have been exposed (see rotation runbook)
- [ ] Verify eradication via independent review (second engineer confirms)
- [ ] Run `packages/compliance/src/collectors/` evidence collection to verify system integrity
- [ ] Verify audit log chain integrity via `api/scripts/repair-audit-chain.ts` (repair only if chain is broken by the incident itself, not to hide evidence)

---

### Phase 5: Recovery

*Goal: Restore normal operations safely.*

- [ ] Restore from clean backup if systems were compromised (see `docs/DATABASE_OPS.md`)
- [ ] Re-deploy services from known-good container images (not from potentially compromised state)
- [ ] Gradually restore traffic — start with 10% via Cloudflare load balancing, verify clean operation
- [ ] Monitor anomaly detector and SIEM closely for 24–48 hours post-recovery
- [ ] Confirm audit log continuity resumes after recovery
- [ ] Notify customers when service is restored (see Communication Templates §5)
- [ ] Declare incident closed in the incident channel; schedule post-mortem

---

### Phase 6: Post-Mortem

*Goal: Learn and prevent recurrence.*

**Timeline:** Post-mortem must be completed within 5 business days of incident closure.

**Post-mortem structure:**
1. **Timeline** — minute-by-minute sequence of events (use incident channel log)
2. **Root cause** — what actually went wrong (technical and process)
3. **Contributing factors** — what made the impact worse or the response slower
4. **What went well** — preserve good practices
5. **Action items** — specific, owned, time-bound fixes

**Post-mortem rules:**
- Blameless — focus on systems and processes, not individuals
- All action items must have an owner and a due date
- P1 post-mortems are shared with leadership; P2 with the engineering team
- Action items are tracked as Linear issues and reviewed weekly until closed

---

## 5. Communication Templates

### 5.1 Internal Notification (P1/P2 — sent within 30 minutes)

**To:** Leadership, relevant team leads  
**Subject:** [INCIDENT-P{level}] {short description} — {date}

```
INCIDENT DECLARED: {date/time UTC}
Severity: P{level} — {name}
Incident Commander: {name}
Current Status: {Active/Contained/Recovering}

What we know:
- {brief description of what happened}
- Systems affected: {list}
- Customer impact: {confirmed / suspected / none}

What we're doing:
- {containment actions in progress}

Next update: {time UTC}
Incident channel: #{slack-channel}
```

### 5.2 Customer Notification (P1 confirmed breach — sent within 72 hours)

**Sent by:** Communications Lead  
**To:** Affected customer security contact (per DPA/contract)

```
Subject: Security Incident Notification — AgentGuard [Incident #{ID}]

Dear {Customer Name},

We are writing to notify you of a security incident that may have affected 
your AgentGuard account.

What happened:
On {date}, we detected {brief, factual description}. We confirmed that 
{scope of impact} was affected.

What data was involved:
{specific data types — audit logs, agent configurations, etc.}

What we did:
We immediately {containment actions}. The incident was contained by {time}.
We have {eradication steps}.

What you should do:
{specific recommendations — rotate API keys, review audit logs, etc.}

We are available to answer your questions at security@agentguard.tech or 
via your dedicated account channel.

We take this seriously and apologize for the impact. A full post-incident 
report will be available within {timeframe}.

{Head of Engineering name}
Head of Engineering, AgentGuard
```

### 5.3 Public Statement (P1 with broad impact — coordinated with Legal)

```
Security Incident — {Date}

AgentGuard detected and responded to a security incident on {date}. 
We have contained the issue and restored normal operations.

We are notifying affected customers directly with full details. 
Our investigation is ongoing.

For questions: security@agentguard.tech

Updated: {timestamp}
```

*Note: Public statements require approval from CEO and Legal before publication.*

---

## 6. Regulatory and Legal Obligations

### Data Breach Notification

| Obligation | Trigger | Timeline | Recipient |
|-----------|---------|----------|-----------|
| GDPR Art. 33 | Personal data breach (EU residents) | 72 hours | Lead supervisory authority |
| GDPR Art. 34 | High risk to individuals | Without undue delay | Affected individuals |
| Customer DPA | Any confirmed breach | Per contract (typically 72h) | Customer security contact |
| SOC 2 | Material breach | Notify auditor | SOC 2 auditor |

Legal must be engaged within 1 hour of a confirmed P1 breach to assess notification obligations.

---

## 7. Tabletop Exercise Schedule

Tabletop exercises test the response plan before a real incident occurs.

| Quarter | Scenario | Participants | Lead |
|---------|----------|-------------|------|
| Q1 | Compromised API key used to exfiltrate customer data | Full response team | Security Lead |
| Q2 | Ransomware on internal developer machine with production access | IC, Engineering, Legal | Head of Engineering |
| Q3 | Third-party vendor breach (e.g., GitHub Actions secret exposure) | Security Lead, Engineering On-Call | Security Lead |
| Q4 | DDoS + simultaneous credential stuffing attack | Full response team | IC |

**Exercise format:**
1. 60-minute facilitated scenario walkthrough
2. No actual system changes — simulate actions verbally
3. Document gaps discovered during exercise as action items
4. Update this plan with lessons learned within 2 weeks

---

## 8. Evidence Retention

All incident-related evidence must be preserved for a minimum of **3 years**:

- Incident channel logs (export to secure storage)
- Audit log exports from the time window
- Forensic snapshots (database, container state)
- Customer communication records
- Post-mortem documents
- Action item completion evidence

AgentGuard's tamper-evident audit log (`api/routes/audit.ts`) provides cryptographic integrity verification for all system events during the incident window. This log is a primary evidence source for auditors.

---

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-23 | Security Lead | Initial version |

---

*Related documents:*
- [Information Security Policy](information-security-policy.md)
- [Change Management Policy](change-management-policy.md)
- [SOC2 Readiness Assessment](../SOC2-READINESS.md)
- `docs/DATABASE_OPS.md`
