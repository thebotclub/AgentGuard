/**
 * AgentGuard — Self-contained Prometheus Metrics Collector
 *
 * No external dependencies. Tracks request counts, duration histograms,
 * active connections, and error counts. Outputs Prometheus exposition format.
 */

// ── Histogram bucket boundaries (ms) ────────────────────────────────────
const DEFAULT_BUCKETS = [10, 50, 100, 250, 500, 1000, 5000];

// ── Internal metric storage ─────────────────────────────────────────────

interface CounterEntry {
  value: number;
  labels: Record<string, string>;
}

interface GaugeEntry {
  value: number;
  labels: Record<string, string>;
}

interface HistogramEntry {
  buckets: number[];       // upper bounds (including +Inf implicitly)
  counts: number[];        // count per bucket (same length as buckets)
  sum: number;
  count: number;
  labels: Record<string, string>;
}

class MetricsRegistry {
  private counters = new Map<string, CounterEntry[]>();
  private gauges = new Map<string, GaugeEntry[]>();
  private histograms = new Map<string, HistogramEntry[]>();

  // ── Label key helper ──────────────────────────────────────────────────
  private labelKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  // ── Counter ───────────────────────────────────────────────────────────
  incrementCounter(name: string, labels: Record<string, string> = {}, delta = 1): void {
    const key = this.labelKey(labels);
    const entries = this.counters.get(name) ?? [];
    const existing = entries.find((e) => this.labelKey(e.labels) === key);
    if (existing) {
      existing.value += delta;
    } else {
      entries.push({ value: delta, labels: { ...labels } });
    }
    this.counters.set(name, entries);
  }

  getCounterValue(name: string, labels: Record<string, string> = {}): number {
    const key = this.labelKey(labels);
    return this.counters.get(name)?.find((e) => this.labelKey(e.labels) === key)?.value ?? 0;
  }

  // ── Gauge ─────────────────────────────────────────────────────────────
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.labelKey(labels);
    const entries = this.gauges.get(name) ?? [];
    const existing = entries.find((e) => this.labelKey(e.labels) === key);
    if (existing) {
      existing.value = value;
    } else {
      entries.push({ value, labels: { ...labels } });
    }
    this.gauges.set(name, entries);
  }

  incrementGauge(name: string, labels: Record<string, string> = {}): void {
    const key = this.labelKey(labels);
    const entries = this.gauges.get(name) ?? [];
    const existing = entries.find((e) => this.labelKey(e.labels) === key);
    if (existing) {
      existing.value += 1;
    } else {
      entries.push({ value: 1, labels: { ...labels } });
    }
    this.gauges.set(name, entries);
  }

  decrementGauge(name: string, labels: Record<string, string> = {}): void {
    const key = this.labelKey(labels);
    const entries = this.gauges.get(name) ?? [];
    const existing = entries.find((e) => this.labelKey(e.labels) === key);
    if (existing) {
      existing.value -= 1;
    } else {
      entries.push({ value: -1, labels: { ...labels } });
    }
    this.gauges.set(name, entries);
  }

  // ── Histogram ─────────────────────────────────────────────────────────
  observeHistogram(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    bucketBounds: number[] = DEFAULT_BUCKETS,
  ): void {
    const key = this.labelKey(labels);
    const entries = this.histograms.get(name) ?? [];
    let existing = entries.find((e) => this.labelKey(e.labels) === key);

    if (!existing) {
      existing = {
        buckets: [...bucketBounds],
        counts: new Array(bucketBounds.length).fill(0),
        sum: 0,
        count: 0,
        labels: { ...labels },
      };
      entries.push(existing);
      this.histograms.set(name, entries);
    }

    // Increment only the matching bucket
    for (let i = 0; i < existing.buckets.length; i++) {
      if (value <= existing.buckets[i]) {
        existing.counts[i] += 1;
        break; // Only increment the tightest bucket
      }
    }
    existing.sum += value;
    existing.count += 1;
  }

  // ── Reset (useful for tests) ──────────────────────────────────────────
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  // ── Prometheus exposition format output ────────────────────────────────
  toPrometheusFormat(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, entries] of this.counters) {
      lines.push(`# HELP ${name} Total count.`);
      lines.push(`# TYPE ${name} counter`);
      for (const entry of entries) {
        const labelStr = this.labelKey(entry.labels);
        lines.push(labelStr ? `${name}{${labelStr}} ${entry.value}` : `${name} ${entry.value}`);
      }
    }

    // Gauges
    for (const [name, entries] of this.gauges) {
      lines.push(`# HELP ${name} Current value.`);
      lines.push(`# TYPE ${name} gauge`);
      for (const entry of entries) {
        const labelStr = this.labelKey(entry.labels);
        lines.push(labelStr ? `${name}{${labelStr}} ${entry.value}` : `${name} ${entry.value}`);
      }
    }

    // Histograms
    for (const [name, entries] of this.histograms) {
      lines.push(`# HELP ${name} Duration histogram.`);
      lines.push(`# TYPE ${name} histogram`);
      for (const entry of entries) {
        const labelStr = entry.labels ? this.labelKey(entry.labels) : '';
        const prefix = labelStr ? `${name}{${labelStr},` : `${name}{`;
        let cumulative = 0;
        for (let i = 0; i < entry.buckets.length; i++) {
          cumulative += entry.counts[i];
          lines.push(`${prefix}le="${entry.buckets[i]}"} ${cumulative}`);
        }
        // +Inf bucket
        lines.push(`${prefix}le="+Inf"} ${entry.count}`);
        // _sum line (no labels in standard format when empty)
        const sumLabel = labelStr ? `${name}{${labelStr}}` : `${name}_sum`;
        lines.push(`${sumLabel} ${entry.sum}`);
        const countLabel = labelStr ? `${name}{${labelStr}}` : `${name}_count`;
        lines.push(`${countLabel} ${entry.count}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}

// ── Singleton instance ──────────────────────────────────────────────────
export const metrics = new MetricsRegistry();

// ── Named metric helpers (typed access) ─────────────────────────────────

export function incrementRequestCount(route: string, method: string, status: number): void {
  metrics.incrementCounter('http_requests_total', { route, method, status: String(status) });
}

export function incrementErrorCount(route: string, method: string): void {
  metrics.incrementCounter('http_errors_total', { route, method });
}

export function observeRequestDuration(route: string, method: string, durationMs: number): void {
  metrics.observeHistogram('http_request_duration_ms', durationMs, { route, method });
}

export function setActiveConnections(count: number): void {
  metrics.setGauge('http_active_connections', count);
}

export function incrementActiveConnections(): void {
  metrics.incrementGauge('http_active_connections');
}

export function decrementActiveConnections(): void {
  metrics.decrementGauge('http_active_connections');
}

export { MetricsRegistry };
