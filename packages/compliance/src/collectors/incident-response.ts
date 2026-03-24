/**
 * Incident Response Time Metrics Collector
 * SOC 2 CC7.3 / ISO 27001 A.16.1
 *
 * Measures time from high-risk event detection to kill-switch activation.
 * This is a proxy for incident response time.
 */
import type { PrismaClient } from '@prisma/client';
import type { IncidentResponseEvidence, EvidenceItem, CollectionOptions } from '../types.js';

// SLA: incidents acknowledged within 15 minutes
const INCIDENT_SLA_MS = 15 * 60 * 1000;

export async function collectIncidentResponse(
  db: PrismaClient,
  options: CollectionOptions,
): Promise<{ evidence: IncidentResponseEvidence; item: EvidenceItem }> {
  const now = new Date();
  const periodDays = options.periodDays ?? 30;
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  let totalIncidents = 0;
  let avgResponseTimeMs = 0;
  let p95ResponseTimeMs = 0;
  let slaCompliantIncidents = 0;

  try {
    // Get all CRITICAL/HIGH risk events
    const criticalEvents = await db.auditEvent.findMany({
      where: {
        tenantId: options.tenantId,
        occurredAt: { gte: periodStart, lte: now },
        riskTier: { in: ['CRITICAL', 'HIGH'] },
        policyDecision: 'BLOCK',
      },
      select: {
        agentId: true,
        occurredAt: true,
        riskTier: true,
      },
      orderBy: { occurredAt: 'asc' },
    });

    totalIncidents = criticalEvents.length;

    if (totalIncidents > 0) {
      // For each incident, find the corresponding kill switch command
      const responseTimes: number[] = [];

      for (const event of criticalEvents.slice(0, 100)) {
        // Cap at 100 for performance
        const killCmd = await db.killSwitchCommand.findFirst({
          where: {
            tenantId: options.tenantId,
            agentId: event.agentId,
            issuedAt: { gte: event.occurredAt },
          },
          orderBy: { issuedAt: 'asc' },
          select: { issuedAt: true },
        });

        if (killCmd) {
          const responseMs = killCmd.issuedAt.getTime() - event.occurredAt.getTime();
          responseTimes.push(responseMs);
        }
      }

      if (responseTimes.length > 0) {
        responseTimes.sort((a, b) => a - b);
        avgResponseTimeMs = Math.round(
          responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length,
        );
        p95ResponseTimeMs = responseTimes[Math.floor(responseTimes.length * 0.95)] ?? 0;
        slaCompliantIncidents = responseTimes.filter((t) => t <= INCIDENT_SLA_MS).length;
      }
    }
  } catch {
    // Some tables may not exist
  }

  const slaCompliancePercent =
    totalIncidents === 0
      ? 100
      : Math.round((slaCompliantIncidents / Math.min(totalIncidents, 100)) * 100);

  const evidence: IncidentResponseEvidence = {
    controlId: 'SOC2-CC7.3',
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    totalIncidents,
    avgResponseTimeMs,
    p95ResponseTimeMs,
    slaThresholdMs: INCIDENT_SLA_MS,
    slaCompliantIncidents,
    slaCompliancePercent,
    collectedAt: now.toISOString(),
  };

  const status =
    totalIncidents === 0
      ? 'NOT_APPLICABLE'
      : slaCompliancePercent >= 95
        ? 'PASS'
        : slaCompliancePercent >= 80
          ? 'WARNING'
          : 'FAIL';

  const item: EvidenceItem = {
    controlId: 'SOC2-CC7.3',
    framework: 'SOC2',
    category: 'Incident Response',
    title: 'Incident Detection and Response Time',
    finding:
      totalIncidents === 0
        ? `No CRITICAL/HIGH incidents in ${periodDays} day period`
        : `${totalIncidents} incidents | avg response: ${Math.round(avgResponseTimeMs / 1000)}s | ${slaCompliancePercent}% within ${Math.round(INCIDENT_SLA_MS / 60000)}min SLA`,
    status,
    collectedAt: now.toISOString(),
    evidence: {
      totalIncidents,
      avgResponseTimeMs,
      p95ResponseTimeMs,
      slaThresholdMs: INCIDENT_SLA_MS,
      slaCompliantIncidents,
      slaCompliancePercent,
      periodDays,
    },
    remediation:
      slaCompliancePercent < 95 && totalIncidents > 0
        ? `${100 - slaCompliancePercent}% of incidents not acknowledged within ${Math.round(INCIDENT_SLA_MS / 60000)} minutes — review incident response playbook`
        : undefined,
  };

  return { evidence, item };
}
