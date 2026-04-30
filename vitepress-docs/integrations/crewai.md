# CrewAI Integration

Wrap your CrewAI crews with AgentGuard to intercept every tool execution before it runs. Drop in a single guard object and every crew member's tool call goes through your policy.

## How It Works

CrewAI exposes `before_tool_execution` hooks on agents. AgentGuard plugs into that lifecycle to evaluate each call:

```
CrewAI Crew
  │
  ├── Agent 1: ResearchAgent
  │     └── tool: web_search → beforeToolExecution() → allow
  │
  └── Agent 2: WriterAgent
        └── tool: file_write → beforeToolExecution() → block (path restricted)
```

## Installation

```bash
# TypeScript
npm install @the-bot-club/agentguard crewai

# Python
pip install agentguard-tech crewai
```

## TypeScript / JavaScript

### Creating the Guard

```typescript
import { crewaiGuard } from '@the-bot-club/agentguard';

const guard = crewaiGuard({
  apiKey: process.env.AGENTGUARD_API_KEY!,
  agentId: 'my-crew',   // optional — ties evaluations to a registered agent
});
```

### Integrating with a CrewAI Agent

Use the guard in your agent's tool execution lifecycle:

```typescript
class ResearchAgent {
  // Called by CrewAI before every tool execution
  async beforeToolExecution(toolName: string, args: Record<string, unknown>) {
    // This will throw AgentGuardBlockError if blocked
    const result = await guard.beforeToolExecution(toolName, args);
    console.log(`[AgentGuard] ${toolName} allowed — risk: ${result.riskScore}`);
  }

  async runTask(task: string) {
    const searchResults = await this.tools.web_search({ query: task });
    return searchResults;
  }
}
```

### Handling Blocks

```typescript
import { AgentGuardBlockError } from '@the-bot-club/agentguard';

class SafeAgent {
  async beforeToolExecution(toolName: string, args: Record<string, unknown>) {
    try {
      await guard.beforeToolExecution(toolName, args);
    } catch (err) {
      if (err instanceof AgentGuardBlockError) {
        console.error(`[Security] Tool blocked: ${toolName}`);
        console.error(`  Reason: ${err.reason}`);
        console.error(`  Risk score: ${err.riskScore}`);
        // Optionally suggest an alternative
        if (err.suggestion) {
          console.info(`  Suggestion: ${err.suggestion}`);
        }
        throw err;  // Re-throw so CrewAI halts the task
      }
      throw err;
    }
  }
}
```

### Batch Evaluation (Pre-flight)

Evaluate an entire task plan before starting execution — useful for long-running crews:

```typescript
const toolPlan = [
  { tool: 'web_search', args: { query: 'market trends 2026' } },
  { tool: 'database_write', args: { table: 'reports', data: {} } },
  { tool: 'email_send', args: { to: 'ceo@company.com', subject: 'Report' } },
];

const decisions = await guard.evaluateBatch(toolPlan);

// Check for any blocks before the crew starts
const blocked = decisions.filter(d => d.decision === 'block');
if (blocked.length > 0) {
  console.error('Task plan contains blocked operations:', blocked);
  throw new Error('Crew task plan rejected by security policy');
}

// All clear — start the crew
await crew.kickoff();
```

## Python

### Installation and Setup

```python
import os
from agentguard import AgentGuard
from agentguard.integrations.crewai import crewai_guard, CrewAIGuard

guard = crewai_guard(
    api_key=os.environ["AGENTGUARD_API_KEY"],
    agent_id="research-crew",   # optional
)
```

### Wrapping a CrewAI Agent

```python
from crewai import Agent, Task, Crew, Process
from crewai.tools import BaseTool
from agentguard import AgentGuard
from agentguard.integrations.errors import AgentGuardBlockError

class GuardedResearchAgent(Agent):
    """Research agent with AgentGuard protection."""

    def __init__(self, guard: AgentGuard, **kwargs):
        super().__init__(**kwargs)
        self._guard = guard

    def execute_tool(self, tool_name: str, **kwargs):
        """Override tool execution to add AgentGuard check."""
        decision = self._guard.evaluate(
            tool=tool_name,
            params=kwargs,
        )

        if decision["result"] == "block":
            raise AgentGuardBlockError(
                tool=tool_name,
                reason=decision.get("reason", "Blocked by policy"),
                risk_score=decision.get("riskScore", 0),
            )

        # Log monitor decisions
        if decision["result"] == "monitor":
            print(f"[AgentGuard] Monitoring {tool_name} — risk: {decision['riskScore']}")

        return super().execute_tool(tool_name, **kwargs)


# Use it like a regular CrewAI agent
from agentguard import AgentGuard

guard = AgentGuard(api_key=os.environ["AGENTGUARD_API_KEY"])

researcher = GuardedResearchAgent(
    guard=guard,
    role="Senior Research Analyst",
    goal="Find and synthesize market intelligence",
    backstory="Expert at analysing complex market data",
    tools=[search_tool, scrape_tool],
    verbose=True,
)
```

### Full Crew Example

```python
import os
from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool, FileWriterTool
from agentguard import AgentGuard
from agentguard.integrations.errors import AgentGuardBlockError

guard = AgentGuard(api_key=os.environ["AGENTGUARD_API_KEY"])

def guarded_tool_call(tool_name: str, **kwargs) -> dict:
    """Evaluate any tool call before execution."""
    decision = guard.evaluate(tool=tool_name, params=kwargs)
    if decision["result"] == "block":
        raise AgentGuardBlockError(
            tool=tool_name,
            reason=decision.get("reason"),
            risk_score=decision.get("riskScore", 0),
        )
    return decision


# Researchers and writers are normal CrewAI agents
# Wrap tool execution at the crew orchestration level

class SecureCrew:
    def __init__(self):
        self.guard = AgentGuard(api_key=os.environ["AGENTGUARD_API_KEY"])

        self.researcher = Agent(
            role="Research Analyst",
            goal="Research the topic thoroughly",
            backstory="Expert researcher with deep analytical skills",
            tools=[SerperDevTool()],
        )

        self.writer = Agent(
            role="Content Writer",
            goal="Write clear, accurate reports",
            backstory="Experienced technical writer",
            tools=[FileWriterTool()],
        )

    def run(self, topic: str) -> str:
        # Pre-flight: evaluate the tool plan
        tool_plan = [
            {"tool": "serper_search", "args": {"query": topic}},
            {"tool": "file_write", "args": {"filename": "report.md"}},
        ]

        for step in tool_plan:
            decision = self.guard.evaluate(
                tool=step["tool"],
                params=step["args"],
            )
            if decision["result"] == "block":
                raise PermissionError(
                    f"Crew task blocked: {step['tool']} — {decision.get('reason')}"
                )

        # Run the crew
        tasks = [
            Task(
                description=f"Research: {topic}",
                agent=self.researcher,
                expected_output="Detailed research summary",
            ),
            Task(
                description="Write a report based on the research",
                agent=self.writer,
                expected_output="Formatted markdown report",
            ),
        ]

        crew = Crew(
            agents=[self.researcher, self.writer],
            tasks=tasks,
            process=Process.sequential,
        )

        return crew.kickoff()


try:
    result = SecureCrew().run("AI safety trends in 2026")
    print(result)
except PermissionError as e:
    print(f"Security policy rejected crew task: {e}")
except AgentGuardBlockError as e:
    print(f"Tool blocked at runtime: {e.tool} — {e.reason}")
```

## Policy for CrewAI

A recommended policy for a research + writing crew:

```yaml
id: crewai-research-policy
name: Research Crew Security Policy
version: 1.0.0
default: block

rules:
  # Research tools — allowed
  - id: allow-web-search
    action: allow
    priority: 100
    when:
      - tool:
          in: [web_search, serper_search, scrape_url, read_url]

  # File writes — restricted to /tmp and /output
  - id: allow-safe-file-writes
    action: allow
    priority: 90
    when:
      - tool:
          in: [file_write, file_read]
        params:
          path:
            startsWith: /output/

  # Human approval for external communications
  - id: require-approval-comms
    action: require_approval
    priority: 80
    when:
      - tool:
          in: [email_send, slack_post, webhook_call]

  # Block destructive operations
  - id: block-destructive
    action: block
    severity: critical
    priority: 10
    when:
      - tool:
          in: [database_delete, file_delete, shell_exec, system_command]
```

## Troubleshooting

**Guard decisions are not being applied**  
Make sure you're calling `guard.evaluate()` or `guard.before_tool_execution()` in your agent's tool lifecycle, not in the task definition.

**`require_approval` causing crew to hang**  
Configure a webhook to receive approval events, or approve manually from the [dashboard](https://agentguard.tech/dashboard/). For testing, change `require_approval` to `monitor` in your policy.

**Python `AgentGuardBlockError` not importable**  
Import from the integrations module: `from agentguard.integrations.errors import AgentGuardBlockError`

---

- [LangChain Integration](/integrations/langchain)
- [AutoGen Integration](/integrations/autogen)
- [Policy Engine guide](/guide/policy-engine)
- [API Reference](/api/overview)
