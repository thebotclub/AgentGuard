# Architecture

```mermaid
graph TB
    subgraph Clients
        SDK["Client SDK<br/>(packages/sdk)"]
        DASH["Dashboard<br/>(packages/dashboard)"]
        CLI["CLI<br/>(packages/cli)"]
    end

    subgraph "API Server (api/)"
        MW["Middleware<br/>Auth · Rate Limit · Tenant"]
        ROUTES["Routes<br/>/v1/* · /health · /mcp"]
        SERVICES["Services<br/>Policy · Audit · Alert"]
    end

    subgraph "Policy Engine"
        PE["Evaluator<br/>Rules · Conditions · Actions"]
        PT["Policy Store"]
    end

    subgraph "Data Layer"
        PG[("PostgreSQL<br/>Audit Logs · Policies · Tenants")]
        REDIS[("Redis<br/>Cache · Rate Limits · Sessions")]
    end

    subgraph "Observability"
        SIEM["SIEM / Log Aggregator"]
        ALERTS["Alerting"]
    end

    SDK -->|HTTPS| ROUTES
    DASH -->|HTTPS| ROUTES
    CLI -->|HTTPS / MCP| ROUTES

    MW --> ROUTES
    ROUTES --> SERVICES
    SERVICES --> PE
    PE --> PT
    PE -->|audit event| PG
    SERVICES -->|read/write| PG
    SERVICES -->|cache| REDIS
    MW -->|rate limit| REDIS

    PG -->|stream| SIEM
    SIEM --> ALERTS

    classDef client fill:#4a90d9,stroke:#2c5f8a,color:#fff
    classDef server fill:#2d8a5e,stroke:#1d5c3e,color:#fff
    classDef data fill:#d4a843,stroke:#9c7a2e,color:#fff
    classDef observability fill:#8b5cf6,stroke:#6d3fcc,color:#fff

    class SDK,DASH,CLI client
    class MW,ROUTES,SERVICES server
    class PE,PT server
    class PG,REDIS data
    class SIEM,ALERTS observability
```

## Data Flow

1. **Clients** (SDK, Dashboard, CLI) send requests to the **API Server** over HTTPS.
2. **Middleware** handles authentication, rate limiting (via Redis), and tenant isolation.
3. **Routes** dispatch to **Services**, which contain the business logic.
4. The **Policy Engine** evaluates agent tool calls against stored policies and returns allow/block/approve decisions.
5. Every evaluation produces an **audit event** written to PostgreSQL.
6. Audit events are streamed to external **SIEM** integrations for monitoring and alerting.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full detailed architecture document.
