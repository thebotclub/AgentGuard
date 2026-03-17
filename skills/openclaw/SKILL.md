---
name: agentguard
description: Add runtime security to AI agent tool calls via AgentGuard. Evaluates tools before execution — blocks dangerous operations, requires approval for sensitive ones. Use when the user wants to secure their agent, add guardrails, or audit tool usage.
---

# AgentGuard — Runtime Security for Agent Tool Calls

## What It Does

AgentGuard evaluates every tool call your agent makes before execution. It returns `allow`, `block`, `monitor`, or `require_approval`. Default policy blocks shell execution, file deletion, and privilege escalation — allows everything else.

## Quick Setup (No Signup Required)

You can evaluate tool calls immediately — no API key needed:

```bash
curl -X POST https://api.agentguard.tech/api/v1/evaluate \
  -H "Content-Type: application/json" \
  -d '{"tool": "shell_exec", "params": {"command": "rm -rf /"}}'
```

Returns: `{"result": "block", "reason": "Blocked by rule..."}`

## Full Setup (With API Key)

For audit trails, custom policies, and higher rate limits:

```bash
# 1. Sign up (email optional)
curl -X POST https://api.agentguard.tech/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"name": "My Agent"}'
# Returns: { "apiKey": "ag_live_...", ... }

# 2. Evaluate with your key
curl -X POST https://api.agentguard.tech/api/v1/evaluate \
  -H "X-API-Key: ag_live_..." \
  -H "Content-Type: application/json" \
  -d '{"tool": "read_file", "params": {"path": "/data/report.csv"}}'
```

## Integration Pattern

Before executing ANY tool, call evaluate. Check the result:

```python
import urllib.request, json

def guard_check(tool: str, params: dict, api_key: str = "") -> dict:
    """Check a tool call against AgentGuard. Returns the decision."""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key
    data = json.dumps({"tool": tool, "params": params}).encode()
    req = urllib.request.Request(
        "https://api.agentguard.tech/api/v1/evaluate",
        data=data, headers=headers, method="POST"
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

# Usage
result = guard_check("shell_exec", {"command": "ls -la"})
if result["result"] == "block":
    print(f"Blocked: {result['reason']}")
elif result["result"] == "require_approval":
    print(f"Needs approval: {result['reason']}")
else:
    # Safe to execute
    pass
```

## Default Policy

| Action | Tools |
|--------|-------|
| 🚫 Block | shell_exec, sudo, chmod, rm, rmdir, eval_code, system_command |
| ⏸️ Approval | transfer_funds, create_payment, execute_transaction |
| 📊 Monitor | db_query, sql_execute (logged for audit) |
| ✅ Allow | Everything else |

## Customising Policy

```bash
PUT https://api.agentguard.tech/api/v1/policy
X-API-Key: <your-key>
Content-Type: application/json

{"rules": [
  {"id": "my-rule", "action": "block", "priority": 10,
   "when": [{"tool": {"in": ["dangerous_tool"]}}], "severity": "high"}
]}
```

## Environment Variable

Set `AGENTGUARD_API_KEY` in your environment and the SDKs will pick it up automatically.

## More

- Setup guide: `GET https://api.agentguard.tech/api/v1/setup`
- Templates: `GET https://api.agentguard.tech/api/v1/templates`
- Docs: https://agentguard.tech/docs
- GitHub: https://github.com/thebotclub/AgentGuard
