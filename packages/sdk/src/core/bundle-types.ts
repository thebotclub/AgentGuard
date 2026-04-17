/**
 * AgentGuard Signed Policy Bundle Types
 *
 * Defines the wire format for tamper-evident policy bundles distributed
 * from the AgentGuard API to SDK instances for in-process evaluation.
 *
 * Ed25519 signature ensures bundle integrity — the SDK embeds the
 * server's public key and verifies every bundle before use.
 */

import type { PolicyBundle } from './types.js';

// ─── Bundle Format Version ──────────────────────────────────────────────────

/** Current signed bundle format version. */
export const BUNDLE_FORMAT_VERSION = '1.0.0' as const;

// ─── SignedPolicyBundle (wire format) ───────────────────────────────────────

/**
 * A PolicyBundle wrapped with Ed25519 signature and metadata.
 *
 * This is the shape returned by `GET /api/v1/bundles/latest`.
 * The SDK verifies the signature against an embedded public key before
 * loading the bundle into the local policy engine.
 */
export interface SignedPolicyBundle {
  /** Bundle format version (semver). Currently "1.0.0". */
  version: string;

  /** The compiled policy bundle payload. */
  bundle: PolicyBundle;

  /**
   * Ed25519 signature over the canonical JSON of `bundle`, hex-encoded.
   * Computed over `JSON.stringify(bundle)` with sorted keys.
   */
  signature: string;

  /**
   * Ed25519 public key that produced the signature, hex-encoded.
   * Used for verification. The SDK also validates this against a
   * list of trusted public keys.
   */
  publicKey: string;

  /** ISO 8601 timestamp when the bundle was signed. */
  signedAt: string;

  /**
   * ISO 8601 timestamp when the bundle expires.
   * After this time the bundle is considered stale but still usable
   * in offline mode (with a warning).
   */
  expiresAt: string;
}

// ─── BundleVerificationResult ────────────────────────────────────────────────

/**
 * Result of verifying a signed policy bundle's integrity.
 *
 * Each dimension is independent — a bundle can be expired but
 * have a valid signature, or have an invalid signature but not be expired.
 */
export interface BundleVerificationResult {
  /** True if the Ed25519 signature is valid for the bundle payload. */
  valid: boolean;

  /** True if the bundle payload was tampered with (signature mismatch). */
  tampered: boolean;

  /** True if the bundle has passed its expiresAt timestamp. */
  expired: boolean;

  /** Human-readable reason if verification failed. */
  reason?: string;
}

// ─── Bundle Verification Error ──────────────────────────────────────────────

/**
 * Error thrown when bundle verification fails.
 */
export class BundleVerificationError extends Error {
  public readonly result: BundleVerificationResult;

  constructor(result: BundleVerificationResult) {
    const parts: string[] = [];
    if (result.tampered) parts.push('signature invalid (bundle tampered)');
    if (result.expired) parts.push('bundle expired');
    super(`Bundle verification failed: ${parts.join(', ') || result.reason || 'unknown'}`);
    this.name = 'BundleVerificationError';
    this.result = result;
  }
}

// ─── Trusted Public Key ─────────────────────────────────────────────────────

/**
 * A trusted Ed25519 public key for bundle verification.
 * Bundles signed by untrusted keys are rejected.
 */
export interface TrustedPublicKey {
  /** Hex-encoded Ed25519 public key. */
  key: string;

  /** Optional human-readable label (e.g. "prod-key-2026-Q1"). */
  label?: string;

  /** ISO 8601 timestamp — key is not trusted before this time. */
  notBefore?: string;

  /** ISO 8601 timestamp — key is not trusted after this time (rotation). */
  notAfter?: string;
}
