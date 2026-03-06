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
        if (result.retryAfter) {
          res.setHeader('Retry-After', String(result.retryAfter));
        }
        res
          .status(429)
          .json({ error: `Too many requests. Limit: ${result.limit} per minute.` });
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
        if (result.retryAfter) {
          res.setHeader('Retry-After', String(result.retryAfter));
        }
        res.status(429).json({
          error: 'Too many failed authentication attempts. Please try again later.',
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
