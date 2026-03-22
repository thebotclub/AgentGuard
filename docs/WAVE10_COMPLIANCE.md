# Wave 10: AgentGuard Chaos Engineering + Compliance Automation

**Completed:** 2026-03-22  
**Wave Focus:** Production resilience validation, SOC 2/ISO 27001 evidence automation, advanced audit analytics

---

## Task 1: Chaos Testing Framework ✅

### What Was Built
A comprehensive chaos testing framework in `tests/chaos/` with 6 production failure scenarios.

### Files
```
tests/chaos/
├── helpers.ts                         # Shared utilities, request client, result recording
├── run-all.ts                         # Full suite runner, JSON report generator
├── scenario-01-redis-down.ts          # Redis failure — fail-closed validation
├── scenario-02-pg-exhaustion.ts       # PG pool exhaustion — graceful degradation
├── scenario-03-policy-latency.ts      # High-latency evaluation — timeout handling
├── scenario-04-concurrent-killswitch.ts  # Race conditions — deterministic state
├── scenario-05-scim-token-rotation.ts    # SCIM token rotation — no provisioning gaps
└── scenario-06-sse-reconnect.ts       # SSE reconnect — event replay
docs/CHAOS_TESTING.md                  # Full documentation
```

### Scenario Summary

| # | Scenario | Critical Finding |
|---|----------|-----------------|
| 1 | Redis Down | Must verify fail-closed (BLOCK not ALLOW) when Redis unreachable |
| 2 | PG Pool Exhaustion | Must return 503 + Retry-After, health endpoint must stay live |
| 3 | Policy Latency | Must enforce 500ms timeout → BLOCK with TIMEOUT_EXCEEDED |
| 4 | Concurrent Kill Switch | Must use atomic Redis ops to prevent race conditions |
| 5 | SCIM Token Rotation | Need 30s grace period overlap for in-flight requests |
| 6 | SSE Reconnect | Implement Redis Streams for Last-Event-ID event replay |

### Running
```bash
npx tsx tests/chaos/run-all.ts
# Results → reports/chaos-results-<timestamp>.json
```

---

## Task 2: Compliance Evidence Automation ✅

### What Was Built
A complete SOC 2 / ISO 27001 evidence collection package with 6 evidence collectors, a report generator, continuous monitoring, and API endpoints.

### Files
```
packages/compliance/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                          # Package exports
    ├── types.ts                          # Evidence types, ComplianceReport interface
    ├── collectors/
    │   ├── access-control.ts             # SOC2-CC6.1: who has access to what
    │   ├── encryption.ts                 # SOC2-CC6.7: encryption at rest/transit
    │   ├── audit-log-completeness.ts     # SOC2-CC7.2: no gaps in 30 days
    │   ├── scim-provisioning.ts          # SOC2-CC6.2: IdP vs local user counts
    │   ├── policy-latency.ts             # SOC2-A1.2: p99 <200ms SLA
    │   ├── incident-response.ts          # SOC2-CC7.3: <15min response time
    │   └── drift-detection.ts            # Config changes since last audit
    ├── reporters/
    │   └── report-generator.ts           # Orchestrates all collectors
    └── monitoring/
        └── continuous-monitor.ts         # Weekly auto-collection, alerting
```

### API Endpoints Added

```
POST /v1/compliance/evidence/collect
  Trigger evidence collection. Requires admin role.
  Body: { periodDays?: 30, frameworks?: ["SOC2", "ISO27001"] }
  Response: Full ComplianceReport with all controls

GET /v1/compliance/evidence/report
  Generate compliance report + alerts. Requires operator role.
  Query: periodDays, frameworks
  Response: { report, alerts, alertSummary }
```

### Evidence Controls Covered

| Control ID | Framework | Title | Status Criteria |
|-----------|-----------|-------|----------------|
| SOC2-CC6.1 | SOC 2 | Logical Access Controls | PASS if no stale accounts (90+ days), admin% reasonable |
| SOC2-CC6.7 | SOC 2 | Encryption at Rest/Transit | PASS if DB encrypted, tokens bcrypt-hashed |
| SOC2-CC7.2 | SOC 2 | Audit Log Integrity | PASS if 0 gaps, chain integrity valid, ≥95% coverage |
| SOC2-CC6.2 | SOC 2 | SCIM Provisioning Accuracy | PASS if ≥95% users SCIM-synced |
| SOC2-A1.2  | SOC 2 | Policy Latency SLA | PASS if p99 <200ms, 99% compliance |
| SOC2-CC7.3 | SOC 2 | Incident Response Time | PASS if ≥95% incidents resolved within 15 minutes |

### Continuous Monitoring
- **Weekly auto-collection:** `runWeeklyComplianceCheck(db)` can be scheduled via cron
- **Alerts generated for:** FAIL controls, WARNING controls, config drift, stale accounts, chain integrity failures
- **Drift detection:** Detects policy/user/agent changes since last audit, rates risk LOW/MEDIUM/HIGH

---

## Task 3: Advanced Audit Analytics ✅

### What Was Built
Four new analytics API endpoints providing risk trend analysis, policy violation heatmaps, anomaly detection, and SIEM format export.

### Files
```
packages/api/src/routes/audit-analytics.ts  # All 4 analytics routes
packages/api/src/routes/audit.ts            # Extended: CEF/LEEF SIEM export
packages/api/src/app.ts                     # Updated: mounts auditAnalyticsRouter
```

### API Endpoints

```
GET /v1/audit/analytics/risk-trend
  Rolling risk score trend by day.
  Query: days (default 30, max 90)
  Response: { trend[], rolling7Day[], summary }

GET /v1/audit/analytics/heatmap
  Policy violation heatmap: events by hour-of-day × day-of-week.
  Query: days, decision (ALLOW|BLOCK|MONITOR), riskTier
  Response: 7×24 grid with event counts and avg risk scores

GET /v1/audit/analytics/anomalies
  Agent behavior anomaly detection (z-score based).
  Query: days (default 14), threshold (default 2.0)
  Response: Anomalies sorted by severity

GET /v1/audit/export?format=cef|leef|json|csv
  Streaming SIEM export (extended existing endpoint).
  CEF: ArcSight / generic SIEM format
  LEEF: IBM QRadar format
  Query: format, fromDate, toDate, agentId, decision
```

### Anomaly Types Detected

| Type | Description | Severity |
|------|-------------|----------|
| `BLOCK_RATE_SPIKE` | Block rate 2× above baseline | MEDIUM/HIGH |
| `RISK_SCORE_SPIKE` | Avg risk score 2× above baseline | MEDIUM/CRITICAL |
| `NEW_TOOL_USAGE` | Tools not seen in baseline period | LOW |
| `OFF_HOURS_ACTIVITY` | >40% events outside 06:00-22:00 UTC | MEDIUM |

### SIEM Export Formats

**CEF (ArcSight):**
```
CEF:0|AgentGuard|AgentGuard Runtime Security|1.0|AGENTGUARD_BLOCK_TOOL_CALL|Agent action BLOCK: TOOL_CALL|8|rt=1742601600000 src=tenant-123 dvchost=agent-456 act=BLOCK riskScore=85 riskTier=HIGH ...
```

**LEEF (IBM QRadar):**
```
LEEF:2.0|AgentGuard|AgentGuard Runtime Security|1.0|AGENTGUARD_BLOCK_TOOL_CALL|	devTime=2026-03-22T00:00:00Z	action=BLOCK	riskScore=85	...
```

---

## Architecture Notes

### Package Dependencies
```
@agentguard/api
  └── @agentguard/compliance  (NEW)
      └── @agentguard/shared
          └── @prisma/client
```

### Adding @agentguard/compliance to API
The compliance package is referenced in `packages/api/package.json` as `"@agentguard/compliance": "*"` (workspace dependency) and imported in `packages/api/src/routes/compliance.ts`.

### Weekly Compliance Cron
Add to `docker/start-workers.sh` or a separate cron service:
```bash
# Run weekly compliance check (Sunday 02:00 UTC)
0 2 * * 0 node -e "
  import('@agentguard/compliance').then(async m => {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    await m.runWeeklyComplianceCheck(db);
    await db.\$disconnect();
  });
"
```

---

## Commits

1. **feat(chaos): add chaos testing framework with 6 failure scenarios**
   - tests/chaos/ directory with all scenarios and runner
   - docs/CHAOS_TESTING.md

2. **feat(compliance): add SOC2/ISO27001 evidence collection package**
   - packages/compliance/ with 6 evidence collectors
   - Continuous monitoring and drift detection
   - POST /v1/compliance/evidence/collect
   - GET /v1/compliance/evidence/report

3. **feat(audit): add analytics routes and SIEM export formats**
   - GET /v1/audit/analytics/risk-trend
   - GET /v1/audit/analytics/heatmap
   - GET /v1/audit/analytics/anomalies
   - GET /v1/audit/export?format=cef|leef|json|csv
