/**
 * AgentGuard — Generic Webhook Adapter
 *
 * Sends input text to any custom HTTP endpoint for prompt injection analysis.
 * Designed for teams running their own in-house detection models or proxies.
 *
 * Request format (POST → webhookUrl):
 * {
 *   "input": "<text to analyse>",
 *   "metadata": { "agentId": "...", "tenantId": "..." }  // optional
 * }
 *
 * Expected response shape (either form accepted):
 * {
 *   "injectionDetected": true,
 *   "confidence": 85,
 *   "categories": ["prompt_injection"],   // optional
 *   "details": "..."                      // optional
 * }
 * — OR the adapter will also interpret a boolean "flagged" + numeric "score" (0-1) format.
 */

import type { AdapterResult, IInjectionAdapter, AdapterConfig } from './interface.js';

// ─── Webhook Adapter Config ────────────────────────────────────────────────────

export interface WebhookAdapterConfig extends AdapterConfig {
  /** Required: full URL of the webhook endpoint. */
  webhookUrl: string;

  /** Optional: additional headers (e.g. Authorization: Bearer ...). */
  headers?: Record<string, string>;

  /** Optional: static metadata included in each request body. */
  metadata?: Record<string, string>;

  /** Request timeout in milliseconds. Default: 3000. */
  timeoutMs?: number;
}

// ─── Expected response shapes ─────────────────────────────────────────────────

interface WebhookResponseV1 {
  injectionDetected: boolean;
  confidence: number;
  categories?: string[];
  details?: string;
}

interface WebhookResponseV2 {
  flagged: boolean;
  score: number; // 0–1
  categories?: string[];
}

type WebhookResponse = WebhookResponseV1 | WebhookResponseV2 | Record<string, unknown>;

// ─── Implementation ───────────────────────────────────────────────────────────

export class WebhookAdapter implements IInjectionAdapter {
  readonly name: string;

  private readonly webhookUrl: string;
  private readonly headers: Record<string, string>;
  private readonly metadata: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(config: WebhookAdapterConfig) {
    if (!config.webhookUrl) {
      throw new Error('[WebhookAdapter] webhookUrl is required.');
    }
    this.webhookUrl = config.webhookUrl;
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    this.metadata = config.metadata ?? {};
    this.timeoutMs = config.timeoutMs ?? 3_000;
    // Derive adapter name from hostname for readability in logs
    try {
      this.name = `webhook:${new URL(this.webhookUrl).hostname}`;
    } catch {
      this.name = 'webhook:custom';
    }
  }

  async detect(input: string): Promise<AdapterResult> {
    const body = JSON.stringify({
      input,
      ...(Object.keys(this.metadata).length > 0 ? { metadata: this.metadata } : {}),
    });

    let response: Response;
    try {
      response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: this.headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        adapterName: this.name,
        injectionDetected: false,
        confidence: 0,
        error: `Webhook request failed: ${msg}`,
        rawResponse: null,
      };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        adapterName: this.name,
        injectionDetected: false,
        confidence: 0,
        error: `Webhook ${response.status}: ${text.slice(0, 200)}`,
        rawResponse: null,
      };
    }

    let data: WebhookResponse;
    try {
      data = (await response.json()) as WebhookResponse;
    } catch {
      return {
        adapterName: this.name,
        injectionDetected: false,
        confidence: 0,
        error: 'Webhook: invalid JSON response',
        rawResponse: null,
      };
    }

    return this.parseResponse(data);
  }

  private parseResponse(data: WebhookResponse): AdapterResult {
    // V1 shape: { injectionDetected, confidence, categories? }
    if ('injectionDetected' in data && typeof data.injectionDetected === 'boolean') {
      const v1 = data as WebhookResponseV1;
      return {
        adapterName: this.name,
        injectionDetected: v1.injectionDetected,
        confidence: Math.min(100, Math.max(0, Math.round(v1.confidence ?? 0))),
        categories: v1.categories,
        rawResponse: data as Record<string, unknown>,
      };
    }

    // V2 shape: { flagged, score (0-1), categories? }
    if ('flagged' in data && typeof data.flagged === 'boolean') {
      const v2 = data as WebhookResponseV2;
      const score = typeof v2.score === 'number' ? v2.score : 0;
      return {
        adapterName: this.name,
        injectionDetected: v2.flagged,
        confidence: Math.round(Math.min(1, Math.max(0, score)) * 100),
        categories: v2.categories,
        rawResponse: data as Record<string, unknown>,
      };
    }

    // Unrecognised shape
    return {
      adapterName: this.name,
      injectionDetected: false,
      confidence: 0,
      error: 'Webhook: unrecognised response shape (expected injectionDetected or flagged field)',
      rawResponse: data as Record<string, unknown>,
    };
  }
}
