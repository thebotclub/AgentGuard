/**
 * AgentGuard — MCP SSRF Protection
 *
 * Scans URL-like string values in MCP tool arguments for SSRF risks:
 *  - Internal/private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
 *  - Localhost and hostname aliases (localtest.me, nip.io, hex IPs)
 *  - CGNAT range (100.64.0.0/10)
 *  - IPv6 link-local (fe80::/10), ULA (fc00::/7), loopback
 *  - file://, ftp:// protocols
 *  - Configurable domain allowlist for external URLs
 */

// ── Internal IP / hostname detection ────────────────────────────────────────

const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^0\.0\.0\.0$/,                              // 0.0.0.0
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,         // 127.0.0.0/8 loopback
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,          // 10.0.0.0/8 private
  /^192\.168\.\d{1,3}\.\d{1,3}$/,             // 192.168.0.0/16 private
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12 private
  /^169\.254\.\d{1,3}\.\d{1,3}$/,             // 169.254.0.0/16 link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/, // 100.64.0.0/10 CGNAT
];

const PRIVATE_IPV6_PATTERNS: RegExp[] = [
  /^::1$/,                            // IPv6 loopback
  /^::$/,                             // IPv6 all-zeros
  /^fe[89ab][0-9a-f]:/i,             // fe80::/10 link-local (fe80, fe90, fea0, feb0)
  /^fe80:/i,                          // fe80::/10 link-local (explicit)
  /^fc[0-9a-f]{2}:/i,                // IPv6 ULA fc00::/7
  /^fd[0-9a-f]{2}:/i,                // IPv6 ULA fd00::/7
];

/** Hostname patterns that commonly bypass SSRF filters */
const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
  /^local$/i,
  /^internal$/i,
  /\.localtest\.me$/i,   // resolves to 127.0.0.1
  /^localtest\.me$/i,
  /\.nip\.io$/i,         // DNS rebinding / IP-in-hostname
  /\.xip\.io$/i,
  /\.sslip\.io$/i,
  /^0x[0-9a-f]+$/i,      // hex-encoded IP e.g. 0x7f000001
  /^0\d+\.\d/,           // octal-encoded first octet e.g. 0177.0.0.1
];

const BLOCKED_HOSTNAMES_EXACT = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  '0.0.0.0',
  '[::]',
  '::',
  '::1',
]);

function isInternalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // Exact matches
  if (BLOCKED_HOSTNAMES_EXACT.has(lower)) return true;
  // Pattern-based hostname checks
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(lower)) return true;
  }
  // Strip IPv6 brackets
  const bare = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
  // IPv4 literal
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare)) {
    return PRIVATE_IPV4_PATTERNS.some((p) => p.test(bare));
  }
  // IPv6 literal
  if (bare.includes(':')) {
    // IPv4-mapped IPv6 ::ffff:x.x.x.x (standard form)
    const v4mapped = bare.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    if (v4mapped) return PRIVATE_IPV4_PATTERNS.some((p) => p.test(v4mapped[1]!));

    // IPv4-mapped IPv6 hex form: ::ffff:7f00:1 (Node normalizes to this)
    const v4mappedFull = bare.match(/^(?:0+:)*::?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (v4mappedFull) {
      const hi = parseInt(v4mappedFull[1]!, 16);
      const lo = parseInt(v4mappedFull[2]!, 16);
      const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return PRIVATE_IPV4_PATTERNS.some((p) => p.test(ipv4));
    }

    // Catch-all: block ANY address containing :ffff: segment (IPv4-mapped)
    if (/(?:^|:)ffff:[0-9a-f]/i.test(bare)) return true;

    return PRIVATE_IPV6_PATTERNS.some((p) => p.test(bare));
  }
  return false;
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

  // Block dangerous protocols: file://, ftp://, etc.
  if (parsed.protocol === 'file:') {
    return { safe: false, reason: 'file:// URLs are not allowed in MCP tool arguments', blockedUrl: raw };
  }
  if (parsed.protocol === 'ftp:') {
    return { safe: false, reason: 'ftp:// URLs are not allowed in MCP tool arguments', blockedUrl: raw };
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
