/**
 * AgentGuard — Team Management Routes (M3-78 RBAC)
 *
 * GET    /api/v1/team/members           — list team members
 * POST   /api/v1/team/members           — invite a member
 * DELETE /api/v1/team/members/:userId   — remove a member (owner only)
 * PATCH  /api/v1/team/members/:userId/role — change role (owner only)
 */
import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { z } from 'zod';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../lib/rbac.js';

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

const ChangeRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']),
});

export function createTeamRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // List members
  router.get(
    '/api/v1/team/members',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const members = await db.getTeamMembers(tenantId);
        res.json({ members });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[team/list]');
        res.status(500).json({ error: 'Failed to list team members' });
      }
    },
  );

  // Invite member
  router.post(
    '/api/v1/team/members',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const parsed = InviteMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]!.message });
      }

      try {
        const tenantId = req.tenantId!;
        const { email, role } = parsed.data;
        const member = await db.addTeamMember(tenantId, email, role);
        res.status(201).json(member);
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('already exists')) {
          return res.status(409).json({ error: 'Member already exists' });
        }
        logger.error({ err: e instanceof Error ? e : String(e) }, '[team/invite]');
        res.status(500).json({ error: 'Failed to invite team member' });
      }
    },
  );

  // Remove member (owner only)
  router.delete(
    '/api/v1/team/members/:userId',
    auth.requireTenantAuth,
    requireRole('owner'),
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const userId = req.params.userId as string;
        await db.removeTeamMember(tenantId, userId);
        res.json({ success: true });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[team/remove]');
        res.status(500).json({ error: 'Failed to remove team member' });
      }
    },
  );

  // Change role (owner only)
  router.patch(
    '/api/v1/team/members/:userId/role',
    auth.requireTenantAuth,
    requireRole('owner'),
    async (req: Request, res: Response) => {
      const parsed = ChangeRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]!.message });
      }

      try {
        const tenantId = req.tenantId!;
        const userId = req.params.userId as string;
        const { role } = parsed.data;
        await db.updateTeamMemberRole(tenantId, userId, role);
        res.json({ success: true, role });
      } catch (e) {
        logger.error({ err: e instanceof Error ? e : String(e) }, '[team/role]');
        res.status(500).json({ error: 'Failed to update role' });
      }
    },
  );

  return router;
}
