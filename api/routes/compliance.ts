/**
 * AgentGuard — OWASP Agentic Top 10 Compliance Routes
 *
 * POST /api/v1/compliance/owasp/generate         — generate a new OWASP report (tenant auth)
 * GET  /api/v1/compliance/owasp/latest           — get the latest report for this tenant (tenant auth)
 * GET  /api/v1/compliance/owasp/reports/:reportId — get a specific report by ID (tenant auth)
 */
import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { ComplianceGenerateRequestSchema } from '../schemas.js';
import { generateOWASPReport } from '../lib/compliance-checker.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

export function createComplianceRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── POST /api/v1/compliance/owasp/generate ────────────────────────────────
  router.post(
    '/api/v1/compliance/owasp/generate',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      const parsed = ComplianceGenerateRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]!.message });
      }

      const { agentId } = parsed.data;

      try {
        const report = await generateOWASPReport(db, tenantId, agentId);

        // Persist the report
        const reportId = await db.insertComplianceReport(
          tenantId,
          report.reportType,
          report.score,
          JSON.stringify(report),
        );

        res.status(201).json({
          reportId,
          ...report,
        });
      } catch (e) {
        console.error('[compliance/generate] error:', e);
        res.status(500).json({ error: 'Failed to generate compliance report' });
      }
    },
  );

  // ── GET /api/v1/compliance/owasp/latest ───────────────────────────────────
  router.get(
    '/api/v1/compliance/owasp/latest',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      try {
        const row = await db.getLatestComplianceReport(tenantId);
        if (!row) {
          return res.status(404).json({
            error: 'No compliance report found. Generate one with POST /api/v1/compliance/owasp/generate',
          });
        }

        const report = JSON.parse(row.controls_json) as Record<string, unknown>;
        res.json({
          reportId: row.id,
          score: row.score,
          generatedAt: row.generated_at,
          ...report,
        });
      } catch (e) {
        console.error('[compliance/latest] error:', e);
        res.status(500).json({ error: 'Failed to fetch compliance report' });
      }
    },
  );

  // ── GET /api/v1/compliance/owasp/reports/:reportId ────────────────────────
  router.get(
    '/api/v1/compliance/owasp/reports/:reportId',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const { reportId } = req.params as { reportId: string };

      if (!reportId) {
        return res.status(400).json({ error: 'reportId is required' });
      }

      try {
        const row = await db.getComplianceReport(tenantId, reportId);
        if (!row) {
          return res.status(404).json({ error: 'Compliance report not found' });
        }

        const report = JSON.parse(row.controls_json) as Record<string, unknown>;
        res.json({
          reportId: row.id,
          score: row.score,
          generatedAt: row.generated_at,
          ...report,
        });
      } catch (e) {
        console.error('[compliance/report] error:', e);
        res.status(500).json({ error: 'Failed to fetch compliance report' });
      }
    },
  );

  return router;
}
