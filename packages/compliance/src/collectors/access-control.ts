/**
 * Access Control Evidence Collector
 * SOC 2 CC6.1 / ISO 27001 A.9.2
 *
 * Collects: who has access to what, when granted, role assignments.
 */
import type { PrismaClient } from '@prisma/client';
import type { AccessControlEvidence, EvidenceItem, CollectionOptions } from '../types.js';

const STALE_DAYS = 90;

export async function collectAccessControl(
  db: PrismaClient,
  options: CollectionOptions,
): Promise<{ evidence: AccessControlEvidence; item: EvidenceItem }> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // Collect all users in the tenant with their roles and last activity
  const users = await db.user.findMany({
    where: {
      tenantId: options.tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      role: true,
      tenantId: true,
      createdAt: true,
      lastLoginAt: true,
      _count: {
        select: {
          // Count agents assigned to this user if applicable
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Map users to evidence format
  const userEvidence = users.map((u) => ({
    userId: u.id,
    email: u.email,
    role: u.role,
    tenantId: u.tenantId,
    grantedAt: u.createdAt.toISOString(),
    lastActiveAt: u.lastLoginAt?.toISOString() ?? null,
    agentCount: 0,
  }));

  const adminCount = users.filter((u) => u.role === 'admin' || u.role === 'owner').length;
  const staleAccounts = users.filter(
    (u) =>
      u.lastLoginAt !== null &&
      u.lastLoginAt < staleThreshold,
  ).length;

  // Also check for users with no login ever and created >90 days ago
  const neverLoggedInStale = users.filter(
    (u) =>
      u.lastLoginAt === null &&
      u.createdAt < staleThreshold,
  ).length;

  const totalStale = staleAccounts + neverLoggedInStale;

  const evidence: AccessControlEvidence = {
    controlId: 'SOC2-CC6.1',
    users: userEvidence,
    totalUsers: users.length,
    adminCount,
    staleAccounts: totalStale,
    collectedAt: now.toISOString(),
  };

  const status =
    totalStale === 0 && adminCount <= Math.max(2, Math.ceil(users.length * 0.1))
      ? 'PASS'
      : totalStale > 0 || adminCount > 5
        ? 'WARNING'
        : 'PASS';

  const item: EvidenceItem = {
    controlId: 'SOC2-CC6.1',
    framework: 'SOC2',
    category: 'Logical Access',
    title: 'Logical and Physical Access Controls',
    finding: `${users.length} users, ${adminCount} admins, ${totalStale} stale accounts (>${STALE_DAYS}d inactive)`,
    status,
    collectedAt: now.toISOString(),
    evidence: {
      totalUsers: users.length,
      adminCount,
      staleAccounts: totalStale,
      staleThresholdDays: STALE_DAYS,
    },
    remediation:
      totalStale > 0
        ? `Deactivate ${totalStale} stale user account(s) inactive for >${STALE_DAYS} days`
        : undefined,
  };

  return { evidence, item };
}
