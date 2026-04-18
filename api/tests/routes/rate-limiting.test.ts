/**
 * Tests for Rate Limiting — Redis-backed sliding window + brute-force protection
 *
 * Covers:
 *   - In-memory rate limiting (no Redis required)
 *   - Authenticated vs unauthenticated limits (100 vs 10 req/min)
 *   - Auth endpoint limits (20 req/min)
 *   - SCIM endpoint limits (30 req/min)
 *   - Signup rate limits (5/hour)
 *   - Brute-force lockout after 5 failed attempts
 *   - Brute-force clearing on success
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Force in-memory mode (no Redis)
vi.stubEnv('REDIS_URL', '');

import {
  checkRateLimit,
  checkAuthEndpointRateLimit,
  checkScimRateLimit,
  checkSignupRateLimit,
  recordBruteForce,
  checkBruteForce,
  clearBruteForce,
} from '../../lib/redis-rate-limiter.js';

import {
  recordFailedAttempt,
  isBlocked,
  clearAttempts,
} from '../../lib/brute-force.js';

describe('checkRateLimit — in-memory fallback', () => {
  it('allows first request for unauthenticated IP', async () => {
    const result = await checkRateLimit('192.168.1.1', false);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // UNAUTH_LIMIT=10, first request = 9 remaining
    expect(result.limit).toBe(10);
  });

  it('allows first request for authenticated IP with higher limit', async () => {
    const result = await checkRateLimit('10.0.0.1', true);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99); // AUTH_LIMIT=100, first request = 99 remaining
    expect(result.limit).toBe(100);
  });

  it('separates buckets for auth vs unauth from same IP', async () => {
    // First request unauthenticated
    const unauth = await checkRateLimit('172.16.0.1', false);
    expect(unauth.remaining).toBe(9);

    // First request authenticated — separate bucket
    const auth = await checkRateLimit('172.16.0.1', true);
    expect(auth.remaining).toBe(99);
  });

  it('blocks after exceeding unauth limit (10 req/min)', async () => {
    const ip = '192.168.2.100';
    // Make 10 allowed requests
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(ip, false);
    }
    // 11th should be blocked
    const result = await checkRateLimit(ip, false);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('blocks after exceeding auth limit (100 req/min)', async () => {
    const ip = '10.0.0.200';
    for (let i = 0; i < 100; i++) {
      await checkRateLimit(ip, true);
    }
    const result = await checkRateLimit(ip, true);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe('checkAuthEndpointRateLimit', () => {
  it('applies stricter limit of 20 req/min', async () => {
    const ip = '10.1.1.1';
    const result = await checkAuthEndpointRateLimit(ip);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(20);
  });

  it('blocks after exceeding auth endpoint limit', async () => {
    const ip = '10.1.1.2';
    for (let i = 0; i < 20; i++) {
      await checkAuthEndpointRateLimit(ip);
    }
    const result = await checkAuthEndpointRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe('checkScimRateLimit', () => {
  it('applies SCIM-specific limit of 30 req/min', async () => {
    const ip = '10.2.2.1';
    const result = await checkScimRateLimit(ip);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(30);
  });

  it('blocks after exceeding SCIM limit', async () => {
    const ip = '10.2.2.2';
    for (let i = 0; i < 30; i++) {
      await checkScimRateLimit(ip);
    }
    const result = await checkScimRateLimit(ip);
    expect(result.allowed).toBe(false);
  });
});

describe('checkSignupRateLimit', () => {
  it('applies signup-specific limit (100/hour in test env)', async () => {
    const ip = '10.3.3.1';
    const result = await checkSignupRateLimit(ip);
    expect(result.allowed).toBe(true);
  });

  it('blocks after exceeding signup limit', async () => {
    const ip = '10.3.3.2';
    // SIGNUP_LIMIT is 100 in test env (set in rate-limiter source)
    for (let i = 0; i < 100; i++) {
      await checkSignupRateLimit(ip);
    }
    const result = await checkSignupRateLimit(ip);
    expect(result.allowed).toBe(false);
  });
});

describe('Brute-force protection', () => {
  const testIp = '192.168.100.1';

  beforeEach(() => {
    clearAttempts(testIp);
  });

  it('does not block IP with no failed attempts', () => {
    expect(isBlocked(testIp)).toBe(false);
  });

  it('blocks IP after 5 failed attempts', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(testIp);
    }
    expect(isBlocked(testIp)).toBe(true);
  });

  it('does not block after only 4 failed attempts', () => {
    for (let i = 0; i < 4; i++) {
      recordFailedAttempt(testIp);
    }
    expect(isBlocked(testIp)).toBe(false);
  });

  it('clearing attempts removes block', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(testIp);
    }
    expect(isBlocked(testIp)).toBe(true);
    clearAttempts(testIp);
    expect(isBlocked(testIp)).toBe(false);
  });

  it('recordBruteForce/clearBruteForce work with in-memory fallback', async () => {
    // These go through the rate-limiter module which falls back to brute-force.ts
    for (let i = 0; i < 5; i++) {
      await recordBruteForce(testIp);
    }
    const result = await checkBruteForce(testIp);
    expect(result.blocked).toBe(true);

    await clearBruteForce(testIp);
    const after = await checkBruteForce(testIp);
    expect(after.blocked).toBe(false);
  });
});
