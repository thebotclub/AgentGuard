import type { AuditEvent } from '@prisma/client';
import type { ServiceContext, QueryAuditEventsInput, TelemetryBatchInput } from '@agentguard/shared';
import { BaseService } from './base.js';
import type { PrismaClient } from '../lib/prisma.js';
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
export declare class AuditService extends BaseService {
    constructor(db: PrismaClient, ctx: ServiceContext);
    queryEvents(query: QueryAuditEventsInput): Promise<AuditEvent[]>;
    getEvent(eventId: string): Promise<AuditEvent>;
    /**
     * Ingest a telemetry batch from the SDK.
     * Creates AuditEvents with hash chain continuity.
     */
    ingestBatch(batch: TelemetryBatchInput): Promise<{
        accepted: number;
        rejected: number;
    }>;
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