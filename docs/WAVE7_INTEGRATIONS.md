# Wave 7: AgentGuard Deep Framework Integrations

> **Status:** ✅ Complete  
> **Package:** `packages/python/agentguard/integrations/`  
> **Tests:** 124 passing (0 failing)

---

## Overview

Wave 7 adds native, production-ready integrations for three major Python
multi-agent frameworks: **CrewAI**, **AutoGen**, and **LangGraph**.  Each
integration intercepts tool calls, evaluates them against AgentGuard policies,
and blocks, allows, or triggers HITL approval flows — without requiring the
framework to be installed as a hard dependency (all integrations are duck-typed).

---

## Task 1: CrewAI Native Callback Handler

**File:** `packages/python/agentguard/integrations/crewai.py`  
**Tests:** `packages/python/tests/test_crewai_integration.py` (81 tests)

### What was added

A new `AgentGuardCallback` class that implements CrewAI's (LangChain-compatible)
callback handler interface.  Pass it directly to `Crew(callbacks=[...])`.

```python
from crewai import Crew, Agent, Task
from agentguard.integrations.crewai import AgentGuardCallback

guard_cb = AgentGuardCallback(
    api_key="ag_...",
    on_block=lambda err: logger.warning("Blocked: %s", err.reason),
)

crew = Crew(
    agents=[research_agent, writer_agent],
    tasks=[research_task, write_task],
    callbacks=[guard_cb],
)
result = crew.kickoff()
```

### Intercepted events

| Event | Method | Blocks? |
|-------|--------|---------|
| Tool use | `on_tool_start` | ✅ Yes (raises `AgentGuardBlockError`) |
| Agent action | `on_agent_action` | ✅ Yes |
| Agent delegation | `on_text` | ✅ Yes (pattern detection) |
| Task start | `on_chain_start` | Monitor only (logs) |
| Task completion | `on_chain_end` | Monitor only (logs) |

### Features

- **Monitor-only mode** (`block_actions=False`) — logs violations without raising
- **Imperative API** — `before_tool_execution()` and `before_task_start()` for
  manual integration in `step_callback` / `task_callback` hooks
- **`on_block` / `on_allow` callbacks** for custom violation handling
- Backwards-compatible: the existing `crewai_guard()` / `_CrewAIGuard` imperative
  API is preserved

---

## Task 2: AutoGen Deep Integration

**File:** `packages/python/agentguard/integrations/autogen.py`  
**Tests:** `packages/python/tests/test_autogen_integration.py` (33 tests)

### What was added

A new top-level `wrap()` function (module-level shorthand) + multi-agent chain
tracking via auto-derived `agent_id` from `agent.name`.

```python
import agentguard.integrations.autogen as ag_autogen

# Guard individual agents in a multi-agent pipeline
researcher = ag_autogen.wrap(researcher_agent, api_key="ag_...")
writer     = ag_autogen.wrap(writer_agent,     api_key="ag_...", agent_id="writer")
reviewer   = ag_autogen.wrap(reviewer_agent,   api_key="ag_...", agent_id="reviewer")

groupchat = GroupChat(agents=[researcher, writer, reviewer], ...)
```

### Integration styles (full coverage)

1. **`wrap(agent, api_key=...)`** — one-liner module-level shorthand; auto-derives
   `agent_id` from `agent.name` for multi-agent chain tracking
2. **`create_guarded_agent(agent, api_key=...)`** — same as `wrap()` but verbose
3. **`AutoGenGuard.patch_agent(agent)`** — mutates an existing agent in-place
4. **`@guard.guard_tool`** — decorator for individual tool functions (sync + async)
5. **`guard.wrap_tool(name, fn)`** — programmatic wrapping

### Multi-agent chain tracking

Each guarded agent is tagged with its `agent_id` (auto-derived from `agent.name`
if not provided).  Block events include this ID in audit logs, so operators can
pinpoint *which* agent in a GroupChat or nested conversation triggered a policy
violation.

---

## Task 3: LangGraph Streaming Support

**File:** `packages/python/agentguard/integrations/langgraph.py`  
**Tests:** `packages/python/tests/test_langgraph_integration.py` (41 tests)

### What was added

Three complementary integration approaches for LangGraph:

#### Option A: `AgentGuardNode` — insert into the graph

```python
from langgraph.graph import StateGraph, END
from agentguard.integrations.langgraph import AgentGuardNode

guard = AgentGuardNode(api_key="ag_...", agent_id="my-agent")

builder = StateGraph(AgentState)
builder.add_node("agent", call_model)
builder.add_node("guard", guard)          # ← inserted before tools
builder.add_node("tools", ToolNode(tools))

builder.set_entry_point("agent")
builder.add_edge("agent", "guard")
builder.add_conditional_edges(
    "guard",
    guard.route,                           # routes to "tools" or "blocked"
    {"tools": "tools", "blocked": END},
)
builder.add_edge("tools", "agent")
graph = builder.compile()
```

#### Option B: `guarded_stream()` — no graph changes required

```python
from agentguard.integrations.langgraph import guarded_stream

for chunk in guarded_stream(graph, {"messages": [user_msg]}, api_key="ag_..."):
    process(chunk)
```

Intercepts streaming chunks containing tool calls.  Raises `AgentGuardBlockError`
on block, or invokes `on_block` callback and stops the stream.

#### Option C: `wrap_tool_node()` — wrap an existing ToolNode

```python
from agentguard.integrations.langgraph import wrap_tool_node

guarded_tools = wrap_tool_node(ToolNode(tools), api_key="ag_...")
builder.add_node("tools", guarded_tools)
```

### Branch-aware policies

```python
guards = create_branch_guard(
    api_key="ag_...",
    branches={
        "sensitive_branch": "agent-sensitive",
        "public_branch":    "agent-public",
    },
)
builder.add_node("guard_sensitive", guards["sensitive_branch"])
builder.add_node("guard_public",    guards["public_branch"])
```

### Streaming state format support

The integration handles all common LangGraph state shapes:

| Format | Example |
|--------|---------|
| Explicit `tool_calls` list | `{"tool_calls": [{...}]}` |
| LangChain `AIMessage.tool_calls` | object attribute |
| Dict-style message | `{"messages": [{"tool_calls": [...]}]}` |
| OpenAI `additional_kwargs` style | `{"additional_kwargs": {"tool_calls": [...]}}` |
| Stream mode `"values"` | raw state dict per step |
| Stream mode `"updates"` | `(node_name, state_delta)` tuples |

### Async support

All three integration options have async variants:
- `AgentGuardNode.ainvoke(state)` for async graph execution
- `aguarded_stream(graph, ...)` — async generator wrapping `graph.astream()`
- `_GuardedToolNode.ainvoke(state)` for async ToolNode execution

---

## Public API Summary

```python
# CrewAI
from agentguard.integrations.crewai import AgentGuardCallback, crewai_guard

# AutoGen
from agentguard.integrations.autogen import AutoGenGuard, create_guarded_agent, wrap

# LangGraph
from agentguard.integrations.langgraph import (
    AgentGuardNode,
    guarded_stream,
    aguarded_stream,
    wrap_tool_node,
    create_branch_guard,
)

# All from top-level integrations package
from agentguard.integrations import (
    AgentGuardCallback,     # CrewAI native callback
    crewai_guard,           # CrewAI imperative hook
    AutoGenGuard,           # AutoGen decorator/guard
    create_guarded_agent,   # AutoGen agent patcher
    wrap,                   # AutoGen one-liner
    AgentGuardNode,         # LangGraph node
    guarded_stream,         # LangGraph streaming wrapper
    aguarded_stream,        # LangGraph async streaming
    wrap_tool_node,         # LangGraph ToolNode wrapper
    create_branch_guard,    # LangGraph branch-aware guards
)
```

---

## Test Coverage

| File | Tests | Status |
|------|-------|--------|
| `test_crewai_integration.py` | 81 | ✅ All passing |
| `test_autogen_integration.py` | 33 | ✅ All passing |
| `test_langgraph_integration.py` | 41 | ✅ All passing |
| **Total** | **124** | **✅ 124/124** |

Tests use mocked AgentGuard clients and mocked framework objects — no framework
packages need to be installed to run the test suite.
