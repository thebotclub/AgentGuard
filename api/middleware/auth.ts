/**
 * AgentGuard — Auth Middleware
 *
 * Provides requireTenantAuth, optionalTenantAuth, and requireAdminAuth
 * middleware factories bound to a database instance.
 */
import { Request, Response, NextFunction } from 'express';
import type { IDatabase, TenantRow, AgentRow } from '../db-interface.js';

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

async function lookupTenant(db: IDatabase, apiKey: string): Promise<TenantRow | null> {
  const keyRow = await db.getApiKey(apiKey);
  if (!keyRow) return null;
  await db.touchApiKey(apiKey);
  const tenant = await db.getTenant(keyRow.tenant_id);
  return tenant ?? null;
}

// ── Middleware Factory ─────────────────────────────────────────────────────

export interface AuthMiddleware {
  requireTenantAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  optionalTenantAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  requireAdminAuth: (req: Request, res: Response, next: NextFunction) => void;
}

export function createAuthMiddleware(db: IDatabase): AuthMiddleware {
  const ADMIN_KEY = process.env['ADMIN_KEY'];

  async function optionalTenantAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
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
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      res.status(401).json({ error: 'X-API-Key header required' });
      return;
    }
    if (apiKey.startsWith('ag_agent_')) {
      res.status(403).json({ error: 'Agent keys cannot perform tenant admin operations. Use your tenant API key.' });
      return;
    }
    const tenant = await lookupTenant(db, apiKey);
    if (!tenant) {
      res.status(401).json({ error: 'Invalid or inactive API key' });
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
    if (!provided || provided !== ADMIN_KEY) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  }

  return { requireTenantAuth, optionalTenantAuth, requireAdminAuth };
}
