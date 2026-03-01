# 🛡️ AgentGuard — Cybersecurity for the Agentic Era

> The runtime security platform that monitors, constrains, and audits AI agents — before they go catastrophic.

## What is AgentGuard?

AgentGuard is a **firewall for AI agents**. It sits between your agents and the world, enforcing policies, detecting anomalies, and providing compliance evidence — regardless of which model or framework powers them.

## Core Capabilities

- 🔥 **Policy Engine** — Declarative YAML/JSON policies enforced at runtime ("OPA for agents")
- 👁️ **Real-Time SOC** — Every action monitored with chain-of-thought inspection
- 🛑 **Kill Switch & HITL** — Instant halt + human approval gates for high-risk actions
- 📋 **Compliance Engine** — One-click reports for EU AI Act, SOC 2, HIPAA, DORA, ISO 42001
- 🔗 **Multi-Agent Governance** — Cross-agent visibility, collusion detection, cascade prevention
- 🔌 **MCP Security Layer** — First firewall for Model Context Protocol

## Demo Site

👉 **[Live Demo](https://koshaji.github.io/agentguard/)** — Investor demo website

## Project Structure

```
├── src/                    # Core source code
│   ├── core/               # Policy engine, kill switch, audit logger
│   ├── sdk/                # TypeScript SDK
│   ├── routes/             # API routes (health checks, etc.)
│   └── workers/            # BullMQ background workers
├── infra/terraform/        # Azure infrastructure (Terraform)
│   ├── modules/azure/      # ACR, Container Apps, DB, Redis, Key Vault, VNet
│   └── environments/       # staging.tfvars, production.tfvars
├── .github/workflows/      # CI/CD pipelines
│   ├── deploy-azure.yml    # Build + push + deploy on main
│   ├── terraform-plan.yml  # Plan on PR
│   └── terraform-apply.yml # Apply on merge
├── docker/                 # Worker startup scripts
├── Dockerfile.api          # API server (multi-stage, Node 22 Alpine)
├── Dockerfile.worker       # BullMQ workers
├── Dockerfile.dashboard    # Next.js dashboard
├── docs/                   # Business case, architecture docs
├── design/                 # Architecture & technical design
└── deploy/                 # Deployment plan & review
```

## Deployment

### Prerequisites (one-time manual setup)

1. **Azure subscription** with required resource providers registered
2. **Terraform state backend**: Create storage account `tfstateagentguard` in `terraform-state-rg`
3. **Service principal** with OIDC federated credentials for GitHub Actions
4. **GitHub Secrets**: `ARM_CLIENT_ID`, `ARM_TENANT_ID`, `ARM_SUBSCRIPTION_ID`, `DATABASE_PASSWORD`, `JWT_SECRET`

See `deploy/DEPLOYMENT_PLAN.md` §1 for full bootstrap instructions.

### Deploy Infrastructure

```bash
cd infra/terraform
terraform init
terraform workspace select staging  # or: terraform workspace new staging
terraform plan -var-file=environments/staging.tfvars -var="database_password=..." -var="jwt_secret=..."
terraform apply -var-file=environments/staging.tfvars -var="database_password=..." -var="jwt_secret=..."
```

### CI/CD (automated)

- **Push to `main`** → builds images, runs migrations, deploys to production
- **PR with `infra/` changes** → runs `terraform plan` and comments on PR
- **Merge infra changes to `main`** → `terraform apply` to staging + production

### Local Development

```bash
cp .env.example .env   # Fill in local values
npm install
npm run dev
```

## Architecture

- **API**: Node.js 22 / Hono / TypeScript — Azure Container Apps
- **Workers**: BullMQ (telemetry-ingest, siem-publisher, policy-distributor)
- **Dashboard**: Next.js 14 — Azure Container Apps
- **Database**: PostgreSQL 16 Flexible Server (RLS, PgBouncer)
- **Cache/Queue**: Azure Cache for Redis
- **Secrets**: Azure Key Vault
- **Network**: VNet with private endpoints for DB/Redis

## Status

🚧 **Phase 1 — Foundation** (In Progress)
- [x] Vision & business case
- [x] Demo website
- [x] Architecture design
- [x] Policy engine core
- [x] Deployment infrastructure (Terraform + CI/CD)
- [ ] Core SDK prototype
- [ ] Dashboard MVP

## License

Proprietary — All rights reserved.
