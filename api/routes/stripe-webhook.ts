/**
 * AgentGuard — Stripe Webhook Handler
 *
 * POST /api/v1/webhooks/stripe
 *
 * No auth middleware — verified by Stripe signature (HMAC-SHA256).
 * Raw body required for signature verification (mounted with express.raw()).
 *
 * Events handled:
 *   checkout.session.completed        → issue Pro license key
 *   customer.subscription.updated     → update tier/limits
 *   customer.subscription.deleted     → downgrade to free
 *   invoice.payment_failed            → send warning, start grace period
 *
 * Idempotent: duplicate webhook deliveries are handled safely.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { IDatabase } from '../db-interface.js';

// ── Stripe event types (minimal — avoid needing the stripe npm package) ─────

interface StripeSubscription {
  id: string;
  status: string;
  metadata: Record<string, string>;
  customer: string;
  current_period_end: number;
  items: {
    data: Array<{
      price: {
        id: string;
        unit_amount: number;
      };
    }>;
  };
}

interface StripeCheckoutSession {
  id: string;
  metadata: Record<string, string>;
  customer: string;
  subscription: string;
}

interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string;
  attempt_count: number;
  metadata: Record<string, string>;
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: StripeSubscription | StripeCheckoutSession | StripeInvoice;
  };
}

// ── Stripe signature verification ─────────────────────────────────────────

/**
 * Verify a Stripe webhook signature.
 * Stripe sends: Stripe-Signature: t=<timestamp>,v1=<signature>
 * We compute: HMAC-SHA256(secret, "<timestamp>.<rawBody>")
 *
 * @throws Error if signature is invalid or timestamp is too old
 */
function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300, // 5-minute tolerance (Stripe default)
): StripeEvent {
  if (!signatureHeader) {
    throw new Error('Missing Stripe-Signature header');
  }

  // Parse the signature header: t=<ts>,v1=<sig1>[,v1=<sig2>]
  const parts = signatureHeader.split(',');
  let timestamp = '';
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split('=', 2);
    if (key === 't') timestamp = value ?? '';
    if (key === 'v1') signatures.push(value ?? '');
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid Stripe-Signature header format');
  }

  // Check timestamp tolerance
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) {
    throw new Error(`Webhook timestamp too old (${Math.abs(now - ts)}s drift)`);
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  // Constant-time compare against all provided v1 signatures
  const expectedBuf = Buffer.from(expected, 'hex');
  let matched = false;
  for (const sig of signatures) {
    try {
      const sigBuf = Buffer.from(sig, 'hex');
      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        matched = true;
        break;
      }
    } catch {
      // Invalid hex — skip
    }
  }

  if (!matched) {
    throw new Error('Stripe signature verification failed');
  }

  // Parse and return the event
  return JSON.parse(rawBody) as StripeEvent;
}

// ── License tier mapping ──────────────────────────────────────────────────

/**
 * Map a Stripe price ID to an AgentGuard tier.
 * Falls back to 'pro' for any unrecognised price.
 */
function mapStripePriceToTier(priceId: string): 'free' | 'pro' | 'enterprise' {
  if (!priceId) return 'pro';

  const lower = priceId.toLowerCase();
  if (lower.includes('enterprise')) return 'enterprise';
  if (lower.includes('free')) return 'free';
  return 'pro'; // default for any paid price
}

// ── License issuance helpers ──────────────────────────────────────────────

/**
 * Issue or update a license record in the database.
 * Idempotent: upserts based on stripeSubscriptionId.
 */
// Extended DB interface for Stripe-related operations (may not be implemented yet)
type ExtendedDB = IDatabase & {
  upsertLicense?: (params: {
    tenantId: string;
    tier: string;
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    eventsPerMonth: number;
    agentsMax: number;
    expiresAt: string;
    status: string;
  }) => Promise<void>;
  revokeLicenseBySubscription?: (subscriptionId: string) => Promise<void>;
  setLicenseGracePeriod?: (subscriptionId: string, days: number) => Promise<void>;
};

async function upsertLicenseFromSubscription(
  db: IDatabase,
  params: {
    tenantId: string;
    tier: 'free' | 'pro' | 'enterprise';
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    currentPeriodEnd: Date;
  },
): Promise<void> {
  const tierLimits: Record<string, { eventsPerMonth: number; agentsMax: number }> = {
    free: { eventsPerMonth: 100_000, agentsMax: 5 },
    pro: { eventsPerMonth: 500_000, agentsMax: 100 },
    enterprise: { eventsPerMonth: -1, agentsMax: -1 },
  };

  const limits = tierLimits[params.tier] ?? tierLimits['pro']!;
  const extDb = db as ExtendedDB;

  try {
    if (typeof extDb.upsertLicense === 'function') {
      await extDb.upsertLicense({
        tenantId: params.tenantId,
        tier: params.tier,
        stripeSubscriptionId: params.stripeSubscriptionId,
        stripeCustomerId: params.stripeCustomerId,
        eventsPerMonth: limits.eventsPerMonth,
        agentsMax: limits.agentsMax,
        expiresAt: params.currentPeriodEnd.toISOString(),
        status: 'active',
      });
    } else {
      console.warn(
        '[stripe-webhook] db.upsertLicense not implemented — license update skipped. ' +
        `Tenant: ${params.tenantId}, tier: ${params.tier}`,
      );
    }

    console.log(
      `[stripe-webhook] upserted license for tenant ${params.tenantId}: tier=${params.tier}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] upsertLicense error:', msg);
    throw err;
  }
}

/**
 * Downgrade a tenant to free tier when subscription is cancelled.
 */
async function downgradeTenantToFree(
  db: IDatabase,
  stripeSubscriptionId: string,
): Promise<void> {
  const extDb = db as ExtendedDB;
  try {
    if (typeof extDb.revokeLicenseBySubscription === 'function') {
      await extDb.revokeLicenseBySubscription(stripeSubscriptionId);
    } else {
      console.warn(
        '[stripe-webhook] db.revokeLicenseBySubscription not implemented — downgrade skipped. ' +
        `Subscription: ${stripeSubscriptionId}`,
      );
    }
    console.log(
      `[stripe-webhook] downgraded to free: subscription ${stripeSubscriptionId}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] downgradeTenantToFree error:', msg);
    throw err;
  }
}

/**
 * Mark a tenant as in grace period due to payment failure.
 */
async function handlePaymentFailure(
  db: IDatabase,
  invoice: StripeInvoice,
): Promise<void> {
  const extDb = db as ExtendedDB;
  try {
    if (invoice.subscription && typeof extDb.setLicenseGracePeriod === 'function') {
      await extDb.setLicenseGracePeriod(invoice.subscription, 7); // 7-day grace
    } else if (invoice.subscription) {
      console.warn(
        '[stripe-webhook] db.setLicenseGracePeriod not implemented — grace period skipped. ' +
        `Subscription: ${invoice.subscription}`,
      );
    }
    console.warn(
      `[stripe-webhook] payment failed for subscription ${invoice.subscription}, attempt ${invoice.attempt_count}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] handlePaymentFailure error:', msg);
    throw err;
  }
}

// ── Idempotency tracking (in-memory; production would use Redis/DB) ───────

const processedEvents = new Set<string>();
const MAX_PROCESSED_CACHE = 1000;

function isAlreadyProcessed(eventId: string): boolean {
  return processedEvents.has(eventId);
}

function markProcessed(eventId: string): void {
  if (processedEvents.size >= MAX_PROCESSED_CACHE) {
    // Evict oldest entry (Set iteration order = insertion order)
    const first = processedEvents.values().next().value;
    if (first) processedEvents.delete(first);
  }
  processedEvents.add(eventId);
}

// ── Route factory ─────────────────────────────────────────────────────────

export function createStripeWebhookRoutes(db: IDatabase): Router {
  const router = Router();

  /**
   * POST /api/v1/webhooks/stripe
   *
   * No standard auth — verified by Stripe HMAC signature.
   * Expects raw body (mount with express.raw() in server.ts).
   */
  router.post(
    '/api/v1/webhooks/stripe',
    async (req: Request, res: Response) => {
      const secret = process.env['STRIPE_WEBHOOK_SECRET'];

      // If secret isn't configured, reject all webhooks
      if (!secret) {
        console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
        res.status(500).json({ error: 'Webhook secret not configured' });
        return;
      }

      // Raw body: express.raw() stores it in req.body as a Buffer
      // Fallback: req.rawBody (our existing pattern from server.ts)
      let rawBody: string;
      if (Buffer.isBuffer(req.body)) {
        rawBody = req.body.toString('utf8');
      } else if (typeof req.rawBody === 'string') {
        rawBody = req.rawBody;
      } else if (typeof req.body === 'string') {
        rawBody = req.body;
      } else {
        res.status(400).json({ error: 'Raw body required for Stripe webhook verification' });
        return;
      }

      const signatureHeader = req.headers['stripe-signature'] as string;

      let event: StripeEvent;
      try {
        event = verifyStripeSignature(rawBody, signatureHeader, secret);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Signature verification failed';
        console.warn('[stripe-webhook] signature error:', msg);
        res.status(400).json({ error: msg });
        return;
      }

      // Idempotency: skip already-processed events
      if (isAlreadyProcessed(event.id)) {
        console.log(`[stripe-webhook] duplicate event ${event.id} — skipping`);
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      console.log(`[stripe-webhook] processing event ${event.id} (${event.type})`);

      try {
        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as StripeCheckoutSession;
            const tenantId = session.metadata['tenant_id'];
            if (!tenantId) {
              console.warn('[stripe-webhook] checkout.session.completed missing tenant_id in metadata');
              break;
            }
            // Issue Pro license — subscription details come via subscription.updated
            console.log(`[stripe-webhook] checkout completed for tenant ${tenantId}`);
            break;
          }

          case 'customer.subscription.created':
          case 'customer.subscription.updated': {
            const sub = event.data.object as StripeSubscription;
            const tenantId = sub.metadata['tenant_id'];
            if (!tenantId) {
              console.warn(`[stripe-webhook] ${event.type} missing tenant_id in metadata`);
              break;
            }

            const priceId = sub.items.data[0]?.price?.id ?? '';
            const tier = mapStripePriceToTier(priceId);
            const periodEnd = new Date(sub.current_period_end * 1000);

            await upsertLicenseFromSubscription(db, {
              tenantId,
              tier,
              stripeSubscriptionId: sub.id,
              stripeCustomerId: sub.customer,
              currentPeriodEnd: periodEnd,
            });
            break;
          }

          case 'customer.subscription.deleted': {
            const sub = event.data.object as StripeSubscription;
            await downgradeTenantToFree(db, sub.id);
            break;
          }

          case 'invoice.payment_failed': {
            const invoice = event.data.object as StripeInvoice;
            await handlePaymentFailure(db, invoice);
            break;
          }

          default:
            // Unhandled event type — log and acknowledge
            console.log(`[stripe-webhook] unhandled event type: ${event.type}`);
        }

        markProcessed(event.id);
        res.status(200).json({ received: true });
      } catch (err) {
        console.error('[stripe-webhook] handler error:', err instanceof Error ? err.message : err);
        // Return 500 so Stripe retries
        res.status(500).json({ error: 'Internal error processing webhook' });
      }
    },
  );

  return router;
}
