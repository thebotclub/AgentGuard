/**
 * AgentGuard — License API Routes
 *
 * POST /api/v1/license/issue    (admin) — issue a new license key for a tenant
 * GET  /api/v1/license/status   (tenant) — current license status + usage
 * POST /api/v1/license/validate (public) — validate a license key (check CRL)
 * POST /api/v1/license/revoke   (admin) — revoke a license key for a tenant
 * GET  /api/v1/license/usage    (tenant) — monthly usage history (last 12 months)
 *
 * License key format: AGKEY-<random-hex-32>
 * The raw key is shown ONCE at issuance; only its SHA-256 hash is stored.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../lib/logger.js';
import type { IDatabase, LicenseKeyRow, LicenseEventRow } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import {
  LicenseIssueRequestSchema,
  LicenseValidateRequestSchema,
  LicenseRevokeRequestSchema,
} from '../schemas.js';

// ── Tier defaults ──────────────────────────────────────────────────────────

const TIER_DEFAULTS = {
  free: {
    seats: 3,
    events_pm: 100000,
    offline_grace_days: 1,
    audit_retention_days: 30,
    features: ['hitl'],
    expiry_days: 30,
  },
  pro: {
    seats: 25,
    events_pm: 500000,
    offline_grace_days: 7,
    audit_retention_days: 90,
    features: [
      'hitl',
      'hitl_unlimited',
      'siem',
      'anomaly_detection',
      'audit_export',
      'audit_retention_90d',
      'api_rate_unlimited',
      'priority_support',
    ],
    expiry_days: 365,
  },
  enterprise: {
    seats: 0,           // 0 = unlimited
    events_pm: 0,       // 0 = unlimited
    offline_grace_days: 30,
    audit_retention_days: 365,
    features: [
      'hitl',
      'hitl_unlimited',
      'siem',
      'anomaly_detection',
      'audit_export',
      'audit_retention_90d',
      'audit_retention_1y',
      'audit_retention_7y',
      'multi_region',
      'custom_data_residency',
      'air_gap',
      'rbac_advanced',
      'policy_inheritance',
      'api_rate_unlimited',
      'priority_support',
      'dedicated_csm',
      'sso',
    ],
    expiry_days: 365,
  },
} as const;

type Tier = keyof typeof TIER_DEFAULTS;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Current month in YYYY-MM format */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** SHA-256 hex digest */
function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Generate a raw license key string: AGKEY-<32 random hex bytes> */
function generateRawKey(): string {
  return `AGKEY-${crypto.randomBytes(32).toString('hex')}`;
}

/** Build a LicenseEventRow with sensible defaults */
function buildEvent(
  tenantId: string,
  eventType: string,
  licenseId: string | null = null,
  details: Record<string, unknown> | null = null,
  req?: Request,
): LicenseEventRow {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    license_id: licenseId,
    event_type: eventType,
    details: details ? JSON.stringify(details) : null,
    ip_address: req ? (req.ip ?? null) : null,
    created_at: new Date().toISOString(),
  };
}

// ── Route factory ──────────────────────────────────────────────────────────

export function createLicenseRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── POST /api/v1/license/issue ────────────────────────────────────────────
  // Admin only. Issues a new license key for a tenant.
  // Returns the raw AGKEY-... string exactly ONCE; only the hash is persisted.
  router.post(
    '/api/v1/license/issue',
    auth.requireAdminAuth,
    async (req: Request, res: Response) => {
      const parsed = LicenseIssueRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0];
        return res.status(400).json({ error: firstError?.message ?? 'Invalid request body' });
      }

      const { tenantId, tier, features, customLimits, expiresAt, stripeSubscriptionId, metadata } = parsed.data;
      const defaults = TIER_DEFAULTS[tier as Tier];

      // Compute expiry
      let expiresAtDate: Date;
      if (expiresAt) {
        expiresAtDate = new Date(expiresAt);
        if (isNaN(expiresAtDate.getTime())) {
          return res.status(400).json({ error: 'Invalid expiresAt date format' });
        }
      } else {
        expiresAtDate = new Date();
        expiresAtDate.setDate(expiresAtDate.getDate() + defaults.expiry_days);
      }

      // Build limits
      const limits = {
        seats: customLimits?.seats ?? defaults.seats,
        events_pm: customLimits?.events_pm ?? defaults.events_pm,
        offline_grace_days: customLimits?.offline_grace_days ?? defaults.offline_grace_days,
        audit_retention_days: customLimits?.audit_retention_days ?? defaults.audit_retention_days,
      };

      const finalFeatures: string[] = features ?? [...defaults.features];
      const offlineGraceDays = limits.offline_grace_days;

      // Generate the raw key (shown once, never stored)
      const rawKey = generateRawKey();
      const keyHash = sha256Hex(rawKey);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const keyRow: LicenseKeyRow = {
        id,
        tenant_id: tenantId,
        key_hash: keyHash,
        tier,
        features: JSON.stringify(finalFeatures),
        limits_json: JSON.stringify(limits),
        offline_grace_days: offlineGraceDays,
        issued_at: now,
        expires_at: expiresAtDate.toISOString(),
        revoked_at: null,
        revoke_reason: null,
        stripe_subscription_id: stripeSubscriptionId ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        created_at: now,
      };

      try {
        const inserted = await db.insertLicenseKey(keyRow);
        await db.insertLicenseEvent(
          buildEvent(tenantId, 'issued', inserted.id, { tier, features: finalFeatures }, req)
        );

        return res.status(201).json({
          key: rawKey,           // shown ONCE — store this securely
          id: inserted.id,
          tenantId,
          tier,
          features: finalFeatures,
          limits,
          expiresAt: expiresAtDate.toISOString(),
          issuedAt: now,
          warning: 'This key will not be shown again. Store it securely.',
        });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[license/issue] error');
        return res.status(500).json({ error: 'Failed to issue license key' });
      }
    },
  );

  // ── GET /api/v1/license/status ────────────────────────────────────────────
  // Tenant auth. Returns current license status + this month's usage.
  router.get(
    '/api/v1/license/status',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      try {
        const licKey = await db.getLicenseKeyByTenant(tenantId);
        const month = currentMonth();
        const usage = await db.getLicenseUsage(tenantId, month);

        if (!licKey) {
          // No license — return free tier defaults
          const defaults = TIER_DEFAULTS.free;
          return res.json({
            tier: 'free',
            features: defaults.features,
            limits: {
              seats: defaults.seats,
              events_pm: defaults.events_pm,
              offline_grace_days: defaults.offline_grace_days,
              audit_retention_days: defaults.audit_retention_days,
            },
            usage: {
              month,
              event_count: usage?.event_count ?? 0,
              agent_count: usage?.agent_count ?? 0,
            },
            expiresAt: null,
            issuedAt: null,
            revoked: false,
          });
        }

        const isRevoked = licKey.revoked_at !== null;
        const isExpired = new Date(licKey.expires_at) < new Date();
        const limits = JSON.parse(licKey.limits_json) as Record<string, unknown>;
        const features = JSON.parse(licKey.features) as string[];

        return res.json({
          id: licKey.id,
          tier: isRevoked || isExpired ? 'free' : licKey.tier,
          features: isRevoked || isExpired ? TIER_DEFAULTS.free.features : features,
          limits: isRevoked || isExpired
            ? {
                seats: TIER_DEFAULTS.free.seats,
                events_pm: TIER_DEFAULTS.free.events_pm,
                offline_grace_days: TIER_DEFAULTS.free.offline_grace_days,
                audit_retention_days: TIER_DEFAULTS.free.audit_retention_days,
              }
            : limits,
          usage: {
            month,
            event_count: usage?.event_count ?? 0,
            agent_count: usage?.agent_count ?? 0,
          },
          expiresAt: licKey.expires_at,
          issuedAt: licKey.issued_at,
          revoked: isRevoked,
          revokedAt: licKey.revoked_at,
          revokeReason: licKey.revoke_reason,
          expired: isExpired,
          stripeSubscriptionId: licKey.stripe_subscription_id,
        });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[license/status] error');
        return res.status(500).json({ error: 'Failed to retrieve license status' });
      }
    },
  );

  // ── POST /api/v1/license/validate ─────────────────────────────────────────
  // Public endpoint. Validates a license key (checks hash + revocation + expiry).
  router.post(
    '/api/v1/license/validate',
    async (req: Request, res: Response) => {
      const parsed = LicenseValidateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0];
        return res.status(400).json({ error: firstError?.message ?? 'Invalid request body' });
      }

      const { key } = parsed.data;
      const hash = sha256Hex(key);

      try {
        const licKey = await db.getLicenseKeyByHash(hash);

        if (!licKey) {
          return res.status(200).json({
            valid: false,
            reason: 'KEY_NOT_FOUND',
          });
        }

        // Check revocation (CRL check)
        if (licKey.revoked_at !== null) {
          await db.insertLicenseEvent(
            buildEvent(licKey.tenant_id, 'validated', licKey.id, { valid: false, reason: 'REVOKED' }, req)
          );
          return res.json({
            valid: false,
            reason: 'KEY_REVOKED',
            revokedAt: licKey.revoked_at,
            revokeReason: licKey.revoke_reason,
          });
        }

        // Check expiry
        const isExpired = new Date(licKey.expires_at) < new Date();
        if (isExpired) {
          await db.insertLicenseEvent(
            buildEvent(licKey.tenant_id, 'expired', licKey.id, { valid: false, reason: 'EXPIRED' }, req)
          );
          return res.json({
            valid: false,
            reason: 'KEY_EXPIRED',
            expiredAt: licKey.expires_at,
          });
        }

        const features = JSON.parse(licKey.features) as string[];
        const limits = JSON.parse(licKey.limits_json) as Record<string, unknown>;

        await db.insertLicenseEvent(
          buildEvent(licKey.tenant_id, 'validated', licKey.id, { valid: true }, req)
        );

        return res.json({
          valid: true,
          tenantId: licKey.tenant_id,
          tier: licKey.tier,
          features,
          limits,
          expiresAt: licKey.expires_at,
          issuedAt: licKey.issued_at,
        });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[license/validate] error');
        return res.status(500).json({ error: 'Failed to validate license key' });
      }
    },
  );

  // ── POST /api/v1/license/revoke ───────────────────────────────────────────
  // Admin only. Revokes a license key for a given tenant.
  router.post(
    '/api/v1/license/revoke',
    auth.requireAdminAuth,
    async (req: Request, res: Response) => {
      const parsed = LicenseRevokeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0];
        return res.status(400).json({ error: firstError?.message ?? 'Invalid request body' });
      }

      const { tenantId, reason } = parsed.data;

      try {
        const licKey = await db.getLicenseKeyByTenant(tenantId);
        if (!licKey) {
          return res.status(404).json({ error: 'No active license found for this tenant' });
        }

        await db.revokeLicenseKey(licKey.id, reason);
        await db.insertLicenseEvent(
          buildEvent(tenantId, 'revoked', licKey.id, { reason }, req)
        );

        return res.json({
          success: true,
          id: licKey.id,
          tenantId,
          revokedAt: new Date().toISOString(),
          reason,
        });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[license/revoke] error');
        return res.status(500).json({ error: 'Failed to revoke license key' });
      }
    },
  );

  // ── GET /api/v1/license/usage ─────────────────────────────────────────────
  // Tenant auth. Returns monthly usage history for last 12 months.
  router.get(
    '/api/v1/license/usage',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      try {
        // Build list of last 12 months in YYYY-MM format
        const months: string[] = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }

        // Fetch usage for all 12 months concurrently
        const usageRows = await Promise.all(
          months.map((month) => db.getLicenseUsage(tenantId, month))
        );

        const history = months.map((month, i) => ({
          month,
          event_count: usageRows[i]?.event_count ?? 0,
          agent_count: usageRows[i]?.agent_count ?? 0,
          last_updated: usageRows[i]?.last_updated ?? null,
        }));

        return res.json({
          tenantId,
          history,
        });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[license/usage] error');
        return res.status(500).json({ error: 'Failed to retrieve license usage' });
      }
    },
  );

  return router;
}
