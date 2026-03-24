/**
 * Continuous Compliance Monitoring
 *
 * Weekly auto-collection, gap alerting, and drift detection.
 * Can be run as a standalone cron job or imported into the API worker.
 */
import type { PrismaClient } from '@prisma/client';
import type { ComplianceReport } from '../types.js';
import { ComplianceReportGenerator } from '../reporters/report-generator.js';

export interface ComplianceAlert {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: string;
  message: string;
  controlId: string;
  tenantId: string;
  detectedAt: string;
  remediation?: string;
}

export class ContinuousComplianceMonitor {
  private readonly generator: ComplianceReportGenerator;

  constructor(private readonly db: PrismaClient) {
    this.generator = new ComplianceReportGenerator(db);
  }

  /** Run compliance check for a tenant and return alerts */
  async runCheck(tenantId: string): Promise<{
    report: ComplianceReport;
    alerts: ComplianceAlert[];
  }> {
    const report = await this.generator.generate({
      tenantId,
      periodDays: 30,
      frameworks: ['SOC2', 'ISO27001'],
    });

    const alerts = this.generateAlerts(report);

    return { report, alerts };
  }

  /** Run checks for all tenants */
  async runAllTenants(): Promise<Map<string, ComplianceAlert[]>> {
    const results = new Map<string, ComplianceAlert[]>();

    try {
      const tenants = await this.db.tenant.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });

      for (const tenant of tenants) {
        try {
          const { alerts } = await this.runCheck(tenant.id);
          results.set(tenant.id, alerts);
        } catch (err) {
          console.error(`[compliance] Error checking tenant ${tenant.id}: ${err}`);
          results.set(tenant.id, []);
        }
      }
    } catch {
      // ignore
    }

    return results;
  }

  /** Generate actionable alerts from a compliance report */
  generateAlerts(report: ComplianceReport): ComplianceAlert[] {
    const alerts: ComplianceAlert[] = [];
    const now = new Date().toISOString();

    for (const control of report.controls) {
      if (control.status === 'FAIL') {
        alerts.push({
          severity: 'CRITICAL',
          type: 'COMPLIANCE_FAILURE',
          message: `Control ${control.controlId} FAILED: ${control.finding}`,
          controlId: control.controlId,
          tenantId: report.tenantId,
          detectedAt: now,
          remediation: control.remediation,
        });
      } else if (control.status === 'WARNING') {
        alerts.push({
          severity: 'MEDIUM',
          type: 'COMPLIANCE_WARNING',
          message: `Control ${control.controlId} WARNING: ${control.finding}`,
          controlId: control.controlId,
          tenantId: report.tenantId,
          detectedAt: now,
          remediation: control.remediation,
        });
      }
    }

    // Drift detection alerts
    if (report.driftDetection.riskLevel === 'HIGH') {
      alerts.push({
        severity: 'HIGH',
        type: 'CONFIG_DRIFT',
        message: `High config drift detected: ${report.driftDetection.totalChanges} changes since last audit`,
        controlId: 'DRIFT',
        tenantId: report.tenantId,
        detectedAt: now,
        remediation: 'Review configuration changes and update compliance baseline',
      });
    }

    // Audit log integrity alert
    if (!report.auditLogs.chainIntegrityValid) {
      alerts.push({
        severity: 'CRITICAL',
        type: 'AUDIT_LOG_TAMPERING',
        message: 'CRITICAL: Audit log hash chain integrity verification FAILED',
        controlId: 'SOC2-CC7.2',
        tenantId: report.tenantId,
        detectedAt: now,
        remediation: 'Immediately investigate audit log for tampering. Escalate to security team.',
      });
    }

    // Stale accounts
    if (report.accessControl.staleAccounts > 0) {
      alerts.push({
        severity: 'MEDIUM',
        type: 'STALE_ACCOUNTS',
        message: `${report.accessControl.staleAccounts} stale user account(s) inactive for 90+ days`,
        controlId: 'SOC2-CC6.1',
        tenantId: report.tenantId,
        detectedAt: now,
        remediation: 'Deactivate or remove stale accounts',
      });
    }

    return alerts;
  }
}

/**
 * Standalone cron entry point.
 * Typically invoked by: node -e "import('./monitoring/cron.js').then(m => m.main())"
 */
export async function runWeeklyComplianceCheck(db: PrismaClient): Promise<void> {
  console.log('[compliance:weekly] Starting weekly compliance check...');
  const monitor = new ContinuousComplianceMonitor(db);

  try {
    const allAlerts = await monitor.runAllTenants();

    let totalAlerts = 0;
    let criticalAlerts = 0;

    for (const [tenantId, alerts] of allAlerts) {
      totalAlerts += alerts.length;
      criticalAlerts += alerts.filter((a) => a.severity === 'CRITICAL').length;

      if (alerts.length > 0) {
        console.log(
          `[compliance:weekly] Tenant ${tenantId}: ${alerts.length} alerts (${alerts.filter((a) => a.severity === 'CRITICAL').length} critical)`,
        );

        for (const alert of alerts.filter((a) => a.severity === 'CRITICAL')) {
          console.error(`[compliance:CRITICAL] ${alert.message}`);
        }
      }
    }

    console.log(
      `[compliance:weekly] Complete. ${allAlerts.size} tenants, ${totalAlerts} alerts, ${criticalAlerts} critical`,
    );
  } catch (err) {
    console.error('[compliance:weekly] Error:', err);
    throw err;
  }
}
