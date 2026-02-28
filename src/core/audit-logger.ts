/**
 * AgentGuard Audit Logger
 *
 * Writes a tamper-evident, hash-chained JSON-lines log of every agent action.
 * Each entry carries:
 *   - A SHA-256 hash of its own content fields
 *   - The hash of the previous entry (chain link)
 *
 * To detect tampering: re-hash each entry's content and verify the stored
 * `hash` matches; then verify each entry's `chainHash` equals the previous
 * entry's `hash`.  Any modification breaks the chain.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import type {
  AuditEvent,
  AgentContext,
  Action,
  EvaluationResult,
} from '@/core/types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditLoggerOptions {
  /** Absolute or relative path to the .jsonl log file */
  filePath: string;
  /**
   * Field names whose values should be redacted (replaced with "[REDACTED]")
   * in the stored parameters.  E.g. ["password", "ssn", "credit_card"]
   */
  redactFields?: string[];
}

export interface LogActionInput {
  action: Action;
  ctx: AgentContext;
  evaluation: EvaluationResult;
  /** Raw result returned by the tool (only present if allowed + ran) */
  result?: unknown;
  /** Error thrown by the tool (only present if allowed + threw) */
  error?: Error;
}

// ─── Audit Logger ─────────────────────────────────────────────────────────────

export class AuditLogger {
  private readonly filePath: string;
  private readonly redactFields: Set<string>;
  private seq = 0;
  private lastHash = 'GENESIS';

  constructor(options: AuditLoggerOptions) {
    this.filePath = options.filePath;
    this.redactFields = new Set(
      (options.redactFields ?? []).map((f) => f.toLowerCase()),
    );
    this._restoreChainState();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Log a completed action (evaluation result + optional tool output / error).
   * Returns the AuditEvent that was written.
   */
  log(input: LogActionInput): AuditEvent {
    const { action, ctx, evaluation, result, error } = input;

    const event: AuditEvent = {
      seq: this.seq++,
      timestamp: new Date().toISOString(),
      agentId: ctx.agentId,
      sessionId: ctx.sessionId,
      policyVersion: ctx.policyVersion,
      tool: action.tool,
      parameters: this._redact(action.parameters),
      verdict: evaluation.verdict,
      reason: evaluation.reason,
      latencyMs: evaluation.latencyMs,
      ...(result !== undefined ? { result } : {}),
      ...(error !== undefined ? { error: error.message } : {}),
      hash: '', // filled below
      chainHash: this.lastHash,
    };

    event.hash = this._hashEvent(event);
    this.lastHash = event.hash;

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
    let prevHash = 'GENESIS';

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

      // Verify chain link
      if (event.chainHash !== prevHash) {
        errors.push(
          `Entry seq=${event.seq}: chainHash mismatch — expected "${prevHash}", got "${event.chainHash}"`,
        );
      }

      // Verify content hash
      const expectedHash = this._hashEvent({ ...event, hash: '' });
      if (event.hash !== expectedHash) {
        errors.push(
          `Entry seq=${event.seq}: content hash mismatch — log may have been tampered with`,
        );
      }

      prevHash = event.hash;
    }

    return {
      valid: errors.length === 0,
      entryCount: lines.filter(Boolean).length,
      errors,
    };
  }

  /**
   * Read all entries from the log file and return them as an array.
   * Useful for reporting and demo output.
   */
  readAll(): AuditEvent[] {
    if (!existsSync(this.filePath)) return [];
    return readFileSync(this.filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEvent);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Compute the SHA-256 hash of the stable content fields of an event.
   * The `hash` field itself is excluded (set to '' before hashing).
   */
  private _hashEvent(event: AuditEvent): string {
    const content = [
      event.seq,
      event.timestamp,
      event.agentId,
      event.sessionId,
      event.policyVersion,
      event.tool,
      event.verdict,
      event.reason,
      event.latencyMs,
      event.chainHash,
      // Parameters are included (after redaction) so tampering with them is detectable
      JSON.stringify(event.parameters ?? null),
    ].join('|');

    return createHash('sha256').update(content).digest('hex');
  }

  /** Append a single event to the JSONL file. */
  private _write(event: AuditEvent): void {
    appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf-8');
  }

  /**
   * On startup, read the last entry from an existing log so we can continue
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
      this.lastHash = last.hash;
    } catch {
      // Corrupted last line — start fresh chain but preserve seq
      this.seq = lines.length;
    }
  }

  /**
   * Redact sensitive field values from a parameters object.
   * Any key matching a redact field (case-insensitive) is replaced.
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

// ─── Verification result ──────────────────────────────────────────────────────

export interface VerificationResult {
  valid: boolean;
  entryCount: number;
  errors: string[];
}
