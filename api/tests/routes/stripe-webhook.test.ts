/**
 * Tests for Stripe Webhook Route and Helpers
 *
 * Covers:
 *   - Signature verification (valid, missing, invalid, expired)
 *   - Webhook event processing (dedup, handling)
 *   - Price-to-tier mapping
 *   - License upsert on subscription update
 *   - Downgrade to free on subscription delete
 *   - Payment failure grace period
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { createStripeWebhookRoutes } from '../../routes/stripe-webhook/index.js';
import { verifyStripeSignature, mapStripePriceToTier } from '../../routes/stripe-webhook/helpers.js';
import {
  upsertLicenseFromSubscription,
  downgradeTenantToFree,
  handlePaymentFailure,
} from '../../routes/stripe-webhook/events.js';
import { createMockDb } from '../helpers/mock-db.js';
import type { IDatabase } from '../../db-interface.js';

// ── Test helpers ───────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'whsec_testsecret1234567890abcdef1234567890abcdef';

function signPayload(rawBody: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`, 'utf8')
    .digest('hex');
  return `t=${ts},v1=${signature}`;
}

function makeEvent(type: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    data: { object: overrides },
    ...overrides,
  });
}

function buildWebhookApp(db: IDatabase) {
  const app = express();
  // Use raw body parser so we can verify signatures
  app.use('/api/v1/webhooks/stripe', express.raw({ type: '*/*' }));
  // Convert raw Buffer to string on req.body
  app.use('/api/v1/webhooks/stripe', (req, _res, next) => {
    if (Buffer.isBuffer(req.body)) {
      req.body = req.body.toString('utf8');
    }
    next();
  });
  app.use(express.json());
  app.use(createStripeWebhookRoutes(db));
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('verifyStripeSignature', () => {
  it('verifies a valid signature', () => {
    const body = '{"id":"evt_123","type":"test"}';
    const header = signPayload(body, WEBHOOK_SECRET);

    const event = verifyStripeSignature(body, header, WEBHOOK_SECRET);
    expect(event.id).toBe('evt_123');
    expect(event.type).toBe('test');
  });

  it('throws on missing signature header', () => {
    expect(() =>
      verifyStripeSignature('{}', '', WEBHOOK_SECRET)
    ).toThrow('Missing Stripe-Signature header');
  });

  it('throws on invalid signature format', () => {
    expect(() =>
      verifyStripeSignature('{}', 'bad-format', WEBHOOK_SECRET)
    ).toThrow('Invalid Stripe-Signature header format');
  });

  it('throws on wrong secret (signature mismatch)', () => {
    const body = '{"id":"evt_123"}';
    const header = signPayload(body, 'wrong-secret');

    expect(() =>
      verifyStripeSignature(body, header, WEBHOOK_SECRET)
    ).toThrow('Stripe signature verification failed');
  });

  it('throws on expired timestamp (>5min drift)', () => {
    const body = '{"id":"evt_123"}';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const header = signPayload(body, WEBHOOK_SECRET, oldTimestamp);

    expect(() =>
      verifyStripeSignature(body, header, WEBHOOK_SECRET)
    ).toThrow('too old');
  });

  it('accepts timestamp within tolerance', () => {
    const body = '{"id":"evt_ok"}';
    const recentTs = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
    const header = signPayload(body, WEBHOOK_SECRET, recentTs);

    const event = verifyStripeSignature(body, header, WEBHOOK_SECRET);
    expect(event.id).toBe('evt_ok');
  });
});

describe('mapStripePriceToTier', () => {
  it('maps pro price ID to "pro"', () => {
    // Default pro price ID from helpers.ts
    const tier = mapStripePriceToTier('price_1T93g1PikWtUbmTWjoiZBgjS');
    expect(tier).toBe('pro');
  });

  it('maps enterprise price ID to "enterprise"', () => {
    const tier = mapStripePriceToTier('price_1T93g3PikWtUbmTWtlZgSVIM');
    expect(tier).toBe('enterprise');
  });

  it('defaults unknown price IDs to "pro"', () => {
    const tier = mapStripePriceToTier('price_unknown_random_id');
    expect(tier).toBe('pro');
  });

  it('defaults empty price ID to "pro"', () => {
    const tier = mapStripePriceToTier('');
    expect(tier).toBe('pro');
  });
});

describe('upsertLicenseFromSubscription', () => {
  it('calls db.upsertLicense with correct tier limits for pro', async () => {
    const db = createMockDb();
    const upsertLicense = vi.fn().mockResolvedValue(undefined);
    (db as any).upsertLicense = upsertLicense;

    await upsertLicenseFromSubscription(db, {
      tenantId: 'tenant-123',
      tier: 'pro',
      stripeSubscriptionId: 'sub_abc',
      stripeCustomerId: 'cus_xyz',
      currentPeriodEnd: new Date('2025-12-31'),
    });

    expect(upsertLicense).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-123',
      tier: 'pro',
      eventsPerMonth: 500_000,
      agentsMax: 100,
      status: 'active',
    }));
  });

  it('uses enterprise limits (unlimited) for enterprise tier', async () => {
    const db = createMockDb();
    const upsertLicense = vi.fn().mockResolvedValue(undefined);
    (db as any).upsertLicense = upsertLicense;

    await upsertLicenseFromSubscription(db, {
      tenantId: 'tenant-123',
      tier: 'enterprise',
      stripeSubscriptionId: 'sub_ent',
      stripeCustomerId: 'cus_ent',
      currentPeriodEnd: new Date('2025-12-31'),
    });

    expect(upsertLicense).toHaveBeenCalledWith(expect.objectContaining({
      eventsPerMonth: -1,
      agentsMax: -1,
    }));
  });
});

describe('downgradeTenantToFree', () => {
  it('calls revokeLicenseBySubscription when available', async () => {
    const db = createMockDb();
    const revoke = vi.fn().mockResolvedValue(undefined);
    (db as any).revokeLicenseBySubscription = revoke;

    await downgradeTenantToFree(db, 'sub_cancelled');
    expect(revoke).toHaveBeenCalledWith('sub_cancelled');
  });
});

describe('handlePaymentFailure', () => {
  it('sets 7-day grace period via db', async () => {
    const db = createMockDb();
    const setGrace = vi.fn().mockResolvedValue(undefined);
    (db as any).setLicenseGracePeriod = setGrace;

    await handlePaymentFailure(db, {
      id: 'in_123',
      customer: 'cus_abc',
      subscription: 'sub_abc',
      attempt_count: 1,
      metadata: {},
    });

    expect(setGrace).toHaveBeenCalledWith('sub_abc', 7);
  });

  it('skips grace period when invoice has no subscription', async () => {
    const db = createMockDb();
    const setGrace = vi.fn().mockResolvedValue(undefined);
    (db as any).setLicenseGracePeriod = setGrace;

    await handlePaymentFailure(db, {
      id: 'in_456',
      customer: 'cus_abc',
      subscription: '',
      attempt_count: 1,
      metadata: {},
    });

    expect(setGrace).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/webhooks/stripe — route integration', () => {
  let db: IDatabase;
  let app: express.Application;

  beforeEach(() => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
    db = createMockDb();
    app = buildWebhookApp(db);
  });

  it('returns 500 when STRIPE_WEBHOOK_SECRET not configured', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const localApp = buildWebhookApp(createMockDb());

    const res = await request(localApp)
      .post('/api/v1/webhooks/stripe')
      .send('{}');

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('secret');
  });

  it('returns 400 for invalid signature', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 'invalid')
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_bad"}');

    expect(res.status).toBe(400);
  });

  it('returns 200 with duplicate:true for already-processed event', async () => {
    const body = makeEvent('test.event', { id: 'evt_dup' });
    const header = signPayload(body, WEBHOOK_SECRET);

    // Simulate event already processed
    (db.isStripeEventProcessed as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    // Need to use a raw approach since express.raw() complicates supertest
    const localApp = express();
    localApp.use(express.text({ type: '*/*' }));
    localApp.use(express.json());
    localApp.use(createStripeWebhookRoutes(db));

    const res = await request(localApp)
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', header)
      .set('Content-Type', 'text/plain')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
  });
});
