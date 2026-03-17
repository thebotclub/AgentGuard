/**
 * AgentGuard — License Key Generator
 *
 * Signs LicensePayload with an Ed25519 private key and produces AGKEY-* tokens.
 * This module is ONLY used server-side for issuing keys.
 *
 * The private key is loaded from:
 *   1. AGENTGUARD_LICENSE_PRIVKEY env var (PEM string)
 *   2. AGENTGUARD_LICENSE_PRIVKEY_PATH env var (path to PEM file)
 *   3. Falls back to the file at api/license-priv.pem (dev only, gitignored)
 *
 * Output format: AGKEY-<base64url(header)>.<base64url(payload)>.<base64url(signature)>
 */
import { sign as cryptoSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LicensePayload, LicenseTier, LicenseFeature } from './license-types.js';
import { TIER_LIMITS, TIER_FEATURES } from './license-types.js';

// ── Key header ────────────────────────────────────────────────────────────────

const LICENSE_HEADER = { alg: 'EdDSA', typ: 'AG-LIC' };
const ISSUER = 'agentguard.tech';

// ── Private key loading ───────────────────────────────────────────────────────

let _privateKey: string | null = null;

function loadPrivateKey(): string {
  if (_privateKey) return _privateKey;

  // 1. Inline PEM from env
  const envKey = process.env['AGENTGUARD_LICENSE_PRIVKEY'];
  if (envKey) {
    _privateKey = envKey;
    return _privateKey;
  }

  // 2. Path from env
  const envPath = process.env['AGENTGUARD_LICENSE_PRIVKEY_PATH'];
  if (envPath) {
    _privateKey = readFileSync(envPath, 'utf8');
    return _privateKey;
  }

  // 3. Dev fallback
  const devPath = join(process.cwd(), 'api', 'license-priv.pem');
  try {
    _privateKey = readFileSync(devPath, 'utf8');
    return _privateKey;
  } catch { /* not found */ }

  throw new Error(
    'License private key not configured. Set AGENTGUARD_LICENSE_PRIVKEY or AGENTGUARD_LICENSE_PRIVKEY_PATH.',
  );
}

/**
 * Override private key for testing.
 */
export function _setPrivateKeyForTesting(pem: string): void {
  _privateKey = pem;
}

// ── Key generation params ─────────────────────────────────────────────────────

export interface GenerateLicenseKeyParams {
  /** Tenant ID */
  tenantId: string;
  /** License tier */
  tier: LicenseTier;
  /** Expiry date */
  expiresAt: Date;
  /** Signing key ID (for rotation tracking) */
  kid?: string;
  /** Override feature flags (defaults to tier defaults) */
  features?: LicenseFeature[];
  /** Override limits (defaults to tier defaults) */
  limits?: Partial<LicensePayload['limits']>;
  /** Offline grace days (defaults to tier defaults) */
  offlineGraceDays?: number;
}

const DEFAULT_OFFLINE_GRACE: Record<LicenseTier, number> = {
  free: 1,
  pro: 7,
  enterprise: 30,
};

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Generate a signed AGKEY-* license key.
 *
 * @param params - License parameters
 * @param privateKeyPem - Optional PEM string override (for testing)
 * @returns { key: string, payload: LicensePayload }
 */
export function generateLicenseKey(
  params: GenerateLicenseKeyParams,
  privateKeyPem?: string,
): { key: string; payload: LicensePayload } {
  const keyPem = privateKeyPem ?? loadPrivateKey();

  const now = Math.floor(Date.now() / 1000);
  const tierLimits = TIER_LIMITS[params.tier];
  const tierFeatures = TIER_FEATURES[params.tier].map(f => f as string);

  const payload: LicensePayload = {
    kid: params.kid ?? 'k2026-01',
    tid: params.tenantId,
    tier: params.tier,
    features: params.features ? params.features.map(f => f as string) : tierFeatures,
    limits: {
      ...tierLimits,
      ...(params.limits ?? {}),
    },
    offlineGraceDays: params.offlineGraceDays ?? DEFAULT_OFFLINE_GRACE[params.tier],
    iat: now,
    exp: Math.floor(params.expiresAt.getTime() / 1000),
    iss: ISSUER,
  };

  const headerB64 = Buffer.from(JSON.stringify(LICENSE_HEADER)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;

  const signatureB64 = cryptoSign(null, Buffer.from(signingInput), keyPem).toString('base64url');

  const key = `AGKEY-${headerB64}.${payloadB64}.${signatureB64}`;

  return { key, payload };
}

/**
 * Generate a free-tier license key (auto-renewed rolling 30-day).
 */
export function generateFreeTierKey(tenantId: string, privateKeyPem?: string): { key: string; payload: LicensePayload } {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  return generateLicenseKey({ tenantId, tier: 'free', expiresAt }, privateKeyPem);
}

/**
 * Generate a pro-tier license key (1-year).
 */
export function generateProKey(tenantId: string, privateKeyPem?: string): { key: string; payload: LicensePayload } {
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  return generateLicenseKey({ tenantId, tier: 'pro', expiresAt }, privateKeyPem);
}

/**
 * Generate a trial key (14-day Pro).
 */
export function generateTrialKey(tenantId: string, privateKeyPem?: string): { key: string; payload: LicensePayload } {
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return generateLicenseKey({ tenantId, tier: 'pro', expiresAt }, privateKeyPem);
}

/**
 * Generate a unique key ID for signing key rotation tracking.
 */
export function generateKeyId(): string {
  return `k${new Date().getFullYear()}-${randomUUID().slice(0, 8)}`;
}
