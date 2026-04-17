/**
 * Stripe webhook event handlers — license upsert, downgrade, and payment failure.
 */
import { logger } from '../../lib/logger.js';
import type { IDatabase } from '../../db-interface.js';
import type { ExtendedDB, StripeInvoice, StripeSubscription } from './helpers.js';

// ── License issuance helpers ──────────────────────────────────────────────

/**
 * Issue or update a license record in the database.
 * Idempotent: upserts based on stripeSubscriptionId.
 */
export async function upsertLicenseFromSubscription(
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
      logger.warn(
        '[stripe-webhook] db.upsertLicense not implemented — license update skipped. ' +
        `Tenant: ${params.tenantId}, tier: ${params.tier}`,
      );
    }

    logger.info(
      `[stripe-webhook] upserted license for tenant ${params.tenantId}: tier=${params.tier}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, '[stripe-webhook] upsertLicense error');
    throw err;
  }
}

/**
 * Downgrade a tenant to free tier when subscription is cancelled.
 */
export async function downgradeTenantToFree(
  db: IDatabase,
  stripeSubscriptionId: string,
): Promise<void> {
  const extDb = db as ExtendedDB;
  try {
    if (typeof extDb.revokeLicenseBySubscription === 'function') {
      await extDb.revokeLicenseBySubscription(stripeSubscriptionId);
    } else {
      logger.warn(
        '[stripe-webhook] db.revokeLicenseBySubscription not implemented — downgrade skipped. ' +
        `Subscription: ${stripeSubscriptionId}`,
      );
    }
    logger.info(
      `[stripe-webhook] downgraded to free: subscription ${stripeSubscriptionId}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, '[stripe-webhook] downgradeTenantToFree error');
    throw err;
  }
}

/**
 * Mark a tenant as in grace period due to payment failure.
 */
export async function handlePaymentFailure(
  db: IDatabase,
  invoice: StripeInvoice,
): Promise<void> {
  const extDb = db as ExtendedDB;
  try {
    if (invoice.subscription && typeof extDb.setLicenseGracePeriod === 'function') {
      await extDb.setLicenseGracePeriod(invoice.subscription, 7); // 7-day grace
    } else if (invoice.subscription) {
      logger.warn(
        '[stripe-webhook] db.setLicenseGracePeriod not implemented — grace period skipped. ' +
        `Subscription: ${invoice.subscription}`,
      );
    }
    logger.warn(
      `[stripe-webhook] payment failed for subscription ${invoice.subscription}, attempt ${invoice.attempt_count}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, '[stripe-webhook] handlePaymentFailure error');
    throw err;
  }
}
