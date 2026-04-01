/**
 * AgentGuard — Alerts & Anomaly Rules Routes
 *
 * GET    /api/v1/alerts              — list alerts (tenant auth)
 * POST   /api/v1/alerts/:id/acknowledge — acknowledge alert (tenant auth)
 * GET    /api/v1/alerts/rules        — list anomaly rules (tenant auth)
 * POST   /api/v1/alerts/rules        — create custom rule (tenant auth)
 * PUT    /api/v1/alerts/rules/:id    — update rule (tenant auth)
 * DELETE /api/v1/alerts/rules/:id    — delete rule (tenant auth)
 */

import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { z } from 'zod';
import type { IDatabase, AnomalyRuleRow } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { rowToAlert } from '../lib/anomaly-detector.js';

// ── Zod Schemas ────────────────────────────────────────────────────────────

const AnomalyRuleCreateSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  metric: z.enum(['block_rate', 'evaluate_volume', 'unique_tools', 'error_rate', 'latency_p99'], {
    error: 'metric must be one of: block_rate, evaluate_volume, unique_tools, error_rate, latency_p99',
  }),
  condition: z.enum(['gt', 'lt', 'spike', 'drop'], {
    error: 'condition must be one of: gt, lt, spike, drop',
  }),
  threshold: z.number({ error: 'threshold must be a number' }),
  windowMinutes: z.number({ error: 'windowMinutes must be a number' }).int().min(1).max(1440),
  severity: z.enum(['info', 'warning', 'critical']).optional().default('warning'),
  enabled: z.boolean().optional().default(true),
});

const AnomalyRuleUpdateSchema = AnomalyRuleCreateSchema.partial();

const AlertsQuerySchema = z.object({
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  resolved: z
    .string()
    .optional()
    .transform((v) => {
      if (v === 'true') return true;
      if (v === 'false') return false;
      return undefined;
    }),
});

// ── Route Factory ──────────────────────────────────────────────────────────

export function createAlertsRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // ── GET /api/v1/alerts ────────────────────────────────────────────────────
  router.get('/api/v1/alerts', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const parsed = AlertsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    }
    const { severity, resolved } = parsed.data;

    try {
      const rows = await db.getAlerts(tenantId, { severity, resolved });
      res.json({ alerts: rows.map(rowToAlert) });
    } catch (e) {
      logger.error({ err: e instanceof Error ? e : String(e) }, '[alerts] getAlerts error');
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });

  // ── POST /api/v1/alerts/:id/acknowledge ───────────────────────────────────
  router.post(
    '/api/v1/alerts/:id/acknowledge',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const alertId = req.params['id'] as string;

      try {
        // Fetch all alerts to find the specific one by ID (no direct get-by-id API yet)
        const allAlerts = await db.getAlerts(tenantId, {});
        const target = allAlerts.find((a) => a.id === alertId);

        if (!target) {
          return res.status(404).json({ error: 'Alert not found' });
        }
        if (target.resolved_at !== null) {
          return res.status(400).json({ error: 'Alert is already resolved/acknowledged' });
        }

        await db.resolveAlert(alertId);
        res.json({ id: alertId, acknowledged: true });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[alerts] acknowledge error');
        res.status(500).json({ error: 'Failed to acknowledge alert' });
      }
    },
  );

  // ── GET /api/v1/alerts/rules ──────────────────────────────────────────────
  router.get(
    '/api/v1/alerts/rules',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const rows = await db.getAnomalyRules(tenantId);
        res.json({ rules: rows.map(rowToPublicRule) });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[alerts/rules] list error');
        res.status(500).json({ error: 'Failed to fetch rules' });
      }
    },
  );

  // ── POST /api/v1/alerts/rules ─────────────────────────────────────────────
  router.post(
    '/api/v1/alerts/rules',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const parsed = AnomalyRuleCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' });
      }
      const data = parsed.data;

      const rule: AnomalyRuleRow = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: data.name,
        metric: data.metric,
        condition: data.condition,
        threshold: data.threshold,
        window_minutes: data.windowMinutes,
        severity: data.severity,
        enabled: data.enabled ? 1 : 0,
        created_at: new Date().toISOString(),
      };

      try {
        const inserted = await db.insertAnomalyRule(rule);
        res.status(201).json(rowToPublicRule(inserted));
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[alerts/rules] insert error');
        res.status(500).json({ error: 'Failed to create rule' });
      }
    },
  );

  // ── PUT /api/v1/alerts/rules/:id ──────────────────────────────────────────
  router.put(
    '/api/v1/alerts/rules/:id',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const ruleId = req.params['id'] as string;

      const parsed = AnomalyRuleUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' });
      }
      const data = parsed.data;

      // Map camelCase fields to snake_case for the DB update
      const updates: Partial<AnomalyRuleRow> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.metric !== undefined) updates.metric = data.metric;
      if (data.condition !== undefined) updates.condition = data.condition;
      if (data.threshold !== undefined) updates.threshold = data.threshold;
      if (data.windowMinutes !== undefined) updates.window_minutes = data.windowMinutes;
      if (data.severity !== undefined) updates.severity = data.severity;
      if (data.enabled !== undefined) updates.enabled = data.enabled ? 1 : 0;

      try {
        const updated = await db.updateAnomalyRule(ruleId, tenantId, updates);
        if (!updated) {
          return res.status(404).json({ error: 'Rule not found' });
        }
        res.json(rowToPublicRule(updated));
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[alerts/rules] update error');
        res.status(500).json({ error: 'Failed to update rule' });
      }
    },
  );

  // ── DELETE /api/v1/alerts/rules/:id ───────────────────────────────────────
  router.delete(
    '/api/v1/alerts/rules/:id',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const ruleId = req.params['id'] as string;

      try {
        const existing = await db.getAnomalyRules(tenantId);
        const rule = existing.find((r) => r.id === ruleId);
        if (!rule) {
          return res.status(404).json({ error: 'Rule not found' });
        }
        await db.deleteAnomalyRule(ruleId, tenantId);
        res.json({ id: ruleId, deleted: true });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[alerts/rules] delete error');
        res.status(500).json({ error: 'Failed to delete rule' });
      }
    },
  );

  return router;
}

// ── Serialization ──────────────────────────────────────────────────────────

function rowToPublicRule(row: AnomalyRuleRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    metric: row.metric,
    condition: row.condition,
    threshold: row.threshold,
    windowMinutes: row.window_minutes,
    severity: row.severity,
    enabled: row.enabled !== 0,
    createdAt: row.created_at,
  };
}
