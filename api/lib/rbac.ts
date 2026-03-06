/**
 * AgentGuard — Role-Based Access Control (RBAC)
 *
 * Roles and permissions for JWT-authenticated users.
 * API key users (agents/tenants) bypass RBAC — they have implicit full access.
 *
 * Usage:
 *   router.get('/api/v1/keys', auth.requireTenantAuth, requirePermission('manage_keys'), handler);
 *   router.delete('/api/v1/sso/config', auth.requireTenantAuth, requireRole('admin', 'owner'), handler);
 */
import { Request, Response, NextFunction } from 'express';

// ── Role Definitions ────────────────────────────────────────────────────────

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export type Permission =
  | '*'
  | 'read'
  | 'write'
  | 'manage_keys'
  | 'manage_agents'
  | 'manage_policy'
  | 'manage_sso';

const PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['*'],
  admin: ['read', 'write', 'manage_keys', 'manage_agents', 'manage_policy', 'manage_sso'],
  member: ['read', 'write', 'manage_agents'],
  viewer: ['read'],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract roles from a JWT request. Falls back to empty array.
 * Supports both `roles` array claim and a single `role` string claim.
 */
export function getRolesFromRequest(req: Request): Role[] {
  // If not JWT-authenticated, return empty (API key auth is role-agnostic)
  if (!req.jwtAuthenticated || !req.jwtClaims) return [];

  const claims = req.jwtClaims;

  // Prefer `roles` array
  if (Array.isArray(claims['roles'])) {
    return (claims['roles'] as string[]).filter(isValidRole);
  }

  // Fall back to single `role` claim
  const singleRole = claims['role'] as string | undefined;
  if (singleRole && isValidRole(singleRole)) {
    return [singleRole];
  }

  return [];
}

function isValidRole(r: string): r is Role {
  return r === 'owner' || r === 'admin' || r === 'member' || r === 'viewer';
}

/**
 * Check whether a role has a given permission.
 */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  // owner wildcard
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

/**
 * Check whether any of the given roles have the given permission.
 */
export function hasPermission(roles: Role[], permission: Permission): boolean {
  return roles.some((r) => roleHasPermission(r, permission));
}

// ── Middleware Factories ─────────────────────────────────────────────────────

/**
 * Require that the authenticated user has at least one of the specified roles.
 *
 * - API key auth (non-JWT): passes through — API keys have implicit full access.
 * - JWT auth: enforces role check; 403 if no matching role.
 *
 * @param roles One or more roles that are allowed.
 */
export function requireRole(...roles: Role[]): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    // API key auth — no role restriction
    if (!req.jwtAuthenticated) {
      next();
      return;
    }

    const userRoles = getRolesFromRequest(req);
    const hasMatchingRole = userRoles.some((r) => roles.includes(r));

    if (!hasMatchingRole) {
      res.status(403).json({
        error: `Insufficient role. Required: ${roles.join(' or ')}. Your roles: ${userRoles.join(', ') || 'none'}`,
      });
      return;
    }

    next();
  };
}

/**
 * Require that the authenticated user has a given permission.
 *
 * - API key auth (non-JWT): passes through.
 * - JWT auth: enforces permission check derived from roles.
 *
 * @param permission The required permission string.
 */
export function requirePermission(permission: Permission): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    // API key auth — no permission restriction
    if (!req.jwtAuthenticated) {
      next();
      return;
    }

    const userRoles = getRolesFromRequest(req);
    if (!hasPermission(userRoles, permission)) {
      res.status(403).json({
        error: `Insufficient permissions. Required: ${permission}. Your roles: ${userRoles.join(', ') || 'none'}`,
      });
      return;
    }

    next();
  };
}
