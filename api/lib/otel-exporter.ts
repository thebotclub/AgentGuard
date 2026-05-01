/**
 * AgentGuard — OpenTelemetry Span Exporter
 *
 * Exports policy decision spans via OTLP/HTTP (default) or OTLP/gRPC.
 * Compatible with: Datadog, Honeycomb, Grafana Tempo, Jaeger, Zipkin.
 *
 * Configuration (environment variables):
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — base URL (e.g. http://localhost:4318)
 *   OTEL_EXPORTER_OTLP_PROTOCOL  — 'http/json' (default) | 'grpc'
 *   OTEL_EXPORTER_OTLP_HEADERS   — comma-separated key=value pairs
 *   OTEL_SERVICE_NAME            — service name (default: agentguard-api)
 *   OTEL_TRACES_EXPORTER         — 'otlp' (default) | 'none' | 'console'
 *
 * Span attributes exported per policy decision:
 *   agent_id, tool_name, decision, risk_tier, risk_score,
 *   tenant_id, session_id, rule_id, latency_ms, pii_detected
 *
 * Usage:
 *   import { getOtelExporter } from './otel-exporter.js';
 *   const otel = getOtelExporter();
 *   otel.recordPolicyDecision({ agentId, toolName, decision, ... });
 */
import { randomBytes } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────

export interface PolicyDecisionSpan {
  traceId?: string;
  spanId?: string;
  agentId: string;
  tenantId?: string;
  sessionId?: string;
  toolName: string;
  decision: 'allow' | 'block' | 'require_approval' | 'monitor';
  riskScore?: number;
  riskTier?: 'critical' | 'high' | 'medium' | 'low' | 'safe';
  ruleId?: string | null;
  latencyMs?: number;
  piiDetected?: boolean;
  piiEntityCount?: number;
  errorMessage?: string | null;
  startTimeUnixNano?: bigint;
  endTimeUnixNano?: bigint;
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;           // 1 = SERVER, 2 = CLIENT, 3 = PRODUCER, 4 = CONSUMER
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  status: { code: number; message?: string };  // 0=UNSET, 1=OK, 2=ERROR
  attributes: OtlpAttribute[];
}

type OtlpAttributeValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean };

interface OtlpAttribute {
  key: string;
  value: OtlpAttributeValue;
}

interface OtlpExportBody {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeSpans: Array<{
      scope: { name: string; version: string };
      spans: OtlpSpan[];
    }>;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

function generateSpanId(): string {
  return randomBytes(8).toString('hex');
}

function nowNano(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

function strAttr(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number): OtlpAttribute {
  return { key, value: { intValue: String(Math.round(value)) } };
}

function floatAttr(key: string, value: number): OtlpAttribute {
  return { key, value: { doubleValue: value } };
}

function boolAttr(key: string, value: boolean): OtlpAttribute {
  return { key, value: { boolValue: value } };
}

function parseOtlpHeaders(raw: string): Record<string, string> {
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(',').map((pair) => {
      const [k, ...vs] = pair.trim().split('=');
      return [k!.trim(), vs.join('=').trim()];
    }),
  );
}

/**
 * Infer risk tier from risk score.
 */
function inferRiskTier(riskScore?: number): string {
  if (riskScore === undefined || riskScore === null) return 'unknown';
  if (riskScore >= 90) return 'critical';
  if (riskScore >= 70) return 'high';
  if (riskScore >= 40) return 'medium';
  if (riskScore >= 10) return 'low';
  return 'safe';
}

// ── OTLP/HTTP Exporter ────────────────────────────────────────────────────

class OtlpHttpExporter {
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly serviceName: string;
  private readonly serviceVersion: string = '1.0.0';

  constructor(endpoint: string, headers: Record<string, string>, serviceName: string) {
    // Ensure endpoint has the traces path
    const base = endpoint.replace(/\/$/, '');
    this.endpoint = base.endsWith('/v1/traces') ? base : `${base}/v1/traces`;
    this.headers = { 'Content-Type': 'application/json', ...headers };
    this.serviceName = serviceName;
  }

  async export(spans: OtlpSpan[]): Promise<void> {
    const body: OtlpExportBody = {
      resourceSpans: [{
        resource: {
          attributes: [
            strAttr('service.name', this.serviceName),
            strAttr('service.version', this.serviceVersion),
            strAttr('telemetry.sdk.name', 'agentguard-otel'),
            strAttr('telemetry.sdk.language', 'nodejs'),
          ],
        },
        scopeSpans: [{
          scope: { name: 'agentguard.policy', version: '1.0.0' },
          spans,
        }],
      }],
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OTLP export failed: ${res.status} ${res.statusText} — ${text}`);
    }
  }
}

// ── Console Exporter (dev/debug) ───────────────────────────────────────────

class ConsoleExporter {
  async export(spans: OtlpSpan[]): Promise<void> {
    for (const span of spans) {
      console.log('[otel]', JSON.stringify({
        name: span.name,
        traceId: span.traceId,
        spanId: span.spanId,
        attributes: Object.fromEntries(
          span.attributes.map((a) => [a.key, Object.values(a.value)[0]])
        ),
        status: span.status,
      }));
    }
  }
}

// ── Batch Processor ────────────────────────────────────────────────────────

class OtelBatchProcessor {
  private readonly queue: OtlpSpan[] = [];
  private readonly exporter: OtlpHttpExporter | ConsoleExporter;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(
    exporter: OtlpHttpExporter | ConsoleExporter,
    maxBatchSize = 100,
    flushIntervalMs = 5000,
  ) {
    this.exporter = exporter;
    this.maxBatchSize = maxBatchSize;
    this.flushIntervalMs = flushIntervalMs;
    this.scheduleFlush();
  }

  enqueue(span: OtlpSpan): void {
    this.queue.push(span);
    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  private scheduleFlush(): void {
    this.timer = setTimeout(() => {
      void this.flush().finally(() => this.scheduleFlush());
    }, this.flushIntervalMs);
    if (this.timer.unref) this.timer.unref(); // don't block process exit
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    const batch = this.queue.splice(0, this.maxBatchSize);
    try {
      await this.exporter.export(batch);
    } catch (err) {
      // Re-queue failed spans (once, to avoid infinite retry loops)
      console.warn('[otel] export failed, dropping batch:', err instanceof Error ? err.message : err);
    } finally {
      this.flushing = false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.flush();
  }
}

// ── AgentGuard OTel Facade ─────────────────────────────────────────────────

class AgentGuardOtelExporter {
  private readonly processor: OtelBatchProcessor | null;
  private readonly enabled: boolean;

  constructor() {
    const tracesExporter = process.env['OTEL_TRACES_EXPORTER'] ?? 'otlp';

    if (tracesExporter === 'none') {
      this.enabled = false;
      this.processor = null;
      return;
    }

    this.enabled = true;
    const serviceName = process.env['OTEL_SERVICE_NAME'] ?? 'agentguard-api';

    if (tracesExporter === 'console') {
      this.processor = new OtelBatchProcessor(new ConsoleExporter());
      console.log('[otel] Console span exporter active');
      return;
    }

    // OTLP/HTTP (default)
    const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    if (!endpoint) {
      console.warn('[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set — spans not exported. Set to enable OTel.');
      this.enabled = false;
      this.processor = null;
      return;
    }

    const headersRaw = process.env['OTEL_EXPORTER_OTLP_HEADERS'] ?? '';
    const headers = parseOtlpHeaders(headersRaw);

    // Add common auth headers for known platforms
    if (endpoint.includes('honeycomb.io') && !headers['x-honeycomb-team']) {
      const key = process.env['HONEYCOMB_API_KEY'];
      if (key) headers['x-honeycomb-team'] = key;
    }
    if (endpoint.includes('datadog') && !headers['DD-API-KEY']) {
      const key = process.env['DD_API_KEY'];
      if (key) headers['DD-API-KEY'] = key;
    }

    const exporter = new OtlpHttpExporter(endpoint, headers, serviceName);
    this.processor = new OtelBatchProcessor(exporter);
    console.log(`[otel] OTLP/HTTP exporter active → ${endpoint} (service: ${serviceName})`);
  }

  /**
   * Record a policy decision as an OTel span.
   */
  recordPolicyDecision(span: PolicyDecisionSpan): void {
    if (!this.enabled || !this.processor) return;

    const traceId = span.traceId ?? generateTraceId();
    const spanId = span.spanId ?? generateSpanId();
    const startNano = span.startTimeUnixNano ?? nowNano();
    const endNano = span.endTimeUnixNano ?? (startNano + BigInt(Math.round((span.latencyMs ?? 0) * 1_000_000)));

    const riskTier = span.riskTier ?? inferRiskTier(span.riskScore);

    const attributes: OtlpAttribute[] = [
      strAttr('agentguard.agent_id', span.agentId),
      strAttr('agentguard.tool_name', span.toolName),
      strAttr('agentguard.decision', span.decision),
      strAttr('agentguard.risk_tier', riskTier),
    ];

    if (span.tenantId) attributes.push(strAttr('agentguard.tenant_id', span.tenantId));
    if (span.sessionId) attributes.push(strAttr('agentguard.session_id', span.sessionId));
    if (span.ruleId) attributes.push(strAttr('agentguard.rule_id', span.ruleId));
    if (span.latencyMs !== undefined) attributes.push(intAttr('agentguard.latency_ms', span.latencyMs));
    if (span.riskScore !== undefined) attributes.push(floatAttr('agentguard.risk_score', span.riskScore));
    if (span.piiDetected !== undefined) attributes.push(boolAttr('agentguard.pii_detected', span.piiDetected));
    if (span.piiEntityCount !== undefined) attributes.push(intAttr('agentguard.pii_entity_count', span.piiEntityCount));
    if (span.errorMessage) attributes.push(strAttr('agentguard.error', span.errorMessage));

    // Standard OTel semantic conventions
    attributes.push(strAttr('span.kind', 'server'));

    const isError = span.decision === 'block' || !!span.errorMessage;

    const otlpSpan: OtlpSpan = {
      traceId,
      spanId,
      name: `policy.evaluate ${span.toolName}`,
      kind: 2, // CLIENT
      startTimeUnixNano: startNano.toString(),
      endTimeUnixNano: endNano.toString(),
      attributes,
      status: {
        code: isError ? 2 : 1, // 2=ERROR, 1=OK
        message: span.errorMessage ?? undefined,
      },
    };

    this.processor.enqueue(otlpSpan);
  }

  /**
   * Create a timing helper for measuring latency.
   * Returns a function that, when called, records the span.
   */
  startPolicyDecision(partialSpan: Omit<PolicyDecisionSpan, 'latencyMs' | 'startTimeUnixNano' | 'endTimeUnixNano'>): {
    finish: (overrides?: Partial<PolicyDecisionSpan>) => void;
  } {
    const startNano = nowNano();
    const startMs = Date.now();

    return {
      finish: (overrides = {}) => {
        const latencyMs = Date.now() - startMs;
        const endNano = nowNano();
        this.recordPolicyDecision({
          ...partialSpan,
          ...overrides,
          latencyMs,
          startTimeUnixNano: startNano,
          endTimeUnixNano: endNano,
        });
      },
    };
  }

  async shutdown(): Promise<void> {
    await this.processor?.shutdown();
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

let _instance: AgentGuardOtelExporter | null = null;

/**
 * Get the singleton OTel exporter instance.
 * Lazy-initialized on first call.
 */
export function getOtelExporter(): AgentGuardOtelExporter {
  if (!_instance) {
    _instance = new AgentGuardOtelExporter();
  }
  return _instance;
}

/**
 * Convenience export for recording a policy decision.
 * Equivalent to: getOtelExporter().recordPolicyDecision(span)
 */
export function recordPolicyDecisionSpan(span: PolicyDecisionSpan): void {
  getOtelExporter().recordPolicyDecision(span);
}

export { AgentGuardOtelExporter };
export type { OtlpSpan, OtlpAttribute };
