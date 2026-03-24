/**
 * Compliance Report Generator
 *
 * Orchestrates all evidence collectors and produces a structured
 * compliance report suitable for auditor review.
 */
import type { PrismaClient } from '@prisma/client';
import type { ComplianceReport, EvidenceItem, CollectionOptions } from '../types.js';
import { collectAccessControl } from '../collectors/access-control.js';
import { collectEncryption } from '../collectors/encryption.js';
import { collectAuditLogCompleteness } from '../collectors/audit-log-completeness.js';
import { collectScimProvisioning } from '../collectors/scim-provisioning.js';
import { collectPolicyLatency } from '../collectors/policy-latency.js';
import { collectIncidentResponse } from '../collectors/incident-response.js';
import { collectDriftDetection } from '../collectors/drift-detection.js';
import crypto from 'node:crypto';

export class ComplianceReportGenerator {
  constructor(private readonly db: PrismaClient) {}

  async generate(options: CollectionOptions): Promise<ComplianceReport> {
    const now = new Date();
    const periodDays = options.periodDays ?? 30;
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Run all collectors in parallel
    const [
      accessControlResult,
      encryptionResult,
      auditLogResult,
      scimResult,
      latencyResult,
      incidentResult,
    ] = await Promise.all([
      collectAccessControl(this.db, options),
      collectEncryption(this.db, options),
      collectAuditLogCompleteness(this.db, options),
      collectScimProvisioning(this.db, options),
      collectPolicyLatency(this.db, options),
      collectIncidentResponse(this.db, options),
    ]);

    // Drift detection uses last 7 days by default
    const driftDetection = await collectDriftDetection(
      this.db,
      options.tenantId,
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );

    const controls: EvidenceItem[] = [
      accessControlResult.item,
      encryptionResult.item,
      auditLogResult.item,
      scimResult.item,
      latencyResult.item,
      incidentResult.item,
    ];

    // Overall status
    const failCount = controls.filter((c) => c.status === 'FAIL').length;
    const warnCount = controls.filter((c) => c.status === 'WARNING').length;
    const passCount = controls.filter((c) => c.status === 'PASS').length;
    const naCount = controls.filter((c) => c.status === 'NOT_APPLICABLE').length;

    const overallStatus =
      failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARNING' : 'PASS';

    const report: ComplianceReport = {
      reportId: `compliance-${options.tenantId}-${crypto.randomUUID()}`,
      tenantId: options.tenantId,
      generatedAt: now.toISOString(),
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      frameworks: options.frameworks ?? ['SOC2', 'ISO27001'],
      overallStatus,
      summary: {
        total: controls.length,
        passed: passCount,
        failed: failCount,
        warnings: warnCount,
        notApplicable: naCount,
      },
      controls,
      accessControl: accessControlResult.evidence,
      encryption: encryptionResult.evidence,
      auditLogs: auditLogResult.evidence,
      scimProvisioning: scimResult.evidence,
      policyLatency: latencyResult.evidence,
      incidentResponse: incidentResult.evidence,
      driftDetection,
    };

    return report;
  }
}
