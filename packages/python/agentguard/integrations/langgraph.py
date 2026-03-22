"""AgentGuard — LangGraph Streaming Integration (Python).

Intercepts tool calls during LangGraph graph execution, including streaming
graph runs.  Provides an ``AgentGuardNode`` that can be inserted into any
LangGraph graph, plus helpers for wrapping tool nodes and evaluating streaming
chunks against AgentGuard policies.

Usage
-----

**Option 1 — AgentGuardNode inserted into the graph:**

.. code-block:: python

    from langgraph.graph import StateGraph
    from agentguard.integrations.langgraph import AgentGuardNode

    guard_node = AgentGuardNode(api_key="ag_...")

    builder = StateGraph(MyState)
    builder.add_node("guard", guard_node)
    builder.add_node("tools", ToolNode(tools))

    # Insert guard before every tool execution
    builder.add_edge("agent", "guard")
    builder.add_conditional_edges(
        "guard",
        guard_node.route,                # routes "blocked" → END, else → "tools"
        {"tools": "tools", "blocked": END},
    )
    graph = builder.compile()

**Option 2 — Streaming wrapper (intercepts stream output):**

.. code-block:: python

    from agentguard.integrations.langgraph import guarded_stream

    for chunk in guarded_stream(graph, inputs, api_key="ag_..."):
        process(chunk)

**Option 3 — Wrap an existing ToolNode:**

.. code-block:: python

    from agentguard.integrations.langgraph import wrap_tool_node

    safe_tools = wrap_tool_node(ToolNode(tools), api_key="ag_...")
    builder.add_node("tools", safe_tools)

**Branch-specific policies:**

.. code-block:: python

    guard_node = AgentGuardNode(
        api_key="ag_...",
        branch_policies={
            "sensitive_branch": {"extra_scrutiny": True},
            "public_branch":    {"relaxed": True},
        },
    )

Design notes
------------
- Duck-typed: no hard dependency on ``langgraph`` is required.
- All streaming helpers are generator-based and forward chunks faithfully
  unless a block is detected.
- ``AgentGuardNode`` works with both sync and async LangGraph execution.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import (
    Any,
    AsyncGenerator,
    Callable,
    Dict,
    Generator,
    Iterator,
    List,
    Literal,
    Optional,
    Sequence,
    Union,
)

from ..client import AgentGuard
from .errors import AgentGuardBlockError

logger = logging.getLogger("agentguard.integrations.langgraph")

# Sentinel for the route destination when a tool call is blocked
_BLOCKED = "blocked"
_ALLOWED = "tools"


# ─── AgentGuardNode ────────────────────────────────────────────────────────────


class AgentGuardNode:
    """A LangGraph node that evaluates tool calls against AgentGuard policies.

    Insert this node into your LangGraph graph *before* the ToolNode (or any
    node that executes tools).  Use ``AgentGuardNode.route`` as the conditional
    edge routing function to branch on block/allow decisions.

    The node inspects the graph state for pending tool calls in standard
    LangGraph formats (OpenAI-style tool_calls on the last AI message, or a
    ``tool_calls`` list in the state dict) and evaluates each one.

    Args:
        api_key:         AgentGuard API key (``ag_...``)
        base_url:        Override the AgentGuard API base URL
        agent_id:        Optional agent ID for scoped evaluations
        branch_policies: Dict mapping branch/node names to policy metadata.
                         Passed as extra context when evaluating tool calls
                         originating from a specific branch.
        on_block:        Optional callback invoked on each blocked tool call.
                         Receives the ``AgentGuardBlockError`` instance.
        on_allow:        Optional callback invoked on each allowed tool call.
                         Receives the raw result dict.
        blocked_node:    Name of the destination node when a tool call is
                         blocked (default: ``"blocked"``).  Used by ``route()``.
        allowed_node:    Name of the destination node when all tool calls are
                         allowed (default: ``"tools"``).  Used by ``route()``.

    Example::

        from langgraph.graph import StateGraph, END
        from agentguard.integrations.langgraph import AgentGuardNode

        guard = AgentGuardNode(api_key="ag_...", agent_id="my-agent")

        builder = StateGraph(AgentState)
        builder.add_node("agent", call_model)
        builder.add_node("guard", guard)
        builder.add_node("tools", ToolNode(tools))

        builder.set_entry_point("agent")
        builder.add_edge("agent", "guard")
        builder.add_conditional_edges(
            "guard",
            guard.route,
            {"tools": "tools", "blocked": END},
        )
        builder.add_edge("tools", "agent")
        graph = builder.compile()
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.agentguard.tech",
        agent_id: Optional[str] = None,
        branch_policies: Optional[Dict[str, Any]] = None,
        on_block: Optional[Callable[[AgentGuardBlockError], None]] = None,
        on_allow: Optional[Callable[[Dict[str, Any]], None]] = None,
        blocked_node: str = _BLOCKED,
        allowed_node: str = _ALLOWED,
    ) -> None:
        self._agent_id = agent_id
        self._branch_policies = branch_policies or {}
        self._on_block = on_block
        self._on_allow = on_allow
        self._blocked_node = blocked_node
        self._allowed_node = allowed_node
        self._guard = AgentGuard(api_key=api_key, base_url=base_url)

        # Tracks the last routing decision (used by ``route()``)
        self._last_blocked: bool = False
        self._blocked_tool: Optional[str] = None
        self._blocked_reason: Optional[str] = None

    # ── Node callable interface ────────────────────────────────────────────────

    def __call__(self, state: Any) -> Any:
        """Evaluate pending tool calls in the current graph state (sync).

        Extracts tool calls from the state, evaluates each against AgentGuard
        policies, and marks the node's routing decision for ``route()``.

        Args:
            state: The current LangGraph state (dict or dataclass).

        Returns:
            The unmodified state dict (pass-through).  If a tool call is
            blocked, a ``__agentguard_blocked__`` key is added to the state
            with details about the block.

        Raises:
            AgentGuardBlockError: Only if the state dict contains
                ``__agentguard_raise_on_block__: True``.
        """
        tool_calls = self._extract_tool_calls(state)
        self._last_blocked = False
        self._blocked_tool = None
        self._blocked_reason = None

        for tc in tool_calls:
            tool_name = tc.get("name", tc.get("tool", "unknown"))
            params = tc.get("args", tc.get("arguments", tc.get("input", {})))
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except (json.JSONDecodeError, ValueError):
                    params = {"input": params}

            branch = self._detect_branch(state)
            branch_meta = self._branch_policies.get(branch, {})

            result = self._guard.evaluate(
                tool=tool_name,
                params={**params, **({f"__branch_{k}": v for k, v in branch_meta.items()} if branch_meta else {})},
            )
            decision = result.get("result", result.get("decision", "allow"))

            logger.debug(
                "AgentGuard [langgraph] tool=%s decision=%s risk=%s branch=%s",
                tool_name,
                decision,
                result.get("riskScore", result.get("risk_score", 0)),
                branch or "default",
            )

            if decision in ("block", "require_approval"):
                self._last_blocked = True
                self._blocked_tool = tool_name
                self._blocked_reason = result.get("reason", "Blocked by policy")

                err = AgentGuardBlockError(
                    {
                        **result,
                        "tool": tool_name,
                        "decision": decision,
                        "agent_id": self._agent_id,
                    }
                )
                if self._on_block is not None:
                    try:
                        self._on_block(err)
                    except Exception:  # noqa: BLE001
                        pass

                # Return state with block metadata (allows graph to continue
                # to the blocked_node instead of raising)
                state_dict = _state_to_dict(state)
                state_dict["__agentguard_blocked__"] = {
                    "tool": tool_name,
                    "decision": decision,
                    "reason": self._blocked_reason,
                    "risk_score": result.get("riskScore", result.get("risk_score", 0)),
                    "matched_rule_id": result.get("matchedRuleId", result.get("matched_rule_id")),
                    "agent_id": self._agent_id,
                }

                if state_dict.get("__agentguard_raise_on_block__"):
                    raise err

                return state_dict

            else:
                if self._on_allow is not None:
                    try:
                        self._on_allow(result)
                    except Exception:  # noqa: BLE001
                        pass

        return state

    async def ainvoke(self, state: Any) -> Any:
        """Async version of the node callable (for async LangGraph execution).

        Delegates to the sync implementation via ``asyncio.get_event_loop``.
        Override this for native async evaluation when needed.
        """
        return await asyncio.get_event_loop().run_in_executor(None, self.__call__, state)

    # ── Routing ────────────────────────────────────────────────────────────────

    def route(self, state: Any) -> str:
        """Conditional edge routing function for LangGraph.

        Returns the name of the destination node based on the last evaluation:
        - If any tool call was blocked → ``blocked_node`` (default: ``"blocked"``)
        - If all tool calls were allowed → ``allowed_node`` (default: ``"tools"``)

        Also checks the state dict for a ``__agentguard_blocked__`` key (set by
        ``__call__``) so routing works correctly even across async boundaries.

        Usage::

            builder.add_conditional_edges(
                "guard",
                guard_node.route,
                {"tools": "tools", "blocked": END},
            )
        """
        # Check state-level block marker (more reliable than instance state
        # in async/parallel graph execution)
        state_dict = _state_to_dict(state)
        if state_dict.get("__agentguard_blocked__"):
            return self._blocked_node

        if self._last_blocked:
            return self._blocked_node

        return self._allowed_node

    # ── Internal helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _extract_tool_calls(state: Any) -> List[Dict[str, Any]]:
        """Extract pending tool calls from a LangGraph state.

        Supports several common state shapes:
        - ``state["messages"][-1].tool_calls``  (OpenAI-style AIMessage)
        - ``state["tool_calls"]``               (explicit list in state)
        - ``state["messages"][-1]["tool_calls"]`` (dict-style message)
        """
        tool_calls: List[Dict[str, Any]] = []

        # Duck-typed: works with both dict and object states
        state_dict = _state_to_dict(state)

        # Explicit tool_calls in state (non-messages style)
        explicit = state_dict.get("tool_calls")
        if isinstance(explicit, list):
            return [tc if isinstance(tc, dict) else vars(tc) for tc in explicit]

        # Messages-style state — inspect last message
        messages = state_dict.get("messages", [])
        if messages:
            last = messages[-1]
            # Dict-style
            if isinstance(last, dict) and "tool_calls" in last:
                tc_list = last["tool_calls"]
                if tc_list:
                    tool_calls = [
                        tc if isinstance(tc, dict) else vars(tc) for tc in tc_list
                    ]
            else:
                # Object-style (LangChain BaseMessage / AIMessage)
                # Check for non-empty tool_calls attribute first
                tc_list = getattr(last, "tool_calls", None)
                if tc_list:
                    tool_calls = [
                        tc if isinstance(tc, dict) else {
                            "name": getattr(tc, "name", ""),
                            "args": getattr(tc, "args", {}),
                            "id": getattr(tc, "id", ""),
                        }
                        for tc in tc_list
                    ]
                else:
                    # OpenAI additional_kwargs style (fallback when tool_calls is
                    # absent or None/empty)
                    akw = getattr(last, "additional_kwargs", None) or {}
                    if "tool_calls" in akw:
                        for tc in akw["tool_calls"]:
                            fn = tc.get("function", {})
                            raw_args = fn.get("arguments", "{}")
                            try:
                                args = json.loads(raw_args)
                            except (json.JSONDecodeError, ValueError):
                                args = {"input": raw_args}
                            tool_calls.append({
                                "name": fn.get("name", "unknown"),
                                "args": args,
                                "id": tc.get("id", ""),
                            })

        return tool_calls

    @staticmethod
    def _detect_branch(state: Any) -> Optional[str]:
        """Try to detect the current graph branch from the state."""
        state_dict = _state_to_dict(state)
        return state_dict.get("__agentguard_branch__") or state_dict.get("branch")


# ─── Streaming helpers ─────────────────────────────────────────────────────────


def guarded_stream(
    graph: Any,
    inputs: Any,
    api_key: str,
    base_url: str = "https://api.agentguard.tech",
    agent_id: Optional[str] = None,
    on_block: Optional[Callable[[AgentGuardBlockError], None]] = None,
    config: Optional[Dict[str, Any]] = None,
    stream_mode: str = "values",
) -> Generator[Any, None, None]:
    """Wrap a LangGraph graph's ``.stream()`` with AgentGuard policy enforcement.

    Intercepts streaming chunks that contain tool calls and evaluates them
    before forwarding the chunk downstream.  Blocked tool calls raise
    ``AgentGuardBlockError`` (default) or invoke ``on_block`` and stop the
    stream.

    This is the simplest integration: you do NOT need to modify the graph
    structure at all.  Just replace ``graph.stream(...)`` with
    ``guarded_stream(graph, ...)``.

    Args:
        graph:       A compiled LangGraph graph (must have a ``.stream()`` method)
        inputs:      Graph inputs (same as you'd pass to ``graph.stream()``)
        api_key:     AgentGuard API key (``ag_...``)
        base_url:    Override the AgentGuard API base URL
        agent_id:    Optional agent ID for scoped evaluations
        on_block:    Optional callback invoked on block.  If provided, the
                     stream stops after invoking the callback but does NOT
                     raise.  If not provided, ``AgentGuardBlockError`` is raised.
        config:      Optional LangChain RunnableConfig dict to pass to graph
        stream_mode: LangGraph stream mode (default: ``"values"``)

    Yields:
        Graph state chunks (same as ``graph.stream()``), except chunks that
        contain blocked tool calls are filtered out and the stream ends.

    Raises:
        AgentGuardBlockError: When a tool call is blocked and ``on_block`` is
                              not provided.

    Example::

        from agentguard.integrations.langgraph import guarded_stream

        for chunk in guarded_stream(graph, {"messages": [user_msg]}, api_key="ag_..."):
            print(chunk)
    """
    guard = AgentGuard(api_key=api_key, base_url=base_url)
    stream_kwargs: Dict[str, Any] = {"stream_mode": stream_mode}
    if config is not None:
        stream_kwargs["config"] = config

    for chunk in graph.stream(inputs, **stream_kwargs):
        # Extract and evaluate any tool calls in the chunk
        blocked = _evaluate_chunk(guard, chunk, agent_id)
        if blocked is not None:
            err = blocked
            if on_block is not None:
                try:
                    on_block(err)
                except Exception:  # noqa: BLE001
                    pass
                return  # Stop stream after on_block
            raise err
        yield chunk


async def aguarded_stream(
    graph: Any,
    inputs: Any,
    api_key: str,
    base_url: str = "https://api.agentguard.tech",
    agent_id: Optional[str] = None,
    on_block: Optional[Callable[[AgentGuardBlockError], None]] = None,
    config: Optional[Dict[str, Any]] = None,
    stream_mode: str = "values",
) -> AsyncGenerator[Any, None]:
    """Async version of ``guarded_stream()``.

    Wraps a LangGraph graph's ``.astream()`` method with AgentGuard policy
    enforcement.

    Args:
        graph:       A compiled LangGraph graph (must have an ``.astream()`` method)
        inputs:      Graph inputs
        api_key:     AgentGuard API key
        base_url:    Override the AgentGuard API base URL
        agent_id:    Optional agent ID for scoped evaluations
        on_block:    Optional async or sync callback on block
        config:      Optional LangChain RunnableConfig dict
        stream_mode: LangGraph stream mode (default: ``"values"``)

    Yields:
        Graph state chunks.

    Raises:
        AgentGuardBlockError: When a tool call is blocked and ``on_block`` is None.

    Example::

        async for chunk in aguarded_stream(graph, inputs, api_key="ag_..."):
            process(chunk)
    """
    guard = AgentGuard(api_key=api_key, base_url=base_url)
    stream_kwargs: Dict[str, Any] = {"stream_mode": stream_mode}
    if config is not None:
        stream_kwargs["config"] = config

    async for chunk in graph.astream(inputs, **stream_kwargs):
        blocked = _evaluate_chunk(guard, chunk, agent_id)
        if blocked is not None:
            err = blocked
            if on_block is not None:
                try:
                    if asyncio.iscoroutinefunction(on_block):
                        await on_block(err)
                    else:
                        on_block(err)
                except Exception:  # noqa: BLE001
                    pass
                return
            raise err
        yield chunk


# ─── ToolNode wrapper ──────────────────────────────────────────────────────────


def wrap_tool_node(
    tool_node: Any,
    api_key: str,
    base_url: str = "https://api.agentguard.tech",
    agent_id: Optional[str] = None,
    on_block: Optional[Callable[[AgentGuardBlockError], None]] = None,
) -> "_GuardedToolNode":
    """Wrap a LangGraph ToolNode with AgentGuard policy enforcement.

    Returns a drop-in replacement for the original ToolNode that evaluates
    every tool call against AgentGuard policies before execution.

    Args:
        tool_node: A LangGraph ToolNode (or any callable node)
        api_key:   AgentGuard API key (``ag_...``)
        base_url:  Override the AgentGuard API base URL
        agent_id:  Optional agent ID for scoped evaluations
        on_block:  Optional callback invoked on block.  If provided, the
                   tool call is skipped but execution continues.
                   If not provided, raises ``AgentGuardBlockError``.

    Returns:
        A wrapped node with the same interface as the original ToolNode.

    Example::

        from langgraph.prebuilt import ToolNode
        from agentguard.integrations.langgraph import wrap_tool_node

        tool_node = ToolNode(tools)
        guarded_tools = wrap_tool_node(tool_node, api_key="ag_...")
        builder.add_node("tools", guarded_tools)
    """
    return _GuardedToolNode(
        tool_node=tool_node,
        api_key=api_key,
        base_url=base_url,
        agent_id=agent_id,
        on_block=on_block,
    )


class _GuardedToolNode:
    """Thin wrapper around a LangGraph ToolNode that gates calls via AgentGuard."""

    def __init__(
        self,
        tool_node: Any,
        api_key: str,
        base_url: str,
        agent_id: Optional[str],
        on_block: Optional[Callable[[AgentGuardBlockError], None]],
    ) -> None:
        self._tool_node = tool_node
        self._agent_id = agent_id
        self._on_block = on_block
        self._guard = AgentGuard(api_key=api_key, base_url=base_url)

    def __call__(self, state: Any) -> Any:
        """Evaluate tool calls before delegating to the underlying ToolNode."""
        tool_calls = AgentGuardNode._extract_tool_calls(state)

        for tc in tool_calls:
            tool_name = tc.get("name", tc.get("tool", "unknown"))
            params = tc.get("args", tc.get("arguments", tc.get("input", {})))
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except (json.JSONDecodeError, ValueError):
                    params = {"input": params}

            result = self._guard.evaluate(tool=tool_name, params=params or {})
            decision = result.get("result", result.get("decision", "allow"))

            if decision in ("block", "require_approval"):
                err = AgentGuardBlockError(
                    {
                        **result,
                        "tool": tool_name,
                        "decision": decision,
                        "agent_id": self._agent_id,
                    }
                )
                if self._on_block is not None:
                    try:
                        self._on_block(err)
                    except Exception:  # noqa: BLE001
                        pass
                    # Skip execution of this tool call — return state unchanged
                    return state
                raise err

        return self._tool_node(state)

    async def ainvoke(self, state: Any) -> Any:
        """Async variant — evaluates policies and delegates to the tool node."""
        tool_calls = AgentGuardNode._extract_tool_calls(state)

        for tc in tool_calls:
            tool_name = tc.get("name", tc.get("tool", "unknown"))
            params = tc.get("args", tc.get("arguments", tc.get("input", {})))
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except (json.JSONDecodeError, ValueError):
                    params = {"input": params}

            result = await asyncio.get_event_loop().run_in_executor(
                None, self._guard.evaluate, tool_name, params or {}
            )
            decision = result.get("result", result.get("decision", "allow"))

            if decision in ("block", "require_approval"):
                err = AgentGuardBlockError(
                    {
                        **result,
                        "tool": tool_name,
                        "decision": decision,
                        "agent_id": self._agent_id,
                    }
                )
                if self._on_block is not None:
                    try:
                        if asyncio.iscoroutinefunction(self._on_block):
                            await self._on_block(err)
                        else:
                            self._on_block(err)
                    except Exception:  # noqa: BLE001
                        pass
                    return state
                raise err

        # Delegate to underlying tool node (sync or async)
        if hasattr(self._tool_node, "ainvoke"):
            return await self._tool_node.ainvoke(state)
        return await asyncio.get_event_loop().run_in_executor(
            None, self._tool_node, state
        )


# ─── Branch-aware guard factory ────────────────────────────────────────────────


def create_branch_guard(
    api_key: str,
    branches: Dict[str, Optional[str]],
    base_url: str = "https://api.agentguard.tech",
    **kwargs: Any,
) -> Dict[str, AgentGuardNode]:
    """Create a dict of ``AgentGuardNode`` instances, one per graph branch.

    Useful when different branches of a LangGraph graph require different
    policy contexts (e.g., a "sensitive" branch vs. a "public" branch).

    Args:
        api_key:  AgentGuard API key
        branches: Dict mapping branch name → agent_id (or None).
                  Each branch gets its own ``AgentGuardNode`` tagged with
                  the given agent_id.
        base_url: Override the AgentGuard API base URL
        **kwargs: Additional kwargs forwarded to each ``AgentGuardNode``

    Returns:
        Dict mapping branch name → ``AgentGuardNode`` instance.

    Example::

        guards = create_branch_guard(
            api_key="ag_...",
            branches={
                "sensitive_branch": "agent-sensitive",
                "public_branch":    "agent-public",
            },
        )

        builder.add_node("guard_sensitive", guards["sensitive_branch"])
        builder.add_node("guard_public",    guards["public_branch"])
    """
    return {
        branch: AgentGuardNode(
            api_key=api_key,
            base_url=base_url,
            agent_id=agent_id,
            **kwargs,
        )
        for branch, agent_id in branches.items()
    }


# ─── Internal helpers ──────────────────────────────────────────────────────────


def _state_to_dict(state: Any) -> Dict[str, Any]:
    """Normalise a LangGraph state to a plain dict."""
    if isinstance(state, dict):
        return state
    # Try Pydantic-style model_dump() first (before __dict__ fallback, since
    # model_dump returns the model's *field* values, not internal attrs)
    if hasattr(state, "model_dump") and callable(state.model_dump):
        try:
            return state.model_dump()
        except Exception:  # noqa: BLE001
            pass
    if hasattr(state, "__dict__"):
        d = vars(state)
        # Skip if __dict__ only contains class internals (e.g. empty instance dict)
        if d:
            return d
    return {}


def _evaluate_chunk(
    guard: AgentGuard,
    chunk: Any,
    agent_id: Optional[str],
) -> Optional[AgentGuardBlockError]:
    """Evaluate all tool calls in a streaming graph chunk.

    Returns an ``AgentGuardBlockError`` if any tool call is blocked,
    otherwise returns ``None``.

    The chunk can be:
    - A raw state dict (stream_mode="values")
    - A tuple ``(node_name, state_delta)`` (stream_mode="updates")
    - Any other value (no tool calls to evaluate)
    """
    state: Any = chunk

    # stream_mode="updates" → (node_name, state_delta)
    if isinstance(chunk, tuple) and len(chunk) == 2:
        _, state = chunk

    tool_calls = AgentGuardNode._extract_tool_calls(state)

    for tc in tool_calls:
        tool_name = tc.get("name", tc.get("tool", "unknown"))
        params = tc.get("args", tc.get("arguments", tc.get("input", {})))
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except (json.JSONDecodeError, ValueError):
                params = {"input": params}

        result = guard.evaluate(tool=tool_name, params=params or {})
        decision = result.get("result", result.get("decision", "allow"))

        logger.debug(
            "AgentGuard [stream] tool=%s decision=%s risk=%s",
            tool_name,
            decision,
            result.get("riskScore", result.get("risk_score", 0)),
        )

        if decision in ("block", "require_approval"):
            return AgentGuardBlockError(
                {
                    **result,
                    "tool": tool_name,
                    "decision": decision,
                    "agent_id": agent_id,
                }
            )

    return None
