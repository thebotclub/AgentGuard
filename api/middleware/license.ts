/**
 * AgentGuard — License Middleware (Express)
 *
 * Runs after auth middleware. Injects `req.license: LicenseContext` into
 * every request. Phase 0: tracks usage but does NOT block requests.
 *
 * Usage:
 *   app.use(licenseMiddleware);
 *
 * Access in routes:
 *   const license = req.license;
 *   if (license.features.has('siem_export')) { ... }
 */
import type { Request, Response, NextFunction } from 'express';
import { LicenseManager } from '../lib/license-manager.js';
import type { LicenseContext } from '../lib/license-types.js';

// ── Module augmentation ───────────────────────────────────────────────────────

declare global {
   
  namespace Express {
    interface Request {
      license?: LicenseContext;
    }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Express middleware that injects the license context into each request.
 *
 * - Always succeeds (never rejects with 4xx/5xx)
 * - Injects `req.license` for use in route handlers
 * - Phase 0: does NOT enforce limits (only tracks usage)
 */
export async function licenseMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const mgr = LicenseManager.getInstance();
    req.license = mgr.getLicenseContext();
  } catch {
    // Never fail — inject free tier as fallback
    const { buildFreeLicenseContext } = await import('../lib/license-validator.js');
    req.license = buildFreeLicenseContext((req as Request & { tenantId?: string }).tenantId ?? 'default');
  }
  next();
}

// ── Feature-gate helper ───────────────────────────────────────────────────────

/**
 * Middleware factory that returns 402 if the request's license doesn't
 * include the required feature flag.
 *
 * Phase 0 note: this helper exists for future use but is NOT applied globally yet.
 *
 * Example:
 *   router.get('/siem/export', requireFeature('siem_export'), handler);
 */
export function requireFeature(
  feature: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const license = req.license;

    if (!license) {
      // License middleware not applied upstream — skip enforcement
      next();
      return;
    }

    if (!license.features.has(feature)) {
      res.status(402).json({
        error: 'FEATURE_NOT_AVAILABLE',
        message: `Feature '${feature}' requires a higher tier license`,
        currentTier: license.tier,
        upgrade_url: 'https://agentguard.tech/upgrade',
      });
      return;
    }

    next();
  };
}

/**
 * Async middleware that checks the monthly event limit and tracks usage.
 * Returns 402 when limit is exceeded.
 *
 * Phase 0: NOT applied globally. Available for route-level opt-in.
 */
export async function checkEventLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const license = req.license;

  if (!license) {
    next();
    return;
  }

  try {
    const mgr = LicenseManager.getInstance();
    const result = await mgr.checkLimit('eventsPerMonth');

    if (!result.allowed) {
      res.status(402).json({
        error: 'MONTHLY_LIMIT_EXCEEDED',
        message: `Monthly evaluation limit of ${result.limit.toLocaleString()} reached`,
        current: result.current,
        limit: result.limit,
        tier: license.tier,
        upgrade_url: 'https://agentguard.tech/upgrade',
      });
      return;
    }
  } catch {
    // Limit check failure — never block requests
  }

  next();
}
