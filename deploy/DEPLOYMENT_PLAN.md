# AgentGuard — Deployment Implementation Plan
## Document version: 1.0 — February 2026
### Classification: Confidential — Internal Engineering
### Status: DRAFT — Awaiting DEPLOYMENT_REVIEW.md Go/No-Go sign-off before execution

---

> **Prerequisites:** Read and sign off DEPLOYMENT_REVIEW.md before executing any step in
> this plan. The Go/No-Go checklist must have all 🔴 items complete before Step 1 below.

---

## Table of Contents

1. [Prerequisites and Bootstrap](#1-prerequisites-and-bootstrap)
2. [Terraform Modules — Create and Adapt](#2-terraform-modules--create-and-adapt)
3. [GitHub Actions Workflows — Create and Adapt](#3-github-actions-workflows--create-and-adapt)
4. [Dockerfiles](#4-dockerfiles)
5. [Environment Variables and Secrets](#5-environment-variables-and-secrets)
6. [Database Setup and Prisma Migrations](#6-database-setup-and-prisma-migrations)
7. [Health Check Endpoints](#7-health-check-endpoints)
8. [Rollback Procedure](#8-rollback-procedure)
9. [Monitoring and Alerting](#9-monitoring-and-alerting)

---

## 1. Prerequisites and Bootstrap

These steps are manual one-time operations performed by the DevOps lead before any
Terraform or CI/CD runs. They cannot be automated because they bootstrap the automation
itself.

### 1.1 Azure Subscription Setup

```bash
# Log in to Azure
az login

# Confirm you're in the correct subscription
az account show
az account set --subscription "<AGENTGUARD_SUBSCRIPTION_ID>"

# Confirm required resource providers are registered
az provider register --namespace Microsoft.App             # Container Apps
az provider register --namespace Microsoft.DBforPostgreSQL  # Flexible Server
az provider register --namespace Microsoft.Cache            # Redis
az provider register --namespace Microsoft.KeyVault
az provider register --namespace Microsoft.ContainerRegistry
az provider register --namespace Microsoft.Storage

# Verify registrations (wait ~2 minutes)
az provider show -n Microsoft.App --query registrationState
```

### 1.2 Terraform Remote State Backend (Manual Bootstrap)

This storage account holds Terraform state. It must exist before `terraform init` runs.
Create it once, manually. Do NOT manage it with Terraform (circular dependency).

```bash
# Create state resource group
az group create \
  --name terraform-state-rg \
  --location uksouth   # or your chosen region

# Create storage account (globally unique name required)
az storage account create \
  --name tfstateagentguard \
  --resource-group terraform-state-rg \
  --location uksouth \
  --sku Standard_LRS \
  --allow-blob-public-access false \
  --min-tls-version TLS1_2

# Create blob container
az storage container create \
  --name tfstate \
  --account-name tfstateagentguard

# Enable soft delete and versioning on the state blob (protects against accidental deletion)
az storage blob service-properties update \
  --account-name tfstateagentguard \
  --enable-delete-retention true \
  --delete-retention-days 30 \
  --enable-versioning true
```

Record in team secrets store:
- Storage account name: `tfstateagentguard`
- Container: `tfstate`
- Key: `agentguard.tfstate`

### 1.3 Azure Service Principal for GitHub Actions (OIDC)

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

# Create service principal
SP_JSON=$(az ad sp create-for-rbac \
  --name "agentguard-github-actions" \
  --role Contributor \
  --scopes /subscriptions/$SUBSCRIPTION_ID \
  --sdk-auth)

CLIENT_ID=$(echo $SP_JSON | jq -r .clientId)

# Grant Key Vault access (the SP needs to manage secrets)
# NOTE: Do this after Key Vault is created in Terraform
# az keyvault set-policy --name agentguard-vault --spn $CLIENT_ID \
#   --secret-permissions get list set delete

# Configure OIDC federated credentials (eliminates client secret rotation)
az ad app federated-credential create \
  --id $CLIENT_ID \
  --parameters '{
    "name": "agentguard-github-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<ORG>/agentguard:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'

az ad app federated-credential create \
  --id $CLIENT_ID \
  --parameters '{
    "name": "agentguard-github-prs",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<ORG>/agentguard:pull_request",
    "audiences": ["api://AzureADTokenExchange"]
  }'

echo "Add these to GitHub Secrets:"
echo "ARM_CLIENT_ID: $CLIENT_ID"
echo "ARM_TENANT_ID: $TENANT_ID"
echo "ARM_SUBSCRIPTION_ID: $SUBSCRIPTION_ID"
```

Add the following to GitHub Secrets (Settings → Secrets → Actions):
- `ARM_CLIENT_ID`
- `ARM_TENANT_ID`
- `ARM_SUBSCRIPTION_ID`

### 1.4 Azure Container Registry (Bootstrap)

```bash
# Create the ACR (must exist before first image build)
az group create --name agentguard-rg --location uksouth

az acr create \
  --name agentguardacr \
  --resource-group agentguard-rg \
  --sku Standard \
  --admin-enabled false

# Grant the service principal pull access (Terraform manages this, but bootstrap if needed)
az role assignment create \
  --assignee $CLIENT_ID \
  --role AcrPull \
  --scope $(az acr show --name agentguardacr --query id -o tsv)

az role assignment create \
  --assignee $CLIENT_ID \
  --role AcrPush \
  --scope $(az acr show --name agentguardacr --query id -o tsv)

# Verify
az acr login --name agentguardacr
```

### 1.5 PyPI Account and Trusted Publisher

```bash
# 1. Create PyPI account at https://pypi.org (or use existing org account)
# 2. Register the package name (even as a placeholder):
#    https://pypi.org/manage/account/ → Publishing

# 3. Configure Trusted Publisher on PyPI:
#    PyPI → Project agentguard → Settings → Publishing → Add publisher
#    Owner: <GitHub org>
#    Repository: agentguard
#    Workflow: publish-pypi.yml
#    Environment: (leave blank or set to "pypi")
#
# This eliminates the need for a PyPI API token in GitHub Secrets.
```

---

## 2. Terraform Modules — Create and Adapt

### 2.1 Directory Structure

```
terraform/
├── main.tf                          # Root module — adapts metrics pattern
├── variables.tf                     # All AgentGuard variable definitions
├── outputs.tf                       # Outputs: app URLs, DB host, etc.
├── versions.tf                      # Provider version locks
├── environments/
│   ├── production.tfvars            # Production variable values
│   └── staging.tfvars               # Staging variable values
└── modules/
    └── azure/
        ├── main.tf                  # Azure resources
        ├── container-apps.tf        # Three Container Apps: API, workers, dashboard
        ├── database.tf              # PostgreSQL Flexible Server
        ├── redis.tf                 # Azure Cache for Redis
        ├── keyvault.tf              # Key Vault + secrets
        ├── storage.tf               # Blob storage
        ├── acr.tf                   # Container Registry (may be in root)
        ├── network.tf               # VNet + subnets + private endpoints
        ├── monitoring.tf            # Log Analytics workspace + alerts
        ├── variables.tf
        └── outputs.tf
```

### 2.2 Root main.tf (Adapted from Metrics)

```hcl
# terraform/main.tf

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.57"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "tfstateagentguard"
    container_name       = "tfstate"
    key                  = "agentguard.tfstate"
  }
}

provider "azurerm" {
  subscription_id = var.azure_subscription_id != "" ? var.azure_subscription_id : null
  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
  resource_provider_registrations = "none"
}

locals {
  name_prefix   = "agentguard-${var.environment}"
  is_production = var.environment == "production"

  common_tags = {
    Project     = "agentguard"
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  scaling = {
    api_min     = local.is_production ? 2 : 0    # 0 enables scale-to-zero in staging
    api_max     = local.is_production ? 10 : 2
    worker_min  = local.is_production ? 1 : 0
    worker_max  = local.is_production ? 5 : 1
    dash_min    = local.is_production ? 1 : 0
    dash_max    = local.is_production ? 5 : 1
  }
}

module "azure" {
  source = "./modules/azure"

  project_name  = "agentguard"
  environment   = var.environment
  location      = var.azure_location
  tags          = local.common_tags

  # Container images
  api_container_image       = var.api_container_image
  worker_container_image    = var.worker_container_image
  dashboard_container_image = var.dashboard_container_image

  # Scaling
  api_min_replicas     = local.scaling.api_min
  api_max_replicas     = local.scaling.api_max
  worker_min_replicas  = local.scaling.worker_min
  worker_max_replicas  = local.scaling.worker_max
  dash_min_replicas    = local.scaling.dash_min
  dash_max_replicas    = local.scaling.dash_max

  # Database
  database_sku      = var.database_sku
  database_username = var.database_username
  database_password = var.database_password

  # Secrets (all go into Key Vault, not env vars)
  jwt_secret              = var.jwt_secret
  api_key_salt            = var.api_key_salt
  redis_password          = var.redis_password
  azure_storage_key       = var.azure_storage_key
  ses_smtp_password       = var.ses_smtp_password
  e2e_test_secret         = var.e2e_test_secret

  # Custom domain
  api_custom_domain       = var.api_custom_domain
  dashboard_custom_domain = var.dashboard_custom_domain
}
```

### 2.3 Key Terraform Resource Additions vs Metrics Repo

**`modules/azure/container-apps.tf` — Three Container Apps (vs two in metrics):**

```hcl
# ── API Container App ──────────────────────────────────────────────────
resource "azurerm_container_app" "api" {
  name                         = "agentguard-api-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = var.tags

  template {
    min_replicas = var.api_min_replicas
    max_replicas = var.api_max_replicas

    container {
      name   = "api"
      image  = var.api_container_image
      cpu    = var.is_production ? 1.0 : 0.5
      memory = var.is_production ? "2Gi" : "1Gi"

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "DATABASE_DIRECT_URL"
        secret_name = "database-direct-url"
      }
      env {
        name        = "REDIS_URL"
        secret_name = "redis-url"
      }
      env {
        name        = "JWT_SECRET"
        secret_name = "jwt-secret"
      }
      env {
        name        = "API_KEY_SALT"
        secret_name = "api-key-salt"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "LOG_LEVEL"
        value = var.is_production ? "info" : "debug"
      }

      liveness_probe {
        path             = "/v1/health"
        port             = 3000
        transport        = "HTTP"
        initial_delay    = 30
        interval_seconds = 30
        timeout          = 5
        failure_count_threshold = 3
      }

      readiness_probe {
        path             = "/v1/health"
        port             = 3000
        transport        = "HTTP"
        initial_delay    = 15
        interval_seconds = 10
        timeout          = 5
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  # Secrets sourced from Key Vault (never inline)
  secret {
    name                = "database-url"
    key_vault_secret_id = azurerm_key_vault_secret.database_url.id
    identity            = azurerm_user_assigned_identity.container_app.id
  }
  # ... (other secrets follow same pattern)
}

# ── Workers Container App ─────────────────────────────────────────────
resource "azurerm_container_app" "workers" {
  name = "agentguard-workers-${var.environment}"
  # Same pattern; different image; port 3001 for health; no ingress (workers are pull-based)
  # min_replicas = var.worker_min_replicas
}

# ── Dashboard Container App ───────────────────────────────────────────
resource "azurerm_container_app" "dashboard" {
  name = "agentguard-dashboard-${var.environment}"
  # Same pattern; Next.js listens on 3000; needs its own external ingress
  # Environment vars: NEXTAUTH_SECRET, NEXT_PUBLIC_API_URL, etc.
}
```

**`modules/azure/network.tf` — VNet with private endpoints (new vs metrics):**

```hcl
resource "azurerm_virtual_network" "main" {
  name                = "agentguard-vnet-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  address_space       = ["10.0.0.0/16"]
  tags                = var.tags
}

resource "azurerm_subnet" "container_apps" {
  name                 = "container-apps-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
  delegation {
    name = "container-apps-delegation"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "private_endpoints" {
  name                 = "private-endpoints-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]
}

# Private endpoints for PostgreSQL and Redis
resource "azurerm_private_endpoint" "postgresql" {
  name                = "agentguard-pg-pe-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  subnet_id           = azurerm_subnet.private_endpoints.id

  private_service_connection {
    name                           = "pg-connection"
    private_connection_resource_id = azurerm_postgresql_flexible_server.main.id
    subresource_names              = ["postgresqlServer"]
    is_manual_connection           = false
  }
}
```

### 2.4 Terraform Variable Changes vs Metrics

New variables replacing metrics-specific ones:

```hcl
# Variables to ADD (not in metrics repo)
variable "api_container_image"       { type = string }
variable "worker_container_image"    { type = string }
variable "dashboard_container_image" { type = string }
variable "jwt_secret"                { type = string; sensitive = true }
variable "api_key_salt"              { type = string; sensitive = true }
variable "redis_password"            { type = string; sensitive = true }
variable "api_custom_domain"         { type = string; default = "" }
variable "dashboard_custom_domain"   { type = string; default = "" }

# Variables to REMOVE (not applicable to AgentGuard)
# nextauth_secret → replaced by jwt_secret
# google_client_id / google_client_secret → not needed in Phase 1
# microsoft_client_* → not needed in Phase 1
# hubspot_*, xero_*, salesforce_* → not applicable
# stripe_* → Phase 2
# openai_api_key, anthropic_api_key → not called by AgentGuard itself
# cron_secret → Phase 2 (no cron jobs in Phase 1)
```

---

## 3. GitHub Actions Workflows — Create and Adapt

### 3.1 Overview of Workflows to Create

| Workflow file | Trigger | Purpose |
|---|---|---|
| `deploy-azure.yml` | Push to `main`, `workflow_dispatch` | Main CI/CD pipeline (adapted from metrics) |
| `publish-pypi.yml` | Push to `v*` tags | PyPI SDK release (new — no equivalent in metrics) |
| `rotate-secrets.yml` | `workflow_dispatch` | Secret rotation (adapt from metrics if it exists; else create) |
| `pr-checks.yml` | Pull requests | Lint, type check, unit tests only (fast feedback; no Azure) |

### 3.2 `deploy-azure.yml` — Adapted Pipeline

Base the workflow on `metrics/.github/workflows/deploy-azure-enhanced.yml` with the
following changes applied:

**Environment variables block (top of file):**

```yaml
env:
  # Image names — three images for AgentGuard
  API_IMAGE_NAME: agentguard-api
  WORKER_IMAGE_NAME: agentguard-workers
  DASHBOARD_IMAGE_NAME: agentguard-dashboard
  IMAGE_TAG: ${{ github.sha }}
  NODE_VERSION: '22'          # Changed: 20 → 22 LTS (ARCHITECTURE.md §6.1)
  PYTHON_VERSION: '3.11'      # New: for pytest in validate stage
  TERRAFORM_VERSION: '1.9.0'

  # Production resources
  RESOURCE_GROUP: agentguard-rg
  API_CONTAINER_APP_NAME: agentguard-api
  WORKER_CONTAINER_APP_NAME: agentguard-workers
  DASHBOARD_CONTAINER_APP_NAME: agentguard-dashboard
  KEY_VAULT_NAME: agentguard-vault
  ACR_LOGIN_SERVER: agentguardacr.azurecr.io
  ACR_NAME: agentguardacr

  # Staging resources
  STAGING_RESOURCE_GROUP: agentguard-rg-staging
  STAGING_API_CONTAINER_APP_NAME: agentguard-api-staging
  STAGING_KEY_VAULT_NAME: agentguard-vault-staging
```

**Change detection additions in `validate` job:**

```yaml
# Additions to the change detection step
- name: Detect changes
  id: changes
  run: |
    # ... (same force_deploy + initial commit handling as metrics) ...

    # App code (same as metrics pattern)
    if git diff --name-only HEAD~1 HEAD | grep -E '^(src/|package\.json|prisma/|Dockerfile)'; then
      echo "app=true" >> $GITHUB_OUTPUT
    else
      echo "app=false" >> $GITHUB_OUTPUT
    fi

    # Dashboard code (new: triggers dashboard image build)
    if git diff --name-only HEAD~1 HEAD | grep -E '^(apps/dashboard/|Dockerfile.dashboard)'; then
      echo "dashboard=true" >> $GITHUB_OUTPUT
    else
      echo "dashboard=false" >> $GITHUB_OUTPUT
    fi

    # Python SDK (new: triggers PyPI publish, NOT Azure deploy)
    if git diff --name-only HEAD~1 HEAD | grep -E '^sdk/python/'; then
      echo "sdk=true" >> $GITHUB_OUTPUT
    else
      echo "sdk=false" >> $GITHUB_OUTPUT
    fi
```

**`validate` job additions:**

```yaml
# After existing TypeScript checks, add:
- name: Python tests (SDK)
  if: steps.changes.outputs.sdk == 'true'
  run: |
    pip install -e "sdk/python/[dev]"
    pytest sdk/python/tests/ -v --tb=short

- name: SDK latency benchmark
  if: steps.changes.outputs.sdk == 'true'
  run: |
    python sdk/python/benchmarks/policy_eval_bench.py
    # Fails CI if p99 > 15ms for in-process evaluation component budget
    # (ARCHITECTURE.md §4.4 component budget)
```

**`build` job — three parallel image builds:**

```yaml
build:
  name: 🏗️ Build & Push Container Images
  runs-on: ubuntu-latest
  timeout-minutes: 30      # Increased from 15: three images + three scans
  needs: validate
  if: needs.validate.outputs.app_changed == 'true' || needs.validate.outputs.dashboard == 'true'

  steps:
    # ... Azure Login, ACR Login (same as metrics) ...

    - name: Build and push API image
      if: needs.validate.outputs.app_changed == 'true'
      run: |
        az acr build \
          --registry ${{ env.ACR_NAME }} \
          --image ${{ env.API_IMAGE_NAME }}:${{ env.IMAGE_TAG }} \
          --image ${{ env.API_IMAGE_NAME }}:latest \
          --file Dockerfile \
          .

    - name: Build and push worker image
      if: needs.validate.outputs.app_changed == 'true'
      run: |
        az acr build \
          --registry ${{ env.ACR_NAME }} \
          --image ${{ env.WORKER_IMAGE_NAME }}:${{ env.IMAGE_TAG }} \
          --image ${{ env.WORKER_IMAGE_NAME }}:latest \
          --file Dockerfile.worker \
          .

    - name: Build and push dashboard image
      if: needs.validate.outputs.dashboard == 'true'
      run: |
        az acr build \
          --registry ${{ env.ACR_NAME }} \
          --image ${{ env.DASHBOARD_IMAGE_NAME }}:${{ env.IMAGE_TAG }} \
          --image ${{ env.DASHBOARD_IMAGE_NAME }}:latest \
          --file apps/dashboard/Dockerfile \
          apps/dashboard/

    # Trivy scans all built images (same pattern, three times)
    - name: Scan API image with Trivy
      if: needs.validate.outputs.app_changed == 'true'
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: ${{ env.ACR_LOGIN_SERVER }}/${{ env.API_IMAGE_NAME }}:${{ env.IMAGE_TAG }}
        format: 'table'
        severity: 'CRITICAL,HIGH'
        exit-code: '1'
        trivyignores: '.trivyignore'
    # ... repeat for worker and dashboard images ...
```

**`deploy` job — update all three Container Apps:**

```yaml
# In the deploy job, after DB migration:
- name: Update API container image
  if: needs.validate.outputs.app_changed == 'true'
  run: |
    az containerapp update \
      --name ${{ env.API_CONTAINER_APP_NAME }} \
      --resource-group ${{ env.RESOURCE_GROUP }} \
      --image ${{ env.ACR_LOGIN_SERVER }}/${{ env.API_IMAGE_NAME }}:${{ env.IMAGE_TAG }}

- name: Update workers container image
  if: needs.validate.outputs.app_changed == 'true'
  run: |
    az containerapp update \
      --name ${{ env.WORKER_CONTAINER_APP_NAME }} \
      --resource-group ${{ env.RESOURCE_GROUP }} \
      --image ${{ env.ACR_LOGIN_SERVER }}/${{ env.WORKER_IMAGE_NAME }}:${{ env.IMAGE_TAG }}

- name: Update dashboard container image
  if: needs.validate.outputs.dashboard == 'true'
  run: |
    az containerapp update \
      --name ${{ env.DASHBOARD_CONTAINER_APP_NAME }} \
      --resource-group ${{ env.RESOURCE_GROUP }} \
      --image ${{ env.ACR_LOGIN_SERVER }}/${{ env.DASHBOARD_IMAGE_NAME }}:${{ env.IMAGE_TAG }}
```

**`check-secrets` job — updated secret names:**

```yaml
# Change these secrets to check:
for SECRET in "DATABASE-URL" "DATABASE-DIRECT-URL" "REDIS-URL" "JWT-SECRET" "API-KEY-SALT"; do
```

### 3.3 `publish-pypi.yml` — New Workflow (No Metrics Equivalent)

```yaml
# .github/workflows/publish-pypi.yml
name: Publish Python SDK to PyPI

on:
  push:
    tags:
      - 'v*'   # Triggered by: git tag v0.1.0 && git push --tags

jobs:
  build-and-publish:
    name: 📦 Build and publish agentguard to PyPI
    runs-on: ubuntu-latest
    environment: pypi   # GitHub Environment with PyPI Trusted Publisher

    permissions:
      contents: read
      id-token: write   # Required for PyPI Trusted Publisher OIDC

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install build tools
        run: |
          pip install build twine
          pip install -e "sdk/python/[dev]"

      - name: Run tests before publish
        run: pytest sdk/python/tests/ -v --tb=short

      - name: Extract version from tag
        id: version
        run: echo "version=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Update package version
        run: |
          sed -i "s/^version = .*/version = \"${{ steps.version.outputs.version }}\"/" \
            sdk/python/pyproject.toml

      - name: Build package
        working-directory: sdk/python
        run: python -m build

      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: sdk/python/dist/
          # No API token needed — uses OIDC Trusted Publisher
          # Configure at: https://pypi.org/manage/project/agentguard/settings/publishing/
```

### 3.4 Key Secret Names in GitHub Secrets

```
ARM_CLIENT_ID              # Azure OIDC
ARM_TENANT_ID              # Azure OIDC
ARM_SUBSCRIPTION_ID        # Azure OIDC
DATABASE_PASSWORD          # Used as TF_VAR_database_password in Terraform plan
JWT_SECRET                 # Used as TF_VAR_jwt_secret
API_KEY_SALT               # Used as TF_VAR_api_key_salt
REDIS_PASSWORD             # Used as TF_VAR_redis_password
E2E_TEST_SECRET            # Staging only
SNYK_TOKEN                 # Security scanning
SEMGREP_APP_TOKEN          # SAST scanning
GITLEAKS_LICENSE           # Secrets scanning
```

---

## 4. Dockerfiles

### 4.1 Control Plane API Dockerfile

Location: `Dockerfile` (root)

```dockerfile
# Dockerfile — AgentGuard Control Plane API
# Node.js 22 LTS / Alpine / multi-stage build
# Pattern: adapted from metrics Dockerfile.worker

FROM node:22-alpine AS base

# ── Dependencies (all, including dev for build) ─────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile && pnpm store prune

# ── Production-only dependencies ────────────────────────────────────────────
FROM base AS prod-deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN pnpm exec prisma generate

# Compile TypeScript → JavaScript with esbuild (same pattern as worker)
# The server.ts entry point + all imports bundled into a single ESM file
RUN pnpm exec esbuild \
  src/server.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --outfile=dist/server.js \
  --packages=external \
  --alias:@/*=./src/*

# ── Production runner ────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 agentguard

# Copy artefacts (prod node_modules only — smaller image)
COPY --from=builder /app/package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

USER agentguard

EXPOSE 3000

# Health check — must match the endpoint implemented in src/routes/health.ts
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node --input-type=commonjs -e \
  "require('http').get('http://localhost:3000/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/server.js"]
```

### 4.2 Worker Dockerfile

Location: `Dockerfile.worker` (root) — directly adapted from metrics `Dockerfile.worker`.

**Changes from metrics template:**

| Metrics | AgentGuard |
|---|---|
| `node:20-alpine` | `node:22-alpine` |
| `insights-worker.ts`, `extraction-worker.ts`, `predictions-worker.ts` | `telemetry-ingest.ts`, `siem-publisher.ts`, `policy-distributor.ts` |
| `adduser worker` | `adduser agentguard` (consistent naming) |
| Worker start script: `start-workers.sh` | Same name; different worker entry points |

```dockerfile
# Dockerfile.worker — AgentGuard BullMQ Workers
# Adapted directly from metrics Dockerfile.worker

FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile && pnpm store prune

FROM base AS prod-deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

FROM base AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate

# Bundle all three workers with esbuild
RUN pnpm exec esbuild \
  src/workers/telemetry-ingest.ts \
  src/workers/siem-publisher.ts \
  src/workers/policy-distributor.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --outdir=dist/workers \
  --packages=external \
  --alias:@/*=./src/*

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 agentguard

COPY --from=builder /app/package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist/workers ./dist/workers
COPY docker/start-workers.sh ./
RUN chmod +x start-workers.sh

USER agentguard

EXPOSE 3001

ENV PORT=3001

# Workers expose a minimal HTTP health endpoint on 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node --input-type=commonjs -e \
  "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["./start-workers.sh"]
```

**`docker/start-workers.sh`:**

```bash
#!/bin/sh
# Start all three AgentGuard BullMQ workers in parallel
# Each worker registers itself with BullMQ and processes its queue

set -e

echo "Starting AgentGuard workers..."
echo "  - telemetry-ingest: processes SDK telemetry batches"
echo "  - siem-publisher: pushes HIGH/CRITICAL events to Splunk/Sentinel"
echo "  - policy-distributor: compiles and caches policy bundles in Redis"

# Start workers in parallel; exit if any worker fails
node dist/workers/telemetry-ingest.js &
TELEMETRY_PID=$!

node dist/workers/siem-publisher.js &
SIEM_PID=$!

node dist/workers/policy-distributor.js &
POLICY_PID=$!

# Start minimal health HTTP server (responds on :3001/health)
node --input-type=module -e "
  import http from 'node:http';
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ status: 'ok', workers: ['telemetry-ingest', 'siem-publisher', 'policy-distributor'] }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(3001, () => console.log('Worker health server on :3001'));
" &
HEALTH_PID=$!

# Wait for any process to exit; if one dies, kill all and exit
wait -n $TELEMETRY_PID $SIEM_PID $POLICY_PID $HEALTH_PID
echo "A worker process exited unexpectedly — shutting down"
kill $TELEMETRY_PID $SIEM_PID $POLICY_PID $HEALTH_PID 2>/dev/null || true
exit 1
```

### 4.3 Dashboard Dockerfile

Location: `apps/dashboard/Dockerfile`

```dockerfile
# Dockerfile.dashboard — AgentGuard Next.js 14 Dashboard

FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY apps/dashboard/package.json apps/dashboard/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/dashboard/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node --input-type=commonjs -e \
  "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
```

**`next.config.js` must include `output: 'standalone'`** for the standalone build to work.

---

## 5. Environment Variables and Secrets

### 5.1 Complete Environment Variable Inventory

**Control Plane API Container:**

| Variable | Source | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | Key Vault secretref | ✅ | PgBouncer pooled connection string |
| `DATABASE_DIRECT_URL` | Key Vault secretref | ✅ | Direct connection for Prisma (bypasses PgBouncer) |
| `REDIS_URL` | Key Vault secretref | ✅ | Redis connection string (`rediss://` for TLS) |
| `JWT_SECRET` | Key Vault secretref | ✅ | JWT signing secret (HS256, ≥64 bytes) |
| `API_KEY_SALT` | Key Vault secretref | ✅ | bcrypt salt rounds for agent API key hashing |
| `NODE_ENV` | Inline | ✅ | `production` |
| `PORT` | Inline | ✅ | `3000` |
| `SERVICE_NAME` | Inline | ✅ | `agentguard-api` (used in slow query logging) |
| `LOG_LEVEL` | Inline | ✅ | `info` (prod) / `debug` (staging) |
| `AZURE_STORAGE_CONNECTION_STRING` | Key Vault secretref | ✅ | Blob storage for exports and forensic blobs |
| `SES_SMTP_HOST` | Key Vault secretref | for HITL email | AWS SES SMTP host |
| `SES_SMTP_USER` | Key Vault secretref | for HITL email | AWS SES SMTP user |
| `SES_SMTP_PASS` | Key Vault secretref | for HITL email | AWS SES SMTP password |
| `CORS_ALLOWED_ORIGINS` | Inline | ✅ | `https://app.agentguard.io` (exact match) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Inline | for observability | OpenTelemetry collector endpoint |
| `OTEL_SERVICE_NAME` | Inline | for observability | `agentguard-api` |

**Workers Container (all same as API, plus):**

| Variable | Source | Required | Description |
|---|---|---|---|
| (all above) | — | — | Workers need DB, Redis, and storage access |
| `WORKER_CONCURRENCY` | Inline | optional | BullMQ worker concurrency (default: 5) |

**Dashboard Container:**

| Variable | Source | Required | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Inline | ✅ | `https://api.agentguard.io/v1` |
| `JWT_SECRET` | Key Vault secretref | ✅ | Same secret — dashboard verifies JWTs |
| `NODE_ENV` | Inline | ✅ | `production` |
| `NEXT_TELEMETRY_DISABLED` | Inline | ✅ | `1` |

### 5.2 Key Vault Secret Population Script

Run this once after Key Vault is provisioned by Terraform:

```bash
#!/bin/bash
# populate-keyvault.sh — Run once after Terraform creates Key Vault
# Requires: az login with Contributor rights, and Key Vault access policy set

VAULT_NAME="agentguard-vault"

echo "Populating Key Vault: $VAULT_NAME"
echo "⚠️  You will be prompted to enter secret values. They will be masked."
echo ""

# Database
read -s -p "DATABASE_URL (PgBouncer connection string): " DB_URL; echo
az keyvault secret set --vault-name $VAULT_NAME --name "DATABASE-URL" --value "$DB_URL"

read -s -p "DATABASE_DIRECT_URL (direct connection): " DB_DIRECT; echo
az keyvault secret set --vault-name $VAULT_NAME --name "DATABASE-DIRECT-URL" --value "$DB_DIRECT"

# Redis
read -s -p "REDIS_URL (rediss://...): " REDIS_URL; echo
az keyvault secret set --vault-name $VAULT_NAME --name "REDIS-URL" --value "$REDIS_URL"

# JWT
JWT_SECRET=$(openssl rand -base64 64)
echo "Generated JWT_SECRET: [hidden — stored in Key Vault]"
az keyvault secret set --vault-name $VAULT_NAME --name "JWT-SECRET" --value "$JWT_SECRET"

# API Key Salt (bcrypt work factor as string, e.g., "12")
az keyvault secret set --vault-name $VAULT_NAME --name "API-KEY-SALT" --value "12"

# Azure Blob Storage
read -s -p "AZURE_STORAGE_CONNECTION_STRING: " STORAGE_CONN; echo
az keyvault secret set --vault-name $VAULT_NAME --name "AZURE-STORAGE-CONNECTION-STRING" \
  --value "$STORAGE_CONN"

# Set expiration on all secrets (90 days from now)
EXPIRY=$(date -d "+90 days" -u +"%Y-%m-%dT%H:%M:%SZ")
for SECRET in "DATABASE-URL" "DATABASE-DIRECT-URL" "REDIS-URL" "JWT-SECRET" "API-KEY-SALT" \
              "AZURE-STORAGE-CONNECTION-STRING"; do
  az keyvault secret set-attributes \
    --vault-name $VAULT_NAME \
    --name $SECRET \
    --expires "$EXPIRY"
  echo "✅ $SECRET → expires $EXPIRY"
done

echo ""
echo "✅ Key Vault populated. All secrets expire in 90 days."
echo "   Configure the secret rotation workflow to run before expiry."
```

---

## 6. Database Setup and Prisma Migrations

### 6.1 Initial Database Setup Sequence

This sequence runs once when first deploying to a new environment. It is NOT automated
in the CI pipeline for the initial setup — run it manually from a secure machine with
network access to the PostgreSQL server.

```bash
# Step 1: Generate Prisma client locally
pnpm exec prisma generate

# Step 2: Run all migrations in order (creates schema, RLS, triggers, indexes)
DATABASE_DIRECT_URL="<direct connection string>" \
pnpm exec prisma migrate deploy

# Step 3: Verify RLS is enabled on all tenant-scoped tables
psql $DATABASE_DIRECT_URL -c "
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
"
# All tenant-scoped tables must show rowsecurity = 't'

# Step 4: Verify the append-only trigger exists
psql $DATABASE_DIRECT_URL -c "
  SELECT trigger_name, event_manipulation, event_object_table
  FROM information_schema.triggers
  WHERE trigger_name LIKE '%append_only%';
"
# Must show: audit_events_append_only | UPDATE/DELETE | AuditEvent

# Step 5: Test RLS works correctly
psql $DATABASE_DIRECT_URL -c "
  SET LOCAL app.current_tenant_id = 'tenant-a-uuid';
  SELECT count(*) FROM \"Agent\";  -- Should return 0 (no agents for this tenant yet)
"

# Step 6: Create initial admin tenant and user (for design partner onboarding)
# Use the API (POST /tenants) after the service is running, NOT direct DB insert.
```

### 6.2 Migration File Requirements

Every Prisma migration must include these raw SQL elements where applicable. The
migration runner order matters:

```
prisma/migrations/
├── 20260301000001_initial_schema/            # Sprint 2: All Prisma models
│   └── migration.sql
├── 20260301000002_rls_policies/              # Sprint 2: RLS setup
│   └── migration.sql                          # Contains ALTER TABLE + CREATE POLICY + ENABLE ROW LEVEL SECURITY
├── 20260301000003_append_only_trigger/       # Sprint 2: AuditEvent trigger
│   └── migration.sql
├── 20260301000004_partial_indexes/           # Sprint 2: Performance indexes
│   └── migration.sql
└── 20260301000005_initial_templates/         # Sprint 3: Policy templates (seed data)
    └── migration.sql                          # Or use a separate seed script
```

**Example RLS migration content:**

```sql
-- 20260301000002_rls_policies/migration.sql
-- Enable Row-Level Security on all tenant-scoped tables

ALTER TABLE "Agent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnomalyScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KillSwitchCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HITLGate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SIEMIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlertWebhook" ENABLE ROW LEVEL SECURITY;

-- Create isolation policy for each table
-- app.current_tenant_id is SET LOCAL by the tenant-rls.ts middleware on each request
DO $$ 
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'Agent', 'AgentSession', 'Policy', 'PolicyVersion', 'AuditEvent',
    'AnomalyScore', 'KillSwitchCommand', 'HITLGate', 'SIEMIntegration', 'AlertWebhook'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON "%s"
       USING ("tenantId"::text = current_setting(''app.current_tenant_id'', true));',
      tbl
    );
  END LOOP;
END $$;

-- Superuser bypass (for CI migration runner, which uses a superuser connection)
-- The application user (agentguard_app) has RLS enforced; superuser bypasses it for migrations only.
CREATE ROLE agentguard_app WITH LOGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agentguard_app;
```

### 6.3 CI Pipeline Migration Step (Production)

The migration step in the `deploy` GitHub Actions job:

```yaml
- name: Run database migrations (BEFORE container update)
  if: needs.validate.outputs.prisma_changed == 'true' || needs.validate.outputs.app_changed == 'true'
  run: |
    echo "::group::Running Prisma migrations BEFORE container update"
    echo "⚠️  CRITICAL: Migrations run BEFORE container update to prevent P2022 errors"

    # Fetch DATABASE_DIRECT_URL from Key Vault (bypasses PgBouncer for migrate)
    DB_DIRECT_URL=$(az keyvault secret show \
      --vault-name ${{ env.KEY_VAULT_NAME }} \
      --name DATABASE-DIRECT-URL \
      --query value -o tsv 2>/dev/null)

    if [ -z "$DB_DIRECT_URL" ]; then
      echo "::error::DATABASE-DIRECT-URL not found in Key Vault"
      exit 1
    fi

    echo "::add-mask::$DB_DIRECT_URL"
    export DATABASE_DIRECT_URL="$DB_DIRECT_URL"

    # Generate Prisma client
    pnpm exec prisma generate

    # Deploy migrations (versioned, idempotent, NO --accept-data-loss)
    pnpm exec prisma migrate deploy

    echo "✅ Migrations applied successfully"
    echo "::endgroup::"
```

---

## 7. Health Check Endpoints

### 7.1 Control Plane API: `GET /v1/health`

Implement in `src/routes/health.ts`:

```typescript
// src/routes/health.ts
import type { Hono } from 'hono';
import { prisma } from '../db/client.ts';
import { redis } from '../lib/redis.ts';

export function registerHealthRoute(app: Hono) {
  app.get('/v1/health', async (c) => {
    const checks: Record<string, 'ok' | 'error'> = {};
    let httpStatus = 200;

    // Database ping
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      httpStatus = 503;
    }

    // Redis ping
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      httpStatus = 503;
    }

    const body = {
      status:   httpStatus === 200 ? 'ok' : 'degraded',
      version:  process.env.IMAGE_TAG ?? 'unknown',
      service:  'agentguard-api',
      checks,
      timestamp: new Date().toISOString(),
    };

    return c.json(body, httpStatus);
  });

  // Lightweight liveness probe (no DB/Redis check — just process alive)
  app.get('/v1/live', (c) => c.json({ status: 'ok' }, 200));
}
```

**Azure Container App probe configuration:**
- **Liveness probe:** `GET /v1/live` — fast, no I/O. Restarts container if the process hangs.
- **Readiness probe:** `GET /v1/health` — full check. Removes from load balancer if DB/Redis down.
- **Startup probe:** `GET /v1/live` with 40-second initial delay (Prisma + Redis client init).

### 7.2 Workers: `GET /health` on Port 3001

Implemented in `docker/start-workers.sh` (see §4.2 above) as a minimal inline HTTP server.

Returns:
```json
{
  "status": "ok",
  "workers": ["telemetry-ingest", "siem-publisher", "policy-distributor"]
}
```

### 7.3 Dashboard: `GET /api/health`

Implement as a Next.js API route in `apps/dashboard/app/api/health/route.ts`:

```typescript
// apps/dashboard/app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'agentguard-dashboard',
    version: process.env.IMAGE_TAG ?? 'unknown',
    timestamp: new Date().toISOString(),
  }, { status: 200 });
}
```

The dashboard health check is intentionally lightweight — it does not ping the API or
database. The API health check covers those. Dashboard health = "Next.js process is alive."

### 7.4 Health Check SLA

| Container | Endpoint | Success | Failure action |
|---|---|---|---|
| API | `/v1/health` | HTTP 200 | Remove from load balancer (readiness); restart (liveness) |
| Workers | `/health` on 3001 | HTTP 200 | Container App restarts worker container |
| Dashboard | `/api/health` | HTTP 200 | Remove from load balancer; restart |
| CI deploy gate | API `/v1/health` | HTTP 200 after 15 attempts | Trigger automated rollback |

---

## 8. Rollback Procedure

### 8.1 Automated Rollback (CI Pipeline)

The metrics repo rollback logic (activate previous revision, redirect traffic) applies
directly. For AgentGuard, rollback must cover all three Container Apps.

```bash
# In the deploy job, rollback step (adapt from metrics deploy job):
# Rolls back API, workers, and dashboard in parallel

rollback_container_app() {
  local APP_NAME=$1
  local RESOURCE_GROUP=$2

  echo "Rolling back: $APP_NAME"

  CURRENT_REVISION=$(az containerapp revision list \
    --name $APP_NAME --resource-group $RESOURCE_GROUP \
    --query "[?properties.trafficWeight > \`0\`].name" -o tsv | head -1)

  PREVIOUS_REVISION=$(az containerapp revision list \
    --name $APP_NAME --resource-group $RESOURCE_GROUP \
    --query "sort_by([?properties.active && name != '$CURRENT_REVISION'], &properties.createdTime) | [-1].name" \
    -o tsv)

  if [ -z "$PREVIOUS_REVISION" ]; then
    echo "::error::No previous revision for $APP_NAME — cannot rollback"
    return 1
  fi

  az containerapp revision activate \
    --name $APP_NAME --resource-group $RESOURCE_GROUP \
    --revision $PREVIOUS_REVISION

  az containerapp ingress traffic set \
    --name $APP_NAME --resource-group $RESOURCE_GROUP \
    --revision-weight $PREVIOUS_REVISION=100

  echo "✅ $APP_NAME rolled back to $PREVIOUS_REVISION"
}

# Roll back all three:
rollback_container_app agentguard-api agentguard-rg &
rollback_container_app agentguard-workers agentguard-rg &
rollback_container_app agentguard-dashboard agentguard-rg &
wait
```

**IMPORTANT — Database migrations and rollback:**

Database migrations (schema changes) **cannot be automatically rolled back**. If a deployment
fails after migrations have been applied, rolling back the container image restores the old
code, but the new schema is still in place. The old code must be schema-backward-compatible
with the new schema. This is a design requirement:

- **Rule:** Every Prisma migration must be backward-compatible with the previous container
  version. New columns must have defaults or be nullable. No destructive changes
  (column drops, type changes) until at least one full release cycle has passed.
- **If a migration causes a P-series Prisma error:** The rollback is to the previous
  container image (which should tolerate the new schema). Fix the migration in the next release.

### 8.2 Manual Rollback Runbook

For on-call engineers who need to rollback without the CI pipeline:

```bash
# Emergency manual rollback — run from Azure Cloud Shell or local az CLI

RESOURCE_GROUP="agentguard-rg"
declare -a APPS=("agentguard-api" "agentguard-workers" "agentguard-dashboard")

for APP in "${APPS[@]}"; do
  echo "=== Rolling back $APP ==="

  # List recent revisions
  az containerapp revision list \
    --name $APP \
    --resource-group $RESOURCE_GROUP \
    --query "[].{name: name, active: properties.active, traffic: properties.trafficWeight, created: properties.createdTime}" \
    -o table

  # Get the current active revision
  CURRENT=$(az containerapp revision list \
    --name $APP --resource-group $RESOURCE_GROUP \
    --query "[?properties.trafficWeight > \`0\`].name" -o tsv | head -1)

  # Get the previous revision (second most recent active)
  PREVIOUS=$(az containerapp revision list \
    --name $APP --resource-group $RESOURCE_GROUP \
    --query "sort_by([?properties.active && name != '$CURRENT'], &properties.createdTime) | [-1].name" \
    -o tsv)

  echo "Current: $CURRENT"
  echo "Rolling back to: $PREVIOUS"
  read -p "Proceed? (y/N) " CONFIRM
  if [ "$CONFIRM" = "y" ]; then
    az containerapp revision activate --name $APP --resource-group $RESOURCE_GROUP --revision $PREVIOUS
    az containerapp ingress traffic set --name $APP --resource-group $RESOURCE_GROUP \
      --revision-weight $PREVIOUS=100
    echo "✅ Rolled back $APP"
  fi
done

# Verify health after rollback
for APP in "${APPS[@]}"; do
  FQDN=$(az containerapp show --name $APP --resource-group $RESOURCE_GROUP \
    --query properties.configuration.ingress.fqdn -o tsv 2>/dev/null || echo "")
  if [ -n "$FQDN" ]; then
    echo -n "Health $APP: "
    curl -sf "https://$FQDN/v1/health" -o /dev/null -w "%{http_code}\n" || echo "FAIL"
  fi
done
```

### 8.3 Rollback Decision Matrix

| Scenario | Action | Escalate |
|---|---|---|
| Health check fails after deploy | Automated rollback (CI pipeline) | If automated rollback fails → page on-call |
| DB migration fails | CI pipeline fails before container update; no rollback needed (container wasn't updated) | Fix migration, re-deploy |
| DB migration succeeded, container fails | Rollback container image (see above); old code must be schema-compatible | If not compatible → DB hotfix required |
| Redis failure | Kill switch fail-open; telemetry buffered in SDK disk buffer; rollback not needed | Alert on-call; restore Redis |
| PostgreSQL failure | All API requests fail (DB is required); restore from backup | P0 incident; page CEO + CTO |

---

## 9. Monitoring and Alerting

### 9.1 Azure Monitor Configuration

```hcl
# modules/azure/monitoring.tf

resource "azurerm_log_analytics_workspace" "main" {
  name                = "agentguard-logs-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = var.is_production ? 90 : 30
  tags                = var.tags
}

# Connect Container Apps environment to Log Analytics
resource "azurerm_container_app_environment" "main" {
  name                       = "agentguard-env-${var.environment}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = var.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = var.tags
  # VNet integration
  infrastructure_subnet_id   = azurerm_subnet.container_apps.id
}
```

### 9.2 Alert Rules

Configure the following alert rules in Azure Monitor (via Terraform or portal):

| Alert | Condition | Severity | Action |
|---|---|---|---|
| **API error rate high** | HTTP 5xx responses > 5% in 5-minute window | Critical | PagerDuty page |
| **API p99 latency** | p99 response time > 500ms for 3 consecutive minutes | Warning | Slack #ops |
| **Policy eval SLA breach** | Custom metric: `policy_eval_p99_ms > 50` | Critical | PagerDuty page |
| **Kill switch propagation slow** | Custom metric: `kill_switch_propagation_ms > 500` | Warning | Slack #ops |
| **BullMQ DLQ depth** | Redis `ZCARD bullmq:agentguard:failed` > 0 | Warning | Slack #ops |
| **PostgreSQL connections** | Connection count > 80% of max (PgBouncer max) | Warning | Slack #ops |
| **Disk buffer growing** | Custom metric: SDK disk buffer non-empty for > 10 min | Warning | Slack #ops |
| **Secret expiry** | Key Vault secret expires in < 7 days | Warning | Slack #ops + email |
| **Container restart loop** | Container App revision restarting > 3 times in 10 min | Critical | PagerDuty page |
| **Audit chain broken** | Custom: `verify_audit_chain` returns `chainValid: false` | Critical | PagerDuty + CEO |

### 9.3 OpenTelemetry Instrumentation

AgentGuard uses OpenTelemetry for distributed tracing (ARCHITECTURE.md §6.4). Wire OTel
in `src/server.ts` before any other imports:

```typescript
// src/instrumentation.ts — import this FIRST in src/server.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

Every request will have a `traceId` from OTel propagation. All structured log lines must
include `traceId` (via the logger middleware in Hono). This enables correlation between
Azure Monitor logs and any external APM tool.

### 9.4 Custom Metrics to Emit

These are AgentGuard-specific metrics that Azure Monitor does not collect automatically.
Emit them via OTel metrics from the application:

| Metric name | Type | Labels | Description |
|---|---|---|---|
| `agentguard.policy_eval.duration_ms` | Histogram | `decision`, `tenantId` | Policy evaluation latency per decision type |
| `agentguard.kill_switch.propagation_ms` | Histogram | `tenantId` | Time from kill command issue to SDK acknowledgment |
| `agentguard.telemetry.batch_size` | Histogram | — | Events per telemetry batch |
| `agentguard.hitl.gate.resolution_ms` | Histogram | `decision`, `tenantId` | Time from gate creation to human decision |
| `agentguard.siem.push.latency_ms` | Histogram | `provider` | SIEM push latency per provider |
| `agentguard.bullmq.dlq_depth` | Gauge | `queue` | Dead letter queue depth per queue |
| `agentguard.audit.chain.valid` | Gauge | `tenantId` | 1 = chain valid, 0 = tamper detected |

The `agentguard.policy_eval.duration_ms` p99 histogram is the primary SLA metric.
The CI load test (ROADMAP.md Sprint 1.2.5) reads this metric to enforce the 50ms gate.

### 9.5 Log Format Standard

All structured logs from the API and workers must follow this JSON format:

```json
{
  "timestamp":  "2026-02-28T22:35:00.000Z",
  "level":      "info",
  "service":    "agentguard-api",
  "traceId":    "abc123def456",
  "tenantId":   "tenant-uuid",     // only when request-scoped
  "message":    "Policy decision: BLOCK",
  "data": {
    "agentId":    "agent-uuid",
    "policyId":   "policy-uuid",
    "ruleId":     "email.external_domain.block",
    "decision":   "block",
    "duration_ms": 7
  }
}
```

**Sensitive data in logs:** Never log API keys (even hashed), full PostgreSQL connection
strings, or user PII beyond the tenantId and userId. The logger must have a `redact`
configuration that strips known sensitive fields.

---

## Appendix: Sprint 1 Infrastructure Checklist

Use this checklist during Sprint 1 (Weeks 1–2) infrastructure work. Check off each item
before marking Sprint 1 complete.

### Bootstrap (One-Time Manual Steps)
- [ ] Azure subscription created and confirmed
- [ ] Resource providers registered (Container Apps, PostgreSQL, Redis, Key Vault, ACR)
- [ ] Terraform state storage account created (`tfstateagentguard`)
- [ ] Service principal created with OIDC federated credentials
- [ ] GitHub Secrets populated: `ARM_CLIENT_ID`, `ARM_TENANT_ID`, `ARM_SUBSCRIPTION_ID`
- [ ] ACR created: `agentguardacr`
- [ ] PyPI package `agentguard` reserved; Trusted Publisher configured

### Terraform (Applied to Staging First)
- [ ] `terraform workspace new staging` created and `apply` successful
- [ ] PostgreSQL Flexible Server (staging): B1ms, `prisma migrate deploy` succeeds
- [ ] Redis (staging): Standard C0, accessible from Container Apps
- [ ] Key Vault (staging): all secrets from §5.2 populated with staging values
- [ ] Three Container Apps (staging): API, workers, dashboard — all health checks pass
- [ ] VNet integration verified: PostgreSQL and Redis not accessible from public internet

### CI/CD (Against Staging)
- [ ] `deploy-azure.yml` workflow runs end-to-end on push to `main`
- [ ] Validate stage passes: TypeScript, lint, pytest, Prisma validate
- [ ] Security scan passes: Snyk, Semgrep, Gitleaks — zero blocking findings
- [ ] Build stage: three images pushed to ACR with SHA tags
- [ ] Trivy scan passes on all three images (or `.trivyignore` maintained for known exceptions)
- [ ] DB migrate runs before container update
- [ ] Health check passes in CI: all three `/health` endpoints return 200
- [ ] `publish-pypi.yml` tested with a `v0.0.1-dev` test release to PyPI TestPyPI

### Docker Compose Dev Environment
- [ ] `docker compose up -d` starts PostgreSQL 16, Redis 7, local blob storage emulator
- [ ] `npm run dev` connects to all services; no connection errors in console
- [ ] `pip install -e sdk/python/` installs cleanly in a fresh virtual environment

---

*Document version: 1.0 — February 2026*
*Author: Architecture Review Lead (arch-review-deploy)*
*Prerequisites: DEPLOYMENT_REVIEW.md Go/No-Go sign-off required before executing any step*
*Next review: End of Sprint 1 (Week 2) — confirm infrastructure matches this plan*
*Owner for execution: DevOps Lead / Senior Backend Engineer (Sprint 1)*