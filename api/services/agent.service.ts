/**
 * AgentGuard — Agent Service
 *
 * Domain service for agent CRUD, key management, and child agent hierarchy.
 * Extracts business logic from route handlers so they only handle HTTP concerns.
 *
 * Depends on IDatabase for data access — no HTTP types imported.
 */
import crypto from 'crypto';
import { logger } from '../lib/logger.js';
import {
  computeChildPolicy,
  type AgentPolicy,
} from '../lib/policy-inheritance.js';
import type { IDatabase, AgentRow } from '../db-interface.js';

export interface CreateAgentInput {
  name: string;
  policyScope?: string[];
}

export interface AgentDto {
  id: string;
  tenantId: string;
  name: string;
  apiKey?: string; // Only present on creation (never again)
  policyScope: string[];
  active: boolean;
  createdAt: string;
}

export interface SpawnChildInput {
  name: string;
  allowedTools?: string[];
  blockedTools?: string[];
  hitlTools?: string[];
  ttlMinutes?: number;
  maxToolCalls?: number;
}

export interface ChildAgentDto {
  id: string;
  parentAgentId: string;
  tenantId: string;
  name: string;
  apiKey: string;
  policy: AgentPolicy;
  ttlExpiresAt: string;
  maxToolCalls: number | null;
  toolCallsUsed: number;
  createdAt: string;
}

export class AgentService {
  constructor(private db: IDatabase) {}

  // ── Agent CRUD ────────────────────────────────────────────────────────────

  /**
   * Create a new agent for a tenant with a scoped API key.
   */
  async createAgent(
    tenantId: string,
    input: CreateAgentInput,
  ): Promise<AgentDto> {
    const apiKey = AgentService.generateAgentKey();
    const scopeJson = Array.isArray(input.policyScope)
      ? JSON.stringify(input.policyScope)
      : '[]';

    const row = await this.db.insertAgent(
      tenantId,
      input.name.trim(),
      apiKey,
      scopeJson,
    );

    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      apiKey, // Returned once on creation only
      policyScope: JSON.parse(row.policy_scope) as string[],
      active: row.active === 1,
      createdAt: row.created_at,
    };
  }

  /**
   * List all agents for a tenant.
   */
  async listAgents(tenantId: string): Promise<Omit<AgentDto, 'apiKey'>[]> {
    const rows = await this.db.getAgentsByTenant(tenantId);
    return rows.map(AgentService.toDto);
  }

  /**
   * Get a single agent by ID within a tenant.
   */
  async getAgent(
    agentId: string,
    tenantId: string,
  ): Promise<Omit<AgentDto, 'apiKey'> | null> {
    const row = await this.db.getAgentById(agentId, tenantId);
    return row ? AgentService.toDto(row) : null;
  }

  /**
   * Deactivate an agent (soft-delete).
   */
  async deactivateAgent(agentId: string, tenantId: string): Promise<void> {
    await this.db.deactivateAgent(agentId, tenantId);
  }

  // ── Child Agent Hierarchy ─────────────────────────────────────────────────

  /**
   * Spawn a child agent with monotonically restrictive policy inheritance.
   * Creates both an agent row and a hierarchy row.
   */
  async spawnChildAgent(
    tenantId: string,
    parentAgentId: string,
    input: SpawnChildInput,
  ): Promise<ChildAgentDto> {
    // Verify parent agent belongs to tenant and is active
    const parentAgent = await this.db.getAgentById(parentAgentId, tenantId);
    if (!parentAgent) {
      throw new AgentNotFoundError('Parent agent not found');
    }
    if (parentAgent.active === 0) {
      throw new AgentValidationError('Parent agent is inactive');
    }

    // Compute parent's effective policy
    const parentPolicy = AgentService.parseAgentPolicy(
      parentAgent.policy_scope,
    );

    // Build child restrictions
    const childRestrictions: AgentPolicy = {};
    if (input.allowedTools !== undefined)
      childRestrictions.allowedTools = input.allowedTools;
    if (input.blockedTools !== undefined)
      childRestrictions.blockedTools = input.blockedTools;
    if (input.hitlTools !== undefined)
      childRestrictions.hitlTools = input.hitlTools;

    // Compute merged (monotonically restrictive) child policy
    const childPolicy = computeChildPolicy(parentPolicy, childRestrictions);

    // Compute TTL expiry
    const ttlExpiresAt = input.ttlMinutes
      ? new Date(Date.now() + input.ttlMinutes * 60 * 1000).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // default 24h

    // Create the child agent row
    const childApiKey = AgentService.generateAgentKey();
    const hierarchyId = crypto.randomUUID().replace(/-/g, '');

    const childAgentRow = await this.db.insertAgent(
      tenantId,
      input.name.trim(),
      childApiKey,
      JSON.stringify(childPolicy),
    );

    // Insert into hierarchy table
    const hierarchyRow = await this.db.insertChildAgent(
      hierarchyId,
      parentAgentId,
      childAgentRow.id,
      tenantId,
      JSON.stringify(childPolicy),
      ttlExpiresAt,
      input.maxToolCalls ?? null,
    );

    return {
      id: childAgentRow.id,
      parentAgentId,
      tenantId,
      name: childAgentRow.name,
      apiKey: childApiKey,
      policy: childPolicy,
      ttlExpiresAt: hierarchyRow.ttl_expires_at,
      maxToolCalls: hierarchyRow.max_tool_calls,
      toolCallsUsed: 0,
      createdAt: hierarchyRow.created_at,
    };
  }

  /**
   * List child agents of a parent agent.
   */
  async listChildAgents(
    tenantId: string,
    parentAgentId: string,
  ): Promise<
    Array<{
      id: string;
      hierarchyId: string;
      policy: AgentPolicy;
      ttlExpiresAt: string | null;
      maxToolCalls: number | null;
      toolCallsUsed: number;
      createdAt: string;
      status: 'active' | 'expired' | 'budget_exceeded';
    }>
  > {
    const parentAgent = await this.db.getAgentById(parentAgentId, tenantId);
    if (!parentAgent) {
      throw new AgentNotFoundError('Parent agent not found');
    }

    const children = await this.db.listChildAgents(parentAgentId, tenantId);
    return children.map((c) => {
      let policy: AgentPolicy = {};
      try {
        policy = JSON.parse(c.policy_snapshot) as AgentPolicy;
      } catch {
        /* keep empty */
      }
      const expired = c.ttl_expires_at
        ? new Date(c.ttl_expires_at).getTime() < Date.now()
        : false;
      const budgetExceeded =
        c.max_tool_calls !== null
          ? c.tool_calls_used >= c.max_tool_calls
          : false;
      return {
        id: c.child_agent_id,
        hierarchyId: c.id,
        policy,
        ttlExpiresAt: c.ttl_expires_at,
        maxToolCalls: c.max_tool_calls,
        toolCallsUsed: c.tool_calls_used,
        createdAt: c.created_at,
        status: expired ? 'expired' : budgetExceeded ? 'budget_exceeded' : 'active',
      };
    });
  }

  /**
   * Revoke a child agent: deactivate + remove hierarchy record.
   */
  async revokeChildAgent(
    tenantId: string,
    parentAgentId: string,
    childId: string,
  ): Promise<void> {
    const parentAgent = await this.db.getAgentById(parentAgentId, tenantId);
    if (!parentAgent) {
      throw new AgentNotFoundError('Parent agent not found');
    }

    const hierarchyRow = await this.db.getChildAgent(childId);
    if (
      !hierarchyRow ||
      hierarchyRow.parent_agent_id !== parentAgentId ||
      hierarchyRow.tenant_id !== tenantId
    ) {
      throw new AgentNotFoundError('Child agent not found');
    }

    await this.db.deactivateAgent(childId, tenantId);
    await this.db.deleteChildAgent(childId, tenantId);
  }

  // ── Static Helpers ────────────────────────────────────────────────────────

  static generateAgentKey(): string {
    return 'ag_agent_' + crypto.randomBytes(16).toString('hex');
  }

  /**
   * Parse a stored policy_scope JSON into an AgentPolicy.
   */
  static parseAgentPolicy(policyScopeJson: string): AgentPolicy {
    try {
      const parsed = JSON.parse(policyScopeJson) as unknown;
      if (Array.isArray(parsed)) {
        return { allowedTools: parsed as string[] };
      }
      if (parsed && typeof parsed === 'object') {
        return parsed as AgentPolicy;
      }
    } catch {
      // ignore
    }
    return {};
  }

  private static toDto(
    row: AgentRow,
  ): Omit<AgentDto, 'apiKey'> {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      policyScope: JSON.parse(row.policy_scope) as string[],
      active: row.active === 1,
      createdAt: row.created_at,
    };
  }
}

// ── Custom Error Types ────────────────────────────────────────────────────────

export class AgentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentNotFoundError';
  }
}

export class AgentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentValidationError';
  }
}
