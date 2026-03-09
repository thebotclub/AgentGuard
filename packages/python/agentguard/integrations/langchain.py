"""AgentGuard — LangChain Integration (Python).

Drop-in callback handler that evaluates every LangChain tool call through
AgentGuard's policy engine. Structurally compatible with LangChain's
BaseCallbackHandler interface — no hard dep on langchain is required.

Usage::

    from agentguard.integrations import langchain_guard

    # Pass as a callback to AgentExecutor or any LangChain chain:
    handler = langchain_guard(api_key="ag_...")

    executor = AgentExecutor.from_agent_and_tools(
        agent=agent,
        tools=tools,
        callbacks=[handler],
    )

On a block decision, ``AgentGuardBlockError`` is raised — LangChain will
surface it as a tool execution error to the caller.
"""
import json
from typing import Any, Dict, Optional, Union

from ..client import AgentGuard
from .errors import AgentGuardBlockError


class AgentGuardCallbackHandler:
    """LangChain callback handler that intercepts every tool call.

    Evaluates each tool call through the AgentGuard policy engine before
    allowing execution to proceed. Throws ``AgentGuardBlockError`` on block
    or require_approval decisions.

    Structurally compatible with ``langchain.callbacks.base.BaseCallbackHandler``
    — pass an instance anywhere LangChain accepts a callback handler.

    Args:
        api_key:   AgentGuard API key (``ag_...``)
        base_url:  Optional override for the AgentGuard API base URL
        agent_id:  Optional agent ID for scoped evaluations
    """

    name = "AgentGuardCallbackHandler"

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.agentguard.tech",
        agent_id: Optional[str] = None,
    ) -> None:
        self._agent_id = agent_id
        self._guard = AgentGuard(api_key=api_key, base_url=base_url)

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: Union[str, Dict[str, Any]],
        **kwargs: Any,
    ) -> None:
        """Called by LangChain before every tool invocation.

        Evaluates the tool call against the AgentGuard policy engine.
        Raises ``AgentGuardBlockError`` if the decision is "block" or
        "require_approval".

        Args:
            serialized:  LangChain tool serialization (must contain ``name``)
            input_str:   Tool input as a string or dict
        """
        tool_name: str = serialized.get("name", serialized.get("id", ["unknown"])[-1])

        # Normalise input
        if isinstance(input_str, str):
            try:
                parsed = json.loads(input_str)
                params: Dict[str, Any] = parsed if isinstance(parsed, dict) else {"input": input_str}
            except (json.JSONDecodeError, ValueError):
                params = {"input": input_str}
        elif isinstance(input_str, dict):
            params = input_str
        else:
            params = {"input": str(input_str)}

        result = self._guard.evaluate(tool=tool_name, params=params)

        # Normalise field names (API returns snake_case or camelCase depending on version)
        decision = result.get("result", result.get("decision", "allow"))

        if decision in ("block", "require_approval"):
            raise AgentGuardBlockError({
                **result,
                "tool": tool_name,
                "decision": decision,
                "agent_id": self._agent_id,
            })

    def on_tool_end(self, output: str, **kwargs: Any) -> None:
        """Called after successful tool execution. No-op."""

    def on_tool_error(self, error: BaseException, **kwargs: Any) -> None:
        """Called after tool execution errors. No-op."""


def langchain_guard(
    api_key: str,
    base_url: str = "https://api.agentguard.tech",
    agent_id: Optional[str] = None,
) -> AgentGuardCallbackHandler:
    """Create an AgentGuard LangChain callback handler.

    One-liner integration::

        from agentguard.integrations import langchain_guard

        executor = AgentExecutor.from_agent_and_tools(
            agent=agent,
            tools=tools,
            callbacks=[langchain_guard(api_key="ag_...")],
        )

    Args:
        api_key:   AgentGuard API key (``ag_...``)
        base_url:  Optional override for the AgentGuard API base URL
        agent_id:  Optional agent ID for scoped evaluations

    Returns:
        An ``AgentGuardCallbackHandler`` instance ready to pass as a callback.
    """
    return AgentGuardCallbackHandler(api_key=api_key, base_url=base_url, agent_id=agent_id)
