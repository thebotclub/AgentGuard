/**
 * AgentGuard Audit Logger
 *
 * Tamper-evident, hash-chained, append-only JSON-lines log.
 * Implements DATA_MODEL.md §8 Audit Log Integrity — Hash Chain.
 *
 * Chain: each event records:
 *   - previousHash: the eventHash of the preceding event
 *   - eventHash: SHA-256(previousHash | canonicalPayload)
 *
 * The GENESIS_HASH ('0'.repeat(64)) is used as previousHash for the first event.
 *
 * Tampering detection: re-compute the chain from GENESIS_HASH; any modification
 * or deletion produces a broken chain detectable at verification time.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import {
  type AuditEvent,
  type AgentContext,
  type ActionRequest,
  type PolicyDecision,
  GENESIS_HASH,
} from './types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Audit Logger ─────────────────────────────────────────────────────────────

export class AuditLogger {
  private readonly filePath: string;
  private readonly redactFields: Set<string>;
  private seq = 0;
  private lastHash: string = GENESIS_HASH;

  constructor(options: AuditLoggerOptions) {
    this.filePath = options.filePath;
    this.redactFields = new Set(
      (options.redactFields ?? []).map((f) => f.toLowerCase()),
    );
    this._restoreChainState();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Log a completed action (policy decision + optional tool output / error).
   * Returns the AuditEvent that was written.
   *
   * This is the only write path — events are never updated or deleted.
   */
  log(input: LogActionInput): AuditEvent {
    const { request, ctx, decision, result, error } = input;

    const previousHash = this.lastHash;

    const partial: Omit<AuditEvent, 'eventHash' | 'previousHash'> = {
      seq: this.seq++,
      timestamp: new Date().toISOString(),
      agentId: ctx.agentId,
      sessionId: ctx.sessionId,
      tenantId: ctx.tenantId,
      policyVersion: ctx.policyVersion,
      tool: request.tool,
      params: this._redact(request.params),
      decision: decision.result,
      matchedRuleId: decision.matchedRuleId,
      monitorRuleIds: decision.monitorRuleIds,
      riskScore: decision.riskScore,
      reason: decision.reason ?? '',
      durationMs: decision.durationMs,
      ...(result !== undefined ? { result } : {}),
      ...(error !== undefined ? { error: error.message } : {}),
    };

    // Compute hash chain per DATA_MODEL.md §8.1
    const payload: HashablePayload = {
      eventId: `${partial.seq}:${partial.timestamp}`,
      agentId: partial.agentId,
      tenantId: partial.tenantId ?? '',
      occurredAt: partial.timestamp,
      actionType: 'TOOL_CALL',
      toolName: partial.tool,
      decision: partial.decision,
      riskScore: partial.riskScore,
    };

    const eventHash = computeEventHash(previousHash, payload);
    this.lastHash = eventHash;

    const event: AuditEvent = {
      ...partial,
      eventHash,
      previousHash,
    };

    this._write(event);
    return event;
  }

  /**
   * Verify the integrity of all entries in the log file.
   * Returns a VerificationResult describing any tampering found.
   */
  verify(): VerificationResult {
    if (!existsSync(this.filePath)) {
      return { valid: true, entryCount: 0, errors: [] };
    }

    const lines = readFileSync(this.filePath, 'utf-8')
      .split('\n')
      .filter(Boolean);

    const errors: string[] = [];
    let prevHash = GENESIS_HASH;
    let firstBrokenAt: VerificationResult['firstBrokenAt'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      let event: AuditEvent;
      try {
        event = JSON.parse(line) as AuditEvent;
      } catch {
        errors.push(`Line ${i + 1}: invalid JSON`);
        continue;
      }

      // Verify chain link (previousHash must equal previous event's eventHash)
      if (event.previousHash !== prevHash) {
        const msg = `Entry seq=${event.seq}: previousHash mismatch — expected "${prevHash.slice(0, 16)}…", got "${event.previousHash.slice(0, 16)}…"`;
        errors.push(msg);
        if (!firstBrokenAt) {
          firstBrokenAt = {
            seq: event.seq,
            expected: prevHash,
            actual: event.previousHash,
          };
        }
      }

      // Verify content hash
      const payload: HashablePayload = {
        eventId: `${event.seq}:${event.timestamp}`,
        agentId: event.agentId,
        tenantId: event.tenantId ?? '',
        occurredAt: event.timestamp,
        actionType: 'TOOL_CALL',
        toolName: event.tool,
        decision: event.decision,
        riskScore: event.riskScore,
      };
      const expectedHash = computeEventHash(event.previousHash, payload);

      if (event.eventHash !== expectedHash) {
        const msg = `Entry seq=${event.seq}: eventHash mismatch — content may have been tampered with`;
        errors.push(msg);
        if (!firstBrokenAt) {
          firstBrokenAt = {
            seq: event.seq,
            expected: expectedHash,
            actual: event.eventHash,
          };
        }
      }

      prevHash = event.eventHash;
    }

    return {
      valid: errors.length === 0,
      entryCount: lines.filter(Boolean).length,
      firstBrokenAt,
      errors,
    };
  }

  /**
   * Read all entries from the log file and return them as an array.
   */
  readAll(): AuditEvent[] {
    if (!existsSync(this.filePath)) return [];
    return readFileSync(this.filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEvent);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _write(event: AuditEvent): void {
    appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf-8');
  }

  /**
   * On startup, read the last entry from an existing log to continue
   * the hash chain correctly across process restarts.
   */
  private _restoreChainState(): void {
    if (!existsSync(this.filePath)) return;
    const content = readFileSync(this.filePath, 'utf-8').trimEnd();
    if (!content) return;

    const lines = content.split('\n').filter(Boolean);
    const lastLine = lines[lines.length - 1];
    if (!lastLine) return;

    try {
      const last = JSON.parse(lastLine) as AuditEvent;
      this.seq = last.seq + 1;
      this.lastHash = last.eventHash;
    } catch {
      // Corrupted last line — start fresh chain but preserve sequence count
      this.seq = lines.length;
      this.lastHash = GENESIS_HASH;
    }
  }

  /**
   * Redact sensitive field values from a params object.
   * Any key matching a redactField (case-insensitive) is replaced with "[REDACTED]".
   */
  private _redact(
    params: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!params || this.redactFields.size === 0) return params;

    return Object.fromEntries(
      Object.entries(params).map(([k, v]) =>
        this.redactFields.has(k.toLowerCase()) ? [k, '[REDACTED]'] : [k, v],
      ),
    );
  }
}

// ─── Hash Chain Functions (exported for verification endpoint) ─────────────────

/**
 * Compute the event hash for a given payload.
 * Implements DATA_MODEL.md §8.1:
 *   SHA-256(previousHash + "|" + canonicalJSON(payload))
 */
export function computeEventHash(previousHash: string, payload: HashablePayload): string {
  // Canonical JSON: keys sorted alphabetically for determinism
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  return createHash('sha256')
    .update(`${previousHash}|${canonical}`)
    .digest('hex');
}

/**
 * Verify a chain of events (utility function for the control plane endpoint).
 * Returns the first broken link if found.
 */
export function verifyEventChain(events: AuditEvent[]): {
  chainValid: boolean;
  eventCount: number;
  firstBrokenAt?: { eventId: string; position: number; expected: string; actual: string };
} {
  let previousHash = GENESIS_HASH;

  for (const [i, event] of events.entries()) {
    if (event.previousHash !== previousHash) {
      return {
        chainValid: false,
        eventCount: events.length,
        firstBrokenAt: {
          eventId: `seq:${event.seq}`,
          position: i,
          expected: previousHash,
          actual: event.previousHash,
        },
      };
    }

    const payload: HashablePayload = {
      eventId: `${event.seq}:${event.timestamp}`,
      agentId: event.agentId,
      tenantId: event.tenantId ?? '',
      occurredAt: event.timestamp,
      actionType: 'TOOL_CALL',
      toolName: event.tool,
      decision: event.decision,
      riskScore: event.riskScore,
    };

    const expected = computeEventHash(previousHash, payload);
    if (event.eventHash !== expected) {
      return {
        chainValid: false,
        eventCount: events.length,
        firstBrokenAt: {
          eventId: `seq:${event.seq}`,
          position: i,
          expected,
          actual: event.eventHash,
        },
      };
    }

    previousHash = event.eventHash;
  }

  return { chainValid: true, eventCount: events.length };
}
