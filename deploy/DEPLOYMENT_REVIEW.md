# AgentGuard — Deployment Architecture Review
## Document version: 1.0 — February 2026
### Classification: Confidential — Internal Engineering
### Review Lead: Architecture Review (subagent: arch-review-deploy)
### Status: **PENDING GO/NO-GO SIGN-OFF**

---

> **Purpose:** This document gates all implementation. No Terraform, no CI/CD pipeline, no
> Dockerfile, and no infrastructure provisioning begins until the CTO has signed off on the
> Go/No-Go checklist at the end of this document. Every finding here is cross-referenced to
> ARCHITECTURE.md v2.0, ROADMAP.md v2.0, and the metrics repo reference pipeline.

---

## Table of Contents

1. [Scope of Deployment](#1-scope-of-deployment)
2. [Phase 1 Deployment Topology](#2-phase-1-deployment-topology)
3. [What We Reuse from the Metrics Repo](#3-what-we-reuse-from-the-metrics-repo)
4. [What Needs to Change](#4-what-needs-to-change)
5. [Security Review](#5-security-review)
6. [Cost Estimate — Phase 1](#6-cost-estimate--phase-1)
7. [Risks and Recommendations](#7-risks-and-recommendations)
8. [Go/No-Go Checklist](#8-gono-go-checklist)

---

## 1. Scope of Deployment

### 1.1 What We Are Deploying

AgentGuard Phase 1 consists of five distinct deployable artefacts with fundamentally different
deployment targets. This is not a single-app deployment — each surface has its own
infrastructure requirements.

| Artefact | Type | Deployment Target | Notes |
|---|---|---|---|
| **Control Plane API** | Node.js 22 container (TypeScript / Hono) | Azure Container Apps | Core backend; stateless; horizontally scalable |
| **Background Workers** | Node.js 22 container (BullMQ) | Azure Container Apps (separate) | SIEM publisher, telemetry ingest, policy distributor; separate scaling |
| **Dashboard** | Next.js 14 App Router container | Azure Container Apps (separate) | SSR; needs its own Container App because it serves UI + API routes |
| **Python SDK** | PyPI package (`agentguard`) | PyPI registry | NOT deployed to Azure; published to PyPI on release tag |
| **Landing page / marketing** | Static site | GitHub Pages or Azure Static Web Apps | No backend needed in Phase 1; purely static |

**What is NOT in scope for Phase 1 infrastructure:**
- Blog (static, GitHub Pages, deferred)
- Report generation (Phase 2)
- On-premises / Helm chart (Phase 2–3)
- ClickHouse (Phase 2, triggered at >5M events/day)

### 1.2 Architecture Note on the SDK

The Python SDK is **NOT a container deployment**. It is an in-process library that runs inside
the customer's Python agent process. The CI/CD pipeline needs a PyPI publish step (on release
tag), not an Azure deployment. This is a critical distinction: any PR that proposes deploying
the SDK as a sidecar or container is a regression against Decision 3 in ARCHITECTURE.md.

### 1.3 Database Migration Artefact

Prisma migrations are a separate deployment concern. They run **before** the container update
in the CI pipeline — this ordering is mandatory to prevent P2022 schema mismatch errors (a
pattern well-established in the metrics reference pipeline). The migration runner is a
one-shot job executed from the CI runner, not a long-running container.

---

## 2. Phase 1 Deployment Topology

### 2.1 Target Platform Decision: Azure

**Decision: Azure, not AWS.**

ARCHITECTURE.md §9.1 specifies AWS (ECS Fargate, RDS, ElastiCache) as the Phase 1 target,
but the metrics repo reference pipeline and all existing team infrastructure tooling
(Terraform Azure modules, Key Vault patterns, ACR, Azure Container Apps) is Azure. This
review recommends **following the team's proven Azure infrastructure patterns** for Phase 1
rather than building new AWS patterns from scratch.

**Rationale:**
- The metrics repo has a production-proven Azure Container Apps + Azure PostgreSQL Flexible
  Server + Azure Cache for Redis pattern that directly maps to AgentGuard's requirements.
- Building the AWS equivalent (ECS task definitions, RDS, ElastiCache, IAM roles, security
  groups) would add 2–3 sprints of infrastructure work with no offsetting benefit.
- Azure Container Apps scale-to-zero is directly equivalent to ECS Fargate for Phase 1
  volumes. EKS/AKS migration is Phase 2 in either cloud.
- The team already has Azure OIDC auth, ACR, and Key Vault patterns working.

**Action required:** CTO must formally acknowledge this platform change from the architecture
document and update ARCHITECTURE.md §6.4 and §9.1 from AWS → Azure before Sprint 1 begins.
This is not a blocker for review sign-off but must be resolved before Sprint 1 infrastructure
stories (1.3.1–1.3.5) are written.

### 2.2 Target Topology

```
Internet
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Azure Front Door / Container Apps Ingress (TLS 1.3 termination)    │
│  - Custom domain: api.agentguard.io, app.agentguard.io              │
│  - DDoS protection (Azure Front Door Standard)                       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
              ┌────────────┼──────────────────┐
              │            │                  │
    ┌─────────▼──────┐  ┌──▼─────────────┐  ┌──▼──────────────────┐
    │ Control Plane  │  │  Dashboard     │  │  Background         │
    │ API            │  │  (Next.js 14)  │  │  Workers (BullMQ)   │
    │ Azure Container│  │  Azure Container│  │  Azure Container    │
    │ Apps           │  │  Apps          │  │  Apps               │
    │ Min 2 replicas │  │  Min 1 replica │  │  Min 1 replica      │
    │ (prod)         │  │  (prod)        │  │  (prod)             │
    └────────┬───────┘  └────────────────┘  └──────────┬──────────┘
             │                                          │
    ┌────────┴──────────────────────────────────────────┘
    │              Azure Private Networking (VNet integration)
    │
    │  ┌────────────────────────────────────────────────────────────┐
    │  │  Data Layer (private subnet / service endpoint)            │
    │  │                                                            │
    │  │  ┌──────────────────────┐  ┌──────────────────────────┐  │
    │  │  │  Azure Database for  │  │  Azure Cache for Redis   │  │
    │  │  │  PostgreSQL Flexible │  │  (Premium tier, Redis 7) │  │
    │  │  │  Server              │  │  - Kill switch flags     │  │
    │  │  │  - Primary + replica │  │  - HITL gate state       │  │
    │  │  │  - Prisma ORM        │  │  - Rate limit counters   │  │
    │  │  │  - RLS enabled       │  │  - Policy bundle cache   │  │
    │  │  │  - PgBouncer pooling │  │  - BullMQ queues         │  │
    │  │  └──────────────────────┘  └──────────────────────────┘  │
    │  │                                                            │
    │  │  ┌──────────────────────┐  ┌──────────────────────────┐  │
    │  │  │  Azure Blob Storage  │  │  Azure Key Vault         │  │
    │  │  │  - Forensic blobs    │  │  - All secrets           │  │
    │  │  │  - Policy YAML       │  │  - DB credentials        │  │
    │  │  │  - Exported logs     │  │  - API keys              │  │
    │  │  └──────────────────────┘  └──────────────────────────┘  │
    │  └────────────────────────────────────────────────────────────┘
    │
    └──→  ACR (Azure Container Registry)
          - Control Plane API image
          - Worker image
          - Dashboard image
```

### 2.3 Static Sites

The landing page and any static marketing content deploy to **Azure Static Web Apps** (free
tier sufficient, global CDN included). GitHub Pages is an acceptable alternative if the team
prefers to avoid another Azure resource. Either choice is independent of the backend
infrastructure — make the decision in Sprint 1 and document it.

### 2.4 Environment Strategy

Three environments: **dev** (local Docker Compose), **staging** (Azure, scale-to-zero), **production** (Azure, min replicas > 0).

The metrics repo pattern (staging exists as a persistent Container App but scales to 0 after
E2E tests) is the correct pattern for AgentGuard. This is cost-efficient and means staging
always matches production infrastructure exactly.

| Environment | Replica count | DB tier | Redis tier | Cost mode |
|---|---|---|---|---|
| dev | Local Docker Compose | N/A | N/A | Free |
| staging | Min 0 (scale-to-zero after E2E) | Burstable B1ms | Basic C0 | ~$50–80/month |
| production | Min 2 (API), Min 1 (workers, dashboard) | General Purpose D2ds_v4 | Standard C1 | ~$400–600/month |

---

## 3. What We Reuse from the Metrics Repo

The metrics reference pipeline is an excellent starting point. Here is what maps directly
across with minimal modification:

### 3.1 GitHub Actions Workflow Structure

**Reuse directly (rename variables, not logic):**

| Stage | Metrics stage | AgentGuard reuse |
|---|---|---|
| Validate | Code quality, TypeScript, lint, Prisma validate, unit tests | Identical pattern; change `pnpm` → same; add Python pytest step |
| Security scan | Snyk, Semgrep, Gitleaks, pnpm audit | Identical; swap `SNYK_TOKEN` → same secret name |
| Secret expiry check | Key Vault secret expiration check | Identical pattern; change secret names (DATABASE-URL, REDIS-URL, JWT-SECRET, etc.) |
| Plan | Terraform plan with `-detailed-exitcode` | Identical pattern |
| Build | `az acr build` for main + worker images | Add third image build for dashboard; otherwise identical |
| Container security | Trivy + Snyk container scan | Identical; now applied to all three images |
| Deploy staging | Container App update + Prisma migrate + health check | Identical; `prisma db push` → `prisma migrate deploy` (see §4 change) |
| E2E tests | Playwright against staging URL | Keep structure; write AgentGuard-specific E2E specs |
| Staging teardown | Scale-to-zero | Identical |
| Deploy production | Terraform apply + DB migrate + container update + health check + rollback | Identical pattern; critical ordering: DB migrate before container update |
| Notify | Deployment summary | Identical |
| Rollback | Activate previous revision, redirect traffic | Identical; confirm it works for all three Container Apps |

**Change detection logic:** The metrics repo detects changes to `src/`, `prisma/`, `Dockerfile`,
and `terraform/`. AgentGuard adds: `sdk/python/` (triggers PyPI publish, NOT an Azure
deploy), `apps/dashboard/` (triggers dashboard image build), and `src/workers/` (triggers
worker image build separately). The change detection logic needs to be extended accordingly.

### 3.2 Terraform Patterns

**Reuse directly:**

- **Azure module structure:** `terraform/modules/azure/` with Container Apps, Key Vault, ACR,
  PostgreSQL Flexible Server, and Redis. The metrics repo proves this works.
- **Terraform workspaces:** `staging` and `production` workspaces — identical pattern.
- **Remote state:** Azure Blob Storage backend — identical; change storage account name.
- **OIDC authentication:** `ARM_USE_OIDC: true` with service principal — identical; create a
  new service principal for AgentGuard.
- **Environment-aware scaling locals:** `local.scaling.min_replicas` / `local.scaling.max_replicas`
  based on `local.is_production` — identical pattern.
- **Key Vault integration:** secrets stored in Key Vault, referenced by Container Apps via
  `secretref:` — identical; different secret names.
- **`environments/production.tfvars` and `environments/staging.tfvars`** — identical pattern;
  new variable values.

**Adapt (same pattern, different resources):**

- **Three Container Apps** (API, workers, dashboard) instead of two (app, worker).
- **Database naming:** `agentguard-prod-db` instead of `metrics-prod-db`.
- **ACR naming:** `agentguardproductionacr` (must be globally unique).
- **Resource group:** `agentguard-rg` / `agentguard-rg-staging`.

### 3.3 Dockerfile Worker Pattern

The `Dockerfile.worker` from the metrics repo is an excellent template:

- **Multi-stage build:** `base → deps → prod-deps → builder → runner` — identical structure.
- **Non-root user:** `addgroup nodejs && adduser worker` — identical security pattern.
- **esbuild bundling:** Workers are bundled with esbuild for smaller, faster containers —
  identical approach; update entry points to AgentGuard worker files.
- **Health check endpoint:** Worker exposes a health HTTP endpoint on port 3001 — identical;
  implement `/health` in AgentGuard BullMQ workers.
- **pnpm + alpine base** — identical.

### 3.4 Trivy Security Scanning

The Trivy scan step from the metrics pipeline (`aquasecurity/trivy-action@master`, severity
`CRITICAL,HIGH`, `exit-code: 1`) applies identically to all three AgentGuard images. This is
a blocking gate — no image with a critical vulnerability ships to production.

### 3.5 Health Check Pattern

The metrics pipeline's health check logic (exponential backoff, 15 attempts, `curl -sf
/api/health`, automated rollback trigger on failure) is production-proven and applies
identically. AgentGuard's API container must expose `GET /health` (or `GET /v1/health`) that
returns 200 when the process is ready.

### 3.6 Manual Approval Gate

The metrics pipeline uses GitHub Environments (`environment: name: production`) which
triggers a GitHub-native manual approval requirement when the environment has protection
rules configured. This is the correct pattern for AgentGuard. Configure the `production`
environment in GitHub with required reviewers (CTO + at least one senior engineer).

---

## 4. What Needs to Change

### 4.1 Resource Names and Environment Variables

Everything named `metrics-*` becomes `agentguard-*`. Full replacement list:

| Metrics value | AgentGuard value |
|---|---|
| `IMAGE_NAME: metrics` | `IMAGE_NAME: agentguard-api` |
| `RESOURCE_GROUP: metrics-rg` | `RESOURCE_GROUP: agentguard-rg` |
| `CONTAINER_APP_NAME: metrics-app` | `CONTAINER_APP_NAME: agentguard-api` |
| `WORKER_CONTAINER_APP_NAME: metrics-app-worker` | `WORKER_CONTAINER_APP_NAME: agentguard-workers` |
| `KEY_VAULT_NAME: metrics-vault` | `KEY_VAULT_NAME: agentguard-vault` (max 24 chars) |
| `ACR_LOGIN_SERVER: metricsproductionacr.azurecr.io` | `agentguardacr.azurecr.io` |
| `ACR_NAME: metricsproductionacr` | `agentguardacr` |
| `STAGING_RESOURCE_GROUP: metrics-rg-staging` | `agentguard-rg-staging` |
| `STAGING_CONTAINER_APP_NAME: metrics-app-staging` | `agentguard-api-staging` |
| `STAGING_KEY_VAULT_NAME: metrics-vault-staging` | `agentguard-vault-staging` |
| Database name: `metrics` | `agentguard` |
| DB admin username: `metricsadmin` | `agentguardadmin` |

**New Container App added (no equivalent in metrics):**

| New value | Purpose |
|---|---|
| `DASHBOARD_CONTAINER_APP_NAME: agentguard-dashboard` | Next.js 14 dashboard |
| `IMAGE_NAME_DASHBOARD: agentguard-dashboard` | Dashboard ACR image |

### 4.2 Database Schema and Migration Strategy

**Critical difference: `prisma migrate deploy` vs `prisma db push`.**

The metrics repo uses `prisma db push` on staging and production. For AgentGuard, this is
**wrong for production** and **acceptable only for staging**.

AgentGuard's database has:
- An append-only trigger on `AuditEvent` (created via raw SQL in a Prisma migration)
- PostgreSQL Row-Level Security policies (raw SQL migration)
- Partial indexes for query performance (raw SQL migration)
- Enum types that, once set, cannot be rolled back in PostgreSQL

These raw SQL elements require **`prisma migrate deploy`** (which applies versioned migration
files in order) rather than `prisma db push` (which destructively syncs without history).

**Production DB migration command must be:**
```bash
pnpm exec prisma migrate deploy
```

**Staging can use `prisma db push --accept-data-loss`** (ephemeral, acceptable).

**Migration ordering (same as metrics pattern — do NOT change this):**
1. Run `prisma migrate deploy` (or `db push` for staging)
2. THEN update Container App image
3. NEVER update container before migration — causes P2022 schema mismatch

### 4.3 Worker Process Architecture Differences

The metrics repo workers are:
- `insights-worker.ts`
- `extraction-worker.ts`
- `predictions-worker.ts`

AgentGuard workers (ARCHITECTURE.md §3.1) are:
- `telemetry-ingest.ts` — processes SDK telemetry batches from Redis queue
- `siem-publisher.ts` — pushes HIGH/CRITICAL events to Splunk/Sentinel
- `policy-distributor.ts` — pushes compiled policy bundles to Redis cache

All three run in a single worker Container App (same pattern as metrics one-worker-image
running multiple processes). The `start-workers.sh` startup script must start all three
BullMQ workers. The metrics repo's `docker/start-workers.sh` pattern applies directly.

**Key difference:** AgentGuard workers must also handle **Redis Pub/Sub** for kill switch
broadcast (the `policy-distributor` pushes to Redis; the Container App API reads from it).
The metrics repo has no equivalent — this is new functionality but doesn't change the
Dockerfile pattern.

### 4.4 New Secrets Required

The metrics repo secrets set does not overlap with AgentGuard. Here is the complete AgentGuard
secrets inventory for Key Vault:

**Core Infrastructure:**
- `DATABASE-URL` — full PostgreSQL connection string (with PgBouncer)
- `DATABASE-DIRECT-URL` — direct connection for Prisma Migrate (bypasses PgBouncer)
- `DATABASE-PASSWORD` — DB admin password (also used as TF_VAR)
- `REDIS-URL` — Redis connection string (`redis://:password@host:6380/0` with TLS)

**Authentication:**
- `JWT-SECRET` — RS256 private key for JWT signing (ARCHITECTURE.md §7.1: RS256, 1-hour expiry)
- `JWT-PUBLIC-KEY` — RS256 public key for JWT verification

**AgentGuard SDK:**
- `API-KEY-SALT` — bcrypt salt for agent API key hashing (DATA_MODEL.md §3.2)

**Email:**
- `SES-SMTP-HOST`, `SES-SMTP-USER`, `SES-SMTP-PASS` — AWS SES for HITL notifications
  (ARCHITECTURE.md §6.4 uses SES; or swap for a transactional email provider like Resend)

**Alerting:**
- `SLACK-WEBHOOK-URL` — for internal team alerts (optional in Phase 1)

**Blob Storage:**
- `AZURE-STORAGE-CONNECTION-STRING` — for forensic blob and export storage

**E2E Testing:**
- `E2E-TEST-SECRET` — matches metrics pattern exactly; used by staging only

**What is NOT needed in Phase 1 (deferred):**
- `STRIPE-*` keys (billing is Phase 2+)
- `GOOGLE-*`, `MICROSOFT-*` OAuth (dashboard uses JWT, not OAuth in Phase 1)
- `OPENAI-API-KEY`, `ANTHROPIC-API-KEY` (AgentGuard does not call these; customers do)
- `HUBSPOT-*`, `XERO-*`, `SALESFORCE-*` (not applicable)

### 4.5 PyPI Publish Step (Net New)

The metrics repo has no PyPI publishing. AgentGuard needs a new GitHub Actions workflow
(or job in the CI pipeline) triggered on `push` to a `v*` release tag:

```yaml
- name: Publish to PyPI
  uses: pypa/gh-action-pypi-publish@release/v1
  # Uses PyPI Trusted Publisher — no API key needed in GitHub Secrets
  # Configure on PyPI: Settings > Publishing > Add publisher > GitHub Actions
```

This is entirely separate from the Azure deployment and should not be in the Azure deploy
workflow — create `publish-pypi.yml` as a standalone workflow.

---

## 5. Security Review of Deployment

### 5.1 Secrets Management

**Key Vault pattern:** The metrics repo Key Vault pattern (all secrets in Azure Key Vault,
referenced by Container Apps via `secretref:`) is correct and must be used for all AgentGuard
secrets. No plaintext secrets in environment variables, Terraform tfvars files, or
GitHub Actions environment variables (only in GitHub Secrets, which are masked in logs).

**Critical requirement not in metrics repo:** AgentGuard stores the JWT RS256 private key in
Key Vault. This key must:
1. Be generated with `openssl genrsa -out jwt-private.pem 2048` (minimum) or 4096-bit
2. Never be stored anywhere except Key Vault
3. Have a 90-day rotation policy in Key Vault
4. Be referenced as `secretref:jwt-private-key` in the Container App

**Secret rotation:** The metrics repo's secret expiration check (7-day warning, 1-day
critical, deployment blocked if expired) is a production-proven pattern. Apply it to all
AgentGuard secrets. Set Key Vault expiration dates on all secrets.

**bcrypt API keys:** Agent API keys are bcrypt-hashed before storage (ARCHITECTURE.md §7.1).
The bcrypt work factor must be set to ≥12. The plaintext key is returned exactly once on
creation and never stored. This is a code-level concern, not infrastructure — but it must
be verified in code review.

### 5.2 Network Security

**VNet integration is recommended for production.** The metrics repo Terraform may or may
not use VNet integration — review the `modules/azure/` contents (not checked in this review
because they are not in `/tmp/metrics/terraform/modules/`). For AgentGuard:

- The PostgreSQL Flexible Server must be configured for **private access only** (VNet
  integration, no public endpoint). This is available on the `General Purpose` tier.
- The Redis Cache must be on the **Premium tier** for VNet support (Standard tier does not
  support VNet injection). If cost is a constraint in staging, use Standard with firewall
  rules and TLS (`rediss://`). In production, Premium + VNet.
- Container Apps should have VNet integration enabled to route outbound traffic through the
  VNet (required to reach PostgreSQL and Redis on their private endpoints).
- ACR should restrict access to the VNet / managed identity (no public pull).

**Network security groups (NSG):**
- Inbound: only ports 80/443 (Container Apps ingress handles this)
- Intra-VNet: Container Apps → PostgreSQL (port 5432), Container Apps → Redis (port 6380 TLS)
- No direct inbound access to PostgreSQL or Redis from the internet

### 5.3 Container Image Security

Three attack vectors to address:

**Base image:** Use `node:22-alpine` (not `node:22` — slim alpine reduces attack surface).
Lock to a specific SHA digest in production: `node:22-alpine@sha256:<digest>`. This prevents
supply chain attacks from image tag mutations.

**Trivy gate:** The metrics repo Trivy scan (`exit-code: 1` on CRITICAL/HIGH) is a hard
gate. This must apply to all three AgentGuard images (API, workers, dashboard). A known
issue: alpine base images frequently have `CRITICAL` CVEs in `musl libc` that have no fix.
Maintain a `.trivyignore` file for confirmed false positives / known-unfixable CVEs, with
justification comments. Do not disable the scan.

**Non-root user:** The metrics `Dockerfile.worker` runs as `worker` (uid 1001). All
AgentGuard Dockerfiles must follow the same pattern: `addgroup nodejs && adduser worker`,
`USER worker`. Never run as root in production.

**Image tags:** Tag with git SHA (not `latest`) for production deployments. The metrics
workflow already does this (`IMAGE_TAG: ${{ github.sha }}`). The `latest` tag is for
staging convenience only — production must always use a specific SHA tag.

### 5.4 Database Access Controls

| Layer | Control | Implementation |
|---|---|---|
| Network | Private endpoint only | PostgreSQL Flexible Server in VNet, no public access |
| Authentication | Password auth + TLS | `sslmode=require` in all connection strings |
| Connection pooling | PgBouncer | Prevents connection exhaustion; separate `DATABASE_URL` (pooled) and `DATABASE_DIRECT_URL` (for Prisma Migrate) |
| Application | Prisma parameterised queries | Never raw string concatenation; `$queryRaw` reviewed in PR |
| Row-Level Security | PostgreSQL RLS | `SET LOCAL app.current_tenant_id` in every request via middleware; all tenant-scoped tables |
| DB credentials rotation | Key Vault rotation policy | 90-day rotation; containerapp restarts automatically pick up new secret |

**IMPORTANT:** The `DATABASE_URL` used by the running application must use the PgBouncer
connection string. The `DATABASE_DIRECT_URL` (direct to PostgreSQL, bypassing PgBouncer) is
used **only** by `prisma migrate deploy` in the CI pipeline, because PgBouncer's transaction
pooling mode is incompatible with Prisma's migration runner.

Two secrets required: `DATABASE-URL` (pooled) and `DATABASE-DIRECT-URL` (direct).

### 5.5 CORS and API Security

**Allowed origins:** The Control Plane API must set `Access-Control-Allow-Origin` to the
exact dashboard origin (`https://app.agentguard.io`) only — not `*`. The Python SDK does
not use CORS (server-to-server). CORS misconfiguration is a high-severity finding because
the API accepts JWTs that grant cross-tenant data access.

**Rate limiting:** The metrics repo has no rate limiting (it's a single-tenant app). AgentGuard
is multi-tenant with security implications. Rate limits must be implemented at two layers:

1. **Container Apps scale rule:** HTTP concurrency-based scaling keeps individual instances
   from being overwhelmed.
2. **Application layer:** Redis sliding window rate limiter in the Hono middleware. Limits:
   - SDK telemetry batch: 100 requests/minute per agent API key
   - Policy bundle fetch: 10 requests/minute per agent API key
   - Kill switch poll: 60 requests/minute per agent API key (long-poll)
   - Management API: 60 requests/minute per JWT user

**WAF:** Azure Front Door Standard includes a Web Application Firewall. Enable it with the
Microsoft-managed ruleset (OWASP 3.2). Custom rules for:
- Block requests with `Content-Length > 10MB` (telemetry batches should be small)
- Rate limit by IP (Azure WAF policy — coarse protection before application-layer limits)

---

## 6. Cost Estimate — Phase 1

All prices are approximate Azure Australia East (or UK South / US East — adjust) list prices
as of Q1 2026. Actual costs depend on region, EA discount, and traffic volume.

### 6.1 Staging Environment (persistent, scale-to-zero)

| Resource | Tier | ~Monthly cost |
|---|---|---|
| Azure Container Apps (API, 0 replicas idle, 1 replica during CI) | Consumption plan | ~$5–15 |
| Azure Container Apps (workers, scale-to-zero) | Consumption plan | ~$3–8 |
| Azure Container Apps (dashboard, scale-to-zero) | Consumption plan | ~$3–8 |
| Azure Database for PostgreSQL Flexible Server (Burstable B1ms, 32GB) | B1ms | ~$25–35 |
| Azure Cache for Redis (Standard C0, 250MB) | Standard C0 | ~$15–20 |
| Azure Container Registry (Basic) | Basic | ~$5 |
| Azure Key Vault (staging, low operations) | Standard | ~$2–5 |
| Azure Blob Storage (minimal) | LRS | ~$1–3 |
| **Staging total** | | **~$59–94/month** |

### 6.2 Production Environment

| Resource | Tier | ~Monthly cost |
|---|---|---|
| Azure Container Apps (API, min 2 replicas, 0.5 vCPU / 1Gi each) | Consumption plan | ~$60–120 |
| Azure Container Apps (workers, min 1 replica) | Consumption plan | ~$30–60 |
| Azure Container Apps (dashboard, min 1 replica) | Consumption plan | ~$30–60 |
| Azure Database for PostgreSQL Flexible Server (General Purpose D2ds_v4, 64GB, HA) | GP_Standard_D2ds_v4 | ~$200–250 |
| Azure Cache for Redis (Standard C1, 1GB) | Standard C1 | ~$55–70 |
| Azure Container Registry (Standard) | Standard | ~$20 |
| Azure Key Vault (production, normal operations) | Standard | ~$5–10 |
| Azure Blob Storage (forensic blobs, policy YAML, exports) | LRS GRS | ~$10–20 |
| Azure Front Door (Standard, WAF) | Standard | ~$40–60 |
| Azure Monitor / Log Analytics (application logs) | Pay-per-use | ~$20–40 |
| **Production total** | | **~$470–630/month** |

### 6.3 Total Phase 1 Infrastructure Cost

| Environment | Monthly |
|---|---|
| Dev | $0 (local Docker Compose) |
| Staging | ~$60–95 |
| Production | ~$470–630 |
| **Total** | **~$530–725/month** |

**Design partner phase note:** During the design partner phase (Months 1–6), production
traffic will be light. The Control Plane API can run with `min_replicas = 1` instead of 2
to reduce cost to ~$350–500/month. Scale up to min 2 when the first paying customer is
onboarded.

**Azure Cost Saving Options:**
- Azure Reserved Instances for PostgreSQL (1-year commitment): ~30–40% saving on DB cost
- Azure Dev/Test pricing if the team has Visual Studio subscriptions
- Turn off staging entirely between sprints (Terraform destroy + re-apply) saves ~$60/month
  but increases CI setup time

---

## 7. Risks and Recommendations

### RISK-01: Platform Mismatch (ARCHITECTURE.md specifies AWS, team uses Azure)

**Severity: HIGH**
**Status: Needs resolution before Sprint 1**

ARCHITECTURE.md §9.1 and §6.4 describe an AWS deployment (ECS Fargate, RDS, ElastiCache,
S3, CloudFront, Secrets Manager). The team's established infrastructure is Azure. Proceeding
without resolving this creates two risks: (a) Sprint 1 infrastructure stories are written
for the wrong platform, and (b) the architecture document is wrong from day one.

**Recommendation:** CTO updates ARCHITECTURE.md §6.4 and §9.1 to reflect Azure as the
Phase 1 target. AWS migration path documented as Phase 2/3 option for on-premises customers
who prefer AWS.

### RISK-02: `prisma db push` vs `prisma migrate deploy` in Production

**Severity: HIGH**
**Status: Must be corrected before first production deployment**

The metrics repo uses `prisma db push` in production. This is acceptable for a single-tenant
internal app but is **dangerous for AgentGuard** because:
1. `db push` does not maintain a migration history — you cannot roll back schema changes.
2. `db push` can silently drop data in some schema change scenarios.
3. The append-only trigger, RLS policies, and partial indexes in AgentGuard's schema are
   defined in raw SQL migration files — `db push` will not apply these correctly.

**Recommendation:** Use `prisma migrate deploy` in the production pipeline. Use `prisma db
push --accept-data-loss` only in staging (ephemeral, acceptable data loss).

### RISK-03: Redis Single Point of Failure (Kill Switch Dependency)

**Severity: MEDIUM**
**Status: Accept for staging; mitigate for production**

The kill switch (ARCHITECTURE.md §3.5) depends on Redis. If Redis is unavailable, kill
switch commands cannot propagate. Azure Cache for Redis Standard C1 has 99.9% SLA (no zone
redundancy). The Premium tier adds zone-redundant replication.

**Recommendation:** For Phase 1 production, use **Standard C1** (99.9% SLA is acceptable
for design partner phase). Upgrade to Premium tier when first enterprise customer is
onboarded. Document the fail-safe: if Redis is unavailable, the SDK will fail-open on kill
switch checks (the Redis GET returns an error, not `"hard"` or `"soft"`) — this is a
conscious fail-open on the kill switch check path only. Policy evaluation still fails-closed
(it uses the cached in-process bundle, not Redis). Ensure this behaviour is documented and
tested.

### RISK-04: BullMQ Queue Durability During Redis Outage

**Severity: MEDIUM**
**Status: Mitigated by SDK disk buffer (ARCHITECTURE.md §4.5)**

If Redis (and therefore BullMQ) is unavailable, SIEM push events and telemetry will queue
up. The SDK's disk buffer (ARCHITECTURE.md §4.5) ensures no events are silently dropped.
However, SIEM integrations will have a latency spike when Redis comes back and the queue
drains.

**Recommendation:** Set BullMQ queue maxStalledCount and a dead-letter queue (failed after
3 retries → DLQ). Alert on DLQ depth > 0 in Azure Monitor.

### RISK-05: Multi-Tenant Data Isolation Not Testable Without Infrastructure

**Severity: HIGH (but code-level, not infrastructure)**
**Status: Must be a CI gate before first tenant is onboarded**

Cross-tenant isolation (ARCHITECTURE.md §7.2) requires PostgreSQL RLS to be enabled and
the `SET LOCAL app.current_tenant_id` session variable to be set in every request. This
can only be fully validated against a real PostgreSQL instance (not SQLite or mocked
clients). The Docker Compose dev environment must use the same PostgreSQL version as
production (16).

**Recommendation:** The cross-tenant isolation integration test (ROADMAP.md Sprint 2.3.4)
must run against a real PostgreSQL 16 instance in CI, not a mock. This test is a security
gate — it must pass on every PR merge, not just at sprint close.

### RISK-06: Three Container Images Increase Build and Scan Time

**Severity: LOW**
**Status: Plan accordingly in Sprint 1 CI design**

The metrics repo builds two images (app + worker). AgentGuard builds three (API, workers,
dashboard). Each image must be Trivy-scanned and Snyk-scanned. With all three parallel ACR
builds + scans, the build stage may take 15–25 minutes.

**Recommendation:** Use `az acr build` with parallel execution (separate GitHub Actions
steps, not sequential). Set the build job timeout to 30 minutes (not 15 as in metrics).
Cache pnpm dependencies across builds using GitHub Actions cache.

### RISK-07: PyPI Package Naming Conflict

**Severity: LOW-MEDIUM**
**Status: Verify immediately**

The package name `agentguard` may be taken on PyPI. Check before Sprint 4 (but ideally
before Sprint 1 so the name can be registered even as a placeholder).

**Recommendation:** Register `agentguard` on PyPI now. If taken, decide on an alternative
(`agentguard-sdk`, `agentguard-ai`, etc.) and update all ARCHITECTURE.md and ROADMAP.md
references before Sprint 4.

### RISK-08: JWT RS256 Key Management Complexity

**Severity: MEDIUM**
**Status: Plan before Sprint 2**

ARCHITECTURE.md §7.1 specifies RS256 JWTs. This requires managing an RSA key pair. The
metrics repo uses a symmetric `NEXTAUTH_SECRET` (much simpler). Generating, storing, and
rotating an RSA key pair in Key Vault is more complex.

**Recommendation:** In Phase 1, use **HS256** with a long random secret (≥64 bytes) for
dashboard-issued JWTs. This dramatically simplifies key management. RS256 adds value when
third parties need to verify your JWTs (e.g., a customer's SIEM needs to validate AgentGuard
tokens without sharing the secret). This is not a Phase 1 requirement. Document this as a
Phase 2 upgrade path. Update ARCHITECTURE.md §7.1 accordingly.

**If CTO insists on RS256:** Store the PEM in Key Vault as a multi-line secret; import it
in the Container App as `secretref:jwt-private-key` mapped to a file mount (not an env var,
as multi-line PEMs in env vars are fragile).

---

## 8. Go/No-Go Checklist

This checklist must be completed before any infrastructure provisioning begins. Items marked
🔴 are blockers. Items marked 🟡 are required before production goes live but do not block
Sprint 1 setup.

### Prerequisites — Must Be True Before Sprint 1 Infrastructure

- [ ] 🔴 **Azure subscription confirmed** — AgentGuard has its own Azure subscription (not
  shared with metrics or other products). Subscription ID documented.
- [ ] 🔴 **Platform decision formalised** — CTO has acknowledged Azure as Phase 1 platform
  (not AWS as written in ARCHITECTURE.md §9.1). ARCHITECTURE.md §6.4 and §9.1 updated.
- [ ] 🔴 **PyPI name `agentguard` reserved** — Check `pip install agentguard` returns
  "not found" or the team owns the package. If taken, alternative name decided.
- [ ] 🔴 **GitHub Environments configured** — `staging` and `production` environments exist
  in the AgentGuard GitHub repo. `production` has required reviewer protection rules (CTO
  + 1 senior engineer must approve all production deployments).
- [ ] 🔴 **Service principal created** — Azure service principal for GitHub Actions OIDC
  auth created; `ARM_CLIENT_ID`, `ARM_TENANT_ID`, `ARM_SUBSCRIPTION_ID` stored in GitHub
  Secrets.
- [ ] 🔴 **Terraform state backend provisioned** — Azure Storage account + container for
  Terraform remote state created manually (bootstrap step; cannot be Terraform-managed).
  Account name documented.
- [ ] 🔴 **JWT approach decided** — HS256 (simpler, recommended) or RS256 (complex,
  deferred). Decision documented in ARCHITECTURE.md before Sprint 2.
- [ ] 🔴 **Database migration strategy confirmed** — Team confirms `prisma migrate deploy`
  in production (not `db push`). CI pipeline template updated accordingly.

### Security — Must Be True Before Any Tenant Is Onboarded

- [ ] 🟡 **Key Vault provisioned with all secrets** — All secrets from §4.4 stored in
  Key Vault with expiration dates set. No secret older than 90 days without rotation.
- [ ] 🟡 **VNet integration enabled** — PostgreSQL and Redis on private endpoints only.
  Container Apps have VNet outbound routing.
- [ ] 🟡 **Trivy scan passing** — All three images pass Trivy scan at CRITICAL/HIGH
  severity gate with zero unacknowledged findings. `.trivyignore` maintained with
  justifications for any suppressed CVEs.
- [ ] 🟡 **Cross-tenant isolation test passing in CI** — ROADMAP.md Sprint 2.3.4
  integration test runs against PostgreSQL 16 with RLS enabled and passes on every PR.
- [ ] 🟡 **WAF enabled** — Azure Front Door WAF policy active with OWASP 3.2 ruleset.
  No custom rules disabled without CTO sign-off.
- [ ] 🟡 **Rate limiting active** — Redis sliding window rate limiter in Hono middleware
  operational in production. Limits documented in runbook.

### Operational — Must Be True Before Design Partner Onboarding

- [ ] 🟡 **Health check endpoints implemented** — `GET /v1/health` on API container,
  `GET /health` on worker container (port 3001), dashboard health route all return 200
  with structured JSON (`{ status: "ok", version, dbPing, redisPing }`).
- [ ] 🟡 **Rollback procedure tested** — Manual rollback (activate previous Container App
  revision, redirect traffic) has been exercised in staging. Runbook documented.
- [ ] 🟡 **Monitoring configured** — Azure Monitor / Log Analytics workspace receiving
  structured logs from all three containers. Alert rules for error rate, p99 latency >
  50ms, and BullMQ DLQ depth > 0.
- [ ] 🟡 **SOC 2 evidence collection started** — Vanta or Drata connected; automated
  evidence collection active for access controls, audit logging, and monitoring
  (ARCHITECTURE.md §7.3 requirement for Month 3 start).
- [ ] 🟡 **Incident response runbook documented** — On-call rotation, escalation path,
  and P0 response SLA documented before first design partner onboards.

### Sign-Off

| Role | Name | Date | Decision |
|---|---|---|---|
| CTO / Security Architect | | | ☐ GO ☐ NO-GO |
| Head of Engineering (or equivalent) | | | ☐ GO ☐ NO-GO |
| DevOps Lead (Sprint 1 infrastructure owner) | | | ☐ GO ☐ NO-GO |

**All three must sign GO before any Terraform `apply` is run against Azure.**

---

*Document version: 1.0 — February 2026*
*Author: Architecture Review Lead (arch-review-deploy)*
*Reference: ARCHITECTURE.md v2.0, ROADMAP.md v2.0, metrics repo CI/CD pipeline and Terraform*
*Next review: End of Sprint 2 (Week 4) — confirm infrastructure matches implementation reality*
