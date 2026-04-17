/**
 * AgentGuard — SCIM 2.0 User Routes
 *
 * CRUD operations for SCIM /Users endpoint.
 */
import { Router, Request, Response } from 'express';
import type { IDatabase, ScimUserRow } from '../../db-interface.js';
import { logger } from '../../lib/logger.js';
import {
  SCIM_SCHEMAS, SCIM_CONTENT_TYPE,
  scimError, formatUser, getBaseUrl, auditScim,
} from './helpers.js';
import type { RequestHandler } from 'express';

/**
 * Register SCIM User routes on a router.
 * The scimAuth middleware should already be applied by the caller.
 */
export function registerUserRoutes(router: Router, db: IDatabase, scimAuth: RequestHandler): void {

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
        totalResults: total, startIndex, itemsPerPage: users.length,
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

    const existing = await db.getScimUserByUserName(tenantId, body.userName);
    if (existing && !existing.deleted_at) {
      return scimError(res, 409, `User with userName "${body.userName}" already exists`, 'uniqueness');
    }

    const email = Array.isArray(body.emails) ? body.emails[0]?.value : body.emails;
    const givenName = body.name?.givenName;
    const familyName = body.name?.familyName;
    const displayName = body.displayName ?? (givenName && familyName ? `${givenName} ${familyName}` : body.userName);
    const enterpriseExt = body[SCIM_SCHEMAS.ENTERPRISE_USER];
    const role = enterpriseExt?.organization ?? 'member';

    try {
      const user = await db.createScimUser(tenantId, {
        external_id: body.externalId ?? null, user_name: body.userName,
        display_name: displayName ?? null, given_name: givenName ?? null,
        family_name: familyName ?? null, email: email ?? null,
        active: body.active !== false ? 1 : 0, role,
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
        external_id: body.externalId ?? null, user_name: body.userName ?? existing.user_name,
        display_name: displayName ?? null, given_name: givenName ?? null,
        family_name: familyName ?? null, email: email ?? null,
        active: body.active !== false ? 1 : 0, role,
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
          } else if (path === 'userName') updates.user_name = value;
          else if (path === 'displayName') updates.display_name = value;
          else if (path === 'name.givenName') updates.given_name = value;
          else if (path === 'name.familyName') updates.family_name = value;
          else if (path === 'emails[type eq "work"].value') updates.email = value;
          else if (path === `${SCIM_SCHEMAS.ENTERPRISE_USER}:organization`) updates.role = value;
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
}
