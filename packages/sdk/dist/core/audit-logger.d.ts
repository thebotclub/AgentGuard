import { type AuditEvent, type AgentContext, type ActionRequest, type PolicyDecision } from './types.js';
export interface AuditLoggerOptions {
    /** Absolute or relative path to the .jsonl log file */
    filePath: string;
    /**
     * Field names (in params) that should be redacted.
     * E.g. ["password", "ssn", "credit_card", "token"]
     */
    redactFields?: string[];
}
export interface LogActionInput {
    request: ActionRequest;
    ctx: AgentContext;
    decision: PolicyDecision;
    /** Raw result returned by the tool (only present if allowed + ran) */
    result?: unknown;
    /** Error thrown by the tool (only present if it threw) */
    error?: Error;
}
export interface HashablePayload {
    eventId: string;
    agentId: string;
    tenantId: string;
    occurredAt: string;
    actionType: string;
    toolName: string;
    decision: string;
    riskScore: number;
}
export interface VerificationResult {
    valid: boolean;
    entryCount: number;
    firstBrokenAt?: {
        seq: number;
        eventId?: string;
        expected: string;
        actual: string;
    };
    errors: string[];
}
export declare class AuditLogger {
    private readonly filePath;
    private readonly redactFields;
    private seq;
    private lastHash;
    constructor(options: AuditLoggerOptions);
    /**
     * Log a completed action (policy decision + optional tool output / error).
     * Returns the AuditEvent that was written.
     *
     * This is the only write path — events are never updated or deleted.
     */
    log(input: LogActionInput): AuditEvent;
    /**
     * Verify the integrity of all entries in the log file.
     * Returns a VerificationResult describing any tampering found.
     */
    verify(): VerificationResult;
    /**
     * Read all entries from the log file and return them as an array.
     */
    readAll(): AuditEvent[];
    private _write;
    /**
     * On startup, read the last entry from an existing log to continue
     * the hash chain correctly across process restarts.
     */
    private _restoreChainState;
    /**
     * Redact sensitive field values from a params object.
     * Any key matching a redactField (case-insensitive) is replaced with "[REDACTED]".
     */
    private _redact;
}
/**
 * Compute the event hash for a given payload.
 * Implements DATA_MODEL.md §8.1:
 *   SHA-256(previousHash + "|" + canonicalJSON(payload))
 */
export declare function computeEventHash(previousHash: string, payload: HashablePayload): string;
/**
 * Verify a chain of events (utility function for the control plane endpoint).
 * Returns the first broken link if found.
 */
export declare function verifyEventChain(events: AuditEvent[]): {
    chainValid: boolean;
    eventCount: number;
    firstBrokenAt?: {
        eventId: string;
        position: number;
        expected: string;
        actual: string;
    };
};
//# sourceMappingURL=audit-logger.d.ts.map