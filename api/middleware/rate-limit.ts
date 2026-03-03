/**
 * AgentGuard — IP Rate Limiting Middleware
 *
 * Simple sliding-window rate limiter keyed by client IP.
 * Separate bucket for signup endpoints.
 */
import { Request, Response, NextFunction } from 'express';

const MAX_REQUESTS = 100;
const WINDOW_MS = 60 * 1000;

export const SIGNUP_MAX = process.env['NODE_ENV'] === 'test' ? 100 : 5;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitBucket>();
const signupRateLimitMap = new Map<string, RateLimitBucket>();

// Periodically clean up stale buckets
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateLimitMap) {
    if (now - bucket.windowStart > WINDOW_MS * 2) rateLimitMap.delete(ip);
  }
  for (const [ip, bucket] of signupRateLimitMap) {
    if (now - bucket.windowStart > SIGNUP_WINDOW_MS * 2) signupRateLimitMap.delete(ip);
  }
}, WINDOW_MS * 2);

/**
 * Global IP rate limiter middleware (100 req/min per IP).
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  const now = Date.now();
  const bucket = rateLimitMap.get(ip);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
    res.setHeader('X-RateLimit-Remaining', String(MAX_REQUESTS - 1));
    next();
    return;
  }

  bucket.count++;
  const remaining = Math.max(0, MAX_REQUESTS - bucket.count);
  res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  if (bucket.count > MAX_REQUESTS) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Too many requests. Limit: 100 per minute.' });
    return;
  }
  next();
}

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
