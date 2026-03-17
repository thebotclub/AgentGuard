/**
 * AgentGuard — CSRF Protection Middleware
 *
 * Validates Origin/Referer headers on state-changing requests (POST/PUT/DELETE/PATCH).
 *
 * Rules:
 *   1. API-key-authenticated requests (SDK calls) are exempt — no browser CSRF risk.
 *   2. Only enforced for JWT/cookie-authenticated requests (browser flows).
 *   3. Requests from allowed origins pass through.
 *   4. Requests with no Origin/Referer and no API key → rejected (double-submit safety).
 *
 * Allowed origins (always):
 *   - https://agentguard.dev
 *   - https://app.agentguard.dev
 *   - https://demo.agentguard.dev
 *   - http(s)://localhost (any port)
 *   - Additional origins via CORS_ORIGINS env var
 *
 * Registration: mount AFTER auth middleware so req.jwtAuthenticated is populated.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

// ── Allowed Origins ────────────────────────────────────────────────────────

const BASE_ALLOWED_ORIGINS = new Set([
  'https://agentguard.dev',
  'https://www.agentguard.dev',
  'https://app.agentguard.dev',
  'https://demo.agentguard.dev',
  'https://docs.agentguard.dev',
]);

/** Returns the full set of allowed origins including runtime config */
function getAllowedOrigins(): Set<string> {
  const origins = new Set(BASE_ALLOWED_ORIGINS);
  const extra = process.env['CORS_ORIGINS'];
  if (extra) {
    for (const o of extra.split(',').map((s) => s.trim()).filter(Boolean)) {
      origins.add(o);
    }
  }
  return origins;
}

/** Returns true if the origin is explicitly allowed or is a localhost variant */
function isAllowedOrigin(origin: string): boolean {
  if (getAllowedOrigins().has(origin)) return true;
  // Allow localhost on any port (http or https)
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  return false;
}

/** Extract origin string from Origin or Referer header */
function extractOrigin(req: Request): string | null {
  // Prefer Origin header (set by browsers on cross-origin requests)
  const originHeader = req.headers['origin'];
  if (originHeader) return originHeader.trim();

  // Fall back to Referer (set for same-origin requests in some browsers)
  const referer = req.headers['referer'];
  if (referer) {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch {
      // Malformed referer — treat as absent
    }
  }

  return null;
}

// ── State-Changing Methods ─────────────────────────────────────────────────

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// ── CSRF Middleware ────────────────────────────────────────────────────────

/**
 * CSRF protection middleware.
 *
 * Mount AFTER auth middleware so req.jwtAuthenticated is populated.
 * Only enforces on state-changing methods for browser (JWT) sessions.
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only check state-changing requests
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  // API-key requests are exempt: SDK/programmatic calls never come from browsers
  const hasApiKey = !!req.headers['x-api-key'];
  if (hasApiKey) {
    next();
    return;
  }

  // If not JWT-authenticated, no browser session to protect — let auth middleware handle it
  if (!req.jwtAuthenticated) {
    next();
    return;
  }

  // JWT-authenticated browser request: enforce Origin/Referer check
  const origin = extractOrigin(req);

  if (!origin) {
    // No origin header on a browser JWT request is suspicious — block it
    logger.warn({
      path: req.path,
      method: req.method,
      tenantId: req.tenantId,
    }, 'CSRF: state-changing request missing Origin/Referer');
    res.status(403).json({
      error: 'CSRF check failed: missing Origin header',
    });
    return;
  }

  if (!isAllowedOrigin(origin)) {
    logger.warn({
      origin,
      path: req.path,
      method: req.method,
      tenantId: req.tenantId,
    }, 'CSRF: blocked request from disallowed origin');
    res.status(403).json({
      error: 'CSRF check failed: origin not allowed',
    });
    return;
  }

  next();
}
