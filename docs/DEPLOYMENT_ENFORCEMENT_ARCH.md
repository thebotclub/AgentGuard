# AgentGuard — Deployment Enforcement Architecture

> **Document version:** 1.0  
> **Date:** March 2026  
> **Classification:** Confidential — AgentGuard Internal  
> **Status:** Design Proposal — Ready for Engineering Review  
> **Author:** Solutions Architecture

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Component 1 — `agentguard validate` CLI](#3-component-1--agentguard-validate-cli)
4. [Component 2 — GitHub Action](#4-component-2--github-action-agentguard-techvalidate)
5. [Component 3 — Agent Registry Enforcement](#5-component-3--agent-registry-enforcement)
6. [Component 4 — MCP Admission Control](#6-component-4--mcp-admission-control)
7. [Component 5 — PostgreSQL Migration Plan](#7-component-5--postgresql-migration-plan)
8. [Security Model](#8-security-model)
9. [Database Schema Additions](#9-database-schema-additions)
10. [API Endpoint Specifications](#10-api-endpoint-specifications)
11. [Sequence Diagrams](#11-sequence-diagrams)
12. [Migration Strategy (Phased Rollout)](#12-migration-strategy-phased-rollout)
13. [Effort Estimates](#13-effort-estimates)
14. [Appendix](#14-appendix)

---

## 1. Executive Summary

AgentGuard currently enforces policy at **runtime** — evaluating every tool call as it happens. This architecture adds a second enforcement layer at **deploy time**, preventing AI agents from reaching production unless they have documented, tested security coverage for every tool they use.

The Deployment Enforcement system answers the question: *"Before this agent goes live, do we know what it can do, and have we decided whether that's acceptable?"*

### Why This Matters for Investors

| Problem | Current State | With Deployment Enforcement |
|---|---|---|
| Unknown tools in production | Agents can go live without any policy | Every tool must have a policy decision before deployment |
| Security debt | Teams discover policy gaps after incidents | Policy gaps discovered in PR review, before merge |
| Compliance audit | "We monitor what agents do" | "Agents cannot deploy without security sign-off" — much stronger claim |
| Enterprise sales | Governance story is reactive | Governance story is preventive — required for regulated industries |

This moves AgentGuard from **"we catch bad things when they happen"** to **"bad things can't happen because we prevent uncovered agents from deploying"**. This is the difference between a monitoring tool and a security control.

---

## 2. System Overview

### 2.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEVELOPER WORKFLOW                                    │
│                                                                              │
│   Developer writes agent code                                                │
│          │                                                                   │
│          ▼                                                                   │
│   ┌─────────────────┐     ┌──────────────────────────────────────────────┐  │
│   │  agentguard     │     │           GitHub Actions CI/CD               │  │
│   │  validate ./    │     │                                              │  │
│   │  (local check)  │     │   PR opened → agentguard-tech/validate       │  │
│   └────────┬────────┘     │   ├── Scan agent code                       │  │
│            │              │   ├── Detect tools                           │  │
│            │              │   ├── Check policy coverage                  │  │
│            │              │   ├── Post PR comment with report            │  │
│            │              │   └── Block merge if score < threshold       │  │
│            │              └──────────────────┬───────────────────────────┘  │
│            │                                 │                               │
└────────────┼─────────────────────────────────┼───────────────────────────────┘
             │                                 │
             ▼                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        AGENTGUARD CONTROL PLANE                             │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    Agent Registry + Lifecycle Engine                  │  │
│  │                                                                       │  │
│  │   registered ──► validated ──► certified ──► deployed                │  │
│  │        │              │             │            │                    │  │
│  │  POST /agents    POST /agents  POST /agents  (deployment             │  │
│  │  (register)      /{id}/validate /{id}/certify  gate)                 │  │
│  │                                                                       │  │
│  │   Policy change → certification expires → must re-validate            │  │
│  └────────────────────────────┬──────────────────────────────────────────┘  │
│                               │                                              │
│  ┌────────────────────────────▼──────────────────────────────────────────┐  │
│  │                     Policy Coverage Engine                            │  │
│  │                                                                       │  │
│  │   For each agent tool declaration:                                    │  │
│  │   1. Find matching policy rules (tool name / glob / regex)            │  │
│  │   2. Verify at least one rule exists with a decision                  │  │
│  │   3. Flag uncovered tools as deployment blockers                      │  │
│  │   4. Compute coverage score: covered_tools / total_tools × 100       │  │
│  └────────────────────────────┬──────────────────────────────────────────┘  │
│                               │                                              │
│  ┌────────────────────────────▼──────────────────────────────────────────┐  │
│  │                    MCP Admission Control                              │  │
│  │                                                                       │  │
│  │   POST /api/v1/mcp/admit                                             │  │
│  │   ├── Enumerate all tools from MCP server manifest                   │  │
│  │   ├── Check each tool against tenant policy rules                    │  │
│  │   ├── ADMIT: all tools covered                                        │  │
│  │   └── REJECT: uncovered tools listed, connection blocked              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Persistence Layer                                │    │
│  │                                                                     │    │
│  │   SQLite (current dev/test) ◄──── abstracted via db adapter ──────►│    │
│  │   PostgreSQL (production)                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         RUNTIME ENFORCEMENT                                  │
│   (existing — every tool call evaluated against policies in real time)       │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

| Principle | Implementation |
|---|---|
| **Fail closed** | Uncertified agents are blocked from deployment; missing policies → block, not allow |
| **Backward compatible** | All new endpoints are additive; existing `/evaluate` path is unchanged |
| **Layered enforcement** | CLI (local) → CI gate (PR) → Registry (API) → Runtime (existing) |
| **Automation-first** | JSON output everywhere; CI/CD integration is the primary consumption pattern |
| **Audit trail** | Every validation, certification, and expiry event is logged with actor + timestamp |

---

## 3. Component 1 — `agentguard validate` CLI

### 3.1 Purpose

`agentguard validate` is a static analysis tool that scans agent source code, detects every tool the agent uses, checks whether AgentGuard has a policy covering each tool, and outputs a **Deployment Readiness Score** (0–100%). It fails with exit code 1 if coverage is below a configured threshold — making it a CI gate.

### 3.2 CLI Interface

```
USAGE:
  agentguard validate [OPTIONS] [PATH]

OPTIONS:
  --api-key <key>           AgentGuard API key (or AGENTGUARD_API_KEY env var)
  --api-url <url>           AgentGuard API base URL (default: https://api.agentguard.tech)
  --agent-id <id>           Validate against a specific registered agent's declared tools
  --threshold <0-100>       Minimum coverage % required (default: 80)
  --fail-on <severity>      Also fail on uncovered tools of this severity or higher
                            (values: low|medium|high|critical; default: high)
  --output <format>         Output format: text|json|junit (default: text)
  --framework <fw>          Hint: langchain|crewai|autogen|mcp|openai|auto (default: auto)
  --config <path>           Path to .agentguard.yaml config file
  --include <glob>          File patterns to scan (default: **/*.py,**/*.ts,**/*.js)
  --exclude <glob>          File patterns to exclude (default: node_modules,__pycache__,.git)
  --no-color                Disable colored output
  --verbose                 Verbose output including matched rules per tool
  --dry-run                 Scan and report without contacting API (offline mode)

ARGS:
  PATH                      Directory to scan (default: current directory)

EXIT CODES:
  0   Coverage >= threshold, no fail-on severity violations
  1   Coverage < threshold OR fail-on severity tool found uncovered
  2   Scan failed (API unreachable, parse error, invalid config)
  3   No agent code detected in path

EXAMPLES:
  # Basic scan of current directory
  agentguard validate .

  # CI gate: fail below 90% coverage
  agentguard validate . --threshold 90 --output json

  # Validate a registered agent's declared tools
  agentguard validate --agent-id agt_abc123

  # Offline dry-run (no API, just tool detection)
  agentguard validate . --dry-run

  # Target a specific framework
  agentguard validate ./src/agents --framework crewai --threshold 100
```

### 3.3 Tool Detection Engine

The CLI uses static analysis to detect tool usage patterns across all supported frameworks. Detection is heuristic-based (AST where possible, regex fallback).

#### Supported Frameworks and Detection Patterns

**LangChain (Python)**
```python
# Patterns detected:
@tool                                          # → tool name from function name
Tool(name="search_web", ...)                   # → "search_web"
StructuredTool.from_function(name="...", ...)  # → declared name
tools = [SearchTool(), EmailTool()]            # → class name lowercased
agent = initialize_agent(tools, ...)           # → all tools in list
```

**CrewAI (Python)**
```python
# Patterns detected:
@tool("Tool Name")                             # → "Tool Name"
BaseTool subclass with name = "..."            # → declared name
agent = Agent(tools=[SearchTool()])            # → class name
crew = Crew(agents=[agent], tasks=[...])       # → all agent tools
```

**AutoGen (Python)**
```python
# Patterns detected:
@register_for_llm(description="...")           # → function name
@register_for_execution()                      # → function name
agent.register_function(                       # → key in function_map
  function_map={"send_email": send_email_fn}
)
ConversableAgent with tools=[...]              # → tool list
```

**MCP Tool Calls**
```python
# Python
mcp.call_tool("write_file", {...})             # → "write_file"
session.call_tool(name="bash", ...)            # → "bash"

# TypeScript
client.callTool("read_file", {...})            # → "read_file"
await mcp.tools.call({ name: "...", ... })     # → declared name
```

**Raw HTTP / Shell (high-risk)**
```python
# Patterns detected and flagged as "raw:http" or "raw:shell"
requests.post("https://...")                   # → "raw:http" (high severity)
httpx.get(url)                                 # → "raw:http"
subprocess.run([...])                          # → "raw:shell" (critical severity)
os.system(...)                                 # → "raw:shell"
exec(...)                                      # → "raw:exec" (critical)
eval(...)                                      # → "raw:eval" (critical)
```

**OpenAI Function Calling / Assistants**
```python
# Function calling
tools=[{"type": "function", "function": {"name": "get_weather"}}]  # → "get_weather"

# Assistants tools
AssistantFile, code_interpreter, retrieval     # → "openai:code_interpreter", etc.
```

#### Detection Confidence Levels

Each detected tool has a confidence score:

| Confidence | Meaning | Output label |
|---|---|---|
| `certain` | Explicit string literal name found | `[CERTAIN]` |
| `probable` | Name derived from class/function name | `[PROBABLE]` |
| `dynamic` | Dynamic tool loading detected | `[DYNAMIC]` |
| `inferred` | Tool list variable passed to agent | `[INFERRED]` |

Dynamic tools (`DYNAMIC`) are flagged separately — if the CLI cannot enumerate specific tool names, it warns that comprehensive validation requires the agent to declare tools explicitly.

### 3.4 Policy Coverage Check

After tool detection, the CLI calls `POST /api/v1/agents/coverage-check` to determine which tools have policy coverage:

```
┌──────────────────────────────────────────────────────────────────┐
│  Detected Tools              │  Coverage Status                  │
├──────────────────────────────┼───────────────────────────────────┤
│  search_web                  │  ✅ COVERED  (pol_001: monitor)    │
│  send_email                  │  ✅ COVERED  (pol_002: hitl)       │
│  read_database               │  ✅ COVERED  (pol_001: allow)      │
│  write_database              │  ❌ UNCOVERED  [HIGH]              │
│  raw:http                    │  ❌ UNCOVERED  [CRITICAL]          │
│  raw:shell                   │  ❌ UNCOVERED  [CRITICAL]          │
└──────────────────────────────┴───────────────────────────────────┘

  Coverage: 3/6 tools = 50.0%
  Threshold: 80%
  Status: ❌ FAIL (coverage below threshold)

  Uncovered critical tools:
    • raw:http  — Outbound HTTP call without policy (line src/agent.py:42)
    • raw:shell — Shell execution without policy (line src/agent.py:87)

  To fix: Create policies covering these tools, or add them to
  your declared tool list so they can be reviewed.

  Run with --output json for CI integration.
  Exit code: 1
```

### 3.5 JSON Output Mode

When `--output json` is specified:

```json
{
  "status": "fail",
  "exitCode": 1,
  "score": 50,
  "threshold": 80,
  "scannedAt": "2026-03-03T01:09:00Z",
  "agentId": null,
  "path": "/workspace/my-agent",
  "summary": {
    "totalTools": 6,
    "coveredTools": 3,
    "uncoveredTools": 3,
    "dynamicToolsDetected": 0,
    "frameworks": ["langchain", "raw:http", "raw:shell"]
  },
  "tools": [
    {
      "name": "search_web",
      "framework": "langchain",
      "confidence": "certain",
      "sourceFile": "src/agent.py",
      "sourceLine": 12,
      "covered": true,
      "policies": [
        {
          "policyId": "pol_001",
          "ruleId": "monitor-web-search",
          "decision": "monitor",
          "severity": "low"
        }
      ]
    },
    {
      "name": "write_database",
      "framework": "langchain",
      "confidence": "certain",
      "sourceFile": "src/agent.py",
      "sourceLine": 55,
      "covered": false,
      "policies": [],
      "riskSeverity": "high",
      "message": "No policy covers this tool. Database writes can cause irreversible data changes."
    },
    {
      "name": "raw:shell",
      "framework": "raw:shell",
      "confidence": "certain",
      "sourceFile": "src/agent.py",
      "sourceLine": 87,
      "covered": false,
      "policies": [],
      "riskSeverity": "critical",
      "message": "Unrestricted shell access detected. This is a critical security risk."
    }
  ],
  "readinessScore": 50,
  "recommendation": "Add policies for uncovered tools before deploying. Focus on raw:shell (critical) first."
}
```

### 3.6 Configuration File

Projects can include `.agentguard.yaml` at the repo root:

```yaml
# .agentguard.yaml
validate:
  threshold: 85
  failOn: high
  frameworks:
    - langchain
    - mcp
  include:
    - "src/**/*.py"
    - "agents/**/*.py"
  exclude:
    - "tests/**"
    - "**/*_test.py"
  # Tools declared as intentionally uncovered (with justification)
  allowedUncovered:
    - tool: "raw:http"
      justification: "Used only for health checks; no policy needed"
      approvedBy: "security-team"
      approvedAt: "2026-02-15"

  # Custom tool name aliases
  aliases:
    "my_internal_search": "search_web"
    "company_email_send": "send_email"
```

### 3.7 CLI Package Distribution

| Distribution | Command | Notes |
|---|---|---|
| npm (global) | `npm install -g agentguard-cli` | Recommended for CI |
| npx (one-shot) | `npx agentguard-cli validate .` | No install required |
| PyPI | `pip install agentguard-cli` | For Python-native teams |
| Docker | `docker run agentguard/cli validate .` | No Node/Python required |
| Pre-built binary | GitHub Releases (x86_64, arm64) | No runtime required |

---

## 4. Component 2 — GitHub Action: `agentguard-tech/validate`

### 4.1 Action Interface

```yaml
# .github/workflows/security-gate.yml
name: AgentGuard Security Gate

on:
  pull_request:
    paths:
      - 'src/**'
      - 'agents/**'
      - '*.py'

jobs:
  agentguard-validate:
    name: Policy Coverage Check
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write    # Required for PR comment
      checks: write           # Required for check annotations

    steps:
      - uses: actions/checkout@v4

      - name: AgentGuard Validate
        uses: agentguard-tech/validate@v1
        id: agentguard
        with:
          # Required
          api-key: ${{ secrets.AGENTGUARD_API_KEY }}

          # Optional — all have defaults
          path: './src/agents'           # Directory to scan (default: '.')
          threshold: '85'                # Coverage % required (default: '80')
          fail-on: 'high'                # Fail on uncovered tools of this severity (default: 'high')
          framework: 'auto'             # langchain|crewai|autogen|mcp|auto (default: 'auto')
          api-url: 'https://api.agentguard.tech'  # For self-hosted (default: SaaS)
          agent-id: ''                   # Validate against registered agent's declared tools
          post-comment: 'true'          # Post PR coverage report (default: 'true')
          fail-on-decrease: 'true'       # Fail if coverage drops vs. base branch (default: 'false')
          comment-title: 'AgentGuard Policy Coverage Report'

      # Outputs available after the step
      - name: Show Results
        run: |
          echo "Coverage: ${{ steps.agentguard.outputs.coverage }}"
          echo "Score: ${{ steps.agentguard.outputs.readiness-score }}"
          echo "Status: ${{ steps.agentguard.outputs.status }}"
```

### 4.2 Action Inputs/Outputs Specification

**Inputs:**

| Input | Required | Default | Description |
|---|---|---|---|
| `api-key` | ✅ | — | AgentGuard API key |
| `path` | | `.` | Directory to scan |
| `threshold` | | `80` | Minimum coverage % (0–100) |
| `fail-on` | | `high` | Severity level that causes failure if uncovered |
| `framework` | | `auto` | Framework hint for detection |
| `api-url` | | `https://api.agentguard.tech` | API base URL |
| `agent-id` | | — | Registered agent ID to validate against |
| `post-comment` | | `true` | Post coverage report as PR comment |
| `fail-on-decrease` | | `false` | Fail if coverage is lower than base branch |
| `comment-title` | | `AgentGuard Policy Coverage` | Title for PR comment |
| `config` | | `.agentguard.yaml` | Config file path |

**Outputs:**

| Output | Type | Description |
|---|---|---|
| `coverage` | `string` | Coverage percentage (e.g. `"85.5"`) |
| `readiness-score` | `string` | Deployment readiness score 0–100 |
| `status` | `string` | `pass` or `fail` |
| `total-tools` | `string` | Total tools detected |
| `covered-tools` | `string` | Tools with policy coverage |
| `uncovered-tools` | `string` | Tools without policy coverage |
| `risk-score` | `string` | Aggregate risk score |
| `report-url` | `string` | URL to full report in AgentGuard dashboard |
| `report-json` | `string` | Full report as JSON string |

### 4.3 PR Comment Format

When `post-comment: 'true'`, the action posts a comment structured as:

```markdown
## 🛡️ AgentGuard Policy Coverage Report

**Status:** ❌ Coverage below threshold  
**Coverage:** 67% (4/6 tools covered)  
**Threshold:** 85%  
**Risk Score:** 340/1000  

---

### ✅ Covered Tools (4)

| Tool | Framework | Decision | Policy |
|------|-----------|----------|--------|
| `search_web` | LangChain | monitor | [pol_soc2-starter](https://app.agentguard.tech/policies/pol_001) |
| `send_email` | LangChain | require_approval | [pol_email-guard](https://app.agentguard.tech/policies/pol_002) |
| `read_crm` | LangChain | allow | [pol_crm-readonly](https://app.agentguard.tech/policies/pol_003) |
| `search_knowledge_base` | LangChain | allow | [pol_internal-tools](https://app.agentguard.tech/policies/pol_004) |

### ❌ Uncovered Tools (2) — **BLOCKING MERGE**

| Tool | Framework | File | Severity | Action Required |
|------|-----------|------|----------|-----------------|
| `write_crm` | LangChain | `src/agent.py:55` | 🔴 HIGH | Create a policy covering `write_crm` |
| `raw:shell` | Shell | `src/agent.py:87` | 🔴 CRITICAL | Remove or replace shell access with a declared tool |

---

**How to fix:**
1. Go to [AgentGuard Dashboard](https://app.agentguard.tech) → Policies
2. Create rules covering `write_crm` and address `raw:shell`
3. Re-run this check (push a new commit)

[View full report →](https://app.agentguard.tech/reports/abc123)

---
<sub>AgentGuard v1.0 • Scanned 47 files • 0.8s • [Docs](https://docs.agentguard.tech)</sub>
```

### 4.4 Action Implementation

The action is implemented as a composite action that shells out to the CLI:

```yaml
# action.yml (in agentguard-tech/validate repository)
name: 'AgentGuard Validate'
description: 'Validate AI agent policy coverage before deployment'
author: 'AgentGuard Technologies'

branding:
  icon: 'shield'
  color: 'blue'

inputs:
  api-key:
    description: 'AgentGuard API key'
    required: true
  path:
    description: 'Directory to scan'
    required: false
    default: '.'
  threshold:
    description: 'Minimum coverage percentage required (0-100)'
    required: false
    default: '80'
  fail-on:
    description: 'Fail on uncovered tools of this severity or higher'
    required: false
    default: 'high'
  framework:
    description: 'Framework hint: langchain|crewai|autogen|mcp|openai|auto'
    required: false
    default: 'auto'
  api-url:
    description: 'AgentGuard API base URL (for self-hosted)'
    required: false
    default: 'https://api.agentguard.tech'
  agent-id:
    description: 'Registered agent ID to validate against'
    required: false
    default: ''
  post-comment:
    description: 'Post coverage report as PR comment'
    required: false
    default: 'true'
  fail-on-decrease:
    description: 'Fail if coverage drops vs. base branch'
    required: false
    default: 'false'
  comment-title:
    description: 'Title for the PR comment'
    required: false
    default: 'AgentGuard Policy Coverage Report'
  config:
    description: 'Path to .agentguard.yaml'
    required: false
    default: '.agentguard.yaml'

outputs:
  coverage:
    description: 'Coverage percentage'
  readiness-score:
    description: 'Deployment readiness score (0-100)'
  status:
    description: 'pass or fail'
  total-tools:
    description: 'Total tools detected'
  covered-tools:
    description: 'Tools with policy coverage'
  uncovered-tools:
    description: 'Number of uncovered tools'
  risk-score:
    description: 'Aggregate risk score'
  report-url:
    description: 'URL to full report in AgentGuard dashboard'
  report-json:
    description: 'Full validation report as JSON string'

runs:
  using: 'composite'
  steps:
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'

    - name: Install AgentGuard CLI
      shell: bash
      run: npm install -g agentguard-cli@latest

    - name: Run validation
      id: validate
      shell: bash
      env:
        AGENTGUARD_API_KEY: ${{ inputs.api-key }}
      run: |
        ARGS="--output json --threshold ${{ inputs.threshold }}"
        ARGS="$ARGS --fail-on ${{ inputs.fail-on }}"
        ARGS="$ARGS --api-url ${{ inputs.api-url }}"
        [ -n "${{ inputs.framework }}" ] && ARGS="$ARGS --framework ${{ inputs.framework }}"
        [ -n "${{ inputs.agent-id }}" ] && ARGS="$ARGS --agent-id ${{ inputs.agent-id }}"
        [ -f "${{ inputs.config }}" ] && ARGS="$ARGS --config ${{ inputs.config }}"

        # Run CLI, capture output, allow non-zero exit
        REPORT=$(agentguard validate ${{ inputs.path }} $ARGS 2>&1) || VALIDATE_EXIT=$?
        VALIDATE_EXIT=${VALIDATE_EXIT:-0}

        echo "report<<EOF" >> $GITHUB_OUTPUT
        echo "$REPORT" >> $GITHUB_OUTPUT
        echo "EOF" >> $GITHUB_OUTPUT

        # Parse JSON output
        COVERAGE=$(echo "$REPORT" | jq -r '.readinessScore // 0')
        STATUS=$(echo "$REPORT" | jq -r '.status // "fail"')
        TOTAL=$(echo "$REPORT" | jq -r '.summary.totalTools // 0')
        COVERED=$(echo "$REPORT" | jq -r '.summary.coveredTools // 0')
        UNCOVERED=$(echo "$REPORT" | jq -r '.summary.uncoveredTools // 0')
        RISK=$(echo "$REPORT" | jq -r '.riskScore // 0')

        echo "coverage=$COVERAGE" >> $GITHUB_OUTPUT
        echo "readiness-score=$COVERAGE" >> $GITHUB_OUTPUT
        echo "status=$STATUS" >> $GITHUB_OUTPUT
        echo "total-tools=$TOTAL" >> $GITHUB_OUTPUT
        echo "covered-tools=$COVERED" >> $GITHUB_OUTPUT
        echo "uncovered-tools=$UNCOVERED" >> $GITHUB_OUTPUT
        echo "risk-score=$RISK" >> $GITHUB_OUTPUT
        echo "report-json=$REPORT" >> $GITHUB_OUTPUT

        exit $VALIDATE_EXIT

    - name: Post PR Comment
      if: ${{ inputs.post-comment == 'true' && github.event_name == 'pull_request' }}
      uses: actions/github-script@v7
      with:
        script: |
          const report = JSON.parse(`${{ steps.validate.outputs.report }}`);
          const comment = generateComment(report, '${{ inputs.comment-title }}');

          // Find and update existing comment, or create new
          const { data: comments } = await github.rest.issues.listComments({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number,
          });
          const existing = comments.find(c => c.body?.includes('AgentGuard Policy Coverage'));
          if (existing) {
            await github.rest.issues.updateComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              comment_id: existing.id,
              body: comment,
            });
          } else {
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: comment,
            });
          }
```

---

## 5. Component 3 — Agent Registry Enforcement

### 5.1 Agent Lifecycle State Machine

The agent lifecycle adds three new states to the existing `registered` state:

```
                    ┌─────────────────────────────────────────────────────┐
                    │                 AGENT LIFECYCLE                      │
                    └─────────────────────────────────────────────────────┘

  POST /api/v1/agents             POST /api/v1/agents/{id}/validate
         │                                    │
         ▼                                    ▼
  ┌──────────────┐    validate       ┌───────────────┐
  │  REGISTERED  │ ───────────────► │   VALIDATED   │
  │              │                  │               │
  │ Tools declared                  │ All declared  │
  │ but not yet  │                  │ tools have    │
  │ checked for  │                  │ policy        │
  │ coverage     │                  │ coverage      │
  └──────────────┘                  └───────┬───────┘
                                            │
                              POST /api/v1/agents/{id}/certify
                                            │
                                            ▼
                                   ┌───────────────┐
                                   │  CERTIFIED    │
                                   │               │
                         ┌─────────│ Human sign-off │
                         │         │ obtained;      │
                         │         │ deployment OK  │
                         │         └───────┬───────┘
                         │                 │
                         │   Agent deployed / PUT agents/{id}/status=deployed
                         │                 │
                         │                 ▼
                         │        ┌───────────────┐
                         │        │   DEPLOYED    │ ◄─── Policy change ──┐
                         │        │               │                      │
                         │        │ Actively      │                      │
                         │        │ monitored     │──── cert expires ────┘
                         │        └───────┬───────┘     (re-validate required)
                         │                │
                         │          kill switch
                         │                │
                         └────────────────▼
                                 ┌─────────────────┐
                                 │   QUARANTINED   │
                                 │ or DEACTIVATED  │
                                 └─────────────────┘
```

**Certification Expiry Rules:**
1. A policy governing a tool used by the agent is modified → certification expires immediately
2. A policy is deleted → certification expires immediately
3. A new tool is declared on the agent → certification expires immediately
4. Certification TTL (configurable, default: 90 days) expires → must re-validate

### 5.2 Agent Tool Declaration

Agents must declare their tools at registration time (or they can be updated later). The `tools` field is an array of tool declarations:

```json
POST /api/v1/agents
{
  "name": "customer-service-bot",
  "description": "Handles customer inquiries via CRM and email",
  "tools": [
    {
      "name": "search_crm",
      "description": "Search customer records in CRM",
      "framework": "langchain",
      "riskLevel": "low"
    },
    {
      "name": "send_email",
      "description": "Send email to customers",
      "framework": "langchain",
      "riskLevel": "medium"
    },
    {
      "name": "read_order_history",
      "description": "Read a customer's order history",
      "framework": "langchain",
      "riskLevel": "low"
    }
  ],
  "deploymentEnvironments": ["production", "staging"],
  "certificationRequirements": {
    "minCoverage": 100,
    "requireHumanCertification": true,
    "certificationTtlDays": 90
  }
}
```

### 5.3 New API Endpoints

#### `POST /api/v1/agents/{id}/validate`

Dry-run validation of all declared tools against current policies. Does **not** change agent status.

**Request:**
```json
POST /api/v1/agents/agt_abc123/validate
X-API-Key: ag_live_...
Content-Type: application/json

{
  "includeRecommendations": true,
  "verbose": false
}
```

**Response:**
```json
{
  "agentId": "agt_abc123",
  "agentName": "customer-service-bot",
  "validatedAt": "2026-03-03T01:09:00Z",
  "status": "validated",
  "readinessScore": 66,
  "summary": {
    "totalTools": 3,
    "coveredTools": 2,
    "uncoveredTools": 1,
    "coveragePercent": 66.7
  },
  "tools": [
    {
      "toolName": "search_crm",
      "covered": true,
      "policies": [
        {
          "policyId": "pol_001",
          "ruleId": "allow-crm-read",
          "decision": "allow",
          "severity": "low"
        }
      ]
    },
    {
      "toolName": "send_email",
      "covered": true,
      "policies": [
        {
          "policyId": "pol_002",
          "ruleId": "hitl-email-send",
          "decision": "require_approval",
          "severity": "medium"
        }
      ]
    },
    {
      "toolName": "read_order_history",
      "covered": false,
      "policies": [],
      "severity": "low",
      "recommendation": "Create a policy for 'read_order_history'. Suggested: allow with monitor."
    }
  ],
  "blockers": [
    {
      "toolName": "read_order_history",
      "severity": "low",
      "message": "No policy covers this tool. Create a policy before certification."
    }
  ],
  "canCertify": false,
  "certifyBlockers": ["Tool 'read_order_history' has no policy coverage"]
}
```

**Side effects:**
- Creates a `ValidationRun` record in the database
- If all tools are covered and threshold is met, sets `agent.status = 'validated'`
- If tools are missing coverage, status remains `registered`

---

#### `GET /api/v1/agents/{id}/readiness`

Returns the current deployment readiness state without triggering validation.

**Response:**
```json
{
  "agentId": "agt_abc123",
  "status": "validated",
  "readinessScore": 100,
  "certificationStatus": {
    "certified": false,
    "certifiedAt": null,
    "certifiedBy": null,
    "expiresAt": null,
    "expiredReason": null
  },
  "lastValidation": {
    "runId": "vrun_xyz",
    "validatedAt": "2026-03-03T00:00:00Z",
    "coveragePercent": 100,
    "policySnapshot": "sha256:abc..."
  },
  "policyChanges": {
    "changesSinceValidation": false,
    "changedPolicies": []
  },
  "deploymentGate": {
    "canDeploy": false,
    "reason": "Agent validated but not yet certified. Call POST /agents/{id}/certify."
  },
  "tools": [
    {
      "toolName": "search_crm",
      "covered": true,
      "policyId": "pol_001"
    },
    {
      "toolName": "send_email",
      "covered": true,
      "policyId": "pol_002"
    }
  ]
}
```

---

#### `POST /api/v1/agents/{id}/certify`

Marks an agent as deployment-ready. Requires the agent to be in `validated` state with 100% coverage (or the tenant's configured threshold). Requires `ADMIN` or `OWNER` role.

**Request:**
```json
POST /api/v1/agents/agt_abc123/certify
X-API-Key: ag_live_...
Content-Type: application/json

{
  "certifiedBy": "john.doe@company.com",
  "certificationNote": "Reviewed all policies. Email tool has HITL which is acceptable.",
  "ttlDays": 90
}
```

**Response:**
```json
{
  "agentId": "agt_abc123",
  "status": "certified",
  "certificationId": "cert_xyz789",
  "certifiedAt": "2026-03-03T01:15:00Z",
  "certifiedBy": "john.doe@company.com",
  "expiresAt": "2026-06-01T01:15:00Z",
  "policySnapshotHash": "sha256:abc123...",
  "coverageAtCertification": 100,
  "toolsCovered": 3,
  "auditEventId": "evt_cert_001"
}
```

**Error responses:**

```json
// 409 Conflict — agent not in validated state
{
  "error": "agent_not_validated",
  "message": "Agent must be in 'validated' state before certification. Current state: registered.",
  "currentStatus": "registered",
  "action": "Call POST /agents/{id}/validate first"
}

// 409 Conflict — coverage below threshold
{
  "error": "coverage_below_threshold",
  "message": "Coverage is 67% but certification requires 100%.",
  "coverage": 67,
  "required": 100,
  "uncoveredTools": ["read_order_history"]
}
```

---

### 5.4 Database Schema — Agent Lifecycle Tables

See Section 9 for full schema.

### 5.5 Certification Expiry Daemon

A background worker monitors for certification expiry triggers:

```typescript
// src/workers/certification-expiry.ts

async function checkCertificationExpiry(): Promise<void> {
  // 1. Time-based expiry: certifications past their expiresAt
  const expiredByTime = await db.query(`
    SELECT id, agent_id, expires_at
    FROM agent_certifications
    WHERE status = 'active'
      AND expires_at < NOW()
  `);

  // 2. Policy-change expiry: policies modified since certification
  const expiredByPolicyChange = await db.query(`
    SELECT ac.agent_id, ac.id as cert_id, pv.updated_at
    FROM agent_certifications ac
    JOIN agent_tools at ON at.agent_id = ac.agent_id
    JOIN policy_rule_coverage prc ON prc.tool_name = at.tool_name
    JOIN policy_versions pv ON pv.policy_id = prc.policy_id
    WHERE ac.status = 'active'
      AND pv.updated_at > ac.certified_at
  `);

  // Expire each certification and set agent status to 'registered'
  for (const cert of [...expiredByTime, ...expiredByPolicyChange]) {
    await expireCertification(cert.id, cert.agent_id, 
      expiredByTime.includes(cert) ? 'ttl_expired' : 'policy_changed');
  }
}

// Run every 5 minutes
setInterval(checkCertificationExpiry, 5 * 60 * 1000);
```

---

## 6. Component 4 — MCP Admission Control

### 6.1 Overview

Before an MCP server is allowed to connect to an AgentGuard-protected agent, all tools advertised in its manifest must have policy coverage. This prevents a "policy gap at connection time" — where an MCP server with a dangerous tool connects before the operator has reviewed it.

### 6.2 Admission Flow

```
MCP Client                AgentGuard             MCP Tool Server
    │                         │                        │
    │  Want to connect to      │                        │
    │  MCP server "filesystem" │                        │
    │                         │                        │
    ├── POST /api/v1/mcp/admit ►                        │
    │   { upstreamUrl, agentId }│                       │
    │                         ├── GET /mcp/tools ──────►│
    │                         │◄── { tools: [...] } ────┤
    │                         │                        │
    │                         ├── Check each tool      │
    │                         │   against policies     │
    │                         │                        │
    │    IF ALL COVERED:       │                        │
    │◄── { admitted: true } ───┤                        │
    │                         │                        │
    │    Connect to MCP server │                        │
    ├──────────────────────────────────────────────────►│
    │                         │                        │
    │    IF ANY UNCOVERED:     │                        │
    │◄── { admitted: false,   ─┤                        │
    │     blockedTools: [...] }│                        │
    │                         │                        │
    │    Connection REJECTED   │                        │
    │    (do NOT connect)      │                        │
```

### 6.3 MCP Admission Endpoint

#### `POST /api/v1/mcp/admit`

Pre-flight check before connecting an MCP server.

**Request:**
```json
POST /api/v1/mcp/admit
X-API-Key: ag_live_...
Content-Type: application/json

{
  "agentId": "agt_abc123",

  // Option A: Fetch tools manifest from upstream server
  "upstreamUrl": "http://localhost:4000/mcp",
  "transport": "sse",

  // Option B: Provide tool list directly (for stdio or pre-enumeration)
  "tools": [
    {
      "name": "read_file",
      "description": "Read file contents",
      "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } }
    },
    {
      "name": "write_file",
      "description": "Write content to a file",
      "inputSchema": { "type": "object", "properties": { "path": { "type": "string" }, "content": { "type": "string" } } }
    },
    {
      "name": "bash",
      "description": "Execute a shell command"
    }
  ],

  // Admission policy
  "admissionMode": "strict",     // strict: all tools must be covered; permissive: warn only
  "createSessionOnAdmit": true   // Create MCP session on successful admission
}
```

**Response — Admitted:**
```json
{
  "admitted": true,
  "sessionId": "mcp_sess_xyz",
  "admissionId": "adm_abc123",
  "admittedAt": "2026-03-03T01:09:00Z",
  "toolsChecked": 3,
  "toolsCovered": 3,
  "toolDecisions": [
    {
      "toolName": "read_file",
      "covered": true,
      "decision": "monitor",
      "policyId": "pol_001",
      "ruleId": "monitor-file-reads"
    },
    {
      "toolName": "write_file",
      "covered": true,
      "decision": "block",
      "policyId": "pol_001",
      "ruleId": "block-file-writes"
    },
    {
      "toolName": "bash",
      "covered": true,
      "decision": "block",
      "policyId": "pol_001",
      "ruleId": "block-shell-exec"
    }
  ],
  "message": "All 3 tools have policy coverage. Connection admitted."
}
```

**Response — Rejected:**
```json
{
  "admitted": false,
  "admissionId": "adm_def456",
  "reason": "uncovered_tools",
  "toolsChecked": 3,
  "toolsCovered": 1,
  "blockedTools": [
    {
      "toolName": "write_file",
      "covered": false,
      "severity": "high",
      "message": "No policy covers 'write_file'. Create a policy before connecting this MCP server."
    },
    {
      "toolName": "bash",
      "covered": false,
      "severity": "critical",
      "message": "No policy covers 'bash'. Shell execution is critical risk — explicit block or allow policy required."
    }
  ],
  "recommendation": "Create policies for blocked tools, then retry. Or use --admissionMode=permissive to allow with warnings.",
  "policyTemplateUrl": "https://app.agentguard.tech/policies/templates?filter=mcp-filesystem"
}
```

### 6.4 Extending MCP Middleware for Admission Mode

The existing `McpMiddleware` class in `api/mcp-middleware.ts` is extended with an `admissionMode` flag:

```typescript
// Extension to existing McpMiddleware

export type AdmissionMode = 'strict' | 'permissive' | 'audit';

export interface AdmissionResult {
  admitted: boolean;
  admissionId: string;
  admittedAt: string;
  toolsChecked: number;
  toolsCovered: number;
  blockedTools: AdmissionBlockedTool[];
  toolDecisions: AdmissionToolDecision[];
  sessionId?: string;
}

// New method on McpMiddleware:
async checkAdmission(opts: {
  tenantId: string;
  agentId?: string;
  tools: McpToolManifest[];
  mode: AdmissionMode;
  createSession: boolean;
}): Promise<AdmissionResult> {
  const admissionId = crypto.randomUUID();
  const toolDecisions: AdmissionToolDecision[] = [];
  const blockedTools: AdmissionBlockedTool[] = [];

  for (const tool of opts.tools) {
    const policyCheck = await this.checkToolCoverage(
      opts.tenantId,
      opts.agentId ?? null,
      tool.name,
    );

    toolDecisions.push({
      toolName: tool.name,
      covered: policyCheck.covered,
      decision: policyCheck.decision,
      policyId: policyCheck.policyId,
      ruleId: policyCheck.ruleId,
    });

    if (!policyCheck.covered) {
      blockedTools.push({
        toolName: tool.name,
        covered: false,
        severity: estimateToolSeverity(tool.name),
        message: `No policy covers '${tool.name}'`,
      });
    }
  }

  const admitted = opts.mode === 'permissive' || blockedTools.length === 0;

  // Log admission attempt
  this.writeAdmissionAuditEvent({
    admissionId,
    tenantId: opts.tenantId,
    agentId: opts.agentId,
    admitted,
    toolsChecked: opts.tools.length,
    blockedCount: blockedTools.length,
  });

  let sessionId: string | undefined;
  if (admitted && opts.createSession) {
    const session = this.createSession({ tenantId: opts.tenantId, agentId: opts.agentId });
    sessionId = session.id;
  }

  return {
    admitted,
    admissionId,
    admittedAt: new Date().toISOString(),
    toolsChecked: opts.tools.length,
    toolsCovered: opts.tools.length - blockedTools.length,
    blockedTools,
    toolDecisions,
    sessionId,
  };
}
```

### 6.5 Auto-Admit from MCP Server Manifest

When `upstreamUrl` is provided in the admission request, the API fetches the tool list from the MCP server before evaluating:

```typescript
async fetchMcpToolManifest(upstreamUrl: string): Promise<McpToolManifest[]> {
  // Send MCP tools/list JSON-RPC request
  const request: McpRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  };

  const response = await this.forwardToUpstream(upstreamUrl, request);
  if (response.error) throw new Error(`MCP tools/list failed: ${response.error.message}`);
  
  const result = response.result as { tools: McpToolManifest[] };
  return result.tools ?? [];
}
```

---

## 7. Component 5 — PostgreSQL Migration Plan

### 7.1 Current State

The API server (`api/server.ts`) uses `better-sqlite3` — a synchronous, file-based SQLite library. This is appropriate for the current single-container development deployment but has limitations for production scale:

| Concern | SQLite | PostgreSQL |
|---|---|---|
| Concurrent writes | Single writer — blocks | Full MVCC — unlimited concurrency |
| Connection pooling | N/A (in-process) | Required (PgBouncer) |
| Row-level security | Not supported | Native (ALTER TABLE ... ENABLE ROW LEVEL SECURITY) |
| Full-text search | Limited | pg_tsvector |
| JSON operators | Limited | Full JSONB operators |
| Async API | Synchronous only | Fully async (node-postgres) |
| Horizontal scaling | Cannot scale out | Can scale read replicas |
| Backup/PITR | File copy | pg_dump, WAL archiving |

### 7.2 Migration Strategy

The migration uses a **database abstraction layer** (`db-adapter`) that maintains SQLite for development/test and switches to PostgreSQL in production via an environment variable.

```
DB_PROVIDER=sqlite   → uses better-sqlite3 (synchronous, in-memory or file)
DB_PROVIDER=postgres → uses pg pool (async, connection pooled)
```

#### Adapter Interface

```typescript
// src/db/adapter.ts

export interface DbAdapter {
  // Query interface — returns rows
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;

  // Execute (INSERT, UPDATE, DELETE) — returns affected rows + last insert id
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: string | number }>;

  // Transaction
  transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T>;

  // Schema migration
  migrate(sql: string): Promise<void>;

  // Health check
  health(): Promise<{ ok: boolean; latencyMs: number }>;

  // Graceful shutdown
  close(): Promise<void>;
}

export type DbProvider = 'sqlite' | 'postgres';
```

#### SQLite Adapter (current)

```typescript
// src/db/sqlite-adapter.ts
// Wraps better-sqlite3 synchronous API in async interface
export class SqliteAdapter implements DbAdapter {
  constructor(private db: Database.Database) {}

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...(params ?? [])) as T[];
  }

  async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
    return (this.db.prepare(sql).get(...(params ?? [])) as T | undefined) ?? null;
  }

  async execute(sql: string, params?: unknown[]) {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...(params ?? []));
    return { rowsAffected: info.changes, lastInsertId: info.lastInsertRowid };
  }

  async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    return this.db.transaction(() => fn(this))() as Promise<T>;
  }

  async migrate(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async health() {
    const start = Date.now();
    this.db.prepare('SELECT 1').get();
    return { ok: true, latencyMs: Date.now() - start };
  }

  async close() { this.db.close(); }
}
```

#### PostgreSQL Adapter (target)

```typescript
// src/db/postgres-adapter.ts
import { Pool, PoolClient } from 'pg';

export class PostgresAdapter implements DbAdapter {
  private pool: Pool;

  constructor(connectionString: string, poolSize = 20) {
    this.pool = new Pool({
      connectionString,
      max: poolSize,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
    const result = await this.pool.query(sql, params);
    return (result.rows[0] as T | undefined) ?? null;
  }

  async execute(sql: string, params?: unknown[]) {
    const result = await this.pool.query(sql, params);
    return {
      rowsAffected: result.rowCount ?? 0,
      lastInsertId: result.rows[0]?.id as string | undefined,
    };
  }

  async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txAdapter = new PostgresClientAdapter(client);
      const result = await fn(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async migrate(sql: string) {
    await this.pool.query(sql);
  }

  async health() {
    const start = Date.now();
    await this.pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  }

  async close() { await this.pool.end(); }
}
```

#### Adapter Factory

```typescript
// src/db/index.ts
export function createDbAdapter(): DbAdapter {
  const provider = (process.env['DB_PROVIDER'] ?? 'sqlite') as DbProvider;

  if (provider === 'postgres') {
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('DATABASE_URL required when DB_PROVIDER=postgres');
    return new PostgresAdapter(url);
  }

  // Default: SQLite
  const dbPath = process.env['AG_DB_PATH'] ?? './agentguard.db';
  const db = new Database(dbPath === ':memory:' ? ':memory:' : dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return new SqliteAdapter(db);
}
```

### 7.3 SQL Compatibility Layer

The key challenge is that SQLite and PostgreSQL use different syntax for several operations. The migration strategy uses:

1. **Parameterised queries only** — `?` (SQLite) vs `$1` (PostgreSQL) difference handled by adapter
2. **No SQLite-specific functions** in application code — wrap in adapter methods
3. **RETURNING clause** — supported by both SQLite 3.35+ and PostgreSQL

```typescript
// Adapter handles parameter placeholders:
// SQLite: db.query("SELECT * FROM agents WHERE id = ?", [id])
// PostgreSQL: pool.query("SELECT * FROM agents WHERE id = $1", [id])

// The adapter implementation normalises this:
private normaliseSql(sql: string, params: unknown[]): string {
  if (this.provider === 'postgres') {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }
  return sql;
}
```

### 7.4 PostgreSQL-Specific Schema Enhancements

Once on PostgreSQL, enable security features not available in SQLite:

```sql
-- 1. Row-Level Security (matches ARCHITECTURE.md §6.2 spec)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON agents
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- 2. Append-only audit_events
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- 3. UUID primary keys (vs SQLite hex randomblob)
-- New tables use gen_random_uuid() instead of lower(hex(randomblob(16)))

-- 4. JSONB for tool declarations (better indexing than TEXT JSON)
ALTER TABLE agents ADD COLUMN tools_jsonb JSONB;
CREATE INDEX idx_agents_tools_gin ON agents USING GIN (tools_jsonb);
```

---

## 8. Security Model

### 8.1 How Deployment Enforcement Prevents Bypass

The security model is layered — multiple independent checks must all be satisfied:

```
LAYER 1: Static Analysis (CLI / GitHub Action)
  • Scans source code BEFORE code is merged
  • Cannot be bypassed: required CI check blocks PR merge
  • Even if bypassed: Layers 2-4 catch it

LAYER 2: Agent Registry (API enforcement)
  • Agent status must be 'certified' to be marked 'deployed'
  • Certification requires validation run with 100% coverage
  • API key for deployment operations requires ADMIN role
  • Policy changes automatically expire certification

LAYER 3: MCP Admission Control
  • MCP server cannot connect unless all tools are covered
  • Admission check is synchronous — connection is never established for uncovered tools
  • Admission is logged with full audit trail

LAYER 4: Runtime Enforcement (existing)
  • Even if all other layers are bypassed, every tool call
    is evaluated at runtime against current policies
  • Fail-closed: evaluation error → block
```

### 8.2 Anti-Bypass Measures

| Bypass Attempt | Defense |
|---|---|
| Developer skips CLI locally | CI gate is required; PR cannot merge without passing check |
| Developer disables CI check | Branch protection rules enforce required status checks |
| Developer manually sets agent status to `certified` | `POST /certify` validates coverage at call time; cannot be bypassed |
| Policy is deleted after certification | Certification expiry daemon detects missing coverage and invalidates cert |
| Agent declares minimal tools, uses more at runtime | Runtime evaluation catches undeclared tools; anomaly score spikes |
| MCP server advertises different tools than it actually has | Runtime evaluation catches every actual call |
| Admin API key compromise | API key rotation; audit log shows compromise timing; kill switch available |

### 8.3 Certification Integrity

Each certification stores a `policySnapshotHash` — a SHA-256 hash of all policy rules that cover the agent's tools at certification time. The expiry daemon re-computes this hash periodically and revokes the certification if it has changed.

```typescript
function computePolicySnapshot(
  agentTools: string[],
  policies: PolicyRule[],
): string {
  // Filter to only rules covering agent's tools
  const relevantRules = policies.filter(rule =>
    agentTools.some(tool => ruleMatchesTool(rule, tool))
  );

  // Sort for determinism
  const sorted = relevantRules.sort((a, b) => a.id.localeCompare(b.id));

  // Hash
  const canonical = JSON.stringify(sorted);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
```

---

## 9. Database Schema Additions

### 9.1 New Tables

#### `agent_tools` — Declared tool inventory per agent

```sql
-- SQLite (current)
CREATE TABLE IF NOT EXISTS agent_tools (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tool_name TEXT NOT NULL,
  description TEXT,
  framework TEXT,               -- 'langchain'|'crewai'|'autogen'|'mcp'|'openai'|'raw'
  risk_level TEXT DEFAULT 'medium', -- 'low'|'medium'|'high'|'critical'
  source_file TEXT,             -- file path where tool was detected
  source_line INTEGER,          -- line number
  detection_confidence TEXT DEFAULT 'certain',  -- 'certain'|'probable'|'dynamic'|'inferred'
  declared_at TEXT DEFAULT (datetime('now')),
  UNIQUE(agent_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_tenant ON agent_tools(tenant_id);

-- PostgreSQL version uses gen_random_uuid() and TIMESTAMPTZ
-- CREATE TABLE agent_tools (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
--   tenant_id UUID NOT NULL REFERENCES tenants(id),
--   tool_name TEXT NOT NULL,
--   description TEXT,
--   framework TEXT,
--   risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
--   source_file TEXT,
--   source_line INTEGER,
--   detection_confidence TEXT DEFAULT 'certain',
--   declared_at TIMESTAMPTZ DEFAULT NOW(),
--   UNIQUE(agent_id, tool_name)
-- );
```

---

#### `agent_status_history` — Lifecycle state transitions

```sql
CREATE TABLE IF NOT EXISTS agent_status_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  tenant_id TEXT NOT NULL,
  from_status TEXT,             -- previous status (NULL for initial registration)
  to_status TEXT NOT NULL,      -- 'registered'|'validated'|'certified'|'deployed'|'quarantined'
  reason TEXT,                  -- human-readable reason for transition
  triggered_by TEXT,            -- 'user'|'system'|'policy_change'|'ttl_expiry'|'kill_switch'
  actor_id TEXT,                -- user ID if triggered by user, null if system
  metadata TEXT DEFAULT '{}',   -- JSON: additional context
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_status_agent ON agent_status_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_status_tenant ON agent_status_history(tenant_id, created_at);
```

---

#### `validation_runs` — History of validate calls

```sql
CREATE TABLE IF NOT EXISTS validation_runs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  tenant_id TEXT NOT NULL,
  triggered_by TEXT NOT NULL,   -- 'cli'|'github_action'|'api'|'scheduled'
  actor TEXT,                   -- user ID or CI job name
  status TEXT NOT NULL,         -- 'pass'|'fail'|'error'
  coverage_percent REAL NOT NULL,
  total_tools INTEGER NOT NULL,
  covered_tools INTEGER NOT NULL,
  uncovered_tools INTEGER NOT NULL,
  readiness_score INTEGER NOT NULL,
  policy_snapshot_hash TEXT,    -- SHA-256 of all relevant policy rules at validation time
  report_json TEXT,             -- Full JSON report (stored for audit trail)
  duration_ms REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_validation_runs_agent ON validation_runs(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_validation_runs_tenant ON validation_runs(tenant_id, created_at);
```

---

#### `agent_certifications` — Certification records

```sql
CREATE TABLE IF NOT EXISTS agent_certifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  tenant_id TEXT NOT NULL,
  validation_run_id TEXT NOT NULL REFERENCES validation_runs(id),
  certified_by TEXT NOT NULL,   -- user ID or email
  certification_note TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active'|'expired'|'revoked'
  coverage_at_certification REAL NOT NULL,
  policy_snapshot_hash TEXT NOT NULL,   -- used to detect policy changes after cert
  certified_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,              -- NULL = no expiry, otherwise ISO timestamp
  expired_at TEXT,              -- when it was actually expired (may differ from expires_at)
  expiry_reason TEXT,           -- 'ttl_expired'|'policy_changed'|'revoked'|'tool_added'
  revoked_by TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_certifications_agent ON agent_certifications(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_certifications_expires ON agent_certifications(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_certifications_tenant ON agent_certifications(tenant_id);
```

---

#### `mcp_admission_events` — Admission control audit trail

```sql
CREATE TABLE IF NOT EXISTS mcp_admission_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id),
  upstream_url TEXT,
  admission_mode TEXT NOT NULL DEFAULT 'strict',
  admitted INTEGER NOT NULL,    -- 0 = rejected, 1 = admitted
  tools_checked INTEGER NOT NULL DEFAULT 0,
  tools_covered INTEGER NOT NULL DEFAULT 0,
  blocked_tools TEXT,           -- JSON array of blocked tool names
  tool_decisions TEXT,          -- JSON array of per-tool decisions
  session_id TEXT,              -- MCP session created on admission (if any)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mcp_admission_tenant ON mcp_admission_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_admission_agent ON mcp_admission_events(agent_id);
```

---

#### `coverage_checks` — CLI/API tool coverage lookups (cached)

```sql
CREATE TABLE IF NOT EXISTS coverage_checks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id),
  tool_name TEXT NOT NULL,
  covered INTEGER NOT NULL,     -- 0 = uncovered, 1 = covered
  policy_id TEXT,               -- matching policy (if covered)
  rule_id TEXT,                 -- matching rule (if covered)
  decision TEXT,                -- decision if covered
  severity TEXT,                -- severity of uncovered tool
  checked_at TEXT DEFAULT (datetime('now')),
  cache_ttl_seconds INTEGER DEFAULT 300  -- cache result for 5 minutes
);

CREATE INDEX IF NOT EXISTS idx_coverage_tenant_tool ON coverage_checks(tenant_id, tool_name, checked_at);
```

---

### 9.2 Modified Tables

#### Add status lifecycle to `agents`

```sql
-- Add lifecycle status column to existing agents table
-- (Migration-safe: add if not exists)
ALTER TABLE agents ADD COLUMN status TEXT DEFAULT 'registered';
-- status values: 'registered' | 'validated' | 'certified' | 'deployed' | 'quarantined' | 'deactivated'

ALTER TABLE agents ADD COLUMN certification_id TEXT REFERENCES agent_certifications(id);
ALTER TABLE agents ADD COLUMN last_validated_at TEXT;
ALTER TABLE agents ADD COLUMN last_certified_at TEXT;
ALTER TABLE agents ADD COLUMN deployment_threshold INTEGER DEFAULT 80;
-- deployment_threshold: minimum coverage % required for certification

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(tenant_id, status);
```

---

## 10. API Endpoint Specifications

### 10.1 Coverage Check Endpoint

#### `POST /api/v1/agents/coverage-check`

Check policy coverage for a list of tools without requiring a registered agent. Used by the CLI.

**Request:**
```json
{
  "tools": [
    { "name": "search_web", "framework": "langchain" },
    { "name": "send_email", "framework": "langchain" },
    { "name": "raw:shell", "framework": "raw" }
  ],
  "agentId": "agt_abc123",    // optional — scope to agent's policies
  "includeSuggestions": true
}
```

**Response:**
```json
{
  "tenantId": "tenant_xyz",
  "checkedAt": "2026-03-03T01:09:00Z",
  "totalTools": 3,
  "coveredTools": 2,
  "uncoveredTools": 1,
  "coveragePercent": 66.7,
  "results": [
    {
      "toolName": "search_web",
      "covered": true,
      "policies": [{ "policyId": "pol_001", "ruleId": "monitor-search", "decision": "monitor" }]
    },
    {
      "toolName": "send_email",
      "covered": true,
      "policies": [{ "policyId": "pol_002", "ruleId": "hitl-email", "decision": "require_approval" }]
    },
    {
      "toolName": "raw:shell",
      "covered": false,
      "policies": [],
      "severity": "critical",
      "suggestion": "Create a policy blocking shell access: { when: [{ tool: { in: ['raw:shell'] } }], action: 'block', severity: 'critical' }"
    }
  ]
}
```

---

### 10.2 Deployment Gate Check

#### `GET /api/v1/agents/{id}/deployment-gate`

Check whether an agent can be deployed right now. Used by deployment pipelines.

**Response:**
```json
{
  "agentId": "agt_abc123",
  "canDeploy": false,
  "status": "validated",
  "blockers": [
    {
      "type": "not_certified",
      "message": "Agent is validated but not yet certified. A human must approve certification.",
      "action": "POST /api/v1/agents/agt_abc123/certify"
    }
  ],
  "certificationStatus": {
    "certified": false,
    "certifiedAt": null,
    "expiresAt": null
  },
  "readinessScore": 100,
  "coveragePercent": 100
}
```

---

### 10.3 Updated Agent Schema

```json
// Agent object (updated with lifecycle fields)
{
  "id": "agt_abc123",
  "tenantId": "tenant_xyz",
  "name": "customer-service-bot",
  "description": "...",
  "status": "certified",              // NEW: registered | validated | certified | deployed
  "apiKeyPrefix": "ag_agent_a1",
  "policyScopeIds": ["pol_001", "pol_002"],

  "tools": [                          // NEW: declared tools
    {
      "name": "search_crm",
      "framework": "langchain",
      "riskLevel": "low"
    }
  ],

  "readinessScore": 100,              // NEW: 0-100
  "coveragePercent": 100,             // NEW: 0-100
  "lastValidatedAt": "2026-03-03T00:00:00Z",  // NEW
  "lastCertifiedAt": "2026-03-03T01:00:00Z",  // NEW
  "certificationId": "cert_xyz",               // NEW
  "certificationExpiresAt": "2026-06-01T01:00:00Z",  // NEW
  "deploymentThreshold": 100,         // NEW: min coverage required

  "active": true,
  "createdAt": "2026-01-15T00:00:00Z"
}
```

---

### 10.4 Complete Endpoint Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/agents` | Tenant | Register agent (existing — extended with `tools[]`) |
| `GET` | `/api/v1/agents` | Tenant | List agents (existing — now includes lifecycle status) |
| `GET` | `/api/v1/agents/{id}` | Tenant | Get agent (existing — extended) |
| `PUT` | `/api/v1/agents/{id}` | Tenant | Update agent (existing) |
| `DELETE` | `/api/v1/agents/{id}` | Tenant | Deactivate agent (existing) |
| **`POST`** | **`/api/v1/agents/{id}/validate`** | Tenant | **NEW: Dry-run validation** |
| **`GET`** | **`/api/v1/agents/{id}/readiness`** | Tenant | **NEW: Readiness check** |
| **`POST`** | **`/api/v1/agents/{id}/certify`** | Admin | **NEW: Mark as deployment-ready** |
| **`GET`** | **`/api/v1/agents/{id}/deployment-gate`** | Tenant | **NEW: Deployment gate check** |
| **`GET`** | **`/api/v1/agents/{id}/certifications`** | Tenant | **NEW: Certification history** |
| **`POST`** | **`/api/v1/agents/coverage-check`** | Tenant | **NEW: Tool coverage check (CLI)** |
| **`POST`** | **`/api/v1/mcp/admit`** | Tenant | **NEW: MCP admission pre-flight** |

---

## 11. Sequence Diagrams

### 11.1 CI/CD Validation Flow (GitHub Action)

```
Developer       GitHub          AgentGuard CLI        AgentGuard API
    │               │                  │                     │
    ├── git push ──►│                  │                     │
    │               │                  │                     │
    │           PR opened              │                     │
    │               ├── trigger ───────►                     │
    │               │       CI workflow │                     │
    │               │                  │                     │
    │               │         Checkout code                  │
    │               │                  │                     │
    │               │         agentguard validate ./         │
    │               │                  │                     │
    │               │                  ├── Scan files        │
    │               │                  │   (AST analysis)    │
    │               │                  │                     │
    │               │                  │   Detect tools:     │
    │               │                  │   - search_crm ✓   │
    │               │                  │   - send_email ✓   │
    │               │                  │   - raw:shell ⚠️   │
    │               │                  │                     │
    │               │                  ├─ POST /agents/coverage-check ─►
    │               │                  │                     │
    │               │                  │                     ├── Query policies
    │               │                  │                     │   for each tool
    │               │                  │◄── Coverage report ─┤
    │               │                  │                     │
    │               │                  │   Score: 67%        │
    │               │                  │   Threshold: 85%    │
    │               │                  │   Status: FAIL      │
    │               │                  │                     │
    │               │◄─ exit code 1 ───┤                     │
    │               │                  │                     │
    │           Post PR comment                              │
    │           (coverage report)                           │
    │               │                  │                     │
    │           Block merge            │                     │
    │               │                  │                     │
    │◄── PR blocked ┤                  │                     │
    │               │                  │                     │
    ├── Create policy for raw:shell    │                     │
    │               │                  │                     │
    ├── git push ──►│                  │                     │
    │               │                  │                     │
    │           CI re-runs             │                     │
    │               ├── trigger ───────►                     │
    │               │                  ├─ POST /agents/coverage-check ─►
    │               │                  │◄── Coverage: 100% ──┤
    │               │                  │   Status: PASS      │
    │               │◄─ exit code 0 ───┤                     │
    │               │                  │                     │
    │           Update PR comment ✅   │                     │
    │           Merge unblocked        │                     │
```

---

### 11.2 Agent Certification Flow

```
Engineer        AgentGuard API         Database           Policy Engine
    │                  │                   │                    │
    │   POST /agents   │                   │                    │
    ├─────────────────►│                   │                    │
    │   { name, tools }│                   │                    │
    │                  ├── INSERT agents ──►                    │
    │                  │   status='registered'                  │
    │◄── { agent: {    │                   │                    │
    │     status: 'registered' } }         │                    │
    │                  │                   │                    │
    │                  │                   │                    │
    │   POST /agents/{id}/validate         │                    │
    ├─────────────────►│                   │                    │
    │                  │                   │                    │
    │                  │   For each declared tool:              │
    │                  ├──────────────────────────────────────►│
    │                  │   evaluate tool against policies       │
    │                  │◄── policy decisions ───────────────────┤
    │                  │                   │                    │
    │                  ├── INSERT validation_run ──►            │
    │                  │   coverage=100%               │        │
    │                  │                               │        │
    │                  ├── UPDATE agents ──────────────►        │
    │                  │   status='validated'          │        │
    │                  │   last_validated_at=now()     │        │
    │                  │                   │                    │
    │◄── { status: 'validated',            │                    │
    │     readinessScore: 100 }            │                    │
    │                  │                   │                    │
    │                  │                   │                    │
    │   POST /agents/{id}/certify          │                    │
    ├─────────────────►│                   │                    │
    │   { certifiedBy, note }             │                    │
    │                  │                   │                    │
    │                  ├── Verify status=='validated' ─────────►│
    │                  ├── Verify coverage >= threshold ───────►│
    │                  ├── computePolicySnapshot() ─────────────►│
    │                  │◄── snapshotHash ────────────────────────┤
    │                  │                   │                    │
    │                  ├── INSERT certifications ──►            │
    │                  │   status='active'             │        │
    │                  │   snapshot_hash=hash          │        │
    │                  │                               │        │
    │                  ├── UPDATE agents ──────────────►        │
    │                  │   status='certified'          │        │
    │                  │   last_certified_at=now()     │        │
    │                  │                               │        │
    │                  ├── INSERT audit_event ─────────►        │
    │                  │   type='AGENT_CERTIFIED'      │        │
    │                  │                   │                    │
    │◄── { certificationId,                │                    │
    │     expiresAt,                       │                    │
    │     status: 'certified' }            │                    │
```

---

### 11.3 MCP Admission Control Flow

```
Agent SDK          AgentGuard API      MCP Tool Server     Policy Engine
    │                    │                    │                   │
    │   Want to connect  │                    │                   │
    │   to "filesystem"  │                    │                   │
    │   MCP server       │                    │                   │
    │                    │                    │                   │
    │  POST /mcp/admit   │                    │                   │
    ├───────────────────►│                    │                   │
    │  { upstreamUrl,    │                    │                   │
    │    agentId }       │                    │                   │
    │                    │   GET tools/list   │                   │
    │                    ├───────────────────►│                   │
    │                    │◄── [read_file,     │                   │
    │                    │    write_file,     │                   │
    │                    │    bash]           │                   │
    │                    │                    │                   │
    │                    │   Check each tool  │                   │
    │                    ├───────────────────────────────────────►│
    │                    │   read_file → monitor ✅               │
    │                    │   write_file → block ✅                │
    │                    │   bash → block ✅                      │
    │                    │◄── all covered ────────────────────────┤
    │                    │                    │                   │
    │                    ├── INSERT mcp_admission_events          │
    │                    │   admitted=true    │                   │
    │                    │   session_id=xxx   │                   │
    │                    │                    │                   │
    │◄── { admitted: true│                    │                   │
    │     sessionId: xxx }│                   │                   │
    │                    │                    │                   │
    │   Connect to MCP server (with sessionId)                   │
    ├───────────────────────────────────────►│                   │
    │                    │                    │                   │
    │   Runtime tool calls now enforced via existing MCP middleware
```

---

### 11.4 Certification Expiry on Policy Change

```
Policy Service    Cert Expiry Daemon    Database           Notification
    │                    │                 │                    │
    │ Policy modified    │                 │                    │
    │ (new rule added    │                 │                    │
    │  for send_email)   │                 │                    │
    │                    │                 │                    │
    ├── UPDATE policies ──────────────────►│                    │
    │   updated_at=now() │                 │                    │
    │                    │                 │                    │
    │                    │  [daemon tick - every 5 min]        │
    │                    │                 │                    │
    │                    ├── SELECT certs where policy newer ──►│
    │                    │◄── [cert_xyz (agent: sales-bot)] ───┤
    │                    │                 │                    │
    │                    │   Recompute policy snapshot          │
    │                    │   Old hash: abc123                   │
    │                    │   New hash: def456 ← CHANGED        │
    │                    │                 │                    │
    │                    ├── UPDATE certifications ────────────►│
    │                    │   status='expired'          │        │
    │                    │   expiry_reason='policy_changed'     │
    │                    │                             │        │
    │                    ├── UPDATE agents ────────────►        │
    │                    │   status='registered'       │        │
    │                    │   (cert invalidated)        │        │
    │                    │                             │        │
    │                    ├── INSERT audit_event ────────►       │
    │                    │   type='CERTIFICATION_EXPIRED'       │
    │                    │                             │        │
    │                    │   Notify tenant ────────────────────►│
    │                    │   "Agent sales-bot needs re-validation"
```

---

## 12. Migration Strategy (Phased Rollout)

### Phase A — Infrastructure (Week 1–2)

*Goal: Foundational pieces in place; no user-facing changes.*

| Task | Description | Effort |
|------|-------------|--------|
| Add `agent_tools` table | Schema migration, backward-safe | 0.5 days |
| Add `validation_runs` table | Schema migration | 0.5 days |
| Add `agent_certifications` table | Schema migration | 0.5 days |
| Add `agent_status_history` table | Schema migration | 0.5 days |
| Add `mcp_admission_events` table | Schema migration | 0.5 days |
| Extend `agents` table | Add status, lifecycle columns | 0.5 days |
| `POST /api/v1/agents` — accept `tools[]` field | Additive, backward-compatible | 1 day |
| DB adapter layer skeleton | `DbAdapter` interface + `SqliteAdapter` | 2 days |

**Deliverable:** Schema ready; agent registration accepts tool declarations; no status enforcement yet.

---

### Phase B — Coverage Engine (Week 3–4)

*Goal: Coverage checking works end-to-end; CLI runnable.*

| Task | Description | Effort |
|------|-------------|--------|
| `POST /api/v1/agents/coverage-check` | Tool coverage query endpoint | 2 days |
| `GET /api/v1/agents/{id}/readiness` | Readiness status endpoint | 1 day |
| `POST /api/v1/agents/{id}/validate` | Validation run endpoint | 3 days |
| Coverage matching engine | Policy rule → tool name matching (glob, regex, exact) | 3 days |
| Policy snapshot computation | SHA-256 hash of relevant rules | 1 day |

**Deliverable:** API coverage checking works; validation runs recorded.

---

### Phase C — CLI (Week 5–6)

*Goal: `agentguard validate` command works; developers can use it locally.*

| Task | Description | Effort |
|------|-------------|--------|
| CLI skeleton (npm package) | Arg parsing, config loading | 2 days |
| Tool detection: LangChain | Python AST parser for LangChain patterns | 3 days |
| Tool detection: MCP | TypeScript/Python MCP call patterns | 2 days |
| Tool detection: raw HTTP/shell | High-risk pattern detection | 1 day |
| Tool detection: CrewAI/AutoGen | Pattern matching | 2 days |
| Coverage report rendering | Text and JSON output modes | 1 day |
| `.agentguard.yaml` config file | Config loading and merging | 1 day |

**Deliverable:** CLI works for LangChain and MCP projects; JSON output usable in CI.

---

### Phase D — GitHub Action (Week 7)

*Goal: One-click CI integration for any repo.*

| Task | Description | Effort |
|------|-------------|--------|
| Action YAML definition | Inputs, outputs, composite action | 1 day |
| PR comment renderer | Markdown comment generation | 1 day |
| Output extraction (jq) | Parse CLI JSON output to action outputs | 0.5 days |
| Coverage delta tracking | Compare to base branch | 1 day |
| Test against example repos | Validate with real LangChain projects | 1 day |

**Deliverable:** `agentguard-tech/validate@v1` available on GitHub Marketplace.

---

### Phase E — Certification Enforcement (Week 8–9)

*Goal: Full lifecycle enforcement; agents cannot be marked deployed without certification.*

| Task | Description | Effort |
|------|-------------|--------|
| `POST /api/v1/agents/{id}/certify` | Certification endpoint | 2 days |
| Certification expiry daemon | Background worker checking policy changes | 2 days |
| `GET /api/v1/agents/{id}/deployment-gate` | Deployment gate endpoint | 1 day |
| Certification history endpoint | `GET /api/v1/agents/{id}/certifications` | 0.5 days |
| Dashboard integration | Show certification status in agent list | 2 days |
| Audit logging for lifecycle events | All status transitions logged | 1 day |

**Deliverable:** Complete agent lifecycle with automated expiry; deployment gate API ready.

---

### Phase F — MCP Admission Control (Week 10)

*Goal: MCP servers cannot connect with uncovered tools.*

| Task | Description | Effort |
|------|-------------|--------|
| `POST /api/v1/mcp/admit` endpoint | Admission pre-flight check | 2 days |
| `McpMiddleware.checkAdmission()` | Core admission logic | 1 day |
| Auto-fetch MCP tool manifest | `tools/list` JSON-RPC fetch | 1 day |
| Admission audit events | Full audit trail | 0.5 days |
| SDK integration | `mcp.admit()` in Python and TS SDKs | 2 days |

**Deliverable:** MCP admission control fully operational.

---

### Phase G — PostgreSQL Migration (Week 11–12)

*Goal: Production database on PostgreSQL; SQLite retained for dev/test.*

| Task | Description | Effort |
|------|-------------|--------|
| `PostgresAdapter` implementation | Full `pg` pool implementation | 3 days |
| Parameter normalisation (`?` → `$1`) | SQL dialect compatibility | 1 day |
| Migration scripts for all tables | Convert SQLite schema to PostgreSQL | 2 days |
| RLS policies (PostgreSQL) | Row-level security per tenant | 1 day |
| Append-only trigger | Audit events immutability | 0.5 days |
| Connection pool tuning | PgBouncer config, pool sizing | 1 day |
| Staging environment migration | Test run with real data | 1 day |
| Production cutover | Blue-green deployment | 1 day |

**Deliverable:** Production on PostgreSQL; SQLite path still works for `DB_PROVIDER=sqlite`.

---

## 13. Effort Estimates

### Component Summary

| Component | Engineering Effort | Risk |
|-----------|-------------------|------|
| CLI — Tool Detection Engine | 8 days | Medium |
| CLI — Coverage Report + Config | 3 days | Low |
| CLI — Package Distribution | 1 day | Low |
| GitHub Action | 4.5 days | Low |
| Agent Registry — Schema | 3.5 days | Low |
| Agent Registry — Coverage Engine | 5 days | Medium |
| Agent Registry — Certification | 4.5 days | Low |
| Agent Registry — Expiry Daemon | 2 days | Low |
| MCP Admission Control | 5.5 days | Low |
| PostgreSQL Migration | 10.5 days | High |
| Dashboard updates | 3 days | Low |
| Documentation | 3 days | Low |
| **TOTAL** | **~54 person-days** | — |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tool detection misses framework patterns | Medium | High | Comprehensive test suite; fallback to `--verbose` for manual review |
| False positives (flagging safe tools) | Medium | Medium | Confidence levels; `allowedUncovered` config to suppress |
| PostgreSQL migration data loss | Low | Critical | Blue-green deploy; full backup before cutover; rollback plan |
| CI latency too high for large repos | Low | Medium | Scan only changed files via `git diff`; cache tool detection results |
| Certification bypass via API | Very Low | High | Certification endpoint enforces coverage check server-side; cannot be skipped |

### Milestones and Timeline

```
Week 1–2   [Phase A] Schema + infrastructure
Week 3–4   [Phase B] Coverage engine
Week 5–6   [Phase C] CLI
Week 7     [Phase D] GitHub Action
Week 8–9   [Phase E] Certification enforcement
Week 10    [Phase F] MCP admission
Week 11–12 [Phase G] PostgreSQL migration

Total: 12 weeks (3 months) with 1–2 engineers
```

---

## 14. Appendix

### 14.1 Policy Rule → Tool Name Matching Logic

A policy rule matches a tool when any of the following match the tool name:

```typescript
function ruleMatchesTool(rule: PolicyRule, toolName: string): boolean {
  const conditions = rule.when ?? [];

  for (const condition of conditions) {
    if (!condition.tool) continue;

    const toolCondition = condition.tool;

    // Exact match
    if (toolCondition.in && toolCondition.in.includes(toolName)) return true;

    // Glob match (e.g. "write_*", "file:*")
    if (toolCondition.matches) {
      const pattern = toolCondition.matches.replace(/\*/g, '.*');
      if (new RegExp(`^${pattern}$`).test(toolName)) return true;
    }

    // Regex match
    if (toolCondition.regex) {
      if (new RegExp(toolCondition.regex).test(toolName)) return true;
    }

    // "not_in" is exclusion — doesn't count as "covering" a tool
    // (A rule saying "not send_email" doesn't cover send_email)
  }

  return false;
}
```

### 14.2 Deployment Readiness Score Calculation

```
readinessScore = floor(
  (coveredTools / totalTools) × 100
  × lifcycleMultiplier
  × certificationBonus
)

Where:
  lifecycleMultiplier:
    registered  → 0.5 (penalty for not validated)
    validated   → 0.8 (validated but not certified)
    certified   → 1.0 (full weight)
    deployed    → 1.0

  certificationBonus:
    Active cert + cert < 30 days old  → +5 points
    Active cert + cert < 90 days old  → +0 points
    Active cert + cert > 90 days old  → -5 points
    No certification                  → +0 points

  Maximum possible score: 100
  Minimum: 0
```

**Example:**
- 6/6 tools covered (100%) × certified (1.0) × fresh cert (+5) = 100 (capped)
- 4/6 tools covered (67%) × validated (0.8) × no cert (+0) = 54
- 3/3 tools covered (100%) × registered (0.5) × no cert (+0) = 50

### 14.3 Tool Severity Estimation (for uncovered tools)

When a tool has no policy, the CLI assigns a default severity for prioritisation:

| Pattern | Default Severity |
|---------|-----------------|
| `raw:shell`, `bash`, `sh`, `exec`, `eval` | critical |
| `raw:http`, `httpx`, `requests.post` | high |
| `write_*`, `delete_*`, `drop_*`, `remove_*` | high |
| `send_*`, `email_*`, `sms_*`, `notify_*` | medium |
| `read_*`, `search_*`, `list_*`, `get_*` | low |
| Everything else | medium |

### 14.4 GitHub Action Marketplace Metadata

```yaml
# action.yml branding
branding:
  icon: 'shield'
  color: 'blue'

# keywords for discoverability
topics:
  - ai-security
  - llm
  - agent-security
  - policy-enforcement
  - devsecops
  - langchain
  - mcp
  - crewai
```

### 14.5 Relationship to Existing Architecture Documents

| This Document | Source Document |
|---------------|----------------|
| CLI tool detection patterns | ROADMAP.md Phase 3 — MCP security, supply chain security |
| Agent lifecycle states | IMPLEMENTATION_PLAN.md §1.3 Agent Identity & Scoping |
| MCP admission control | IMPLEMENTATION_PLAN.md §3.1 MCP Middleware |
| PostgreSQL migration | ROADMAP.md Decision 2 (Prisma + PostgreSQL target) |
| Policy coverage engine | ROADMAP.md Sprint 3 — PolicyService, PolicyCompiler |
| Certification audit trail | ROADMAP.md Sprint 5 — Audit Service, Hash Chain |

### 14.6 Open Questions for Engineering Review

| Question | Owner | Priority |
|----------|-------|----------|
| Should `agentguard validate` support incremental scans (only changed files)? | Engineering | Medium |
| What is the maximum file size / repo size before scan performance degrades? | Engineering | Medium |
| Should certification be tenant-level config or per-agent? (Current design: per-agent) | Product | High |
| Does the expiry daemon need to run more frequently than 5 minutes for fast-moving teams? | Product | Low |
| Should MCP admission be optional or mandatory once enabled? | Product | High |
| PostgreSQL: use Prisma ORM (as per ROADMAP Decision 2) or the raw pg adapter described here? | CTO | High — depends on whether we're aligning with the Prisma roadmap or maintaining Express/Express-compat |

---

*Document version: 1.0 — March 2026*  
*Owner: Solutions Architecture*  
*Classification: Confidential — AgentGuard Internal*  
*Next review: After Engineering Review (target: Week 1 of implementation)*
