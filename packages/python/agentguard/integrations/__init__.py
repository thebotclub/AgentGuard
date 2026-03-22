"""AgentGuard framework integrations.

Provides one-liner guards for popular Python agent frameworks:

- LangChain:  ``AgentGuardCallbackHandler`` / ``langchain_guard()``
- OpenAI:     ``openai_guard()``
- CrewAI:     ``AgentGuardCallback`` / ``crewai_guard()``
- AutoGen:    ``AutoGenGuard`` / ``create_guarded_agent()`` / ``wrap()``
- LangGraph:  ``AgentGuardNode`` / ``guarded_stream()`` / ``wrap_tool_node()``

Example::

    from agentguard.integrations import langchain_guard, openai_guard, crewai_guard
    from agentguard.integrations.crewai import AgentGuardCallback
    from agentguard.integrations.langgraph import AgentGuardNode, guarded_stream

All integrations use optional/peer dependency imports — the base ``agentguard``
package does not require any framework to be installed.
"""
from .langchain import AgentGuardCallbackHandler, langchain_guard
from .openai import openai_guard
from .crewai import AgentGuardCallback, crewai_guard, AgentGuardBlockError
from .autogen import AutoGenGuard, create_guarded_agent, wrap
from .langgraph import (
    AgentGuardNode,
    guarded_stream,
    aguarded_stream,
    wrap_tool_node,
    create_branch_guard,
)
from .a2a import A2AGuard
from .mcp import McpGuard, McpDecision, wrap_server

__all__ = [
    # LangChain
    "AgentGuardCallbackHandler",
    "langchain_guard",
    # OpenAI
    "openai_guard",
    # CrewAI
    "AgentGuardCallback",
    "crewai_guard",
    "AgentGuardBlockError",
    # AutoGen
    "AutoGenGuard",
    "create_guarded_agent",
    "wrap",
    # LangGraph
    "AgentGuardNode",
    "guarded_stream",
    "aguarded_stream",
    "wrap_tool_node",
    "create_branch_guard",
    # A2A
    "A2AGuard",
    # MCP
    "McpGuard",
    "McpDecision",
    "wrap_server",
]
