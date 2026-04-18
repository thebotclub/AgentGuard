/**
 * AgentGuard — Stripe Webhook Route
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
import { logger } from '../../lib/logger.js';
import type { IDatabase } from '../../db-interface.js';
import { verifyStripeSignature } from './helpers.js';
import { handleStripeEvent } from './handler.js';

export function createStripeWebhookRoutes(db: IDatabase): Router {
  const router = Router();

  router.post(
    '/api/v1/webhooks/stripe',
    async (req: Request, res: Response) => {
      const secret = process.env['STRIPE_WEBHOOK_SECRET'];

      if (!secret) {
        logger.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
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

      let event;
      try {
        event = verifyStripeSignature(rawBody, signatureHeader, secret);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Signature verification failed';
        logger.warn({ err: msg }, '[stripe-webhook] signature error');
        res.status(400).json({ error: msg });
        return;
      }

      // Idempotency: DB-backed dedup — safe across restarts and multiple instances
      const alreadyProcessed = await db.isStripeEventProcessed(event.id);
      if (alreadyProcessed) {
        logger.info(`[stripe-webhook] duplicate event ${event.id} — skipping`);
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      logger.info(`[stripe-webhook] processing event ${event.id} (${event.type})`);

      try {
        await handleStripeEvent(db, event);
        await db.markStripeEventProcessed(event.id, event.type);
        res.status(200).json({ received: true });
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, '[stripe-webhook] handler error');
        // Return 500 so Stripe retries
        res.status(500).json({ error: 'Internal error processing webhook' });
      }
    },
  );

  return router;
}
