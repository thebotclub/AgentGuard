# OpenClaw Integration

Add AgentGuard to any OpenClaw agent in minutes. Every tool call is evaluated against your security policy before execution — no manual wrapping required.

## How It Works

AgentGuard registers a `before_tool_call` plugin hook inside the OpenClaw gateway. When a tool is about to run, the hook calls the AgentGuard API, evaluates the call against your YAML policy, and either allows it through or blocks it.

```
OpenClaw Agent
    │ tool invocation
    ▼
AgentGuard before_tool_call hook (priority 100)
    │
    ▼
POST /v1/openclaw/intercept → AgentGuard Policy Engine
    │
    ├── allow / monitor  → { return undefined }   ← tool runs
    ├── block            → { block: true, blockReason }
    └── hitl             → { block: true, blockReason: '{"status":"hitl_pending",...}' }
```

## Installation

### Option A — OpenClaw Plugin (TypeScript / Node.js agents)

Install the plugin package into your OpenClaw agent project:

```bash
npm install @the-bot-club/agentguard-openclaw
```

Then register it in your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "agentguard": {
        "enabled": true,
        "config": {
          "apiKey": "${AGENTGUARD_API_KEY}",
          "agentId": "my-agent",
          "strict": true
        }
      }
    },
    "installs": {
      "agentguard": {
        "source": "npm",
        "spec": "@the-bot-club/agentguard-openclaw@^1.0.0"
      }
    }
  }
}
```

Set environment variables:

```bash
export AGENTGUARD_API_KEY=ag_...
export AGENTGUARD_AGENT_ID=my-agent   # optional — can be set in config
```

No code changes needed. OpenClaw loads the plugin and all tool calls are guarded automatically.

### Option B — Python Integration

Install the AgentGuard Python SDK:

```bash
pip install agentguard-tech
```

Use `OpenClawGuard` in your Python OpenClaw handler:

```python
from agentguard.integrations.openclaw import openclaw_guard

guard = openclaw_guard(
    api_key=os.environ["AGENTGUARD_API_KEY"],
    agent_id="my-agent",
)

# Register as a before_tool_call hook (async)
async def before_tool_call(event: dict, ctx: dict) -> dict | None:
    return await guard.before_tool_call(event, ctx)
```

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `AGENTGUARD_API_KEY` env | AgentGuard API key (`ag_...`) |
| `agentId` | `string` | `AGENTGUARD_AGENT_ID` env | Agent identifier for policy scoping |
| `baseUrl` | `string` | `https://api.agentguard.tech` | API base URL (override for self-hosted) |
| `strict` | `boolean` | `true` | Fail-closed: block on API unreachable |

### Strict vs Permissive Mode

**Strict mode (default, recommended):** If the AgentGuard API is unreachable or returns an error, the tool call is **blocked**. This is fail-closed — security takes priority over availability.

**Permissive mode (`strict: false`):** If the API is unreachable, the tool call is **allowed**. Use only in development or when availability is more important than security enforcement.

```json
{
  "plugins": {
    "entries": {
      "agentguard": {
        "enabled": true,
        "config": {
          "apiKey": "${AGENTGUARD_API_KEY}",
          "agentId": "dev-agent",
          "strict": false
        }
      }
    }
  }
}
```

## Policy YAML Examples

Place policy files in your AgentGuard project. The agent's `agentId` determines which policy applies.

### Block Requests to Unknown Domains

```yaml
id: block-unknown-domains
description: Only allow web requests to approved domains
rules:
  - id: web-allowlist
    tool: web_request
    conditions:
      - field: params.url
        operator: not_matches
        value: "^https://(api\\.openai\\.com|api\\.anthropic\\.com|your-domain\\.com)"
    action: block
    reason: "Web request to unapproved domain"
    risk_score: 850
```

### Flag File Writes for Audit

```yaml
id: flag-file-writes
description: Log all file system write operations
rules:
  - id: monitor-writes
    tool: filesystem_write
    action: monitor
    reason: "File write logged for audit trail"
    risk_score: 200

  - id: block-sensitive-writes
    tool: filesystem_write
    conditions:
      - field: params.path
        operator: matches
        value: "^(/etc|/usr|/bin|/sbin|~/.ssh)"
    action: block
    reason: "Write to system path blocked"
    risk_score: 950
```

### Require Human Approval for Shell Commands

```yaml
id: shell-approval
description: Require human approval before running any shell command
rules:
  - id: hitl-shell
    tool: exec_shell
    action: hitl
    reason: "Shell execution requires human approval"
    risk_score: 700
    hitl:
      timeout_sec: 300
      message: "Agent is requesting shell access"

  - id: block-destructive-shell
    tool: exec_shell
    conditions:
      - field: params.cmd
        operator: matches
        value: "(rm\\s+-rf|mkfs|dd\\s+if=|shutdown|reboot)"
    action: block
    reason: "Destructive shell command blocked unconditionally"
    risk_score: 1000
```

### Per-Agent Sensitivity

Different agents can have different risk tolerance. Use `agentId` scoping:

```yaml
id: research-agent-policy
description: Permissive policy for read-only research agents
agents:
  - research-agent
rules:
  - id: allow-reads
    tool: "filesystem_read|web_search|web_request"
    action: allow

  - id: block-writes
    tool: "filesystem_write|exec_shell|send_email"
    action: block
    reason: "Research agent is read-only"
    risk_score: 900
```

```yaml
id: operations-agent-policy
description: Strict policy for agents with write access
agents:
  - ops-agent
rules:
  - id: hitl-all-writes
    tool: "filesystem_write|exec_shell"
    action: hitl
    reason: "All write operations require approval for ops agent"
    risk_score: 600
    hitl:
      timeout_sec: 600
```

## Decision Handling

AgentGuard returns one of four decisions for each tool call:

| Decision | Allowed | OpenClaw result | Description |
|---|---|---|---|
| `allow` | Yes | `undefined` | Tool proceeds normally |
| `monitor` | Yes | `undefined` | Tool proceeds; call is logged for audit |
| `block` | No | `{ block: true, blockReason }` | Tool is stopped; error surfaced to agent |
| `hitl` | No (pending) | `{ block: true, blockReason }` | Tool requires human approval via gate |

### Handling HITL in Python

```python
decision = await guard.intercept("exec_shell", {"cmd": "deploy.sh"})

if decision.is_hitl:
    print(f"Waiting for approval (gate: {decision.gate_id})")
    print(f"Timeout: {decision.gate_timeout_sec}s")
    # Poll AgentGuard Gates API or wait for webhook

if decision.is_blocked:
    raise PermissionError(f"Tool blocked: {decision.reason}")

# Proceed with tool execution
```

### Handling Block Errors in TypeScript

The plugin automatically returns `{ block: true, blockReason }` to OpenClaw. OpenClaw surfaces this to the agent as a tool execution failure. Your agent code sees it as a standard blocked tool call — no extra handling needed.

## TypeScript API (Advanced)

For advanced use cases, import the plugin directly:

```typescript
import { openclawPlugin, registerOpenClawPlugin } from '@the-bot-club/agentguard';

// Programmatic registration (e.g. in tests or custom runtimes)
openclawPlugin.register(mockApi);

// Or use the named register export
registerOpenClawPlugin(myPluginApi);
```

## Python API Reference

```python
from agentguard.integrations.openclaw import OpenClawGuard, openclaw_guard, OpenClawDecision

# Factory (reads env vars if args not provided)
guard = openclaw_guard(api_key="ag_...", agent_id="my-agent")

# Direct class instantiation
guard = OpenClawGuard(
    api_key="ag_...",
    agent_id="my-agent",
    base_url="https://api.agentguard.tech",  # or self-hosted URL
    session_id="sess-001",                    # optional
    strict=True,                              # fail-closed (default)
    timeout_sec=10.0,                         # HTTP timeout
)

# Synchronous evaluation
decision: OpenClawDecision = guard.intercept_sync(
    tool_name="filesystem_write",
    params={"path": "/tmp/out.txt", "content": "hello"},
    session_id="sess-001",   # optional
    run_id="run-abc",        # optional (from OpenClaw event)
    tool_call_id="call-123", # optional (from OpenClaw event)
)

# Async evaluation
decision = await guard.intercept("tool_name", params={})

# OpenClaw hook handler (returns None or { block, blockReason })
result = await guard.before_tool_call(event_dict, ctx_dict)

# Decision properties
decision.allowed        # bool
decision.decision       # 'allow' | 'block' | 'hitl' | 'monitor'
decision.reason         # str
decision.risk_score     # int (0–1000)
decision.matched_rule_id  # str | None
decision.gate_id        # str | None (for hitl)
decision.gate_timeout_sec # int | None (for hitl)
decision.evaluation_ms  # float

# Convert to OpenClaw hook return value
hook_result = decision.to_openclaw_result()  # None = allow, dict = block/hitl
```

## Self-Hosted

Point the plugin at your self-hosted AgentGuard instance:

```json
{
  "plugins": {
    "entries": {
      "agentguard": {
        "enabled": true,
        "config": {
          "apiKey": "${AGENTGUARD_API_KEY}",
          "agentId": "my-agent",
          "baseUrl": "https://agentguard.internal.your-company.com"
        }
      }
    }
  }
}
```

```python
guard = openclaw_guard(
    api_key="ag_...",
    agent_id="my-agent",
    base_url="https://agentguard.internal.your-company.com",
)
```

## Publishing as a Standalone Package

The TypeScript plugin is designed to be published as `@the-bot-club/agentguard-openclaw`. The package structure:

```
@the-bot-club/agentguard-openclaw/
├── dist/
│   └── openclaw.js        # compiled plugin entry point
├── openclaw.plugin.json   # OpenClaw plugin manifest
└── package.json
```

The `package.json` should re-export the plugin:

```json
{
  "name": "@the-bot-club/agentguard-openclaw",
  "main": "./dist/openclaw.js",
  "peerDependencies": {
    "openclaw": ">=1.0.0"
  }
}
```

This keeps `openclaw` as a peer/optional dependency — the `agentguard` base package works without it.
