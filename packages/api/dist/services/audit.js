/**
 * AuditService — ingest telemetry + query audit log with hash chain.
 * Aligned with ARCHITECTURE.md §3.6.
 */
import { createHash } from 'node:crypto';
import { GENESIS_HASH } from '@agentguard/shared';
import { BaseService } from './base.js';
import { NotFoundError } from '../lib/errors.js';
export class AuditService extends BaseService {
    constructor(db, ctx) {
        super(db, ctx);
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
     */
    async ingestBatch(batch) {
        let accepted = 0;
        let rejected = 0;
        for (const event of batch.events) {
            try {
                // Get the previous event hash for this session
                const previousEvent = await this.db.auditEvent.findFirst({
                    where: {
                        ...this.tenantScope(),
                        agentId: batch.agentId,
                        sessionId: event.sessionId,
                    },
                    orderBy: { occurredAt: 'desc' },
                    select: { eventHash: true },
                });
                const previousHash = previousEvent?.eventHash ?? GENESIS_HASH;
                const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                const eventHash = computeEventHash(previousHash, {
                    eventId,
                    agentId: batch.agentId,
                    tenantId: this.tenantId,
                    occurredAt: event.occurredAt,
                    actionType: event.actionType,
                    toolName: event.toolName ?? null,
                    decision: event.decision,
                    riskScore: event.riskScore,
                });
                // Find or create the session
                let session = await this.db.agentSession.findFirst({
                    where: {
                        ...this.tenantScope(),
                        id: event.sessionId,
                    },
                });
                if (!session) {
                    session = await this.db.agentSession.create({
                        data: {
                            id: event.sessionId,
                            tenantId: this.tenantId,
                            agentId: batch.agentId,
                            status: 'ACTIVE',
                        },
                    });
                }
                await this.db.auditEvent.create({
                    data: {
                        id: eventId,
                        tenantId: this.tenantId,
                        agentId: batch.agentId,
                        sessionId: event.sessionId,
                        occurredAt: new Date(event.occurredAt),
                        processingMs: event.processingMs,
                        actionType: event.actionType.toUpperCase() || 'TOOL_CALL',
                        toolName: event.toolName ?? null,
                        toolTarget: event.toolTarget ?? null,
                        // Cast to Prisma.InputJsonValue for jsonb fields
                        actionParams: event.actionParams
                            ? event.actionParams
                            : undefined,
                        executionMs: event.executionMs ?? null,
                        policyDecision: event.decision.toUpperCase() || 'ALLOW',
                        policyVersion: event.policyVersion ?? null,
                        matchedRuleId: event.matchedRuleId ?? null,
                        matchedRuleIds: event.matchedRuleIds,
                        blockReason: event.blockReason ?? null,
                        riskScore: event.riskScore,
                        inputDataLabels: event.inputDataLabels,
                        outputDataLabels: event.outputDataLabels,
                        planningTraceSummary: event.planningTraceSummary ?? null,
                        ragSourceIds: event.ragSourceIds,
                        priorEventIds: event.priorEventIds,
                        previousHash,
                        eventHash,
                    },
                });
                accepted++;
            }
            catch {
                rejected++;
            }
        }
        return { accepted, rejected };
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
//# sourceMappingURL=audit.js.map