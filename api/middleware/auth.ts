/**
 * AgentGuard — Auth Middleware
 *
 * Provides requireTenantAuth, optionalTenantAuth, and requireAdminAuth
 * middleware factories bound to a database instance.
 *
 * Auth strategy selection:
 *   Authorization: Bearer <token>  → JWT auth (dashboard/management API)
 *   x-api-key: <key>               → API key auth (agent SDK calls)
 *   Neither                        → 401
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { IDatabase, TenantRow, AgentRow } from '../db-interface.js';
import {
  extractBearerToken,
  verifyJwt,
} from './jwt-auth.js';

// ── Key verification helper ────────────────────────────────────────────────

function sha256Hex(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// ── Extend Express Request ─────────────────────────────────────────────────
// (module augmentation so the fields are always available on req)
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: TenantRow | null;
      tenantId?: string;
      agent?: AgentRow | null;
    }
  }
}

// ── Auth Helpers ───────────────────────────────────────────────────────────

// Dummy bcrypt hash used for constant-time comparison when key is not found.
// Pre-computed to avoid timing leak; cost factor 10 matches real key hashing.
// This ensures invalid keys take ~the same time as valid keys with a key_hash.
const DUMMY_BCRYPT_HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

async function lookupTenant(db: IDatabase, apiKey: string): Promise<TenantRow | null> {
  // Primary: SHA-256 lookup (fast, works for hashed keys)
  const sha256 = sha256Hex(apiKey);
  let keyRow = await db.getApiKeyBySha256(sha256);

  if (keyRow) {
    // Verify with bcrypt if key_hash is present; otherwise it's a legacy plaintext key
    if (keyRow.key_hash) {
      const valid = await bcrypt.compare(apiKey, keyRow.key_hash);
      if (!valid) return null;
    }
    // key_hash is null → legacy row with sha256 only (migration period), accept it
  } else {
    // Fallback: legacy plaintext lookup for keys that predate the migration
    keyRow = await db.getApiKey(apiKey);
    if (!keyRow) {
      // Perform a dummy bcrypt compare to normalize timing and prevent timing attacks.
      // An attacker cannot distinguish "key not found" from "key found but invalid"
      // because both paths now incur a bcrypt comparison cost.
      await bcrypt.compare(apiKey, DUMMY_BCRYPT_HASH);
      return null;
    }
  }

  await db.touchApiKey(apiKey);
  const tenant = await db.getTenant(keyRow.tenant_id);
  return tenant ?? null;
}

// ── Middleware Factory ─────────────────────────────────────────────────────

export interface AuthMiddleware {
  requireTenantAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  requireEvaluateAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  optionalTenantAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  requireAdminAuth: (req: Request, res: Response, next: NextFunction) => void;
}

export function createAuthMiddleware(db: IDatabase): AuthMiddleware {
  const ADMIN_KEY = process.env['ADMIN_KEY'];

  async function optionalTenantAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // Strategy 1: JWT Bearer token (optional — no error if verification fails or unset)
    const bearerToken = extractBearerToken(req);
    if (bearerToken) {
      const jwksUrl = process.env['JWT_JWKS_URL'];
      if (jwksUrl) {
        const result = await verifyJwt(bearerToken, jwksUrl);
        if (result.ok) {
          req.jwtClaims = result.claims;
          req.jwtAuthenticated = true;
          req.tenantId = result.tenantId;
          req.tenant = null;
          req.agent = null;
          next();
          return;
        }
      }
      // Invalid/unconfigured JWT in optional mode → fall through to unauthenticated
      req.tenant = null;
      req.tenantId = 'demo';
      req.agent = null;
      next();
      return;
    }

    // Strategy 2: API key
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (apiKey && apiKey.startsWith('ag_agent_')) {
      const agentRow = await db.getAgentByKey(apiKey);
      if (agentRow) {
        const tenant = await db.getTenant(agentRow.tenant_id);
        req.agent = agentRow;
        req.tenant = tenant ?? null;
        req.tenantId = agentRow.tenant_id;
      } else {
        req.agent = null;
        req.tenant = null;
        req.tenantId = 'demo';
      }
    } else if (apiKey) {
      const tenant = await lookupTenant(db, apiKey);
      req.tenant = tenant;
      req.tenantId = tenant?.id ?? 'demo';
      req.agent = null;
    } else {
      req.tenant = null;
      req.tenantId = 'demo';
      req.agent = null;
    }
    next();
  }

  async function requireTenantAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Strategy 1: JWT Bearer token (dashboard/management API — human users)
    const bearerToken = extractBearerToken(req);
    if (bearerToken) {
      const jwksUrl = process.env['JWT_JWKS_URL'];
      if (!jwksUrl) {
        res.status(503).json({ error: 'JWT authentication not configured (JWT_JWKS_URL not set)' });
        return;
      }
      const result = await verifyJwt(bearerToken, jwksUrl);
      if (!result.ok) {
        res.status(result.status).json({ error: result.message });
        return;
      }
      req.jwtClaims = result.claims;
      req.jwtAuthenticated = true;
      req.tenantId = result.tenantId;
      req.tenant = null; // JWT users don't have a DB tenant row (yet)
      req.agent = null;
      next();
      return;
    }

    // Strategy 2: API key (agent SDK calls)
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required. Provide X-API-Key or Authorization: Bearer <token>',
        acceptedAuth: [
          'Header: X-API-Key: ag_<key>',
          'Header: Authorization: Bearer <jwt>',
        ],
        docs: 'https://agentguard.tech/docs/authentication',
      });
      return;
    }
    if (apiKey.startsWith('ag_agent_')) {
      res.status(403).json({ error: 'Agent keys cannot perform tenant admin operations. Use your tenant API key.' });
      return;
    }
    const tenant = await lookupTenant(db, apiKey);
    if (!tenant) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid or inactive API key',
        acceptedAuth: [
          'Header: X-API-Key: ag_<key>',
          'Header: Authorization: Bearer <jwt>',
        ],
        docs: 'https://agentguard.tech/docs/authentication',
      });
      return;
    }
    req.tenant = tenant;
    req.tenantId = tenant.id;
    req.agent = null;
    next();
  }

  /**
   * Like requireTenantAuth but also accepts scoped agent keys (ag_agent_*).
   * Used by POST /api/v1/evaluate and POST /api/v1/mcp/evaluate so agents can
   * call the evaluation endpoints with their own scoped keys.
   * Also accepts JWT Bearer tokens.
   */
  async function requireEvaluateAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Strategy 1: JWT Bearer token
    const bearerToken = extractBearerToken(req);
    if (bearerToken) {
      const jwksUrl = process.env['JWT_JWKS_URL'];
      if (!jwksUrl) {
        res.status(503).json({ error: 'JWT authentication not configured (JWT_JWKS_URL not set)' });
        return;
      }
      const result = await verifyJwt(bearerToken, jwksUrl);
      if (!result.ok) {
        res.status(result.status).json({ error: result.message });
        return;
      }
      req.jwtClaims = result.claims;
      req.jwtAuthenticated = true;
      req.tenantId = result.tenantId;
      req.tenant = null;
      req.agent = null;
      next();
      return;
    }

    // Strategy 2: API key (including agent keys)
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required. Provide X-API-Key or Authorization: Bearer <token>',
        acceptedAuth: [
          'Header: X-API-Key: ag_<key>',
          'Header: X-API-Key: ag_agent_<key>',
          'Header: Authorization: Bearer <jwt>',
        ],
        docs: 'https://agentguard.tech/docs/authentication',
      });
      return;
    }
    if (apiKey.startsWith('ag_agent_')) {
      const agentRow = await db.getAgentByKey(apiKey);
      if (!agentRow) {
        res.status(401).json({
          error: 'unauthorized',
          message: 'Invalid or inactive agent key',
          acceptedAuth: [
            'Header: X-API-Key: ag_<key>',
            'Header: X-API-Key: ag_agent_<key>',
            'Header: Authorization: Bearer <jwt>',
          ],
          docs: 'https://agentguard.tech/docs/authentication',
        });
        return;
      }
      const tenant = await db.getTenant(agentRow.tenant_id);
      req.agent = agentRow;
      req.tenant = tenant ?? null;
      req.tenantId = agentRow.tenant_id;
      next();
      return;
    }
    const tenant = await lookupTenant(db, apiKey);
    if (!tenant) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid or inactive API key',
        acceptedAuth: [
          'Header: X-API-Key: ag_<key>',
          'Header: X-API-Key: ag_agent_<key>',
          'Header: Authorization: Bearer <jwt>',
        ],
        docs: 'https://agentguard.tech/docs/authentication',
      });
      return;
    }
    req.tenant = tenant;
    req.tenantId = tenant.id;
    req.agent = null;
    next();
  }

  function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
    if (!ADMIN_KEY) {
      res.status(503).json({ error: 'Admin key not configured' });
      return;
    }
    const provided = req.headers['x-api-key'] as string | undefined;
    const provBuf = Buffer.from(provided || '');
    const adminBuf = Buffer.from(ADMIN_KEY);
    if (!provided || provBuf.length !== adminBuf.length || !crypto.timingSafeEqual(provBuf, adminBuf)) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Valid admin API key required',
        acceptedAuth: ['Header: X-API-Key: <admin-key>'],
        docs: 'https://agentguard.tech/docs/authentication#admin',
      });
      return;
    }
    next();
  }

  return { requireTenantAuth, requireEvaluateAuth, optionalTenantAuth, requireAdminAuth };
}
