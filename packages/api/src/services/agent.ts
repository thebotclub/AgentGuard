/**
 * AgentService — CRUD operations for agents.
 * Aligned with ARCHITECTURE.md §3.1 service decomposition.
 */
import { createHash, randomBytes } from 'node:crypto';
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
        status: 'ACTIVE',
      },
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
    const agent = await this.db.agent.findUnique({
      where: { apiKeyHash: keyHash },
    });
    if (!agent || agent.deletedAt !== null) return null;
    if (agent.apiKeyExpiresAt && agent.apiKeyExpiresAt < new Date()) return null;

    // Update lastSeenAt
    await this.db.agent.update({
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
