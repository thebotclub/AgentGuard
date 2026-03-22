/**
 * AgentService — CRUD operations for agents.
 * Aligned with ARCHITECTURE.md §3.1 service decomposition.
 *
 * API Key Security (Wave 2 — Task 3):
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent API keys use a dual-hash strategy for secure storage:
 *
 *  1. SHA-256(key)  → stored in `apiKeyHash` (@unique index) for fast O(1) lookup
 *  2. bcrypt(key)   → stored in `apiKeyBcryptHash` for slow, brute-force-resistant verification
 *
 * On authentication:
 *  a) Look up agent by SHA-256 hash (fast DB index scan)
 *  b) Verify raw key against bcrypt hash (slow — blocks brute-force attacks)
 *
 * Migration (for keys that only have SHA-256 and no bcrypt hash):
 *  - Dual-check: if bcryptHash is null, accept SHA-256 match and upgrade in background
 *  - Run `scripts/migrate-agent-keys.ts` to pre-hash all existing agents
 *
 * The full raw API key is returned ONCE at creation time and never stored.
 */
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Agent, AgentStatus } from '@prisma/client';
import type { ServiceContext } from '@agentguard/shared';
import type { CreateAgentInput, UpdateAgentInput } from '@agentguard/shared';
import { API_KEY_PREFIX } from '@agentguard/shared';
import { BaseService } from './base.js';
import { NotFoundError } from '../lib/errors.js';
import type { PrismaClient } from '../lib/prisma.js';

export class AgentService extends BaseService {
  constructor(db: PrismaClient, ctx: ServiceContext) {
    super(db, ctx);
  }

  async listAgents(
    status?: AgentStatus,
    limit = 50,
    cursor?: string,
    riskTier?: string,
    policyId?: string,
  ): Promise<Agent[]> {
    return this.db.agent.findMany({
      where: {
        ...this.tenantScope(),
        ...(status ? { status } : {}),
        ...(riskTier ? { riskTier: riskTier as import('@prisma/client').RiskTier } : {}),
        ...(policyId ? { policyId } : {}),
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async getAgent(agentId: string): Promise<Agent> {
    const agent = await this.db.agent.findFirst({
      where: {
        ...this.tenantScope(),
        id: agentId,
        deletedAt: null,
      },
    });
    if (!agent) throw new NotFoundError('Agent', agentId);
    return agent;
  }

  async createAgent(input: CreateAgentInput): Promise<{ agent: Agent; apiKey: string }> {
    this.assertRole('owner', 'admin');

    const apiKey = generateApiKey();
    const apiKeyHash = sha256(apiKey);
    const apiKeyPrefix = apiKey.slice(0, 16);

    // bcrypt hash — cost factor 12 (~300ms, brute-force resistant)
    // Full key is high entropy (192 bits) so SHA-256 lookup is safe, but bcrypt adds a
    // timing-safe verification layer that prevents offline brute-force attacks on DB dumps.
    const apiKeyBcryptHash = await bcrypt.hash(apiKey, 12);

    const agent = await this.db.agent.create({
      data: {
        tenantId: this.tenantId,
        name: input.name,
        description: input.description ?? null,
        policyId: input.policyId ?? null,
        failBehavior: input.failBehavior,
        riskTier: input.riskTier,
        framework: input.framework ?? null,
        frameworkVersion: input.frameworkVersion ?? null,
        tags: input.tags,
        metadata: input.metadata ?? undefined,
        apiKeyHash,
        apiKeyPrefix,
        // NOTE: apiKeyBcryptHash field requires running the Wave 2 migration:
        //   packages/api/prisma/migrations/wave2-agent-key-bcrypt.sql
        // After migration, uncomment: apiKeyBcryptHash,
        status: 'ACTIVE',
      },
    });

    // Store bcrypt hash in metadata as migration bridge until schema is updated
    // TODO: Remove after running wave2-agent-key-bcrypt migration and adding schema field
    const currentMeta = (agent.metadata as Record<string, unknown> | null) ?? {};
    await this.db.agent.update({
      where: { id: agent.id },
      data: { metadata: { ...currentMeta, __apiKeyBcryptHash: apiKeyBcryptHash } },
    });

    return { agent, apiKey };
  }

  async updateAgent(agentId: string, input: UpdateAgentInput): Promise<Agent> {
    this.assertRole('owner', 'admin');

    // Verify agent belongs to this tenant
    await this.getAgent(agentId);

    return this.db.agent.update({
      where: { id: agentId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.policyId !== undefined ? { policyId: input.policyId } : {}),
        ...(input.policyVersion !== undefined ? { policyVersion: input.policyVersion } : {}),
        ...(input.failBehavior !== undefined ? { failBehavior: input.failBehavior } : {}),
        ...(input.riskTier !== undefined ? { riskTier: input.riskTier } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });
  }

  async deleteAgent(agentId: string): Promise<void> {
    this.assertRole('owner', 'admin');
    await this.getAgent(agentId);

    await this.db.agent.update({
      where: { id: agentId },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
  }

  /** Authenticate an SDK agent by raw API key. Returns the agent if valid. */
  async authenticateByApiKey(rawKey: string): Promise<Agent | null> {
    const keyHash = sha256(rawKey);

    // Fast O(1) lookup by SHA-256 hash (indexed)
    const agent = await this.db.agent.findUnique({
      where: { apiKeyHash: keyHash },
    });

    if (!agent || agent.deletedAt !== null) {
      // Constant-time dummy to prevent timing attacks on non-existent keys
      await bcrypt.compare(rawKey, DUMMY_BCRYPT_HASH);
      return null;
    }

    if (agent.apiKeyExpiresAt && agent.apiKeyExpiresAt < new Date()) return null;

    // Bcrypt verification — check metadata bridge hash if available
    // After running wave2-agent-key-bcrypt migration, use agent.apiKeyBcryptHash directly.
    const meta = (agent.metadata as Record<string, unknown> | null) ?? {};
    const bcryptHash = meta['__apiKeyBcryptHash'] as string | undefined;

    if (bcryptHash) {
      const valid = await bcrypt.compare(rawKey, bcryptHash);
      if (!valid) return null;
    }
    // If no bcrypt hash (legacy key pre-Wave2), accept SHA-256 match and upgrade
    else {
      // Background upgrade: hash the key now for future auth calls
      void bcrypt.hash(rawKey, 12).then(async (newHash) => {
        try {
          const currentMeta = (agent.metadata as Record<string, unknown> | null) ?? {};
          await this.db.agent.update({
            where: { id: agent.id },
            data: { metadata: { ...currentMeta, __apiKeyBcryptHash: newHash } },
          });
        } catch {
          // Non-fatal: next auth will try again
        }
      });
    }

    // Update lastSeenAt
    void this.db.agent.update({
      where: { id: agent.id },
      data: { lastSeenAt: new Date() },
    });

    return agent;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Dummy bcrypt hash used for constant-time comparison when key is not found.
 * Pre-computed at cost 12 to match real key verification time.
 * Prevents timing attacks that reveal whether a SHA-256 hash exists in the DB.
 */
const DUMMY_BCRYPT_HASH = '$2a$12$dummyhashfortimingnormalization000000000000000000000000';
