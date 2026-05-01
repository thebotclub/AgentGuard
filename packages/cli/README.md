# @the-bot-club/agentguard-cli

> **AgentGuard CLI** — scan AI agent source code for tool usage and validate policy coverage before deploying.

[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## Overview

The AgentGuard CLI analyses your agent's source code, detects every tool it uses
(`file_read`, `shell_exec`, `http_request`, etc.), and validates them against your
AgentGuard policy rules. It surfaces uncovered tools and gives you a risk score —
before the agent ever reaches production.

Use the same command locally and in CI so policy coverage checks are consistent
before deployment.

---

## Installation

```bash
# From the repo root (workspace install)
npm install

# Or install globally
npm install -g @the-bot-club/agentguard-cli
```

### Development (run directly from source)

```bash
cd packages/cli
npm install
npm run build          # Compiles TypeScript to dist/
node dist/cli.js --help
```

---

## Quick start

```bash
# Local scan only (no API key required)
npx -y @the-bot-club/agentguard-cli validate .

# With policy coverage check
AGENTGUARD_API_KEY=ag_live_xxx npx -y @the-bot-club/agentguard-cli validate .

# Or pass the key explicitly
agentguard validate ./src --api-key ag_live_xxx
```

---

## Commands

### `agentguard validate [directory]`

Scan a directory for agent tool usage and check policy coverage.

```
Arguments:
  directory               Directory to scan (default: current directory)

Options:
  -k, --api-key <key>     AgentGuard API key (env: AGENTGUARD_API_KEY)
  -u, --api-url <url>     AgentGuard API URL (default: https://api.agentguard.tech)
  -t, --threshold <n>     Minimum coverage % required to pass (default: 100)
  -f, --format <fmt>      Output format: table | json | summary (default: table)
  --fail-on-uncovered     Fail if any tool has no matching policy rule (default: true)
  --no-fail-on-uncovered  Disable fail-on-uncovered
  -e, --exclude <dirs...> Additional directories to skip
  --verbose               Show files scanned and tool hit locations
```

**Example — table output:**

```
Scanning: /home/user/myagent ...
Checking coverage via AgentGuard API (https://api.agentguard.tech) ...

AgentGuard Policy Coverage Report
══════════════════════════════════════════════════

  Tool                  Policy           Risk       Status
  ─────────────────────────────────────────────────────────
  file_read             monitor          low        ✅ covered
  file_write            block            high       ✅ covered
  shell_exec            block            critical   ✅ covered
  http_request          —                unknown    ❌ uncovered

  Coverage: 75% (3/4 tools)
  Risk Score: 850/1000

  ❌ FAIL — 1 uncovered tool(s). Add policies before deploying.
```

**Example — JSON output:**

```json
{
  "coverage": 75,
  "total": 4,
  "covered": 3,
  "uncovered": ["http_request"],
  "riskScore": 850,
  "passed": false,
  "tools": [
    { "tool": "file_read", "decision": "monitor", "ruleId": "rule-1", "riskScore": 200, "reason": null },
    { "tool": "http_request", "decision": "uncovered", "ruleId": null, "riskScore": 0, "reason": null }
  ]
}
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0`  | Passed (or local-only scan with no API key) |
| `1`  | Failed (coverage below threshold or uncovered tools) |
| `2`  | Fatal error (bad directory, parse error, etc.) |

---

### `agentguard status`

Check API connectivity and tenant info.

```bash
agentguard status --api-key ag_live_xxx
```

```
AgentGuard Status
════════════════════════════════════════
  Pinging API ...   ✅ reachable (42ms)
  API URL:          https://api.agentguard.tech
  API Key:          set (ag_live_x...)
  Tenant info ...   ✅ authenticated
  plan              "pro"
  agentCount        3
```

---

### `agentguard init`

Create a `.agentguard.yml` config file in the current directory.

```bash
agentguard init
```

Generated file:

```yaml
# .agentguard.yml — AgentGuard CLI configuration
api_url: https://api.agentguard.tech
# api_key: ag_live_xxx   # Use AGENTGUARD_API_KEY env var instead

threshold: 100
fail_on_uncovered: true

scan_patterns:
  - "**/*.ts"
  - "**/*.py"
  - "**/*.js"

exclude:
  - node_modules
  - .git
  - dist
  - build
  - coverage
```

---

## Configuration

The CLI loads `.agentguard.yml` from the current working directory and merges it
with CLI flags. **Flags take precedence** over config file values, which take
precedence over defaults.

| Source | Priority |
|--------|----------|
| CLI flags | Highest |
| `AGENTGUARD_API_KEY` env var | High |
| `.agentguard.yml` | Medium |
| Built-in defaults | Lowest |

---

## Scanner

The scanner detects tool usage by looking for well-known tool name patterns in
`.ts`, `.js`, `.py`, `.yaml`, `.yml`, and `.json` files:

- **Generic literals** — `"file_read"`, `'shell_exec'`, etc.
- **AgentGuard SDK** — `tool: "send_email"`
- **LangChain** — `@tool` decorators, `Tool(name="...")`, `StructuredTool(name="...")`
- **OpenAI function-calling** — `{ name: "tool_name" }` in `functions`/`tools` arrays
- **MCP schema** — `"name": "tool_name"` in JSON/YAML tool descriptors
- **Python decorators** — `@tool\ndef tool_name(`

Tool names must be `snake_case` or `kebab-case` with at least one separator
character (e.g. `file_read`, `http-post`) to be accepted — short words like `get`
or `set` are filtered out to minimise false positives.

Directories skipped by default: `node_modules`, `.git`, `dist`, `build`, `coverage`,
`__pycache__`, `.venv`, `.github`, `.next`, `.nuxt`.

---

## API Integration

Without an `--api-key`, the CLI performs a **local-only scan** — it lists every
detected tool but cannot check coverage. Exit code is always `0` in this mode.

With an API key, the CLI calls:

```
POST /api/v1/mcp/admit
X-API-Key: <key>
Content-Type: application/json

{
  "serverUrl": "agentguard-cli-scan",
  "tools": [{ "name": "file_read" }, { "name": "shell_exec" }, ...]
}
```

This is the same endpoint used by the GitHub Action, so results are consistent
across local development, CI/CD, and the AgentGuard dashboard.

---

## Development

```bash
# Install deps
npm install

# Build
npm run build

# Run tests (16 unit + smoke tests)
npm test

# Type-check only (no emit)
npm run typecheck
```

---

## License

Business Source License 1.1 © The Bot Club Pty Ltd
