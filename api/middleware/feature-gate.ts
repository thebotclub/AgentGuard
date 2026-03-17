/**
 * AgentGuard — Feature Gate Middleware
 *
 * Middleware factories that gate API endpoints by license feature flags
 * and usage limits. Returns HTTP 402 (Payment Required) when gated.
 *
 * Usage:
 *   router.post('/some-endpoint', requireFeature('sso'), handler)
 *   router.post('/evaluate', requireLimit('eventsPerMonth'), handler)
 */
import { Request, Response, NextFunction } from 'express';
import type { LicenseFeature } from '../lib/license-types.js';

// license type on Request is declared in license.ts

// ── Tier name helpers ─────────────────────────────────────────────────────

/**
 * Returns the minimum tier name required for a given feature.
 * Used in the 402 error message.
 */
function getMinTier(feature: LicenseFeature): string {
  const enterpriseFeatures: LicenseFeature[] = ['sso', 'air_gap', 'ml_anomaly'];
  const proFeatures: LicenseFeature[] = [
    'siem_export',
    'a2a_governance',
    'custom_retention',
    'priority_support',
  ];

  if (enterpriseFeatures.includes(feature)) return 'Enterprise';
  if (proFeatures.includes(feature)) return 'Pro';
  return 'Pro';
}

// ── requireFeature ────────────────────────────────────────────────────────

/**
 * Middleware factory that gates an endpoint by license feature flag.
 *
 * If the request's license context does not include the required feature,
 * responds with 402 Payment Required and upgrade info.
 *
 * No license context (free tier) = feature not available.
 */
export function requireFeature(feature: LicenseFeature) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const license = req.license;

    // No license or feature not in the feature set → gate
    if (!license || !license.features.has(feature)) {
      const tier = license?.tier ?? 'free';
      const minTier = getMinTier(feature);

      res.status(402).json({
        error: 'feature_gated',
        feature,
        message: `This feature requires a ${minTier} plan or higher.`,
        currentTier: tier,
        requiredTier: minTier.toLowerCase(),
        pricingUrl: 'https://agentguard.tech/pricing',
        upgradeUrl: 'https://agentguard.tech/pricing',
        upgrade_url: 'https://agentguard.tech/pricing', // keep for backward compat
      });
      return;
    }

    next();
  };
}

// ── requireLimit ──────────────────────────────────────────────────────────

/**
 * Middleware factory that checks current usage against license limits.
 *
 * Reads the current usage counters from the license context (set by the
 * usage tracker). If a limit is exceeded, returns 402 with usage info.
 *
 * Note: actual counter increments happen in the usage-tracker middleware.
 * This middleware only enforces the limit check synchronously.
 */
export function requireLimit(limitKey: 'eventsPerMonth' | 'agentsMax') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const license = req.license;

    // No license → free tier defaults (never crash)
    if (!license) {
      next();
      return;
    }

    const limit = license.limits[limitKey];

    // -1 = unlimited (enterprise)
    if (limit === -1 || limit === undefined) {
      next();
      return;
    }

    // Usage is tracked via X-AgentGuard-Usage-Remaining header injected by usage-tracker
    // Here we check the pre-computed usage attached to the request by usage-tracker (if present)
    const currentUsage = (req as Request & { _usageCurrent?: Record<string, number> })._usageCurrent;

    if (currentUsage && currentUsage[limitKey] !== undefined) {
      const used = currentUsage[limitKey]!;
      if (used > limit) {
        res.status(402).json({
          error: 'limit_exceeded',
          limitKey,
          message: `Monthly ${limitKey} limit of ${limit.toLocaleString()} exceeded.`,
          current: used,
          limit,
          tier: license.tier,
          currentTier: license.tier,
          requiredTier: 'pro',
          pricingUrl: 'https://agentguard.tech/pricing',
          upgradeUrl: 'https://agentguard.tech/pricing',
          upgrade_url: 'https://agentguard.tech/pricing', // keep for backward compat
        });
        return;
      }
    }

    next();
  };
}
