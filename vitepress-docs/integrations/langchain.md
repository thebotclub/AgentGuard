# LangChain Integration

Add AgentGuard to any LangChain agent in 3 lines. Every tool call is evaluated before execution — no manual wrapping required.

## How It Works

AgentGuard provides a `AgentGuardCallbackHandler` that plugs directly into LangChain's callback system. When a tool is about to run, the handler intercepts the call, evaluates it against your policy, and either lets it through or throws an error to halt execution.

```
LangChain Agent
    │ tool invocation
    ▼
AgentGuardCallbackHandler.handleToolStart()
    │
    ▼
POST /api/v1/evaluate → Policy Engine
    │
    ├── allow / monitor → proceed
    └── block / require_approval → throw AgentGuardBlockError
```

## Installation

```bash
npm install @the-bot-club/agentguard
# LangChain (install if not already present)
npm install @langchain/core langchain
```

```bash
# Python
pip install agentguard-tech langchain langchain-openai
```

## TypeScript / JavaScript

### Basic Setup

```typescript
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatOpenAI } from '@langchain/openai';
import { pull } from 'langchain/hub';
import { AgentGuardCallbackHandler } from '@the-bot-club/agentguard';

// 1. Create the guard callback handler
const guardHandler = new AgentGuardCallbackHandler({
  apiKey: process.env.AGENTGUARD_API_KEY!,
  agentId: 'my-langchain-agent',   // optional: scope evaluations to a specific agent
});

// 2. Build your agent as usual
const llm = new ChatOpenAI({ model: 'gpt-4o' });
const prompt = await pull<ChatPromptTemplate>('hwchase17/openai-functions-agent');
const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt });

// 3. Pass the guard as a callback — that's it!
const executor = AgentExecutor.fromAgentAndTools({
  agent,
  tools,
  callbacks: [guardHandler],   // ← AgentGuard plugs in here
});

// Run your agent — every tool call is now guarded
const result = await executor.invoke({ input: 'Summarise the Q4 sales data' });
```

### Using the `langchainGuard` factory

For a more compact setup, use the factory function:

```typescript
import { langchainGuard } from '@the-bot-club/agentguard';

const guard = langchainGuard({
  apiKey: process.env.AGENTGUARD_API_KEY!,
  agentId: 'my-agent',
});

const executor = AgentExecutor.fromAgentAndTools({
  agent,
  tools,
  callbacks: [guard],
});
```

### Handling Blocked Actions

When AgentGuard blocks a tool call, it throws `AgentGuardBlockError`. Catch it to give your users or orchestrators a clean error:

```typescript
import { AgentGuardBlockError } from '@the-bot-club/agentguard';

try {
  const result = await executor.invoke({ input: userMessage });
  console.log(result.output);
} catch (err) {
  if (err instanceof AgentGuardBlockError) {
    console.error(`Blocked tool call: ${err.tool}`);
    console.error(`Reason: ${err.reason}`);
    console.error(`Risk score: ${err.riskScore}`);
    // Return a safe error message to the user
    return { error: 'That action is not permitted by your security policy.' };
  }
  throw err;
}
```

### Agent-scoped API Keys

For production, create a dedicated agent key (not your tenant key) for each agent:

```bash
# Register an agent and get a scoped key
curl -X POST https://api.agentguard.tech/api/v1/agents \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "customer-support-agent",
    "description": "Handles customer queries via LangChain",
    "tools": ["database_read", "email_send", "crm_update"]
  }'
```

Then use the returned `agent_key` in your `AgentGuardCallbackHandler`:

```typescript
const guardHandler = new AgentGuardCallbackHandler({
  apiKey: process.env.AGENTGUARD_AGENT_KEY!,   // ag_agent_...
});
```

## Python

### Basic Setup

```python
import os
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI
from langchain import hub
from agentguard import AgentGuard
from agentguard.integrations.langchain import AgentGuardCallbackHandler

# 1. Create the guard handler
guard_handler = AgentGuardCallbackHandler(
    api_key=os.environ["AGENTGUARD_API_KEY"],
    agent_id="my-langchain-agent",  # optional
)

# 2. Build your LangChain agent as normal
llm = ChatOpenAI(model="gpt-4o")
prompt = hub.pull("hwchase17/openai-functions-agent")
agent = create_openai_functions_agent(llm, tools, prompt)

# 3. Add the guard as a callback
executor = AgentExecutor(
    agent=agent,
    tools=tools,
    callbacks=[guard_handler],   # ← plug in here
)

result = executor.invoke({"input": "Query the sales database for Q4"})
```

### Handling Blocks in Python

```python
from agentguard.integrations.errors import AgentGuardBlockError

try:
    result = executor.invoke({"input": user_message})
    print(result["output"])
except AgentGuardBlockError as e:
    print(f"Blocked: {e.tool} — {e.reason} (risk: {e.risk_score})")
    # Return safe error to user
    return {"error": "That action is not allowed by your security policy."}
```

### Async Support

```python
import asyncio

async def run_agent(user_input: str):
    result = await executor.ainvoke({"input": user_input})
    return result["output"]

asyncio.run(run_agent("List the top 10 customers"))
```

## Policy Configuration

To control which LangChain tools are allowed, create a policy:

```yaml
# langchain-agent-policy.yaml
id: langchain-agent-policy
name: Customer Support Agent Policy
version: 1.0.0
default: block   # deny anything not explicitly allowed

rules:
  - id: allow-crm-reads
    action: allow
    priority: 100
    when:
      - tool:
          in: [crm_read, database_read, search_docs]

  - id: allow-email-send
    action: require_approval     # human approves before sending
    priority: 80
    when:
      - tool:
          in: [email_send, slack_post]

  - id: block-destructive
    action: block
    priority: 10
    severity: critical
    when:
      - tool:
          in: [database_delete, file_delete, shell_exec, sql_drop]
```

Upload it:

```bash
curl -X POST https://api.agentguard.tech/api/v1/policies \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{ \"yaml\": $(cat langchain-agent-policy.yaml | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))') }"
```

## Full Working Example

```typescript
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { langchainGuard, AgentGuardBlockError } from '@the-bot-club/agentguard';
import { z } from 'zod';

// Define some tools
const tools = [
  new DynamicStructuredTool({
    name: 'database_query',
    description: 'Run a read-only SQL query on the production database',
    schema: z.object({ query: z.string() }),
    func: async ({ query }) => {
      // Your actual DB query here
      return `Results for: ${query}`;
    },
  }),
  new DynamicStructuredTool({
    name: 'shell_exec',
    description: 'Run a shell command',
    schema: z.object({ cmd: z.string() }),
    func: async ({ cmd }) => {
      return `Executed: ${cmd}`;
    },
  }),
];

// Add the guard
const guard = langchainGuard({ apiKey: process.env.AGENTGUARD_API_KEY! });

const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0 });
const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a helpful data analyst.'],
  ['human', '{input}'],
  ['placeholder', '{agent_scratchpad}'],
]);

const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt });
const executor = AgentExecutor.fromAgentAndTools({ agent, tools, callbacks: [guard] });

// Run it — shell_exec will be blocked; database_query will be allowed
try {
  const result = await executor.invoke({ input: 'Show me total sales for Q4' });
  console.log(result.output);
} catch (err) {
  if (err instanceof AgentGuardBlockError) {
    console.log(`Blocked ${err.tool}: ${err.reason}`);
  }
}
```

## Troubleshooting

**Guard not intercepting tool calls**  
Make sure `callbacks: [guard]` is on the `AgentExecutor`, not the `agent` or individual tools.

**`AgentGuardBlockError` is not being caught**  
LangChain may wrap errors in its own exception types. Check `err.cause` or catch a broader exception type.

**All calls are allowed (no blocks)**  
You're likely using the default permissive policy. Upload a custom policy via the API or dashboard.

**`require_approval` decisions are blocking execution indefinitely**  
Approvals require a webhook or the dashboard. Set up a webhook listener or approve manually at [app.agentguard.tech](https://app.agentguard.tech).

---

- [Full API Reference → POST /evaluate](/api/overview)
- [Policy Engine guide](/guide/policy-engine)
- [CrewAI Integration](/integrations/crewai)
- [AutoGen Integration](/integrations/autogen)
