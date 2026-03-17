# AgentGuard License Key & Monetization System — Complete Plan

> **Status:** Planning document — output of expert architecture session  
> **Date:** 2026-03-06  
> **Authors:** Alex (Architect), Morgan (Monetization), Sam (Security)

---

## Table of Contents

1. [Expert Debates](#1-expert-debates)
2. [Final Consensus Decisions](#2-final-consensus-decisions)
3. [Detailed Implementation Spec](#3-detailed-implementation-spec)
4. [Tier / Pricing Matrix](#4-tier--pricing-matrix)
5. [Migration Plan](#5-migration-plan)

---

## 1. Expert Debates

### Topic 1: License Key Format & Crypto

---

#### Positions

**🏗️ Alex (Architect):**

I want Ed25519-signed JWTs. The format is:

```
AGKEY-<base64url(header.payload.signature)>
```

Where:
- **Header:** `{ "alg": "EdDSA", "typ": "AG-LIC" }`  
- **Payload:** `{ "iss": "license.agentguard.dev", "sub": "<tenant_id>", "iat": <epoch>, "exp": <epoch>, "jti": "<key_uuid>", "tier": "pro", "limits": { "agents": 25, "events_pm": 500000 }, "features": ["hitl", "siem", "anomaly"], "install_id": null }`

The binary embeds the **Ed25519 public key** at compile time. Validation is a 50µs crypto op — no network needed. For revocation: we maintain a revocation list (`/v1/license/revocation-list`) that the binary fetches on startup and caches. The CRL is itself Ed25519-signed, so it can't be tampered.

**💰 Morgan (Monetization):**

I mostly agree on Ed25519 JWT, but I want to focus on *what* we encode because that drives the business. The key needs:
- `tier` — free/pro/enterprise
- `seats` — number of agent seats  
- `events_pm` — monthly evaluation events ceiling  
- `tenant_id` — links to our billing system  
- `exp` — annual expiry (paid), never-expires (free tier gets a rolling 30-day key auto-renewed on valid install)
- `features[]` — named feature flags that map directly to upsell opportunities
- `install_id` — optional hardware fingerprint for Enterprise air-gapped

For free tier: issue the key automatically upon email verification — zero friction. Don't require a credit card to try Pro either; offer a 14-day Pro trial key.

**🔐 Sam (Security):**

I'd push back on the "simple JWT" framing. JWTs are well-known; developers will immediately look for `exp` fields and try to replay old keys. What we need on top of Ed25519:

1. **Short-lived signed tokens + refresh** — the license "leaf key" is valid for 30 days but only validated against our server once. The binary caches a signed `LicenseCache` blob that includes a server-side `validated_at` timestamp. If validation is offline, the cache blob is re-signed by the binary itself using its embedded public key to prevent tampering.
2. **Machine binding (optional, Enterprise)** — hash of `hostname + CPU serial + MAC prefix` baked into `install_id`. Not fingerprint-aggressive, just enough to catch obvious sharing.
3. **Key ID (kid) in header** — so we can rotate signing keys via KID lookup without invalidating all existing keys.

#### ⚡ Disagreements

**Alex vs. Sam — How hard is revocation?**

> **Alex:** A daily-fetched CRL is sufficient. Enterprises don't need instant revocation; they need audit logs and the ability to rotate keys on their schedule.

> **Sam:** Daily CRL is not good enough for a payment fraud scenario — if a key is stolen or a customer charges back, we need within-hours revocation. I want a 6-hour CRL TTL with exponential backoff on the fetch.

> **Morgan vs. Alex — Should we use `install_id` for free tier?**

> **Morgan:** Hard no. Free tier should be zero friction. Requiring any machine binding on free keys will kill adoption. The data shows 60% of conversion happens because developers try the product at home first, then evangelize at work.

> **Alex:** Agreed. `install_id` is Enterprise-only and opt-in.

#### ✅ Consensus — Topic 1

- **Format:** `AGKEY-<base64url(ED25519-signed JWT)>` — human-readable prefix, URL-safe body.
- **Signing:** Ed25519 with key rotation via `kid` header. Signing keys rotated annually.  
- **Payload fields:** `{ iss, sub (tenant_id), iat, exp, jti, kid, tier, seats, events_pm, features[], install_id? }`
- **Offline validation:** Public key embedded in Docker image at build time. The binary validates signature without network.
- **Revocation:** Signed CRL fetched every **6 hours** (Sam wins). Cached on disk. Grace period of 24h if CRL server unreachable.
- **Key expiry:** Free = rolling 30-day (auto-renewed via phone-home). Pro = 1-year. Enterprise = custom (1–3 year). Trial = 14-day.
- **Free tier key format:** Same format, issued automatically. No machine binding.
- **Enterprise air-gap:** Optional `install_id` field = SHA-256 of `(hostname + first_mac_addr)`. Non-required for validation; just logged.

---

### Topic 2: Tier Design & Feature Gating

---

#### Positions

**💰 Morgan (Monetization):**

AgentGuard competes against "just write an if statement in your agent code." The free tier has to be genuinely useful — not crippled. Here's my position:

**Free Tier Philosophy:** Every developer who deploys AgentGuard free is a marketing channel. The limits should be *volume*, not *capability*. Gate the enterprise-scale features, not the core security features.

**Free should include:**
- All 51 API endpoints (no endpoint lockout — that's a terrible DX)
- Up to 3 agent seats
- 10,000 evaluations/month (enough for a real production micro-service)
- Basic policy engine (rules-based)
- Audit log with 7-day retention
- Dashboard (read-only after free limit hit, never locked out of viewing)
- Local eval SDK (always free — this builds dependency)

**Pro gate:** Volume + power features. $149/mo is impulse-purchase territory for a team.

**Enterprise gate:** Compliance + multi-tenancy + SLA. This is negotiated, $1,500+/mo.

**🏗️ Alex (Architect):**

From an architecture standpoint, feature gating in a distributed system is non-trivial. My position: **gate at the middleware layer, not at the route layer**. Every request flows through auth middleware which already resolves `tenant_id` → we inject a `LicenseContext` object into the Hono context. Route handlers check `ctx.license.features.includes('hitl')` rather than duplicating limits everywhere.

For the 51 endpoints — I agree with Morgan, don't lock endpoints. Instead:
- Rate-limit free tier at the Redis layer (existing infrastructure)
- Return HTTP 402 with upgrade prompt JSON when soft limits hit
- Hard limits only for events_pm ceiling (after 10k/mo, evaluation API returns 402)

**🔐 Sam (Security):**

Security concern: if we gate on `ctx.license.features`, the license context must be tamper-proof in memory. A sophisticated attacker running the Docker container could:
1. Memory-patch the features array after validation
2. Replace the embedded public key with their own

Mitigations I want:
1. License validation runs in a **separate goroutine/process** (or at minimum a closure with no external write access)
2. License state re-validated every 60 minutes in the background (not just at startup)
3. The public key is embedded in **multiple locations** in the binary — checked at runtime against each other (integrity self-check)

#### ⚡ Disagreements

**Morgan vs. Alex — Free tier event limit: 10k or more?**

> **Morgan:** SaaS industry data shows 10k/mo sounds generous but is actually conservative for real workloads. I'd argue for **25,000/mo** free. The marginal cost to us is near-zero (Redis counter + Postgres write). The conversion driver is seats and retention features, not event count.

> **Alex:** 25k is fine architecturally. The Redis counter is O(1). I'll add a `LIMIT_APPROACHING` warning at 80% usage.

**Sam vs. Morgan — Should HITL be available on free tier?**

> **Sam:** HITL is a *security* feature, not a premium feature. Blocking it on free tier means some developer deploys AgentGuard without HITL because they can't afford Pro — and their agent causes an incident. That's bad for our brand.

> **Morgan:** I hear you on safety, but HITL requires our notification infrastructure (Slack, email, webhook) and backend gate management. That infrastructure costs money. Compromise: free tier gets **3 HITL gates concurrent max** but the feature itself works. Pro gets unlimited.

> **Sam:** Deal.

**Alex vs. Morgan — Should any feature be cloud-only (not self-hosted)?**

> **Morgan:** I initially wanted Threat Intelligence Feed to be cloud-only — forces a phone-home. But honestly the BSL license already prevents competitors from re-hosting. Keep everything self-hostable on Enterprise.

> **Alex:** Agreed. The only thing that *can't* be self-hosted is our SaaS dashboard at app.agentguard.dev — but that's separate from the self-hosted deployment. Self-hosted users get a local dashboard (already exists).

#### ✅ Consensus — Topic 2

See the full [Tier/Pricing Matrix](#4-tier--pricing-matrix) section.

Key decisions:
- **No endpoint lockouts** — all 51 endpoints available on all tiers
- **Volume gating** via monthly event counters in Redis
- **Free:** 100,000 events/month, 3 agent seats, 30-day audit retention, 3 concurrent HITL gates
- **Pro ($149/mo):** 500,000 events/month, 25 seats, 90-day retention, unlimited HITL, SIEM, anomaly detection
- **Enterprise (custom):** Unlimited, air-gap support, custom data residency, SLA, SSO
- **All tiers self-hostable** (BSL 1.1 constraint honored)
- Runtime license re-validation every **60 minutes** (Sam's requirement)

---

### Topic 3: License Validation Flow

---

#### Positions

**🏗️ Alex (Architect):**

The `docker compose up` first-run flow should be:

```
1. Container starts
2. License service reads AGENTGUARD_LICENSE_KEY env var
3. If key missing → start in FREE mode (auto-provisioned community key or no key = free limits)
4. If key present → validate signature locally (Ed25519, <1ms)
5. If valid locally → attempt phone-home to license.agentguard.dev/v1/validate
6. Phone-home success → cache LicenseCache blob to /data/license.cache (Ed25519-signed)
7. Phone-home fails → use cached blob if not expired (72h grace)
8. Phone-home fails + no cache → degrade to FREE limits, warn in logs
9. Normal operation begins
```

Phone-home frequency in steady state: once per **24 hours**, jittered by ±4h to avoid thundering herd on server reboots.

**💰 Morgan (Monetization):**

I want the degradation behavior to be *visible* not punitive. When limits are exceeded:
1. **80% of monthly limit:** Warning in dashboard banner + log line `[AGENTGUARD-LICENSE] approaching monthly limit (80%)`
2. **100% of monthly limit:** HTTP 402 response with body `{ "error": "LIMIT_EXCEEDED", "tier": "free", "upgrade_url": "https://agentguard.dev/upgrade" }`. Do NOT silently allow or silently drop — the customer should see the wall clearly.
3. **Exceeded + Pro:** Don't hard block. Instead: rate limit to 10 req/sec for the remainder of the billing period (soft throttle).

Also: the license status page in the dashboard should show a real-time meter with upgrade CTA. This is a conversion surface, not just a status page.

**🔐 Sam (Security):**

Phone-home data should be minimal. I don't want to send usage telemetry to our servers without explicit opt-in. The phone-home request should only send:
- `jti` (key ID — we already know this)
- `install_id` (if set)
- `version` (AgentGuard binary version)

**Not:** event counts, agent names, tenant data, evaluation results — none of that.

The response from phone-home:
- Updated CRL if changed (delta-encoded)
- Acknowledgment + server timestamp (for cache timestamp)

#### ⚡ Disagreements

**Alex vs. Morgan — What happens at startup if license is invalid?**

> **Alex:** If the key is cryptographically invalid (bad signature, expired, revoked), the container should **refuse to start**. Log a clear error and exit 1. Security requires deterministic enforcement.

> **Morgan:** That will absolutely wreck someone's 3am deploy. If there's a license service outage on our end, every customer's container fails to start. That's a Stripe incident-level disaster. Compromise: cryptographically invalid (bad signature) = exit 1. Expired/revoked = degrade to free, warn, keep running.

> **Alex:** Agreed. Sig invalid = hard fail. Everything else = degrade.

**Sam vs. Morgan — Offline grace period: 72h or 30 days?**

> **Sam:** 72 hours is too short for enterprise customers with air-gapped deployments. Some of these customers have strict change-control processes — they can't update network rules in 72 hours. I want 30 days.

> **Morgan:** 30 days is too long from a business perspective. A customer who stops paying can run for 30 free days. Compromise: **Pro = 7 days offline grace. Enterprise = 30 days** (negotiated, in the license key itself as `offline_grace_days` field).

> **Sam:** Works for me.

#### ✅ Consensus — Topic 3

**First-run flow:**
```
Container start
  → Read AGENTGUARD_LICENSE_KEY (env)
  → If absent: run in FREE mode (no key needed for free)
  → If present:
      → Verify Ed25519 signature
        → BAD SIGNATURE: log error, exit 1
        → VALID: continue
      → Check expiry
        → EXPIRED + no cache: degrade to FREE, warn
        → EXPIRED + valid cache: use cached tier for grace period
      → Attempt phone-home (5s timeout, non-blocking on critical path)
        → SUCCESS: refresh cache, proceed with licensed tier
        → FAIL: use cached blob if within grace period
      → Start serving
```

**Runtime re-validation:**
- Every 60 minutes in background goroutine
- Phone-home every 24h ± 4h jitter
- On limit exceeded: 402 at hard limits, 429 throttle at Pro overages
- License status persisted to `/data/license.cache` (mounted volume)

**Grace periods:**
- Free → Pro upgrade validation: immediate (key swap + restart)
- Pro offline grace: 7 days
- Enterprise offline grace: configurable via `offline_grace_days` in key payload (default 30)
- CRL refresh: 6h TTL, 24h grace if server unreachable

---

### Topic 4: Anti-Piracy vs Developer Experience

---

#### Positions

**🔐 Sam (Security):**

Pragmatic piracy model: **assume 5–15% of deployments are unlicensed**, same as every other dev tool. Our goal is not to eliminate piracy (impossible) — it's to:
1. Make legitimate use so frictionless that piracy provides no DX advantage
2. Detect the most egregious violations (key sharing at scale)
3. Preserve audit-ability for Enterprise compliance

Key sharing detection approach:
- Each phone-home includes `install_id` hash
- Our server tracks unique `(jti, install_id)` tuples
- If a single Pro key is phoning home from >3 unique install_ids in 24h → flag for review
- Do NOT auto-revoke — false positives from dev/staging/prod environments. Alert our team to investigate.

For Enterprise: `max_installs` field in key payload. Enforce at phone-home. Soft limit (warn) up to 110%, hard limit (refuse phone-home, but don't kill existing cache) above 150%.

**💰 Morgan (Monetization):**

Developer experience requirements:
1. **Time to first evaluate:** < 60 seconds from `git clone` to first `/v1/actions/evaluate` response — no license required
2. **No credit card for free tier** — ever
3. **No "activation wizard"** — set env var, done
4. **Upgrade path:** One click in dashboard → redirects to Stripe checkout → returns with new key → paste into `.env` → restart → done
5. **Trial:** 14-day Pro trial key issued at signup, no CC. Converts or downgrades automatically.

Anti-piracy measures that are **unacceptable from a DX perspective:**
- Hardware dongles (obviously)
- Requiring internet for every evaluation request
- "Phone home" that adds latency to the hot path (evaluate endpoint)
- Requiring a restart to change license keys

**🏗️ Alex (Architect):**

From a bypass-resistance standpoint, let me be honest: the Docker image can be disassembled. Someone determined can patch the validation logic. Our defense is layered:
1. **Primary:** Crypto signature makes key forgery computationally infeasible (Ed25519)
2. **Secondary:** License validation in a separate module with integrity checks
3. **Tertiary:** Phone-home telemetry patterns — unusual usage without phone-home stands out
4. **Quaternary:** BSL 1.1 license — legal deterrent for commercial use

We should NOT try to make the binary "unhackable" — that's an arms race we'll lose and it'll annoy legitimate users.

#### ⚡ Disagreements

**Sam vs. Morgan — Should we phone-home usage stats?**

> **Sam:** No usage stats without explicit opt-in. Privacy matters. Our target customer is security-conscious enterprises. Sending event counts to our server without consent is a deal-breaker in EU/regulated industries.

> **Morgan:** I want at minimum anonymous usage statistics for product analytics. How else do we know which features to build?

> **Sam → Morgan:** Opt-in analytics via a separate `AGENTGUARD_TELEMETRY_ENABLED=true` env var. Default off. The phone-home for license validation is minimal (just key ID + version). Aggregate stats are completely separate.

> **Morgan:** Fine. We'll add the telemetry opt-in to the onboarding flow as a clear opt-in checkbox.

**Alex vs. Sam — Key sharing threshold: 3 installs or 5?**

> **Alex:** 3 is too low. A typical Pro team has dev laptop, CI/CD runner, staging, and production = 4 already.

> **Sam:** Fair. **5 unique install_ids per Pro key** before flagging. Enterprise gets `max_installs` field.

#### ✅ Consensus — Topic 4

**Anti-piracy measures (non-annoying):**
1. Ed25519 signature — key forgery infeasible
2. CRL for revocation — 6h TTL
3. Install tracking via `install_id` — flag at >5 unique installs per key (alert, not auto-revoke)
4. BSL 1.1 legal deterrent for commercial use
5. Enterprise: `max_installs` in key payload, soft limit at 110%, phone-home refusal at 150%

**Developer experience guarantees:**
1. Zero network required for basic free tier (phone-home is best-effort)
2. Time to first evaluation: < 60 seconds
3. No CC for free tier, ever
4. Key change: hot-reload via SIGHUP or 60-minute background re-check (no restart required for key rotation)
5. Clear upgrade prompts: 402 response body includes `upgrade_url`
6. License status visible in dashboard at all times
7. Usage telemetry: opt-in only, separate from license phone-home

**Audit requirements (Enterprise):**
- Full audit log of license validation events
- API endpoint to query current license status
- SIEM-exportable license events
- License key rotation log

---

### Topic 5: Implementation Plan

---

#### Positions

**🏗️ Alex (Architect):**

The implementation needs to be surgical — we have 51 working endpoints and can't break them. My approach:

1. **New package:** `packages/license/` — pure TypeScript, no Hono dependency. Responsible for: key parsing, signature verification, CRL management, LicenseContext type.

2. **Hono middleware injection:** A new `licenseMiddleware` that runs after `authMiddleware`. It reads `ctx.tenant.plan` from the existing `Tenant` model (already has `TenantPlan` enum!) and injects a `LicenseContext` into the Hono context.

3. **License service (cloud-side):** New `packages/license-server/` or routes in the existing API: `/v1/license/*` endpoints for issuance, validation, revocation.

4. **Prisma schema additions:** New `License` and `LicenseCRL` models. Extend `Tenant` model with `licenseKeyId`.

5. **Docker Compose changes:** Add `AGENTGUARD_LICENSE_KEY` env var, mount `/data/license.cache` volume.

**💰 Morgan (Monetization):**

Product requirements for implementation:

1. **Admin dashboard pages:**
   - `/settings/license` — current key, tier, usage meters, upgrade CTA
   - `/billing` — Stripe portal integration (or manual for Enterprise)

2. **Onboarding flow changes:**
   - Step 1: Email verification → auto-issue free key
   - Step 2: Dashboard shows "You're on Free" banner with Pro trial CTA
   - Step 3: Trial CTA → Stripe checkout → key issued → instructions to update `.env`

3. **Upgrade prompts in API responses:**
   - All 402 responses include structured `upgrade_info` object
   - 80% limit warnings in dashboard WebSocket events

4. **Stripe integration:**
   - Webhook for `customer.subscription.created/updated/deleted`
   - Triggers license key issuance/revocation
   - Customer portal for self-service

**🔐 Sam (Security):**

Security review requirements:

1. **Key generation:** Must use `crypto.getRandomValues()` or Node's `crypto.randomBytes()` for the `jti` — never `Math.random()`
2. **Key storage:** Our private signing key must be in a secrets manager (AWS Secrets Manager, Vault) — NOT in `.env` of the license server
3. **Key transmission:** Keys transmitted to users via HTTPS only, one-time reveal in dashboard (like GitHub PATs)
4. **Rate limiting on key issuance:** Max 5 key issuances per tenant per hour (prevent enumeration)
5. **Audit log:** Every key issuance, validation, revocation logged to immutable audit trail
6. **CRL signing:** CRL is itself Ed25519-signed with a separate CRL signing key (not the same as license signing key)

#### ⚡ Disagreements

**Alex vs. Morgan — Where does license logic live?**

> **Alex:** Separate `packages/license/` package. Clean separation of concerns.

> **Morgan:** That's more infra to build. Can we just add it to the existing API package?

> **Alex:** No. The SDK (npm/PyPI) needs to do **local** license validation without importing the entire Hono API. It needs to be a standalone package that works in both environments.

> **Morgan:** Fine. One package: `@agentguard/license` — shared between API and SDK.

**Sam vs. Morgan — Stripe vs. manual billing for Enterprise?**

> **Sam:** Manual (invoiced) billing is actually more secure for Enterprise. Stripe webhooks introduce an attack surface — a crafted webhook could trigger license issuance.

> **Morgan:** Stripe webhooks are HMAC-signed. We verify the signature. Every SaaS company does this. Manual billing doesn't scale past 50 Enterprise customers.

> **Sam:** Fine. HMAC-verified Stripe webhooks with idempotency keys. But the license issuance from Stripe webhook should be rate-limited and logged.

#### ✅ Consensus — Topic 5

See detailed [Implementation Spec](#3-detailed-implementation-spec) below.

Key architectural decisions:
- New `@agentguard/license` package (shared between API and SDK)
- License middleware in API, after auth middleware
- License models in existing Prisma schema (extending, not replacing)
- Stripe webhooks with HMAC verification for paid tier issuance
- License key one-time reveal in dashboard (like GitHub PATs)
- Signing key in secrets manager

---

## 2. Final Consensus Decisions

### Architecture Decisions Record (ADR)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Ed25519-signed JWT format with `AGKEY-` prefix | Fast offline verification, standard crypto, human-distinguishable |
| 2 | Public key embedded in Docker image at build time | Enables offline validation without network dependency |
| 3 | CRL refreshed every 6 hours, 24h grace if unreachable | Balances security (fast revocation) vs. reliability (offline tolerance) |
| 4 | Free tier = 25k events/mo, 3 agents, no CC required | Maximizes adoption; converts on volume and enterprise features |
| 5 | No endpoint lockouts — all 51 endpoints available on all tiers | DX first; gate on volume and enterprise scale features |
| 6 | Pro offline grace = 7 days; Enterprise = configurable (default 30) | Enterprise air-gap reality acknowledged |
| 7 | License validation in dedicated `@agentguard/license` package | Shared between API and SDK; clean separation |
| 8 | Phone-home telemetry opt-in only, separate from license validation | Privacy-first for regulated industry customers |
| 9 | Install sharing flagged at 5 unique install_ids per Pro key | Alert only, no auto-revoke (too many false positives) |
| 10 | Stripe webhooks for paid tier (HMAC-verified) | Scale + automation; security handled at webhook verification layer |
| 11 | License status hot-reload via SIGHUP (no restart required) | DX requirement — key rotation must not require restart |
| 12 | HTTP 402 with `upgrade_url` on limit exceeded | Clear conversion surface in API response |
| 13 | `BAD_SIGNATURE` = exit 1; `EXPIRED/REVOKED` = degrade to free | Cryptographic integrity is hard fail; business state is soft fail |
| 14 | Runtime license re-validation every 60 minutes in background | Security without latency on hot path |

---

## 3. Detailed Implementation Spec

### 3.1 New Package: `@agentguard/license`

**Location:** `packages/license/`

```
packages/license/
├── src/
│   ├── index.ts                 # Public exports
│   ├── types.ts                 # LicenseKey, LicenseContext, LicenseTier, etc.
│   ├── validator.ts             # Ed25519 signature verification
│   ├── parser.ts                # AGKEY- prefix parsing + JWT decode
│   ├── crl.ts                   # CRL fetch, cache, check
│   ├── context.ts               # LicenseContext builder from parsed key
│   ├── limits.ts                # Tier limit constants + enforcement helpers
│   ├── fingerprint.ts           # install_id generation (hostname + MAC hash)
│   └── errors.ts                # LicenseError, InvalidSignatureError, etc.
├── keys/
│   └── agentguard-license-pub.pem  # Ed25519 public key (embedded at build)
├── package.json
└── tsconfig.json
```

**Key types:**

```typescript
// packages/license/src/types.ts

export type LicenseTier = 'free' | 'pro' | 'enterprise';

export interface LicensePayload {
  iss: string;                    // "license.agentguard.dev"
  sub: string;                    // tenant_id
  iat: number;                    // issued-at epoch
  exp: number;                    // expiry epoch
  jti: string;                    // unique key UUID (for revocation)
  kid: string;                    // signing key ID (for rotation)
  tier: LicenseTier;
  seats: number;                  // max agent seats (0 = unlimited)
  events_pm: number;              // max evaluations/month (0 = unlimited)
  features: LicenseFeature[];     // named feature flags
  install_id?: string;            // optional machine binding hash
  offline_grace_days?: number;    // enterprise override (default: 7 for pro, 30 for enterprise)
  max_installs?: number;          // enterprise concurrent installs limit
  trial?: boolean;                // is this a trial key
}

export type LicenseFeature =
  | 'hitl'                        // Human-in-the-loop gates
  | 'hitl_unlimited'              // Unlimited concurrent HITL (pro+)
  | 'siem'                        // SIEM integrations (splunk/sentinel)
  | 'anomaly_detection'           // ML anomaly scoring
  | 'sso'                         // SAML/OIDC SSO
  | 'audit_export'                // Audit log export (CSV, SIEM push)
  | 'audit_retention_90d'         // 90-day audit retention
  | 'audit_retention_1y'          // 1-year audit retention
  | 'audit_retention_7y'          // 7-year immutable retention (enterprise)
  | 'multi_region'                // Multi-region data residency
  | 'custom_data_residency'       // Custom data residency region
  | 'air_gap'                     // Air-gapped deployment support
  | 'rbac_advanced'               // Advanced RBAC (custom roles)
  | 'policy_inheritance'          // Policy template inheritance
  | 'api_rate_unlimited'          // No rate limits on API
  | 'priority_support'            // Priority support SLA
  | 'dedicated_csm';              // Dedicated customer success manager

export interface LicenseContext {
  valid: boolean;
  tier: LicenseTier;
  tenantId: string;
  keyId: string;                  // jti
  expiresAt: Date;
  features: Set<LicenseFeature>;
  limits: {
    seats: number;
    events_pm: number;
    max_installs?: number;
    hitl_concurrent?: number;     // 3 for free, unlimited for pro+
    audit_retention_days: number;
  };
  isTrial: boolean;
  installId?: string;
  offlineGraceDays: number;
  source: 'key' | 'cache' | 'free_default';
  validatedAt: Date;
}

export interface LicenseCacheBlob {
  payload: LicensePayload;
  serverValidatedAt: string;      // ISO timestamp from server
  localCachedAt: string;          // ISO timestamp
  cacheSignature: string;         // Ed25519 signature of (payload + serverValidatedAt + localCachedAt)
}
```

**Core validator:**

```typescript
// packages/license/src/validator.ts
import { createVerify } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

// Embedded public key — loaded once at module init
const PUBLIC_KEY = readFileSync(
  join(__dirname, '../keys/agentguard-license-pub.pem'),
  'utf8'
);

export function verifyLicenseKey(agkey: string): LicensePayload {
  if (!agkey.startsWith('AGKEY-')) {
    throw new InvalidSignatureError('Key must start with AGKEY-');
  }

  const jwtPart = agkey.slice(6); // Remove "AGKEY-" prefix
  const parts = jwtPart.split('.');
  if (parts.length !== 3) {
    throw new InvalidSignatureError('Malformed license key');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = Buffer.from(signatureB64, 'base64url');

  const verify = createVerify('Ed25519');
  verify.update(signingInput);

  if (!verify.verify(PUBLIC_KEY, signature)) {
    throw new InvalidSignatureError('License key signature verification failed');
  }

  const payload = JSON.parse(
    Buffer.from(payloadB64, 'base64url').toString('utf8')
  ) as LicensePayload;

  if (payload.iss !== 'license.agentguard.dev') {
    throw new InvalidSignatureError('License key issuer mismatch');
  }

  return payload;
}
```

---

### 3.2 New Prisma Models

Add to `packages/api/prisma/schema.prisma`:

```prisma
// ─────────────────────────────────────────────────────────────────────
// LICENSE KEY
// ─────────────────────────────────────────────────────────────────────

model LicenseKey {
  id            String        @id @default(cuid())
  tenantId      String        @unique   // one active key per tenant
  jti           String        @unique   // JWT ID from key payload
  kid           String                  // signing key ID
  tier          LicenseTier
  status        LicenseStatus @default(ACTIVE)
  expiresAt     DateTime
  issuedAt      DateTime      @default(now())
  revokedAt     DateTime?
  revokedReason String?
  isTrial       Boolean       @default(false)
  keyPrefix     String                  // First 8 chars for display (e.g. "AGKEY-ab")
  // Raw key never stored — only issued once to customer
  
  // Limits (denormalized from key payload for fast queries)
  seatLimit     Int           @default(3)
  eventsPerMonth Int          @default(25000)
  
  // Metadata
  stripeSubscriptionId String?
  issuedByUserId       String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([jti])
  @@index([stripeSubscriptionId])
}

enum LicenseTier {
  FREE
  PRO
  ENTERPRISE
}

enum LicenseStatus {
  ACTIVE
  EXPIRED
  REVOKED
  TRIAL
}

// ─────────────────────────────────────────────────────────────────────
// LICENSE VALIDATION EVENT (Audit trail for license activity)
// ─────────────────────────────────────────────────────────────────────

model LicenseEvent {
  id          String             @id @default(cuid())
  tenantId    String
  jti         String             // key JTI
  eventType   LicenseEventType
  installId   String?
  ipAddress   String?
  userAgent   String?
  agVersion   String?            // AgentGuard binary version
  details     Json?              @db.JsonB
  occurredAt  DateTime           @default(now())

  @@index([tenantId, occurredAt(sort: Desc)])
  @@index([jti, occurredAt(sort: Desc)])
  @@index([jti, installId])      // for install tracking
}

enum LicenseEventType {
  KEY_ISSUED
  KEY_VALIDATED         // successful phone-home validation
  KEY_VALIDATION_FAILED // invalid key attempt
  KEY_REVOKED
  KEY_EXPIRED
  KEY_ROTATED
  LIMIT_APPROACHED      // 80% of monthly limit
  LIMIT_EXCEEDED        // 100% of monthly limit
  GRACE_PERIOD_STARTED
  GRACE_PERIOD_EXPIRED
  CRL_FETCHED
  INSTALL_FLAGGED       // >5 unique installs on one key
}

// ─────────────────────────────────────────────────────────────────────
// MONTHLY USAGE COUNTER (Reset on billing cycle)
// ─────────────────────────────────────────────────────────────────────

model LicenseUsage {
  id          String   @id @default(cuid())
  tenantId    String
  periodStart DateTime               // First day of billing month
  periodEnd   DateTime               // Last day of billing month
  eventsUsed  Int      @default(0)
  seatsUsed   Int      @default(0)
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, periodStart])
  @@index([tenantId, periodStart(sort: Desc)])
}
```

Also extend the existing `Tenant` model:

```prisma
model Tenant {
  // ... existing fields ...
  
  // License fields (add these)
  licenseKeyId    String?           // FK to active LicenseKey
  licenseKey      LicenseKey?       @relation(fields: [licenseKeyId], references: [id])
  licenseEvents   LicenseEvent[]
  licenseUsage    LicenseUsage[]
}
```

---

### 3.3 License Middleware (API)

**New file:** `packages/api/src/middleware/license.ts`

```typescript
import type { Context, Next } from 'hono';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { verifyLicenseKey, buildLicenseContext } from '@agentguard/license';
import type { LicenseContext } from '@agentguard/license';
import { getContext } from './auth.js';

declare module 'hono' {
  interface ContextVariableMap {
    license: LicenseContext;
  }
}

export async function licenseMiddleware(c: Context, next: Next): Promise<void> {
  const ctx = getContext(c);
  
  // Check Redis cache first (TTL: 60 minutes)
  const cacheKey = `license:${ctx.tenantId}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    c.set('license', JSON.parse(cached) as LicenseContext);
    await next();
    return;
  }

  // Load from DB
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    include: { licenseKey: true },
  });

  let licenseCtx: LicenseContext;

  if (!tenant?.licenseKey || tenant.licenseKey.status !== 'ACTIVE') {
    // No license or inactive → free defaults
    licenseCtx = buildFreeLicenseContext(ctx.tenantId);
  } else {
    licenseCtx = buildLicenseContext(tenant.licenseKey);
  }

  // Cache for 60 minutes
  await redis.setex(cacheKey, 3600, JSON.stringify(licenseCtx));
  
  c.set('license', licenseCtx);
  await next();
}

// Helper to check feature access
export function requireFeature(feature: LicenseFeature) {
  return async (c: Context, next: Next) => {
    const license = c.get('license');
    if (!license.features.has(feature)) {
      return c.json({
        error: 'FEATURE_NOT_AVAILABLE',
        message: `Feature '${feature}' requires a higher tier`,
        currentTier: license.tier,
        upgrade_url: 'https://agentguard.dev/upgrade',
      }, 402);
    }
    await next();
  };
}

// Helper to check and increment usage counter
export async function checkEventLimit(
  tenantId: string,
  license: LicenseContext
): Promise<{ allowed: boolean; current: number; limit: number }> {
  if (license.limits.events_pm === 0) {
    // Unlimited (enterprise)
    return { allowed: true, current: 0, limit: 0 };
  }

  const monthKey = `usage:events:${tenantId}:${getCurrentMonth()}`;
  const current = await redis.incr(monthKey);
  
  // Set TTL on first increment (35 days to cover billing cycle slop)
  if (current === 1) {
    await redis.expire(monthKey, 35 * 24 * 3600);
  }

  const limit = license.limits.events_pm;
  
  if (current === Math.floor(limit * 0.8)) {
    // Fire-and-forget 80% warning event
    void emitLimitWarning(tenantId, current, limit, '80_PERCENT');
  }

  return {
    allowed: current <= limit,
    current,
    limit,
  };
}
```

---

### 3.4 License API Routes (Cloud-side)

**New file:** `packages/api/src/routes/license.ts`

Endpoints:

```
POST  /v1/license/issue          # Issue a new key (internal admin only)
POST  /v1/license/validate       # Phone-home validation endpoint  
POST  /v1/license/rotate         # Rotate to a new key (returns new key, invalidates old)
GET   /v1/license/status         # Current license status for tenant
POST  /v1/license/revoke         # Revoke a key (admin only)
GET   /v1/license/crl            # Download current CRL (public, signed)
GET   /v1/license/usage          # Current month usage stats
POST  /v1/license/activate       # First-time key activation (from docker env var phone-home)
```

**Key implementation — validate endpoint:**

```typescript
// POST /v1/license/validate
// Called by self-hosted Docker instances every 24h
licenseRouter.post('/validate', async (c) => {
  const body = await c.req.json<{
    jti: string;
    install_id?: string;
    version: string;
  }>();

  // Look up key by JTI
  const licenseKey = await prisma.licenseKey.findUnique({
    where: { jti: body.jti },
  });

  if (!licenseKey || licenseKey.status !== 'ACTIVE') {
    // Log validation failure
    await logLicenseEvent(licenseKey?.tenantId ?? 'unknown', {
      eventType: 'KEY_VALIDATION_FAILED',
      jti: body.jti,
      installId: body.install_id,
      agVersion: body.version,
    });

    return c.json({ valid: false, reason: 'KEY_INVALID_OR_REVOKED' }, 401);
  }

  // Track install_id for sharing detection
  if (body.install_id) {
    await trackInstall(licenseKey.tenantId, body.jti, body.install_id);
  }

  // Log successful validation
  await logLicenseEvent(licenseKey.tenantId, {
    eventType: 'KEY_VALIDATED',
    jti: body.jti,
    installId: body.install_id,
    agVersion: body.version,
  });

  // Return validation response (minimal — no usage data)
  return c.json({
    valid: true,
    tier: licenseKey.tier.toLowerCase(),
    expiresAt: licenseKey.expiresAt.toISOString(),
    serverTimestamp: new Date().toISOString(),
    // Delta-encode CRL if changed since last validation
    crlUpdated: await hasCRLUpdatedSince(body.lastCrlFetch),
  });
});
```

---

### 3.5 Stripe Webhook Handler

**New file:** `packages/api/src/routes/stripe-webhook.ts`

```typescript
// POST /webhooks/stripe
// Stripe sends events here; we issue/update/revoke license keys

stripeWebhook.post('/', async (c) => {
  const signature = c.req.header('stripe-signature');
  const body = await c.req.text();
  
  // HMAC verification (Sam's requirement)
  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionChange(event.data.object);
      break;
    
    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(event.data.object);
      break;
    
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
  }

  return c.json({ received: true });
});

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const tenantId = subscription.metadata.tenant_id;
  const tier = mapStripePriceToTier(subscription.items.data[0].price.id);
  
  // Issue new license key with idempotency (jti = subscription.id)
  await issueLicenseKey({
    tenantId,
    tier,
    stripeSubscriptionId: subscription.id,
    expiresAt: new Date(subscription.current_period_end * 1000),
  });
  
  // Invalidate license cache
  await redis.del(`license:${tenantId}`);
}
```

---

### 3.6 Enforce Limits in Existing Routes

**Modify:** `packages/api/src/routes/actions.ts`

Add limit check at the top of the evaluate endpoint:

```typescript
actionsRouter.post('/evaluate', async (c) => {
  const ctx = getContext(c);
  const license = c.get('license');  // Injected by licenseMiddleware

  // ── License limit check ────────────────────────────────────────────
  const { allowed, current, limit } = await checkEventLimit(ctx.tenantId, license);
  
  if (!allowed) {
    return c.json({
      error: 'MONTHLY_LIMIT_EXCEEDED',
      message: `Monthly evaluation limit of ${limit.toLocaleString()} reached`,
      current,
      limit,
      tier: license.tier,
      upgrade_url: 'https://agentguard.dev/upgrade',
      reset_date: getNextBillingCycleDate(ctx.tenantId),
    }, 402);
  }

  // ... rest of existing evaluate logic ...
});
```

**Modify HITL routes** — add concurrent gate limit for free tier:

```typescript
// packages/api/src/routes/hitl.ts
hitlRouter.post('/gates', async (c) => {
  const license = c.get('license');
  
  if (!license.features.has('hitl_unlimited')) {
    // Free tier: max 3 concurrent HITL gates
    const activeGates = await prisma.hITLGate.count({
      where: { tenantId: ctx.tenantId, status: 'PENDING' }
    });
    
    if (activeGates >= 3) {
      return c.json({
        error: 'HITL_LIMIT_EXCEEDED',
        message: 'Free tier allows max 3 concurrent HITL gates',
        upgrade_url: 'https://agentguard.dev/upgrade',
      }, 402);
    }
  }
  
  // ... rest of gate creation ...
});
```

**Modify SIEM routes** — gate on feature:

```typescript
// packages/api/src/middleware added to SIEM routes
app.route('/v1/siem', requireFeature('siem'), siemRouter);
```

**Modify Audit routes** — enforce retention window:

```typescript
// packages/api/src/routes/audit.ts — add to query
const retentionDays = license.limits.audit_retention_days;
const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);

// Add to all audit queries:
where: {
  tenantId: ctx.tenantId,
  occurredAt: { gte: cutoff },
  // ... other filters
}
```

---

### 3.7 Docker Compose Changes

**Modify:** `docker-compose.yml` (root level)

```yaml
version: '3.8'

services:
  api:
    image: agentguard/api:latest
    environment:
      # License key (optional — free tier if absent)
      AGENTGUARD_LICENSE_KEY: ${AGENTGUARD_LICENSE_KEY:-}
      
      # License server URL (for phone-home)
      AGENTGUARD_LICENSE_SERVER: ${AGENTGUARD_LICENSE_SERVER:-https://license.agentguard.dev}
      
      # Optional: opt-in usage telemetry
      AGENTGUARD_TELEMETRY_ENABLED: ${AGENTGUARD_TELEMETRY_ENABLED:-false}
      
      # Install ID (auto-generated if not set)
      AGENTGUARD_INSTALL_ID: ${AGENTGUARD_INSTALL_ID:-}
      
      # ... existing env vars ...
    volumes:
      - license_cache:/data/license
      # ... existing volumes ...
    
  # ... other services ...

volumes:
  license_cache:
    driver: local
```

**New file:** `packages/api/src/lib/license-manager.ts`

Singleton that manages:
- Startup validation
- Background 60-minute re-validation loop
- Cache read/write to `/data/license/license.cache`
- SIGHUP handler for hot-reload

```typescript
export class LicenseManager {
  private static instance: LicenseManager;
  private context: LicenseContext;
  private revalidationInterval: NodeJS.Timeout | null = null;

  static getInstance(): LicenseManager {
    if (!LicenseManager.instance) {
      LicenseManager.instance = new LicenseManager();
    }
    return LicenseManager.instance;
  }

  async initialize(): Promise<void> {
    const keyString = process.env.AGENTGUARD_LICENSE_KEY;
    
    if (!keyString) {
      this.context = buildFreeLicenseContext('default');
      logger.info('[LICENSE] No key configured — running in Free mode');
      return;
    }

    try {
      // Will throw InvalidSignatureError on bad sig → exit 1
      const payload = verifyLicenseKey(keyString);
      
      // Check expiry (soft fail)
      if (new Date(payload.exp * 1000) < new Date()) {
        const cached = await this.loadCache();
        if (cached && !this.isCacheExpired(cached)) {
          this.context = buildLicenseContext(cached.payload);
          logger.warn('[LICENSE] Key expired — using cached license within grace period');
        } else {
          this.context = buildFreeLicenseContext('default');
          logger.warn('[LICENSE] Key expired — degrading to Free mode');
        }
        return;
      }

      // Attempt phone-home (5s timeout, non-blocking)
      const validated = await this.phoneHome(payload);
      
      if (validated) {
        this.context = buildLicenseContext(payload);
        await this.saveCache(payload);
        logger.info(`[LICENSE] Validated — Tier: ${payload.tier.toUpperCase()}`);
      } else {
        const cached = await this.loadCache();
        if (cached && !this.isCacheExpired(cached)) {
          this.context = buildLicenseContext(cached.payload);
          logger.warn('[LICENSE] Phone-home failed — using cached license');
        } else {
          this.context = buildFreeLicenseContext('default');
          logger.warn('[LICENSE] Phone-home failed, no valid cache — Free mode');
        }
      }
    } catch (err) {
      if (err instanceof InvalidSignatureError) {
        logger.error('[LICENSE] INVALID SIGNATURE — refusing to start');
        process.exit(1);
      }
      throw err;
    }

    // Start background re-validation
    this.startRevalidationLoop();
    
    // SIGHUP = reload key
    process.on('SIGHUP', () => this.reload());
  }

  private startRevalidationLoop(): void {
    // Re-validate every 60 minutes
    this.revalidationInterval = setInterval(
      () => void this.revalidate(),
      60 * 60 * 1000
    );
  }

  getContext(): LicenseContext {
    return this.context;
  }
}
```

---

### 3.8 SDK Changes (`@agentguard/sdk`)

The local SDK (npm/PyPI) needs to be license-aware for local eval mode.

**Modify:** `packages/sdk/src/sdk/local-policy-engine.ts`

Add license context awareness:

```typescript
export class LocalPolicyEngine {
  private licenseManager: LicenseManager;

  async evaluate(action: ActionRequest, ctx: AgentContext): Promise<PolicyDecision> {
    const license = this.licenseManager.getContext();
    
    // Local eval SDK is always free — no limits on local evaluation
    // (Local eval doesn't go through the cloud API, so no server-side limits)
    // But: respect feature flags for local anomaly detection etc.
    
    return this.engine.evaluate(action, ctx);
  }
}
```

The key insight: **local SDK evaluation is not rate-limited**. It runs entirely locally. Only cloud API calls count toward the monthly limit. This is a feature — it encourages SDK adoption.

---

### 3.9 Dashboard Changes

**New pages:**

**`packages/dashboard/src/app/settings/license/page.tsx`**
- Current key display (prefix only, e.g., `AGKEY-ab12...`)
- Tier badge with features list
- Usage meter (current month events / limit)
- Agent seats meter (current / limit)
- Expiry date with renewal CTA
- Upgrade button (links to Stripe checkout or sales@ for Enterprise)
- Key rotation button (rotates key, shows new key once, requires SIGHUP or restart)
- Download usage report (CSV)

**`packages/dashboard/src/app/settings/license/components/UsageMeter.tsx`**
- Progress bar: green → yellow (80%) → red (100%)
- Day-of-month reset countdown
- "Upgrade to Pro" CTA appears at 80%

**Modify:** `packages/dashboard/src/app/page.tsx` (main dashboard)
- Add license status banner at top
- Free tier: "You're on Free. [Upgrade to Pro →]"
- Pro: "Pro plan · 23,451 / 500,000 events this month"
- Trial: "14-day trial · 8 days remaining [Add billing →]"

---

### 3.10 License Issuance Flow (Cloud)

**New service:** `packages/api/src/services/license-issuance.ts`

```typescript
export class LicenseIssuanceService {
  async issue(params: {
    tenantId: string;
    tier: LicenseTier;
    expiresAt: Date;
    features?: LicenseFeature[];
    seatLimit?: number;
    eventsPerMonth?: number;
    stripeSubscriptionId?: string;
    isTrial?: boolean;
    maxInstalls?: number;
    offlineGraceDays?: number;
  }): Promise<{ key: string; keyId: string }> {
    
    // Generate key payload
    const jti = crypto.randomUUID();
    const kid = await this.getCurrentSigningKeyId();
    const features = params.features ?? getTierDefaultFeatures(params.tier);
    
    const payload: LicensePayload = {
      iss: 'license.agentguard.dev',
      sub: params.tenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(params.expiresAt.getTime() / 1000),
      jti,
      kid,
      tier: params.tier,
      seats: params.seatLimit ?? getTierDefaultSeats(params.tier),
      events_pm: params.eventsPerMonth ?? getTierDefaultEvents(params.tier),
      features,
      trial: params.isTrial ?? false,
      max_installs: params.maxInstalls,
      offline_grace_days: params.offlineGraceDays,
    };

    // Sign with Ed25519 private key (from secrets manager)
    const privateKey = await this.getSigningPrivateKey(kid);
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'AG-LIC' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${headerB64}.${payloadB64}`;
    
    const sign = createSign('Ed25519');
    sign.update(signingInput);
    const signature = sign.sign(privateKey).toString('base64url');
    
    const keyString = `AGKEY-${headerB64}.${payloadB64}.${signature}`;

    // Store key record (NOT the key itself — only metadata)
    const licenseKey = await prisma.licenseKey.create({
      data: {
        tenantId: params.tenantId,
        jti,
        kid,
        tier: params.tier.toUpperCase() as any,
        status: params.isTrial ? 'TRIAL' : 'ACTIVE',
        expiresAt: params.expiresAt,
        isTrial: params.isTrial ?? false,
        keyPrefix: keyString.slice(0, 14) + '...',
        seatLimit: payload.seats,
        eventsPerMonth: payload.events_pm,
        stripeSubscriptionId: params.stripeSubscriptionId,
      },
    });

    // Log issuance event
    await logLicenseEvent(params.tenantId, {
      eventType: 'KEY_ISSUED',
      jti,
      details: { tier: params.tier, isTrial: params.isTrial },
    });

    // Invalidate cache
    await redis.del(`license:${params.tenantId}`);

    return { key: keyString, keyId: licenseKey.id };
  }
}
```

---

### 3.11 The 51 Endpoints — What Changes

Of the 51 API endpoints across 8 route files, changes are minimal and surgical:

| Route File | Endpoints | Change |
|-----------|-----------|--------|
| `health.ts` | 2 | None — always open |
| `agents.ts` | ~10 | Add seat limit check on `POST /agents` |
| `policies.ts` | ~8 | None — policies always available |
| `actions.ts` | 2 | Add event limit check on `POST /evaluate` |
| `audit.ts` | ~8 | Add retention window filter on all queries |
| `killswitch.ts` | ~5 | None — kill switch always available |
| `hitl.ts` | ~8 | Add concurrent gate limit for free tier |
| `events.ts` | 1 (WebSocket) | None |
| `siem.ts` (new) | ~7 | Require `siem` feature flag |

The `licenseMiddleware` is added **once** to the app middleware chain — all routes inherit it. No per-route boilerplate except the specific limit checks noted above.

---

### 3.12 CRL Management

**New file:** `packages/api/src/services/crl.ts`

```typescript
// CRL format: Ed25519-signed JSON blob
interface CRLDocument {
  version: number;
  generatedAt: string;
  revokedKeys: Array<{
    jti: string;
    revokedAt: string;
    reason: string;
  }>;
  signature: string;  // Ed25519 signature of the rest, base64url
}

// GET /v1/license/crl
// Public endpoint — no auth required
// Returns current signed CRL
licenseRouter.get('/crl', async (c) => {
  const crl = await getCachedCRL();
  c.header('Cache-Control', 'public, max-age=21600'); // 6 hours
  return c.json(crl);
});
```

---

## 4. Tier / Pricing Matrix

### Tier Overview

| | **Free** | **Pro** | **Enterprise** |
|---|---|---|---|
| **Price** | $0 forever | $149/month | Custom (starts ~$1,500/mo) |
| **Billing** | None | Monthly/Annual (20% disc.) | Annual, invoiced |
| **Trial** | — | 14-day free trial | POC available |
| **Target** | Indie devs, hobbyists, evaluation | Startups, growing teams | Large enterprises, regulated industries |

### Resource Limits

| | **Free** | **Pro** | **Enterprise** |
|---|---|---|---|
| **Agent Seats** | 3 | 25 | Unlimited |
| **Evaluations/month** | 100,000 | 500,000 | Unlimited |
| **HITL Concurrent Gates** | 3 | Unlimited | Unlimited |
| **Policy Versions Retained** | 10 | 100 | Unlimited |
| **Audit Log Retention** | 7 days | 90 days | 1 year (upgradeable to 7yr) |
| **API Rate Limit** | 100 req/sec | 1,000 req/sec | Custom |
| **Concurrent Installs (Docker)** | 1 | 5 | Custom (in key) |
| **Offline Grace Period** | N/A | 7 days | 30 days (configurable) |

### Features by Tier

| Feature | **Free** | **Pro** | **Enterprise** |
|---------|----------|---------|----------------|
| **Core Policy Engine** | ✅ | ✅ | ✅ |
| **Action Evaluation** (`/evaluate`) | ✅ | ✅ | ✅ |
| **Agent Management** | ✅ (3 agents) | ✅ (25 agents) | ✅ (unlimited) |
| **Policy CRUD** | ✅ | ✅ | ✅ |
| **Kill Switch** | ✅ | ✅ | ✅ |
| **Basic Audit Log** | ✅ (7d) | ✅ (90d) | ✅ (1y+) |
| **Local Eval SDK** | ✅ | ✅ | ✅ |
| **Dashboard** | ✅ | ✅ | ✅ |
| **REST API** | ✅ | ✅ | ✅ |
| **WebSocket Events** | ✅ | ✅ | ✅ |
| **HITL (Human-in-the-Loop)** | ✅ (3 gates) | ✅ unlimited | ✅ unlimited |
| **Anomaly Detection** | ❌ | ✅ | ✅ |
| **SIEM Integration** (Splunk/Sentinel) | ❌ | ✅ | ✅ |
| **Alert Webhooks** | ❌ | ✅ | ✅ |
| **Telemetry Batch** (`/telemetry/batch`) | ✅ | ✅ | ✅ |
| **Audit Export** (CSV, API) | ❌ | ✅ | ✅ |
| **Advanced RBAC** | ❌ | ✅ | ✅ |
| **Policy Template Inheritance** | ❌ | ✅ | ✅ |
| **SSO / SAML / OIDC** | ❌ | ❌ | ✅ |
| **Custom Data Residency** | ❌ | ❌ | ✅ |
| **Air-Gapped Deployment** | ❌ | ❌ | ✅ |
| **7-Year Immutable Retention** | ❌ | ❌ | ✅ |
| **Multi-Region** | ❌ | ❌ | ✅ |
| **Dedicated CSM** | ❌ | ❌ | ✅ |
| **SLA (99.9% uptime)** | ❌ | ❌ | ✅ |
| **Priority Support** | ❌ | ✅ (email) | ✅ (dedicated) |

### Specific Endpoint Gating (All 51 Endpoints)

**Always Available (Free+):**
- `GET /v1/health` — health check
- `POST /v1/actions/evaluate` — core evaluation (rate limited per tier)
- `POST /v1/actions/telemetry/batch` — telemetry ingest (rate limited)
- `GET|POST|PUT|DELETE /v1/agents` — agent management (seat limited)
- `GET|POST|PUT|DELETE /v1/policies` — policy management
- `POST /v1/killswitch/{agentId}` — kill switch (always free — this is safety-critical)
- `DELETE /v1/killswitch/{agentId}` — resume agent
- `GET /v1/killswitch/{agentId}` — kill switch status
- `GET|POST /v1/hitl/gates` — HITL gate management (3-gate limit on free)
- `GET /v1/audit/events` — audit log query (7-day window on free)
- `GET /v1/events` — WebSocket event stream
- `GET /v1/license/status` — license status (always available)
- `GET /v1/license/crl` — CRL download (public)

**Pro+ Required:**
- `GET /v1/audit/export` — Audit export (CSV/JSON download) — requires `audit_export`
- `POST /v1/siem/configs` — SIEM integration create — requires `siem`
- `GET|PUT|DELETE /v1/siem/configs/{id}` — SIEM CRUD — requires `siem`
- `POST /v1/siem/test` — test SIEM connection — requires `siem`
- `GET /v1/anomaly/scores` — anomaly score query — requires `anomaly_detection`
- `GET /v1/anomaly/flags` — anomaly flag query — requires `anomaly_detection`
- `GET|POST /v1/webhooks` — alert webhooks — requires `hitl_unlimited` (reuses Pro gate)

**Enterprise Required:**
- `POST /v1/sso/config` — SSO configuration — requires `sso`
- `GET|PUT /v1/data-residency` — data residency settings — requires `custom_data_residency`
- `GET /v1/audit/immutable-export` — 7-year immutable export — requires `audit_retention_7y`
- `POST /v1/license/issue` — issue keys (admin) — internal only
- `POST /v1/license/revoke` — revoke keys (admin) — internal only

### Pricing Psychology Notes (Morgan)

1. **Free tier is generous on purpose.** The 25k/mo limit is enough for a real production service processing ~800 evaluations/day. This means developers can deploy AgentGuard free and tell their team "it's working in prod."

2. **Pro at $149/mo hits the "impulse buy" threshold.** Under $200/mo, a senior eng can put it on a corporate card without procurement review in most companies. $149 is just below the mental anchor of $150/period.

3. **Annual discount (20%)** brings Pro to $119/mo — creates urgency and reduces churn. Annual customers have 40-60% lower churn in SaaS.

4. **The Pro trial is critical.** 14-day trial with full Pro features converts at 18-25% in comparable dev tools. Free trial no CC = maximum funnel entry.

5. **Seat limit is the conversion driver.** Most teams hit the 3-agent free limit within weeks of adoption. The 3→25 seat jump at Pro is a clear, felt need.

6. **Don't gate on security features.** HITL and kill switch being available free is counterintuitive but builds trust. "AgentGuard didn't hide the safety features behind a paywall" is a real differentiator.

---

## 5. Migration Plan

### Phase 0: Preparation (Week 1-2)

**No user impact. Internal work only.**

1. Generate Ed25519 signing key pair:
   ```bash
   openssl genpkey -algorithm Ed25519 -out agentguard-license-private.pem
   openssl pkey -in agentguard-license-private.pem -pubout -out agentguard-license-pub.pem
   ```
   Store private key in secrets manager (AWS Secrets Manager / Vault). Public key committed to repo.

2. Create `packages/license/` package with core types and validator.

3. Add Prisma models (`LicenseKey`, `LicenseEvent`, `LicenseUsage`) — schema migration only, additive.

4. Set up license server endpoints (`/v1/license/*`) — behind admin auth, not yet wired to user flow.

5. Set up Stripe products:
   - Product: "AgentGuard Pro" — Price ID: `price_pro_monthly`, `price_pro_annual`
   - Webhook configured to `/webhooks/stripe`

6. Test: issue a test Pro key, validate it, revoke it.

### Phase 1: Soft Launch (Week 3-4)

**Invisible to existing users. Free users see nothing different.**

1. Add `licenseMiddleware` to API — but default behavior is "free" if no key found.
   - Existing users without keys continue working uninterrupted.
   - Monthly event counter starts incrementing in Redis (not yet enforced).

2. Ship dashboard `/settings/license` page:
   - Shows "Free Plan" for everyone currently.
   - Shows usage meter (counting but not enforcing).
   - Shows upgrade CTA.

3. Auto-issue free keys for all existing tenants on signup flow (email verification → key issued automatically).

4. Run for 2 weeks collecting baseline usage data. Identify any existing users who would be impacted by 25k/mo limit.

### Phase 2: Pro Tier Open (Week 5-6)

1. Enable Stripe checkout flow:
   - "Upgrade to Pro" button → Stripe checkout → success → key issued → displayed once in dashboard → instructions to add to `.env`.

2. Begin 14-day Pro trial program for new signups:
   - Auto-issue trial key at email verification.
   - Trial dashboard banner with day countdown.
   - Email sequence: day 7 "trial halfway done", day 12 "trial ends soon".

3. Announce Pro tier publicly.

4. **DO NOT yet enforce free tier limits** — give 30-day notice period.

### Phase 3: Limit Enforcement (Week 7-8)

1. Announce: "Starting [date], Free tier limited to 25,000 evaluations/month."

2. Email all existing users whose usage exceeds 25k/mo:
   - "You're using X evaluations/month. Free tier supports 25,000. Here's a coupon for 3 months of Pro."

3. Enable limit enforcement in `actions.ts` — HTTP 402 on overage.

4. Monitor: watch for customer support tickets. Be prepared to grant manual grace period extensions.

### Phase 4: Enterprise Tier (Month 3+)

1. Enterprise tier features (SSO, custom data residency, 7-year retention) — build and ship.

2. Enterprise sales motion:
   - "Contact sales" for >25 agent deployments.
   - Manual key issuance via admin dashboard.
   - Custom expiry, features, seat limits per negotiation.

3. Air-gap support:
   - Ship `agentguard-enterprise.tar.gz` with bundled license validator.
   - Offline license key with `offline_grace_days: 365` for true air-gap.
   - Annual renewal via new key (no phone-home required for air-gap).

### Existing User Commitments

| User Group | Treatment |
|------------|-----------|
| Users with < 25k events/mo | No change — stays free |
| Users with 25k-100k events/mo | 30-day grace, email outreach, Pro trial coupon |
| Users with > 100k events/mo | Proactive sales call, custom pricing discussion |
| Users who contributed to the project (OSS) | Free Pro key, lifetime |
| Self-hosters running from source (no Docker) | Free tier still works; Docker-gating only applies to Docker distribution |

### Rollback Plan

If enforcement causes critical customer issues:

1. Disable `checkEventLimit()` in actions.ts — single flag change, hot-reload.
2. All users revert to effectively unlimited immediately.
3. Investigate + fix before re-enabling.

The enforcement logic is isolated — rollback has no side effects on audit, policies, or agent functionality.

---

## Appendix A: Key Format Reference

```
AGKEY-eyJhbGciOiJFZERTQSIsInR5cCI6IkFHLUxJQyJ9.eyJpc3MiOiJsaWNlbnNlLmFnZW50Z3VhcmQudGVjaCIsInN1YiI6InRlbl9hYmMxMjMiLCJpYXQiOjE3NDAyNjkwMDAsImV4cCI6MTc3MTgwNTAwMCwianRpIjoiN2ZjM2YyZDEtZDMxNy00MTk4LTk5ZWMtY2QwYTI0MDM3YTY5Iiwia2lkIjoiazIwMjYtMDEiLCJ0aWVyIjoicHJvIiwic2VhdHMiOjI1LCJldmVudHNfcG0iOjUwMDAwMCwiZmVhdHVyZXMiOlsiaGl0bCIsImhpdGxfdW5saW1pdGVkIiwic2llbSIsImFub21hbHlfZGV0ZWN0aW9uIiwiYXVkaXRfZXhwb3J0IiwiYXVkaXRfcmV0ZW50aW9uXzkwZCIsImFwaV9yYXRlX3VubGltaXRlZCIsInByaW9yaXR5X3N1cHBvcnQiXSwidHJpYWwiOmZhbHNlfQ.SIG_HERE
```

Decoded payload:
```json
{
  "iss": "license.agentguard.dev",
  "sub": "ten_abc123",
  "iat": 1740269000,
  "exp": 1771805000,
  "jti": "7fc3f2d1-d317-4198-99ec-cd0a24037a69",
  "kid": "k2026-01",
  "tier": "pro",
  "seats": 25,
  "events_pm": 500000,
  "features": [
    "hitl",
    "hitl_unlimited",
    "siem",
    "anomaly_detection",
    "audit_export",
    "audit_retention_90d",
    "api_rate_unlimited",
    "priority_support"
  ],
  "trial": false
}
```

---

## Appendix B: Estimated Implementation Effort

| Component | Engineer-Days | Priority |
|-----------|--------------|----------|
| `packages/license/` package (types, validator, parser, CRL) | 3d | P0 |
| Prisma schema additions + migration | 0.5d | P0 |
| `licenseMiddleware` + `requireFeature()` + `checkEventLimit()` | 2d | P0 |
| `LicenseManager` singleton (startup validation, background loop, SIGHUP) | 2d | P0 |
| License API routes (`/v1/license/*`) | 2d | P0 |
| `LicenseIssuanceService` + key signing | 1.5d | P0 |
| Docker Compose changes + cache volume | 0.5d | P0 |
| CRL service + signing | 1d | P1 |
| Stripe webhook handler | 2d | P1 |
| Dashboard — license settings page | 2d | P1 |
| Dashboard — usage meters + banners | 1.5d | P1 |
| Onboarding flow — auto free key issuance | 1d | P1 |
| Limit enforcement in existing routes (evaluate, HITL, audit) | 1d | P1 |
| SIEM feature gating | 0.5d | P1 |
| Email sequences (trial countdown, limit warnings) | 1.5d | P2 |
| Enterprise SSO gating | 1d | P2 |
| Air-gap key support | 2d | P2 |
| Admin dashboard for internal key management | 2d | P2 |
| Python SDK license awareness | 1d | P2 |
| **TOTAL** | **~28 engineer-days** | |

Realistic timeline: 2 engineers × 3 weeks = P0+P1 done. P2 follows in subsequent sprint.

---

## Appendix C: Security Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Key forgery | Low (Ed25519 security) | Critical | Ed25519 signature — computationally infeasible |
| Key sharing (Pro) | Medium | Medium | Install tracking, flag at >5 installs |
| Binary patching | Low (requires effort) | Medium | BSL license, layered validation |
| Replay of old valid key | Low | Medium | Expiry in payload + CRL |
| CRL tampering | Low | High | CRL itself is Ed25519-signed |
| Stolen private signing key | Very Low | Critical | Private key in secrets manager, access logs |
| SQL injection on license tables | Very Low | High | Prisma parameterized queries |
| Stripe webhook replay | Low | Medium | HMAC verification + idempotency keys |
| Memory patching of license context | Very Low | Medium | Re-validation every 60 min |
| DNS hijack of license server | Very Low | Low | TLS cert pinning on license phone-home |

---

*End of LICENSE_SYSTEM_PLAN.md*