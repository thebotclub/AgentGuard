/**
 * Tests for LocalPolicyEvaluator — in-process SDK policy evaluation
 * with Ed25519 bundle verification and caching.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sign, createPrivateKey, createPublicKey } from 'node:crypto';
import { LocalPolicyEvaluator, canonicalize } from '../core/local-evaluator.js';
import type { SignedPolicyBundle } from '../core/bundle-types.js';
import type { PolicyBundle, ActionRequest } from '../core/types.js';

// ─── Test Key Pair ───────────────────────────────────────────────────────────

const RAW_PRIVATE_KEY = '9f73358dd0b1b1428c8aa183121dcb6cd7c4c824d5d6ce0f34291cddd482a8d0';
const RAW_PUBLIC_KEY = 'f9e3288a50e2f1737acbeac106bcfb498295af8d9bd5903b9b9988ff1e629da0';

// Second key pair for untrusted key tests
const UNTRUSTED_PUBLIC_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function makePrivateKey() {
  const rawPriv = Buffer.from(RAW_PRIVATE_KEY, 'hex');
  const rawPub = Buffer.from(RAW_PUBLIC_KEY, 'hex');
  const pkcs8Prefix = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const pkcs8Der = Buffer.concat([pkcs8Prefix, rawPriv, rawPub]);
  return createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
}

function signBundle(bundle: PolicyBundle): string {
  const message = canonicalize(bundle);
  return sign(null, Buffer.from(message, 'utf-8'), makePrivateKey()).toString('hex');
}

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeBundle(overrides?: Partial<PolicyBundle>): PolicyBundle {
  return {
    policyId: 'test-policy',
    version: '1.0.0',
    compiledAt: new Date().toISOString(),
    defaultAction: 'allow',
    rules: [],
    toolIndex: {},
    checksum: 'abc123',
    ruleCount: 0,
    ...overrides,
  };
}

function makeSignedBundle(overrides?: Partial<SignedPolicyBundle>): SignedPolicyBundle {
  const bundle = overrides?.bundle ?? makeBundle();
  const expiresAt = new Date(Date.now() + 3600_000).toISOString(); // 1 hour from now
  return {
    version: '1.0.0',
    bundle,
    signature: signBundle(bundle),
    publicKey: RAW_PUBLIC_KEY,
    signedAt: new Date().toISOString(),
    expiresAt,
    ...overrides,
  };
}

function makeActionRequest(overrides?: Partial<ActionRequest>): ActionRequest {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    agentId: 'test-agent',
    tool: 'send_email',
    params: { to: 'user@example.com' },
    inputDataLabels: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeBundleWithRules(): PolicyBundle {
  const rules = [
    {
      id: 'allow-read',
      priority: 100,
      action: 'allow' as const,
      toolCondition: { in: ['file_read'] },
      paramConditions: [],
      contextConditions: [],
      dataClassConditions: [],
      timeConditions: [],
      compositeConditions: [],
      severity: 'low',
      riskBoost: 0,
      tags: [],
    },
    {
      id: 'block-email',
      priority: 50,
      action: 'block' as const,
      toolCondition: { in: ['send_email'] },
      paramConditions: [],
      contextConditions: [],
      dataClassConditions: [],
      timeConditions: [],
      compositeConditions: [],
      severity: 'high',
      riskBoost: 100,
      tags: ['email'],
    },
    {
      id: 'monitor-all',
      priority: 200,
      action: 'monitor' as const,
      toolCondition: { in: ['send_email', 'file_read'] },
      paramConditions: [],
      contextConditions: [],
      dataClassConditions: [],
      timeConditions: [],
      compositeConditions: [],
      severity: 'medium',
      riskBoost: 10,
      tags: ['audit'],
    },
  ];

  return {
    policyId: 'rules-policy',
    version: '2.0.0',
    compiledAt: new Date().toISOString(),
    defaultAction: 'block',
    rules,
    toolIndex: {
      'file_read': [0, 2],
      'send_email': [1, 2],
      '__no_tool__': [],
    },
    checksum: 'def456',
    ruleCount: 3,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LocalPolicyEvaluator', () => {
  describe('bundle loading and caching', () => {
    it('loads an unsigned bundle via loadBundle()', () => {
      const evaluator = new LocalPolicyEvaluator();
      const bundle = makeBundle();

      expect(evaluator.isReady()).toBe(false);
      evaluator.loadBundle(bundle);
      expect(evaluator.isReady()).toBe(true);
      expect(evaluator.policyVersion()).toBe('1.0.0');
      expect(evaluator.policyChecksum()).toBe('abc123');
      expect(evaluator.ruleCount()).toBe(0);
    });

    it('loads a signed bundle via loadSignedBundle() with trusted keys', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
      });
      const signed = makeSignedBundle();

      const loaded = evaluator.loadSignedBundle(signed);
      expect(loaded).toBe(true);
      expect(evaluator.isReady()).toBe(true);
      expect(evaluator.policyVersion()).toBe('1.0.0');
      expect(evaluator.signerKey()).toBe(RAW_PUBLIC_KEY);
    });

    it('rejects a signed bundle from an untrusted key', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
      });
      const signed = makeSignedBundle({
        publicKey: UNTRUSTED_PUBLIC_KEY,
        signature: '00'.repeat(64),
      });

      const loaded = evaluator.loadSignedBundle(signed);
      expect(loaded).toBe(false);
      expect(evaluator.isReady()).toBe(false);
    });

    it('accepts any signed bundle when no trusted keys configured (dev mode)', () => {
      const evaluator = new LocalPolicyEvaluator();
      const signed = makeSignedBundle({
        publicKey: UNTRUSTED_PUBLIC_KEY,
        signature: '00'.repeat(64), // won't be checked
      });

      const loaded = evaluator.loadSignedBundle(signed);
      expect(loaded).toBe(true);
      expect(evaluator.isReady()).toBe(true);
    });

    it('replaces previous bundle on reload', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
      });

      const bundle1 = makeBundle({ version: '1.0.0', policyId: 'policy-v1' });
      evaluator.loadSignedBundle(makeSignedBundle({ bundle: bundle1 }));
      expect(evaluator.policyVersion()).toBe('1.0.0');

      const bundle2 = makeBundle({ version: '2.0.0', policyId: 'policy-v2' });
      evaluator.loadSignedBundle(makeSignedBundle({ bundle: bundle2 }));
      expect(evaluator.policyVersion()).toBe('2.0.0');
    });

    it('keeps previous bundle when new bundle verification fails', () => {
      const warnings: string[] = [];
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
        onWarning: (msg) => warnings.push(msg),
      });

      // Load a valid bundle first
      const validBundle = makeBundle({ version: '1.0.0' });
      evaluator.loadSignedBundle(makeSignedBundle({ bundle: validBundle }));
      expect(evaluator.policyVersion()).toBe('1.0.0');

      // Try to load invalid bundle (wrong signature)
      const invalidBundle = makeBundle({ version: '2.0.0' });
      const loaded = evaluator.loadSignedBundle(makeSignedBundle({
        bundle: invalidBundle,
        signature: 'ff'.repeat(64), // invalid signature
      }));
      expect(loaded).toBe(false);
      expect(evaluator.policyVersion()).toBe('1.0.0'); // still old version
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('signature verification', () => {
    it('verifies a valid Ed25519 signature', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
      });
      const signed = makeSignedBundle();
      const result = evaluator.verifyBundle(signed);

      expect(result.valid).toBe(true);
      expect(result.tampered).toBe(false);
      expect(result.expired).toBe(false);
    });

    it('detects a tampered bundle (modified payload)', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
      });
      const signed = makeSignedBundle();

      // Tamper with the bundle after signing
      const tampered = {
        ...signed,
        bundle: { ...signed.bundle, version: 'tampered-3.0.0' },
      };

      const result = evaluator.verifyBundle(tampered);
      expect(result.valid).toBe(false);
      expect(result.tampered).toBe(true);
    });

    it('detects an expired bundle', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
      });
      const signed = makeSignedBundle({
        expiresAt: new Date(Date.now() - 3600_000).toISOString(), // 1 hour ago
      });

      const result = evaluator.verifyBundle(signed);
      expect(result.expired).toBe(true);
      expect(result.valid).toBe(true); // signature is still valid
      expect(result.reason).toContain('expired');
    });

    it('rejects untrusted signing key', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
      });
      const signed = makeSignedBundle({
        publicKey: UNTRUSTED_PUBLIC_KEY,
        signature: '00'.repeat(64),
      });

      const result = evaluator.verifyBundle(signed);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not in trusted keys');
    });
  });

  describe('local evaluation', () => {
    it('evaluates an allow action locally using PolicyEngine', () => {
      const evaluator = new LocalPolicyEvaluator();
      const bundle = makeBundleWithRules();
      evaluator.loadBundle(bundle);

      const request = makeActionRequest({ tool: 'file_read' });
      const decision = evaluator.evaluate(request);

      expect(decision.result).toBe('allow');
      expect(decision.matchedRuleId).toBe('allow-read');
      expect(decision.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('evaluates a block action locally', () => {
      const evaluator = new LocalPolicyEvaluator();
      evaluator.loadBundle(makeBundleWithRules());

      const request = makeActionRequest({ tool: 'send_email' });
      const decision = evaluator.evaluate(request);

      // block-email has priority 50, monitor-all has priority 200
      // block takes precedence
      expect(decision.result).toBe('block');
      expect(decision.matchedRuleId).toBe('block-email');
    });

    it('evaluates default action for unknown tool', () => {
      const evaluator = new LocalPolicyEvaluator();
      evaluator.loadBundle(makeBundleWithRules()); // defaultAction = 'block'

      const request = makeActionRequest({ tool: 'unknown_tool' });
      const decision = evaluator.evaluate(request);

      expect(decision.result).toBe('block');
      expect(decision.matchedRuleId).toBeNull();
    });

    it('includes monitor rules in evaluation', () => {
      const evaluator = new LocalPolicyEvaluator();
      evaluator.loadBundle(makeBundleWithRules());

      const request = makeActionRequest({ tool: 'file_read' });
      const decision = evaluator.evaluate(request);

      // allow-read + monitor-all both match
      expect(decision.result).toBe('allow');
      expect(decision.monitorRuleIds).toContain('monitor-all');
    });

    it('throws when no bundle is loaded', () => {
      const evaluator = new LocalPolicyEvaluator();
      const request = makeActionRequest();

      expect(() => evaluator.evaluate(request)).toThrow('no policy bundle loaded');
    });

    it('evaluates with provided AgentContext', () => {
      const evaluator = new LocalPolicyEvaluator();
      evaluator.loadBundle(makeBundleWithRules());

      const request = makeActionRequest({ tool: 'file_read' });
      const decision = evaluator.evaluate(request, {
        agentId: 'my-agent',
        sessionId: 'session-123',
      });

      expect(decision.result).toBe('allow');
      expect(decision.policyVersion).toBe('2.0.0');
    });

    it('evaluation completes in <5ms', () => {
      const evaluator = new LocalPolicyEvaluator();
      evaluator.loadBundle(makeBundleWithRules());

      const request = makeActionRequest({ tool: 'file_read' });
      const decision = evaluator.evaluate(request);

      expect(decision.durationMs).toBeLessThan(5);
    });
  });

  describe('fallback behavior', () => {
    it('falls back to unsigned loadBundle when signed load fails and no prior bundle', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
      });

      // Try to load a bad signed bundle — should fail
      const bad = makeSignedBundle({ signature: 'ff'.repeat(64) });
      expect(evaluator.loadSignedBundle(bad)).toBe(false);
      expect(evaluator.isReady()).toBe(false);

      // Fall back to unsigned load
      evaluator.loadBundle(makeBundle());
      expect(evaluator.isReady()).toBe(true);
    });
  });

  describe('cache expiration', () => {
    it('reports stale when TTL exceeded', () => {
      const evaluator = new LocalPolicyEvaluator({ cacheTtlMs: 1 });
      evaluator.loadBundle(makeBundle());

      // Wait a tiny bit for TTL to pass
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(evaluator.isStale()).toBe(true);
          resolve();
        }, 10);
      });
    });

    it('reports not stale within TTL', () => {
      const evaluator = new LocalPolicyEvaluator({ cacheTtlMs: 60_000 });
      evaluator.loadBundle(makeBundle());
      expect(evaluator.isStale()).toBe(false);
    });

    it('reports expired when past expiresAt', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
        allowExpired: true,
      });

      const bundle = makeBundle();
      const signed = makeSignedBundle({
        bundle,
        expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
      });

      evaluator.loadSignedBundle(signed);
      expect(evaluator.isExpired()).toBe(true);
    });

    it('rejects expired bundle when allowExpired is false', () => {
      const warnings: string[] = [];
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
        allowExpired: false,
        onWarning: (msg) => warnings.push(msg),
      });

      const bundle = makeBundle();
      const signed = makeSignedBundle({
        bundle,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });

      const loaded = evaluator.loadSignedBundle(signed);
      expect(loaded).toBe(false);
      expect(warnings).toHaveLength(1);
    });
  });

  describe('destroy', () => {
    it('clears all state on destroy', () => {
      const evaluator = new LocalPolicyEvaluator();
      evaluator.loadBundle(makeBundle());
      expect(evaluator.isReady()).toBe(true);

      evaluator.destroy();
      expect(evaluator.isReady()).toBe(false);
      expect(evaluator.policyVersion()).toBeNull();
      expect(evaluator.policyChecksum()).toBeNull();
    });
  });

  describe('canonicalize', () => {
    it('produces deterministic JSON with sorted keys', () => {
      const obj = { b: 2, a: 1, c: { z: 3, y: 2 } };
      const result = canonicalize(obj);
      expect(result).toBe('{"a":1,"b":2,"c":{"y":2,"z":3}}');
    });

    it('handles arrays', () => {
      expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    });

    it('handles null and primitives', () => {
      expect(canonicalize(null)).toBe('null');
      expect(canonicalize('hello')).toBe('"hello"');
      expect(canonicalize(42)).toBe('42');
      expect(canonicalize(true)).toBe('true');
    });
  });

  describe('integration: signed bundle → evaluate', () => {
    it('full flow: sign bundle → load → evaluate → block', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
      });

      const bundle = makeBundleWithRules();
      const signed = makeSignedBundle({ bundle });

      const loaded = evaluator.loadSignedBundle(signed);
      expect(loaded).toBe(true);

      const request = makeActionRequest({ tool: 'send_email' });
      const decision = evaluator.evaluate(request);

      expect(decision.result).toBe('block');
      expect(decision.matchedRuleId).toBe('block-email');
      expect(decision.durationMs).toBeLessThan(5);
    });

    it('full flow: sign bundle → load → evaluate → allow with monitors', () => {
      const evaluator = new LocalPolicyEvaluator({
        trustedKeys: [{ key: RAW_PUBLIC_KEY }],
      });

      const bundle = makeBundleWithRules();
      const signed = makeSignedBundle({ bundle });
      evaluator.loadSignedBundle(signed);

      const request = makeActionRequest({ tool: 'file_read' });
      const decision = evaluator.evaluate(request);

      expect(decision.result).toBe('allow');
      expect(decision.matchedRuleId).toBe('allow-read');
      expect(decision.monitorRuleIds).toContain('monitor-all');
    });
  });
});
