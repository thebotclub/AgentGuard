/**
 * AgentGuard — SCIM 2.0 Group Routes
 *
 * CRUD operations for SCIM /Groups endpoint.
 */
import { Router, Request, Response } from 'express';
import type { IDatabase } from '../../db-interface.js';
import { logger } from '../../lib/logger.js';
import {
  SCIM_SCHEMAS, SCIM_CONTENT_TYPE,
  scimError, formatGroup, getBaseUrl, auditScim,
} from './helpers.js';
import type { RequestHandler } from 'express';

/**
 * Register SCIM Group routes on a router.
 * The scimAuth middleware should already be applied by the caller.
 */
export function registerGroupRoutes(router: Router, db: IDatabase, scimAuth: RequestHandler): void {

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
        totalResults: total, startIndex, itemsPerPage: groups.length,
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
}
