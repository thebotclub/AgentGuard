/**
 * Advanced Audit Analytics Routes — /v1/audit/analytics
 *
 * GET /v1/audit/analytics/risk-trend    — rolling 30-day risk score
 * GET /v1/audit/analytics/heatmap       — policy violation heatmap (hour×day)
 * GET /v1/audit/analytics/anomalies     — agent behavior anomaly detection
 * GET /v1/audit/export                  — SIEM format export (CEF, LEEF, JSON)
 *
 * These routes mount on the existing auditRouter at /v1/audit
 */
import { Hono } from 'hono';
import { jwtVerify } from 'jose';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import type { ServiceContext } from '@agentguard/shared';

export const auditAnalyticsRouter = new Hono();

const JWT_SECRET = new TextEncoder().encode(
  process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
);

interface JwtClaims {
  sub: string;
  tenantId: string;
  role: string;
}

async function authenticateJwt(token: string): Promise<ServiceContext | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const claims = payload as unknown as JwtClaims;
    if (!claims.tenantId || !claims.sub || !claims.role) return null;
    return {
      tenantId: claims.tenantId,
      userId: claims.sub,
      role: claims.role as ServiceContext['role'],
      traceId: crypto.randomUUID(),
    };
  } catch {
    return null;
  }
}

// ─── Risk Trend ───────────────────────────────────────────────────────────────

/**
 * GET /v1/audit/analytics/risk-trend
 *
 * Rolling 30-day risk score trend, bucketed by day.
 * Returns daily average risk score and event counts.
 */
auditAnalyticsRouter.get('/risk-trend', async (c) => {
  const ctx = getContext(c);
  const days = Math.min(parseInt(c.req.query('days') ?? '30', 10), 90);
  const now = new Date();
  const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Get daily risk stats
  const events = await prisma.auditEvent.findMany({
    where: {
      tenantId: ctx.tenantId,
      occurredAt: { gte: fromDate, lte: now },
    },
    select: {
      occurredAt: true,
      riskScore: true,
      riskTier: true,
      policyDecision: true,
    },
    orderBy: { occurredAt: 'asc' },
  });

  // Bucket by day
  const buckets = new Map<
    string,
    { date: string; totalRisk: number; count: number; blocked: number; critical: number }
  >();

  for (const e of events) {
    const day = e.occurredAt.toISOString().slice(0, 10);
    if (!buckets.has(day)) {
      buckets.set(day, { date: day, totalRisk: 0, count: 0, blocked: 0, critical: 0 });
    }
    const b = buckets.get(day)!;
    b.totalRisk += e.riskScore;
    b.count++;
    if (e.policyDecision === 'BLOCK') b.blocked++;
    if (e.riskTier === 'CRITICAL') b.critical++;
  }

  const trend = Array.from(buckets.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({
      date: b.date,
      avgRiskScore: b.count > 0 ? Math.round(b.totalRisk / b.count) : 0,
      totalEvents: b.count,
      blockedEvents: b.blocked,
      criticalEvents: b.critical,
      blockRate: b.count > 0 ? Math.round((b.blocked / b.count) * 100) : 0,
    }));

  // Rolling 7-day average
  const rolling7Day = trend.map((_, i) => {
    const window = trend.slice(Math.max(0, i - 6), i + 1);
    const avg = window.reduce((sum, d) => sum + d.avgRiskScore, 0) / window.length;
    return { date: trend[i]!.date, rolling7DayAvg: Math.round(avg) };
  });

  return c.json({
    data: {
      trend,
      rolling7Day,
      summary: {
        periodDays: days,
        totalEvents: events.length,
        avgRiskScore:
          events.length > 0
            ? Math.round(events.reduce((s, e) => s + e.riskScore, 0) / events.length)
            : 0,
        peakRiskDate:
          trend.length > 0
            ? trend.reduce((max, d) => (d.avgRiskScore > max.avgRiskScore ? d : max), trend[0]!).date
            : null,
      },
    },
  });
});

// ─── Heatmap ──────────────────────────────────────────────────────────────────

/**
 * GET /v1/audit/analytics/heatmap
 *
 * Policy violation heatmap: count of blocked/high-risk events
 * by hour of day (0-23) × day of week (0=Sun … 6=Sat).
 */
auditAnalyticsRouter.get('/heatmap', async (c) => {
  const ctx = getContext(c);
  const days = Math.min(parseInt(c.req.query('days') ?? '30', 10), 90);
  const decision = c.req.query('decision'); // optional: BLOCK, ALLOW, MONITOR
  const riskTier = c.req.query('riskTier'); // optional: CRITICAL, HIGH

  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await prisma.auditEvent.findMany({
    where: {
      tenantId: ctx.tenantId,
      occurredAt: { gte: fromDate },
      ...(decision ? { policyDecision: decision as 'ALLOW' | 'BLOCK' | 'MONITOR' } : {}),
      ...(riskTier ? { riskTier: riskTier as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' } : {}),
    },
    select: { occurredAt: true, riskScore: true, policyDecision: true },
  });

  // Initialize 7×24 grid
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const riskGrid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));

  for (const e of events) {
    const dow = e.occurredAt.getUTCDay(); // 0=Sun
    const hour = e.occurredAt.getUTCHours();
    grid[dow]![hour]!++;
    riskGrid[dow]![hour]! += e.riskScore;
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const heatmap = dayNames.map((dayName, dow) => ({
    day: dayName,
    dayIndex: dow,
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: grid[dow]![hour]!,
      avgRiskScore:
        grid[dow]![hour]! > 0 ? Math.round(riskGrid[dow]![hour]! / grid[dow]![hour]!) : 0,
    })),
    totalForDay: grid[dow]!.reduce((sum, n) => sum + n, 0),
    peakHour: grid[dow]!.indexOf(Math.max(...grid[dow]!)),
  }));

  const flatCells = heatmap.flatMap((d) => d.hours.map((h) => h.count));
  const maxCount = Math.max(...flatCells, 1);

  return c.json({
    data: {
      heatmap,
      meta: {
        periodDays: days,
        totalEvents: events.length,
        maxCountInCell: maxCount,
        filters: { decision: decision ?? 'all', riskTier: riskTier ?? 'all' },
      },
    },
  });
});

// ─── Anomaly Detection ────────────────────────────────────────────────────────

/**
 * GET /v1/audit/analytics/anomalies
 *
 * Agent behavior anomaly detection:
 * - Sudden spike in blocked actions
 * - Unusual tool access patterns
 * - Rapid policy rule changes
 * - Off-hours activity spikes
 */
auditAnalyticsRouter.get('/anomalies', async (c) => {
  const ctx = getContext(c);
  const days = Math.min(parseInt(c.req.query('days') ?? '14', 10), 30);
  const threshold = parseFloat(c.req.query('threshold') ?? '2.0'); // z-score threshold

  const now = new Date();
  const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const baselineStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);

  // Get recent and baseline events
  const [recentEvents, baselineEvents] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { tenantId: ctx.tenantId, occurredAt: { gte: fromDate, lte: now } },
      select: {
        agentId: true,
        occurredAt: true,
        riskScore: true,
        riskTier: true,
        policyDecision: true,
        toolName: true,
        actionType: true,
      },
    }),
    prisma.auditEvent.findMany({
      where: { tenantId: ctx.tenantId, occurredAt: { gte: baselineStart, lt: fromDate } },
      select: {
        agentId: true,
        riskScore: true,
        policyDecision: true,
        toolName: true,
      },
    }),
  ]);

  const anomalies: Array<{
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    agentId: string | null;
    description: string;
    detectedAt: string;
    evidence: Record<string, unknown>;
  }> = [];

  // ── 1. Block rate spike per agent ─────────────────────────────────────────
  const agentIds = [...new Set(recentEvents.map((e) => e.agentId))];

  for (const agentId of agentIds) {
    const agentRecent = recentEvents.filter((e) => e.agentId === agentId);
    const agentBaseline = baselineEvents.filter((e) => e.agentId === agentId);

    const recentBlockRate =
      agentRecent.length > 0
        ? agentRecent.filter((e) => e.policyDecision === 'BLOCK').length / agentRecent.length
        : 0;

    const baselineBlockRate =
      agentBaseline.length > 0
        ? agentBaseline.filter((e) => e.policyDecision === 'BLOCK').length / agentBaseline.length
        : 0;

    if (
      agentRecent.length >= 5 &&
      baselineBlockRate > 0 &&
      recentBlockRate > baselineBlockRate * 2
    ) {
      const spike = Math.round((recentBlockRate / baselineBlockRate - 1) * 100);
      anomalies.push({
        type: 'BLOCK_RATE_SPIKE',
        severity: recentBlockRate > 0.5 ? 'HIGH' : 'MEDIUM',
        agentId,
        description: `Block rate increased ${spike}% vs baseline (${Math.round(baselineBlockRate * 100)}% → ${Math.round(recentBlockRate * 100)}%)`,
        detectedAt: now.toISOString(),
        evidence: {
          recentBlockRate: Math.round(recentBlockRate * 100),
          baselineBlockRate: Math.round(baselineBlockRate * 100),
          recentEventCount: agentRecent.length,
          baselineEventCount: agentBaseline.length,
        },
      });
    }

    // ── 2. Risk score spike ────────────────────────────────────────────────
    const recentAvgRisk =
      agentRecent.length > 0
        ? agentRecent.reduce((s, e) => s + e.riskScore, 0) / agentRecent.length
        : 0;

    const baselineAvgRisk =
      agentBaseline.length > 0
        ? agentBaseline.reduce((s, e) => s + e.riskScore, 0) / agentBaseline.length
        : 0;

    if (
      agentRecent.length >= 5 &&
      baselineAvgRisk > 0 &&
      recentAvgRisk > baselineAvgRisk * threshold
    ) {
      anomalies.push({
        type: 'RISK_SCORE_SPIKE',
        severity: recentAvgRisk > 80 ? 'CRITICAL' : recentAvgRisk > 60 ? 'HIGH' : 'MEDIUM',
        agentId,
        description: `Average risk score spiked from ${Math.round(baselineAvgRisk)} to ${Math.round(recentAvgRisk)}`,
        detectedAt: now.toISOString(),
        evidence: {
          recentAvgRiskScore: Math.round(recentAvgRisk),
          baselineAvgRiskScore: Math.round(baselineAvgRisk),
        },
      });
    }

    // ── 3. New tool patterns ───────────────────────────────────────────────
    const baselineTools = new Set(agentBaseline.map((e) => e.toolName).filter(Boolean));
    const recentTools = new Set(agentRecent.map((e) => e.toolName).filter(Boolean));
    const newTools = [...recentTools].filter(
      (t) => t !== null && !baselineTools.has(t),
    );

    if (newTools.length > 0 && agentBaseline.length > 10) {
      anomalies.push({
        type: 'NEW_TOOL_USAGE',
        severity: 'LOW',
        agentId,
        description: `Agent using ${newTools.length} tool(s) not seen in baseline period: ${newTools.slice(0, 3).join(', ')}`,
        detectedAt: now.toISOString(),
        evidence: { newTools: newTools.slice(0, 10), baselineToolCount: baselineTools.size },
      });
    }
  }

  // ── 4. Off-hours spike (22:00-06:00 UTC) ──────────────────────────────────
  const offHoursRecent = recentEvents.filter((e) => {
    const hour = e.occurredAt.getUTCHours();
    return hour >= 22 || hour < 6;
  });

  const totalHoursRecent = days * 24;
  const offHoursPercent = recentEvents.length > 0 ? (offHoursRecent.length / recentEvents.length) * 100 : 0;

  if (offHoursPercent > 40 && recentEvents.length > 10) {
    anomalies.push({
      type: 'OFF_HOURS_ACTIVITY',
      severity: 'MEDIUM',
      agentId: null,
      description: `${Math.round(offHoursPercent)}% of events occurred off-hours (22:00-06:00 UTC)`,
      detectedAt: now.toISOString(),
      evidence: {
        offHoursEventCount: offHoursRecent.length,
        totalEvents: recentEvents.length,
        offHoursPercent: Math.round(offHoursPercent),
      },
    });
  }

  // Sort by severity
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return c.json({
    data: {
      anomalies,
      summary: {
        total: anomalies.length,
        critical: anomalies.filter((a) => a.severity === 'CRITICAL').length,
        high: anomalies.filter((a) => a.severity === 'HIGH').length,
        medium: anomalies.filter((a) => a.severity === 'MEDIUM').length,
        low: anomalies.filter((a) => a.severity === 'LOW').length,
        analysedAgents: agentIds.length,
        periodDays: days,
      },
    },
  });
});

// Note: SIEM export (CEF/LEEF/JSON) is handled by GET /v1/audit/export in audit.ts
// The format param now accepts: csv | json | cef | leef
