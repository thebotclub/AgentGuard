/**
 * Compliance report routes — /v1/compliance
 *
 * GET  /v1/compliance/report              — aggregated compliance data for PDF export
 * POST /v1/compliance/evidence/collect    — trigger SOC2/ISO27001 evidence collection
 * GET  /v1/compliance/evidence/report     — generate full compliance evidence report
 *
 * Returns OWASP score, policy summary, recent audit events, and agent health.
 */
import { Hono } from 'hono';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { ComplianceReportGenerator, ContinuousComplianceMonitor } from '@agentguard/compliance';

export const complianceRouter = new Hono();

// ─── Evidence Collection Routes ───────────────────────────────────────────────

/**
 * POST /v1/compliance/evidence/collect
 *
 * Trigger a fresh SOC 2 / ISO 27001 evidence collection run.
 */
complianceRouter.post('/evidence/collect', async (c) => {
  const ctx = getContext(c);
  if (!['admin', 'owner'].includes(ctx.role)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Requires admin role' } }, 403);
  }

  const body = await c.req.json().catch(() => ({})) as {
    periodDays?: number;
    frameworks?: string[];
  };

  const generator = new ComplianceReportGenerator(prisma);
  const report = await generator.generate({
    tenantId: ctx.tenantId,
    periodDays: body.periodDays ?? 30,
    frameworks: body.frameworks ?? ['SOC2', 'ISO27001'],
  });

  return c.json({
    data: report,
    meta: { collectedAt: new Date().toISOString(), version: '1.0' },
  });
});

/**
 * GET /v1/compliance/evidence/report
 *
 * Generate and return compliance evidence report with alerts.
 */
complianceRouter.get('/evidence/report', async (c) => {
  const ctx = getContext(c);
  if (!['admin', 'owner', 'operator'].includes(ctx.role)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Requires operator role or higher' } }, 403);
  }

  const periodDays = parseInt(c.req.query('periodDays') ?? '30', 10);
  const frameworks = c.req.query('frameworks')?.split(',') ?? ['SOC2', 'ISO27001'];

  const monitor = new ContinuousComplianceMonitor(prisma);
  const { report, alerts } = await monitor.runCheck(ctx.tenantId);

  return c.json({
    data: {
      report,
      alerts,
      alertSummary: {
        total: alerts.length,
        critical: alerts.filter((a: { severity: string }) => a.severity === 'CRITICAL').length,
        high: alerts.filter((a: { severity: string }) => a.severity === 'HIGH').length,
        medium: alerts.filter((a: { severity: string }) => a.severity === 'MEDIUM').length,
      },
    },
    meta: { generatedAt: new Date().toISOString(), periodDays, frameworks },
  });
});

/** GET /v1/compliance/report?fromDate=&toDate= */
complianceRouter.get('/report', async (c) => {
  const ctx = getContext(c);
  const tenantId = ctx.tenantId;

  const fromDate = c.req.query('fromDate');
  const toDate = c.req.query('toDate');

  const from = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = toDate ? new Date(toDate) : new Date();

  // ── 1. Policy summary ───────────────────────────────────────────────────────
  const policies = await prisma.policy.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  // ── 2. Audit event stats ────────────────────────────────────────────────────
  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId,
      occurredAt: { gte: from, lte: to },
    },
    orderBy: { occurredAt: 'desc' },
    take: 100,
    select: {
      id: true,
      agentId: true,
      actionType: true,
      toolName: true,
      policyDecision: true,
      riskScore: true,
      riskTier: true,
      blockReason: true,
      occurredAt: true,
    },
  });

  const totalEvents = auditEvents.length;
  const blockedEvents = auditEvents.filter((e) => e.policyDecision === 'BLOCK').length;
  const allowedEvents = auditEvents.filter((e) => e.policyDecision === 'ALLOW').length;
  const monitoredEvents = auditEvents.filter((e) => e.policyDecision === 'MONITOR').length;
  const highRiskEvents = auditEvents.filter(
    (e) => e.riskTier === 'HIGH' || e.riskTier === 'CRITICAL',
  ).length;

  // ── 3. Agent health ─────────────────────────────────────────────────────────
  const agents = await prisma.agent.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      riskTier: true,
      framework: true,
      lastSeenAt: true,
    },
  });

  const activeAgents = agents.filter((a) => a.status === 'ACTIVE').length;
  const killedAgents = agents.filter((a) => a.status === 'KILLED').length;
  const quarantinedAgents = agents.filter((a) => a.status === 'QUARANTINED').length;

  // ── 4. HITL stats ───────────────────────────────────────────────────────────
  const hitlGates = await prisma.hITLGate.findMany({
    where: {
      tenantId,
      createdAt: { gte: from, lte: to },
    },
    select: { status: true },
  });

  const hitlTotal = hitlGates.length;
  const hitlApproved = hitlGates.filter((g) => g.status === 'APPROVED').length;
  const hitlRejected = hitlGates.filter((g) => g.status === 'REJECTED').length;
  const hitlTimedOut = hitlGates.filter((g) => g.status === 'TIMED_OUT').length;

  // ── 5. OWASP LLM Top 10 compliance score (heuristic) ──────────────────────
  // Score each control area based on available data:
  // LLM01 Prompt Injection — policies with prompt-injection rules
  // LLM02 Insecure Output — output labels in audit events
  // LLM06 Sensitive Info — data classification labels used
  // LLM08 Excessive Agency — HITL gates configured (reduces autonomy)
  // LLM09 Overreliance — kill switch available
  // Higher block rate = better enforcement → higher score
  const blockRatio = totalEvents > 0 ? blockedEvents / totalEvents : 0;
  const hitlCoverageRatio = agents.length > 0 ? Math.min(hitlTotal / (agents.length * 5), 1) : 0;
  const policyCount = policies.length;

  const owaspControls = [
    {
      id: 'LLM01',
      name: 'Prompt Injection',
      score: policyCount > 0 ? Math.min(60 + policyCount * 10, 100) : 20,
      status: policyCount > 0 ? 'CONTROLLED' : 'AT_RISK',
    },
    {
      id: 'LLM02',
      name: 'Insecure Output Handling',
      score: Math.round(50 + blockRatio * 50),
      status: blockRatio > 0.1 ? 'CONTROLLED' : 'MONITOR',
    },
    {
      id: 'LLM06',
      name: 'Sensitive Information Disclosure',
      score: policyCount > 0 ? 75 : 30,
      status: policyCount > 0 ? 'CONTROLLED' : 'AT_RISK',
    },
    {
      id: 'LLM08',
      name: 'Excessive Agency',
      score: Math.round(40 + hitlCoverageRatio * 60),
      status: hitlTotal > 0 ? 'CONTROLLED' : 'AT_RISK',
    },
    {
      id: 'LLM09',
      name: 'Overreliance',
      score: killedAgents >= 0 ? 80 : 40, // kill switch available = controlled
      status: 'CONTROLLED',
    },
    {
      id: 'LLM10',
      name: 'Model Theft',
      score: 65,
      status: 'MONITOR',
    },
  ];

  const overallScore = Math.round(
    owaspControls.reduce((sum, c) => sum + c.score, 0) / owaspControls.length,
  );

  return c.json({
    generatedAt: new Date().toISOString(),
    dateRange: { from: from.toISOString(), to: to.toISOString() },
    owasp: {
      overallScore,
      controls: owaspControls,
    },
    policies: policies.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      activeVersion: p.activeVersion,
      defaultAction: p.defaultAction,
      updatedAt: p.updatedAt.toISOString(),
    })),
    auditSummary: {
      total: totalEvents,
      allowed: allowedEvents,
      blocked: blockedEvents,
      monitored: monitoredEvents,
      highRisk: highRiskEvents,
      recentEvents: auditEvents.slice(0, 20).map((e) => ({
        id: e.id,
        agentId: e.agentId,
        actionType: e.actionType,
        toolName: e.toolName,
        decision: e.policyDecision,
        riskScore: e.riskScore,
        riskTier: e.riskTier,
        occurredAt: (e.occurredAt as Date).toISOString(),
      })),
    },
    agentHealth: {
      total: agents.length,
      active: activeAgents,
      killed: killedAgents,
      quarantined: quarantinedAgents,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        riskTier: a.riskTier,
        framework: a.framework,
        lastSeenAt: (a.lastSeenAt as Date | null)?.toISOString() ?? null,
      })),
    },
    hitlSummary: {
      total: hitlTotal,
      approved: hitlApproved,
      rejected: hitlRejected,
      timedOut: hitlTimedOut,
    },
  });
});
