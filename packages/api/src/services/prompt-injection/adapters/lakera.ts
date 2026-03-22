/**
 * AgentGuard — Lakera Guard Adapter
 *
 * Integrates with the Lakera Guard API (https://platform.lakera.ai/)
 * for enterprise-grade prompt injection detection.
 *
 * Lakera Guard is the industry leader in prompt injection detection,
 * acquired by Check Point in 2025. Requires LAKERA_API_KEY env var.
 *
 * API Reference: https://platform.lakera.ai/docs/api
 *
 * Interface contract: IInjectionAdapter (see detector.ts)
 */

import type { AdapterResult, IInjectionAdapter, AdapterConfig } from './interface.js';

// ─── Lakera API Types ─────────────────────────────────────────────────────────

interface LakeraCategory {
  flagged: boolean;
}

interface LakeraCategories {
  prompt_injection: LakeraCategory;
  jailbreak: LakeraCategory;
  unknown_links: LakeraCategory;
  relevant_language: LakeraCategory;
  pii?: LakeraCategory;
}

interface LakeraCategoryScores {
  prompt_injection: number;
  jailbreak: number;
  unknown_links: number;
  relevant_language: number;
  pii?: number;
}

interface LakeraGuardResponse {
  model: string;
  results: Array<{
    categories: LakeraCategories;
    category_scores: LakeraCategoryScores;
    flagged: boolean;
    payload: Record<string, unknown>;
  }>;
  dev_info?: {
    git_revision: string;
    git_timestamp: string;
  };
}

// ─── Adapter Config ───────────────────────────────────────────────────────────

export interface LakeraAdapterConfig extends AdapterConfig {
  apiKey?: string;          // Falls back to LAKERA_API_KEY env var
  apiUrl?: string;          // Default: https://api.lakera.ai/v2/guard
  timeoutMs?: number;       // Default: 3000ms
  model?: string;           // Optional model override
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class LakeraGuardAdapter implements IInjectionAdapter {
  readonly name = 'lakera';

  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly model?: string;

  constructor(config: LakeraAdapterConfig = {}) {
    const key = config.apiKey ?? process.env['LAKERA_API_KEY'];
    if (!key) {
      throw new Error(
        '[LakeraGuardAdapter] LAKERA_API_KEY is required. Set the LAKERA_API_KEY environment variable or pass apiKey in config.',
      );
    }
    this.apiKey = key;
    this.apiUrl = config.apiUrl ?? 'https://api.lakera.ai/v2/guard';
    this.timeoutMs = config.timeoutMs ?? 3_000;
    this.model = config.model;
  }

  async detect(input: string): Promise<AdapterResult> {
    const body: Record<string, unknown> = {
      messages: [{ role: 'user', content: input }],
    };
    if (this.model) body['model'] = this.model;

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        adapterName: this.name,
        injectionDetected: false,
        confidence: 0,
        error: `Lakera Guard request failed: ${msg}`,
        rawResponse: null,
      };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        adapterName: this.name,
        injectionDetected: false,
        confidence: 0,
        error: `Lakera Guard API error ${response.status}: ${text.slice(0, 200)}`,
        rawResponse: null,
      };
    }

    let data: LakeraGuardResponse;
    try {
      data = (await response.json()) as LakeraGuardResponse;
    } catch {
      return {
        adapterName: this.name,
        injectionDetected: false,
        confidence: 0,
        error: 'Lakera Guard: invalid JSON response',
        rawResponse: null,
      };
    }

    const result = data.results?.[0];
    if (!result) {
      return {
        adapterName: this.name,
        injectionDetected: false,
        confidence: 0,
        error: 'Lakera Guard: empty results array',
        rawResponse: data as unknown as Record<string, unknown>,
      };
    }

    const flagged = result.flagged;
    // Map Lakera's category scores to a 0–100 confidence
    const piScore = (result.category_scores.prompt_injection ?? 0) * 100;
    const jbScore = (result.category_scores.jailbreak ?? 0) * 100;
    const confidence = Math.round(Math.max(piScore, jbScore));

    const categories: string[] = [];
    if (result.categories.prompt_injection?.flagged) categories.push('prompt_injection');
    if (result.categories.jailbreak?.flagged) categories.push('jailbreak');
    if (result.categories.unknown_links?.flagged) categories.push('unknown_links');

    return {
      adapterName: this.name,
      injectionDetected: flagged,
      confidence,
      categories,
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }
}

/**
 * Factory: creates a LakeraGuardAdapter if LAKERA_API_KEY is available,
 * returns null otherwise (so callers can opt in gracefully).
 */
export function createLakeraAdapter(config: LakeraAdapterConfig = {}): LakeraGuardAdapter | null {
  const key = config.apiKey ?? process.env['LAKERA_API_KEY'];
  if (!key) return null;
  try {
    return new LakeraGuardAdapter(config);
  } catch {
    return null;
  }
}
