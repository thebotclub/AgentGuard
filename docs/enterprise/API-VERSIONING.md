# AgentGuard API Versioning Policy

**Version:** 1.0  
**Effective Date:** 2026-04-01

---

## 1. Overview

This document describes AgentGuard's API versioning strategy, deprecation policy, and migration process. It is intended for developers integrating with the AgentGuard API and internal teams managing the API lifecycle.

---

## 2. Current API Version

**Current stable version: `v1`**

All v1 endpoints are served under:
```
https://api.agentguard.tech/api/v1/
```

### 2.1 v1 Endpoint Overview

| Category | Base Path |
|----------|-----------|
| Policy evaluation | `/api/v1/evaluate` |
| Batch evaluation | `/api/v1/evaluate/batch` |
| Agents | `/api/v1/agents` |
| Policies | `/api/v1/policies` |
| Audit logs | `/api/v1/audit` |
| Alerts | `/api/v1/alerts` |
| Analytics | `/api/v1/analytics` |
| Approvals (HITL) | `/api/v1/approvals` |
| Kill switch | `/api/v1/killswitch` |
| SSO | `/api/v1/auth/sso/*` |
| SCIM provisioning | `/api/scim/v2/*` |
| Health | `/api/v1/health` |
| MCP proxy | `/api/v1/mcp/*` |
| Compliance | `/api/v1/compliance/*` |
| Teams | `/api/v1/team` |
| Billing | `/api/v1/billing` |

> **Note:** SCIM follows the SCIM 2.0 standard path convention (`/api/scim/v2/`) and is versioned independently of the REST API.

---

## 3. Versioning Strategy

### 3.1 URL-Based Versioning

AgentGuard uses **URL path versioning**. The version is embedded in the URL path:

```
https://api.agentguard.tech/api/{version}/{resource}
```

Examples:
```
GET  https://api.agentguard.tech/api/v1/evaluate
POST https://api.agentguard.tech/api/v2/evaluate   (future)
```

**Rationale:** URL versioning is the most explicit, cache-friendly, and easy to route. It avoids header parsing complexity and is unambiguous in logs and monitoring.

### 3.2 What Triggers a New Version

A new major version (e.g., `v2`) is introduced only for **breaking changes**. Breaking changes include:

| Change Type | Breaking? |
|-------------|-----------|
| Removing an endpoint | ✅ Breaking |
| Renaming a required request field | ✅ Breaking |
| Changing a response field type | ✅ Breaking |
| Removing a response field | ✅ Breaking |
| Changing authentication scheme | ✅ Breaking |
| Adding a new required request field | ✅ Breaking |
| Changing error response structure | ✅ Breaking |
| Adding a new optional request field | ❌ Non-breaking |
| Adding a new response field | ❌ Non-breaking |
| Adding a new endpoint | ❌ Non-breaking |
| Relaxing validation rules | ❌ Non-breaking |
| Performance improvements | ❌ Non-breaking |
| Bug fixes | ❌ Non-breaking |

### 3.3 Minor/Patch Updates

Non-breaking additions and fixes are deployed to the current version without a version bump. All changes are documented in the [Changelog](../CHANGELOG.md).

### 3.4 Future v2 Planning

The next major version (`v2`) is planned for **Q4 2026** and will include:
- Streaming evaluation responses (SSE-native)
- Unified agent/policy resource model
- Improved batch operation semantics
- OpenAPI 3.1 specification

---

## 4. Deprecation Policy

### 4.1 Minimum Notice Period

AgentGuard will provide a minimum of **12 months' notice** before removing or making breaking changes to any stable API endpoint.

The deprecation timeline:

```
Announcement → Deprecation Period (≥ 12 months) → Sunset Date → Removal
```

### 4.2 Deprecation Notice Mechanisms

When an endpoint or feature is deprecated, AgentGuard will:

1. **Announce** via:
   - Email to all registered API users
   - Dashboard notification
   - Status page / changelog post
   - Developer blog post with migration guide

2. **Add `Sunset` response header** to all deprecated endpoints:
   ```
   Sunset: Sat, 01 Apr 2028 00:00:00 GMT
   Deprecation: Sat, 01 Apr 2026 00:00:00 GMT
   Link: <https://docs.agentguard.tech/migration/v1-to-v2>; rel="successor-version"
   ```
   These headers follow [RFC 8594 (Sunset)](https://datatracker.ietf.org/doc/html/rfc8594) and [draft-ietf-httpapi-deprecation-header](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header).

3. **Log deprecation usage** internally to identify impacted customers and reach out proactively.

### 4.3 Currently Deprecated Endpoints

| Endpoint | Deprecated Since | Sunset Date | Successor |
|----------|-----------------|-------------|-----------|
| `POST /api/v1/sso/configure` | 2026-03-22 | 2027-04-01 | `PUT /api/v1/auth/sso/config` |
| `GET /api/v1/sso/config` | 2026-03-22 | 2027-04-01 | `GET /api/v1/auth/sso/config` |
| `DELETE /api/v1/sso/config` | 2026-03-22 | 2027-04-01 | `DELETE /api/v1/auth/sso/config` |

### 4.4 Version Support Lifecycle

| Version | Status | Supported Until |
|---------|--------|----------------|
| v1 | ✅ Active | Minimum 2027-04-01 (12 months post-v2 GA) |
| v2 | 🔜 Planned Q4 2026 | TBD |

---

## 5. Sunset Headers

Starting with the v1 deprecation window, all deprecated endpoints will return the following headers in every response:

```http
HTTP/1.1 200 OK
Deprecation: <deprecation-date>
Sunset: <sunset-date>
Link: <migration-guide-url>; rel="successor-version"
```

**Example:**
```http
Deprecation: Mon, 22 Mar 2026 00:00:00 GMT
Sunset: Wed, 01 Apr 2027 00:00:00 GMT
Link: <https://docs.agentguard.tech/migration/sso-v2>; rel="successor-version"
```

Implementation note: Sunset headers are added via Express middleware in `api/middleware/versioning.ts`.

---

## 6. Migration Guides

Migration guides are provided for all breaking changes. They are published at:

```
https://docs.agentguard.tech/migration/
```

### 6.1 v1 SSO Legacy Endpoints → v1 Auth SSO Endpoints

**Old endpoints (deprecated 2026-03-22):**
```
POST /api/v1/sso/configure
GET  /api/v1/sso/config
DELETE /api/v1/sso/config
```

**New endpoints:**
```
PUT    /api/v1/auth/sso/config   — create or update (replaces POST /configure)
GET    /api/v1/auth/sso/config   — get config
DELETE /api/v1/auth/sso/config   — remove config
POST   /api/v1/auth/sso/test     — test IdP connectivity (new)
GET    /api/v1/auth/sso/authorize — initiate SSO flow (new)
POST   /api/v1/auth/sso/callback  — handle SSO callback (new)
```

**Migration steps:**
1. Replace `POST /api/v1/sso/configure` with `PUT /api/v1/auth/sso/config` — request body format is compatible, additional optional fields available.
2. Replace `GET /api/v1/sso/config` with `GET /api/v1/auth/sso/config` — response format is identical.
3. Replace `DELETE /api/v1/sso/config` with `DELETE /api/v1/auth/sso/config`.
4. Optionally implement the new `authorize` + `callback` flow for full OIDC/SAML support.

### 6.2 v1 → v2 (Future — to be published)

Migration guide will be published no later than 30 days before v2 GA, at:
```
https://docs.agentguard.tech/migration/v1-to-v2
```

---

## 7. Client Recommendations

### 7.1 Pinning API Version

Always pin your API calls to a specific version:
```bash
# Correct — explicit version
curl https://api.agentguard.tech/api/v1/evaluate

# Avoid — no version (resolves to latest, may break)
curl https://api.agentguard.tech/api/evaluate
```

### 7.2 Handling Deprecation Headers

We recommend that API clients programmatically detect deprecation headers and log warnings:

```javascript
const response = await fetch('https://api.agentguard.tech/api/v1/evaluate', ...);

if (response.headers.get('Deprecation')) {
  const sunset = response.headers.get('Sunset');
  console.warn(`[AgentGuard] This endpoint is deprecated. Sunset: ${sunset}`);
}
```

### 7.3 OpenAPI Spec

The OpenAPI 3.0 specification for v1 is available at:
- JSON: `https://api.agentguard.tech/api/v1/openapi.json`
- YAML: `https://api.agentguard.tech/api/v1/openapi.yaml`
- Swagger UI: `https://api.agentguard.tech/api/docs`

---

## 8. Contact

For API versioning questions or to report issues with a migration:
- Email: developers@agentguard.tech
- GitHub Issues: https://github.com/thebotclub/AgentGuard/issues

---

*Last updated: 2026-03-23*
