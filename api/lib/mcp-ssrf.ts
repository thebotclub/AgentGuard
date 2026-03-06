/**
 * AgentGuard — MCP SSRF Protection
 *
 * Scans URL-like string values in MCP tool arguments for SSRF risks:
 *  - Internal/private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
 *  - Localhost
 *  - file:// protocol
 *  - Configurable domain allowlist for external URLs
 */

// ── Internal IP / hostname detection ────────────────────────────────────────

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\.\d+\.\d+\.\d+$/,          // 127.0.0.0/8 loopback
  /^10\.\d+\.\d+\.\d+$/,           // 10.0.0.0/8 private
  /^192\.168\.\d+\.\d+$/,          // 192.168.0.0/16 private
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12 private
  /^::1$/,                          // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,              // IPv6 ULA
  /^fd[0-9a-f]{2}:/i,              // IPv6 ULA
];

const BLOCKED_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback', '0.0.0.0', '[::]']);

function isInternalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  // Strip IPv6 brackets
  const bare = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
  return PRIVATE_IP_PATTERNS.some((p) => p.test(bare));
}

// ── SSRF check result ────────────────────────────────────────────────────────

export interface SsrfCheckResult {
  /** true = safe to proceed, false = blocked */
  safe: boolean;
  reason?: string;
  /** The offending URL, if any */
  blockedUrl?: string;
}

// ── Main check function ──────────────────────────────────────────────────────

export interface SsrfCheckOptions {
  /**
   * Explicit list of allowed external domains.
   * If provided, URLs whose hostnames are NOT in this list are blocked
   * (unless they are internal, which is always blocked regardless).
   * If omitted, external URLs are allowed by default.
   */
  allowedDomains?: string[];
}

/**
 * Check a single URL string for SSRF risks.
 */
export function checkUrl(raw: string, options: SsrfCheckOptions = {}): SsrfCheckResult {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Not a URL — no risk
    return { safe: true };
  }

  // Block file:// and other dangerous protocols
  if (parsed.protocol === 'file:') {
    return { safe: false, reason: 'file:// URLs are not allowed in MCP tool arguments', blockedUrl: raw };
  }

  // Only evaluate http/https further for SSRF
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: true };
  }

  const hostname = parsed.hostname;

  // Always block internal hosts
  if (isInternalHost(hostname)) {
    return {
      safe: false,
      reason: `URL targets an internal/private network address: ${hostname}`,
      blockedUrl: raw,
    };
  }

  // Enforce allowlist if provided
  if (options.allowedDomains && options.allowedDomains.length > 0) {
    const lower = hostname.toLowerCase();
    const allowed = options.allowedDomains.some((domain) => {
      const d = domain.toLowerCase();
      return lower === d || lower.endsWith(`.${d}`);
    });
    if (!allowed) {
      return {
        safe: false,
        reason: `URL hostname '${hostname}' is not in the allowed domains list`,
        blockedUrl: raw,
      };
    }
  }

  return { safe: true };
}

/**
 * Recursively walk a value tree and check all string values that look like URLs.
 * Returns the first SSRF violation found, or { safe: true } if none.
 */
export function checkArgumentsForSsrf(
  args: Record<string, unknown>,
  options: SsrfCheckOptions = {},
): SsrfCheckResult {
  function walk(value: unknown): SsrfCheckResult {
    if (typeof value === 'string') {
      // Only check strings that look URL-like to avoid false positives
      if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('file://')) {
        const result = checkUrl(value, options);
        if (!result.safe) return result;
      }
      return { safe: true };
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = walk(item);
        if (!result.safe) return result;
      }
      return { safe: true };
    }
    if (value !== null && typeof value === 'object') {
      for (const v of Object.values(value as Record<string, unknown>)) {
        const result = walk(v);
        if (!result.safe) return result;
      }
      return { safe: true };
    }
    return { safe: true };
  }

  return walk(args);
}
