/**
 * AgentGuard — Detection Engine
 *
 * Orchestrates primary + fallback detection plugins.
 * Always returns a result — never throws.
 */

import type { DetectionPlugin, DetectionResult, DetectionInput } from './types.js';

export const DEFAULT_DETECTION_THRESHOLD = 0.7;

export class DetectionEngine {
  private readonly primary: DetectionPlugin;
  private readonly fallback: DetectionPlugin;
  readonly threshold: number;

  constructor(
    primary: DetectionPlugin,
    fallback: DetectionPlugin,
    threshold: number = DEFAULT_DETECTION_THRESHOLD,
  ) {
    this.primary = primary;
    this.fallback = fallback;
    this.threshold = threshold;
  }

  /**
   * Run detection. Tries the primary plugin; if it throws, falls back to
   * the secondary. Never propagates errors to the caller.
   */
  async detect(input: DetectionInput): Promise<DetectionResult> {
    try {
      const result = await this.primary.detect(input);
      return result;
    } catch (_primaryErr) {
      try {
        const fallbackResult = await this.fallback.detect(input);
        return fallbackResult;
      } catch (_fallbackErr) {
        // Both plugins failed — return safe default so evaluation continues
        return {
          detected: false,
          score: 0,
          category: 'safe',
          provider: 'heuristic',
        };
      }
    }
  }

  /**
   * Returns true when the result score meets or exceeds the configured threshold.
   */
  isAboveThreshold(result: DetectionResult): boolean {
    return result.detected && result.score >= this.threshold;
  }
}
