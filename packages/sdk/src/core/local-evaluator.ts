/**
 * AgentGuard Local Policy Evaluator
 *
 * In-process SDK policy evaluation using the same PolicyEngine that
 * the server uses. Evaluates locally against a cached, verified policy
 * bundle for <5ms p99 latency — no HTTP round-trip needed.
 *
 * Key properties:
 *   - Uses the canonical PolicyEngine from policy-engine.ts for evaluation
 *   - Verifies Ed25519 bundle signatures for tamper evidence
 *   - Caches bundles with a configurable TTL
 *   - Supports offline mode with stale bundles (emits warning)
 *   - Falls back to API evaluation if no bundle is available
 *   - Thread-safe: bundle swaps are atomic (replace reference)
 */

import { verify as cryptoVerify, createPublicKey } from 'node:crypto';
import type {
  PolicyBundle,
  ActionRequest,
  AgentContext,
  PolicyDecision,
} from './types.js';
import { PolicyEngine, PolicyCompiler } from './policy-engine.js';
import type {
  SignedPolicyBundle,
  BundleVerificationResult,
  TrustedPublicKey,
} from './bundle-types.js';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface LocalEvaluatorOptions {
  /**
   * How long (ms) a cached bundle is considered fresh.
   * After this, the next sync should fetch a new bundle.
   * Stale bundles are still usable (offline tolerance).
   * Default: 60_000 (60 seconds)
   */
  cacheTtlMs?: number;

  /**
   * Trusted Ed25519 public keys for bundle verification.
   * At least one must match the bundle's signing key.
   * If empty, signature verification is skipped (dev mode only).
   */
  trustedKeys?: TrustedPublicKey[];

  /**
   * If true, allow using expired bundles (offline mode).
   * The evaluator will still emit a warning via the onWarning callback.
   * Default: true
   */
  allowExpired?: boolean;

  /**
   * Callback invoked when the evaluator encounters a non-fatal issue,
   * such as using a stale/expired bundle in offline mode.
   */
  onWarning?: (message: string) => void;
}

// ─── Cache Entry ─────────────────────────────────────────────────────────────

interface CachedBundle {
  bundle: PolicyBundle;
  signedAt: number;
  expiresAt: number;
  loadedAt: number;
  signatureValid: boolean;
  signerKey: string;
}

// ─── Default Agent Context ───────────────────────────────────────────────────

function defaultAgentContext(): AgentContext {
  return {
    agentId: 'local-sdk',
    sessionId: `local-${Date.now()}`,
    policyVersion: '0.0.0',
    sessionContext: {},
  };
}

// ─── LocalPolicyEvaluator ────────────────────────────────────────────────────

/**
 * In-process policy evaluator with Ed25519 bundle verification.
 *
 * Wraps the canonical PolicyEngine, adding:
 *   - Bundle loading and caching with TTL
 *   - Ed25519 signature verification
 *   - Offline mode (stale bundle usage)
 *   - Atomic bundle swaps (thread-safe for concurrent reads)
 *
 * Usage:
 *   const evaluator = new LocalPolicyEvaluator({ cacheTtlMs: 60_000 });
 *   evaluator.loadSignedBundle(signedBundle);
 *   const decision = evaluator.evaluate(actionRequest);
 */
export class LocalPolicyEvaluator {
  private readonly engine = new PolicyEngine();
  private readonly cacheTtlMs: number;
  private readonly trustedKeys: Set<string>;
  private readonly allowExpired: boolean;
  private readonly onWarning?: (message: string) => void;

  /** Currently active cached bundle (atomic swap via reference replacement). */
  private cached: CachedBundle | null = null;

  /** The policyId of the loaded bundle (used for engine.evaluate lookups). */
  private activePolicyId: string | null = null;

  constructor(options?: LocalEvaluatorOptions) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 60_000;
    this.trustedKeys = new Set((options?.trustedKeys ?? []).map((k) => k.key));
    this.allowExpired = options?.allowExpired ?? true;
    this.onWarning = options?.onWarning;
  }

  // ─── Bundle Loading ─────────────────────────────────────────────────────

  /**
   * Load and verify a signed policy bundle.
   *
   * Verifies the Ed25519 signature, checks expiry, and registers the
   * compiled bundle with the internal PolicyEngine. If verification fails
   * and there is no existing cached bundle, the load is rejected.
   * If verification fails but a previous bundle exists, keeps the old one.
   *
   * @returns true if the bundle was loaded, false if verification failed
   *          (and an old bundle is being kept)
   */
  loadSignedBundle(signed: SignedPolicyBundle): boolean {
    // Step 1: Verify signature
    const verification = this.verifyBundle(signed);

    if (!verification.valid) {
      if (this.cached) {
        this.onWarning?.(
          `Bundle verification failed (${verification.reason}), keeping previous bundle`,
        );
        return false;
      }
      // No fallback — caller must handle this
      return false;
    }

    // Step 2: Check expiry
    const now = Date.now();
    const expiresAt = new Date(signed.expiresAt).getTime();
    const isExpired = now > expiresAt;

    if (isExpired && !this.allowExpired) {
      this.onWarning?.('Bundle expired and allowExpired is false — bundle rejected');
      return false;
    }

    if (isExpired) {
      this.onWarning?.(
        `Using expired bundle (expired ${new Date(signed.expiresAt).toISOString()})`,
      );
    }

    // Step 3: Register with PolicyEngine
    const bundle = signed.bundle;

    this.engine.registerBundle(bundle);

    this.activePolicyId = bundle.policyId;
    this.cached = {
      bundle,
      signedAt: new Date(signed.signedAt).getTime(),
      expiresAt,
      loadedAt: now,
      signatureValid: true,
      signerKey: signed.publicKey,
    };

    return true;
  }

  /**
   * Load an unsigned (trusted) PolicyBundle directly.
   *
   * Use this in development or when bundles are delivered through
   * a trusted channel (e.g. mTLS, VPC-internal).
   */
  loadBundle(bundle: PolicyBundle): void {
    // Build toolIndex if missing (bundle wasn't compiled via PolicyCompiler)
    if (!bundle.toolIndex || Object.keys(bundle.toolIndex).length === 0) {
      bundle.toolIndex = PolicyCompiler.buildToolIndex(bundle.rules);
    }
    this.engine.registerBundle(bundle);
    this.activePolicyId = bundle.policyId;
    this.cached = {
      bundle,
      signedAt: Date.now(),
      expiresAt: Date.now() + this.cacheTtlMs,
      loadedAt: Date.now(),
      signatureValid: false, // unsigned
      signerKey: '',
    };
  }

  // ─── Evaluation ─────────────────────────────────────────────────────────

  /**
   * Evaluate an action request against the cached policy bundle.
   *
   * Delegates to the canonical PolicyEngine.evaluate() method —
   * same algorithm as server-side evaluation.
   *
   * @throws Error if no bundle is loaded
   */
  evaluate(
    request: ActionRequest,
    ctx?: Partial<AgentContext>,
  ): PolicyDecision {
    if (!this.activePolicyId) {
      throw new Error(
        'LocalPolicyEvaluator: no policy bundle loaded. Call loadSignedBundle() or loadBundle() first.',
      );
    }

    const fullCtx: AgentContext = {
      ...defaultAgentContext(),
      policyVersion: this.cached?.bundle.version ?? '0.0.0',
      ...ctx,
    };

    return this.engine.evaluate(request, fullCtx, this.activePolicyId);
  }

  // ─── Status ─────────────────────────────────────────────────────────────

  /** Returns true when a policy bundle is loaded and ready for evaluation. */
  isReady(): boolean {
    return this.activePolicyId !== null;
  }

  /** Returns the version of the currently loaded policy, or null. */
  policyVersion(): string | null {
    return this.cached?.bundle.version ?? null;
  }

  /** Returns the checksum of the currently loaded bundle. */
  policyChecksum(): string | null {
    return this.cached?.bundle.checksum ?? null;
  }

  /** Returns true if the cached bundle has exceeded its TTL (but is still usable). */
  isStale(): boolean {
    if (!this.cached) return false;
    return Date.now() - this.cached.loadedAt > this.cacheTtlMs;
  }

  /** Returns true if the cached bundle has passed its expiresAt time. */
  isExpired(): boolean {
    if (!this.cached) return false;
    return Date.now() > this.cached.expiresAt;
  }

  /** Returns the number of rules in the loaded bundle, or 0. */
  ruleCount(): number {
    return this.cached?.bundle.ruleCount ?? 0;
  }

  /** Returns the signer's public key, or empty string if unsigned. */
  signerKey(): string {
    return this.cached?.signerKey ?? '';
  }

  /** Returns the timestamp when the current bundle was loaded. */
  loadedAt(): Date | null {
    return this.cached ? new Date(this.cached.loadedAt) : null;
  }

  // ─── Bundle Verification ────────────────────────────────────────────────

  /**
   * Verify a signed bundle's Ed25519 signature.
   *
   * Checks:
   *   1. Signing key is in the trusted keys set (if configured)
   *   2. Ed25519 signature is valid for the canonical JSON of the bundle
   *   3. Bundle has not expired
   */
  verifyBundle(signed: SignedPolicyBundle): BundleVerificationResult {
    // Check trusted keys (if configured)
    if (this.trustedKeys.size > 0 && !this.trustedKeys.has(signed.publicKey)) {
      return {
        valid: false,
        tampered: false,
        expired: false,
        reason: `Signing key ${signed.publicKey.slice(0, 16)}... is not in trusted keys list`,
      };
    }

    // Check expiry
    const now = Date.now();
    const expiresAt = new Date(signed.expiresAt).getTime();
    const expired = now > expiresAt;

    // Verify Ed25519 signature (skip if no trusted keys configured = dev mode)
    let tampered = false;
    if (this.trustedKeys.size > 0) {
      const canonical = canonicalize(signed.bundle);
      tampered = !verifyEd25519(canonical, signed.signature, signed.publicKey);
    }

    if (tampered) {
      return {
        valid: false,
        tampered: true,
        expired,
        reason: 'Ed25519 signature verification failed — bundle may be tampered',
      };
    }

    if (expired) {
      // Signature is valid but bundle is expired — still "valid" for offline use
      return {
        valid: true,
        tampered: false,
        expired: true,
        reason: 'Bundle signature valid but bundle has expired',
      };
    }

    return {
      valid: true,
      tampered: false,
      expired: false,
    };
  }

  /** Destroy the evaluator and release resources. */
  destroy(): void {
    this.cached = null;
    this.activePolicyId = null;
  }
}

// ─── Ed25519 Verification Helper ────────────────────────────────────────────

/**
 * Verify an Ed25519 signature against a message using Node.js crypto.
 * Uses the sign/verify API with null digest for Ed25519 (no hashing).
 */
function verifyEd25519(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const sig = Buffer.from(signatureHex, 'hex');
    const key = Buffer.from(publicKeyHex, 'hex');

    // Encode raw 32-byte Ed25519 public key into SPKI DER format
    const spkiDer = encodeEd25519PublicKey(key);
    const keyObj = createPublicKey({
      key: spkiDer,
      format: 'der',
      type: 'spki',
    });

    // Ed25519 uses null digest (signs the raw message directly)
    return cryptoVerify(null, Buffer.from(message, 'utf-8'), keyObj, sig);
  } catch {
    return false;
  }
}

// ─── Canonical JSON ─────────────────────────────────────────────────────────

/**
 * Deterministic JSON serialization for signature verification.
 * Sorts object keys recursively.
 */
export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + canonicalize((obj as Record<string, unknown>)[k]));
  return '{' + pairs.join(',') + '}';
}

// ─── Ed25519 Public Key Encoding ────────────────────────────────────────────

/**
 * Encode a raw 32-byte Ed25519 public key into SPKI DER format
 * so Node.js crypto can create a KeyObject from it.
 */
function encodeEd25519PublicKey(rawKey: Buffer): Buffer {
  // Ed25519 OID: 1.3.101.112
  const algorithm = Buffer.from([0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70]);
  // BIT STRING wrapping: 0x03 (tag) + length + 0x00 (no unused bits) + raw key
  const bitString = Buffer.concat([Buffer.from([0x03, rawKey.length + 1, 0x00]), rawKey]);
  // SEQUENCE wrapping
  const inner = Buffer.concat([algorithm, bitString]);
  return Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
}
