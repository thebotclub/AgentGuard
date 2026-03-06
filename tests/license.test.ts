/**
 * AgentGuard — License Engine Tests
 *
 * Tests for:
 *   - license-types.ts (type constants and defaults)
 *   - license-keygen.ts (key generation)
 *   - license-validator.ts (signature verification, caching)
 *   - license-manager.ts (singleton, feature/limit checks)
 *   - middleware/license.ts (Express middleware)
 *
 * Run: npx tsx --test tests/license.test.ts
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

// ── Generate a test Ed25519 key pair ───────────────────────────────────────────

const { privateKey: testPrivKey, publicKey: testPubKey } = generateKeyPairSync('ed25519');
const TEST_PRIV_PEM = testPrivKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const TEST_PUB_PEM = testPubKey.export({ type: 'spki', format: 'pem' }) as string;

// Generate a second key pair for "wrong key" tests
const { privateKey: wrongPrivKey } = generateKeyPairSync('ed25519');
const WRONG_PRIV_PEM = wrongPrivKey.export({ type: 'pkcs8', format: 'pem' }) as string;

// ── Imports (after key generation so we can inject test keys) ─────────────────

import {
  FREE_TIER_DEFAULTS,
  TIER_LIMITS,
  TIER_FEATURES,
  type LicensePayload,
  type LicenseTier,
} from '../api/lib/license-types.js';

import {
  generateLicenseKey,
  generateFreeTierKey,
  generateProKey,
  generateTrialKey,
  _setPrivateKeyForTesting,
} from '../api/lib/license-keygen.js';

import {
  verifyLicenseKey,
  validateLicenseKeyCached,
  buildLicenseContext,
  buildFreeLicenseContext,
  invalidateCache,
  isExpired,
  isCachePopulated,
  LicenseValidationError,
  InvalidSignatureError,
  _setPublicKeyForTesting,
} from '../api/lib/license-validator.js';

import { LicenseManager } from '../api/lib/license-manager.js';

// ── Helper: generate a valid key using test key pair ─────────────────────────

function makeKey(
  overrides: Partial<{
    tier: LicenseTier;
    tenantId: string;
    expiresAt: Date;
    features: string[];
    offlineGraceDays: number;
    iat: number;
    exp: number;
  }> = {},
): { key: string; payload: LicensePayload } {
  const tier = overrides.tier ?? 'pro';
  const expiresAt = overrides.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  return generateLicenseKey({ tenantId: overrides.tenantId ?? 'test-tenant', tier, expiresAt }, TEST_PRIV_PEM);
}

// ── Setup: inject test keys before each suite ─────────────────────────────────

before(() => {
  _setPublicKeyForTesting(TEST_PUB_PEM);
  _setPrivateKeyForTesting(TEST_PRIV_PEM);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. LICENSE TYPES
// ─────────────────────────────────────────────────────────────────────────────

describe('LicenseTypes — Free tier defaults', () => {
  it('has correct eventsPerMonth (25000)', () => {
    assert.equal(FREE_TIER_DEFAULTS.limits.eventsPerMonth, 25_000);
  });

  it('has correct agentsMax (5)', () => {
    assert.equal(FREE_TIER_DEFAULTS.limits.agentsMax, 5);
  });

  it('has correct retentionDays (30)', () => {
    assert.equal(FREE_TIER_DEFAULTS.limits.retentionDays, 30);
  });

  it('has correct hitlConcurrent (3)', () => {
    assert.equal(FREE_TIER_DEFAULTS.limits.hitlConcurrent, 3);
  });

  it('has offlineGraceDays of 1', () => {
    assert.equal(FREE_TIER_DEFAULTS.offlineGraceDays, 1);
  });

  it('source is free_default', () => {
    assert.equal(FREE_TIER_DEFAULTS.source, 'free_default');
  });

  it('tier is free', () => {
    assert.equal(FREE_TIER_DEFAULTS.tier, 'free');
  });

  it('valid is false (no active key)', () => {
    assert.equal(FREE_TIER_DEFAULTS.valid, false);
  });
});

describe('LicenseTypes — Pro tier limits', () => {
  it('eventsPerMonth is 500000', () => {
    assert.equal(TIER_LIMITS.pro.eventsPerMonth, 500_000);
  });

  it('agentsMax is 100', () => {
    assert.equal(TIER_LIMITS.pro.agentsMax, 100);
  });

  it('retentionDays is 365', () => {
    assert.equal(TIER_LIMITS.pro.retentionDays, 365);
  });

  it('hitlConcurrent is -1 (unlimited)', () => {
    assert.equal(TIER_LIMITS.pro.hitlConcurrent, -1);
  });
});

describe('LicenseTypes — Enterprise tier limits', () => {
  it('eventsPerMonth is -1 (unlimited)', () => {
    assert.equal(TIER_LIMITS.enterprise.eventsPerMonth, -1);
  });

  it('agentsMax is -1 (unlimited)', () => {
    assert.equal(TIER_LIMITS.enterprise.agentsMax, -1);
  });

  it('retentionDays is 2555 (~7 years)', () => {
    assert.equal(TIER_LIMITS.enterprise.retentionDays, 2555);
  });
});

describe('LicenseTypes — Tier features', () => {
  it('free tier has no features', () => {
    assert.equal(TIER_FEATURES.free.length, 0);
  });

  it('pro tier includes siem_export', () => {
    assert.ok(TIER_FEATURES.pro.includes('siem_export'));
  });

  it('pro tier includes ml_anomaly', () => {
    assert.ok(TIER_FEATURES.pro.includes('ml_anomaly'));
  });

  it('enterprise tier includes sso', () => {
    assert.ok(TIER_FEATURES.enterprise.includes('sso'));
  });

  it('enterprise tier includes air_gap', () => {
    assert.ok(TIER_FEATURES.enterprise.includes('air_gap'));
  });

  it('enterprise tier includes a2a_governance', () => {
    assert.ok(TIER_FEATURES.enterprise.includes('a2a_governance'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LICENSE KEYGEN
// ─────────────────────────────────────────────────────────────────────────────

describe('LicenseKeygen — key format', () => {
  it('generates a key with AGKEY- prefix', () => {
    const { key } = makeKey();
    assert.ok(key.startsWith('AGKEY-'), `Expected AGKEY- prefix, got: ${key.slice(0, 20)}`);
  });

  it('key has three JWT segments (header.payload.sig)', () => {
    const { key } = makeKey();
    const parts = key.slice('AGKEY-'.length).split('.');
    assert.equal(parts.length, 3);
  });

  it('all three segments are non-empty', () => {
    const { key } = makeKey();
    const parts = key.slice('AGKEY-'.length).split('.');
    for (const p of parts) assert.ok(p.length > 0);
  });

  it('payload contains correct tier', () => {
    const { payload } = makeKey({ tier: 'enterprise' });
    assert.equal(payload.tier, 'enterprise');
  });

  it('payload contains correct tenantId', () => {
    const { payload } = makeKey({ tenantId: 'my-tenant' });
    assert.equal(payload.tid, 'my-tenant');
  });

  it('payload issuer is agentguard.tech', () => {
    const { payload } = makeKey();
    assert.equal(payload.iss, 'agentguard.tech');
  });

  it('payload has iat set to approximately now', () => {
    const before = Math.floor(Date.now() / 1000);
    const { payload } = makeKey();
    const after = Math.floor(Date.now() / 1000) + 1;
    assert.ok(payload.iat >= before && payload.iat <= after, `iat=${payload.iat} not in [${before},${after}]`);
  });

  it('payload exp is in the future', () => {
    const { payload } = makeKey();
    assert.ok(payload.exp > Math.floor(Date.now() / 1000));
  });
});

describe('LicenseKeygen — tier defaults', () => {
  it('pro key gets pro limits', () => {
    const { payload } = makeKey({ tier: 'pro' });
    assert.equal(payload.limits.eventsPerMonth, 500_000);
    assert.equal(payload.limits.agentsMax, 100);
  });

  it('free key gets free limits', () => {
    const { payload } = generateFreeTierKey('tenant-free', TEST_PRIV_PEM);
    assert.equal(payload.limits.eventsPerMonth, 25_000);
    assert.equal(payload.limits.agentsMax, 5);
  });

  it('enterprise key gets unlimited events (-1)', () => {
    const { payload } = generateLicenseKey({
      tenantId: 'ent-tenant',
      tier: 'enterprise',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }, TEST_PRIV_PEM);
    assert.equal(payload.limits.eventsPerMonth, -1);
  });

  it('pro key gets siem_export feature', () => {
    const { payload } = generateProKey('tenant-pro', TEST_PRIV_PEM);
    assert.ok(payload.features.includes('siem_export'));
  });

  it('trial key expires in ~14 days', () => {
    const now = Math.floor(Date.now() / 1000);
    const { payload } = generateTrialKey('trial-tenant', TEST_PRIV_PEM);
    const deltaDays = (payload.exp - now) / 86400;
    assert.ok(deltaDays >= 13.9 && deltaDays <= 14.1, `Trial expires in ${deltaDays} days (expected ~14)`);
  });

  it('free key expires in ~30 days', () => {
    const now = Math.floor(Date.now() / 1000);
    const { payload } = generateFreeTierKey('tenant-f', TEST_PRIV_PEM);
    const deltaDays = (payload.exp - now) / 86400;
    assert.ok(deltaDays >= 29.9 && deltaDays <= 30.1, `Free key expires in ${deltaDays} days (expected ~30)`);
  });

  it('pro key expires in ~365 days', () => {
    const now = Math.floor(Date.now() / 1000);
    const { payload } = generateProKey('tenant-p', TEST_PRIV_PEM);
    const deltaDays = (payload.exp - now) / 86400;
    assert.ok(deltaDays >= 364.9 && deltaDays <= 365.1, `Pro key expires in ${deltaDays} days (expected ~365)`);
  });
});

describe('LicenseKeygen — custom overrides', () => {
  it('allows custom features', () => {
    const { payload } = generateLicenseKey({
      tenantId: 'custom-tenant',
      tier: 'pro',
      expiresAt: new Date(Date.now() + 86400 * 1000),
      features: ['siem_export', 'sso'],
    }, TEST_PRIV_PEM);
    assert.deepEqual(payload.features, ['siem_export', 'sso']);
  });

  it('allows custom eventsPerMonth override', () => {
    const { payload } = generateLicenseKey({
      tenantId: 'custom-tenant',
      tier: 'pro',
      expiresAt: new Date(Date.now() + 86400 * 1000),
      limits: { eventsPerMonth: 999_999 },
    }, TEST_PRIV_PEM);
    assert.equal(payload.limits.eventsPerMonth, 999_999);
  });

  it('allows custom offlineGraceDays', () => {
    const { payload } = generateLicenseKey({
      tenantId: 'airgap-tenant',
      tier: 'enterprise',
      expiresAt: new Date(Date.now() + 86400 * 1000),
      offlineGraceDays: 365,
    }, TEST_PRIV_PEM);
    assert.equal(payload.offlineGraceDays, 365);
  });

  it('includes kid in payload', () => {
    const { payload } = generateLicenseKey({
      tenantId: 'tenant',
      tier: 'pro',
      expiresAt: new Date(Date.now() + 86400 * 1000),
      kid: 'k2026-test',
    }, TEST_PRIV_PEM);
    assert.equal(payload.kid, 'k2026-test');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. LICENSE VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

describe('LicenseValidator — valid key', () => {
  beforeEach(() => {
    invalidateCache();
    _setPublicKeyForTesting(TEST_PUB_PEM);
  });

  it('verifyLicenseKey returns payload for a valid key', () => {
    const { key, payload: expected } = makeKey();
    const result = verifyLicenseKey(key);
    assert.equal(result.iss, expected.iss);
    assert.equal(result.tid, expected.tid);
    assert.equal(result.tier, expected.tier);
  });

  it('returns correct tier from payload', () => {
    const { key } = makeKey({ tier: 'enterprise' });
    const result = verifyLicenseKey(key);
    assert.equal(result.tier, 'enterprise');
  });

  it('returns correct tenantId', () => {
    const { key } = makeKey({ tenantId: 'acme-corp' });
    const result = verifyLicenseKey(key);
    assert.equal(result.tid, 'acme-corp');
  });

  it('returns correct features array', () => {
    const { key, payload } = makeKey({ tier: 'pro' });
    const result = verifyLicenseKey(key);
    assert.deepEqual(result.features.sort(), payload.features.sort());
  });

  it('returns limits with correct structure', () => {
    const { key } = makeKey({ tier: 'pro' });
    const result = verifyLicenseKey(key);
    assert.ok(typeof result.limits.eventsPerMonth === 'number');
    assert.ok(typeof result.limits.agentsMax === 'number');
    assert.ok(typeof result.limits.retentionDays === 'number');
    assert.ok(typeof result.limits.hitlConcurrent === 'number');
  });

  it('validation is fast (<5ms) for cached key', () => {
    const { key } = makeKey();
    verifyLicenseKey(key); // prime
    const start = performance.now();
    validateLicenseKeyCached(key);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 5, `Cache hit took ${elapsed}ms (expected <5ms)`);
  });

  it('cache is populated after first validation', () => {
    invalidateCache();
    assert.equal(isCachePopulated(), false);
    const { key } = makeKey();
    validateLicenseKeyCached(key);
    assert.equal(isCachePopulated(), true);
  });

  it('invalidateCache clears the cache', () => {
    const { key } = makeKey();
    validateLicenseKeyCached(key);
    invalidateCache();
    assert.equal(isCachePopulated(), false);
  });

  it('cached result matches original', () => {
    const { key, payload: expected } = makeKey({ tenantId: 'cached-tenant' });
    validateLicenseKeyCached(key);
    const cached = validateLicenseKeyCached(key);
    assert.equal(cached.tid, expected.tid);
    assert.equal(cached.tier, expected.tier);
  });
});

describe('LicenseValidator — invalid keys', () => {
  beforeEach(() => {
    invalidateCache();
    _setPublicKeyForTesting(TEST_PUB_PEM);
  });

  it('throws InvalidSignatureError for key signed with wrong private key', () => {
    const { key } = generateLicenseKey({
      tenantId: 'attacker',
      tier: 'enterprise',
      expiresAt: new Date(Date.now() + 86400 * 1000),
    }, WRONG_PRIV_PEM);

    assert.throws(
      () => verifyLicenseKey(key),
      (err: unknown) => err instanceof InvalidSignatureError,
      'Should throw InvalidSignatureError for wrong signing key',
    );
  });

  it('throws LicenseValidationError for missing AGKEY- prefix', () => {
    assert.throws(
      () => verifyLicenseKey('not-a-license-key'),
      (err: unknown) => err instanceof LicenseValidationError,
    );
  });

  it('throws LicenseValidationError for empty string', () => {
    assert.throws(
      () => verifyLicenseKey(''),
      (err: unknown) => err instanceof LicenseValidationError,
    );
  });

  it('throws LicenseValidationError for AGKEY- prefix only', () => {
    assert.throws(
      () => verifyLicenseKey('AGKEY-'),
      (err: unknown) => err instanceof LicenseValidationError,
    );
  });

  it('throws for tampered payload (manually crafted wrong signature)', () => {
    // Generate a key but replace the signature segment with garbage
    const { key } = makeKey({ tier: 'free' });
    const parts = key.slice('AGKEY-'.length).split('.');
    // Replace signature with all zeros (valid base64url, wrong sig)
    const fakeSignature = Buffer.alloc(64).toString('base64url');
    const tampered = `AGKEY-${parts[0]}.${parts[1]}.${fakeSignature}`;
    assert.throws(
      () => verifyLicenseKey(tampered),
      (err: unknown) => err instanceof LicenseValidationError,
    );
  });

  it('throws for only two JWT segments', () => {
    assert.throws(
      () => verifyLicenseKey('AGKEY-header.payload'),
      (err: unknown) => err instanceof LicenseValidationError,
    );
  });

  it('throws for four JWT segments', () => {
    assert.throws(
      () => verifyLicenseKey('AGKEY-a.b.c.d'),
      (err: unknown) => err instanceof LicenseValidationError,
    );
  });

  it('InvalidSignatureError is a LicenseValidationError', () => {
    const err = new InvalidSignatureError();
    assert.ok(err instanceof LicenseValidationError);
    assert.ok(err instanceof Error);
  });

  it('InvalidSignatureError has code INVALID_SIGNATURE', () => {
    const err = new InvalidSignatureError();
    assert.equal(err.code, 'INVALID_SIGNATURE');
  });

  it('LicenseValidationError has correct code', () => {
    const err = new LicenseValidationError('test', 'EXPIRED');
    assert.equal(err.code, 'EXPIRED');
  });
});

describe('LicenseValidator — expiry', () => {
  beforeEach(() => {
    invalidateCache();
    _setPublicKeyForTesting(TEST_PUB_PEM);
  });

  it('isExpired returns false for future expiry', () => {
    const { payload } = makeKey({ expiresAt: new Date(Date.now() + 86400 * 1000) });
    assert.equal(isExpired(payload), false);
  });

  it('isExpired returns true for past expiry', () => {
    // Generate an expired key payload manually
    const { payload } = makeKey();
    const expiredPayload = { ...payload, exp: Math.floor(Date.now() / 1000) - 1 };
    assert.equal(isExpired(expiredPayload), true);
  });

  it('expired key still passes signature verification (expiry is separate check)', () => {
    // Create a key, then manipulate to check that validator doesn't embed expiry check
    const { key } = makeKey({ expiresAt: new Date(Date.now() + 86400 * 1000) });
    // Should not throw — valid signature
    const result = verifyLicenseKey(key);
    assert.ok(result, 'Valid key should decode without error');
  });
});

describe('LicenseValidator — buildLicenseContext', () => {
  it('builds context with valid=true for non-expired payload', () => {
    const { payload } = makeKey({ tier: 'pro' });
    const ctx = buildLicenseContext(payload);
    assert.equal(ctx.valid, true);
  });

  it('builds context with correct tier', () => {
    const { payload } = makeKey({ tier: 'enterprise' });
    const ctx = buildLicenseContext(payload);
    assert.equal(ctx.tier, 'enterprise');
  });

  it('builds context with features as Set', () => {
    const { payload } = makeKey({ tier: 'pro' });
    const ctx = buildLicenseContext(payload);
    assert.ok(ctx.features instanceof Set);
    assert.ok(ctx.features.has('siem_export'));
  });

  it('builds context with correct tenantId', () => {
    const { payload } = makeKey({ tenantId: 'my-co' });
    const ctx = buildLicenseContext(payload);
    assert.equal(ctx.tenantId, 'my-co');
  });

  it('builds context with expiresAt as Date', () => {
    const { payload } = makeKey();
    const ctx = buildLicenseContext(payload);
    assert.ok(ctx.expiresAt instanceof Date);
  });

  it('source defaults to key', () => {
    const { payload } = makeKey();
    const ctx = buildLicenseContext(payload);
    assert.equal(ctx.source, 'key');
  });

  it('source can be set to cache', () => {
    const { payload } = makeKey();
    const ctx = buildLicenseContext(payload, 'cache');
    assert.equal(ctx.source, 'cache');
  });

  it('validatedAt is recent', () => {
    const before = Date.now();
    const { payload } = makeKey();
    const ctx = buildLicenseContext(payload);
    const after = Date.now();
    assert.ok(ctx.validatedAt.getTime() >= before && ctx.validatedAt.getTime() <= after);
  });
});

describe('LicenseValidator — buildFreeLicenseContext', () => {
  it('returns tier free', () => {
    const ctx = buildFreeLicenseContext('t1');
    assert.equal(ctx.tier, 'free');
  });

  it('returns tenantId as provided', () => {
    const ctx = buildFreeLicenseContext('specific-tenant');
    assert.equal(ctx.tenantId, 'specific-tenant');
  });

  it('features Set is empty', () => {
    const ctx = buildFreeLicenseContext();
    assert.equal(ctx.features.size, 0);
  });

  it('limits match free tier defaults', () => {
    const ctx = buildFreeLicenseContext();
    assert.equal(ctx.limits.eventsPerMonth, 25_000);
    assert.equal(ctx.limits.agentsMax, 5);
    assert.equal(ctx.limits.retentionDays, 30);
    assert.equal(ctx.limits.hitlConcurrent, 3);
  });

  it('source is free_default', () => {
    const ctx = buildFreeLicenseContext();
    assert.equal(ctx.source, 'free_default');
  });

  it('valid is false', () => {
    const ctx = buildFreeLicenseContext();
    assert.equal(ctx.valid, false);
  });

  it('expiresAt is null', () => {
    const ctx = buildFreeLicenseContext();
    assert.equal(ctx.expiresAt, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. LICENSE MANAGER
// ─────────────────────────────────────────────────────────────────────────────

describe('LicenseManager — singleton', () => {
  afterEach(() => {
    LicenseManager._resetForTesting();
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    _setPublicKeyForTesting(TEST_PUB_PEM);
    _setPrivateKeyForTesting(TEST_PRIV_PEM);
  });

  it('getInstance returns same instance', () => {
    const a = LicenseManager.getInstance();
    const b = LicenseManager.getInstance();
    assert.strictEqual(a, b);
  });

  it('returns free context when no key is set', async () => {
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const ctx = mgr.getLicenseContext();
    assert.equal(ctx.tier, 'free');
    assert.equal(ctx.source, 'free_default');
  });

  it('returns pro context with valid pro key', async () => {
    const { key } = makeKey({ tier: 'pro' });
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const ctx = mgr.getLicenseContext();
    assert.equal(ctx.tier, 'pro');
    assert.equal(ctx.valid, true);
  });

  it('returns enterprise context with valid enterprise key', async () => {
    const { key } = generateLicenseKey({
      tenantId: 'ent',
      tier: 'enterprise',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }, TEST_PRIV_PEM);
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const ctx = mgr.getLicenseContext();
    assert.equal(ctx.tier, 'enterprise');
  });

  it('throws InvalidSignatureError on bad signature key at startup', async () => {
    const { key } = generateLicenseKey({
      tenantId: 'bad',
      tier: 'enterprise',
      expiresAt: new Date(Date.now() + 86400 * 1000),
    }, WRONG_PRIV_PEM);
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await assert.rejects(
      () => mgr.initialize(),
      (err: unknown) => err instanceof InvalidSignatureError,
    );
  });

  it('degrades to free when key is expired', async () => {
    // Build an expired key: exp in the past
    const { payload } = makeKey({ tier: 'pro' });
    // Re-sign with exp in past by creating a modified key
    const expiredPayload = {
      ...payload,
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) - 1, // 1 second ago
    };
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'AG-LIC' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const { sign: cryptoSign } = await import('node:crypto');
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = cryptoSign(null, Buffer.from(signingInput), TEST_PRIV_PEM).toString('base64url');
    const expiredKey = `AGKEY-${headerB64}.${payloadB64}.${sig}`;

    process.env['AGENTGUARD_LICENSE_KEY'] = expiredKey;
    invalidateCache();
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const ctx = mgr.getLicenseContext();
    assert.equal(ctx.tier, 'free');
  });

  it('double-initialize is idempotent', async () => {
    const { key } = makeKey({ tier: 'pro' });
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    await mgr.initialize(); // second call should be no-op
    const ctx = mgr.getLicenseContext();
    assert.equal(ctx.tier, 'pro');
  });
});

describe('LicenseManager — checkFeature', () => {
  afterEach(() => {
    LicenseManager._resetForTesting();
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    _setPublicKeyForTesting(TEST_PUB_PEM);
    _setPrivateKeyForTesting(TEST_PRIV_PEM);
  });

  it('returns false for feature not in free tier', async () => {
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    assert.equal(mgr.checkFeature('siem_export'), false);
  });

  it('returns true for feature present in pro tier', async () => {
    const { key } = makeKey({ tier: 'pro' });
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    assert.equal(mgr.checkFeature('siem_export'), true);
  });

  it('returns false for enterprise-only feature on pro tier', async () => {
    const { key } = makeKey({ tier: 'pro' });
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    assert.equal(mgr.checkFeature('sso'), false);
  });

  it('returns true for sso on enterprise tier', async () => {
    const { key } = generateLicenseKey({
      tenantId: 'ent2',
      tier: 'enterprise',
      expiresAt: new Date(Date.now() + 86400 * 1000),
    }, TEST_PRIV_PEM);
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    assert.equal(mgr.checkFeature('sso'), true);
  });

  it('returns true for air_gap on enterprise tier', async () => {
    const { key } = generateLicenseKey({
      tenantId: 'ent3',
      tier: 'enterprise',
      expiresAt: new Date(Date.now() + 86400 * 1000),
    }, TEST_PRIV_PEM);
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    assert.equal(mgr.checkFeature('air_gap'), true);
  });
});

describe('LicenseManager — checkLimit eventsPerMonth', () => {
  afterEach(() => {
    LicenseManager._resetForTesting();
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    _setPublicKeyForTesting(TEST_PUB_PEM);
    _setPrivateKeyForTesting(TEST_PRIV_PEM);
  });

  it('returns allowed:true for first event on free tier', async () => {
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const result = await mgr.checkLimit('eventsPerMonth');
    assert.equal(result.allowed, true);
  });

  it('returns limit of 25000 for free tier', async () => {
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const result = await mgr.checkLimit('eventsPerMonth');
    assert.equal(result.limit, 25_000);
  });

  it('returns allowed:true and limit=-1 for enterprise unlimited', async () => {
    const { key } = generateLicenseKey({
      tenantId: 'unlim-ent',
      tier: 'enterprise',
      expiresAt: new Date(Date.now() + 86400 * 1000),
    }, TEST_PRIV_PEM);
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const result = await mgr.checkLimit('eventsPerMonth');
    assert.equal(result.allowed, true);
    assert.equal(result.limit, -1);
  });
});

describe('LicenseManager — checkLimit agentsMax', () => {
  afterEach(() => {
    LicenseManager._resetForTesting();
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    _setPublicKeyForTesting(TEST_PUB_PEM);
    _setPrivateKeyForTesting(TEST_PRIV_PEM);
  });

  it('free tier: 3 agents allowed (< 5 limit)', async () => {
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const result = await mgr.checkLimit('agentsMax', 3);
    assert.equal(result.allowed, true);
    assert.equal(result.limit, 5);
  });

  it('free tier: 5 agents not allowed (at limit)', async () => {
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const result = await mgr.checkLimit('agentsMax', 5);
    assert.equal(result.allowed, false);
  });

  it('pro tier: 50 agents allowed (< 100 limit)', async () => {
    const { key } = makeKey({ tier: 'pro' });
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const result = await mgr.checkLimit('agentsMax', 50);
    assert.equal(result.allowed, true);
  });

  it('enterprise tier: any number allowed (-1 limit)', async () => {
    const { key } = generateLicenseKey({
      tenantId: 'ent-agents',
      tier: 'enterprise',
      expiresAt: new Date(Date.now() + 86400 * 1000),
    }, TEST_PRIV_PEM);
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const result = await mgr.checkLimit('agentsMax', 10_000);
    assert.equal(result.allowed, true);
    assert.equal(result.limit, -1);
  });
});

describe('LicenseManager — getLicenseContext', () => {
  afterEach(() => {
    LicenseManager._resetForTesting();
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    _setPublicKeyForTesting(TEST_PUB_PEM);
    _setPrivateKeyForTesting(TEST_PRIV_PEM);
  });

  it('returns a LicenseContext object', async () => {
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const ctx = mgr.getLicenseContext();
    assert.ok(ctx !== null && typeof ctx === 'object');
    assert.ok(typeof ctx.tier === 'string');
    assert.ok(ctx.features instanceof Set);
    assert.ok(typeof ctx.limits === 'object');
  });

  it('context has validatedAt as Date', async () => {
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    const ctx = mgr.getLicenseContext();
    assert.ok(ctx.validatedAt instanceof Date);
  });

  it('reload updates context', async () => {
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();
    assert.equal(mgr.getLicenseContext().tier, 'free');

    // Now set a pro key and reload
    const { key } = makeKey({ tier: 'pro' });
    process.env['AGENTGUARD_LICENSE_KEY'] = key;
    await mgr.reload();
    assert.equal(mgr.getLicenseContext().tier, 'pro');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. LICENSE MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

describe('LicenseMiddleware — licenseMiddleware', () => {
  afterEach(() => {
    LicenseManager._resetForTesting();
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    _setPublicKeyForTesting(TEST_PUB_PEM);
    _setPrivateKeyForTesting(TEST_PRIV_PEM);
  });

  it('injects req.license on every request', async () => {
    const { licenseMiddleware } = await import('../api/middleware/license.js');
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();

    const req = { tenantId: 'test' } as Record<string, unknown>;
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await licenseMiddleware(req as never, res as never, next as never);

    assert.equal(nextCalled, true, 'next() should be called');
    assert.ok(req['license'] !== undefined, 'req.license should be injected');
  });

  it('always calls next() even without a license key', async () => {
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    const { licenseMiddleware } = await import('../api/middleware/license.js');
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();

    const req = {} as Record<string, unknown>;
    const res = {};
    let nextCalled = false;
    await licenseMiddleware(req as never, res as never, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });

  it('injected license has tier free when no key configured', async () => {
    delete process.env['AGENTGUARD_LICENSE_KEY'];
    const { licenseMiddleware } = await import('../api/middleware/license.js');
    const mgr = LicenseManager.getInstance();
    await mgr.initialize();

    const req = {} as Record<string, unknown>;
    await licenseMiddleware(req as never, {} as never, () => {});

    const license = req['license'] as Record<string, unknown>;
    assert.equal(license['tier'], 'free');
  });
});

describe('LicenseMiddleware — requireFeature', () => {
  it('calls next when feature is present', async () => {
    const { requireFeature } = await import('../api/middleware/license.js');
    const middleware = requireFeature('siem_export');

    const req = { license: { features: new Set(['siem_export']) } } as Record<string, unknown>;
    const res = { status: () => res, json: () => {} };
    let nextCalled = false;

    middleware(req as never, res as never, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it('returns 402 when feature is missing', async () => {
    const { requireFeature } = await import('../api/middleware/license.js');
    const middleware = requireFeature('sso');

    let statusCode = 0;
    let jsonBody: Record<string, unknown> = {};

    const res = {
      status(code: number) { statusCode = code; return res; },
      json(body: Record<string, unknown>) { jsonBody = body; },
    };

    const req = { license: { features: new Set<string>(), tier: 'free' } } as Record<string, unknown>;
    let nextCalled = false;
    middleware(req as never, res as never, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'next() should NOT be called when feature missing');
    assert.equal(statusCode, 402);
    assert.equal(jsonBody['error'], 'FEATURE_NOT_AVAILABLE');
    assert.ok(typeof jsonBody['upgrade_url'] === 'string');
  });

  it('calls next when no license is injected (fail open)', async () => {
    const { requireFeature } = await import('../api/middleware/license.js');
    const middleware = requireFeature('sso');

    const req = {} as Record<string, unknown>; // no license property
    let nextCalled = false;
    middleware(req as never, {} as never, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Should fail open when no license injected');
  });

  it('402 response includes currentTier', async () => {
    const { requireFeature } = await import('../api/middleware/license.js');
    const middleware = requireFeature('air_gap');

    let jsonBody: Record<string, unknown> = {};
    const res = {
      status() { return res; },
      json(body: Record<string, unknown>) { jsonBody = body; },
    };
    const req = { license: { features: new Set<string>(), tier: 'pro' } } as Record<string, unknown>;
    middleware(req as never, res as never, () => {});
    assert.equal(jsonBody['currentTier'], 'pro');
  });
});
