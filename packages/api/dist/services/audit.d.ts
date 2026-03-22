import type { AuditEvent } from '@prisma/client';
import type { ServiceContext, QueryAuditEventsInput, TelemetryBatchInput } from '@agentguard/shared';
import { BaseService } from './base.js';
import type { PrismaClient } from '../lib/prisma.js';
import type { Redis } from '../lib/redis.js';
export interface ChainVerificationResult {
    sessionId: string;
    eventCount: number;
    chainValid: boolean;
    firstBrokenAt?: {
        eventId: string;
        position: number;
        expected?: string;
        actual?: string;
    };
    verifiedAt: string;
}
export interface IngestResult {
    accepted: number;
    rejected: number;
    errors: Array<{
        clientEventId: string;
        reason: string;
    }>;
}
export declare class AuditService extends BaseService {
    private readonly redis;
    private readonly anomalyService;
    constructor(db: PrismaClient, ctx: ServiceContext, redis: Redis);
    queryEvents(query: QueryAuditEventsInput): Promise<AuditEvent[]>;
    getEvent(eventId: string): Promise<AuditEvent>;
    /**
     * Ingest a telemetry batch from the SDK.
     * Creates AuditEvents with hash chain continuity.
     *
     * Sequential per session — advisory locks prevent hash-chain forks
     * when concurrent batches arrive for the same session.
     */
    ingestBatch(batch: TelemetryBatchInput): Promise<IngestResult>;
    /**
     * Ingest a single event within a session.
     * Gets previous hash, computes new hash, writes AuditEvent + AnomalyScore atomically.
     */
    private ingestSingleEvent;
    /**
     * Verify the hash chain integrity for a session.
     */
    verifySessionChain(sessionId: string): Promise<ChainVerificationResult>;
}
interface HashableEventPayload {
    eventId: string;
    agentId: string;
    tenantId: string;
    occurredAt: string;
    actionType: string;
    toolName: string | null;
    decision: string;
    riskScore: number;
}
export declare function computeEventHash(previousHash: string, event: HashableEventPayload): string;
export {};
//# sourceMappingURL=audit.d.ts.map