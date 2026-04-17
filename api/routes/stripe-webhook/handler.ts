/**
 * Stripe webhook event dispatcher — routes each event type to the right handler.
 */
import { logger } from '../../lib/logger.js';
import type { IDatabase } from '../../db-interface.js';
import type {
  StripeCheckoutSession,
  StripeEvent,
  StripeInvoice,
  StripeSubscription,
} from './helpers.js';
import { mapStripePriceToTier } from './helpers.js';
import {
  upsertLicenseFromSubscription,
  downgradeTenantToFree,
  handlePaymentFailure,
} from './events.js';

/**
 * Process a verified Stripe event by dispatching to the correct handler.
 */
export async function handleStripeEvent(db: IDatabase, event: StripeEvent): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as StripeCheckoutSession;
      const tenantId = session.metadata['tenant_id'];
      if (!tenantId) {
        logger.warn('[stripe-webhook] checkout.session.completed missing tenant_id in metadata');
        break;
      }
      logger.info(`[stripe-webhook] checkout completed for tenant ${tenantId}`);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as StripeSubscription;
      const tenantId = sub.metadata['tenant_id'];
      if (!tenantId) {
        logger.warn(`[stripe-webhook] ${event.type} missing tenant_id in metadata`);
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
      logger.info(`[stripe-webhook] unhandled event type: ${event.type}`);
  }
}
