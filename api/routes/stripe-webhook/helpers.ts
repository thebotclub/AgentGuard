/**
 * Stripe webhook helpers — types, signature verification, and price mapping.
 */
import crypto from 'crypto';

// ── Stripe event types (minimal — avoid needing the stripe npm package) ─────

export interface StripeSubscription {
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

export interface StripeCheckoutSession {
  id: string;
  metadata: Record<string, string>;
  customer: string;
  subscription: string;
}

export interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string;
  attempt_count: number;
  metadata: Record<string, string>;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: StripeSubscription | StripeCheckoutSession | StripeInvoice;
  };
}

// Extended DB interface for Stripe-related operations (may not be implemented yet)
export type ExtendedDB = IDatabase & {
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

// ── Stripe signature verification ─────────────────────────────────────────

/**
 * Verify a Stripe webhook signature.
 * Stripe sends: Stripe-Signature: t=<timestamp>,v1=<signature>
 * We compute: HMAC-SHA256(secret, "<timestamp>.<rawBody>")
 *
 * @throws Error if signature is invalid or timestamp is too old
 */
export function verifyStripeSignature(
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
 *
 * Uses environment variables for the canonical mapping first, so deployments
 * can override without a code change.  Falls back to a hardcoded lookup of the
 * known production price IDs (also used as fallback defaults in billing.ts).
 *
 * NOTE: The old implementation used string-includes matching (e.g
 * priceId.includes('enterprise')), which NEVER matches real Stripe IDs like
 * `price_1T93g3PikWtUbmTWtlZgSVIM`.  This has been replaced with an explicit
 * map lookup.
 */
export function mapStripePriceToTier(priceId: string): 'free' | 'pro' | 'enterprise' {
  if (!priceId) return 'pro';

  const priceToTier: Record<string, 'free' | 'pro' | 'enterprise'> = {};

  const proPriceId = process.env['STRIPE_PRO_PRICE_ID'] ?? 'price_1T93g1PikWtUbmTWjoiZBgjS';
  const enterprisePriceId = process.env['STRIPE_ENTERPRISE_PRICE_ID'] ?? 'price_1T93g3PikWtUbmTWtlZgSVIM';

  if (proPriceId) priceToTier[proPriceId] = 'pro';
  if (enterprisePriceId) priceToTier[enterprisePriceId] = 'enterprise';

  return priceToTier[priceId] ?? 'pro'; // default to 'pro' for any paid price
}
