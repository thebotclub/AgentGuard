/**
 * AgentGuard — IP Rate Limiting Middleware
 *
 * Sliding-window rate limiter keyed by client IP.
 * Uses Redis sorted sets when REDIS_URL is set; falls back to in-memory.
 *
 * Buckets:
 *   authenticated   100 req/min
 *   unauthenticated  10 req/min
 *
 * Brute-force protection:
 *   Tracks failed auth attempts per IP.
 *   Blocks after 10 failures in 15 min; 30 min cooldown.
 */
import { Request, Response, NextFunction } from 'express';
import {
  checkRateLimit,
  checkBruteForce,
  recordBruteForce,
  clearBruteForce,
  type RateLimitResult,
} from '../lib/redis-rate-limiter.js';

// Re-export so existing consumers of this module don't break
export { recordBruteForce, clearBruteForce };

// ── Signup rate limiting (kept in-memory — low volume, no need for Redis) ─

export const SIGNUP_MAX = process.env['NODE_ENV'] === 'test' ? 100 : 5;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

interface SignupBucket {
  count: number;
  windowStart: number;
}
const signupRateLimitMap = new Map<string, SignupBucket>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of signupRateLimitMap) {
    if (now - bucket.windowStart > SIGNUP_WINDOW_MS * 2) signupRateLimitMap.delete(ip);
  }
}, SIGNUP_WINDOW_MS * 2).unref();

/**
 * Check the signup rate limit for an IP. Returns true if allowed.
 */
export function signupRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = signupRateLimitMap.get(ip);
  if (!bucket || now - bucket.windowStart > SIGNUP_WINDOW_MS) {
    signupRateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  bucket.count++;
  return bucket.count <= SIGNUP_MAX;
}

// ── Recovery rate limiting (stricter: 2/hour per IP) ───────────────────────

export const RECOVERY_MAX = process.env['NODE_ENV'] === 'test' ? 100 : 2;
export const RECOVERY_WINDOW_MS = 60 * 60 * 1000;

interface RecoveryBucket {
  count: number;
  windowStart: number;
}
const recoveryRateLimitMap = new Map<string, RecoveryBucket>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of recoveryRateLimitMap) {
    if (now - bucket.windowStart > RECOVERY_WINDOW_MS * 2) recoveryRateLimitMap.delete(ip);
  }
}, RECOVERY_WINDOW_MS * 2).unref();

/**
 * Check the recovery rate limit for an IP. Returns true if allowed.
 */
export function recoveryRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = recoveryRateLimitMap.get(ip);
  if (!bucket || now - bucket.windowStart > RECOVERY_WINDOW_MS) {
    recoveryRateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  bucket.count++;
  return bucket.count <= RECOVERY_MAX;
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
      res.setHeader('X-RateLimit-Limit', String(result.limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));

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
            url: 'https://api.agentguard.dev/api/v1/signup',
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
 * Blocks IPs that have exceeded the failed-attempt threshold.
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
          limit: 10,
          window: '15m',
          signup: {
            hint: 'Sign up for a free API key to get higher rate limits',
            method: 'POST',
            url: 'https://api.agentguard.dev/api/v1/signup',
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
