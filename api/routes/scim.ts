/**
 * AgentGuard — SCIM 2.0 Provisioning Routes
 *
 * Implements SCIM 2.0 Core Schema (RFC 7643) and Protocol (RFC 7644).
 * Compatible with Okta, Azure AD, and OneLogin SCIM connectors.
 *
 * Authentication: Bearer token (separate from main API keys / JWTs).
 *   Token management: POST /api/scim/v2/tokens (requires main auth)
 *
 * Endpoints:
 *   GET    /api/scim/v2/Users           — list/filter users
 *   POST   /api/scim/v2/Users           — create user
 *   GET    /api/scim/v2/Users/:id       — get user
 *   PUT    /api/scim/v2/Users/:id       — replace user
 *   PATCH  /api/scim/v2/Users/:id       — update user (PATCH ops)
 *   DELETE /api/scim/v2/Users/:id       — deprovision (soft delete)
 *   GET    /api/scim/v2/Groups          — list groups
 *   POST   /api/scim/v2/Groups          — create group
 *   GET    /api/scim/v2/Groups/:id      — get group
 *   PATCH  /api/scim/v2/Groups/:id      — update group membership
 *   DELETE /api/scim/v2/Groups/:id      — delete group
 *   GET    /api/scim/v2/ServiceProviderConfig — SCIM capabilities
 *   GET    /api/scim/v2/Schemas         — SCIM schemas
 *
 * Token management (requires main JWT auth):
 *   POST   /api/scim/v2/tokens          — issue a SCIM bearer token
 *   GET    /api/scim/v2/tokens          — list tokens
 *   DELETE /api/scim/v2/tokens/:id      — revoke token
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import type { IDatabase, ScimUserRow, ScimGroupRow } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

// ── SCIM Content-Type ─────────────────────────────────────────────────────
const SCIM_CONTENT_TYPE = 'application/scim+json';

// ── SCIM Schema URNs ──────────────────────────────────────────────────────
const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  ENTERPRISE_USER: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
  PATCH_OP: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  SERVICE_PROVIDER_CONFIG: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
};

// ── SCIM Error Responses ──────────────────────────────────────────────────
function scimError(res: Response, status: number, detail: string, scimType?: string) {
  return res.status(status).type(SCIM_CONTENT_TYPE).json({
    schemas: [SCIM_SCHEMAS.ERROR],
    status: String(status),
    detail,
    ...(scimType ? { scimType } : {}),
  });
}

// ── Token hashing ─────────────────────────────────────────────────────────
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Format SCIM User resource ─────────────────────────────────────────────
function formatUser(user: ScimUserRow, baseUrl: string): object {
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
async function formatGroup(
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
function createScimAuth(db: IDatabase) {
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

      // Attach tenant context
      const tenant = await db.getTenant(tokenRow.tenant_id);
      if (!tenant) {
        return scimError(res, 401, 'Tenant not found');
      }

      req.tenant = tenant;
      req.tenantId = tenant.id;

      // Touch token last_used_at async (don't await)
      db.touchScimToken(tokenRow.id).catch(() => {});

      next();
    } catch (err) {
      logger.error({ err }, '[SCIM] auth error');
      return scimError(res, 500, 'Internal server error');
    }
  };
}

// ── Audit helper ──────────────────────────────────────────────────────────
async function auditScim(
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
      tenantId,
      null,
      `scim.${resource}`,
      action,
      result,
      null,
      null,
      detail ?? null,
      null,
      new Date().toISOString(),
      null,
    );
  } catch { /* non-fatal */ }
}

// ── Route factory ─────────────────────────────────────────────────────────
export function createScimRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();
  const scimAuth = createScimAuth(db);

  // Helper to get base URL
  function getBaseUrl(req: Request): string {
    return `${req.protocol}://${req.get('host')}`;
  }

  // ── ServiceProviderConfig ────────────────────────────────────────────────
  router.get('/api/scim/v2/ServiceProviderConfig', (_req: Request, res: Response) => {
    res.type(SCIM_CONTENT_TYPE).json({
      schemas: [SCIM_SCHEMAS.SERVICE_PROVIDER_CONFIG],
      documentationUri: 'https://agentguard.tech/docs/scim',
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'OAuth Bearer Token',
          description: 'Authentication scheme using the OAuth Bearer Token standard',
          specUri: 'http://www.rfc-editor.org/info/rfc6750',
          primary: true,
        },
      ],
      meta: {
        resourceType: 'ServiceProviderConfig',
        location: '/api/scim/v2/ServiceProviderConfig',
      },
    });
  });

  // ── Schemas ───────────────────────────────────────────────────────────────
  router.get('/api/scim/v2/Schemas', (_req: Request, res: Response) => {
    res.type(SCIM_CONTENT_TYPE).json({
      schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
      totalResults: 2,
      startIndex: 1,
      itemsPerPage: 2,
      Resources: [
        {
          id: SCIM_SCHEMAS.USER,
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
          name: 'User',
          description: 'User Account',
          attributes: [
            { name: 'userName', type: 'string', multiValued: false, required: true, caseExact: false, mutability: 'readWrite', returned: 'default', uniqueness: 'server' },
            { name: 'name', type: 'complex', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
            { name: 'displayName', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
            { name: 'emails', type: 'complex', multiValued: true, required: false, mutability: 'readWrite', returned: 'default' },
            { name: 'active', type: 'boolean', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
            { name: 'externalId', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
          ],
        },
        {
          id: SCIM_SCHEMAS.GROUP,
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
          name: 'Group',
          description: 'Group',
          attributes: [
            { name: 'displayName', type: 'string', multiValued: false, required: true, mutability: 'readWrite', returned: 'default' },
            { name: 'members', type: 'complex', multiValued: true, required: false, mutability: 'readWrite', returned: 'default' },
          ],
        },
      ],
    });
  });

  // ── Token Management (requires main JWT auth) ─────────────────────────────
  router.post('/api/scim/v2/tokens', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const { label = 'default' } = req.body ?? {};

    // Generate a cryptographically secure token
    const token = `ag-scim-${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = hashToken(token);

    try {
      const row = await db.createScimToken(tenantId, tokenHash, label);
      await auditScim(db, tenantId, 'create', 'token', row.id, 'success', `Token "${label}" created`);

      // Return the plaintext token ONCE — never stored plaintext
      res.status(201).json({
        id: row.id,
        label: row.label,
        token, // Only returned at creation time
        created_at: row.created_at,
        message: 'Store this token securely — it will not be shown again.',
      });
    } catch (err) {
      logger.error({ err }, '[SCIM] createToken error');
      res.status(500).json({ error: 'Failed to create SCIM token' });
    }
  });

  router.get('/api/scim/v2/tokens', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const tokens = await db.listScimTokens(tenantId);
      // Never return token_hash
      res.json(tokens.map(t => ({
        id: t.id,
        label: t.label,
        active: t.active === 1,
        created_at: t.created_at,
        last_used_at: t.last_used_at,
      })));
    } catch (err) {
      logger.error({ err }, '[SCIM] listTokens error');
      res.status(500).json({ error: 'Failed to list SCIM tokens' });
    }
  });

  router.delete('/api/scim/v2/tokens/:id', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    try {
      await db.revokeScimToken(id, tenantId);
      await auditScim(db, tenantId, 'revoke', 'token', id, 'success');
      res.status(204).send();
    } catch (err) {
      logger.error({ err }, '[SCIM] revokeToken error');
      res.status(500).json({ error: 'Failed to revoke SCIM token' });
    }
  });

  // ── SCIM Users ────────────────────────────────────────────────────────────

  // GET /Users — list/filter
  router.get('/api/scim/v2/Users', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const filter = req.query['filter'] as string | undefined;
    const startIndex = parseInt(req.query['startIndex'] as string ?? '1', 10);
    const count = Math.min(parseInt(req.query['count'] as string ?? '100', 10), 200);

    try {
      const { users, total } = await db.listScimUsers(tenantId, { filter, startIndex, count });
      const baseUrl = getBaseUrl(req);

      res.type(SCIM_CONTENT_TYPE).json({
        schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
        totalResults: total,
        startIndex,
        itemsPerPage: users.length,
        Resources: users.map(u => formatUser(u, baseUrl)),
      });
    } catch (err) {
      logger.error({ err }, '[SCIM] listUsers error');
      scimError(res, 500, 'Failed to list users');
    }
  });

  // GET /Users/:id
  router.get('/api/scim/v2/Users/:id', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    try {
      const user = await db.getScimUser(id, tenantId);
      if (!user || user.deleted_at) {
        return scimError(res, 404, `User ${id} not found`);
      }
      res.type(SCIM_CONTENT_TYPE).json(formatUser(user, getBaseUrl(req)));
    } catch (err) {
      logger.error({ err }, '[SCIM] getUser error');
      scimError(res, 500, 'Failed to get user');
    }
  });

  // POST /Users — create
  router.post('/api/scim/v2/Users', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const body = req.body;

    if (!body?.userName) {
      return scimError(res, 400, 'userName is required', 'invalidValue');
    }

    // Check uniqueness
    const existing = await db.getScimUserByUserName(tenantId, body.userName);
    if (existing && !existing.deleted_at) {
      return scimError(res, 409, `User with userName "${body.userName}" already exists`, 'uniqueness');
    }

    const email = Array.isArray(body.emails) ? body.emails[0]?.value : body.emails;
    const givenName = body.name?.givenName;
    const familyName = body.name?.familyName;
    const displayName = body.displayName ?? (givenName && familyName ? `${givenName} ${familyName}` : body.userName);

    // Map enterprise extension role
    const enterpriseExt = body[SCIM_SCHEMAS.ENTERPRISE_USER];
    const role = enterpriseExt?.organization ?? 'member';

    try {
      const user = await db.createScimUser(tenantId, {
        external_id: body.externalId ?? null,
        user_name: body.userName,
        display_name: displayName ?? null,
        given_name: givenName ?? null,
        family_name: familyName ?? null,
        email: email ?? null,
        active: body.active !== false ? 1 : 0,
        role,
      });

      await auditScim(db, tenantId, 'create', 'user', user.id, 'success', `Provisioned user ${body.userName}`);

      res.status(201).type(SCIM_CONTENT_TYPE).json(formatUser(user, getBaseUrl(req)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return scimError(res, 409, 'User already exists', 'uniqueness');
      }
      logger.error({ err }, '[SCIM] createUser error');
      scimError(res, 500, 'Failed to create user');
    }
  });

  // PUT /Users/:id — replace (full update)
  router.put('/api/scim/v2/Users/:id', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    const body = req.body;

    const existing = await db.getScimUser(id, tenantId);
    if (!existing || existing.deleted_at) {
      return scimError(res, 404, `User ${id} not found`);
    }

    const email = Array.isArray(body.emails) ? body.emails[0]?.value : body.emails;
    const givenName = body.name?.givenName;
    const familyName = body.name?.familyName;
    const displayName = body.displayName ?? (givenName && familyName ? `${givenName} ${familyName}` : body.userName ?? existing.user_name);
    const enterpriseExt = body[SCIM_SCHEMAS.ENTERPRISE_USER];
    const role = enterpriseExt?.organization ?? existing.role;

    try {
      const updated = await db.updateScimUser(id, tenantId, {
        external_id: body.externalId ?? null,
        user_name: body.userName ?? existing.user_name,
        display_name: displayName ?? null,
        given_name: givenName ?? null,
        family_name: familyName ?? null,
        email: email ?? null,
        active: body.active !== false ? 1 : 0,
        role,
      });

      if (!updated) return scimError(res, 404, `User ${id} not found`);
      await auditScim(db, tenantId, 'replace', 'user', id, 'success');

      res.type(SCIM_CONTENT_TYPE).json(formatUser(updated, getBaseUrl(req)));
    } catch (err) {
      logger.error({ err }, '[SCIM] replaceUser error');
      scimError(res, 500, 'Failed to replace user');
    }
  });

  // PATCH /Users/:id — partial update (SCIM Patch Operations)
  router.patch('/api/scim/v2/Users/:id', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    const body = req.body;

    // Validate PatchOp schema
    if (!body?.schemas?.includes(SCIM_SCHEMAS.PATCH_OP)) {
      return scimError(res, 400, 'Missing PatchOp schema', 'invalidValue');
    }

    const existing = await db.getScimUser(id, tenantId);
    if (!existing || existing.deleted_at) {
      return scimError(res, 404, `User ${id} not found`);
    }

    const updates: Partial<ScimUserRow> = {};

    try {
      for (const op of (body.Operations ?? [])) {
        const { op: opType, path, value } = op;

        if (opType === 'replace' || opType === 'Replace') {
          if (!path || path === 'active') {
            if (typeof value === 'object' && value !== null) {
              // Full object replace
              if ('active' in value) updates.active = value.active ? 1 : 0;
              if ('userName' in value) updates.user_name = value.userName;
              if ('displayName' in value) updates.display_name = value.displayName;
              if ('name' in value) {
                updates.given_name = value.name?.givenName ?? null;
                updates.family_name = value.name?.familyName ?? null;
              }
              if ('emails' in value) {
                updates.email = Array.isArray(value.emails) ? value.emails[0]?.value : null;
              }
            } else if (path === 'active') {
              updates.active = value ? 1 : 0;
            }
          } else if (path === 'userName') {
            updates.user_name = value;
          } else if (path === 'displayName') {
            updates.display_name = value;
          } else if (path === 'name.givenName') {
            updates.given_name = value;
          } else if (path === 'name.familyName') {
            updates.family_name = value;
          } else if (path === 'emails[type eq "work"].value') {
            updates.email = value;
          } else if (path === `${SCIM_SCHEMAS.ENTERPRISE_USER}:organization`) {
            updates.role = value;
          }
        } else if (opType === 'add' || opType === 'Add') {
          if (path === 'active') updates.active = value ? 1 : 0;
        } else if (opType === 'remove' || opType === 'Remove') {
          if (path === 'active') updates.active = 0;
        }
      }

      const updated = await db.updateScimUser(id, tenantId, updates);
      if (!updated) return scimError(res, 404, `User ${id} not found`);

      await auditScim(db, tenantId, 'patch', 'user', id, 'success');
      res.type(SCIM_CONTENT_TYPE).json(formatUser(updated, getBaseUrl(req)));
    } catch (err) {
      logger.error({ err }, '[SCIM] patchUser error');
      scimError(res, 500, 'Failed to patch user');
    }
  });

  // DELETE /Users/:id — deprovision (soft delete)
  router.delete('/api/scim/v2/Users/:id', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    try {
      const existing = await db.getScimUser(id, tenantId);
      if (!existing || existing.deleted_at) {
        return scimError(res, 404, `User ${id} not found`);
      }
      await db.deleteScimUser(id, tenantId);
      await auditScim(db, tenantId, 'delete', 'user', id, 'success', `Deprovisioned user ${existing.user_name}`);
      res.status(204).send();
    } catch (err) {
      logger.error({ err }, '[SCIM] deleteUser error');
      scimError(res, 500, 'Failed to delete user');
    }
  });

  // ── SCIM Groups ───────────────────────────────────────────────────────────

  // GET /Groups — list
  router.get('/api/scim/v2/Groups', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const startIndex = parseInt(req.query['startIndex'] as string ?? '1', 10);
    const count = Math.min(parseInt(req.query['count'] as string ?? '100', 10), 200);
    const baseUrl = getBaseUrl(req);

    try {
      const { groups, total } = await db.listScimGroups(tenantId, { startIndex, count });
      const resources = await Promise.all(
        groups.map(async (g) => {
          const members = await db.getScimGroupMembers(g.id, tenantId);
          return formatGroup(g, members, db, baseUrl, tenantId);
        })
      );

      res.type(SCIM_CONTENT_TYPE).json({
        schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
        totalResults: total,
        startIndex,
        itemsPerPage: groups.length,
        Resources: resources,
      });
    } catch (err) {
      logger.error({ err }, '[SCIM] listGroups error');
      scimError(res, 500, 'Failed to list groups');
    }
  });

  // GET /Groups/:id
  router.get('/api/scim/v2/Groups/:id', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    try {
      const group = await db.getScimGroup(id, tenantId);
      if (!group) return scimError(res, 404, `Group ${id} not found`);

      const members = await db.getScimGroupMembers(id, tenantId);
      res.type(SCIM_CONTENT_TYPE).json(
        await formatGroup(group, members, db, getBaseUrl(req), tenantId)
      );
    } catch (err) {
      logger.error({ err }, '[SCIM] getGroup error');
      scimError(res, 500, 'Failed to get group');
    }
  });

  // POST /Groups — create
  router.post('/api/scim/v2/Groups', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const body = req.body;

    if (!body?.displayName) {
      return scimError(res, 400, 'displayName is required', 'invalidValue');
    }

    try {
      const group = await db.createScimGroup(tenantId, body.displayName);

      // Add initial members if provided
      if (Array.isArray(body.members)) {
        for (const member of body.members) {
          const userId = member.value;
          if (userId) await db.addScimGroupMember(group.id, userId, tenantId);
        }
      }

      await auditScim(db, tenantId, 'create', 'group', group.id, 'success', `Group "${body.displayName}" created`);
      const members = await db.getScimGroupMembers(group.id, tenantId);

      res.status(201).type(SCIM_CONTENT_TYPE).json(
        await formatGroup(group, members, db, getBaseUrl(req), tenantId)
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return scimError(res, 409, 'Group already exists', 'uniqueness');
      }
      logger.error({ err }, '[SCIM] createGroup error');
      scimError(res, 500, 'Failed to create group');
    }
  });

  // PATCH /Groups/:id — update membership
  router.patch('/api/scim/v2/Groups/:id', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    const body = req.body;

    if (!body?.schemas?.includes(SCIM_SCHEMAS.PATCH_OP)) {
      return scimError(res, 400, 'Missing PatchOp schema', 'invalidValue');
    }

    const group = await db.getScimGroup(id, tenantId);
    if (!group) return scimError(res, 404, `Group ${id} not found`);

    try {
      let updatedName = group.display_name;

      for (const op of (body.Operations ?? [])) {
        const { op: opType, path, value } = op;

        if (opType === 'replace' || opType === 'Replace') {
          if (path === 'displayName' || (!path && typeof value === 'object' && value?.displayName)) {
            updatedName = path === 'displayName' ? value : value.displayName;
          }
          if (path === 'members' || (!path && Array.isArray(value?.members))) {
            const memberList = path === 'members' ? (Array.isArray(value) ? value : []) : value.members;
            const userIds = memberList.map((m: { value: string }) => m.value).filter(Boolean);
            await db.replaceScimGroupMembers(id, tenantId, userIds);
          }
        } else if (opType === 'add' || opType === 'Add') {
          if (path === 'members') {
            const members = Array.isArray(value) ? value : [value];
            for (const m of members) {
              if (m?.value) await db.addScimGroupMember(id, m.value, tenantId);
            }
          }
        } else if (opType === 'remove' || opType === 'Remove') {
          if (path === 'members') {
            // path can be: members, members[value eq "userId"]
            const filterMatch = path.match(/members\[value eq "([^"]+)"\]/);
            if (filterMatch) {
              await db.removeScimGroupMember(id, filterMatch[1], tenantId);
            } else if (Array.isArray(value)) {
              for (const m of value) {
                if (m?.value) await db.removeScimGroupMember(id, m.value, tenantId);
              }
            }
          }
        }
      }

      if (updatedName !== group.display_name) {
        await db.updateScimGroup(id, tenantId, updatedName);
      }

      await auditScim(db, tenantId, 'patch', 'group', id, 'success');

      const updatedGroup = await db.getScimGroup(id, tenantId);
      const members = await db.getScimGroupMembers(id, tenantId);

      res.type(SCIM_CONTENT_TYPE).json(
        await formatGroup(updatedGroup ?? group, members, db, getBaseUrl(req), tenantId)
      );
    } catch (err) {
      logger.error({ err }, '[SCIM] patchGroup error');
      scimError(res, 500, 'Failed to patch group');
    }
  });

  // DELETE /Groups/:id
  router.delete('/api/scim/v2/Groups/:id', scimAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    try {
      const group = await db.getScimGroup(id, tenantId);
      if (!group) return scimError(res, 404, `Group ${id} not found`);
      await db.deleteScimGroup(id, tenantId);
      await auditScim(db, tenantId, 'delete', 'group', id, 'success');
      res.status(204).send();
    } catch (err) {
      logger.error({ err }, '[SCIM] deleteGroup error');
      scimError(res, 500, 'Failed to delete group');
    }
  });

  return router;
}
