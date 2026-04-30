# AutoGen / AG2 Integration

Add AgentGuard to Microsoft AutoGen (or its fork AG2) to evaluate every tool call before execution. Two integration styles — choose what fits your architecture.

## How It Works

AutoGen agents register tool functions and execute them in a conversation loop. AgentGuard wraps those tool functions so each call is evaluated before the actual function runs:

```
AutoGen ConversableAgent
  │
  ├── register_function("read_file", read_file_fn)
  │     └── wrapped → guard.evaluate("read_file") → allow → read_file_fn(...)
  │
  └── register_function("shell_exec", shell_exec_fn)
        └── wrapped → guard.evaluate("shell_exec") → block → AgentGuardBlockError
```

## Installation

```bash
# TypeScript
npm install @the-bot-club/agentguard

# Python
pip install agentguard-tech pyautogen
# or AG2 fork:
pip install agentguard-tech ag2
```

## TypeScript / JavaScript

### Style 1: Wrap Individual Tools

Use `createAutoGenGuard` to wrap specific tool functions:

```typescript
import { createAutoGenGuard, AgentGuardBlockError } from '@the-bot-club/agentguard';

const guard = createAutoGenGuard({
  apiKey: process.env.AGENTGUARD_API_KEY!,
  agentId: 'my-autogen-agent',   // optional
  throwOnBlock: true,            // default: false (calls onBlock instead)
  onBlock: (info) => {
    console.error(`[AgentGuard] Blocked ${info.tool}: ${info.reason}`);
    console.error(`  Risk score: ${info.riskScore}`);
  },
  onAllow: (info) => {
    console.log(`[AgentGuard] Allowed ${info.tool} (risk: ${info.riskScore})`);
  },
});

// Original tool function
async function readFile(path: string): Promise<string> {
  return fs.readFile(path, 'utf-8');
}

// Guarded version — evaluates before calling readFile
const guardedReadFile = guard.wrapTool('read_file', readFile);

// Register with your AutoGen agent
conversableAgent.register_function({ read_file: guardedReadFile });
```

### Style 2: Patch the Entire Agent

Use `AutoGenToolGuard` to intercept ALL tool calls on an agent automatically:

```typescript
import { AutoGenToolGuard } from '@the-bot-club/agentguard';

const toolGuard = new AutoGenToolGuard({
  apiKey: process.env.AGENTGUARD_API_KEY!,
  agentId: 'research-agent',
  throwOnBlock: true,
});

// Patch the agent — all registered tools are now guarded
toolGuard.patchAgent(conversableAgent);

// All subsequent function calls go through AgentGuard automatically
```

### Full Example: Multi-Agent Conversation

```typescript
import ConversableAgent from 'autogen';  // structural duck-typing — works with any compatible agent
import { AutoGenToolGuard, AgentGuardBlockError } from '@the-bot-club/agentguard';

// Define tools
const tools = {
  search_web: async ({ query }: { query: string }) => {
    return `Search results for: ${query}`;
  },
  write_file: async ({ path, content }: { path: string; content: string }) => {
    await fs.writeFile(path, content);
    return `Written to ${path}`;
  },
  run_sql: async ({ query }: { query: string }) => {
    return await db.query(query);
  },
};

// Create the guard
const guard = new AutoGenToolGuard({
  apiKey: process.env.AGENTGUARD_API_KEY!,
  throwOnBlock: false,
  onBlock: (info) => {
    console.warn(`BLOCKED: ${info.tool} — ${info.reason} (risk: ${info.riskScore})`);
    if (info.suggestion) console.info(`Suggestion: ${info.suggestion}`);
  },
});

// Wrap all tools
const guardedTools = Object.fromEntries(
  Object.entries(tools).map(([name, fn]) => [name, guard.wrapTool(name, fn)])
);

// Register with agent
const agent = new ConversableAgent('DataAnalyst', {
  system_message: 'You are a data analyst. Use the available tools to answer questions.',
  function_map: guardedTools,
});

const userProxy = new ConversableAgent('UserProxy', {
  human_input_mode: 'NEVER',
  max_consecutive_auto_reply: 5,
});

// Run the conversation
await userProxy.initiate_chat(
  agent,
  { message: 'Analyse Q4 sales data and save a summary to /reports/q4.md' }
);
```

## Python

### Style 1: Wrap Individual Functions

```python
import os
from agentguard import AgentGuard
from agentguard.integrations.autogen import autogen_guard
from agentguard.integrations.errors import AgentGuardBlockError

guard = autogen_guard(
    api_key=os.environ["AGENTGUARD_API_KEY"],
    agent_id="data-analyst",
    throw_on_block=True,
)

# Original function
def read_file(path: str) -> str:
    with open(path) as f:
        return f.read()

# Guarded wrapper
guarded_read_file = guard.wrap_tool("read_file", read_file)

# Register with your AutoGen agent
agent.register_function(
    function_map={"read_file": guarded_read_file}
)
```

### Style 2: Direct Evaluation in Tool Functions

For maximum control, evaluate explicitly inside each tool:

```python
import os
from agentguard import AgentGuard
from agentguard.integrations.errors import AgentGuardBlockError

guard = AgentGuard(api_key=os.environ["AGENTGUARD_API_KEY"])

def run_sql(query: str) -> str:
    """Execute a SQL query — protected by AgentGuard."""
    decision = guard.evaluate(
        tool="run_sql",
        params={"query": query},
    )

    if decision["result"] == "block":
        raise AgentGuardBlockError(
            tool="run_sql",
            reason=decision.get("reason", "Blocked by policy"),
            risk_score=decision.get("riskScore", 0),
        )

    if decision["result"] == "monitor":
        print(f"[AgentGuard] Monitoring SQL: risk={decision['riskScore']}")

    # Execute the actual query
    return db.execute(query)
```

### Full Multi-Agent Example (Python)

```python
import os
import autogen
from agentguard import AgentGuard
from agentguard.integrations.errors import AgentGuardBlockError

guard = AgentGuard(api_key=os.environ["AGENTGUARD_API_KEY"])

# Define tool functions with inline guards
def search_web(query: str) -> str:
    decision = guard.evaluate(tool="search_web", params={"query": query})
    if decision["result"] == "block":
        return f"[BLOCKED] Search not permitted: {decision.get('reason')}"
    # ... actual search
    return f"Results for: {query}"


def write_report(filename: str, content: str) -> str:
    decision = guard.evaluate(
        tool="write_file",
        params={"filename": filename, "content": content},
    )
    if decision["result"] == "block":
        raise AgentGuardBlockError(
            tool="write_file",
            reason=decision.get("reason"),
            risk_score=decision.get("riskScore", 0),
        )
    with open(f"/reports/{filename}", "w") as f:
        f.write(content)
    return f"Report saved to /reports/{filename}"


def execute_command(cmd: str) -> str:
    # This will be blocked by policy — return a safe error
    decision = guard.evaluate(tool="shell_exec", params={"cmd": cmd})
    if decision["result"] == "block":
        return f"[BLOCKED] Command not permitted: {decision.get('reason')}"
    import subprocess
    return subprocess.check_output(cmd, shell=True).decode()


# Configure AutoGen agents
llm_config = {
    "functions": [
        {"name": "search_web", "description": "Search the web", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
        {"name": "write_report", "description": "Save a report", "parameters": {"type": "object", "properties": {"filename": {"type": "string"}, "content": {"type": "string"}}, "required": ["filename", "content"]}},
        {"name": "execute_command", "description": "Run a shell command", "parameters": {"type": "object", "properties": {"cmd": {"type": "string"}}, "required": ["cmd"]}},
    ],
    "config_list": autogen.config_list_from_json("OAI_CONFIG_LIST"),
}

assistant = autogen.AssistantAgent(
    name="Researcher",
    system_message="You are a research assistant. Use tools to gather information.",
    llm_config=llm_config,
)

user_proxy = autogen.UserProxyAgent(
    name="User",
    human_input_mode="NEVER",
    function_map={
        "search_web": search_web,
        "write_report": write_report,
        "execute_command": execute_command,
    },
)

# Start the conversation — AgentGuard evaluates every tool call
user_proxy.initiate_chat(
    assistant,
    message="Research AI trends in 2026 and save a report as ai-trends-2026.md",
)
```

### AG2 (Microsoft AutoGen Fork)

AG2 uses the same API surface. Swap the import:

```python
# ag2 instead of autogen
import ag2 as autogen

# Everything else stays the same
```

## Policy for AutoGen Agents

```yaml
id: autogen-agent-policy
name: AutoGen Research Agent Policy
version: 1.0.0
default: monitor   # log everything, don't block by default during dev

rules:
  # Explicitly allow safe research tools
  - id: allow-search-tools
    action: allow
    priority: 100
    when:
      - tool:
          in: [search_web, read_url, fetch_webpage, wikipedia_search]

  # Allow file reads from safe directories
  - id: allow-safe-reads
    action: allow
    priority: 95
    when:
      - tool:
          in: [read_file, file_read]
        params:
          path:
            startsWith: /data/

  # Restrict file writes to /reports and /output
  - id: allow-report-writes
    action: allow
    priority: 90
    when:
      - tool:
          in: [write_file, file_write]
        params:
          path:
            startsWith: /reports/

  # Require human approval for external calls
  - id: require-approval-external
    action: require_approval
    priority: 50
    when:
      - tool:
          in: [http_post, email_send, api_call, webhook_send]

  # Block dangerous operations
  - id: block-dangerous
    action: block
    severity: critical
    priority: 5
    when:
      - tool:
          in: [shell_exec, run_sql_write, database_delete, file_delete, exec, eval]
```

## Handling `require_approval`

When a tool call returns `require_approval`, the agent should pause and wait for human sign-off. Here's how to implement that flow:

```python
import time
import requests

def check_approval_status(evaluation_id: str, api_key: str, timeout_secs: int = 300) -> bool:
    """Poll for human approval on a require_approval decision."""
    deadline = time.time() + timeout_secs
    while time.time() < deadline:
        resp = requests.get(
            f"https://api.agentguard.tech/api/v1/approvals/{evaluation_id}",
            headers={"x-api-key": api_key},
        )
        status = resp.json()["data"]["status"]
        if status == "approved":
            return True
        if status == "denied":
            return False
        time.sleep(5)
    raise TimeoutError("Approval request timed out")


# In your tool function:
def sensitive_api_call(endpoint: str, payload: dict) -> str:
    decision = guard.evaluate(
        tool="http_post",
        params={"url": endpoint, "body": payload},
    )

    if decision["result"] == "require_approval":
        print(f"Waiting for human approval (ID: {decision['evaluationId']})...")
        approved = check_approval_status(
            decision["evaluationId"],
            os.environ["AGENTGUARD_API_KEY"],
        )
        if not approved:
            raise PermissionError("API call denied by human reviewer")
        # Proceed after approval
    elif decision["result"] == "block":
        raise AgentGuardBlockError(tool="http_post", reason=decision.get("reason"))

    return requests.post(endpoint, json=payload).text
```

## Troubleshooting

**`wrapTool` / `wrap_tool` not found**  
Ensure you're importing from `agentguard.integrations.autogen`, not the top-level `agentguard` package.

**Tool calls are not being evaluated**  
Confirm the wrapped function is what's registered in `function_map`, not the original.

**Block decisions return `undefined` instead of raising**  
By default, `throwOnBlock: false` — the guard calls `onBlock` and returns `undefined`. Set `throwOnBlock: true` to raise an exception instead.

**Timeouts on `require_approval`**  
Either set up a webhook to get push notifications, or reduce the approval window in your policy for development.

---

- [LangChain Integration](/integrations/langchain)
- [CrewAI Integration](/integrations/crewai)
- [Policy Engine guide](/guide/policy-engine)
- [API Reference](/api/overview)
