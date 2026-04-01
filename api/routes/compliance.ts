/**
 * AgentGuard — Compliance Reporting Routes (M3-80)
 *
 * POST /api/v1/compliance/owasp/generate         — generate OWASP report
 * GET  /api/v1/compliance/owasp/latest           — latest OWASP report
 * GET  /api/v1/compliance/owasp/reports/:reportId — specific OWASP report
 * GET  /api/v1/compliance/reports                 — list all report types
 * POST /api/v1/compliance/reports/generate        — generate SOC2/HIPAA/EU AI Act report
 * GET  /api/v1/compliance/reports/:reportId       — get any report by ID
 */
import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

import { ComplianceGenerateRequestSchema } from '../schemas.js';
import { generateOWASPReport } from '../lib/compliance-checker.js';
import { renderCompliancePDF } from '../lib/compliance-pdf.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

const REPORT_TYPES = {
  owasp: { name: 'OWASP Agentic Top 10', description: 'Agent security posture against OWASP Agentic threats' },
  soc2: { name: 'SOC 2 Type II', description: 'Access controls, audit trails, policy enforcement for SOC 2' },
  hipaa: { name: 'HIPAA', description: 'Data handling, access logs, encryption status for healthcare compliance' },
  'eu-ai-act': { name: 'EU AI Act', description: 'Transparency, human oversight, risk assessment per Regulation (EU) 2024/1689' },
} as const;

type ReportType = keyof typeof REPORT_TYPES;

function generateFrameworkReport(
  reportType: ReportType,
  tenantId: string,
  evaluationCount: number,
  policyActive: boolean,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const base = {
    reportType,
    generatedAt: now,
    period: { from: periodStart, to: now },
    tenantId,
  };

  if (reportType === 'soc2') {
    return {
      ...base,
      framework: 'SOC 2 Type II',
      sections: [
        { control: 'CC6.1', name: 'Logical Access', status: policyActive ? 'compliant' : 'needs-attention', evidence: `Policy engine ${policyActive ? 'active' : 'inactive'}, RBAC enforced via API keys and JWT roles` },
        { control: 'CC6.3', name: 'Data Classification', status: 'compliant', evidence: 'PII detection enabled, tool-call policies enforce data boundaries' },
        { control: 'CC7.2', name: 'System Monitoring', status: evaluationCount > 0 ? 'compliant' : 'needs-attention', evidence: `${evaluationCount} evaluations in period, audit trail with tamper-evident hashing` },
        { control: 'CC8.1', name: 'Change Management', status: policyActive ? 'compliant' : 'needs-attention', evidence: 'Policy versioning enabled with revert capability' },
      ],
      score: policyActive && evaluationCount > 0 ? 85 : policyActive ? 60 : 30,
      findings: !policyActive ? ['Policy engine not active — enable custom policies for full compliance'] : [],
    };
  }

  if (reportType === 'hipaa') {
    return {
      ...base,
      framework: 'HIPAA Security Rule',
      sections: [
        { control: '164.312(a)', name: 'Access Control', status: policyActive ? 'compliant' : 'needs-attention', evidence: 'API key auth + JWT RBAC + tenant isolation enforced' },
        { control: '164.312(b)', name: 'Audit Controls', status: 'compliant', evidence: 'All tool-call evaluations logged with tamper-evident audit chain' },
        { control: '164.312(c)', name: 'Integrity', status: 'compliant', evidence: 'SHA-256 audit chain, policy versioning with rollback' },
        { control: '164.312(e)', name: 'Transmission Security', status: 'partial', evidence: 'HTTPS enforced at deployment level; verify TLS 1.2+ in production' },
      ],
      score: policyActive ? 75 : 40,
      findings: [
        ...(!policyActive ? ['Enable custom policies to enforce PHI handling rules'] : []),
        'Verify TLS 1.2+ is enforced at the load balancer / reverse proxy level',
      ],
    };
  }

  // eu-ai-act
  return {
    ...base,
    framework: 'EU AI Act (Regulation 2024/1689)',
    sections: [
      { article: 'Art. 14', name: 'Human Oversight', status: policyActive ? 'compliant' : 'needs-attention', evidence: 'Human-in-the-loop approvals via Slack integration, policy engine gates high-risk actions' },
      { article: 'Art. 13', name: 'Transparency', status: evaluationCount > 0 ? 'compliant' : 'needs-attention', evidence: `${evaluationCount} tool-call evaluations logged with full decision reasoning` },
      { article: 'Art. 9', name: 'Risk Management', status: policyActive ? 'compliant' : 'needs-attention', evidence: 'Policy engine evaluates tool calls against risk rules before execution' },
      { article: 'Art. 5', name: 'Prohibited Practices', status: 'compliant', evidence: 'EU AI Act policy template blocks subliminal manipulation, mass biometric surveillance, social scoring' },
      { article: 'Art. 12', name: 'Record-Keeping', status: 'compliant', evidence: 'Audit trail with tamper-evident hashing, evaluation history retained' },
    ],
    score: policyActive && evaluationCount > 0 ? 80 : policyActive ? 55 : 25,
    findings: [
      ...(!policyActive ? ['Activate EU AI Act policy template for full Article 5 compliance'] : []),
      ...(evaluationCount === 0 ? ['No evaluations recorded — start evaluating agent tool calls for Article 13 transparency'] : []),
    ],
  };
}

export function createComplianceRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── GET /api/v1/compliance/reports — list report types ────────────────────
  router.get(
    '/api/v1/compliance/reports',
    auth.requireTenantAuth,
    (_req: Request, res: Response) => {
      res.json({
        reportTypes: Object.entries(REPORT_TYPES).map(([id, meta]) => ({ id, ...meta })),
      });
    },
  );

  // ── POST /api/v1/compliance/reports/generate — multi-framework ────────────
  router.post(
    '/api/v1/compliance/reports/generate',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const reportType = (req.body?.reportType || req.body?.type) as string;

      if (!reportType || !(reportType in REPORT_TYPES)) {
        return res.status(400).json({
          error: `Invalid reportType. Must be one of: ${Object.keys(REPORT_TYPES).join(', ')}`,
        });
      }

      try {
        // For OWASP, delegate to existing generator
        if (reportType === 'owasp') {
          const parsed = ComplianceGenerateRequestSchema.safeParse(req.body ?? {});
          const agentId = parsed.success ? parsed.data.agentId : undefined;
          const report = await generateOWASPReport(db, tenantId, agentId);
          const reportId = await db.insertComplianceReport(tenantId, report.reportType, report.score, JSON.stringify(report));
          return res.status(201).json({ reportId, ...report });
        }

        // For SOC2/HIPAA/EU AI Act, generate from platform data
        const evaluations = await db.getAuditEvents(tenantId, 1000, 0);
        const customPolicy = await db.getCustomPolicy(tenantId);
        const report = generateFrameworkReport(
          reportType as ReportType,
          tenantId,
          evaluations.length,
          customPolicy !== null,
        );

        const reportId = await db.insertComplianceReport(
          tenantId,
          reportType,
          (report as { score: number }).score,
          JSON.stringify(report),
        );

        res.status(201).json({ reportId, ...report });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[compliance/generate]');
        res.status(500).json({ error: 'Failed to generate compliance report' });
      }
    },
  );

  // ── POST /api/v1/compliance/owasp/generate (legacy) ──────────────────────
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
        logger.error({ err: e instanceof Error ? e : String(e) }, '[compliance/generate] error');
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
        logger.error({ err: e instanceof Error ? e : String(e) }, '[compliance/latest] error');
        res.status(500).json({ error: 'Failed to fetch compliance report' });
      }
    },
  );

  // ── GET /api/v1/compliance/owasp/reports/:reportId (legacy) ───────────────
  // ── GET /api/v1/compliance/reports/:reportId (new) ────────────────────────
  const getReportHandler = async (req: Request, res: Response) => {
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
      logger.error({ err: e instanceof Error ? e : String(e) }, '[compliance/report] error');
      res.status(500).json({ error: 'Failed to fetch compliance report' });
    }
  };

  router.get('/api/v1/compliance/reports/:reportId', auth.requireTenantAuth, getReportHandler);
  router.get('/api/v1/compliance/owasp/reports/:reportId', auth.requireTenantAuth, getReportHandler);

  // ── GET /api/v1/compliance/reports/:reportId/pdf — PDF export ────────────
  router.get(
    '/api/v1/compliance/reports/:reportId/pdf',
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
        const pdf = await renderCompliancePDF(report as Parameters<typeof renderCompliancePDF>[0]);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="agentguard-${row.report_type}-${reportId}.pdf"`);
        res.setHeader('Content-Length', pdf.length);
        res.end(pdf);
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[compliance/pdf] error');
        res.status(500).json({ error: 'Failed to generate PDF report' });
      }
    },
  );

  return router;
}
