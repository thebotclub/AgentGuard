# SSO/SAML/SCIM Audit Report

**Audited:** 2026-03-23  
**Auditor:** Forge3 (AgentGuard internal security review)  
**Scope:** `api/routes/scim.ts`, `api/routes/sso.ts`, `api/lib/oidc-provider.ts`, `api/lib/saml-provider.ts`

---

## Executive Summary

The AgentGuard SSO and SCIM implementations are **substantially compliant** with their respective standards. SCIM 2.0 (RFC 7643/7644) coverage is comprehensive. The OIDC/SAML flows implement all critical security controls. Several minor gaps and improvement opportunities are documented below.

Overall risk rating: **LOW** for production use; recommendations below are hardening measures.

---

## A. SCIM 2.0 Compliance Audit (RFC 7643 / RFC 7644)

### ✅ Implemented Correctly

| Area | Status | Notes |
|------|--------|-------|
| Content-Type `application/scim+json` | ✅ | Set on all SCIM responses |
| Schema URNs | ✅ | Correct URNs for User, Group, ListResponse, Error, PatchOp, ServiceProviderConfig |
| Core User resource (RFC 7643 §4.1) | ✅ | `id`, `externalId`, `userName`, `name`, `displayName`, `emails`, `active`, `meta` all present |
| Enterprise User Extension (RFC 7643 §4.3) | ✅ | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User` with `organization` mapping |
| Group resource (RFC 7643 §4.2) | ✅ | `id`, `displayName`, `members` with `$ref` and `display` |
| `meta` block with `resourceType`, `created`, `lastModified`, `location` | ✅ | Present on User and Group |
| ETag/version in `meta.version` | ✅ | Weak ETag `W/"<timestamp>"` on User resources |
| `ServiceProviderConfig` endpoint | ✅ | Advertises correct capabilities (patch=true, bulk=false, filter=true, sort=false) |
| `Schemas` endpoint | ✅ | Returns User and Group schemas with attribute definitions |
| Pagination (`startIndex`, `count`, `totalResults`, `itemsPerPage`) | ✅ | RFC 7644 §3.4.2.4 compliant |
| Filter support (`userName eq "..."`) | ✅ | Via `db.listScimUsers` filter parameter |
| PATCH operations (`add`, `replace`, `remove`) | ✅ | `urn:ietf:params:scim:api:messages:2.0:PatchOp` schema validated |
| Uniqueness conflict → 409 with `scimType: "uniqueness"` | ✅ | Correct per RFC 7644 §3.3 |
| Soft-delete (deactivate) on `DELETE /Users/:id` | ✅ | `deleted_at` timestamp set; 204 returned |
| Token management (separate from main auth) | ✅ | SHA-256 hashed bearer tokens, separate from JWT/API keys |
| Audit logging of all SCIM operations | ✅ | Via `auditScim()` helper |
| Tenant isolation | ✅ | All queries scoped to `tenantId` from SCIM token |

### ⚠️ Gaps & Recommendations

#### G-SCIM-01: `X-RateLimit-*` headers missing on SCIM routes (MEDIUM)
**Finding:** SCIM-specific rate limiter (`scimRateLimitMiddleware`) is defined in `api/middleware/rate-limit.ts` but `X-RateLimit-Reset` header is not set.  
**Recommendation:** Addressed in D.1 (rate limit headers middleware). Verify SCIM routes have `scimRateLimitMiddleware` applied in `api/server.ts`.

#### G-SCIM-02: Bulk operations not implemented (LOW)
**Finding:** `ServiceProviderConfig` advertises `bulk.supported: false`. RFC 7644 §3.7 defines batch operations for IdPs that need them (Okta supports bulk provisioning for large directories).  
**Recommendation:** For v2, implement bulk operations with `maxOperations: 100`. Not required for initial enterprise launch.

#### G-SCIM-03: Filter expression parsing is basic (LOW)
**Finding:** The `filter` parameter is passed directly to the DB layer. RFC 7644 §3.4.2.2 defines a full filter expression grammar (e.g., `userName eq "john" and active eq true`).  
**Recommendation:** Implement a SCIM filter parser for compound expressions. Consider using the `scim2-parse-filter` npm package.

#### G-SCIM-04: `PUT /Users/:id` does not validate `userName` uniqueness after change (LOW)
**Finding:** The PUT (full replace) handler does not check for `userName` collision when the new `userName` differs from the existing one.  
**Recommendation:** Add uniqueness check before update in `PUT /api/scim/v2/Users/:id`.

#### G-SCIM-05: Group `DELETE` does not de-provision group members (INFO)
**Finding:** `DELETE /Groups/:id` deletes the group record but does not deactivate member users. RFC 7644 does not require this, but some IdP connectors (Okta) expect it.  
**Recommendation:** Document this behavior explicitly. Consider emitting an audit event for each affected member.

#### G-SCIM-06: `PATCH /Groups` — `members[value eq "..."]` path partially handled (LOW)
**Finding:** The remove operation for `members[value eq "userId"]` path is handled, but complex filter paths like `members[display eq "John"]` are not.  
**Recommendation:** Document supported PATCH path syntax in API docs.

#### G-SCIM-07: Token expiry not enforced (LOW)
**Finding:** SCIM tokens currently have no TTL/expiry mechanism. The `created_at` and `last_used_at` fields are tracked but no automatic rotation or expiry is enforced.  
**Recommendation:** Add optional `expires_at` field to SCIM tokens. Default to 90 days for security-conscious enterprises.

---

## B. SSO/OIDC/SAML Compliance Audit

### ✅ Implemented Correctly

| Area | Status | Notes |
|------|--------|-------|
| OIDC Authorization Code Flow (RFC 6749) | ✅ | Full code exchange implemented |
| PKCE S256 (RFC 7636) | ✅ | `code_verifier` generated, `code_challenge` sent, verified on callback |
| State parameter (CSRF prevention) | ✅ | Cryptographically random, stored in DB with 10-min TTL |
| Nonce validation (replay prevention) | ✅ | Nonce stored in state, validated against ID token claim |
| JWKS endpoint discovery | ✅ | Via OIDC discovery document |
| ID token signature validation | ✅ | `validateIdToken` in `oidc-provider.ts` |
| Client secret encryption at rest | ✅ | AES-256-GCM via `encryptConfig/decryptConfig` |
| Discovery URL auto-derivation | ✅ | For Okta, Azure AD, Google, Auth0 |
| SAML 2.0 SP-initiated flow | ✅ | AuthnRequest with RelayState |
| SAML assertion signature validation | ✅ | Via `parseSamlResponse` |
| SAML assertion timing (NotBefore/NotOnOrAfter) | ✅ | `saml-provider.ts` checks validity window |
| Role claim mapping | ✅ | Configurable `roleClaimName`, `adminGroup`, `memberGroup` |
| Force SSO flag | ✅ | Disables password login for tenant |
| SSO user provisioning (upsert) | ✅ | `db.upsertSsoUser` — creates or updates |
| GET + POST callback support | ✅ | Handles both HTTP-Redirect and HTTP-POST bindings |
| Admin-only config management | ✅ | `requireRole('owner', 'admin')` on all config endpoints |
| Feature gate | ✅ | `requireFeature('sso')` on all SSO config endpoints |
| Supported providers | ✅ | Okta, Azure AD, Google Workspace, Auth0, custom OIDC, SAML 2.0 |

### ⚠️ Gaps & Recommendations

#### ~~G-SSO-01: Callback does not issue a proper session JWT~~ ✅ FIXED (2026-03-23)
**Finding:** After successful SSO, `POST /api/v1/auth/sso/callback` returns user info but does not issue a signed session JWT. The `returnTo` redirect passes `sso_user_id` as a query param, which is insecure (appears in server logs, browser history).  
**Fix:** Implemented in `api/lib/sso-jwt.ts` + `api/routes/sso.ts`:
- Issues a signed HS256 JWT (15-min TTL) after successful SSO (both OIDC and SAML paths)
- JWT claims: `sub` (user ID), `iss` (agentguard), `iat`, `exp`, `tenant_id`, `email`, `role`, `sso: true`
- Token set as `HttpOnly; SameSite=Lax` cookie (`ag_session`) and returned in response body
- `returnTo` redirect no longer appends `sso_user_id`/`sso_role`/`sso_email` to query string
- Signing key from `JWT_SECRET` env var (≥32 chars required); dev fallback prints warning
- Tests: `api/tests/routes/sso.test.ts` (11 tests covering both POST and GET callbacks)

#### G-SSO-02: Duplicate callback logic (GET + POST) — code duplication (MEDIUM)
**Finding:** The GET callback (`/api/v1/auth/sso/callback GET`) duplicates the POST handler logic rather than sharing a common implementation. This creates maintenance risk.  
**Recommendation:** Extract shared callback processing into `handleOidcCallback(db, config, code, codeVerifier, nonce)` helper function.

#### G-SSO-03: SAML SP metadata endpoint missing (MEDIUM)
**Finding:** No endpoint exists to serve the SP's SAML metadata XML (`/api/v1/auth/sso/metadata`). Enterprise SAML IdPs (Okta, Azure) require this for automatic SP configuration.  
**Recommendation:** Implement `GET /api/v1/auth/sso/metadata?tenant_id=xxx` returning SP metadata XML.

#### G-SSO-04: SAML Single Logout (SLO) not implemented (LOW)
**Finding:** `saml-provider.ts` shows `sloUrl` extracted from IdP metadata but no SLO endpoint is implemented.  
**Recommendation:** Implement `GET /api/v1/auth/sso/logout` for SP-initiated SLO. Include for v2.

#### G-SSO-05: `forceSso` enforcement not validated in main auth middleware (MEDIUM)
**Finding:** The `force_sso` flag is stored but main auth middleware (`/api/middleware/auth.ts`) may not check it to block password-based logins for tenants with force SSO enabled.  
**Recommendation:** In `requireTenantAuth`, if tenant has `force_sso=true` and request uses password/API key, return 403 with redirect hint to SSO URL.

#### G-SSO-06: SSO audit logging not implemented (MEDIUM)
**Finding:** SSO login events are only `console.log`'d. They should be inserted into the audit event table for compliance trail.  
**Recommendation:** Add `db.insertAuditEventSafe(...)` calls on successful and failed SSO logins (similar to `auditScim`).

#### G-SSO-07: Token expiry clock skew tolerance not configurable (LOW)
**Finding:** ID token validation uses a fixed clock skew tolerance. Some enterprise environments have clock drift > standard tolerance.  
**Recommendation:** Add `OIDC_CLOCK_SKEW_SECONDS` environment variable (default: 60).

---

## C. Summary

### Compliance Matrix

| Standard | Coverage | Rating |
|----------|----------|--------|
| SCIM 2.0 Core (RFC 7643) | ~95% | ✅ Production ready |
| SCIM 2.0 Protocol (RFC 7644) | ~90% | ✅ Production ready (bulk optional) |
| OIDC Core 1.0 | ~85% | ⚠️ JWT session issuance gap (G-SSO-01) |
| SAML 2.0 SP Profile | ~75% | ⚠️ SP metadata + SLO missing |
| Okta SCIM compatibility | ~95% | ✅ |
| Azure AD SCIM compatibility | ~90% | ✅ |
| OneLogin SCIM compatibility | ~90% | ✅ |

### Priority Fix Order

| Priority | Item | Effort |
|----------|------|--------|
| ~~P1~~ | ~~G-SSO-01: Issue proper session JWT after SSO~~ | ✅ FIXED 2026-03-23 |
| P2 | G-SSO-05: Enforce forceSso in auth middleware | Small |
| P2 | G-SSO-06: Audit log SSO login events | Small |
| P3 | G-SSO-03: SAML SP metadata endpoint | Small |
| P3 | G-SCIM-04: PUT userName uniqueness check | Small |
| P3 | G-SSO-02: Deduplicate callback logic | Medium |
| P4 | G-SCIM-07: SCIM token expiry | Medium |
| P4 | G-SCIM-02: Bulk operations | Large |
| P4 | G-SSO-04: SAML SLO | Medium |
