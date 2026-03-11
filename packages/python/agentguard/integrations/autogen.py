"""AgentGuard — AutoGen Integration (Python).

Production-quality integration for Microsoft's AutoGen framework (v0.2+ and
v0.4+). Provides two integration styles:

1. **Decorator-based** — wrap individual tool functions:

    .. code-block:: python

        from agentguard.integrations.autogen import AutoGenGuard

        guard = AutoGenGuard(api_key="ag_...")

        @guard.guard_tool
        def read_file(path: str) -> str:
            return open(path).read()

2. **Agent patching** — guard all tools on an existing ConversableAgent:

    .. code-block:: python

        from agentguard.integrations.autogen import create_guarded_agent

        guarded = create_guarded_agent(agent, api_key="ag_...")

Both approaches use duck-typing — no hard dependency on ``autogen`` or
``pyautogen``. Works with any structurally compatible agent or tool function.
"""
from __future__ import annotations

import functools
import inspect
import json
import logging
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Optional,
    TypeVar,
    Union,
    overload,
)

from ..client import AgentGuard
from .errors import AgentGuardBlockError

logger = logging.getLogger("agentguard.integrations.autogen")

F = TypeVar("F", bound=Callable[..., Any])


# ─── Result types ──────────────────────────────────────────────────────────────


class GuardResult:
    """Result of a tool call policy evaluation."""

    __slots__ = (
        "blocked",
        "decision",
        "risk_score",
        "reason",
        "suggestion",
        "alternatives",
        "matched_rule_id",
    )

    def __init__(self, raw: Dict[str, Any], *, blocked: bool) -> None:
        self.blocked: bool = blocked
        self.decision: str = raw.get("result", raw.get("decision", "allow"))
        self.risk_score: int = raw.get("riskScore", raw.get("risk_score", 0))
        self.reason: Optional[str] = raw.get("reason")
        self.suggestion: Optional[str] = raw.get("suggestion")
        self.alternatives: List[str] = raw.get("alternatives", [])
        self.matched_rule_id: Optional[str] = raw.get(
            "matchedRuleId", raw.get("matched_rule_id")
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "blocked": self.blocked,
            "decision": self.decision,
            "risk_score": self.risk_score,
            "reason": self.reason,
            "suggestion": self.suggestion,
            "alternatives": self.alternatives,
            "matched_rule_id": self.matched_rule_id,
        }


# ─── AutoGenGuard ──────────────────────────────────────────────────────────────


class AutoGenGuard:
    """Guard for AutoGen tool functions.

    Provides a ``guard_tool`` decorator that wraps tool functions with
    AgentGuard policy checks, and an ``evaluate`` method for manual
    pre-execution checks.

    Args:
        api_key:        AgentGuard API key (``ag_...``)
        base_url:       Override the AgentGuard API base URL
        agent_id:       Optional agent ID for scoped evaluations
        throw_on_block: When True, raise ``AgentGuardBlockError`` on block.
                        When False (default), call ``on_block`` and return None.
        on_block:       Callback invoked when a tool call is blocked.
                        Receives a ``GuardResult`` instance.
        on_allow:       Callback invoked when a tool call is allowed.
                        Receives a ``GuardResult`` instance.

    Example::

        guard = AutoGenGuard(api_key="ag_...")

        @guard.guard_tool
        def send_email(to: str, subject: str, body: str) -> str:
            # Only executes if AgentGuard allows it
            ...

        # Use with AutoGen's register_for_execution pattern:
        @user_proxy.register_for_execution()
        @assistant.register_for_llm(description="Send an email")
        @guard.guard_tool
        def send_email(to: str, subject: str, body: str) -> str:
            ...
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.agentguard.tech",
        agent_id: Optional[str] = None,
        throw_on_block: bool = False,
        on_block: Optional[Callable[[GuardResult], None]] = None,
        on_allow: Optional[Callable[[GuardResult], None]] = None,
    ) -> None:
        self._agent_id = agent_id
        self._throw_on_block = throw_on_block
        self._on_block = on_block
        self._on_allow = on_allow
        self._guard = AgentGuard(api_key=api_key, base_url=base_url)

    def evaluate(
        self,
        tool_name: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> GuardResult:
        """Evaluate a tool call against the policy engine.

        Args:
            tool_name: Name of the tool to evaluate
            params:    Tool arguments as a dict

        Returns:
            A ``GuardResult`` with the policy decision.

        Raises:
            AgentGuardBlockError: If ``throw_on_block=True`` and the tool is blocked.
        """
        raw = self._guard.evaluate(tool=tool_name, params=params or {})
        decision = raw.get("result", raw.get("decision", "allow"))
        blocked = decision in ("block", "require_approval")

        result = GuardResult(raw, blocked=blocked)

        if blocked:
            if self._on_block is not None:
                self._on_block(result)

            if self._throw_on_block:
                raise AgentGuardBlockError(
                    {
                        **raw,
                        "tool": tool_name,
                        "decision": decision,
                        "agent_id": self._agent_id,
                    }
                )
        else:
            if self._on_allow is not None:
                self._on_allow(result)

        return result

    @overload
    def guard_tool(self, func: F) -> F: ...

    @overload
    def guard_tool(
        self, *, name: Optional[str] = None
    ) -> Callable[[F], F]: ...

    def guard_tool(
        self,
        func: Optional[F] = None,
        *,
        name: Optional[str] = None,
    ) -> Union[F, Callable[[F], F]]:
        """Decorator that wraps a tool function with AgentGuard policy checks.

        Can be used with or without arguments::

            @guard.guard_tool
            def my_tool(x: int) -> int: ...

            @guard.guard_tool(name="custom_tool_name")
            def my_tool(x: int) -> int: ...

        When the tool is blocked:
        - If ``throw_on_block=True``: raises ``AgentGuardBlockError``
        - If ``throw_on_block=False`` (default): returns ``None`` and calls
          ``on_block`` callback if provided

        Args:
            func: The tool function to wrap (when used without parentheses)
            name: Override the tool name used for policy evaluation.
                  Defaults to the function's ``__name__``.

        Returns:
            The wrapped function (same signature as the original).
        """
        def decorator(fn: F) -> F:
            tool_name = name or fn.__name__

            if inspect.iscoroutinefunction(fn):
                @functools.wraps(fn)
                async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                    params = _extract_params(fn, args, kwargs)
                    result = self.evaluate(tool_name, params)
                    if result.blocked:
                        return None
                    return await fn(*args, **kwargs)

                return async_wrapper  # type: ignore[return-value]
            else:
                @functools.wraps(fn)
                def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                    params = _extract_params(fn, args, kwargs)
                    result = self.evaluate(tool_name, params)
                    if result.blocked:
                        return None
                    return fn(*args, **kwargs)

                return sync_wrapper  # type: ignore[return-value]

        if func is not None:
            # Used as @guard.guard_tool (no parentheses)
            return decorator(func)

        # Used as @guard.guard_tool(name="...") (with parentheses)
        return decorator

    def wrap_tool(
        self,
        tool_name: str,
        func: F,
    ) -> F:
        """Wrap a tool function with policy checks (non-decorator style).

        Args:
            tool_name: Name of the tool for policy evaluation
            func:      The original tool function

        Returns:
            A wrapped function that evaluates policy before executing.

        Example::

            guarded_read = guard.wrap_tool("read_file", read_file)
            result = guarded_read(path="/etc/passwd")
        """
        return self.guard_tool(func, name=tool_name)

    def patch_agent(self, agent: Any) -> None:
        """Patch an AutoGen ConversableAgent to guard all registered tools.

        Supports multiple AutoGen versions by detecting available tool
        registration patterns (duck-typed):

        - ``_tools`` dict (v0.2 ConversableAgent)
        - ``registered_tools`` dict
        - ``_function_map`` dict (v0.4+)

        Args:
            agent: An AutoGen ConversableAgent or structurally compatible object.

        Raises:
            TypeError: If no tool registration mechanism is detected.

        Example::

            from autogen import ConversableAgent

            agent = ConversableAgent(name="assistant", ...)
            guard.patch_agent(agent)
            # All tool calls now go through AgentGuard
        """
        patched = False

        # v0.4+: _function_map
        func_map = getattr(agent, "_function_map", None)
        if isinstance(func_map, dict) and func_map:
            for fn_name, fn in list(func_map.items()):
                if callable(fn):
                    func_map[fn_name] = self.wrap_tool(fn_name, fn)
                    patched = True

        # v0.2+: _tools
        tools = getattr(agent, "_tools", None)
        if isinstance(tools, dict) and tools:
            for fn_name, fn in list(tools.items()):
                if callable(fn):
                    tools[fn_name] = self.wrap_tool(fn_name, fn)
                    patched = True

        # Alternative: registered_tools
        registered = getattr(agent, "registered_tools", None)
        if isinstance(registered, dict) and registered:
            for fn_name, fn in list(registered.items()):
                if callable(fn):
                    registered[fn_name] = self.wrap_tool(fn_name, fn)
                    patched = True

        if not patched:
            raise TypeError(
                "AutoGenGuard.patch_agent: Could not detect tool registration "
                "on this agent. Expected _function_map, _tools, or "
                "registered_tools attribute with callable values."
            )

        logger.info("Patched agent with AgentGuard tool guards")


# ─── Convenience factory ───────────────────────────────────────────────────────


def create_guarded_agent(
    agent: Any,
    api_key: str,
    base_url: str = "https://api.agentguard.tech",
    agent_id: Optional[str] = None,
    throw_on_block: bool = False,
    on_block: Optional[Callable[[GuardResult], None]] = None,
    on_allow: Optional[Callable[[GuardResult], None]] = None,
) -> Any:
    """Patch an existing AutoGen agent with AgentGuard policy enforcement.

    Convenience function that creates an ``AutoGenGuard`` and patches the
    agent in one call. Returns the same agent (mutated in-place).

    Args:
        agent:          An AutoGen ConversableAgent or compatible object
        api_key:        AgentGuard API key (``ag_...``)
        base_url:       Override the AgentGuard API base URL
        agent_id:       Optional agent ID for scoped evaluations
        throw_on_block: Raise on block (default False — zero-throw)
        on_block:       Callback for blocked tool calls
        on_allow:       Callback for allowed tool calls

    Returns:
        The same agent, with all tool functions wrapped by AgentGuard.

    Example::

        from autogen import ConversableAgent
        from agentguard.integrations.autogen import create_guarded_agent

        agent = ConversableAgent(name="assistant", ...)
        agent.register_for_execution()(my_tool)

        create_guarded_agent(agent, api_key="ag_...")
        # agent's tools are now guarded
    """
    guard = AutoGenGuard(
        api_key=api_key,
        base_url=base_url,
        agent_id=agent_id,
        throw_on_block=throw_on_block,
        on_block=on_block,
        on_allow=on_allow,
    )
    guard.patch_agent(agent)
    return agent


# ─── Internal helpers ──────────────────────────────────────────────────────────


def _extract_params(
    func: Callable[..., Any],
    args: tuple,
    kwargs: Dict[str, Any],
) -> Dict[str, Any]:
    """Extract a params dict from function call arguments.

    Binds positional and keyword args to the function's parameter names
    so that policy evaluation sees named parameters regardless of how
    the function was called.
    """
    params: Dict[str, Any] = dict(kwargs)

    try:
        sig = inspect.signature(func)
        bound = sig.bind_partial(*args, **kwargs)
        bound.apply_defaults()
        params = dict(bound.arguments)
    except (ValueError, TypeError):
        # Fallback: merge positional args as indexed keys
        if args:
            params["_positional_args"] = list(args)

    # Remove 'self'/'cls' if present (method calls)
    params.pop("self", None)
    params.pop("cls", None)

    # Ensure all values are JSON-serializable for the API
    sanitised: Dict[str, Any] = {}
    for k, v in params.items():
        try:
            json.dumps(v)
            sanitised[k] = v
        except (TypeError, ValueError):
            sanitised[k] = str(v)

    return sanitised
