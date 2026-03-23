# AgentGuard Service Level Agreement (SLA)

**Effective Date:** 2026-04-01  
**Version:** 1.0  
**Applies to:** AgentGuard Pro and Enterprise plans

---

## 1. Overview

This Service Level Agreement ("SLA") describes the uptime commitments, support response times, incident communication process, and remedies that AgentGuard provides to customers on Pro and Enterprise plans. Free plan customers are not covered by this SLA.

---

## 2. Uptime Commitments

### 2.1 Monthly Uptime Percentage

| Plan | Monthly Uptime Commitment |
|------|--------------------------|
| Pro | 99.9% (~43.8 minutes downtime/month) |
| Enterprise | 99.95% (~21.9 minutes downtime/month) |

**"Monthly Uptime Percentage"** means: (total minutes in calendar month − downtime minutes) ÷ total minutes × 100%.

**"Downtime"** means: the AgentGuard API (`/api/v1/evaluate` and core endpoints) returns error responses (HTTP 5xx) for ≥ 1% of requests over any consecutive 5-minute period, as measured by AgentGuard's monitoring infrastructure.

Downtime does not include time during scheduled maintenance windows (see §5).

### 2.2 Service Components

| Component | Covered |
|-----------|---------|
| Policy evaluation API (`/api/v1/evaluate`) | ✅ Yes |
| Audit log API | ✅ Yes |
| Dashboard (web UI) | ✅ Yes |
| SCIM provisioning | ✅ Yes |
| SSO/OIDC callback endpoints | ✅ Yes |
| Webhook delivery | ✅ Yes (best effort) |
| SDKs (npm, pip) | ❌ No — third-party distribution |
| Lakera Guard integration (external) | ❌ No — third-party dependency |

---

## 3. Support Response Time SLAs

### 3.1 Incident Severity Definitions

| Priority | Definition | Example |
|----------|-----------|---------|
| **P1 — Critical** | Complete service outage or security incident affecting all customers | API returning 100% errors; data breach suspected |
| **P2 — High** | Partial service degradation affecting core functionality for a significant subset of customers | Evaluate endpoint returning >10% errors; SCIM provisioning down for multiple tenants |
| **P3 — Medium** | Non-critical feature impaired; workaround available | Dashboard slow to load; webhook delivery delayed; minor SSO issue for one tenant |
| **P4 — Low** | Cosmetic issues, feature requests, questions | UI typo; documentation question; configuration assistance |

### 3.2 Response Time Targets

| Priority | First Response | Status Update | Target Resolution |
|----------|---------------|---------------|-------------------|
| P1 | 1 hour | Every 30 minutes | 4 hours |
| P2 | 4 hours | Every 2 hours | 24 hours |
| P3 | 24 hours (business hours) | Daily | 72 hours |
| P4 | 72 hours (business hours) | Weekly | Best effort |

**Response time** is measured from the time a support ticket is opened or an incident is detected by AgentGuard monitoring, whichever is earlier.

**Business hours:** Monday–Friday, 09:00–18:00 AEST (UTC+10/+11), excluding Australian public holidays.

**Enterprise customers** receive 24/7 coverage for P1 and P2 incidents.  
**Pro customers** receive business-hours coverage for all priorities.

### 3.3 Support Channels

| Priority | Channel |
|----------|---------|
| P1, P2 | Email: support@agentguard.tech + Slack shared channel (Enterprise) |
| P3, P4 | Email: support@agentguard.tech |

---

## 4. Incident Communication Process

### 4.1 Detection

Incidents are detected via:
- Automated uptime monitoring (health endpoint polling every 30 seconds)
- Synthetic transaction monitoring (evaluate endpoint every 60 seconds)
- Internal alerting (PagerDuty/equivalent) for error rate thresholds
- Customer-reported issues via support channels

### 4.2 Notification

1. **Acknowledgement:** An incident is opened and an initial notification sent to affected customers within 1 hour of P1/P2 detection.

2. **Status Page:** All incidents are published to **status.agentguard.tech** within 15 minutes of detection, with:
   - Incident title and affected components
   - Current status: Investigating → Identified → Monitoring → Resolved
   - Timestamps for each status change

3. **Direct Notifications:** Enterprise customers with Slack shared channels receive direct messages for P1/P2 incidents in addition to status page updates.

4. **Progress Updates:** Status updates are posted at the intervals defined in §3.2.

5. **Post-Incident Report:** For P1 incidents, a post-mortem report is published within 5 business days of resolution, including:
   - Timeline of events
   - Root cause analysis
   - Actions taken to prevent recurrence

### 4.3 Escalation Path

```
Customer Support → Engineering On-Call → Engineering Lead → CTO
```

P1 incidents automatically escalate to Engineering Lead after 2 hours without resolution.

---

## 5. Maintenance Windows

### 5.1 Scheduled Maintenance

AgentGuard performs routine maintenance during:
- **Primary window:** Sunday 02:00–06:00 AEST
- **Secondary window:** Wednesday 02:00–04:00 AEST (if needed)

Scheduled maintenance during these windows is not counted as downtime for SLA purposes.

### 5.2 Advance Notice

| Maintenance Type | Notice Period |
|-----------------|--------------|
| Routine (no expected downtime) | 24 hours via status page |
| Planned maintenance (brief downtime expected) | 7 days via email + status page |
| Emergency maintenance (security patch) | ASAP; minimum 1 hour if possible |

### 5.3 Zero-Downtime Deployments

AgentGuard targets zero-downtime for all routine deployments using rolling updates. Maintenance windows are reserved for database migrations and infrastructure changes that cannot be performed without brief service interruption.

---

## 6. Exclusions

The following are excluded from SLA calculations:

1. **Force majeure:** Events outside AgentGuard's reasonable control (natural disasters, acts of war, widespread internet outages, ISP failures).

2. **Third-party services:** Downtime caused by third-party dependencies including Lakera Guard, Stripe, cloud provider outages (beyond our primary region), DNS providers.

3. **Customer actions:** Issues caused by customer misconfiguration, invalid API requests, exceeding rate limits, or actions taken by customer's agents.

4. **Scheduled maintenance windows** (as defined in §5).

5. **Beta features:** Features explicitly marked as "Beta" or "Preview" in documentation.

6. **Free plan:** SLA does not apply to free tier usage.

7. **SDK/library issues:** Client-side issues in AgentGuard SDKs that do not affect the hosted API.

---

## 7. Credit and Remedy Policy

### 7.1 Service Credits

If AgentGuard fails to meet the monthly uptime commitment, customers are eligible for service credits:

| Monthly Uptime Achieved | Credit (% of monthly plan fee) |
|------------------------|-------------------------------|
| 99.0% – 99.9% (Pro) / 99.5% – 99.95% (Enterprise) | 10% |
| 95.0% – 99.0% (Pro) / 99.0% – 99.5% (Enterprise) | 25% |
| < 95.0% | 50% |

**Maximum credit per month:** 50% of monthly plan fee.

### 7.2 Credit Request Process

1. Credits must be requested within **30 days** of the end of the affected calendar month.
2. Submit request to: billing@agentguard.tech with subject "SLA Credit Request — [Month Year]".
3. Include: account ID, affected date range, and description of impact observed.
4. AgentGuard will review the request within 10 business days.

### 7.3 Credit Application

Approved credits are applied to the next invoice. Credits are non-transferable and have no cash value.

### 7.4 Sole Remedy

Service credits described in this SLA are the customer's sole and exclusive remedy for any failure by AgentGuard to meet the uptime commitments. This SLA does not limit AgentGuard's liability caps as defined in the Master Subscription Agreement.

---

## 8. SLA Measurement

Uptime is measured using AgentGuard's internal monitoring infrastructure. Customers may reference **status.agentguard.tech** for historical uptime data. In the event of a discrepancy between customer-observed downtime and AgentGuard's measurements, both parties will work in good faith to reconcile the data.

---

## 9. Amendments

AgentGuard reserves the right to update this SLA with 30 days' advance notice. Continued use of the service after the effective date of changes constitutes acceptance.

---

*Last updated: 2026-03-23 | Questions: support@agentguard.tech*
