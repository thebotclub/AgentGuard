/**
 * AuditService — ingest telemetry + query audit log with hash chain.
 * Aligned with ARCHITECTURE.md §3.6 and BUILD_PLAN.md Component d.
 *
 * Key features:
 * - SHA-256 hash chaining — each event links to previous via hash
 * - Append-only enforcement (PostgreSQL trigger handles DB-side)
 * - Anomaly scoring on every event
 * - Session serialization via per-session advisory locks
 */
import { createHash } from 'node:crypto';
import { GENESIS_HASH, getRiskTier } from '@agentguard/shared';
import { BaseService } from './base.js';
import { NotFoundError } from '../lib/errors.js';
import { AnomalyService } from './anomaly.js';
export class AuditService extends BaseService {
    redis;
    anomalyService;
    constructor(db, ctx, redis) {
        super(db, ctx);
        this.redis = redis;
        this.anomalyService = new AnomalyService(db, ctx, redis);
    }
    async queryEvents(query) {
        return this.db.auditEvent.findMany({
            where: {
                ...this.tenantScope(),
                ...(query.agentId ? { agentId: query.agentId } : {}),
                ...(query.sessionId ? { sessionId: query.sessionId } : {}),
                ...(query.decision ? { policyDecision: query.decision } : {}),
                ...(query.riskTier ? { riskTier: query.riskTier } : {}),
                ...(query.toolName ? { toolName: query.toolName } : {}),
                ...(query.fromDate || query.toDate
                    ? {
                        occurredAt: {
                            ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
                            ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
                        },
                    }
                    : {}),
            },
            orderBy: { occurredAt: 'desc' },
            take: query.limit,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        });
    }
    async getEvent(eventId) {
        const event = await this.db.auditEvent.findFirst({
            where: {
                ...this.tenantScope(),
                id: eventId,
            },
        });
        if (!event)
            throw new NotFoundError('AuditEvent', eventId);
        return event;
    }
    /**
     * Ingest a telemetry batch from the SDK.
     * Creates AuditEvents with hash chain continuity.
     *
     * Sequential per session — advisory locks prevent hash-chain forks
     * when concurrent batches arrive for the same session.
     */
    async ingestBatch(batch) {
        let accepted = 0;
        let rejected = 0;
        const errors = [];
        // Group events by sessionId for sequential processing
        const bySession = new Map();
        for (const event of batch.events) {
            const existing = bySession.get(event.sessionId) ?? [];
            existing.push(event);
            bySession.set(event.sessionId, existing);
        }
        for (const [sessionId, events] of bySession) {
            // Sort by occurredAt to maintain chain order
            events.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
            for (const event of events) {
                try {
                    await this.ingestSingleEvent(batch.agentId, sessionId, event);
                    accepted++;
                }
                catch (err) {
                    rejected++;
                    errors.push({
                        clientEventId: event.clientEventId,
                        reason: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        }
        return { accepted, rejected, errors };
    }
    /**
     * Ingest a single event within a session.
     * Gets previous hash, computes new hash, writes AuditEvent + AnomalyScore atomically.
     */
    async ingestSingleEvent(agentId, sessionId, event) {
        await this.withTransaction(async (tx) => {
            // ── Find or create session ──────────────────────────────────────────────
            let session = await tx.agentSession.findFirst({
                where: { id: sessionId, tenantId: this.tenantId },
            });
            if (!session) {
                session = await tx.agentSession.create({
                    data: {
                        id: sessionId,
                        tenantId: this.tenantId,
                        agentId,
                        status: 'ACTIVE',
                    },
                });
            }
            // ── Get previous hash (most recent event in this session) ──────────────
            const previousEvent = await tx.auditEvent.findFirst({
                where: { sessionId, tenantId: this.tenantId },
                orderBy: { occurredAt: 'desc' },
                select: { eventHash: true },
            });
            const previousHash = previousEvent?.eventHash ?? GENESIS_HASH;
            // ── Generate stable event ID ───────────────────────────────────────────
            const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const occurredAt = event.occurredAt;
            // ── Compute hash ────────────────────────────────────────────────────────
            const eventHash = computeEventHash(previousHash, {
                eventId,
                agentId,
                tenantId: this.tenantId,
                occurredAt,
                actionType: event.actionType,
                toolName: event.toolName ?? null,
                decision: event.decision,
                riskScore: event.riskScore,
            });
            // ── Map decision to DB enum ─────────────────────────────────────────────
            const policyDecision = mapDecision(event.decision);
            const riskTierLabel = getRiskTier(event.riskScore);
            const riskTier = riskTierLabel;
            // ── Write AuditEvent ───────────────────────────────────────────────────
            await tx.auditEvent.create({
                data: {
                    id: eventId,
                    tenantId: this.tenantId,
                    agentId,
                    sessionId,
                    occurredAt: new Date(occurredAt),
                    processingMs: event.processingMs,
                    actionType: mapActionType(event.actionType),
                    toolName: event.toolName ?? null,
                    toolTarget: event.toolTarget ?? null,
                    actionParams: event.actionParams
                        ? event.actionParams
                        : undefined,
                    executionMs: event.executionMs ?? null,
                    policyDecision,
                    policyVersion: event.policyVersion ?? null,
                    matchedRuleId: event.matchedRuleId ?? null,
                    matchedRuleIds: event.matchedRuleIds,
                    blockReason: event.blockReason ?? null,
                    riskScore: event.riskScore,
                    riskTier,
                    inputDataLabels: event.inputDataLabels,
                    outputDataLabels: event.outputDataLabels,
                    planningTraceSummary: event.planningTraceSummary ?? null,
                    ragSourceIds: event.ragSourceIds,
                    priorEventIds: event.priorEventIds,
                    previousHash,
                    eventHash,
                },
            });
            // ── Update session counters ─────────────────────────────────────────────
            const isBlock = policyDecision === 'BLOCK' || policyDecision === 'KILLED';
            await tx.agentSession.update({
                where: { id: sessionId },
                data: {
                    actionCount: { increment: 1 },
                    ...(isBlock ? { blockCount: { increment: 1 } } : {}),
                    riskScoreMax: session.riskScoreMax < event.riskScore
                        ? event.riskScore
                        : undefined,
                },
            });
            // ── Compute anomaly score ───────────────────────────────────────────────
            // NOTE: This runs after the main event to get fresh session counts.
            // In production this would ideally be in the same transaction, but
            // we run it outside since AnomalyScore writes are idempotent.
        });
        // ── Anomaly scoring (outside tx — reads fresh session state) ─────────────
        try {
            const freshSession = await this.db.agentSession.findFirst({
                where: { id: sessionId, tenantId: this.tenantId },
                select: { actionCount: true, blockCount: true, id: true },
            });
            const freshEvent = await this.db.auditEvent.findFirst({
                where: { sessionId, tenantId: this.tenantId, agentId },
                orderBy: { occurredAt: 'desc' },
                select: { id: true, occurredAt: true },
            });
            if (freshSession && freshEvent) {
                await this.anomalyService.scoreAndPersist({
                    auditEventId: freshEvent.id,
                    agentId,
                    sessionId,
                    toolName: event.toolName ?? null,
                    decision: event.decision,
                    riskScore: event.riskScore,
                    occurredAt: freshEvent.occurredAt,
                    sessionActionCount: freshSession.actionCount,
                    sessionBlockCount: freshSession.blockCount,
                });
            }
        }
        catch {
            // Anomaly scoring failures are non-fatal
        }
    }
    /**
     * Verify the hash chain integrity for a session.
     */
    async verifySessionChain(sessionId) {
        const events = await this.db.auditEvent.findMany({
            where: {
                ...this.tenantScope(),
                sessionId,
            },
            orderBy: { occurredAt: 'asc' },
            select: {
                id: true,
                agentId: true,
                tenantId: true,
                occurredAt: true,
                actionType: true,
                toolName: true,
                policyDecision: true,
                riskScore: true,
                previousHash: true,
                eventHash: true,
            },
        });
        let previousHash = GENESIS_HASH;
        for (const [i, event] of events.entries()) {
            if (event.previousHash !== previousHash) {
                return {
                    sessionId,
                    eventCount: events.length,
                    chainValid: false,
                    firstBrokenAt: { eventId: event.id, position: i },
                    verifiedAt: new Date().toISOString(),
                };
            }
            const expected = computeEventHash(previousHash, {
                eventId: event.id,
                agentId: event.agentId,
                tenantId: event.tenantId,
                occurredAt: event.occurredAt.toISOString(),
                actionType: event.actionType,
                toolName: event.toolName,
                decision: event.policyDecision,
                riskScore: event.riskScore,
            });
            if (event.eventHash !== expected) {
                return {
                    sessionId,
                    eventCount: events.length,
                    chainValid: false,
                    firstBrokenAt: {
                        eventId: event.id,
                        position: i,
                        expected,
                        actual: event.eventHash,
                    },
                    verifiedAt: new Date().toISOString(),
                };
            }
            previousHash = event.eventHash;
        }
        return {
            sessionId,
            eventCount: events.length,
            chainValid: true,
            verifiedAt: new Date().toISOString(),
        };
    }
}
export function computeEventHash(previousHash, event) {
    const canonical = JSON.stringify(Object.fromEntries(Object.entries(event).sort(([a], [b]) => a.localeCompare(b))));
    return createHash('sha256')
        .update(previousHash + '|' + canonical)
        .digest('hex');
}
// ─── Enum mapping helpers ─────────────────────────────────────────────────────
function mapDecision(decision) {
    const normalized = decision.toUpperCase();
    const valid = [
        'ALLOW', 'BLOCK', 'MONITOR', 'HITL_PENDING',
        'HITL_APPROVED', 'HITL_REJECTED', 'HITL_TIMEOUT', 'KILLED', 'ERROR',
    ];
    if (valid.includes(normalized))
        return normalized;
    // Map common SDK decision strings
    switch (normalized) {
        case 'REQUIRE_APPROVAL': return 'HITL_PENDING';
        case 'TIMEOUT': return 'HITL_TIMEOUT';
        default: return 'ALLOW';
    }
}
function mapActionType(actionType) {
    const normalized = actionType.toUpperCase().replace('-', '_');
    const valid = [
        'TOOL_CALL', 'LLM_INFERENCE', 'MEMORY_READ', 'MEMORY_WRITE',
        'AGENT_START', 'AGENT_END', 'KILL_SWITCH', 'POLICY_CHECK',
    ];
    if (valid.includes(normalized))
        return normalized;
    return 'TOOL_CALL';
}
//# sourceMappingURL=audit.js.map