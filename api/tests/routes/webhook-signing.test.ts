/**
 * Tests for api/lib/webhook-signing.ts — HMAC Webhook Signing
 *
 * Covers:
 *  - generateSignature: deterministic HMAC-SHA256 with timestamp.payload input
 *  - signWebhookPayload: header format (t=<ms>,v1=<hex>) and unsigned case
 *  - verifyWebhookSignature: valid, tampered, stale, and malformed signatures
 *  - generateWebhookSecret: length and uniqueness
 */
import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import {
  generateSignature,
  signWebhookPayload,
  verifyWebhookSignature,
  generateWebhookSecret,
} from '../../lib/webhook-signing.js';

describe('generateSignature', () => {
  it('produces a hex HMAC-SHA256 of "<timestamp>.<payload>"', () => {
    const payload = '{"event":"test"}';
    const secret = 'my-webhook-secret';
    const timestamp = 1_710_000_000_000;

    const sig = generateSignature(payload, secret, timestamp);

    // Manually compute expected value
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    expect(sig).toBe(expected);
  });

  it('is deterministic — same inputs always produce the same signature', () => {
    const payload = '{"ok":true}';
    const secret = 'fixed-secret';
    const ts = 1234567890;

    const a = generateSignature(payload, secret, ts);
    const b = generateSignature(payload, secret, ts);

    expect(a).toBe(b);
  });

  it('changes when the payload changes', () => {
    const secret = 'secret';
    const ts = 999;

    const sig1 = generateSignature('{"a":1}', secret, ts);
    const sig2 = generateSignature('{"a":2}', secret, ts);

    expect(sig1).not.toBe(sig2);
  });

  it('changes when the secret changes', () => {
    const payload = '{"x":1}';
    const ts = 999;

    const sig1 = generateSignature(payload, 'secret-a', ts);
    const sig2 = generateSignature(payload, 'secret-b', ts);

    expect(sig1).not.toBe(sig2);
  });
});

describe('signWebhookPayload', () => {
  it('returns a JSON-serialised payload string', () => {
    const { payload } = signWebhookPayload({ foo: 'bar' }, 'secret');

    expect(payload).toBe('{"foo":"bar"}');
  });

  it('includes X-AgentGuard-Signature header with t=<ts>,v1=<sig> format', () => {
    const secret = 'test-secret';
    const { payload, headers } = signWebhookPayload({ action: 'block' }, secret);

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers).toHaveProperty('X-AgentGuard-Signature');

    const sigHeader = headers['X-AgentGuard-Signature']!;
    const match = sigHeader.match(/^t=(\d+),v1=([0-9a-f]+)$/);
    expect(match).not.toBeNull();

    const timestamp = Number(match![1]);
    const signature = match![2];

    // Verify the embedded signature matches what generateSignature would produce
    const expected = generateSignature(payload, secret, timestamp);
    expect(signature).toBe(expected);
  });

  it('omits signature header when secret is null', () => {
    const { headers } = signWebhookPayload({ data: 1 }, null);

    expect(headers).not.toHaveProperty('X-AgentGuard-Signature');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('omits signature header when secret is undefined', () => {
    const { headers } = signWebhookPayload({ data: 1 }, undefined);

    expect(headers).not.toHaveProperty('X-AgentGuard-Signature');
  });

  it('uses a fresh timestamp close to Date.now()', () => {
    const before = Date.now();
    const { headers } = signWebhookPayload({ x: 1 }, 'secret');
    const after = Date.now();

    const ts = Number(headers['X-AgentGuard-Signature']!.split(',')[0]!.replace('t=', ''));

    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('verifyWebhookSignature', () => {
  const secret = 'verification-secret';

  it('returns true for a valid signature', () => {
    const { payload, headers } = signWebhookPayload({ event: 'test' }, secret);

    const result = verifyWebhookSignature(
      headers['X-AgentGuard-Signature']!,
      payload,
      secret,
    );

    expect(result).toBe(true);
  });

  it('returns false for a tampered payload', () => {
    const { headers } = signWebhookPayload({ amount: 100 }, secret);

    const result = verifyWebhookSignature(
      headers['X-AgentGuard-Signature']!,
      '{"amount":999}',
      secret,
    );

    expect(result).toBe(false);
  });

  it('returns false for a wrong secret', () => {
    const { payload, headers } = signWebhookPayload({ data: 1 }, secret);

    const result = verifyWebhookSignature(
      headers['X-AgentGuard-Signature']!,
      payload,
      'wrong-secret',
    );

    expect(result).toBe(false);
  });

  it('returns false for a stale timestamp (outside tolerance)', () => {
    const oldTimestamp = Date.now() - 600_000; // 10 minutes ago
    const body = '{"event":"old"}';
    const sig = generateSignature(body, secret, oldTimestamp);
    const header = `t=${oldTimestamp},v1=${sig}`;

    const result = verifyWebhookSignature(header, body, secret, 300_000); // 5 min tolerance

    expect(result).toBe(false);
  });

  it('returns true for a timestamp within tolerance', () => {
    const recentTimestamp = Date.now() - 60_000; // 1 minute ago
    const body = '{"event":"recent"}';
    const sig = generateSignature(body, secret, recentTimestamp);
    const header = `t=${recentTimestamp},v1=${sig}`;

    const result = verifyWebhookSignature(header, body, secret, 300_000);

    expect(result).toBe(true);
  });

  it('returns false for a malformed header (missing v1)', () => {
    const result = verifyWebhookSignature('t=1234567890', '{}', secret);

    expect(result).toBe(false);
  });

  it('returns false for a malformed header (missing t)', () => {
    const result = verifyWebhookSignature('v1=abcdef', '{}', secret);

    expect(result).toBe(false);
  });

  it('returns false for an empty header', () => {
    const result = verifyWebhookSignature('', '{}', secret);

    expect(result).toBe(false);
  });

  it('returns false for a completely wrong signature value', () => {
    const ts = Date.now();
    const header = `t=${ts},v1=0000000000000000000000000000000000000000000000000000000000000000`;

    const result = verifyWebhookSignature(header, '{"a":1}', secret);

    expect(result).toBe(false);
  });
});

describe('generateWebhookSecret', () => {
  it('produces a 64-character hex string', () => {
    const secret = generateWebhookSecret();

    expect(secret).toHaveLength(64);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique values on each call', () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();

    expect(a).not.toBe(b);
  });
});

describe('end-to-end: sign then verify', () => {
  it('round-trips successfully for a complex payload', () => {
    const secret = 'e2e-secret-key';
    const payload = {
      event: 'agent.blocked',
      tenantId: 'tenant-abc',
      data: { tool: 'bash', riskScore: 0.95, reason: 'Dangerous command' },
      timestamp: new Date().toISOString(),
    };

    const { payload: body, headers } = signWebhookPayload(payload, secret);

    const valid = verifyWebhookSignature(
      headers['X-AgentGuard-Signature']!,
      body,
      secret,
    );

    expect(valid).toBe(true);

    // Also confirm the body round-trips through JSON.parse
    expect(JSON.parse(body)).toEqual(payload);
  });
});
