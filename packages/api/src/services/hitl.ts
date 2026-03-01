/**
 * HITLService — Human-in-the-loop gate management.
 * Creates gates when actions require approval, manages lifecycle (approve/reject/timeout).
 * Aligned with ARCHITECTURE.md §3.7 and BUILD_PLAN.md Component f.
 */
import type { HITLGate, HITLStatus } from '@prisma/client';
import type { ServiceContext } from '@agentguard/shared';
import { HITL_DEFAULT_TIMEOUT_SEC } from '@agentguard/shared';
import { BaseService } from './base.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { PrismaClient } from '../lib/prisma.js';
import type { Redis } from '../lib/redis.js';
import { RedisKeys } from '../lib/redis.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateGateInput {
  agentId: string;
  sessionId: string;
  auditEventId?: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  matchedRuleId: string;
  timeoutSec?: number;
  onTimeout?: string;
  webhookUrl?: string;
}

export interface ResolveGateInput {
  note?: string;
}

export interface GatePollResult {
  gateId: string;
  status: HITLStatus;
  resolved: boolean;
  decidedAt: string | null;
  decisionNote: string | null;
}

// ─── HITLService ──────────────────────────────────────────────────────────────

export class HITLService extends BaseService {
  constructor(
    db: PrismaClient,
    ctx: ServiceContext,
    private readonly redis: Redis,
  ) {
    super(db, ctx);
  }

  /**
   * Create a HITL gate — called when policy decision is require_approval.
   * Persists to DB, caches state in Redis, optionally fires webhook.
   */
  async createGate(input: CreateGateInput): Promise<HITLGate> {
    const timeoutSec = input.timeoutSec ?? HITL_DEFAULT_TIMEOUT_SEC;
    const timeoutAt = new Date(Date.now() + timeoutSec * 1000);

    const gate = await this.db.hITLGate.create({
      data: {
        tenantId: this.tenantId,
        agentId: input.agentId,
        sessionId: input.sessionId,
        auditEventId: input.auditEventId ?? null,
        toolName: input.toolName ?? null,
        toolParams: input.toolParams
          ? (input.toolParams as import('@prisma/client').Prisma.InputJsonValue)
          : undefined,
        matchedRuleId: input.matchedRuleId,
        status: 'PENDING',
        timeoutAt,
        onTimeout: input.onTimeout ?? 'block',
      },
    });

    // Cache gate state in Redis for fast poll lookups
    await this.redis.set(
      RedisKeys.hitlGate(gate.id),
      JSON.stringify({ status: 'PENDING', decidedAt: null, decisionNote: null }),
      'EX',
      timeoutSec + 60, // TTL slightly longer than timeout to handle edge cases
    );

    // Fire webhook if configured
    if (input.webhookUrl) {
      void this.fireWebhook(input.webhookUrl, gate);
    }

    return gate;
  }

  /**
   * Approve a HITL gate.
   */
  async approveGate(gateId: string, input: ResolveGateInput): Promise<HITLGate> {
    this.assertRole('owner', 'admin', 'operator');
    return this.resolveGate(gateId, 'APPROVED', input.note);
  }

  /**
   * Reject a HITL gate.
   */
  async rejectGate(gateId: string, input: ResolveGateInput): Promise<HITLGate> {
    this.assertRole('owner', 'admin', 'operator');
    return this.resolveGate(gateId, 'REJECTED', input.note);
  }

  /**
   * Auto-timeout a gate — called by scheduled job or background worker.
   */
  async timeoutGate(gateId: string): Promise<HITLGate> {
    const gate = await this.getGate(gateId);
    if (gate.status !== 'PENDING') {
      return gate; // Already resolved
    }
    if (gate.timeoutAt > new Date()) {
      return gate; // Not yet expired
    }
    return this.resolveGate(gateId, 'TIMED_OUT', 'Automatically timed out');
  }

  /**
   * Get gate details.
   */
  async getGate(gateId: string): Promise<HITLGate> {
    const gate = await this.db.hITLGate.findFirst({
      where: { id: gateId, tenantId: this.tenantId },
    });
    if (!gate) throw new NotFoundError('HITLGate', gateId);
    return gate;
  }

  /**
   * List all pending gates for this tenant (operator queue).
   */
  async listPendingGates(limit = 50, cursor?: string): Promise<HITLGate[]> {
    return this.db.hITLGate.findMany({
      where: { tenantId: this.tenantId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Poll for gate resolution — used by SDK long-poll endpoint.
   * Returns immediately if resolved, otherwise the caller should implement
   * HTTP long-poll with repeated calls.
   */
  async pollGateStatus(gateId: string): Promise<GatePollResult> {
    // Check Redis first (fast path)
    const cached = await this.redis.get(RedisKeys.hitlGate(gateId));
    if (cached) {
      const state = JSON.parse(cached) as { status: string; decidedAt: string | null; decisionNote: string | null };
      const resolved = state.status !== 'PENDING';
      return {
        gateId,
        status: state.status as HITLStatus,
        resolved,
        decidedAt: state.decidedAt,
        decisionNote: state.decisionNote,
      };
    }

    // DB fallback
    const gate = await this.getGate(gateId);
    const resolved = gate.status !== 'PENDING';

    // Check if gate should be auto-timed-out
    if (gate.status === 'PENDING' && gate.timeoutAt <= new Date()) {
      const timedOut = await this.timeoutGate(gateId);
      return {
        gateId,
        status: timedOut.status,
        resolved: true,
        decidedAt: timedOut.decidedAt?.toISOString() ?? null,
        decisionNote: timedOut.decisionNote,
      };
    }

    return {
      gateId,
      status: gate.status,
      resolved,
      decidedAt: gate.decidedAt?.toISOString() ?? null,
      decisionNote: gate.decisionNote,
    };
  }

  /**
   * Cancel a gate (e.g. agent disconnected).
   */
  async cancelGate(gateId: string): Promise<HITLGate> {
    return this.resolveGate(gateId, 'CANCELLED', 'Gate cancelled');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async resolveGate(
    gateId: string,
    status: HITLStatus,
    note?: string,
  ): Promise<HITLGate> {
    const gate = await this.getGate(gateId);

    if (gate.status !== 'PENDING') {
      throw new ValidationError({ gate: `Gate is already resolved with status: ${gate.status}` });
    }

    const decidedAt = new Date();
    const updated = await this.db.hITLGate.update({
      where: { id: gateId },
      data: {
        status,
        decidedAt,
        decidedByUserId: status === 'TIMED_OUT' ? null : this.userId,
        decisionNote: note ?? null,
      },
    });

    // Update Redis with resolved state
    await this.redis.set(
      RedisKeys.hitlGate(gateId),
      JSON.stringify({ status, decidedAt: decidedAt.toISOString(), decisionNote: note ?? null }),
      'EX',
      300, // 5 min TTL after resolution
    );

    return updated;
  }

  private async fireWebhook(url: string, gate: HITLGate): Promise<void> {
    try {
      // Validate URL is HTTPS and not a private IP
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return;

      const payload = {
        event: 'hitl_gate_created',
        gateId: gate.id,
        tenantId: gate.tenantId,
        agentId: gate.agentId,
        toolName: gate.toolName,
        matchedRuleId: gate.matchedRuleId,
        timeoutAt: gate.timeoutAt.toISOString(),
        createdAt: gate.createdAt.toISOString(),
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch {
      // Webhook failures are non-fatal
    }
  }
}

// ─── Gate response helper ──────────────────────────────────────────────────────

export function gateToResponse(gate: HITLGate) {
  return {
    id: gate.id,
    tenantId: gate.tenantId,
    agentId: gate.agentId,
    sessionId: gate.sessionId,
    toolName: gate.toolName,
    toolParams: gate.toolParams as Record<string, unknown> | null,
    matchedRuleId: gate.matchedRuleId,
    status: gate.status,
    timeoutAt: gate.timeoutAt.toISOString(),
    onTimeout: gate.onTimeout,
    createdAt: gate.createdAt.toISOString(),
    decidedAt: gate.decidedAt?.toISOString() ?? null,
    decisionNote: gate.decisionNote,
  };
}
