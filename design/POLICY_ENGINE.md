# AgentGuard — Policy Engine Design
## Engineering Document v1.0 — February 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Policy YAML DSL](#2-policy-yaml-dsl)
3. [10+ Example Policies](#3-10-example-policies)
4. [Evaluation Algorithm](#4-evaluation-algorithm)
5. [Policy Lifecycle](#5-policy-lifecycle)
6. [Conflict Resolution](#6-conflict-resolution)
7. [Built-In Templates](#7-built-in-templates)
8. [Testing Framework](#8-testing-framework)
9. [Implementation — TypeScript Types and Zod Schemas](#9-implementation--typescript-types-and-zod-schemas)

---

## 1. Overview

The policy engine is the **central nervous system** of AgentGuard. It answers one question with sub-10ms p95 latency:

> *"Given this agent, this action, and this context — what should happen?"*

The answer is one of four decisions:

| Decision | Effect |
|---|---|
| `allow` | Action proceeds; telemetry recorded |
| `block` | Action is prevented; error returned to agent; telemetry recorded |
| `monitor` | Action proceeds; telemetry recorded with elevated risk flag; no interruption |
| `require_approval` | Action is paused; human-in-the-loop gate opened; agent blocks until resolution |

### 1.1 Design Constraints (from Vision & Scope)

| Constraint | Value |
|---|---|
| **Evaluation latency** | < 10ms p95 (component budget; total SDK overhead < 50ms p99) |
| **Policy format** | YAML (human-readable, Git-versionable, PR-reviewable) |
| **Evaluation location** | In-process in SDK (compiled bundle, no network hop on hot path) |
| **Default action** | `block` (fail-closed) — configurable per policy scope |
| **Expressiveness** | Must cover tool allowlists/blocklists, budget limits, data classification, rate limits, time windows |

### 1.2 Policy Engine Components

```
Policy Authoring
(YAML DSL file)
      │
      ▼
┌─────────────────────────────────────────┐
│  COMPILER (runs in Control Plane)        │
│                                          │
│  1. Parse YAML → PolicyDocument AST      │
│  2. Validate schema (Zod)                │
│  3. Compile conditions → ConditionFns    │
│  4. Build lookup indexes (tool, domain)  │
│  5. Assign rule priorities               │
│  6. Produce PolicyBundle (serialisable)  │
└─────────────────────────────────────────┘
      │  PolicyBundle (JSON/msgpack)
      ▼
┌─────────────────────────────────────────┐
│  DISTRIBUTOR (Control Plane → SDK)       │
│                                          │
│  - Stored in PostgreSQL (compiled IR)    │
│  - Cached in Redis (TTL 60s)             │
│  - Pushed to SDK on bundle refresh       │
│  - SDK caches in-process (LRU, 1 copy)  │
└─────────────────────────────────────────┘
      │  In-process bundle (Python dict)
      ▼
┌─────────────────────────────────────────┐
│  EVALUATOR (runs in SDK, in-process)     │
│                                          │
│  1. Extract action features              │
│  2. Index lookup (O(1) tool filter)      │
│  3. Evaluate matching rules in priority  │
│  4. Apply conflict resolution            │
│  5. Return PolicyDecision                │
└─────────────────────────────────────────┘
```

---

## 2. Policy YAML DSL

### 2.1 Complete Policy Document Structure

```yaml
# agentguard-policy.yaml
# ----------------------------
# Top-level metadata
id:          "pol_customer_service_agent"
name:        "Customer Service Agent Policy"
description: "Governs all customer service agents — restricts financial ops, data access, external comms"
version:     "1.3.0"
tenantId:    "tenant_acme_corp"          # Set by Control Plane on upload; not authored by user

# Targets: which agents this policy applies to
# If omitted, policy must be explicitly assigned to an agent at registration
targets:
  agentTags:
    - "customer-service"
    - "support"
  # OR: specific agent IDs
  # agentIds:
  #   - "agent_abc123"

# Default action when no rule matches
# 'block' = fail-closed (recommended for production)
# 'allow' = fail-open (use only for monitoring/observability mode)
default: block

# Global budget limits (apply to all agents on this policy)
budgets:
  maxTokensPerSession:     100000     # LLM token budget
  maxApiSpendCentsPerDay:  5000       # $50/day max API spend
  maxActionsPerMinute:     60         # Rate limit: 60 tool calls per minute
  maxActionsPerSession:    500        # Hard cap per session

# Rules: evaluated in priority order (lowest number = highest priority)
# First matching rule with action 'allow' or 'block' terminates evaluation
# Rules with action 'monitor' always apply (accumulate, don't terminate)
rules:

  - id:          "rule_001"
    description: "Block all financial transactions above threshold"
    priority:    10                   # Highest priority — evaluated first
    action:      block
    when:
      - tool:    { matches: ["stripe.*", "payment.*", "transfer.*", "refund.*"] }
      - params:
          amount: { gt: 1000 }        # amount > $10.00 (in cents)
    severity:    critical
    tags:        ["financial", "high-risk"]

  - id:          "rule_002"
    description: "Require approval for refunds to external accounts"
    priority:    15
    action:      require_approval
    approvers:   ["team:finance-ops", "role:operator"]
    timeoutSec:  300                  # 5 min timeout; on_timeout: block
    on_timeout:  block
    when:
      - tool:    { matches: ["issue_refund", "create_refund"] }
      - params:
          destination: { pattern: "acct_ext_*" }

  - id:          "rule_003"
    description: "Block access to PII fields in customer records"
    priority:    20
    action:      block
    when:
      - tool:    { matches: ["db_query", "read_record", "get_customer"] }
      - params:
          fields: { contains_any: ["ssn", "dob", "credit_card", "bank_account"] }
    severity:    high

  - id:          "rule_004"
    description: "Block email to external domains"
    priority:    25
    action:      block
    when:
      - tool:    { in: ["send_email", "send_message"] }
      - params:
          to: { domain_not_in: ["acme.com", "acme.co.uk"] }
    severity:    high

  - id:          "rule_005"
    description: "Allow read-only database operations"
    priority:    30
    action:      allow
    when:
      - tool:    { matches: ["db_query", "read_*", "list_*", "get_*"] }
      - params:
          operation: { in: ["SELECT", "read", "get", "list"] }

  - id:          "rule_006"
    description: "Monitor (log but allow) all file system reads"
    priority:    50
    action:      monitor
    when:
      - tool:    { matches: ["read_file", "list_files", "file_*"] }
    riskBoost:   20                   # Add 20 to risk score for analytics

  - id:          "rule_007"
    description: "Block writes to production infrastructure"
    priority:    10
    action:      block
    when:
      - tool:    { matches: ["*"] }
      - params:
          environment: { in: ["production", "prod"] }
          operation:   { in: ["write", "delete", "update", "create", "deploy"] }
    severity:    critical

  - id:          "rule_008"
    description: "Rate limit web search tool"
    priority:    60
    action:      block
    rateLimit:
      maxCalls:     10
      windowSeconds: 60
    when:
      - tool:    { in: ["web_search", "search_web", "browse"] }
    severity:    low

  - id:          "rule_009"
    description: "Block code execution outside sandbox"
    priority:    10
    action:      block
    when:
      - tool:    { matches: ["exec_*", "run_*", "execute_*", "bash", "shell", "python_repl"] }
      - context:
          sandbox: { eq: false }
    severity:    critical

  - id:          "rule_010"
    description: "Allow all operations during business hours (monitoring only outside)"
    priority:    70
    action:      monitor
    when:
      - timeWindow:
          outside:
            days:  ["monday", "tuesday", "wednesday", "thursday", "friday"]
            hours: { start: "09:00", end: "18:00", tz: "America/New_York" }
    riskBoost:   50
    tags:        ["time-based", "after-hours"]
```

### 2.2 DSL Grammar Reference

#### `when` Condition Types

All conditions under a single rule's `when:` are combined with **AND** logic — all must match for the rule to apply.

```yaml
# Tool name matching
tool:
  in:          [list, of, exact, tool, names]   # Exact match
  matches:     ["glob*", "patt?rn"]             # Glob wildcard
  not_in:      [excluded, tools]                # Negation
  regex:       "^(exec|run|bash).*"             # Regex (use sparingly — slower)

# Parameter inspection
params:
  fieldName:
    eq:          "exact_value"          # Exact equality
    not_eq:      "value"                # Not equal
    gt:          1000                   # Numeric greater than
    gte:         1000                   # Numeric greater than or equal
    lt:          100                    # Numeric less than
    lte:         100                    # Numeric less than or equal
    in:          [a, b, c]              # Value in list
    not_in:      [x, y, z]             # Value not in list
    contains:    "substring"            # String contains
    contains_any: ["ssn", "dob"]        # String contains any of list
    pattern:     "acct_ext_*"           # Glob match
    regex:       "^admin_.*"            # Regex match
    domain_not_in: ["trusted.com"]      # For email/URL: domain check
    exists:      true                   # Field present/absent
    is_null:     false

# Session context
context:
  sandbox:       { eq: true }           # Agent declared as sandboxed
  riskTier:      { in: ["high", "critical"] }
  sessionActionCount: { gt: 100 }       # Actions taken this session
  agentTag:      { contains: "prod" }

# Time window
timeWindow:
  within:
    days:   [monday, tuesday, ...]
    hours:  { start: "HH:MM", end: "HH:MM", tz: "TZ identifier" }
  outside:
    days:   [...]
    hours:  { start: "HH:MM", end: "HH:MM", tz: "TZ identifier" }

# Data classification labels (set by prior classification step)
dataClass:
  inputLabels:  { contains_any: ["PII", "PHI", "PCI"] }
  outputLabels: { contains_any: ["CONFIDENTIAL"] }
```

#### `action` Values

```yaml
action: allow             # Permit and record
action: block             # Deny, raise PolicyViolationError
action: monitor           # Permit but flag; accumulate risk score
action: require_approval  # Pause; open HITL gate
```

#### Budget and Rate Limit Clauses

```yaml
# Global budgets (at policy level)
budgets:
  maxTokensPerSession:     100000
  maxApiSpendCentsPerDay:  5000
  maxActionsPerMinute:     60
  maxActionsPerSession:    500

# Per-rule rate limiting
rateLimit:
  maxCalls:      10
  windowSeconds: 60
  keyBy:         session    # Rate key: session | agent | tenant | tool
```

#### `require_approval` Specific Fields

```yaml
action:      require_approval
approvers:   ["team:finance-ops", "role:operator", "user:alice@acme.com"]
timeoutSec:  300
on_timeout:  block     # or: allow (use with extreme caution)
slackChannel: "#security-approvals"   # Optional: override default channel
```

---

## 3. 10+ Example Policies

### Policy 1: Customer Service Agent (Restrictive)

```yaml
id:      "pol_customer_service_restrictive"
name:    "Customer Service Agent — Production"
default: block

budgets:
  maxActionsPerMinute:  30
  maxTokensPerSession:  50000

rules:
  - id: "cs_001"
    description: "Allow customer record lookups (read-only)"
    priority:    10
    action:      allow
    when:
      - tool: { in: ["get_customer", "get_order", "list_orders", "get_product"] }

  - id: "cs_002"
    description: "Allow small refunds automatically (≤$25)"
    priority:    20
    action:      allow
    when:
      - tool:   { in: ["issue_refund"] }
      - params:
          amount_cents: { lte: 2500 }

  - id: "cs_003"
    description: "Require human approval for refunds $25–$200"
    priority:    25
    action:      require_approval
    approvers:   ["role:operator"]
    timeoutSec:  180
    on_timeout:  block
    when:
      - tool:   { in: ["issue_refund"] }
      - params:
          amount_cents: { gt: 2500, lte: 20000 }

  - id: "cs_004"
    description: "Block refunds over $200"
    priority:    30
    action:      block
    when:
      - tool:   { in: ["issue_refund"] }
      - params:
          amount_cents: { gt: 20000 }
    severity:    high

  - id: "cs_005"
    description: "Block all external email/messaging"
    priority:    10
    action:      block
    when:
      - tool:   { matches: ["send_email", "send_sms", "send_message"] }
      - params:
          to: { domain_not_in: ["acme.com"] }
    severity:    high

  - id: "cs_006"
    description: "Allow internal notifications"
    priority:    15
    action:      allow
    when:
      - tool:   { matches: ["send_email", "send_sms", "send_message"] }
      - params:
          to: { domain_not_in: [] }   # matches internal only via rule_005 first

  - id: "cs_007"
    description: "Block any account modification"
    priority:    10
    action:      block
    when:
      - tool:   { matches: ["update_*", "delete_*", "modify_*", "cancel_*"] }
    severity:    high
```

---

### Policy 2: Code Execution Agent (Sandboxed Dev)

```yaml
id:      "pol_code_agent_sandboxed"
name:    "Code Agent — Sandboxed Development"
default: block

rules:
  - id: "code_001"
    description: "Allow code execution only in sandbox"
    priority:    10
    action:      allow
    when:
      - tool:    { matches: ["python_repl", "bash", "exec_*", "run_code"] }
      - context:
          sandbox: { eq: true }

  - id: "code_002"
    description: "Block network access from code execution"
    priority:    5
    action:      block
    when:
      - tool:    { matches: ["python_repl", "bash", "exec_*"] }
      - params:
          code: { regex: "(requests\\.get|urllib|socket|subprocess|curl|wget)" }
    severity:    critical

  - id: "code_003"
    description: "Block file writes outside /tmp"
    priority:    5
    action:      block
    when:
      - tool:    { matches: ["write_file", "create_file"] }
      - params:
          path: { regex: "^(?!\/tmp\/).*" }
    severity:    high

  - id: "code_004"
    description: "Allow read access to project files"
    priority:    20
    action:      allow
    when:
      - tool:    { in: ["read_file", "list_files", "search_files"] }
      - params:
          path: { regex: "^\/workspace\/.*" }

  - id: "code_005"
    description: "Block secrets and credential patterns in code"
    priority:    5
    action:      block
    when:
      - tool:    { matches: ["python_repl", "bash", "write_file"] }
      - params:
          code: { regex: "(api_key|secret|password|token|AWS_SECRET)" }
    severity:    critical
```

---

### Policy 3: Financial Transaction Agent (Strict Compliance)

```yaml
id:      "pol_finance_agent_strict"
name:    "Finance Agent — SOC 2 Compliant"
default: block

budgets:
  maxApiSpendCentsPerDay:  100000    # $1000/day hard cap
  maxActionsPerMinute:     20

rules:
  - id: "fin_001"
    description: "Require approval for ALL payment operations"
    priority:    5
    action:      require_approval
    approvers:   ["role:operator", "team:finance-ops"]
    timeoutSec:  600
    on_timeout:  block
    when:
      - tool: { matches: ["pay*", "transfer*", "wire*", "ach*", "stripe*"] }
    severity:    critical

  - id: "fin_002"
    description: "Block access to production payment credentials"
    priority:    1
    action:      block
    when:
      - tool:   { in: ["get_secret", "read_env", "get_credential"] }
      - params:
          key: { regex: ".*(prod|production).*(key|secret|token|password).*" }
    severity:    critical

  - id: "fin_003"
    description: "Allow read access to transaction history"
    priority:    20
    action:      allow
    when:
      - tool: { in: ["list_transactions", "get_transaction", "get_balance"] }

  - id: "fin_004"
    description: "Monitor all data exports"
    priority:    30
    action:      monitor
    riskBoost:   100
    when:
      - tool: { matches: ["export_*", "download_*", "generate_report"] }

  - id: "fin_005"
    description: "Block after-hours operations"
    priority:    10
    action:      block
    when:
      - timeWindow:
          outside:
            days:  ["monday", "tuesday", "wednesday", "thursday", "friday"]
            hours: { start: "07:00", end: "20:00", tz: "America/New_York" }
    severity:    medium
```

---

### Policy 4: Data Retrieval / RAG Agent

```yaml
id:      "pol_rag_agent"
name:    "RAG / Data Retrieval Agent"
default: block

rules:
  - id: "rag_001"
    description: "Allow vector search on approved indexes"
    priority:    10
    action:      allow
    when:
      - tool:   { in: ["vector_search", "similarity_search", "retrieve_docs"] }
      - params:
          index: { in: ["product_docs", "public_kb", "support_articles"] }

  - id: "rag_002"
    description: "Block retrieval from customer PII indexes"
    priority:    5
    action:      block
    when:
      - tool:   { matches: ["*search*", "*retrieve*", "*lookup*"] }
      - params:
          index: { in: ["customer_pii", "employee_records", "health_records"] }
    severity:    critical

  - id: "rag_003"
    description: "Block bulk data export (prevent exfiltration)"
    priority:    5
    action:      block
    when:
      - tool:   { matches: ["*search*", "*retrieve*"] }
      - params:
          top_k:  { gt: 100 }
          limit:  { gt: 100 }
    severity:    high

  - id: "rag_004"
    description: "Monitor web scraping"
    priority:    20
    action:      monitor
    riskBoost:   30
    when:
      - tool: { in: ["web_search", "scrape_url", "fetch_url", "browse"] }

  - id: "rag_005"
    description: "Block access to internal admin URLs"
    priority:    5
    action:      block
    when:
      - tool:   { in: ["fetch_url", "browse", "scrape_url"] }
      - params:
          url: { regex: ".*(admin|internal|staging|localhost|127\\.0\\.0\\.1).*" }
    severity:    high
```

---

### Policy 5: Infrastructure Management Agent (Highly Restricted)

```yaml
id:      "pol_infra_agent"
name:    "Infrastructure Agent — Change Management"
default: block

rules:
  - id: "infra_001"
    description: "Block ALL production changes without approval"
    priority:    1
    action:      require_approval
    approvers:   ["role:admin", "team:platform-oncall"]
    timeoutSec:  900
    on_timeout:  block
    when:
      - tool:   { matches: ["*"] }
      - params:
          environment: { in: ["production", "prod", "prd"] }
    severity:    critical

  - id: "infra_002"
    description: "Allow read operations in all environments"
    priority:    10
    action:      allow
    when:
      - tool:   { matches: ["describe_*", "list_*", "get_*", "status_*", "check_*"] }

  - id: "infra_003"
    description: "Block database operations"
    priority:    5
    action:      block
    when:
      - tool:   { matches: ["db_*", "sql_*", "postgres_*", "mysql_*"] }
      - params:
          operation: { in: ["DROP", "TRUNCATE", "DELETE", "UPDATE"] }
    severity:    critical

  - id: "infra_004"
    description: "Allow staging deploys (with monitoring)"
    priority:    20
    action:      monitor
    riskBoost:   50
    when:
      - tool:   { matches: ["deploy_*", "update_service", "rollout_*"] }
      - params:
          environment: { in: ["staging", "stg", "uat"] }
```

---

### Policy 6: Low-Trust / Monitoring Only (Observability Mode)

```yaml
id:      "pol_observability_only"
name:    "Observability Mode — Allow All, Monitor Everything"
description: "Used during initial integration to build a baseline. Switch to restrictive policy after 2 weeks."
default: allow    # fail-open intentionally

rules:
  - id: "obs_001"
    description: "Monitor all tool calls with full logging"
    priority:    100
    action:      monitor
    riskBoost:   0
    when:
      - tool: { matches: ["*"] }

  - id: "obs_002"
    description: "Alert on PII access patterns"
    priority:    10
    action:      monitor
    riskBoost:   75
    when:
      - params:
          fields:   { contains_any: ["ssn", "dob", "credit_card"] }
      - dataClass:
          inputLabels: { contains_any: ["PII", "PHI"] }

  - id: "obs_003"
    description: "Alert on external data exfiltration patterns"
    priority:    10
    action:      monitor
    riskBoost:   100
    when:
      - tool: { matches: ["send_*", "upload_*", "export_*", "post_*"] }
      - params:
          destination: { regex: "^(?!.*\\.acme\\.com).*$" }
```

---

### Policy 7: HR / People Data Agent

```yaml
id:      "pol_hr_agent"
name:    "HR Agent — Employee Data Governance"
default: block

rules:
  - id: "hr_001"
    description: "Block access to salary and compensation data"
    priority:    1
    action:      block
    when:
      - tool:   { matches: ["*"] }
      - params:
          fields: { contains_any: ["salary", "compensation", "bonus", "equity", "pay_grade"] }
    severity:    critical

  - id: "hr_002"
    description: "Block aggregate queries (pattern for data harvesting)"
    priority:    5
    action:      block
    when:
      - tool:   { matches: ["db_query", "run_query", "analytics_*"] }
      - params:
          query: { regex: ".*SELECT.*FROM.*(employees|staff|headcount).*WHERE.*1.*=.*1.*" }
    severity:    high

  - id: "hr_003"
    description: "Allow individual employee record access (for assigned HR ops)"
    priority:    20
    action:      allow
    when:
      - tool: { in: ["get_employee", "update_employee_status"] }

  - id: "hr_004"
    description: "Require approval for termination actions"
    priority:    5
    action:      require_approval
    approvers:   ["role:admin", "team:hr-leadership"]
    timeoutSec:  3600
    on_timeout:  block
    when:
      - tool: { in: ["terminate_employee", "deactivate_account", "offboard_employee"] }
    severity:    critical
```

---

### Policy 8: Minimal / Open (Internal Dev Tooling)

```yaml
id:      "pol_dev_open"
name:    "Developer Internal Tooling — Permissive"
description: "For internal dev agents with trusted inputs. NOT for production."
default: allow

rules:
  - id: "dev_001"
    description: "Block deletion of prod database tables (safety net)"
    priority:    1
    action:      block
    when:
      - tool:   { matches: ["db_*", "sql_*"] }
      - params:
          query: { regex: ".*(DROP|TRUNCATE).*(TABLE|DATABASE).*" }
    severity:    critical

  - id: "dev_002"
    description: "Block external outbound calls"
    priority:    5
    action:      block
    when:
      - tool:   { in: ["http_request", "post_request", "fetch_url"] }
      - params:
          url: { regex: "^(?!.*(localhost|127|10\\.|192\\.168|internal)).*$" }
    severity:    high

  - id: "dev_003"
    description: "Monitor everything"
    priority:    100
    action:      monitor
    when:
      - tool: { matches: ["*"] }
```

---

### Policy 9: Healthcare / Clinical AI Agent (HIPAA-Aware)

```yaml
id:      "pol_clinical_agent_hipaa"
name:    "Clinical AI Agent — HIPAA Compliant"
default: block

rules:
  - id: "hipaa_001"
    description: "Block PHI access without session-level consent flag"
    priority:    1
    action:      block
    when:
      - tool:   { matches: ["*"] }
      - dataClass:
          inputLabels: { contains_any: ["PHI"] }
      - context:
          phiConsentGranted: { eq: false }
    severity:    critical

  - id: "hipaa_002"
    description: "Block PHI export to non-covered-entity destinations"
    priority:    1
    action:      block
    when:
      - tool:   { matches: ["send_*", "export_*", "upload_*"] }
      - dataClass:
          outputLabels: { contains_any: ["PHI"] }
      - params:
          destination: { domain_not_in: ["ehr.hospital.org", "hipaacovered.com"] }
    severity:    critical

  - id: "hipaa_003"
    description: "Require approval for clinical recommendations"
    priority:    10
    action:      require_approval
    approvers:   ["role:clinician"]
    timeoutSec:  1800
    on_timeout:  block
    when:
      - tool: { in: ["generate_diagnosis", "recommend_treatment", "prescribe"] }
    severity:    critical

  - id: "hipaa_004"
    description: "Allow patient record lookups with PHI consent"
    priority:    20
    action:      allow
    when:
      - tool:   { in: ["get_patient_record", "list_medications", "get_lab_results"] }
      - context:
          phiConsentGranted: { eq: true }
```

---

### Policy 10: Multi-Scope Composite Policy (Enterprise Layering)

```yaml
id:      "pol_enterprise_base"
name:    "Enterprise Baseline — All Agents"
description: "Applied as a base layer to ALL agents. Agent-specific policies layer on top."
default: block

# This policy applies globally; agent-specific policies add permissions
rules:
  - id: "base_001"
    description: "Always block SQL injection patterns"
    priority:    1
    action:      block
    when:
      - params:
          query: { regex: ".*('|--|;|xp_|UNION SELECT|DROP TABLE).*" }
    severity:    critical

  - id: "base_002"
    description: "Always block credential patterns in parameters"
    priority:    1
    action:      block
    when:
      - params:
          # Any field containing credential-like patterns
          _any: { regex: ".*(BEGIN (RSA|EC|PGP)|sk-[a-zA-Z0-9]{48}|ghp_[a-zA-Z0-9]{36}).*" }
    severity:    critical

  - id: "base_003"
    description: "Block access to cloud metadata endpoints"
    priority:    1
    action:      block
    when:
      - tool:   { matches: ["fetch_url", "http_request", "browse", "*"] }
      - params:
          url: { regex: ".*(169\\.254\\.169\\.254|metadata\\.google\\.internal).*" }
    severity:    critical

  - id: "base_004"
    description: "Monitor high action velocity (potential runaway)"
    priority:    50
    action:      monitor
    riskBoost:   200
    when:
      - context:
          sessionActionCount: { gt: 200 }
```

---

### Policy 11: Token Budget Enforcement

```yaml
id:      "pol_token_budget"
name:    "LLM Token Budget Policy"
default: allow    # pass-through; budget enforcement only

budgets:
  maxTokensPerSession:     50000
  maxTokensPerDay:         500000

rules:
  - id: "token_001"
    description: "Block LLM calls when session budget exhausted"
    priority:    1
    action:      block
    when:
      - tool: { in: ["llm_inference", "chat_completion", "generate"] }
      - context:
          sessionTokensUsed: { gte: 50000 }
    severity:    medium

  - id: "token_002"
    description: "Monitor when session budget is 80% used"
    priority:    10
    action:      monitor
    riskBoost:   50
    when:
      - tool: { in: ["llm_inference", "chat_completion", "generate"] }
      - context:
          sessionTokensUsed: { gte: 40000 }
```

---

## 4. Evaluation Algorithm

### 4.1 High-Level Algorithm

```
Input:  ActionRequest { tool, params, context, agentId, sessionId }
Output: PolicyDecision { result, matchedRuleId, reason, riskScore }

Procedure evaluate(request, bundle):

  1. PRE-CHECKS (O(1), always first)
     a. Check kill switch flag (Redis, cached 5s in SDK)
        → If killed: return BLOCK("Agent is in kill switch state")
     b. Check budget counters
        → If session_actions >= maxActionsPerSession: return BLOCK("Session action budget exceeded")
        → If api_spend >= maxApiSpendCentsPerDay: return BLOCK("Daily API spend budget exceeded")

  2. INDEX LOOKUP (O(1) average)
     candidate_rules = bundle.toolIndex.get(request.tool) ∪ bundle.toolIndex.get("*")
     → Returns only rules that could match this tool name
     → Eliminates non-matching rules before condition evaluation

  3. RULE EVALUATION (O(k) where k = candidate rules, typically 3–10)
     Sort candidate_rules by priority ASC (lowest = highest priority)
     
     monitor_rules = []
     terminal_decision = None
     
     For each rule in candidate_rules:
       if rule.action == "monitor":
         if eval_conditions(rule.when, request):
           monitor_rules.append(rule)
           riskScore += rule.riskBoost ?? 0
         continue  ← never terminates evaluation
       
       if eval_conditions(rule.when, request):
         terminal_decision = rule
         break  ← first matching terminal rule wins

  4. RATE LIMIT CHECK (if terminal_decision.rateLimit defined)
     counter = redis.incr(ratekey(rule, request), window=rule.rateLimit.windowSeconds)
     if counter > rule.rateLimit.maxCalls:
       return BLOCK("Rate limit exceeded", matchedRule=rule.id)

  5. DECISION
     if terminal_decision is None:
       apply bundle.default ('block' or 'allow')
       result = bundle.default
     else:
       result = terminal_decision.action

     return PolicyDecision(
       result        = result,
       matchedRuleId = terminal_decision?.id,
       monitorRules  = [r.id for r in monitor_rules],
       riskScore     = compute_risk_score(result, riskScore, request.context),
       reason        = build_reason(terminal_decision, bundle.default),
     )

Procedure eval_conditions(conditions, request):
  for condition in conditions:
    if not eval_single_condition(condition, request):
      return False    ← AND logic: all must match
  return True
```

### 4.2 Latency Analysis

```
Operation                     | Cost     | Notes
─────────────────────────────────────────────────────────────────
Kill switch cache lookup       | ~0.1ms  | In-process dict, refreshed every 5s
Budget counter check           | ~0.1ms  | In-process counters, sync'd async
Tool index lookup              | ~0.1ms  | Dict.get() on compiled index
Priority sort (10 rules)       | ~0.05ms | Typically pre-sorted at compile time
Condition evaluation (5 rules) | ~2ms    | Python dict/regex/glob, no I/O
Rate limit check (Redis)       | ~0.5ms  | Only on rate-limited rules
Risk score computation         | ~0.1ms  | Arithmetic
Decision assembly              | ~0.1ms  | Dict construction
─────────────────────────────────────────────────────────────────
TOTAL (fast path, no Redis)    | ~3ms    | p50
TOTAL (with rate limit Redis)  | ~4ms    | p75
TOTAL (cold bundle, HTTP)      | ~25ms   | p99, bundle cache miss
─────────────────────────────────────────────────────────────────
TARGET: < 10ms p95 ✅
```

**Why this is fast:**
- No network I/O on the hot path (bundle is in-process)
- Kill switch is a Python dict lookup (refreshed by background thread)
- Tool index eliminates irrelevant rules before any condition evaluation
- Condition evaluators use Python built-ins (dict, regex, glob) — no external engine needed
- Rate limit Redis calls only occur when a rule has `rateLimit` defined (not all rules)

### 4.3 Condition Evaluator Implementation

```python
# agentguard/policy/evaluator.py
from fnmatch import fnmatch
import re

def eval_tool_condition(condition: dict, tool_name: str) -> bool:
    if "in" in condition:
        return tool_name in condition["in"]
    if "not_in" in condition:
        return tool_name not in condition["not_in"]
    if "matches" in condition:
        return any(fnmatch(tool_name, pat) for pat in condition["matches"])
    if "regex" in condition:
        return bool(re.search(condition["regex"], tool_name))
    return True  # No constraint = always matches

def eval_param_condition(condition: dict, params: dict) -> bool:
    for field_name, constraint in condition.items():
        if field_name == "_any":
            # Match any field value
            values = [str(v) for v in params.values()]
            if not any(eval_value_constraint(constraint, v) for v in values):
                return False
        else:
            if field_name not in params:
                if constraint.get("exists") is True:
                    return False
                continue
            if not eval_value_constraint(constraint, params[field_name]):
                return False
    return True

def eval_value_constraint(constraint: dict, value) -> bool:
    if "eq"           in constraint: return value == constraint["eq"]
    if "not_eq"       in constraint: return value != constraint["not_eq"]
    if "gt"           in constraint: return isinstance(value, (int, float)) and value > constraint["gt"]
    if "gte"          in constraint: return isinstance(value, (int, float)) and value >= constraint["gte"]
    if "lt"           in constraint: return isinstance(value, (int, float)) and value < constraint["lt"]
    if "lte"          in constraint: return isinstance(value, (int, float)) and value <= constraint["lte"]
    if "in"           in constraint: return value in constraint["in"]
    if "not_in"       in constraint: return value not in constraint["not_in"]
    if "contains"     in constraint: return constraint["contains"] in str(value)
    if "contains_any" in constraint: return any(s in str(value) for s in constraint["contains_any"])
    if "pattern"      in constraint: return fnmatch(str(value), constraint["pattern"])
    if "regex"        in constraint: return bool(re.search(constraint["regex"], str(value)))
    if "domain_not_in" in constraint:
        domain = extract_domain(str(value))
        return domain not in constraint["domain_not_in"]
    if "exists"       in constraint: return constraint["exists"] == (value is not None)
    return True

def extract_domain(email_or_url: str) -> str:
    if "@" in email_or_url:
        return email_or_url.split("@")[-1].lower().strip()
    # URL: extract hostname
    from urllib.parse import urlparse
    return urlparse(email_or_url).hostname or ""
```

### 4.4 Risk Score Computation (Phase 1: Rule-Based)

Phase 1 uses a rule-based risk score. Phase 2 will layer ML-based anomaly scoring on top.

```
base_score = {
    allow:            0,
    monitor:          10,
    block:            50,
    require_approval: 40,
}[decision]

monitor_boost = sum(rule.riskBoost for rule in matched_monitor_rules)

context_multipliers = {
    riskTier.low:      1.0,
    riskTier.medium:   1.5,
    riskTier.high:     2.0,
    riskTier.critical: 3.0,
}[agent.riskTier]

final_score = min(1000, (base_score + monitor_boost) * context_multiplier)

# Risk tiers for dashboard / alerting:
# 0–99:   LOW
# 100–299: MEDIUM
# 300–599: HIGH
# 600+:    CRITICAL
```

---

## 5. Policy Lifecycle

### 5.1 Lifecycle Stages

```
DRAFT → TESTING → STAGED → ACTIVE → ARCHIVED
   │        │         │        │
   │        │         │        └── Replaced by new version
   │        │         └──────────── Deployed to staging agents only
   │        └────────────────────── Running against test fixtures
   └─────────────────────────────── Created, not yet validated
```

### 5.2 Create Phase

**Authoring (YAML):**
```bash
# Developer workflow
cat > policy.yaml << 'EOF'
id:   "pol_my_agent"
name: "My Agent Policy"
...
EOF

# Validate locally (CLI tool — Phase 1 roadmap)
agentguard policy validate policy.yaml
# ✅ Schema valid
# ✅ 12 rules compiled
# ✅ No circular dependencies
# ⚠️  Rule rule_005 has overlapping conditions with rule_003 (priority conflict possible)

# Upload via API
curl -X POST https://api.agentguard.io/v1/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/yaml" \
  --data-binary @policy.yaml
```

**Git-native workflow (preferred):**
```
agent-policies/
├── customer-service/
│   ├── policy.yaml              # Policy definition
│   └── tests/
│       ├── should_block_large_refund.yaml
│       └── should_allow_small_refund.yaml
└── code-agent/
    └── policy.yaml
```

GitHub Actions CI:
```yaml
on: [pull_request]
jobs:
  policy-lint:
    steps:
      - uses: agentguard/policy-action@v1
        with:
          api-key: ${{ secrets.AGENTGUARD_CI_KEY }}
          command: validate
          path: agent-policies/**/*.yaml
      - uses: agentguard/policy-action@v1
        with:
          command: test
          path: agent-policies/**/*.yaml
```

### 5.3 Test Phase

Policy unit tests validate rule logic against known inputs before deployment:

```yaml
# agent-policies/customer-service/tests/should_block_large_refund.yaml
name: "Large refund should be blocked"
policy: "pol_customer_service_restrictive"
input:
  tool:    "issue_refund"
  params:
    amount_cents: 30000     # $300
    order_id: "ord_abc123"
  context:
    agentId:    "agent_test"
    sessionId:  "session_test"
expected:
  decision:    block
  matchedRule: "cs_004"
---
name: "Small refund should be allowed"
input:
  tool:    "issue_refund"
  params:
    amount_cents: 500      # $5
expected:
  decision:    allow
  matchedRule: "cs_002"
---
name: "Mid refund requires approval"
input:
  tool:    "issue_refund"
  params:
    amount_cents: 5000     # $50
expected:
  decision:    require_approval
  matchedRule: "cs_003"
```

Running tests:
```
POST /policies/{policyId}/test
Body: { testSuite: [...test cases] }

Response:
{
  "passed": 12,
  "failed": 0,
  "results": [
    { "name": "Large refund should be blocked", "passed": true, "actual": { "decision": "block" } }
  ]
}
```

### 5.4 Deploy Phase

```
POST /policies/{policyId}/activate
→ Sets this version as active for the tenant
→ Compiles YAML → PolicyBundle
→ Stores compiled bundle in Redis (TTL 60s)
→ SDK cache invalidated on next bundle refresh (within 60s)
→ Returns { activatedVersion, propagationEstimateSec: 60 }
```

**Rollback:**
```
POST /policies/{policyId}/versions/{previousVersion}/activate
→ Immediately reverts to previous version
→ Same propagation path
→ Audit log records rollback event with actor userId
```

### 5.5 Monitor Phase

After activation, the dashboard shows:
- Actions matched per rule (live feed + daily chart)
- False positive rate per rule (estimated from approved HITL gates that were previously blocked)
- Rule coverage: which rules have never matched (candidates for removal)
- Policy violation trends (spikes may indicate attack or bug)

---

## 6. Conflict Resolution

When multiple rules could apply to the same action, AgentGuard uses these resolution rules in order:

### 6.1 Resolution Rules

```
Rule 1: MONITOR rules never conflict — they always accumulate.
        Monitor rules are evaluated for all matching candidates,
        regardless of terminal decision.

Rule 2: Among terminal rules (allow/block/require_approval),
        the rule with the LOWEST priority number wins.
        (Priority 1 beats priority 10 beats priority 100)

Rule 3: Among terminal rules with EQUAL priority,
        BLOCK beats REQUIRE_APPROVAL beats ALLOW.
        (Most restrictive wins on tie)

Rule 4: If no terminal rule matches,
        the policy-level 'default' action applies.

Rule 5: Global budgets (maxActionsPerSession, etc.) always
        apply before rule evaluation and cannot be overridden
        by allow rules.
```

### 6.2 Conflict Detection at Compile Time

The compiler detects potential conflicts and warns:

```
⚠️  Conflict warning: Rules rule_005 (priority 30, ALLOW) and
    rule_003 (priority 20, BLOCK) both match tool 'db_query' with
    overlapping conditions. Rule rule_003 will always shadow rule_005
    when its conditions are met. If this is unintentional, adjust
    priorities or refine conditions.
    
    Recommendation: If rule_005 is meant to allow safe queries,
    add a condition to exclude the fields check covered by rule_003.
```

### 6.3 Conflict Examples

```
Scenario: Two rules match tool "db_query"
  Rule A: priority=20, action=block,  when: { tool: "db_query" }
  Rule B: priority=30, action=allow,  when: { tool: "db_query" }

Resolution: Rule A wins (lower priority number = higher precedence)
Outcome: BLOCK
```

```
Scenario: Same priority, different actions
  Rule A: priority=10, action=allow,  when: { tool: "send_email", params.to: "internal" }
  Rule B: priority=10, action=block,  when: { tool: "send_email" }
  Both match: to="internal@acme.com"

Resolution: BLOCK wins (most restrictive on tie)
Outcome: BLOCK
Fix: Give rule A lower priority number (e.g., 5) to make explicit intent clear.
```

```
Scenario: Monitor + block both match
  Rule A: priority=100, action=monitor, when: { tool: matches("*") }
  Rule B: priority=10,  action=block,   when: { tool: "send_email", params.to: external }

Resolution: Both apply. Monitor accumulates risk boost; Block terminates.
Outcome: BLOCK + monitor rule risk boost recorded in audit event
```

### 6.4 Multi-Policy Composition (Future — Phase 2)

Phase 1 supports one active policy per agent. Phase 2 will introduce **policy stacking** — a base policy (e.g., `pol_enterprise_base`) that applies to all agents, plus agent-specific policies layered on top.

```
Phase 2 composition model (not implemented in Phase 1):
  base_policy:   priority 0–99   (enterprise-wide rules)
  agent_policy:  priority 100+   (agent-specific rules)
  
Resolution across stacked policies follows the same priority + restrictive-on-tie rules.
Base policy rules with priority < 100 always shadow agent policy rules.
```

---

## 7. Built-In Templates

Phase 1 ships 4 curated templates that developers can use as starting points:

### Template 1: `@agentguard/template-customer-service`

```
Scenario:     Customer-facing chatbot or support agent
Risk profile: Medium — financial ops, customer data access
Defaults:     Block PII writes, block external comms, allow/HITL refunds
Allows:       Read customer records, small refunds, internal messaging
Blocks:       Large refunds, external email, account modification, PII field access
HITL:         Mid-range refunds ($25–$200)
```

### Template 2: `@agentguard/template-code-agent`

```
Scenario:     Developer assistant — code generation, testing, file management
Risk profile: High — code execution, file system, potential secrets exposure
Defaults:     Fail-closed; sandbox required for execution
Allows:       Read project files (/workspace), write to /tmp, run tests in sandbox
Blocks:       Network calls from code, writes outside /tmp, credential patterns
HITL:         Deploy or publish actions
```

### Template 3: `@agentguard/template-data-analyst`

```
Scenario:     Business analytics agent — queries, reports, data exploration
Risk profile: Medium — data access patterns, potential for bulk exfiltration
Defaults:     Allow read, block write/export without approval
Allows:       SELECT queries, aggregations, approved data sources
Blocks:       PII field access, bulk exports, external data transmission
HITL:         Large data exports (> threshold rows)
```

### Template 4: `@agentguard/template-readonly-monitor`

```
Scenario:     Observability-only mode for initial integration
Risk profile: Low (monitoring only — no enforcement)
Defaults:     Allow everything; monitor and score all actions
Allows:       All tools
Blocks:       Nothing (observability mode)
Use case:     Run for 2 weeks to establish baseline before switching to restrictive policy
```

**How templates work:**

```python
# Developer installs template via CLI (Phase 1 roadmap)
agentguard policy init --template customer-service --output policy.yaml

# Or via API
POST /policies/from-template
{
  "template":    "customer-service",
  "agentName":   "support-bot-v2",
  "customise": {
    "maxRefundCents":     5000,
    "approvedDomains":   ["mycompany.com"],
    "enableAfterHours":  false
  }
}
```

---

## 8. Testing Framework

### 8.1 Policy Unit Test Schema

```yaml
# Full test file schema
policyId:  "pol_my_agent"     # Policy to test against (fetches from Control Plane)
# OR:
policyFile: "./policy.yaml"    # Local YAML file for CI (no Control Plane needed)

tests:
  - name:        "Human-readable test name"
    description: "Optional: why this test matters"
    input:
      tool:    "tool_name"
      params:
        key:   value
      context:
        agentId:            "agent_test_001"
        sessionId:          "session_test"
        sessionActionCount: 0
        sandbox:            false
        riskTier:           "medium"
    expected:
      decision:    allow | block | monitor | require_approval
      matchedRule: "rule_id"   # Optional: assert specific rule matched
      minRiskScore: 0          # Optional: assert minimum risk score
      maxRiskScore: 100        # Optional: assert maximum risk score
```

### 8.2 Test Execution (Control Plane API)

```
POST /policies/{policyId}/test
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "tests": [
    {
      "name":  "Block large refund",
      "input": { "tool": "issue_refund", "params": { "amount_cents": 30000 } },
      "expected": { "decision": "block", "matchedRule": "cs_004" }
    }
  ]
}

Response:
{
  "summary": { "total": 1, "passed": 1, "failed": 0 },
  "results": [
    {
      "name":    "Block large refund",
      "passed":  true,
      "actual":  { "decision": "block", "matchedRule": "cs_004", "riskScore": 50 },
      "expected": { "decision": "block", "matchedRule": "cs_004" }
    }
  ]
}
```

### 8.3 Test Coverage Report

```
GET /policies/{policyId}/coverage

Response:
{
  "rules": [
    { "ruleId": "cs_001", "coveredByTests": true,  "testCount": 3,  "recentMatchRate": 0.42 },
    { "ruleId": "cs_007", "coveredByTests": false, "testCount": 0,  "recentMatchRate": 0.00,
      "warning": "Rule has no test coverage and has never matched in production" }
  ],
  "overallCoverage": "85%"
}
```

---

## 9. Implementation — TypeScript Types and Zod Schemas

```typescript
// schemas/policy.schema.ts
import { z } from 'zod';

// ── Condition schemas ──────────────────────────────────────────

const StringConstraintSchema = z.object({
  eq:           z.string().optional(),
  not_eq:       z.string().optional(),
  in:           z.array(z.string()).optional(),
  not_in:       z.array(z.string()).optional(),
  contains:     z.string().optional(),
  contains_any: z.array(z.string()).optional(),
  pattern:      z.string().optional(),
  regex:        z.string().optional(),
  domain_not_in: z.array(z.string()).optional(),
  exists:       z.boolean().optional(),
}).strict();

const NumericConstraintSchema = z.object({
  eq:  z.number().optional(),
  gt:  z.number().optional(),
  gte: z.number().optional(),
  lt:  z.number().optional(),
  lte: z.number().optional(),
  in:  z.array(z.number()).optional(),
}).strict();

const ValueConstraintSchema = z.union([StringConstraintSchema, NumericConstraintSchema]);

const ToolConditionSchema = z.object({
  in:      z.array(z.string()).optional(),
  not_in:  z.array(z.string()).optional(),
  matches: z.array(z.string()).optional(),
  regex:   z.string().optional(),
}).strict();

const TimeWindowSchema = z.object({
  within: z.object({
    days:  z.array(z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])),
    hours: z.object({ start: z.string(), end: z.string(), tz: z.string() }),
  }).optional(),
  outside: z.object({
    days:  z.array(z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])),
    hours: z.object({ start: z.string(), end: z.string(), tz: z.string() }),
  }).optional(),
});

const WhenConditionSchema = z.union([
  z.object({ tool:       ToolConditionSchema }),
  z.object({ params:     z.record(z.string(), ValueConstraintSchema) }),
  z.object({ context:    z.record(z.string(), ValueConstraintSchema) }),
  z.object({ dataClass:  z.record(z.string(), ValueConstraintSchema) }),
  z.object({ timeWindow: TimeWindowSchema }),
]);

// ── Rule schema ─────────────────────────────────────────────────

const RateLimitSchema = z.object({
  maxCalls:      z.number().int().positive(),
  windowSeconds: z.number().int().positive(),
  keyBy:         z.enum(['session', 'agent', 'tenant', 'tool']).default('session'),
});

export const PolicyRuleSchema = z.object({
  id:          z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  priority:    z.number().int().min(1).max(1000).default(100),
  action:      z.enum(['allow', 'block', 'monitor', 'require_approval']),
  when:        z.array(WhenConditionSchema).min(1),
  severity:    z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tags:        z.array(z.string()).default([]),
  riskBoost:   z.number().int().min(0).max(500).default(0),
  rateLimit:   RateLimitSchema.optional(),
  // require_approval specific
  approvers:   z.array(z.string()).optional(),
  timeoutSec:  z.number().int().positive().optional(),
  on_timeout:  z.enum(['block', 'allow']).default('block').optional(),
  slackChannel: z.string().optional(),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

// ── Policy document schema ──────────────────────────────────────

const BudgetsSchema = z.object({
  maxTokensPerSession:     z.number().int().positive().optional(),
  maxTokensPerDay:         z.number().int().positive().optional(),
  maxApiSpendCentsPerDay:  z.number().int().positive().optional(),
  maxActionsPerMinute:     z.number().int().positive().optional(),
  maxActionsPerSession:    z.number().int().positive().optional(),
});

const TargetsSchema = z.object({
  agentTags: z.array(z.string()).optional(),
  agentIds:  z.array(z.string().uuid()).optional(),
});

export const PolicyDocumentSchema = z.object({
  id:          z.string().min(1).max(200),
  name:        z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  version:     z.string().regex(/^\d+\.\d+\.\d+$/),   // semver required
  default:     z.enum(['allow', 'block']).default('block'),
  targets:     TargetsSchema.optional(),
  budgets:     BudgetsSchema.optional(),
  rules:       z.array(PolicyRuleSchema).min(0).max(500),
});

export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>;

// ── Compiled PolicyBundle (served to SDK) ───────────────────────

export const PolicyBundleSchema = z.object({
  policyId:      z.string(),
  tenantId:      z.string().uuid(),
  version:       z.string(),
  compiledAt:    z.string().datetime(),
  defaultAction: z.enum(['allow', 'block']),
  budgets:       BudgetsSchema.optional(),
  rules:         z.array(z.object({
    id:           z.string(),
    priority:     z.number(),
    action:       z.enum(['allow', 'block', 'monitor', 'require_approval']),
    // Compiled conditions as serialisable dicts
    toolCondition:    z.unknown().optional(),
    paramConditions:  z.array(z.unknown()),
    contextConditions: z.array(z.unknown()),
    timeConditions:   z.array(z.unknown()),
    rateLimit:    RateLimitSchema.optional(),
    approvers:    z.array(z.string()).optional(),
    timeoutSec:   z.number().optional(),
    on_timeout:   z.enum(['block', 'allow']).optional(),
    severity:     z.string(),
    riskBoost:    z.number(),
  })),
  // Pre-built lookup indexes for O(1) tool matching
  toolIndex: z.record(z.string(), z.array(z.number())),  // tool → [rule indices]
  checksum:  z.string(),  // SHA-256 of the bundle for integrity verification
});

export type PolicyBundle = z.infer<typeof PolicyBundleSchema>;

// ── PolicyDecision (returned by evaluator) ──────────────────────

export const PolicyDecisionSchema = z.object({
  result:         z.enum(['allow', 'block', 'monitor', 'require_approval']),
  matchedRuleId:  z.string().nullable(),
  monitorRuleIds: z.array(z.string()),
  riskScore:      z.number().int().min(0).max(1000),
  reason:         z.string().nullable(),
  gateId:         z.string().uuid().nullable(),   // Set if require_approval
  gateTimeoutSec: z.number().nullable(),
  policyVersion:  z.string(),
  evaluatedAt:    z.string().datetime(),
  durationMs:     z.number(),                     // Evaluation latency (SLA tracking)
});

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
```

---

*Document version: 1.0 — February 2026*
*Owner: CTO / Policy Engine Lead*
*Scope: Phase 1 MVP implementation specification*
*Classification: Confidential — Internal Engineering*
