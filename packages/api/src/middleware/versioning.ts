/**
 * API Versioning Middleware
 *
 * Strategy:
 *  - All canonical routes live under /v1/
 *  - Unversioned routes (e.g. /health) redirect 308 → /v1/health
 *  - Version negotiation via Accept header:
 *      Accept: application/vnd.agentguard.v1+json   → v1 (current)
 *      Accept: application/vnd.agentguard.v2+json   → 404 (not yet released)
 *  - Deprecation headers on /v1/* responses signal the eventual migration to /v2/
 *    (populated as a placeholder now; dates to be filled when v2 is announced)
 */

import type { Context, Next } from 'hono';

// ─── Supported versions ────────────────────────────────────────────────────────

const SUPPORTED_VERSIONS = ['v1'] as const;
type ApiVersion = (typeof SUPPORTED_VERSIONS)[number];
const CURRENT_VERSION: ApiVersion = 'v1';

// Deprecation metadata — update when v2 ships
const DEPRECATION_INFO: Record<ApiVersion, { deprecationDate: string | null; sunsetDate: string | null }> = {
  v1: {
    deprecationDate: null, // e.g. "2027-01-01" when v2 is announced
    sunsetDate: null,       // e.g. "2027-07-01" when v1 is retired
  },
};

// ─── Version negotiation middleware ──────────────────────────────────────────

/**
 * Inspects the Accept header for a vendor MIME type requesting a specific version.
 * If the client requests an unsupported version → 406 Not Acceptable.
 * Attaches the resolved version to the Hono context as "apiVersion".
 *
 * Usage: mount BEFORE routes, AFTER cors/logger.
 */
export async function versionNegotiationMiddleware(c: Context, next: Next): Promise<void> {
  const accept = c.req.header('Accept') ?? '';

  // Parse vendor MIME: application/vnd.agentguard.v1+json
  const vendorMimeRe = /application\/vnd\.agentguard\.(v\d+)\+json/i;
  const match = vendorMimeRe.exec(accept);

  let resolvedVersion: ApiVersion = CURRENT_VERSION;

  if (match) {
    const requested = match[1]!.toLowerCase() as ApiVersion;
    if (!(SUPPORTED_VERSIONS as readonly string[]).includes(requested)) {
      c.status(406);
      c.json({
        error: {
          code: 'UNSUPPORTED_API_VERSION',
          message: `API version "${requested}" is not supported. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}.`,
          supportedVersions: SUPPORTED_VERSIONS,
          currentVersion: CURRENT_VERSION,
        },
      });
      return;
    }
    resolvedVersion = requested;
  }

  c.set('apiVersion', resolvedVersion);
  await next();
}

// ─── Deprecation header middleware ────────────────────────────────────────────

/**
 * Adds RFC 8594 deprecation headers to responses for versioned routes.
 * When a version has a known sunset date:
 *   Deprecation: <date>
 *   Sunset: <date>
 *   Link: <https://docs.agentguard.ai/api/migration/v2>; rel="successor-version"
 *
 * These headers are no-ops until sunsetDate is set — future-proofing only.
 */
export async function deprecationHeaderMiddleware(c: Context, next: Next): Promise<void> {
  await next();

  const version = (c.get('apiVersion') as ApiVersion | undefined) ?? CURRENT_VERSION;
  const info = DEPRECATION_INFO[version];

  if (info?.deprecationDate) {
    c.res.headers.set('Deprecation', info.deprecationDate);
  }
  if (info?.sunsetDate) {
    c.res.headers.set('Sunset', info.sunsetDate);
    c.res.headers.set(
      'Link',
      '<https://docs.agentguard.ai/api/migration/v2>; rel="successor-version"',
    );
  }

  // Always advertise the current version and supported versions
  c.res.headers.set('X-API-Version', version);
  c.res.headers.set('X-API-Supported-Versions', SUPPORTED_VERSIONS.join(', '));
}

// ─── Unversioned → v1 redirect list ──────────────────────────────────────────

/**
 * List of top-level route prefixes that existed before versioning was added.
 * Any request to /<prefix>[/...] is permanently redirected to /v1/<prefix>[/...].
 * 308 Permanent Redirect preserves the HTTP method (important for POST/PUT/DELETE).
 */
export const LEGACY_ROUTE_PREFIXES = [
  'health',
  'agents',
  'policies',
  'actions',
  'audit',
  'killswitch',
  'hitl',
  'events',
  'compliance',
] as const;
