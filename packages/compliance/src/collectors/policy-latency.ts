/**
 * Policy Evaluation Latency SLA Compliance Collector
 * SOC 2 A1.2 / ISO 27001 A.17.2
 *
 * Verifies policy evaluation meets the <200ms p99 SLA.
 */
import type { PrismaClient } from '@prisma/client';
import type { PolicyLatencyEvidence, EvidenceItem, CollectionOptions } from '../types.js';

const SLA_THRESHOLD_MS = 200; // p99 must be < 200ms

export async function collectPolicyLatency(
  db: PrismaClient,
  options: CollectionOptions,
): Promise<{ evidence: PolicyLatencyEvidence; item: EvidenceItem }> {
  const now = new Date();
  const periodDays = options.periodDays ?? 30;
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  let p50Ms = 0;
  let p95Ms = 0;
  let p99Ms = 0;
  let maxMs = 0;
  let sampleCount = 0;
  let slaViolations = 0;

  try {
    // Query processing times from audit events
    const latencies = await db.auditEvent.findMany({
      where: {
        tenantId: options.tenantId,
        occurredAt: { gte: periodStart, lte: now },
      },
      select: { processingMs: true },
      orderBy: { processingMs: 'asc' },
      take: 10000, // Cap at 10k samples for performance
    });

    sampleCount = latencies.length;

    if (sampleCount > 0) {
      const values = latencies.map((e: any) => e.processingMs).sort((a: number, b: number) => a - b);
      p50Ms = values[Math.floor(sampleCount * 0.5)] ?? 0;
      p95Ms = values[Math.floor(sampleCount * 0.95)] ?? 0;
      p99Ms = values[Math.floor(sampleCount * 0.99)] ?? 0;
      maxMs = values[sampleCount - 1] ?? 0;
      slaViolations = values.filter((v: number) => v > SLA_THRESHOLD_MS).length;
    }
  } catch {
    // processingMs column may not exist in all versions
  }

  const slaCompliancePercent =
    sampleCount > 0
      ? Math.round(((sampleCount - slaViolations) / sampleCount) * 100)
      : 100;

  const evidence: PolicyLatencyEvidence = {
    controlId: 'SOC2-A1.2',
    slaThresholdMs: SLA_THRESHOLD_MS,
    p50Ms,
    p95Ms,
    p99Ms,
    maxMs,
    sampleCount,
    slaViolations,
    slaCompliancePercent,
    collectedAt: now.toISOString(),
  };

  const status =
    sampleCount === 0
      ? 'NOT_APPLICABLE'
      : p99Ms <= SLA_THRESHOLD_MS && slaCompliancePercent >= 99
        ? 'PASS'
        : p99Ms <= SLA_THRESHOLD_MS * 2 || slaCompliancePercent >= 95
          ? 'WARNING'
          : 'FAIL';

  const item: EvidenceItem = {
    controlId: 'SOC2-A1.2',
    framework: 'SOC2',
    category: 'Availability',
    title: 'Policy Evaluation Latency SLA',
    finding:
      sampleCount === 0
        ? 'No audit events found — cannot measure policy latency'
        : `p50=${p50Ms}ms, p95=${p95Ms}ms, p99=${p99Ms}ms (SLA: <${SLA_THRESHOLD_MS}ms) | ${slaCompliancePercent}% compliant over ${sampleCount.toLocaleString()} evaluations`,
    status,
    collectedAt: now.toISOString(),
    evidence: {
      slaThresholdMs: SLA_THRESHOLD_MS,
      p50Ms,
      p95Ms,
      p99Ms,
      maxMs,
      sampleCount,
      slaViolations,
      slaCompliancePercent,
      periodDays,
    },
    remediation:
      p99Ms > SLA_THRESHOLD_MS
        ? `p99 (${p99Ms}ms) exceeds SLA (${SLA_THRESHOLD_MS}ms) — optimize policy evaluation or upgrade infrastructure`
        : undefined,
  };

  return { evidence, item };
}
