/**
 * AgentGuard — License Validator
 *
 * Validates AGKEY-* license keys using Ed25519 signature verification.
 * Uses Node.js built-in `crypto` — no external dependencies.
 *
 * Format: AGKEY-<base64url(header)>.<base64url(payload)>.<base64url(signature)>
 *
 * Validation steps:
 *   1. Strip AGKEY- prefix
 *   2. Split into header.payload.signature
 *   3. Verify Ed25519 signature with embedded public key
 *   4. Decode and parse payload
 *   5. Check issuer and expiry
 *
 * Cache: validated license cached in memory, refreshed every 60 minutes.
 */
import { verify as cryptoVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LicensePayload, LicenseContext } from './license-types.js';
import { FREE_TIER_DEFAULTS } from './license-types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const AGKEY_PREFIX = 'AGKEY-';
const EXPECTED_ISSUER = 'agentguard.dev';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

// ── Errors ────────────────────────────────────────────────────────────────────

export class LicenseValidationError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_FORMAT' | 'INVALID_SIGNATURE' | 'EXPIRED' | 'INVALID_ISSUER' | 'INVALID_PAYLOAD',
  ) {
    super(message);
    this.name = 'LicenseValidationError';
  }
}

export class InvalidSignatureError extends LicenseValidationError {
  constructor(message = 'License key signature verification failed') {
    super(message, 'INVALID_SIGNATURE');
    this.name = 'InvalidSignatureError';
  }
}

// ── Public key loading ────────────────────────────────────────────────────────

let _publicKey: string | null = null;

/**
 * Load the Ed25519 public key from disk.
 * Loaded once and cached in module scope.
 */
function loadPublicKey(): string {
  if (_publicKey) return _publicKey;

  // Allow override via env var (useful for tests)
  const envPath = process.env['AGENTGUARD_LICENSE_PUBKEY_PATH'];
  const keyPath = envPath ?? join(process.cwd(), 'api', 'license-pub.pem');

  try {
    _publicKey = readFileSync(keyPath, 'utf8');
  } catch {
    // Try alternate paths
    const altPaths = [
      join(process.cwd(), 'api', 'license-pub.pem'),
      join(process.cwd(), 'license-pub.pem'),
    ];
    for (const alt of altPaths) {
      try {
        _publicKey = readFileSync(alt, 'utf8');
        break;
      } catch { /* continue */ }
    }
    if (!_publicKey) {
      throw new Error(`Could not load license public key from ${keyPath}`);
    }
  }

  return _publicKey;
}

/**
 * Override the public key (for testing).
 */
export function _setPublicKeyForTesting(pem: string): void {
  _publicKey = pem;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

interface CacheEntry {
  keyString: string;
  payload: LicensePayload;
  cachedAt: number;
}

let _cache: CacheEntry | null = null;

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.cachedAt < CACHE_TTL_MS;
}

// ── Core validator ────────────────────────────────────────────────────────────

/**
 * Verify and decode an AGKEY-* license key.
 *
 * Throws `InvalidSignatureError` if the cryptographic signature is invalid.
 * Throws `LicenseValidationError` for other format/content errors.
 * Returns the decoded `LicensePayload` on success (does NOT check expiry here —
 * expiry is handled separately so callers can choose degradation behavior).
 */
export function verifyLicenseKey(agkey: string): LicensePayload {
  if (!agkey || typeof agkey !== 'string') {
    throw new LicenseValidationError('License key must be a non-empty string', 'INVALID_FORMAT');
  }

  if (!agkey.startsWith(AGKEY_PREFIX)) {
    throw new LicenseValidationError(`License key must start with ${AGKEY_PREFIX}`, 'INVALID_FORMAT');
  }

  const jwtPart = agkey.slice(AGKEY_PREFIX.length);
  const parts = jwtPart.split('.');

  if (parts.length !== 3) {
    throw new LicenseValidationError('Malformed license key: expected header.payload.signature', 'INVALID_FORMAT');
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new LicenseValidationError('Malformed license key: empty segment', 'INVALID_FORMAT');
  }

  // Verify Ed25519 signature
  const signingInput = `${headerB64}.${payloadB64}`;
  let signature: Buffer;
  try {
    signature = Buffer.from(signatureB64, 'base64url');
  } catch {
    throw new InvalidSignatureError('Failed to decode signature');
  }

  const publicKey = loadPublicKey();

  try {
    // Ed25519 requires sign(null, ...) / verify(null, ...) in Node.js v22+
    const valid = cryptoVerify(null, Buffer.from(signingInput), publicKey, signature);
    if (!valid) {
      throw new InvalidSignatureError();
    }
  } catch (err) {
    if (err instanceof InvalidSignatureError) throw err;
    // crypto errors (e.g. bad key format) → treat as invalid signature
    throw new InvalidSignatureError(`Signature verification error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Decode payload
  let payload: LicensePayload;
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(payloadJson) as LicensePayload;
  } catch {
    throw new LicenseValidationError('Failed to decode license payload', 'INVALID_PAYLOAD');
  }

  // Validate required fields
  if (!payload || typeof payload !== 'object') {
    throw new LicenseValidationError('Invalid license payload structure', 'INVALID_PAYLOAD');
  }

  // Verify issuer
  if (payload.iss !== EXPECTED_ISSUER) {
    throw new LicenseValidationError(
      `Invalid issuer: expected '${EXPECTED_ISSUER}', got '${payload.iss}'`,
      'INVALID_ISSUER',
    );
  }

  return payload;
}

/**
 * Validate and decode a license key with caching.
 *
 * - Returns cached result if within 60-minute TTL
 * - Throws `InvalidSignatureError` on bad crypto (HARD FAIL — caller should exit 1)
 * - Throws `LicenseValidationError` for other issues
 */
export function validateLicenseKeyCached(agkey: string): LicensePayload {
  // Return cache if still valid and key hasn't changed
  if (_cache && _cache.keyString === agkey && isCacheValid(_cache)) {
    return _cache.payload;
  }

  const payload = verifyLicenseKey(agkey);

  // Cache the result
  _cache = {
    keyString: agkey,
    payload,
    cachedAt: Date.now(),
  };

  return payload;
}

/**
 * Check whether a payload is expired.
 */
export function isExpired(payload: LicensePayload): boolean {
  return Date.now() > payload.exp * 1000;
}

/**
 * Build a LicenseContext from a validated payload.
 */
export function buildLicenseContext(
  payload: LicensePayload,
  source: 'key' | 'cache' = 'key',
): LicenseContext {
  return {
    valid: !isExpired(payload),
    tier: payload.tier,
    tenantId: payload.tid,
    features: new Set(payload.features),
    limits: { ...payload.limits },
    offlineGraceDays: payload.offlineGraceDays,
    expiresAt: new Date(payload.exp * 1000),
    source,
    validatedAt: new Date(),
  };
}

/**
 * Build a free-tier LicenseContext (no key or key degraded).
 */
export function buildFreeLicenseContext(tenantId = 'default'): LicenseContext {
  return {
    ...FREE_TIER_DEFAULTS,
    tenantId,
    features: new Set<string>(),
    validatedAt: new Date(),
  };
}

/**
 * Invalidate the in-memory cache (e.g., on SIGHUP).
 */
export function invalidateCache(): void {
  _cache = null;
}

/**
 * Returns whether cache is currently populated and valid.
 */
export function isCachePopulated(): boolean {
  return _cache !== null && isCacheValid(_cache);
}
