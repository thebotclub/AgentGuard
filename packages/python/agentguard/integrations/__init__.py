"""AgentGuard framework integrations.

Provides one-liner guards for popular Python agent frameworks:

- LangChain: ``AgentGuardCallbackHandler`` / ``langchain_guard()``
- OpenAI:    ``openai_guard()``
- CrewAI:    ``crewai_guard()``

Example::

    from agentguard.integrations import langchain_guard, openai_guard, crewai_guard

All integrations use optional/peer dependency imports — the base ``agentguard``
package does not require any framework to be installed.
"""
from .langchain import AgentGuardCallbackHandler, langchain_guard
from .openai import openai_guard
from .crewai import crewai_guard, AgentGuardBlockError
from .autogen import AutoGenGuard, create_guarded_agent
from .a2a import A2AGuard
from .mcp import McpGuard, McpDecision, wrap_server, createMcpProxy

__all__ = [
    "AgentGuardCallbackHandler",
    "langchain_guard",
    "openai_guard",
    "crewai_guard",
    "AgentGuardBlockError",
    "AutoGenGuard",
    "create_guarded_agent",
    "A2AGuard",
    # MCP
    "McpGuard",
    "McpDecision",
    "wrap_server",
    "createMcpProxy",
]
