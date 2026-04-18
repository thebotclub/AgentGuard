/**
 * AgentGuard — SCIM 2.0 Helpers
 *
 * Shared constants, formatters, auth middleware, and audit helper
 * used by SCIM Users and Groups route modules.
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import type { IDatabase, ScimUserRow, ScimGroupRow } from '../../db-interface.js';
import { logger } from '../../lib/logger.js';

// ── SCIM Content-Type ─────────────────────────────────────────────────────
export const SCIM_CONTENT_TYPE = 'application/scim+json';

// ── SCIM Schema URNs ──────────────────────────────────────────────────────
export const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  ENTERPRISE_USER: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
  PATCH_OP: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  SERVICE_PROVIDER_CONFIG: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
};

// ── SCIM Error Responses ──────────────────────────────────────────────────
export function scimError(res: Response, status: number, detail: string, scimType?: string) {
  return res.status(status).type(SCIM_CONTENT_TYPE).json({
    schemas: [SCIM_SCHEMAS.ERROR],
    status: String(status),
    detail,
    ...(scimType ? { scimType } : {}),
  });
}

// ── Token hashing ─────────────────────────────────────────────────────────
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Format SCIM User resource ─────────────────────────────────────────────
export function formatUser(user: ScimUserRow, baseUrl: string): object {
  const schemas = [SCIM_SCHEMAS.USER];
  if (user.role) schemas.push(SCIM_SCHEMAS.ENTERPRISE_USER);

  return {
    schemas,
    id: user.id,
    externalId: user.external_id,
    userName: user.user_name,
    name: {
      formatted: user.display_name,
      givenName: user.given_name,
      familyName: user.family_name,
    },
    displayName: user.display_name,
    emails: user.email
      ? [{ value: user.email, primary: true, type: 'work' }]
      : [],
    active: user.active === 1,
    meta: {
      resourceType: 'User',
      created: user.created_at,
      lastModified: user.updated_at ?? user.created_at,
      location: `${baseUrl}/api/scim/v2/Users/${user.id}`,
      version: `W/"${user.updated_at ?? user.created_at}"`,
    },
    [SCIM_SCHEMAS.ENTERPRISE_USER]: {
      organization: user.role,
    },
  };
}

// ── Format SCIM Group resource ────────────────────────────────────────────
export async function formatGroup(
  group: ScimGroupRow,
  members: { user_id: string }[],
  db: IDatabase,
  baseUrl: string,
  tenantId: string
): Promise<object> {
  const formattedMembers = await Promise.all(
    members.map(async (m) => {
      const user = await db.getScimUser(m.user_id, tenantId);
      return {
        value: m.user_id,
        display: user?.display_name ?? user?.user_name ?? m.user_id,
        $ref: `${baseUrl}/api/scim/v2/Users/${m.user_id}`,
      };
    })
  );

  return {
    schemas: [SCIM_SCHEMAS.GROUP],
    id: group.id,
    displayName: group.display_name,
    members: formattedMembers,
    meta: {
      resourceType: 'Group',
      created: group.created_at,
      lastModified: group.updated_at ?? group.created_at,
      location: `${baseUrl}/api/scim/v2/Groups/${group.id}`,
    },
  };
}

// ── SCIM Auth Middleware ───────────────────────────────────────────────────
export function createScimAuth(db: IDatabase) {
  return async function scimAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return scimError(res, 401, 'Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const tokenHash = hashToken(token);

    try {
      const tokenRow = await db.getScimTokenByHash(tokenHash);
      if (!tokenRow) {
        return scimError(res, 401, 'Invalid SCIM bearer token');
      }

      const tenant = await db.getTenant(tokenRow.tenant_id);
      if (!tenant) {
        return scimError(res, 401, 'Tenant not found');
      }

      req.tenant = tenant;
      req.tenantId = tenant.id;
      db.touchScimToken(tokenRow.id).catch(() => {});
      next();
    } catch (err) {
      logger.error({ err }, '[SCIM] auth error');
      return scimError(res, 500, 'Internal server error');
    }
  };
}

// ── Audit helper ──────────────────────────────────────────────────────────
export async function auditScim(
  db: IDatabase,
  tenantId: string,
  action: string,
  resource: string,
  resourceId: string,
  result: 'success' | 'error',
  detail?: string
) {
  try {
    await db.insertAuditEventSafe(
      tenantId, null, `scim.${resource}`, action, result,
      null, null, detail ?? null, null, new Date().toISOString(), null,
    );
  } catch { /* non-fatal */ }
}

// ── Base URL helper ────────────────────────────────────────────────────────
export function getBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}
