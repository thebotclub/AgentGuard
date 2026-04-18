# AgentGuard API Versioning Strategy

## Current Version

**v1** — all routes live under `/api/v1/`.

## Versioning Approach

AgentGuard uses **URL path versioning** as the primary mechanism, with optional header-based negotiation.

### URL Path Versioning

Every API route is prefixed with its major version:

- `/api/v1/evaluate` — current (v1)
- `/api/v2/evaluate` — future, when breaking changes are needed

**Rules:**

- v1 routes must never receive breaking changes (field removals, type changes, semantics shifts).
- Additive changes (new optional fields, new endpoints) are allowed within v1.
- When a breaking change is required, introduce `/api/v2/` routes and keep v1 running.

### Deprecation Protocol

When a newer major version exists, old versions signal their deprecation status through HTTP headers:

| Header | Description |
|--------|-------------|
| `Sunset` | RFC 8594 — date when the old version will be removed (e.g., `Sat, 01 Nov 2025 00:00:00 GMT`) |
| `Deprecation` | RFC 9745 — boolean (`true`) or a link to the migration guide |
| `Link: <url>; rel="successor-version"` | Points to the new version documentation |

Example deprecation headers on a v1 endpoint after v2 ships:

```
Deprecation: true
Sunset: Sat, 01 Nov 2025 00:00:00 GMT
Link: <https://agentguard.tech/docs/api/v2/migration>; rel="successor-version"
```

### Version Negotiation (Optional)

Clients can request a specific version via the `Accept-Version` request header:

```
Accept-Version: v2
```

If the requested version is not available, the API responds with `406 Not Acceptable` and a list of supported versions in the response body.

When `Accept-Version` is omitted, the API defaults to the latest stable version for that route.

### Response Headers

Every API response includes:

| Header | Description |
|--------|-------------|
| `X-API-Version` | The major version serving the request (e.g., `1`) |
| `Access-Control-Expose-Headers: X-API-Version` | Makes the version header visible to browser JS clients |

## When to Introduce v2

A new major version is warranted when a change would break existing clients:

- Removing or renaming a response field
- Changing a field's type (e.g., string to number)
- Altering endpoint semantics (e.g., changing what a status code means)
- Restructuring the URL scheme

**Not** a breaking change:

- Adding new optional response fields
- Adding new endpoints under `/api/v1/`
- Adding new optional request parameters

## Implementation

The versioning middleware lives in `api/middleware/versioning.ts` and is registered in the middleware chain via `api/middleware/index.ts`. It attaches `X-API-Version` and CORS expose headers to every response.
