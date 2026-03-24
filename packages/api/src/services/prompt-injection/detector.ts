/**
 * AgentGuard — Prompt Injection Detection Orchestrator
 *
 * The central detector that combines:
 *   1. Builtin heuristic + pattern layer (no external deps, <1ms)
 *   2. Stacked external adapters (Lakera Guard, custom webhooks, etc.)
 *
 * Usage via policy YAML:
 *
 * ```yaml
 * checks:
 *   - type: prompt_injection
 *     sensitivity: high     # low | medium | high
 *     action: block         # block | warn | log
 *     adapters:
 *       - builtin           # always included
 *       - lakera            # optional, requires LAKERA_API_KEY
 * ```
 *
 * Sensitivity thresholds:
 *   - low:    confidence ≥ 80 → trigger
 *   - medium: confidence ≥ 60 → trigger
 *   - high:   confidence ≥ 40 → trigger
 *
 * Fusion strategy:
 *   - Any adapter reaching the sensitivity threshold triggers detection.
 *   - The final confidence score is the MAX across all adapters.
 *   - Adapter errors are non-fatal; builtin always runs.
 */

import { matchAllPatterns } from './patterns.js';
import { runHeuristics } from './heuristics.js';
import type { PatternMatch } from './patterns.js';
import type { HeuristicsResult } from './heuristics.js';
import type { AdapterResult, IInjectionAdapter } from './adapters/interface.js';

// ─── Configuration ─────────────────────────────────────────────────────────────

export type InjectionSensitivity = 'low' | 'medium' | 'high';
export type InjectionAction = 'block' | 'warn' | 'log';

export interface PromptInjectionConfig {
  sensitivity: InjectionSensitivity;
  action: InjectionAction;
  /** Names of enabled adapter types: 'builtin' | 'lakera' | 'webhook:*' */
  adapters?: string[];
}

// Confidence thresholds per sensitivity level (0–100)
const SENSITIVITY_THRESHOLDS: Record<InjectionSensitivity, number> = {
  low:    80,
  medium: 60,
  high:   40,
};

// ─── Detection Result ─────────────────────────────────────────────────────────

export interface InjectionDetectionResult {
  /** Whether an injection was detected given the configured sensitivity. */
  detected: boolean;

  /** Final confidence score 0–100 (max across all adapters). */
  confidence: number;

  /** The sensitivity level used for this evaluation. */
  sensitivity: InjectionSensitivity;

  /** The threshold that triggered detection (if detected). */
  threshold: number;

  /** Builtin detection details. */
  builtin: {
    patternMatches: PatternMatch[];
    heuristics: HeuristicsResult;
    confidence: number;
  };

  /** Results from external adapters (empty if only builtin used). */
  adapterResults: AdapterResult[];

  /** Which adapter(s) triggered detection. */
  triggeredBy: string[];

  /** ISO timestamp when detection ran. */
  evaluatedAt: string;

  /** Total detection duration in milliseconds. */
  durationMs: number;
}

// ─── Builtin Detection ────────────────────────────────────────────────────────

/**
 * Compute a 0–100 confidence score from patterns and heuristics.
 *
 * Scoring formula:
 *   - Pattern layer (70% weight): weighted sum of matched patterns, capped at 100
 *   - Heuristic layer (30% weight): heuristics aggregateScore
 *
 * A single critical pattern (weight ≥ 85) immediately produces ≥ 60 confidence.
 */
function computeBuiltinConfidence(
  patterns: PatternMatch[],
  heuristics: HeuristicsResult,
): number {
  // Pattern score: sum of top-5 pattern weights (normalised to 0–100)
  const patternScore = Math.min(
    100,
    patterns.slice(0, 5).reduce((acc, m) => acc + m.weight, 0) / 100 * 100,
  );

  const heuristicScore = heuristics.aggregateScore;

  const combined = patternScore * 0.70 + heuristicScore * 0.30;
  return Math.min(100, Math.round(combined));
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export class PromptInjectionDetector {
  private readonly adapters: IInjectionAdapter[];

  constructor(adapters: IInjectionAdapter[] = []) {
    this.adapters = adapters;
  }

  /**
   * Analyse a text input for prompt injection signals.
   *
   * @param input   The text to analyse
   * @param config  Policy-level configuration (sensitivity, action)
   */
  async detect(
    input: string,
    config: PromptInjectionConfig,
  ): Promise<InjectionDetectionResult> {
    const start = performance.now();
    const threshold = SENSITIVITY_THRESHOLDS[config.sensitivity];

    // ── Builtin layer (synchronous, always runs) ────────────────────────────
    const patternMatches = matchAllPatterns(input);
    const heuristics = runHeuristics(input);
    const builtinConfidence = computeBuiltinConfidence(patternMatches, heuristics);

    // ── External adapters (async, only if configured) ───────────────────────
    const enabledAdapters = config.adapters ?? ['builtin'];
    const shouldRunAdapters = enabledAdapters.some((a) => a !== 'builtin');

    const adapterResults: AdapterResult[] = [];
    if (shouldRunAdapters && this.adapters.length > 0) {
      const adapterPromises = this.adapters.map((adapter) =>
        adapter.detect(input).catch((err: unknown): AdapterResult => ({
          adapterName: adapter.name,
          injectionDetected: false,
          confidence: 0,
          error: String(err),
          rawResponse: null,
        })),
      );
      const settled = await Promise.all(adapterPromises);
      adapterResults.push(...settled);
    }

    // ── Fusion ──────────────────────────────────────────────────────────────
    const allConfidences: Array<{ name: string; confidence: number }> = [
      { name: 'builtin', confidence: builtinConfidence },
      ...adapterResults.map((r) => ({ name: r.adapterName, confidence: r.confidence })),
    ];

    const maxConfidence = Math.max(...allConfidences.map((a) => a.confidence));
    const triggeredBy = allConfidences
      .filter((a) => a.confidence >= threshold)
      .map((a) => a.name);

    // An adapter flagging (injectionDetected: true) always triggers regardless of confidence
    for (const ar of adapterResults) {
      if (ar.injectionDetected && !triggeredBy.includes(ar.adapterName)) {
        triggeredBy.push(ar.adapterName);
      }
    }

    const detected = triggeredBy.length > 0;

    return {
      detected,
      confidence: maxConfidence,
      sensitivity: config.sensitivity,
      threshold,
      builtin: {
        patternMatches,
        heuristics,
        confidence: builtinConfidence,
      },
      adapterResults,
      triggeredBy,
      evaluatedAt: new Date().toISOString(),
      durationMs: performance.now() - start,
    };
  }

  /**
   * Convenience: synchronous-only detection using only the builtin layer.
   * Fast path for time-sensitive contexts. No external adapter calls.
   */
  detectSync(input: string, config: PromptInjectionConfig): InjectionDetectionResult {
    const start = performance.now();
    const threshold = SENSITIVITY_THRESHOLDS[config.sensitivity];

    const patternMatches = matchAllPatterns(input);
    const heuristics = runHeuristics(input);
    const builtinConfidence = computeBuiltinConfidence(patternMatches, heuristics);

    const triggeredBy: string[] = [];
    if (builtinConfidence >= threshold) triggeredBy.push('builtin');

    return {
      detected: triggeredBy.length > 0,
      confidence: builtinConfidence,
      sensitivity: config.sensitivity,
      threshold,
      builtin: { patternMatches, heuristics, confidence: builtinConfidence },
      adapterResults: [],
      triggeredBy,
      evaluatedAt: new Date().toISOString(),
      durationMs: performance.now() - start,
    };
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _defaultDetector: PromptInjectionDetector | null = null;

/**
 * Returns a shared default detector instance with no external adapters.
 * Use this for the builtin-only fast path inside the evaluation hot path.
 */
export function getDefaultDetector(): PromptInjectionDetector {
  if (!_defaultDetector) {
    _defaultDetector = new PromptInjectionDetector([]);
  }
  return _defaultDetector;
}

/**
 * Build a detector with additional external adapters based on policy config.
 *
 * @param adapterNames  List of adapter names from policy YAML ('builtin', 'lakera', 'webhook:...')
 * @param externalAdapters  Pre-built adapter instances to include
 */
export function buildDetector(
  adapterNames: string[],
  externalAdapters: IInjectionAdapter[],
): PromptInjectionDetector {
  const filtered = externalAdapters.filter((a) => adapterNames.includes(a.name));
  return new PromptInjectionDetector(filtered);
}

// ─── Default policy config ────────────────────────────────────────────────────

export const DEFAULT_INJECTION_CONFIG: PromptInjectionConfig = {
  sensitivity: 'medium',
  action: 'block',
  adapters: ['builtin'],
};
