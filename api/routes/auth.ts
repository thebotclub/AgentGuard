/**
 * AgentGuard — Auth & Account Routes
 *
 * POST /api/v1/signup             — create tenant account and get API key
 * GET  /api/v1/killswitch         — get kill switch status (global + tenant)
 * POST /api/v1/killswitch         — toggle tenant kill switch
 * POST /api/v1/admin/killswitch   — toggle global kill switch (admin)
 * GET  /api/v1/usage              — usage statistics
 * GET  /api/v1/templates          — list policy templates
 * GET  /api/v1/templates/:name    — get a template by id
 * POST /api/v1/templates/:name/apply — apply a policy template
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../lib/logger.js';
import { SignupRequest, KillswitchRequestSchema } from '../schemas.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { signupRateLimit, recoveryRateLimit } from '../middleware/rate-limit.js';
import {
  templateCache,
} from '../lib/policy-engine-setup.js';
import {
  getGlobalKillSwitch,
  setGlobalKillSwitch,
  getLastHash,
  storeAuditEvent,
} from './audit.js';
import { setGlobalKillSwitchCache, setTenantKillSwitchCache } from '../lib/kill-switch-cache.js';
import { publishEvent } from '../lib/redis-pubsub.js';

function generateApiKey(): string {
  return 'ag_live_' + crypto.randomBytes(16).toString('hex');
}

function uuid(): string {
  return crypto.randomUUID();
}

export function createAuthRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── POST /api/v1/signup ───────────────────────────────────────────────────
  router.post('/api/v1/signup', async (req: Request, res: Response) => {
    // P0 security: agent keys must never be able to spawn new tenant accounts.
    // Signup is a public endpoint but if a key is supplied it must not be an
    // agent-scoped key (privilege escalation guard).
    const suppliedKey = req.headers['x-api-key'] as string | undefined;
    if (suppliedKey && suppliedKey.startsWith('ag_agent_')) {
      return res.status(403).json({
        error: 'Agent keys cannot create tenant accounts. Use your tenant API key or no key.',
      });
    }

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    const signupParsed = SignupRequest.safeParse(req.body ?? {});
    if (!signupParsed.success) {
      return res
        .status(400)
        .json({ error: signupParsed.error.issues[0]!.message });
    }
    const { name, email } = signupParsed.data;

    if (!await signupRateLimit(ip)) {
      return res
        .status(429)
        .json({
          error: 'Too many signups. Limit: 5 per hour per IP.',
          signup: {
            hint: 'Sign up for a free API key to get higher rate limits',
            method: 'POST',
            url: 'https://api.agentguard.tech/api/v1/signup',
            body: { name: 'Your Agent Name' },
          },
        });
    }

    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    const cleanName = name.trim().substring(0, 200);

    // Idempotent signup: if email exists, rotate key and return new one
    if (normalizedEmail) {
      const existing = await db.getTenantByEmail(normalizedEmail);
      if (existing) {
        try {
          // Deactivate all existing active keys for this tenant
          const activeKeys = await db.all<{ key_sha256: string }>(
            'SELECT key_sha256 FROM api_keys WHERE tenant_id = ? AND is_active = 1 AND key_sha256 IS NOT NULL',
            [existing.id],
          );
          for (const k of activeKeys) {
            await db.deactivateApiKeyBySha256(k.key_sha256);
          }

          // Generate new key
          const newKey = generateApiKey();
          await db.createApiKey(newKey, existing.id, 'recovered');

          logger.info(`[signup] recovered tenant: ${existing.id} (${normalizedEmail})`);

          return res.status(200).json({
            tenantId: existing.id,
            apiKey: newKey,
            recovered: true,
            message: 'Existing account found. New API key generated (previous key invalidated).',
          });
        } catch (e: unknown) {
          logger.error({ err: e instanceof Error ? e.message : String(e) }, '[signup] recovery error');
          return res.status(500).json({ error: 'Failed to recover account' });
        }
      }
    }

    const tenantId = uuid();
    const apiKey = generateApiKey();

    try {
      await db.createTenant(tenantId, cleanName, normalizedEmail);
      await db.createApiKey(apiKey, tenantId, 'default');
    } catch (e: unknown) {
      logger.error({ err: e instanceof Error ? e.message : String(e) }, '[signup] db error');
      return res.status(500).json({ error: 'Failed to create account' });
    }

    logger.info(`[signup] new tenant: ${tenantId} (${normalizedEmail})`);

    res.status(201).json({
      tenantId,
      apiKey,
      dashboard: 'https://agentguard.tech/dashboard/',
      message:
        'Account created. Store your API key securely — it will not be shown again.',
      quickstart: {
        evaluate: {
          method: 'POST',
          url: 'https://api.agentguard.tech/api/v1/evaluate',
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
          body: { tool: 'tool_name', params: { key: 'value' } },
          note: 'Call this before executing any tool. Default policy blocks dangerous tools (shell_exec, rm, sudo), allows everything else.',
        },
      },
    });
  });

  // ── POST /api/v1/signup/recover ─────────────────────────────────────────
  // Recover access to an existing account by email. Issues a new API key
  // and invalidates all previous keys. Rate limited to 2/hour per IP.
  router.post('/api/v1/signup/recover', async (req: Request, res: Response) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    if (!await recoveryRateLimit(ip)) {
      return res
        .status(429)
        .json({ error: 'Too many recovery attempts. Limit: 2 per hour per IP.' });
    }

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email) {
      return res.status(400).json({ error: 'Email is required for account recovery.' });
    }

    const existing = await db.getTenantByEmail(email);
    if (!existing) {
      // Don't reveal whether the email exists — return generic message
      return res.status(404).json({ error: 'No account found for this email.' });
    }

    try {
      // Deactivate all existing active keys for this tenant
      const activeKeys = await db.all<{ key_sha256: string }>(
        'SELECT key_sha256 FROM api_keys WHERE tenant_id = ? AND is_active = 1 AND key_sha256 IS NOT NULL',
        [existing.id],
      );
      for (const k of activeKeys) {
        await db.deactivateApiKeyBySha256(k.key_sha256);
      }

      // Generate new key
      const newKey = generateApiKey();
      await db.createApiKey(newKey, existing.id, 'recovered');

      // Audit trail (non-blocking)
      try {
        await storeAuditEvent(
          db, existing.id, null, 'key_recover', 'allow', null, 0,
          'API key recovered via email — old keys invalidated', 0, '', null,
        );
      } catch (e) {
        logger.warn({ err: e instanceof Error ? e : String(e) }, '[signup/recover] audit event failed (non-blocking)');
      }

      logger.info(`[signup/recover] tenant ${existing.id}: key recovered via email`);

      res.json({
        apiKey: newKey,
        message: 'New key generated. Previous key invalidated.',
      });
    } catch (e: unknown) {
      logger.error({ err: e instanceof Error ? e.message : String(e) }, '[signup/recover] error');
      res.status(500).json({ error: 'Failed to recover key' });
    }
  });

  // ── POST /api/v1/keys/rotate ────────────────────────────────────────────
  // Generates a new tenant API key and invalidates the old one.
  router.post(
    '/api/v1/keys/rotate',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const oldKeyHeader = req.headers['x-api-key'] as string;

      try {
        // Generate new key
        const newKey = generateApiKey();
        await db.createApiKey(newKey, tenantId, 'rotated');

        // Deactivate the old key
        const sha256 = crypto.createHash('sha256').update(oldKeyHeader).digest('hex');
        await db.deactivateApiKeyBySha256(sha256);

        // Audit trail (non-blocking)
        try {
          await storeAuditEvent(
            db, tenantId, null, 'key_rotate', 'allow', null, 0,
            'API key rotated — old key invalidated', 0, '', null,
          );
        } catch (e) {
          logger.warn({ err: e instanceof Error ? e : String(e) }, '[keys/rotate] audit event failed (non-blocking)');
        }

        logger.info(`[keys/rotate] tenant ${tenantId}: key rotated`);

        res.json({
          apiKey: newKey,
          message: 'New API key generated. Your previous key has been invalidated. Store this key securely — it will not be shown again.',
        });
      } catch (e: unknown) {
        logger.error({ err: e instanceof Error ? e.message : String(e) }, '[keys/rotate] error');
        res.status(500).json({ error: 'Failed to rotate key' });
      }
    },
  );

  // ── GET /api/v1/killswitch ────────────────────────────────────────────────
  router.get('/api/v1/killswitch', async (req: Request, res: Response) => {
    const ks = await getGlobalKillSwitch(db);
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (apiKey) {
      // Use sha256 lookup for hashed keys, fall back to plaintext for legacy
      const sha256 = crypto.createHash('sha256').update(apiKey).digest('hex');
      let keyRow = await db.getApiKeyBySha256(sha256);
      if (!keyRow) keyRow = await db.getApiKey(apiKey); // legacy fallback

      const tenant = keyRow
        ? await db.getTenant(keyRow.tenant_id)
        : null;

      if (tenant) {
        return res.json({
          global: { active: ks.active, activatedAt: ks.at },
          tenant: {
            active: tenant.kill_switch_active === 1,
            activatedAt: tenant.kill_switch_at,
          },
        });
      }
    }

    res.json({
      active: ks.active,
      activatedAt: ks.at,
      message: ks.active
        ? 'KILL SWITCH ACTIVE — all evaluations return BLOCK'
        : 'Kill switch inactive — normal evaluation in effect',
    });
  });

  // ── POST /api/v1/killswitch (tenant) ─────────────────────────────────────
  router.post(
    '/api/v1/killswitch',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenant = req.tenant!;

      // Strict validation: only accept {"active": true} or {"active": false}
      const parsed = KillswitchRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message ?? 'Invalid request body',
          expected: 'Body must be {"active": true} or {"active": false}',
        });
      }

      const newState = parsed.data.active;

      const at = newState ? new Date().toISOString() : null;
      await db.updateTenantKillSwitch(tenant.id, newState ? 1 : 0, at);
      await setTenantKillSwitchCache(tenant.id, newState);

      logger.info(
        `[killswitch] tenant ${tenant.id}: ${tenant.kill_switch_active === 1} → ${newState}`,
      );

      publishEvent({
        type: 'kill_switch',
        tenantId: tenant.id,
        data: { scope: 'tenant', active: newState, activatedAt: at },
        ts: new Date().toISOString(),
      });

      res.json({
        tenantId: tenant.id,
        active: newState,
        activatedAt: at,
        message: newState
          ? 'Tenant kill switch ACTIVATED — your evaluations will return BLOCK'
          : 'Tenant kill switch deactivated — normal evaluation resumed',
      });
    },
  );

  // ── POST /api/v1/admin/killswitch ─────────────────────────────────────────
  router.post(
    '/api/v1/admin/killswitch',
    auth.requireAdminAuth,
    async (req: Request, res: Response) => {
      // Strict validation: only accept {"active": true} or {"active": false}
      const parsed = KillswitchRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message ?? 'Invalid request body',
          expected: 'Body must be {"active": true} or {"active": false}',
        });
      }

      const newState = parsed.data.active;
      const ks = await getGlobalKillSwitch(db);

      await setGlobalKillSwitch(db, newState);
      await setGlobalKillSwitchCache(newState);
      logger.info(`[admin/killswitch] global: ${ks.active} → ${newState}`);

      publishEvent({
        type: 'kill_switch',
        tenantId: '__global__',
        data: { scope: 'global', active: newState, activatedAt: newState ? new Date().toISOString() : null },
        ts: new Date().toISOString(),
      });

      res.json({
        active: newState,
        activatedAt: newState ? new Date().toISOString() : null,
        message: newState
          ? 'GLOBAL KILL SWITCH ACTIVATED — all evaluations return BLOCK'
          : 'Global kill switch deactivated',
      });
    },
  );

  // ── GET /api/v1/usage ─────────────────────────────────────────────────────
  router.get(
    '/api/v1/usage',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      const total = await db.usageTotal(tenantId);
      const byResult = await db.usageByResult(tenantId);
      const last24h = await db.usageLast24h(tenantId);
      const topBlockedTools = await db.topBlockedTools(tenantId);
      const avgMs = await db.avgDurationMs(tenantId);

      const resultMap: Record<string, number> = {};
      for (const r of byResult) resultMap[r.result] = r.cnt;

      res.json({
        tenantId,
        totalEvaluations: total,
        blocked: resultMap['block'] ?? 0,
        allowed: resultMap['allow'] ?? 0,
        monitored: resultMap['monitor'] ?? 0,
        requireApproval: resultMap['require_approval'] ?? 0,
        last24h,
        topBlockedTools: topBlockedTools.map((t) => ({
          tool: t.tool,
          count: t.cnt,
        })),
        avgResponseMs:
          avgMs !== null ? Math.round(avgMs * 100) / 100 : 0,
      });
    },
  );

  // ── GET /api/v1/templates ─────────────────────────────────────────────────
  router.get('/api/v1/templates', (_req: Request, res: Response) => {
    const templates = Array.from(templateCache.values()).map((t) => ({
      id: t.id,
      name: t.name,
      version: t.version,
      description: t.description,
      category: t.category,
      tags: t.tags,
      ruleCount: Array.isArray(t.rules) ? t.rules.length : 0,
    }));
    res.json({ templates });
  });

  // ── GET /api/v1/templates/:name ───────────────────────────────────────────
  router.get('/api/v1/templates/:name', (req: Request, res: Response) => {
    const name = req.params['name'] as string;
    const template = templateCache.get(name);
    if (!template) {
      return res.status(404).json({ error: `Template '${name}' not found` });
    }
    res.json({ template });
  });

  // ── POST /api/v1/templates/:name/apply ───────────────────────────────────
  router.post(
    '/api/v1/templates/:name/apply',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const name = req.params['name'] as string;
      const template = templateCache.get(name);
      if (!template) {
        return res
          .status(404)
          .json({ error: `Template '${name}' not found` });
      }

      const tenantId = req.tenantId!;
      const ruleCount = Array.isArray(template.rules)
        ? template.rules.length
        : 0;

      const prevHash = await getLastHash(db, tenantId);
      await storeAuditEvent(
        db,
        tenantId,
        null,
        'template_apply',
        'allow',
        `template:${template.id}`,
        0,
        `Applied policy template: ${template.name} (${ruleCount} rules)`,
        0,
        prevHash,
        null,
      );

      res.json({
        applied: true,
        templateId: template.id,
        templateName: template.name,
        rulesInTemplate: ruleCount,
        message: `Template '${template.name}' applied. ${ruleCount} rules available for reference. Integrate rules into your policy engine configuration.`,
      });
    },
  );

  return router;
}
