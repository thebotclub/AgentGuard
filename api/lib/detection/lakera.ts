/**
 * AgentGuard — Lakera Guard Detection Adapter
 *
 * Optional external detection provider. Falls back to the supplied
 * fallback plugin if LAKERA_API_KEY is not set or if the API call fails.
 */

import type { DetectionPlugin, DetectionResult, DetectionInput } from './types.js';

const LAKERA_API_URL = 'https://api.lakera.ai/v2/guard';
const TIMEOUT_MS = 2000;

export class LakeraDetectionPlugin implements DetectionPlugin {
  readonly name = 'lakera';

  private readonly apiKey: string | undefined;
  private readonly fallback: DetectionPlugin;

  constructor(fallback: DetectionPlugin, apiKey?: string) {
    this.apiKey = apiKey ?? process.env['LAKERA_API_KEY'];
    this.fallback = fallback;
  }

  async detect(input: DetectionInput): Promise<DetectionResult> {
    if (!this.apiKey) {
      // No API key configured — delegate to fallback silently
      const result = await this.fallback.detect(input);
      return { ...result, provider: 'heuristic' };
    }

    try {
      return await this.callLakeraApi(input);
    } catch {
      // Lakera unavailable or timed out — use fallback
      const result = await this.fallback.detect(input);
      return { ...result, provider: 'heuristic' };
    }
  }

  private async callLakeraApi(input: DetectionInput): Promise<DetectionResult> {
    // Build the content to scan: combine tool name, inputs, and recent history
    const contentParts: string[] = [];

    contentParts.push(`Tool: ${input.toolName}`);

    const inputValues = this.flattenToStrings(input.toolInput);
    if (inputValues.length > 0) {
      contentParts.push(`Params: ${inputValues.join(' ')}`);
    }

    if (input.messageHistory && input.messageHistory.length > 0) {
      const recent = input.messageHistory.slice(-5);
      contentParts.push(
        ...recent.map((m) => `${m.role}: ${m.content}`),
      );
    }

    const content = contentParts.join('\n');

    const body = JSON.stringify({
      messages: [{ role: 'user', content }],
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(LAKERA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      throw new Error(`Lakera API error: ${res.status}`);
    }

    const data = (await res.json()) as LakeraResponse;
    return this.parseResponse(data);
  }

  private parseResponse(data: LakeraResponse): DetectionResult {
    // Lakera v2 returns a `results` array with category flags
    const results = data.results ?? [];
    const flagged = results.some((r) => r.flagged);

    // Map Lakera categories to our categories
    const injectionResult = results.find((r) => r.category === 'prompt_injection');
    const jailbreakResult = results.find((r) => r.category === 'jailbreak');

    let category = 'safe';
    let score = 0;

    if (jailbreakResult?.flagged) {
      category = 'jailbreak';
      score = jailbreakResult.score ?? 0.9;
    } else if (injectionResult?.flagged) {
      category = 'prompt_injection';
      score = injectionResult.score ?? 0.9;
    } else if (flagged) {
      category = 'prompt_injection';
      score = 0.8;
    }

    return {
      detected: flagged,
      score,
      category,
      provider: 'lakera',
    };
  }

  private flattenToStrings(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap((v) => this.flattenToStrings(v));
    if (value !== null && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).flatMap((v) =>
        this.flattenToStrings(v),
      );
    }
    return [];
  }
}

// ── Lakera API response types ──────────────────────────────────────────────

interface LakeraGuardResult {
  category: string;
  flagged: boolean;
  score?: number;
}

interface LakeraResponse {
  results?: LakeraGuardResult[];
  flagged?: boolean;
}
