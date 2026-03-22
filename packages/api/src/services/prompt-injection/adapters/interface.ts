/**
 * AgentGuard — Injection Adapter Interface
 *
 * Defines the contract that all prompt injection detection adapters must
 * implement. Allows swapping or stacking detectors without modifying the
 * core orchestrator.
 */

// ─── Adapter Result ───────────────────────────────────────────────────────────

export interface AdapterResult {
  /** Name of the adapter that produced this result. */
  adapterName: string;

  /** Whether the adapter considers this input an injection attempt. */
  injectionDetected: boolean;

  /** Confidence score 0–100. 0 = clean, 100 = definite injection. */
  confidence: number;

  /** Triggered category labels (e.g. 'prompt_injection', 'jailbreak'). */
  categories?: string[];

  /** Raw provider response (for logging / audit trail). */
  rawResponse: Record<string, unknown> | null;

  /** Error message if the adapter failed to complete (non-fatal). */
  error?: string;
}

// ─── Adapter Config Base ──────────────────────────────────────────────────────

export interface AdapterConfig {
  /** Request timeout in milliseconds. Default: 3000. */
  timeoutMs?: number;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface IInjectionAdapter {
  /** Unique name identifying this adapter (used in logs and audit trail). */
  readonly name: string;

  /**
   * Analyse a single text input for prompt injection signals.
   *
   * Implementations MUST:
   * - Never throw (catch internally and return error in AdapterResult)
   * - Respect the timeout configured at construction time
   * - Be stateless between calls (safe for concurrent use)
   *
   * @param input The text to analyse (user message, tool param, etc.)
   * @returns AdapterResult with detection outcome and confidence
   */
  detect(input: string): Promise<AdapterResult>;
}
