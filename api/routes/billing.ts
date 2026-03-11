/**
 * AgentGuard — Billing Routes (Stripe Checkout + Customer Portal)
 *
 * POST /api/v1/billing/checkout    → Create Stripe Checkout session (requires API key)
 * POST /api/v1/billing/portal      → Create Stripe Customer Portal session (requires API key)
 * GET  /api/v1/billing/status      → Get current subscription status (requires API key)
 *
 * These endpoints require the STRIPE_SECRET_KEY environment variable.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { IDatabase } from '../db-interface.js';
import { logger } from '../lib/logger.js';

// ── Stripe API helper (no SDK dependency — raw fetch) ─────────────────────

const STRIPE_API = 'https://api.stripe.com/v1';

async function stripeRequest<T>(
  path: string,
  params: Record<string, string>,
  method: 'POST' | 'GET' = 'POST',
): Promise<T> {
  const secretKey = process.env['STRIPE_SECRET_KEY'] ?? process.env['STRIPE_LIVE_SECRET_KEY'];
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
  };

  let url = `${STRIPE_API}${path}`;
  const options: RequestInit = { method, headers };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = new URLSearchParams(params).toString();
  } else if (method === 'GET' && Object.keys(params).length > 0) {
    url += `?${new URLSearchParams(params).toString()}`;
  }

  const res = await fetch(url, options);
  const data = await res.json() as T & { error?: { message: string; type: string } };

  if (!res.ok) {
    const errMsg = (data as { error?: { message: string } }).error?.message ?? `Stripe error ${res.status}`;
    throw new Error(errMsg);
  }

  return data;
}

// ── Price mapping ─────────────────────────────────────────────────────────

const PRICE_MAP: Record<string, string> = {
  pro: process.env['STRIPE_PRO_PRICE_ID'] ?? 'price_1T93g1PikWtUbmTWjoiZBgjS',
  enterprise: process.env['STRIPE_ENTERPRISE_PRICE_ID'] ?? 'price_1T93g3PikWtUbmTWtlZgSVIM',
};

// ── Validation schemas ────────────────────────────────────────────────────

const checkoutSchema = z.object({
  plan: z.enum(['pro', 'enterprise']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

// ── Route factory ─────────────────────────────────────────────────────────

export function createBillingRoutes(db: IDatabase): Router {
  const router = Router();

  /**
   * POST /api/v1/billing/checkout
   *
   * Creates a Stripe Checkout session for upgrading to Pro or Enterprise.
   * Returns the checkout URL — redirect the user there.
   *
   * Body: { plan: "pro" | "enterprise", successUrl?, cancelUrl? }
   * Auth: requires tenant API key (X-API-Key header)
   */
  router.post('/api/v1/billing/checkout', async (req: Request, res: Response) => {
    try {
      const parsed = checkoutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'validation_error',
          issues: parsed.error.issues,
          hint: 'Body must include plan: "pro" or "enterprise"',
        });
        return;
      }

      const { plan, successUrl, cancelUrl } = parsed.data;
      const tenantId = (req as unknown as { tenantId?: string }).tenantId;
      const tenantEmail = (req as unknown as { tenantEmail?: string }).tenantEmail;

      if (!tenantId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const priceId = PRICE_MAP[plan];
      if (!priceId) {
        res.status(400).json({ error: `Unknown plan: ${plan}` });
        return;
      }

      // Check if tenant already has an active subscription
      // (we'll still allow checkout — Stripe handles upgrade/downgrade)

      const params: Record<string, string> = {
        'mode': 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': successUrl ?? 'https://app.agentguard.tech/billing?session_id={CHECKOUT_SESSION_ID}&status=success',
        'cancel_url': cancelUrl ?? 'https://app.agentguard.tech/billing?status=cancelled',
        'metadata[tenant_id]': tenantId,
        'subscription_data[metadata][tenant_id]': tenantId,
        'allow_promotion_codes': 'true',
      };

      // Pre-fill email if available
      if (tenantEmail) {
        params['customer_email'] = tenantEmail;
      }

      const session = await stripeRequest<{
        id: string;
        url: string;
      }>('/checkout/sessions', params);

      logger.info({ tenantId, plan, sessionId: session.id }, 'Stripe checkout session created');

      res.status(200).json({
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, 'Billing checkout error');

      if (msg.includes('STRIPE_SECRET_KEY')) {
        res.status(503).json({ error: 'Billing not configured' });
      } else {
        res.status(500).json({ error: 'Failed to create checkout session' });
      }
    }
  });

  /**
   * POST /api/v1/billing/portal
   *
   * Creates a Stripe Customer Portal session for managing subscriptions.
   * Returns the portal URL — redirect the user there.
   *
   * Body: { returnUrl? }
   * Auth: requires tenant API key
   */
  router.post('/api/v1/billing/portal', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as unknown as { tenantId?: string }).tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Look up the Stripe customer ID for this tenant
      const customerId = await getStripeCustomerId(db, tenantId);
      if (!customerId) {
        res.status(404).json({
          error: 'No active subscription found',
          hint: 'Use POST /api/v1/billing/checkout to subscribe first',
        });
        return;
      }

      const returnUrl = (req.body as { returnUrl?: string }).returnUrl
        ?? 'https://app.agentguard.tech/billing';

      const session = await stripeRequest<{
        id: string;
        url: string;
      }>('/billing_portal/sessions', {
        customer: customerId,
        return_url: returnUrl,
      });

      logger.info({ tenantId }, 'Stripe portal session created');

      res.status(200).json({
        portalUrl: session.url,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, 'Billing portal error');
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });

  /**
   * GET /api/v1/billing/status
   *
   * Returns the current subscription status for the authenticated tenant.
   * Auth: requires tenant API key
   */
  router.get('/api/v1/billing/status', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as unknown as { tenantId?: string }).tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get subscription info from database
      const subscription = await getTenantSubscription(db, tenantId);

      res.status(200).json({
        tenantId,
        ...subscription,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, 'Billing status error');
      res.status(500).json({ error: 'Failed to fetch billing status' });
    }
  });

  return router;
}

// ── Database helpers ──────────────────────────────────────────────────────

/**
 * Look up the Stripe customer ID for a tenant.
 * Checks the licenses table for a stripe_customer_id field.
 */
async function getStripeCustomerId(db: IDatabase, tenantId: string): Promise<string | null> {
  try {
    const row = await (db as unknown as {
      getOne?: (sql: string, params: unknown[]) => Promise<{ stripe_customer_id?: string } | null>;
    }).getOne?.(
      'SELECT stripe_customer_id FROM licenses WHERE tenant_id = $1 AND stripe_customer_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',
      [tenantId],
    );
    return row?.stripe_customer_id ?? null;
  } catch {
    // Table may not exist yet — that's fine
    return null;
  }
}

/**
 * Get the current subscription details for a tenant.
 */
async function getTenantSubscription(
  db: IDatabase,
  tenantId: string,
): Promise<{
  plan: string;
  status: string;
  eventsPerMonth: number;
  currentUsage: number;
  renewsAt: string | null;
  stripeCustomerId: string | null;
}> {
  try {
    // Try to get license info
    const row = await (db as unknown as {
      getOne?: (sql: string, params: unknown[]) => Promise<{
        tier?: string;
        status?: string;
        events_per_month?: number;
        stripe_customer_id?: string;
        expires_at?: string;
      } | null>;
    }).getOne?.(
      'SELECT tier, status, events_per_month, stripe_customer_id, expires_at FROM licenses WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
      [tenantId],
    );

    if (row) {
      return {
        plan: row.tier ?? 'free',
        status: row.status ?? 'active',
        eventsPerMonth: row.events_per_month ?? 100_000,
        currentUsage: 0, // TODO: pull from usage tracker
        renewsAt: row.expires_at ?? null,
        stripeCustomerId: row.stripe_customer_id ?? null,
      };
    }
  } catch {
    // Table doesn't exist — return free tier defaults
  }

  return {
    plan: 'free',
    status: 'active',
    eventsPerMonth: 100_000,
    currentUsage: 0,
    renewsAt: null,
    stripeCustomerId: null,
  };
}
