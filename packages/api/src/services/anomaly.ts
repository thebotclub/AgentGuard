/**
 * AnomalyService — rule-based anomaly detection for Phase 1.
 * Computes risk scores and flags for every ingested AuditEvent.
 * Aligned with BUILD_PLAN.md Component g and ARCHITECTURE.md §3.8.
 *
 * Detection rules:
 *   HIGH_VELOCITY       — >30 tool calls in 60s window (Redis counter)
 *   REPEATED_DENIALS    — >5 BLOCK decisions in session
 *   UNUSUAL_HOURS       — Action outside 06:00–22:00 UTC
 *   NEW_TOOL_FIRST_USE  — Tool name never seen before from this agent
 *   ACTION_COUNT_SPIKE  — Session actionCount > 200
 */
import type { AnomalyScore, RiskTier } from '@prisma/client';
import type { ServiceContext } from '@agentguard/shared';
import { BASE_RISK_SCORES, RISK_TIERS, getRiskTier } from '@agentguard/shared';
import { BaseService } from './base.js';
import type { PrismaClient } from '../lib/prisma.js';
import type { Redis } from '../lib/redis.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnomalyFlag =
  | 'HIGH_VELOCITY'
  | 'REPEATED_DENIALS'
  | 'UNUSUAL_HOURS'
  | 'NEW_TOOL_FIRST_USE'
  | 'ACTION_COUNT_SPIKE';

export interface AnomalyContext {
  auditEventId: string;
  agentId: string;
  sessionId: string;
  toolName: string | null;
  decision: string;
  riskScore: number;
  occurredAt: Date;
  sessionActionCount: number;
  sessionBlockCount: number;
}

export interface ComputedAnomaly {
  score: number;
  tier: RiskTier;
  flags: AnomalyFlag[];
  details: Record<string, unknown>;
}

// ─── Velocity window (60 seconds) ─────────────────────────────────────────────
const VELOCITY_WINDOW_SEC = 60;
const VELOCITY_THRESHOLD = 30;
const REPEATED_DENIALS_THRESHOLD = 5;
const ACTION_COUNT_SPIKE_THRESHOLD = 200;

// Business hours in UTC
const BUSINESS_HOURS_START = 6;  // 06:00 UTC
const BUSINESS_HOURS_END = 22;   // 22:00 UTC

// ─── AnomalyService ───────────────────────────────────────────────────────────

export class AnomalyService extends BaseService {
  constructor(
    db: PrismaClient,
    ctx: ServiceContext,
    private readonly redis: Redis,
  ) {
    super(db, ctx);
  }

  /**
   * Compute anomaly score for an audit event and persist to DB.
   * Called within the audit ingest transaction.
   */
  async scoreAndPersist(anomalyCtx: AnomalyContext): Promise<AnomalyScore> {
    const { score, tier, flags, details } = await this.computeScore(anomalyCtx);

    return this.db.anomalyScore.create({
      data: {
        tenantId: this.tenantId,
        agentId: anomalyCtx.agentId,
        auditEventId: anomalyCtx.auditEventId,
        sessionId: anomalyCtx.sessionId,
        score,
        tier,
        method: 'RULE_BASED',
        flags,
        details: details as import('@prisma/client').Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Compute an anomaly score without persisting (for testing / preview).
   */
  async computeScore(anomalyCtx: AnomalyContext): Promise<ComputedAnomaly> {
    const flags: AnomalyFlag[] = [];
    const details: Record<string, unknown> = {};

    // ── Rule 1: High Velocity ─────────────────────────────────────────────────
    const velocityCount = await this.trackVelocity(anomalyCtx.agentId);
    if (velocityCount > VELOCITY_THRESHOLD) {
      flags.push('HIGH_VELOCITY');
      details['velocityCount'] = velocityCount;
      details['velocityWindowSec'] = VELOCITY_WINDOW_SEC;
    }

    // ── Rule 2: Repeated Denials ──────────────────────────────────────────────
    if (anomalyCtx.sessionBlockCount > REPEATED_DENIALS_THRESHOLD) {
      flags.push('REPEATED_DENIALS');
      details['sessionBlockCount'] = anomalyCtx.sessionBlockCount;
    }

    // ── Rule 3: Unusual Hours ─────────────────────────────────────────────────
    const hour = anomalyCtx.occurredAt.getUTCHours();
    if (hour < BUSINESS_HOURS_START || hour >= BUSINESS_HOURS_END) {
      flags.push('UNUSUAL_HOURS');
      details['hourUtc'] = hour;
    }

    // ── Rule 4: New Tool First Use ────────────────────────────────────────────
    if (anomalyCtx.toolName) {
      const isNewTool = await this.isFirstToolUse(anomalyCtx.agentId, anomalyCtx.toolName);
      if (isNewTool) {
        flags.push('NEW_TOOL_FIRST_USE');
        details['toolName'] = anomalyCtx.toolName;
      }
    }

    // ── Rule 5: Action Count Spike ────────────────────────────────────────────
    if (anomalyCtx.sessionActionCount > ACTION_COUNT_SPIKE_THRESHOLD) {
      flags.push('ACTION_COUNT_SPIKE');
      details['sessionActionCount'] = anomalyCtx.sessionActionCount;
    }

    // ── Score Computation ─────────────────────────────────────────────────────
    const score = this.computeFinalScore(anomalyCtx, flags);
    const tier = this.mapScoreToTier(score);

    return { score, tier, flags, details };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Track action velocity using Redis sliding window counter.
   * Returns the current count in the window.
   */
  private async trackVelocity(agentId: string): Promise<number> {
    const key = `velocity:${this.tenantId}:${agentId}`;
    const now = Date.now();
    const windowStart = now - VELOCITY_WINDOW_SEC * 1000;

    // Use Redis sorted set for sliding window
    // Score = timestamp (ms), member = unique event ID
    const member = `${now}-${Math.random().toString(36).slice(2, 9)}`;

    // Add current event
    await this.redis.zadd(key, now, member);
    // Remove events outside window
    await this.redis.zremrangebyscore(key, 0, windowStart);
    // Set TTL
    await this.redis.expire(key, VELOCITY_WINDOW_SEC * 2);
    // Get count
    const count = await this.redis.zcard(key);

    return count;
  }

  /**
   * Check if this is the first time the agent has used this tool.
   * Uses Redis set tracking.
   */
  private async isFirstToolUse(agentId: string, toolName: string): Promise<boolean> {
    const key = `tools:${this.tenantId}:${agentId}`;
    const isNew = await this.redis.sadd(key, toolName);
    if (isNew === 1) {
      // New tool — set TTL 30 days for the tracking key
      await this.redis.expire(key, 30 * 24 * 3600);
      // But also verify against DB for accuracy (Redis could have been cleared)
      const existingInDb = await this.db.auditEvent.findFirst({
        where: {
          tenantId: this.tenantId,
          agentId,
          toolName,
        },
        select: { id: true },
      });
      return existingInDb === null;
    }
    return false;
  }

  /**
   * Compute the final risk score using risk_score formula from POLICY_ENGINE.md §4.4.
   */
  private computeFinalScore(ctx: AnomalyContext, flags: AnomalyFlag[]): number {
    // Base score from policy decision
    const decisionKey = ctx.decision.toLowerCase() as keyof typeof BASE_RISK_SCORES;
    const baseScore = BASE_RISK_SCORES[decisionKey] ?? ctx.riskScore;

    // Flag boosts
    const FLAG_BOOSTS: Record<AnomalyFlag, number> = {
      HIGH_VELOCITY: 50,
      REPEATED_DENIALS: 40,
      UNUSUAL_HOURS: 20,
      NEW_TOOL_FIRST_USE: 15,
      ACTION_COUNT_SPIKE: 30,
    };

    const flagBoost = flags.reduce((sum, flag) => sum + FLAG_BOOSTS[flag], 0);

    // Combine: start from the evaluated risk score and add flag boosts
    const combined = ctx.riskScore + flagBoost;

    return Math.min(1000, combined);
  }

  private mapScoreToTier(score: number): RiskTier {
    const label = getRiskTier(score);
    const tierMap: Record<typeof label, RiskTier> = {
      LOW: 'LOW',
      MEDIUM: 'MEDIUM',
      HIGH: 'HIGH',
      CRITICAL: 'CRITICAL',
    };
    return tierMap[label];
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { RISK_TIERS };
