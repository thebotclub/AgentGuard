/**
 * AgentGuard — SIEM Export Routes
 *
 * Manage SIEM integration configurations for Splunk HEC and Azure Sentinel.
 * All endpoints require tenant auth and the 'siem_export' feature flag (Pro+).
 *
 * Splunk HEC:
 *   POST   /api/v1/siem/splunk/configure  — create/update Splunk HEC config
 *   GET    /api/v1/siem/splunk/config     — get config (token masked)
 *   DELETE /api/v1/siem/splunk/config     — remove config
 *   POST   /api/v1/siem/splunk/test       — send a test event
 *
 * Azure Sentinel (Log Analytics):
 *   POST   /api/v1/siem/sentinel/configure — create/update Sentinel config
 *   GET    /api/v1/siem/sentinel/config    — get config (key masked)
 *   DELETE /api/v1/siem/sentinel/config    — remove config
 *   POST   /api/v1/siem/sentinel/test      — send a test event
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { requireFeature } from '../middleware/feature-gate.js';
import { encryptConfig, decryptConfig } from '../lib/integration-crypto.js';
import { logger } from '../lib/logger.js';

// ── Validation helpers ────────────────────────────────────────────────────

function requireString(value: unknown, name: string, maxLen = 2048): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  if (value.length > maxLen) return null;
  return value.trim();
}

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// ── Test event helpers ────────────────────────────────────────────────────

async function sendSplunkTestEvent(
  hecUrl: string,
  hecToken: string,
  index?: string,
  source?: string,
): Promise<void> {
  const payload = JSON.stringify({
    event: {
      tool: 'test_event',
      action: 'allow',
      result: 'allow',
      riskScore: 0,
      reason: 'AgentGuard SIEM integration test',
      tenantId: 'test',
    },
    time: Math.floor(Date.now() / 1000),
    source: source ?? 'agentguard',
    sourcetype: 'agentguard:audit',
    index: index ?? 'main',
  });

  const response = await fetch(hecUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Splunk ${hecToken}`,
      'Content-Type': 'application/json',
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Splunk HEC ${response.status}: ${text}`);
  }
}

async function sendSentinelTestEvent(
  workspaceId: string,
  sharedKey: string,
  logType?: string,
): Promise<void> {
  const rows = JSON.stringify([{
    Tool: 'test_event',
    Action: 'allow',
    Result: 'allow',
    RiskScore: 0,
    Reason: 'AgentGuard SIEM integration test',
    TimeGenerated: new Date().toISOString(),
  }]);

  const contentLength = Buffer.byteLength(rows, 'utf8');
  const date = new Date().toUTCString();
  const stringToSign = `POST\n${contentLength}\napplication/json\nx-ms-date:${date}\n/api/logs`;
  const keyBuffer = Buffer.from(sharedKey, 'base64');
  const signature = crypto.createHmac('sha256', keyBuffer).update(stringToSign).digest('base64');
  const authorization = `SharedKey ${workspaceId}:${signature}`;

  const url = `https://${workspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Log-Type': logType ?? 'AgentGuard_CL',
      'Authorization': authorization,
      'x-ms-date': date,
    },
    body: rows,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Sentinel Log Analytics ${response.status}: ${text}`);
  }
}

// ── Route Factory ─────────────────────────────────────────────────────────

export function createSiemRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // ── SPLUNK: POST /api/v1/siem/splunk/configure ────────────────────────────
  router.post(
    '/api/v1/siem/splunk/configure',
    auth.requireTenantAuth,
    requireFeature('siem_export'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const { hecUrl, hecToken, index, source } = req.body ?? {};

      const validUrl = requireString(hecUrl, 'hecUrl');
      if (!validUrl || !isValidUrl(validUrl)) {
        return res.status(400).json({ error: 'hecUrl must be a valid HTTP/HTTPS URL' });
      }
      const validToken = requireString(hecToken, 'hecToken', 512);
      if (!validToken) {
        return res.status(400).json({ error: 'hecToken is required' });
      }

      const configPlain: Record<string, unknown> = {
        hecUrl: validUrl,
        hecToken: validToken,
      };
      if (index && typeof index === 'string') configPlain['index'] = index;
      if (source && typeof source === 'string') configPlain['source'] = source;

      const configEncrypted = encryptConfig(configPlain);

      try {
        const row = await db.upsertSiemConfig(tenantId, 'splunk', configEncrypted);
        logger.info({ tenantId }, 'siem/splunk: configured');
        return res.status(200).json({
          id: row.id,
          tenantId: row.tenant_id,
          provider: 'splunk',
          hecUrl: validUrl,
          hecToken: '***',
          index: configPlain['index'] ?? 'main',
          source: configPlain['source'] ?? 'agentguard',
          enabled: row.enabled === 1,
          createdAt: row.created_at,
          message: 'Splunk HEC integration configured successfully.',
        });
      } catch (err) {
        logger.error({ tenantId, error: err instanceof Error ? err.message : err }, 'siem/splunk configure error');
        return res.status(500).json({ error: 'Failed to configure Splunk integration' });
      }
    },
  );

  // ── SPLUNK: GET /api/v1/siem/splunk/config ────────────────────────────────
  router.get(
    '/api/v1/siem/splunk/config',
    auth.requireTenantAuth,
    requireFeature('siem_export'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const row = await db.getSiemConfig(tenantId);
        if (!row || row.provider !== 'splunk') {
          return res.status(404).json({ error: 'No Splunk configuration found for this tenant' });
        }
        const cfg = decryptConfig(row.config_encrypted) as Record<string, unknown>;
        return res.json({
          id: row.id,
          tenantId: row.tenant_id,
          provider: 'splunk',
          hecUrl: cfg['hecUrl'],
          hecToken: '***',
          index: cfg['index'] ?? 'main',
          source: cfg['source'] ?? 'agentguard',
          enabled: row.enabled === 1,
          lastForwardedAt: row.last_forwarded_at,
          createdAt: row.created_at,
        });
      } catch (err) {
        logger.error({ tenantId, error: err instanceof Error ? err.message : err }, 'siem/splunk config GET error');
        return res.status(500).json({ error: 'Failed to retrieve Splunk config' });
      }
    },
  );

  // ── SPLUNK: DELETE /api/v1/siem/splunk/config ─────────────────────────────
  router.delete(
    '/api/v1/siem/splunk/config',
    auth.requireTenantAuth,
    requireFeature('siem_export'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const existing = await db.getSiemConfig(tenantId);
        if (!existing || existing.provider !== 'splunk') {
          return res.status(404).json({ error: 'No Splunk configuration found for this tenant' });
        }
        await db.deleteSiemConfig(tenantId);
        logger.info({ tenantId }, 'siem/splunk: deleted config');
        return res.json({ message: 'Splunk integration configuration removed successfully' });
      } catch (err) {
        logger.error({ tenantId, error: err instanceof Error ? err.message : err }, 'siem/splunk config DELETE error');
        return res.status(500).json({ error: 'Failed to delete Splunk config' });
      }
    },
  );

  // ── SPLUNK: POST /api/v1/siem/splunk/test ─────────────────────────────────
  router.post(
    '/api/v1/siem/splunk/test',
    auth.requireTenantAuth,
    requireFeature('siem_export'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const row = await db.getSiemConfig(tenantId);
        if (!row || row.provider !== 'splunk') {
          return res.status(404).json({ error: 'No Splunk configuration found. Configure first.' });
        }
        const cfg = decryptConfig(row.config_encrypted) as { hecUrl: string; hecToken: string; index?: string; source?: string };
        await sendSplunkTestEvent(cfg.hecUrl, cfg.hecToken, cfg.index, cfg.source);
        logger.info({ tenantId }, 'siem/splunk: test event sent');
        return res.json({ success: true, message: 'Test event sent to Splunk HEC successfully.' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ tenantId, error: message }, 'siem/splunk test error');
        return res.status(502).json({ error: `Failed to send test event: ${message}` });
      }
    },
  );

  // ── SENTINEL: POST /api/v1/siem/sentinel/configure ───────────────────────
  router.post(
    '/api/v1/siem/sentinel/configure',
    auth.requireTenantAuth,
    requireFeature('siem_export'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const { workspaceId, sharedKey, logType } = req.body ?? {};

      const validWorkspaceId = requireString(workspaceId, 'workspaceId', 256);
      if (!validWorkspaceId) {
        return res.status(400).json({ error: 'workspaceId is required' });
      }
      const validSharedKey = requireString(sharedKey, 'sharedKey', 1024);
      if (!validSharedKey) {
        return res.status(400).json({ error: 'sharedKey is required' });
      }

      const configPlain: Record<string, unknown> = {
        workspaceId: validWorkspaceId,
        sharedKey: validSharedKey,
      };
      if (logType && typeof logType === 'string') configPlain['logType'] = logType;

      const configEncrypted = encryptConfig(configPlain);

      try {
        const row = await db.upsertSiemConfig(tenantId, 'sentinel', configEncrypted);
        logger.info({ tenantId }, 'siem/sentinel: configured');
        return res.status(200).json({
          id: row.id,
          tenantId: row.tenant_id,
          provider: 'sentinel',
          workspaceId: validWorkspaceId,
          sharedKey: '***',
          logType: configPlain['logType'] ?? 'AgentGuard_CL',
          enabled: row.enabled === 1,
          createdAt: row.created_at,
          message: 'Azure Sentinel integration configured successfully.',
        });
      } catch (err) {
        logger.error({ tenantId, error: err instanceof Error ? err.message : err }, 'siem/sentinel configure error');
        return res.status(500).json({ error: 'Failed to configure Sentinel integration' });
      }
    },
  );

  // ── SENTINEL: GET /api/v1/siem/sentinel/config ────────────────────────────
  router.get(
    '/api/v1/siem/sentinel/config',
    auth.requireTenantAuth,
    requireFeature('siem_export'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const row = await db.getSiemConfig(tenantId);
        if (!row || row.provider !== 'sentinel') {
          return res.status(404).json({ error: 'No Sentinel configuration found for this tenant' });
        }
        const cfg = decryptConfig(row.config_encrypted) as Record<string, unknown>;
        return res.json({
          id: row.id,
          tenantId: row.tenant_id,
          provider: 'sentinel',
          workspaceId: cfg['workspaceId'],
          sharedKey: '***',
          logType: cfg['logType'] ?? 'AgentGuard_CL',
          enabled: row.enabled === 1,
          lastForwardedAt: row.last_forwarded_at,
          createdAt: row.created_at,
        });
      } catch (err) {
        logger.error({ tenantId, error: err instanceof Error ? err.message : err }, 'siem/sentinel config GET error');
        return res.status(500).json({ error: 'Failed to retrieve Sentinel config' });
      }
    },
  );

  // ── SENTINEL: DELETE /api/v1/siem/sentinel/config ─────────────────────────
  router.delete(
    '/api/v1/siem/sentinel/config',
    auth.requireTenantAuth,
    requireFeature('siem_export'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const existing = await db.getSiemConfig(tenantId);
        if (!existing || existing.provider !== 'sentinel') {
          return res.status(404).json({ error: 'No Sentinel configuration found for this tenant' });
        }
        await db.deleteSiemConfig(tenantId);
        logger.info({ tenantId }, 'siem/sentinel: deleted config');
        return res.json({ message: 'Azure Sentinel integration configuration removed successfully' });
      } catch (err) {
        logger.error({ tenantId, error: err instanceof Error ? err.message : err }, 'siem/sentinel config DELETE error');
        return res.status(500).json({ error: 'Failed to delete Sentinel config' });
      }
    },
  );

  // ── SENTINEL: POST /api/v1/siem/sentinel/test ─────────────────────────────
  router.post(
    '/api/v1/siem/sentinel/test',
    auth.requireTenantAuth,
    requireFeature('siem_export'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const row = await db.getSiemConfig(tenantId);
        if (!row || row.provider !== 'sentinel') {
          return res.status(404).json({ error: 'No Sentinel configuration found. Configure first.' });
        }
        const cfg = decryptConfig(row.config_encrypted) as { workspaceId: string; sharedKey: string; logType?: string };
        await sendSentinelTestEvent(cfg.workspaceId, cfg.sharedKey, cfg.logType);
        logger.info({ tenantId }, 'siem/sentinel: test event sent');
        return res.json({ success: true, message: 'Test event sent to Azure Sentinel successfully.' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ tenantId, error: message }, 'siem/sentinel test error');
        return res.status(502).json({ error: `Failed to send test event: ${message}` });
      }
    },
  );

  return router;
}
