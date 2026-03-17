# Add Security Guardrails to LangChain in 5 Minutes

LangChain makes it ridiculously easy to build AI agents that use tools. Connect an LLM to a file system, a database, a shell — and suddenly your agent can *do things*.

That's the magic. It's also the problem.

Every tool call your LangChain agent makes is a potential attack surface. Prompt injection can trick your agent into reading sensitive files, executing arbitrary commands, or exfiltrating data through tool calls. And by default, LangChain doesn't have a security layer between the LLM's decision and the tool's execution.

**AgentGuard** fixes that. It sits between your agent and its tools, evaluating every action in real-time and blocking anything dangerous — before it executes.

Here's how to add it to your LangChain project in under 5 minutes.

---

## Step 1: Install the SDK

**TypeScript / Node.js:**

```bash
npm install @the-bot-club/agentguard
```

**Python:**

```bash
pip install agentguard-tech
```

That's it. No heavy dependencies, no config files.

---

## Step 2: Get Your API Key

Head to [agentguard.tech](https://agentguard.tech) and sign up. The free tier gives you **100,000 events per month** — more than enough for development and most production workloads.

Once you're in, grab your API key from the dashboard. It'll look something like `ag_live_abc123...`.

Set it as an environment variable:

```bash
export AG_API_KEY="ag_live_your_key_here"
```

---

## Step 3: Add the Callback Handler (TypeScript)

AgentGuard integrates with LangChain through a **callback handler**. This hooks into LangChain's lifecycle events — specifically tool calls — and evaluates them against AgentGuard's security policies before they execute.

```typescript
import { AgentGuardCallbackHandler } from '@the-bot-club/agentguard/integrations/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { pull } from 'langchain/hub';

// Initialize AgentGuard
const agentGuardHandler = new AgentGuardCallbackHandler({
  apiKey: process.env.AG_API_KEY,
});

// Set up your LangChain agent as normal
const llm = new ChatOpenAI({ model: 'gpt-4o' });
const prompt = await pull('hwchase17/openai-tools-agent');

const agent = await createOpenAIToolsAgent({
  llm,
  tools: yourTools,
  prompt,
});

const executor = new AgentExecutor({
  agent,
  tools: yourTools,
  // Attach AgentGuard as a callback
  callbacks: [agentGuardHandler],
});

// Every tool call now passes through AgentGuard
const result = await executor.invoke({
  input: 'Summarize the contents of /etc/passwd',
});
```

One callback. That's the entire integration. Your agent runs exactly the same — except now every tool call is evaluated for risk before it fires.

---

## Step 4: Add the Callback Handler (Python)

The Python integration follows the same pattern:

```python
from agentguard.integrations.langchain import AgentGuardCallbackHandler
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain import hub

# Initialize AgentGuard
ag_handler = AgentGuardCallbackHandler(api_key="ag_live_...")

# Set up your agent as normal
llm = ChatOpenAI(model="gpt-4o")
prompt = hub.pull("hwchase17/openai-tools-agent")

agent = create_openai_tools_agent(llm, your_tools, prompt)

executor = AgentExecutor(
    agent=agent,
    tools=your_tools,
    # Attach AgentGuard as a callback
    callbacks=[ag_handler],
)

# Every tool call is now guarded
result = executor.invoke({
    "input": "Delete all files in the home directory"
})
```

Same deal — one handler, passed as a callback. Everything else stays the same.

---

## What Happens When a Dangerous Action Is Blocked?

Let's say a user (or a prompt injection attack) convinces your agent to run `rm -rf /`. Here's what happens with AgentGuard attached:

```
🛡️ AgentGuard Evaluation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Tool:        shell_exec
  Input:       rm -rf /
  Risk Score:  0.98 (CRITICAL)
  Action:      ❌ BLOCKED
  Reason:      Destructive file system operation detected.
               Command attempts recursive forced deletion
               at root level. Matches policy: no-destructive-fs.
  Policy:      default/no-destructive-fs
  Trace ID:    ag_eval_7f2a9c...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The tool call never executes. Your agent receives a blocked response and can gracefully handle it — instead of nuking your server.

Other examples AgentGuard catches:

- **Data exfiltration**: Agent tries to POST sensitive file contents to an external URL
- **Privilege escalation**: Agent attempts to modify system configuration or credentials
- **SQL injection**: Agent passes unsanitized input to a database tool
- **Path traversal**: Agent reads files outside its intended working directory

---

## Step 5: Monitor Everything in the Dashboard

Every evaluation — blocked or allowed — shows up in real-time at [app.agentguard.tech](https://app.agentguard.tech).

The dashboard gives you:

- **Live event stream** — every tool call, with risk scores and policy decisions
- **Threat analytics** — patterns in blocked actions, attack attempts over time
- **Policy management** — create and tune security policies for your specific use case
- **Audit trail** — full history of every agent action for compliance and debugging

This isn't just security — it's observability. You finally get visibility into what your agents are actually doing in production.

---

## Beyond LangChain

AgentGuard isn't limited to LangChain. The SDK ships with integrations for:

- **CrewAI** — guard multi-agent workflows where agents delegate to each other
- **OpenAI Agents SDK** — native integration with OpenAI's tool calling
- **Express middleware** — protect API endpoints that trigger agent actions
- **Generic SDK** — wrap any tool call in any framework with `agentguard.evaluate()`

Same API key, same dashboard, same policies — across your entire agent stack.

---

## Recap

Here's what you just did:

1. ✅ Installed the AgentGuard SDK (one package)
2. ✅ Grabbed a free API key (100K events/month)
3. ✅ Added a callback handler to your LangChain agent (3 lines of code)
4. ✅ Got real-time security evaluation on every tool call

Your LangChain agent is now guarded. Every tool call passes through AgentGuard's evaluation engine before executing. Dangerous actions get blocked. Everything gets logged. You sleep better at night.

---

## Get Started

- **Sign up**: [agentguard.tech](https://agentguard.tech) — free tier, no credit card
- **Documentation**: [docs.agentguard.tech](https://docs.agentguard.tech)
- **Dashboard**: [app.agentguard.tech](https://app.agentguard.tech)

Your agents are powerful. Make sure they're safe.
