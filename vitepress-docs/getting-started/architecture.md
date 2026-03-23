# Architecture Overview

AgentGuard is a runtime security layer that sits between your AI agents and their tools. This document explains the system components, how they fit together, and the key concepts you need to know as a developer.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      YOUR APPLICATION                               │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │   AI Agent (LangChain / CrewAI / AutoGen / Custom)          │  │
│   │                                                             │  │
│   │   "Call tool: database_query"                               │  │
│   └────────────────────────┬────────────────────────────────────┘  │
│                            │                                        │
│                            ▼                                        │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │   AgentGuard SDK  (@the-bot-club/agentguard / agentguard-tech)│ │
│   │                                                             │  │
│   │   guard.evaluate({ tool, action, input })                   │  │
│   └────────────────────────┬────────────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────────────┘
                             │  HTTPS  POST /api/v1/evaluate
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENTGUARD API SERVER                            │
│              api.agentguard.tech  (Express 5 / Node 22)            │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │  Auth Middleware │  │   Rate Limiter  │  │  Input Validator │   │
│  │  (x-api-key)    │  │  (IP/tenant)    │  │  (Zod schemas)   │   │
│  └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘   │
│           └────────────────────┼────────────────────┘             │
│                                ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     POLICY ENGINE                            │  │
│  │              (in-process, <1ms evaluation)                   │  │
│  │                                                              │  │
│  │   1. Load active policy for tenant                           │  │
│  │   2. Evaluate rules in priority order                        │  │
│  │   3. Apply conditions (tool name, params, time window, etc.) │  │
│  │   4. Resolve conflicts (highest-priority rule wins)          │  │
│  │   5. Return: allow | block | monitor | require_approval      │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                       │
│  ┌──────────────────────────▼───────────────────────────────────┐  │
│  │                    AUDIT LOGGER                               │  │
│  │                                                              │  │
│  │   • Record every evaluation event                            │  │
│  │   • SHA-256 hash chain (tamper-evident)                      │  │
│  │   • PII redaction before storage                             │  │
│  │   • Fire-and-forget webhook delivery                         │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DATABASE                                     │
│        PostgreSQL 16 (production) / SQLite (dev/test)              │
│                                                                     │
│  tenants  │  api_keys  │  audit_events  │  policies  │  agents     │
│  webhooks │  sessions  │  rate_limits   │  mcp_configs             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DASHBOARD                                     │
│                  app.agentguard.tech                               │
│                                                                     │
│  • View audit trail     • Manage agents     • Edit policies        │
│  • Approve HITL queue   • Kill switch       • Usage analytics      │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Agent → Decision

Here's the exact path an evaluation takes through the system:

```
1. Agent decides to call a tool
         │
         ▼
2. SDK serializes the call to JSON and sends:
   POST /api/v1/evaluate
   x-api-key: ag_...
   { "tool": "database_query", "action": "execute", "input": { "query": "..." } }
         │
         ▼
3. API auth middleware
   • Reads x-api-key header
   • Looks up api_keys table → resolves tenant_id + agent context
   • Attaches to request context
         │
         ▼
4. Rate limiter
   • Checks per-tenant and per-IP windows
   • Returns 429 if exceeded
         │
         ▼
5. Policy engine (in-process, no I/O)
   • Loads active policy for the tenant
   • Finds candidate rules by tool name (exact + wildcard matches)
   • Sorts candidates by priority (ascending = highest priority first)
   • Evaluates conditions: tool name, param matchers, time windows
   • Resolves conflicts: first matching terminal rule wins
   • Monitor rules accumulate risk score (non-terminal)
   • Returns: { result, riskScore, matchedRuleId, reason }
         │
         ▼
6. Audit logger
   • Writes event row to database
   • Computes: hash = SHA256(prev_hash + tool + result + timestamp + tenant_id)
   • PII patterns redacted from input before storage
   • Fires webhooks asynchronously (non-blocking)
         │
         ▼
7. Response returned to SDK
   { "result": "allow", "riskScore": 5, "matchedRuleId": "allow-safe-reads", "duration_ms": 0.8 }
         │
         ▼
8. SDK returns decision to agent
   • allow / monitor → agent proceeds with tool execution
   • block → SDK throws AgentGuardBlockError
   • require_approval → agent queues for human review
```

## Key Concepts

### Tenants

Everything in AgentGuard is scoped to a **tenant** — your account. Your API keys, agents, policies, and audit logs are all isolated to your tenant. No data crosses tenant boundaries at the application layer.

### API Keys

Three key types:

| Type | Prefix | Use Case |
|------|--------|----------|
| Tenant key | `ag_live_` | Your main admin key. Register agents, manage policies, view audit logs |
| Agent key | `ag_agent_` | Scoped to a single agent. Used in production agent code |
| Test key | `ag_test_` | Same as tenant key but for non-production use |

Agent keys can only call `POST /evaluate`, `GET /audit`, and MCP proxy endpoints. They cannot manage agents, policies, or tenant settings.

### Agents

An **agent** is a registered entity that makes evaluation calls. Register each of your AI agents to:

- Scope policy rules to specific agents
- Track usage and risk per agent
- Apply different policies to different agent roles
- Get per-agent audit logs

```bash
# Register an agent
curl -X POST https://api.agentguard.tech/api/v1/agents \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -d '{
    "name": "customer-support-bot",
    "description": "Handles tier-1 customer queries",
    "tools": ["crm_read", "email_send", "knowledge_base_search"]
  }'
```

### Policies

A **policy** is a YAML document that defines your security rules. Each tenant can have multiple policies; one is active at a time.

A policy contains:
- **`default`** — what to do when no rule matches (`allow` or `block`)
- **`rules`** — ordered list of conditions and actions
- **`version`** — for tracking changes

Rules are evaluated in **priority order** (lower number = higher priority). The first matching rule that has a terminal action (`allow`, `block`, `require_approval`) wins.

```yaml
id: production-policy
name: Production Security Policy
version: 2.1.0
default: block   # deny anything not explicitly permitted

rules:
  - id: allow-read-only
    action: allow
    priority: 100
    when:
      - tool:
          in: [file_read, db_read, search, knowledge_lookup]

  - id: monitor-writes
    action: monitor     # non-terminal: logs + adds risk, then continues
    priority: 50
    riskBoost: 20
    when:
      - tool:
          in: [file_write, db_write, cache_set]

  - id: block-system
    action: block
    priority: 10
    severity: critical
    when:
      - tool:
          in: [shell_exec, sudo, eval, exec, system]
```

### Rules

Each rule has:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for the rule |
| `action` | `allow`, `block`, `monitor`, or `require_approval` |
| `priority` | Lower = evaluated first (1 = highest priority) |
| `when` | List of condition groups (ANDed within a group, ORed between groups) |
| `severity` | `info`, `low`, `medium`, `high`, `critical` (affects risk score) |
| `riskBoost` | Extra points added to risk score when rule matches |

**Condition matchers:**

```yaml
when:
  - tool:
      in: [shell_exec, bash]         # tool name in list
      startsWith: "db_"              # tool name prefix
      matches: "^sql_.*_write$"      # regex match

    params:
      query:
        contains: "DROP"             # param value check
      path:
        startsWith: "/etc/"          # path restriction

    timeWindow:
      start: "09:00"
      end: "17:00"
      timezone: "Australia/Melbourne"
      days: [mon, tue, wed, thu, fri]
```

### Evaluations

An **evaluation** is a single policy decision on a tool call. Every evaluation is:
- **Recorded** in the audit log with a cryptographic hash
- **Verifiable** — the hash chain can be checked at any time
- **Immutable** — cannot be modified or deleted without detection

### Audit Trail

The audit trail is a SHA-256 hash-chained log of every evaluation. Each event includes:

```
event_id | tool | action | result | risk_score | tenant_id | timestamp
previous_hash → hash = SHA256(prev + tool + result + timestamp + tenant_id)
```

To verify your audit trail's integrity:

```bash
curl https://api.agentguard.tech/api/v1/audit/verify \
  -H "x-api-key: $AGENTGUARD_API_KEY"
```

### Kill Switch

The kill switch is a global halt mechanism for your tenant:

```bash
# Activate — blocks ALL evaluate calls for your tenant
curl -X POST https://api.agentguard.tech/api/v1/killswitch \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -d '{"active": true}'

# Deactivate
curl -X POST https://api.agentguard.tech/api/v1/killswitch \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -d '{"active": false}'
```

When the kill switch is active, all `POST /evaluate` calls return `block` with reason `"Kill switch is active"` — your agents stop immediately.

## Deployment Architecture

AgentGuard runs on:
- **Azure Container Apps** — the API server
- **Cloudflare** — DNS, SSL, DDoS protection
- **Azure PostgreSQL 16** — production database
- **SQLite** — development and test environments

For self-hosting, see the [Self-Hosted guide](/security/hardening).

## SDK Architecture

Both SDKs (TypeScript and Python) are thin HTTP clients. They:

1. Serialize the tool call to the evaluate API payload
2. Send `POST /api/v1/evaluate` with your API key
3. Deserialize the response
4. Throw `AgentGuardBlockError` on block decisions (configurable)

There is no local policy evaluation by default — all decisions happen on the server. This means:
- Policy changes take effect immediately (no client redeploy needed)
- Every decision is logged centrally
- The full audit trail is available in one place

An optional **local policy engine** is available for latency-sensitive use cases (`LocalPolicyEngine` in TypeScript, `_LocalPolicyEngine` in Python) but requires manual policy syncing.

## API Surface

AgentGuard exposes **144 endpoints** across these domains:

| Domain | Key Endpoints |
|--------|---------------|
| Evaluation | `POST /evaluate`, `POST /evaluate/batch` |
| Agents | `POST /agents`, `GET /agents`, `DELETE /agents/:id` |
| Policies | `POST /policies`, `GET /policies`, `GET /policies/templates` |
| Audit | `GET /audit`, `GET /audit/verify` |
| Kill Switch | `POST /killswitch`, `POST /agents/:id/killswitch` |
| Webhooks | `POST /webhooks`, `GET /webhooks` |
| Rate Limits | `POST /rate-limits`, `GET /rate-limits` |
| MCP | `POST /mcp/proxy`, `POST /mcp/admit`, `POST /mcp/configs` |
| Analytics | `GET /analytics/usage`, `GET /dashboard/stats` |
| Compliance | `GET /compliance/owasp`, `GET /compliance/report` |

Full reference: [API Overview →](/api/overview)
