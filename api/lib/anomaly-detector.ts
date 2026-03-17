/**
 * AgentGuard — Rule-Based Anomaly Detection Engine
 *
 * Evaluates threshold-based rules against recent audit event data.
 * Fires alerts when conditions breach thresholds; auto-resolves when cleared.
 * Runs every 5 minutes (configurable) via setInterval with .unref() so it
 * does NOT prevent the process from exiting cleanly.
 *
 * Design: NO ML — simple, reliable, immediate value.
 */

import crypto from 'crypto';
import type { IDatabase, AlertRow } from '../db-interface.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type AnomalyMetric =
  | 'block_rate'
  | 'evaluate_volume'
  | 'unique_tools'
  | 'error_rate'
  | 'latency_p99';

export type AnomalyCondition = 'gt' | 'lt' | 'spike' | 'drop';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AnomalyRule {
  id: string;
  name: string;
  metric: AnomalyMetric;
  condition: AnomalyCondition;
  threshold: number;
  windowMinutes: number;
  severity: AlertSeverity;
}

export interface Alert {
  id: string;
  ruleId: string;
  tenantId: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: string;
  message: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface WebhookPayload {
  event: 'alert.fired' | 'alert.resolved';
  alert: Alert;
  timestamp: string;
}

// ── Built-in Rules ─────────────────────────────────────────────────────────

export const BUILTIN_RULES: AnomalyRule[] = [
  {
    id: 'builtin-block-rate-warning',
    name: 'High block rate (warning)',
    metric: 'block_rate',
    condition: 'gt',
    threshold: 0.5,
    windowMinutes: 60,
    severity: 'warning',
  },
  {
    id: 'builtin-block-rate-critical',
    name: 'Very high block rate (critical)',
    metric: 'block_rate',
    condition: 'gt',
    threshold: 0.8,
    windowMinutes: 30,
    severity: 'critical',
  },
  {
    id: 'builtin-volume-spike',
    name: 'Evaluate volume spike',
    metric: 'evaluate_volume',
    condition: 'spike',
    threshold: 3.0,  // 3x normal
    windowMinutes: 15,
    severity: 'warning',
  },
  {
    id: 'builtin-volume-drop',
    name: 'Evaluate volume dropped to zero',
    metric: 'evaluate_volume',
    condition: 'drop',
    threshold: 0,
    windowMinutes: 30,
    severity: 'warning',
  },
  {
    id: 'builtin-error-rate-critical',
    name: 'High error rate',
    metric: 'error_rate',
    condition: 'gt',
    threshold: 0.1,
    windowMinutes: 15,
    severity: 'critical',
  },
  {
    id: 'builtin-tool-block-flood',
    name: 'Same tool blocked repeatedly',
    metric: 'unique_tools',
    condition: 'gt',
    threshold: 20,
    windowMinutes: 10,
    severity: 'info',
  },
];

// ── Metric computation ─────────────────────────────────────────────────────

interface MetricResult {
  value: number;
  /** For spike/drop checks we also need the baseline */
  baseline?: number;
}

/**
 * Compute a metric for a tenant over a time window.
 * Uses raw SQL queries on audit_events for simplicity and performance.
 */
async function computeMetric(
  db: IDatabase,
  tenantId: string,
  metric: AnomalyMetric,
  windowMinutes: number,
): Promise<MetricResult> {
  const windowSec = windowMinutes * 60;

  switch (metric) {
    case 'block_rate': {
      // Fraction of events that were blocked in the window
      const rows = await db.all<{ result: string; cnt: number }>(
        `SELECT result, COUNT(*) as cnt FROM audit_events
         WHERE tenant_id = ?
           AND created_at >= datetime('now', ?)
         GROUP BY result`,
        [tenantId, `-${windowSec} seconds`],
      );
      const total = rows.reduce((s, r) => s + r.cnt, 0);
      const blocked = rows.find((r) => r.result === 'block')?.cnt ?? 0;
      return { value: total > 0 ? blocked / total : 0 };
    }

    case 'evaluate_volume': {
      // Current window count vs. baseline (previous equal-length window)
      const current = await db.get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM audit_events
         WHERE tenant_id = ?
           AND created_at >= datetime('now', ?)`,
        [tenantId, `-${windowSec} seconds`],
      );
      const baseline = await db.get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM audit_events
         WHERE tenant_id = ?
           AND created_at >= datetime('now', ?)
           AND created_at < datetime('now', ?)`,
        [tenantId, `-${windowSec * 2} seconds`, `-${windowSec} seconds`],
      );
      return {
        value: current?.cnt ?? 0,
        baseline: baseline?.cnt ?? 0,
      };
    }

    case 'unique_tools': {
      // Count events for the single most-blocked tool in the window
      // (rule #6: same tool blocked > 20 times)
      const rows = await db.all<{ tool: string; cnt: number }>(
        `SELECT tool, COUNT(*) as cnt FROM audit_events
         WHERE tenant_id = ?
           AND result = 'block'
           AND created_at >= datetime('now', ?)
         GROUP BY tool
         ORDER BY cnt DESC
         LIMIT 1`,
        [tenantId, `-${windowSec} seconds`],
      );
      return { value: rows[0]?.cnt ?? 0 };
    }

    case 'error_rate': {
      // Treat 'error' result as error; also anything that isn't 'allow'/'block'/'monitor'
      const rows = await db.all<{ result: string; cnt: number }>(
        `SELECT result, COUNT(*) as cnt FROM audit_events
         WHERE tenant_id = ?
           AND created_at >= datetime('now', ?)
         GROUP BY result`,
        [tenantId, `-${windowSec} seconds`],
      );
      const total = rows.reduce((s, r) => s + r.cnt, 0);
      const errors = rows
        .filter((r) => !['allow', 'block', 'monitor', 'require_approval'].includes(r.result))
        .reduce((s, r) => s + r.cnt, 0);
      return { value: total > 0 ? errors / total : 0 };
    }

    case 'latency_p99': {
      // P99 approximation: take the top 1% of duration_ms values
      const allDurations = await db.all<{ duration_ms: number }>(
        `SELECT duration_ms FROM audit_events
         WHERE tenant_id = ?
           AND duration_ms IS NOT NULL
           AND created_at >= datetime('now', ?)
         ORDER BY duration_ms DESC`,
        [tenantId, `-${windowSec} seconds`],
      );
      if (allDurations.length === 0) return { value: 0 };
      const p99idx = Math.max(0, Math.floor(allDurations.length * 0.01));
      return { value: allDurations[p99idx]?.duration_ms ?? 0 };
    }

    default:
      return { value: 0 };
  }
}

/**
 * Check whether a rule's condition is triggered.
 */
function isTriggered(rule: AnomalyRule, result: MetricResult): boolean {
  const { value, baseline } = result;

  switch (rule.condition) {
    case 'gt':
      return value > rule.threshold;

    case 'lt':
      return value < rule.threshold;

    case 'spike': {
      // Spike: current window is more than `threshold` × baseline
      if (!baseline || baseline === 0) return false;
      return value >= baseline * rule.threshold;
    }

    case 'drop': {
      // Drop: volume fell to at or below threshold, but baseline was non-zero
      if ((baseline ?? 0) === 0) return false;  // wasn't active before
      return value <= rule.threshold;
    }

    default:
      return false;
  }
}

/**
 * Build a human-readable alert message for a triggered rule.
 */
function buildMessage(rule: AnomalyRule, result: MetricResult): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmt = (v: number) => v.toFixed(2);

  switch (rule.metric) {
    case 'block_rate':
      return `Block rate is ${pct(result.value)} (threshold: ${pct(rule.threshold)}) over the last ${rule.windowMinutes} minutes`;
    case 'evaluate_volume':
      if (rule.condition === 'spike') {
        const ratio = result.baseline && result.baseline > 0
          ? (result.value / result.baseline).toFixed(1)
          : '∞';
        return `Evaluate volume spiked ${ratio}× (${result.value} vs baseline ${result.baseline ?? 0}) in ${rule.windowMinutes} min`;
      }
      return `Evaluate volume dropped to ${result.value} (was ${result.baseline ?? 'unknown'}) in the last ${rule.windowMinutes} minutes`;
    case 'unique_tools':
      return `A single tool was blocked ${result.value} times in the last ${rule.windowMinutes} min (threshold: ${rule.threshold}) — possible misconfiguration`;
    case 'error_rate':
      return `Error rate is ${pct(result.value)} (threshold: ${pct(rule.threshold)}) over the last ${rule.windowMinutes} minutes`;
    case 'latency_p99':
      return `P99 latency is ${fmt(result.value)}ms (threshold: ${fmt(rule.threshold)}ms) over the last ${rule.windowMinutes} minutes`;
    default:
      return `${rule.name}: value ${fmt(result.value)} breached threshold ${fmt(rule.threshold)}`;
  }
}

// ── Webhook notification ───────────────────────────────────────────────────

async function sendWebhookNotifications(
  db: IDatabase,
  tenantId: string,
  alert: Alert,
  event: 'alert.fired' | 'alert.resolved',
): Promise<void> {
  let webhooks: Array<{ url: string }> = [];
  try {
    webhooks = await db.getActiveWebhooksForTenant(tenantId);
  } catch {
    return;
  }

  if (webhooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    alert,
    timestamp: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);

  await Promise.allSettled(
    webhooks.map(async (wh) => {
      try {
        await fetch(wh.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'AgentGuard/1.0' },
          body,
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // Swallow — webhook delivery is best-effort
      }
    }),
  );
}

// ── Tenant enumeration ─────────────────────────────────────────────────────

async function getActiveTenants(db: IDatabase): Promise<string[]> {
  try {
    const rows = await db.all<{ tenant_id: string }>(
      `SELECT DISTINCT tenant_id FROM audit_events
       WHERE tenant_id IS NOT NULL
         AND created_at >= datetime('now', '-2 hours')`,
      [],
    );
    return rows.map((r) => r.tenant_id);
  } catch {
    return [];
  }
}

// ── Per-tenant rule checking ───────────────────────────────────────────────

async function checkTenantRules(
  db: IDatabase,
  tenantId: string,
  rules: AnomalyRule[],
): Promise<void> {
  for (const rule of rules) {
    try {
      const result = await computeMetric(db, tenantId, rule.metric, rule.windowMinutes);
      const triggered = isTriggered(rule, result);

      // Look for an existing active alert for this rule + tenant
      const existingAlert = await db.getActiveAlert(tenantId, rule.id);

      if (triggered && !existingAlert) {
        // Fire a new alert
        const alertId = crypto.randomUUID();
        const newAlert: AlertRow = {
          id: alertId,
          tenant_id: tenantId,
          rule_id: rule.id,
          metric: rule.metric,
          current_value: result.value,
          threshold: rule.threshold,
          severity: rule.severity,
          message: buildMessage(rule, result),
          resolved_at: null,
          created_at: new Date().toISOString(),
        };
        const inserted = await db.insertAlert(newAlert);
        await sendWebhookNotifications(db, tenantId, rowToAlert(inserted), 'alert.fired');

      } else if (!triggered && existingAlert) {
        // Auto-resolve
        await db.resolveAlert(existingAlert.id);
        const resolved: AlertRow = { ...existingAlert, resolved_at: new Date().toISOString() };
        await sendWebhookNotifications(db, tenantId, rowToAlert(resolved), 'alert.resolved');
      }
      // else: triggered + already alerted, or clear + no alert → no-op
    } catch {
      // Swallow per-rule errors; don't let one bad rule crash the loop
    }
  }
}

// ── Row ↔ Alert conversion ─────────────────────────────────────────────────

function rowToAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    ruleId: row.rule_id,
    tenantId: row.tenant_id,
    metric: row.metric,
    currentValue: row.current_value,
    threshold: row.threshold,
    severity: row.severity,
    message: row.message,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

// ── Detection Loop ─────────────────────────────────────────────────────────

export interface AnomalyDetectorOptions {
  /** Interval between detection runs (default: 5 minutes) */
  intervalMs?: number;
}

export interface AnomalyDetector {
  start(): void;
  stop(): void;
}

/**
 * Create and return an anomaly detector that polls at the given interval.
 * Call `.start()` to begin and `.stop()` to cancel.
 */
export function createAnomalyDetector(
  db: IDatabase,
  opts: AnomalyDetectorOptions = {},
): AnomalyDetector {
  const intervalMs = opts.intervalMs ?? 5 * 60 * 1000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function runDetectionCycle(): Promise<void> {
    if (running) return; // prevent concurrent runs
    running = true;
    try {
      // Get tenants active in the last 2 hours
      const tenantIds = await getActiveTenants(db);

      for (const tenantId of tenantIds) {
        // Combine built-in rules with custom tenant rules
        const customRuleRows = await db.getAnomalyRules(tenantId);
        const customRules: AnomalyRule[] = customRuleRows
          .filter((r) => r.enabled !== 0)
          .map((r) => ({
            id: r.id,
            name: r.name,
            metric: r.metric as AnomalyMetric,
            condition: r.condition as AnomalyCondition,
            threshold: r.threshold,
            windowMinutes: r.window_minutes,
            severity: r.severity as AlertSeverity,
          }));

        const allRules = [...BUILTIN_RULES, ...customRules];
        await checkTenantRules(db, tenantId, allRules);
      }
    } catch {
      // Top-level swallow — detection loop must never crash the server
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer !== null) return;
      // Run once immediately, then on interval
      void runDetectionCycle();
      timer = setInterval(() => void runDetectionCycle(), intervalMs);
      timer.unref(); // Do NOT prevent process exit
    },

    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

// ── Exported helpers (used by routes + tests) ──────────────────────────────

export { rowToAlert, computeMetric, isTriggered, buildMessage, checkTenantRules };
