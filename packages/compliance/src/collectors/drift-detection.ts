/**
 * Drift Detection — Config Changes Since Last Audit
 *
 * Detects policy, user, and agent configuration changes since
 * the last compliance evidence collection.
 */
import type { PrismaClient } from '@prisma/client';
import type { DriftDetectionResult } from '../types.js';

export async function collectDriftDetection(
  db: PrismaClient,
  tenantId: string,
  lastAuditAt: Date | null,
): Promise<DriftDetectionResult> {
  const since = lastAuditAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const changes: DriftDetectionResult['configChanges'] = [];

  try {
    // Policy changes
    const policyChanges = await db.policy.findMany({
      where: {
        tenantId,
        OR: [
          { createdAt: { gte: since } },
          { updatedAt: { gte: since } },
          { deletedAt: { gte: since } },
        ],
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    for (const p of policyChanges) {
      const isNew = p.createdAt >= since;
      const isDeleted = p.deletedAt !== null && p.deletedAt >= since;
      changes.push({
        type: 'POLICY_CHANGE',
        entityId: p.id,
        entityType: 'Policy',
        changedAt: (isDeleted ? p.deletedAt! : isNew ? p.createdAt : p.updatedAt).toISOString(),
        changedBy: null,
        description: isDeleted
          ? `Policy "${p.name}" deleted`
          : isNew
            ? `Policy "${p.name}" created`
            : `Policy "${p.name}" updated`,
      });
    }
  } catch {
    // ignore
  }

  try {
    // User changes
    const userChanges = await db.user.findMany({
      where: {
        tenantId,
        OR: [
          { createdAt: { gte: since } },
          { deletedAt: { gte: since } },
        ],
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        deletedAt: true,
      },
    });

    for (const u of userChanges) {
      const isNew = u.createdAt >= since;
      changes.push({
        type: 'USER_CHANGE',
        entityId: u.id,
        entityType: 'User',
        changedAt: (u.deletedAt ?? u.createdAt).toISOString(),
        changedBy: null,
        description: u.deletedAt
          ? `User "${u.email}" deactivated`
          : `User "${u.email}" added with role "${u.role}"`,
      });
    }
  } catch {
    // ignore
  }

  try {
    // Agent changes
    const agentChanges = await db.agent.findMany({
      where: {
        tenantId,
        OR: [
          { createdAt: { gte: since } },
          { deletedAt: { gte: since } },
        ],
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        deletedAt: true,
      },
    });

    for (const a of agentChanges) {
      const isNew = a.createdAt >= since;
      changes.push({
        type: 'AGENT_CHANGE',
        entityId: a.id,
        entityType: 'Agent',
        changedAt: (a.deletedAt ?? a.createdAt).toISOString(),
        changedBy: null,
        description: a.deletedAt
          ? `Agent "${a.name}" deleted`
          : `Agent "${a.name}" registered`,
      });
    }
  } catch {
    // ignore
  }

  // Sort by change time
  changes.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

  const riskLevel =
    changes.length === 0
      ? 'LOW'
      : changes.length <= 5
        ? 'LOW'
        : changes.length <= 20
          ? 'MEDIUM'
          : 'HIGH';

  return {
    lastAuditAt: lastAuditAt?.toISOString() ?? null,
    configChanges: changes,
    totalChanges: changes.length,
    riskLevel,
  };
}
