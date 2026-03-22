/**
 * Compliance Evidence API Routes
 *
 * POST /api/compliance/evidence/collect  — trigger evidence collection
 * GET  /api/compliance/evidence/report   — retrieve latest report
 *
 * Mounts under the main API at /v1/compliance/evidence/
 */
import { Hono } from 'hono';
import type { PrismaClient } from '@prisma/client';
import { ComplianceReportGenerator } from '../reporters/report-generator.js';
import { ContinuousComplianceMonitor } from '../monitoring/continuous-monitor.js';

export function createComplianceEvidenceRouter(db: PrismaClient): Hono {
  const router = new Hono();

  /**
   * POST /v1/compliance/evidence/collect
   *
   * Trigger a fresh evidence collection run.
   * Returns the full compliance report with all controls.
   */
  router.post('/collect', async (c) => {
    // Auth context from middleware
    const ctx = (c.get as (key: string) => unknown)('ctx') as {
      tenantId: string;
      role: string;
    } | undefined;

    const tenantId = ctx?.tenantId ?? c.req.header('X-Tenant-Id');
    if (!tenantId) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' } }, 401);
    }

    // Only admins/owners can trigger compliance collection
    if (ctx?.role && !['admin', 'owner'].includes(ctx.role)) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Compliance evidence collection requires admin role' } },
        403,
      );
    }

    const body = await c.req.json().catch(() => ({})) as {
      periodDays?: number;
      frameworks?: string[];
    };

    const generator = new ComplianceReportGenerator(db);
    const report = await generator.generate({
      tenantId,
      periodDays: body.periodDays ?? 30,
      frameworks: body.frameworks ?? ['SOC2', 'ISO27001'],
    });

    return c.json({
      data: report,
      meta: {
        collectedAt: new Date().toISOString(),
        version: '1.0',
      },
    });
  });

  /**
   * GET /v1/compliance/evidence/report
   *
   * Generate and return a compliance evidence report.
   * Also includes alerts from continuous monitoring.
   */
  router.get('/report', async (c) => {
    const ctx = (c.get as (key: string) => unknown)('ctx') as {
      tenantId: string;
      role: string;
    } | undefined;

    const tenantId = ctx?.tenantId ?? c.req.query('tenantId');
    if (!tenantId) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' } }, 401);
    }

    const periodDays = parseInt(c.req.query('periodDays') ?? '30', 10);
    const frameworks = c.req.query('frameworks')?.split(',') ?? ['SOC2', 'ISO27001'];

    const monitor = new ContinuousComplianceMonitor(db);
    const { report, alerts } = await monitor.runCheck(tenantId);

    return c.json({
      data: {
        report,
        alerts,
        alertSummary: {
          total: alerts.length,
          critical: alerts.filter((a) => a.severity === 'CRITICAL').length,
          high: alerts.filter((a) => a.severity === 'HIGH').length,
          medium: alerts.filter((a) => a.severity === 'MEDIUM').length,
        },
      },
      meta: {
        generatedAt: new Date().toISOString(),
        periodDays,
        frameworks,
      },
    });
  });

  return router;
}
