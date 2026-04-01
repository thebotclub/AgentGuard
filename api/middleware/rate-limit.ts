/**
 * AgentGuard — IP Rate Limiting Middleware
 *
 * Sliding-window rate limiter keyed by client IP.
 * Uses Redis sorted sets when REDIS_URL is set; falls back to in-memory.
 *
 * Buckets:
 *   authenticated        100 req/min  — general authenticated traffic
 *   unauthenticated       10 req/min  — anonymous traffic
 *   auth-endpoints        20 req/min  — login/signup/SSO/key management (stricter)
 *   scim                  30 req/min  — SCIM provisioning (separate bucket for IdP connectors)
 *
 * Brute-force protection:
 *   Tracks failed auth attempts per IP.
 *   Blocks after 5 failures in 15 min; 30 min cooldown.
 */
import { Request, Response, NextFunction } from 'express';
import {
  checkRateLimit,
  checkAuthEndpointRateLimit,
  checkScimRateLimit,
  checkBruteForce,
  recordBruteForce,
  clearBruteForce,
  checkSignupRateLimit,
  checkRecoveryRateLimit,
  type RateLimitResult,
} from '../lib/redis-rate-limiter.js';

// Re-export so existing consumers of this module don't break
export { recordBruteForce, clearBruteForce };

// ── Signup rate limiting (Redis-backed, falls back to in-memory) ──────────

export const SIGNUP_MAX = process.env['NODE_ENV'] === 'test' ? 100 : 5;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

/**
 * Check the signup rate limit for an IP. Returns true if allowed.
 * Uses Redis for cross-replica enforcement when available.
 */
export async function signupRateLimit(ip: string): Promise<boolean> {
  const result = await checkSignupRateLimit(ip);
  return result.allowed;
}

// ── Recovery rate limiting (Redis-backed, falls back to in-memory) ─────────

export const RECOVERY_MAX = process.env['NODE_ENV'] === 'test' ? 100 : 2;
export const RECOVERY_WINDOW_MS = 60 * 60 * 1000;

/**
 * Check the recovery rate limit for an IP. Returns true if allowed.
 * Uses Redis for cross-replica enforcement when available.
 */
export async function recoveryRateLimit(ip: string): Promise<boolean> {
  const result = await checkRecoveryRateLimit(ip);
  return result.allowed;
}

// ── Helper: extract client IP ──────────────────────────────────────────────

function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

// ── Global IP rate limiter middleware ──────────────────────────────────────

/**
 * Global IP rate limiter middleware.
 * Authenticated requests: 100 req/min. Unauthenticated: 10 req/min.
 * Uses Redis when available; gracefully falls back to in-memory.
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const hasAuth = !!req.headers['x-api-key'];

  checkRateLimit(ip, hasAuth)
    .then((result: RateLimitResult) => {
      // Unix timestamp (seconds) when the current rate-limit window resets
      const resetTimestamp = Math.ceil((Date.now() + 60_000) / 1000);
      res.setHeader('X-RateLimit-Limit', String(result.limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      res.setHeader('X-RateLimit-Reset', String(resetTimestamp));

      if (!result.allowed) {
        const retryAfter = result.retryAfter ?? 60;
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({
          error: 'rate_limit_exceeded',
          retryAfter,
          message: `Too many requests. Limit: ${result.limit} per minute. Retry after ${retryAfter} seconds.`,
          limit: result.limit,
          window: '1m',
          signup: {
            hint: 'Sign up for a free API key to get higher rate limits',
            method: 'POST',
            url: 'https://api.agentguard.tech/api/v1/signup',
            body: { name: 'Your Agent Name' },
          },
        });
        return;
      }
      next();
    })
    .catch(() => {
      // If rate limiter itself throws (should not happen, but safety net):
      // allow the request through to avoid cascading failures
      next();
    });
}

/**
 * Brute-force check middleware — call BEFORE auth middleware on login routes.
 * Blocks IPs that have exceeded the failed-attempt threshold (5 failures / 15 min).
 */
export function bruteForceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);

  checkBruteForce(ip)
    .then((result) => {
      if (result.blocked) {
        const retryAfter = result.retryAfter ?? 1800;
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({
          error: 'rate_limit_exceeded',
          retryAfter,
          message: 'Too many failed authentication attempts. Please try again later.',
          limit: 5,
          window: '15m',
          signup: {
            hint: 'Sign up for a free API key to get higher rate limits',
            method: 'POST',
            url: 'https://api.agentguard.tech/api/v1/signup',
            body: { name: 'Your Agent Name' },
          },
        });
        return;
      }
      next();
    })
    .catch(() => {
      // Degrade gracefully — allow request through if check fails
      next();
    });
}

/**
 * Stricter rate limiter for auth-sensitive endpoints (signup, SSO, key management).
 * Limit: 20 req/min per IP, regardless of auth state.
 */
export function authEndpointRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);

  checkAuthEndpointRateLimit(ip)
    .then((result: RateLimitResult) => {
      const resetTimestamp = Math.ceil((Date.now() + 60_000) / 1000);
      res.setHeader('X-RateLimit-Limit', String(result.limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      res.setHeader('X-RateLimit-Reset', String(resetTimestamp));

      if (!result.allowed) {
        const retryAfter = result.retryAfter ?? 60;
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({
          error: 'rate_limit_exceeded',
          retryAfter,
          message: `Auth endpoint rate limit exceeded. Limit: ${result.limit} per minute.`,
          limit: result.limit,
          window: '1m',
        });
        return;
      }
      next();
    })
    .catch(() => next());
}

/**
 * SCIM-specific rate limiter (separate bucket for IdP provisioning connectors).
 * Limit: 30 req/min per IP.
 */
export function scimRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);

  checkScimRateLimit(ip)
    .then((result: RateLimitResult) => {
      const resetTimestamp = Math.ceil((Date.now() + 60_000) / 1000);
      res.setHeader('X-RateLimit-Limit', String(result.limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      res.setHeader('X-RateLimit-Reset', String(resetTimestamp));

      if (!result.allowed) {
        const retryAfter = result.retryAfter ?? 60;
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({
          error: 'rate_limit_exceeded',
          retryAfter,
          message: `SCIM endpoint rate limit exceeded. Limit: ${result.limit} per minute.`,
          limit: result.limit,
          window: '1m',
        });
        return;
      }
      next();
    })
    .catch(() => next());
}
