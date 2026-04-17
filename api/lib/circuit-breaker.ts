import { logger } from './logger.js';
/**
 * AgentGuard — Circuit Breaker
 *
 * Lightweight circuit breaker for external calls (Lakera, webhooks, etc.)
 * to prevent cascading failures when downstream services are unavailable.
 *
 * States:
 *   CLOSED   — normal operation, calls go through
 *   OPEN     — circuit tripped, calls are rejected immediately
 *   HALF_OPEN — test probe: allow one call through to check if service recovered
 *
 * Usage:
 *   const breaker = new CircuitBreaker('lakera', { failureThreshold: 5, resetMs: 30_000 });
 *   const result = await breaker.call(() => fetchFromLakera(input));
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Milliseconds to wait before attempting HALF_OPEN probe */
  resetMs: number;
  /** Optional: timeout for each call in ms. Exceeded calls count as failures. */
  callTimeoutMs?: number;
  /** Optional: callback when state changes */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreakerOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker '${name}' is OPEN — service unavailable`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  readonly name: string;
  private readonly opts: Required<Omit<CircuitBreakerOptions, 'onStateChange'>> & Pick<CircuitBreakerOptions, 'onStateChange'>;

  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureAt = 0;
  private halfOpenProbeInFlight = false;

  constructor(name: string, opts: CircuitBreakerOptions) {
    this.name = name;
    this.opts = {
      failureThreshold: opts.failureThreshold,
      resetMs: opts.resetMs,
      callTimeoutMs: opts.callTimeoutMs ?? 0,
      onStateChange: opts.onStateChange,
    };
  }

  get currentState(): CircuitState {
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitBreakerOpenError immediately if circuit is OPEN.
   * Wraps the call with a timeout if callTimeoutMs is set.
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition OPEN → HALF_OPEN
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureAt;
      if (elapsed >= this.opts.resetMs) {
        this.transition('HALF_OPEN');
      } else {
        throw new CircuitBreakerOpenError(this.name);
      }
    }

    // HALF_OPEN: only allow one probe at a time
    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenProbeInFlight) {
        throw new CircuitBreakerOpenError(this.name);
      }
      this.halfOpenProbeInFlight = true;
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError) throw err;
      this.onFailure();
      throw err;
    } finally {
      if (this.state === 'HALF_OPEN') {
        this.halfOpenProbeInFlight = false;
      }
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.opts.callTimeoutMs) return fn();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Circuit breaker '${this.name}': call timed out after ${this.opts.callTimeoutMs}ms`));
      }, this.opts.callTimeoutMs);

      fn().then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.transition('CLOSED');
    }
    this.failures = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureAt = Date.now();
    if (this.state === 'HALF_OPEN' || this.failures >= this.opts.failureThreshold) {
      this.transition('OPEN');
    }
  }

  private transition(next: CircuitState): void {
    const prev = this.state;
    this.state = next;
    if (next === 'CLOSED') this.failures = 0;
    if (next === 'OPEN') {
      logger.warn(`[circuit-breaker:${this.name}] OPEN after ${this.failures} failures`);
    } else if (next === 'HALF_OPEN') {
      logger.info(`[circuit-breaker:${this.name}] HALF_OPEN — probing recovery`);
    } else if (next === 'CLOSED') {
      logger.info(`[circuit-breaker:${this.name}] CLOSED — service recovered`);
    }
    this.opts.onStateChange?.(this.name, prev, next);
  }

  /**
   * Manually reset the circuit to CLOSED (e.g. after manual investigation).
   */
  reset(): void {
    this.transition('CLOSED');
    this.halfOpenProbeInFlight = false;
  }
}

// ── Singleton registry ─────────────────────────────────────────────────────
// Shared circuit breakers for known external services

const _breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  opts?: CircuitBreakerOptions,
): CircuitBreaker {
  if (!_breakers.has(name)) {
    if (!opts) {
      // Sensible defaults
      opts = { failureThreshold: 5, resetMs: 30_000, callTimeoutMs: 5_000 };
    }
    _breakers.set(name, new CircuitBreaker(name, opts));
  }
  return _breakers.get(name)!;
}

/**
 * Pre-configured breakers for known services.
 */
export const breakers = {
  get lakera() {
    return getCircuitBreaker('lakera', {
      failureThreshold: 5,
      resetMs: 30_000,
      callTimeoutMs: 3_000,
    });
  },
  get webhooks() {
    return getCircuitBreaker('webhooks', {
      failureThreshold: 10,
      resetMs: 60_000,
      callTimeoutMs: 5_000,
    });
  },
};
