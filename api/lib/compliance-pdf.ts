/**
 * AgentGuard — Compliance PDF Renderer
 *
 * Generates branded PDF compliance reports from the same JSON data
 * produced by the compliance routes. Uses pdfkit (zero-dependency, no browser).
 */
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

interface Section {
  control?: string;
  article?: string;
  name: string;
  status: string;
  evidence: string;
}

interface ComplianceReport {
  reportType: string;
  framework?: string;
  generatedAt: string;
  period?: { from: string; to: string };
  tenantId: string;
  score: number;
  sections?: Section[];
  findings?: string[];
  controls?: Array<{ id: string; name: string; status: string; score: number; details: string }>;
  [key: string]: unknown;
}

const STATUS_COLORS: Record<string, [number, number, number]> = {
  compliant: [34, 139, 34],
  'needs-attention': [255, 165, 0],
  partial: [255, 165, 0],
  'non-compliant': [220, 20, 60],
  fail: [220, 20, 60],
  pass: [34, 139, 34],
};

function statusColor(status: string): [number, number, number] {
  return STATUS_COLORS[status.toLowerCase()] ?? [128, 128, 128];
}

/**
 * Render a compliance report as a PDF buffer.
 * Returns a Buffer suitable for streaming as `application/pdf`.
 */
export async function renderCompliancePDF(report: ComplianceReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    const stream = new PassThrough();
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    doc.pipe(stream);

    // ── Header ────────────────────────────────────────────────────────────
    doc.fontSize(24).fillColor('#1e293b').text('AgentGuard', { align: 'center' });
    doc.fontSize(10).fillColor('#64748b').text('Runtime Security for AI Agents', { align: 'center' });
    doc.moveDown(0.5);

    // ── Title ─────────────────────────────────────────────────────────────
    const framework = report.framework || report.reportType?.toUpperCase() || 'Compliance';
    doc.fontSize(18).fillColor('#0f172a').text(`${framework} Report`, { align: 'center' });
    doc.moveDown(0.3);

    // ── Metadata ──────────────────────────────────────────────────────────
    doc.fontSize(9).fillColor('#64748b');
    doc.text(`Generated: ${report.generatedAt}`, { align: 'center' });
    if (report.period) {
      doc.text(`Period: ${report.period.from.slice(0, 10)} → ${report.period.to.slice(0, 10)}`, { align: 'center' });
    }
    doc.text(`Tenant: ${report.tenantId}`, { align: 'center' });
    doc.moveDown(1);

    // ── Score ─────────────────────────────────────────────────────────────
    const score = report.score ?? 0;
    const scoreColor: [number, number, number] = score >= 70 ? [34, 139, 34] : score >= 40 ? [255, 165, 0] : [220, 20, 60];
    doc.fontSize(36).fillColor(scoreColor).text(`${score}/100`, { align: 'center' });
    doc.fontSize(10).fillColor('#64748b').text('Compliance Score', { align: 'center' });
    doc.moveDown(1.5);

    // ── Sections (SOC2 / HIPAA / EU AI Act) ───────────────────────────────
    const sections = report.sections as Section[] | undefined;
    if (sections?.length) {
      doc.fontSize(14).fillColor('#0f172a').text('Control Assessment');
      doc.moveDown(0.5);

      for (const section of sections) {
        const ref = section.control || section.article || '';
        const color = statusColor(section.status);

        doc.fontSize(11).fillColor('#0f172a').text(`${ref}  ${section.name}`, { continued: true });
        doc.fillColor(color).text(`  ${section.status.toUpperCase()}`, { continued: false });
        doc.fontSize(9).fillColor('#475569').text(section.evidence);
        doc.moveDown(0.5);
      }
      doc.moveDown(0.5);
    }

    // ── Controls (OWASP format) ───────────────────────────────────────────
    const controls = report.controls as Array<{ id: string; name: string; status: string; score: number; details: string }> | undefined;
    if (controls?.length) {
      doc.fontSize(14).fillColor('#0f172a').text('OWASP Agentic Controls');
      doc.moveDown(0.5);

      for (const ctrl of controls) {
        const color = statusColor(ctrl.status);
        doc.fontSize(11).fillColor('#0f172a').text(`${ctrl.id}  ${ctrl.name}`, { continued: true });
        doc.fillColor(color).text(`  ${ctrl.score}/100`, { continued: false });
        doc.fontSize(9).fillColor('#475569').text(ctrl.details);
        doc.moveDown(0.5);
      }
      doc.moveDown(0.5);
    }

    // ── Findings ──────────────────────────────────────────────────────────
    const findings = report.findings as string[] | undefined;
    if (findings?.length) {
      doc.fontSize(14).fillColor('#0f172a').text('Findings & Recommendations');
      doc.moveDown(0.3);
      for (const finding of findings) {
        doc.fontSize(10).fillColor('#475569').text(`•  ${finding}`);
        doc.moveDown(0.2);
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#94a3b8')
      .text(`AgentGuard Compliance Report — Generated ${new Date().toISOString()} — Confidential`, { align: 'center' });

    doc.end();
  });
}
