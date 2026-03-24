"""AgentGuard — MCP Integration (Python).

Provides MCP (Model Context Protocol) runtime policy enforcement.

Usage::

    # Option 1: Wrap an existing MCP server (in-process interception)
    from mcp.server import Server
    from agentguard.integrations.mcp import wrap_server

    server = Server("my-server")
    protected = wrap_server(
        server,
        api_key="ag_...",
        agent_id="my-agent",
    )

    # Use `protected` instead of `server` — all tool calls go through AgentGuard
    protected.run(transport="stdio")


    # Option 2: Intercept individual tool calls manually
    from agentguard.integrations.mcp import McpGuard

    guard = McpGuard(api_key="ag_...", agent_id="my-agent")

    async def my_tool_handler(tool_name: str, arguments: dict):
        decision = await guard.intercept(tool_name, arguments, session_id="sess-001")
        if not decision.allowed:
            raise PermissionError(f"Tool blocked: {decision.reason}")
        return await execute_tool(tool_name, arguments)


    # Option 3: Use as an async context manager decorator
    @guard.enforce(session_id="sess-001")
    async def my_tool(path: str) -> str:
        return open(path).read()
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import urllib.request
from dataclasses import dataclass, field
from functools import wraps
from typing import Any, Callable, Dict, List, Optional


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class McpDecision:
    """Result of an AgentGuard MCP policy evaluation."""
    allowed: bool
    decision: str  # 'allow' | 'block' | 'hitl' | 'monitor'
    reason: str
    risk_score: int
    matched_rule_id: Optional[str] = None
    gate_id: Optional[str] = None
    gate_timeout_sec: Optional[int] = None
    evaluation_ms: float = 0.0

    @property
    def is_hitl(self) -> bool:
        return self.decision == "hitl"

    @property
    def is_blocked(self) -> bool:
        return self.decision == "block"

    @property
    def is_monitor(self) -> bool:
        return self.decision == "monitor"


@dataclass
class McpGuardConfig:
    """Configuration for the MCP guard."""
    api_key: str
    agent_id: str
    base_url: str = "https://api.agentguard.tech"
    session_id: Optional[str] = None
    strict: bool = True
    timeout_sec: float = 10.0


# ─── McpGuard ─────────────────────────────────────────────────────────────────

class McpGuard:
    """
    AgentGuard MCP Policy Enforcer.

    Evaluates MCP tool calls against the agent's active policy via the
    AgentGuard API. Supports blocking, monitoring, and HITL gating.

    Example::

        guard = McpGuard(api_key="ag_...", agent_id="my-agent")

        # Synchronous check
        decision = guard.intercept_sync("filesystem_write", {"path": "/etc/passwd"})
        if not decision.allowed:
            raise PermissionError(decision.reason)

        # Async check
        decision = await guard.intercept("web_request", {"url": "https://example.com"})
    """

    def __init__(
        self,
        api_key: str,
        agent_id: str,
        base_url: str = "https://api.agentguard.tech",
        session_id: Optional[str] = None,
        strict: bool = True,
        timeout_sec: float = 10.0,
    ) -> None:
        self._config = McpGuardConfig(
            api_key=api_key or os.environ.get("AGENTGUARD_API_KEY", ""),
            agent_id=agent_id or os.environ.get("AGENTGUARD_AGENT_ID", ""),
            base_url=base_url or os.environ.get("AGENTGUARD_API_URL", "https://api.agentguard.tech"),
            session_id=session_id,
            strict=strict,
            timeout_sec=timeout_sec,
        )
        self._session_id = session_id or f"mcp_{int(time.time())}"

    def intercept_sync(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        session_id: Optional[str] = None,
    ) -> McpDecision:
        """
        Synchronously evaluate an MCP tool call against the agent's policy.

        :param tool_name: The name of the MCP tool being called.
        :param arguments: The arguments passed to the tool.
        :param session_id: Session ID for audit continuity (optional).
        :returns: McpDecision with the policy result.
        """
        sid = session_id or self._session_id
        start = time.monotonic()

        payload = json.dumps({
            "request": {
                "method": "tools/call",
                "id": f"py-sdk-{int(time.time() * 1000)}",
                "params": {
                    "name": tool_name,
                    "arguments": arguments,
                },
            },
            "identity": {
                "agentId": self._config.agent_id,
                "sessionId": sid,
            },
        }).encode("utf-8")

        url = f"{self._config.base_url}/v1/mcp/intercept"
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._config.api_key}",
                "User-Agent": "agentguard-python-sdk/1.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=self._config.timeout_sec) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                evaluation_ms = (time.monotonic() - start) * 1000
                return McpDecision(
                    allowed=body.get("allowed", False),
                    decision=body.get("decision", "block"),
                    reason=body.get("reason", "Unknown"),
                    risk_score=body.get("riskScore", 0),
                    matched_rule_id=body.get("matchedRuleId"),
                    gate_id=body.get("gateId"),
                    gate_timeout_sec=body.get("gateTimeoutSec"),
                    evaluation_ms=evaluation_ms,
                )
        except Exception as exc:
            evaluation_ms = (time.monotonic() - start) * 1000
            if self._config.strict:
                # Fail closed
                return McpDecision(
                    allowed=False,
                    decision="block",
                    reason=f"AgentGuard evaluation failed (strict mode): {exc}",
                    risk_score=800,
                    evaluation_ms=evaluation_ms,
                )
            else:
                # Fail open
                return McpDecision(
                    allowed=True,
                    decision="allow",
                    reason=f"AgentGuard evaluation failed (permissive mode): {exc}",
                    risk_score=100,
                    evaluation_ms=evaluation_ms,
                )

    async def intercept(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        session_id: Optional[str] = None,
    ) -> McpDecision:
        """
        Async version of intercept_sync.
        Runs the synchronous HTTP call in a thread pool to avoid blocking.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.intercept_sync(tool_name, arguments, session_id),
        )

    def enforce(
        self,
        session_id: Optional[str] = None,
        tool_name_override: Optional[str] = None,
    ) -> Callable:
        """
        Decorator that enforces AgentGuard policy on an async function.

        The decorated function's name is used as the tool name unless
        ``tool_name_override`` is specified.

        Example::

            @guard.enforce(session_id="sess-001")
            async def filesystem_write(path: str, content: str) -> str:
                with open(path, "w") as f:
                    f.write(content)
                return "ok"

        :raises PermissionError: If the tool call is blocked.
        :raises RuntimeError: If HITL approval is pending.
        """
        def decorator(func: Callable) -> Callable:
            tool = tool_name_override or func.__name__

            @wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                # Build arguments dict from call signature
                arguments: Dict[str, Any] = {}
                import inspect
                sig = inspect.signature(func)
                params = list(sig.parameters.keys())
                for i, arg in enumerate(args):
                    if i < len(params):
                        arguments[params[i]] = arg
                arguments.update(kwargs)

                decision = await self.intercept(tool, arguments, session_id)

                if decision.is_blocked:
                    raise PermissionError(
                        f"AgentGuard: Tool '{tool}' is blocked — {decision.reason}"
                    )

                if decision.is_hitl:
                    raise RuntimeError(
                        f"AgentGuard: Tool '{tool}' requires human approval "
                        f"(gateId={decision.gate_id}, timeout={decision.gate_timeout_sec}s)"
                    )

                return await func(*args, **kwargs)

            @wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                # Build arguments dict
                import inspect
                sig = inspect.signature(func)
                params = list(sig.parameters.keys())
                arguments: Dict[str, Any] = {}
                for i, arg in enumerate(args):
                    if i < len(params):
                        arguments[params[i]] = arg
                arguments.update(kwargs)

                decision = self.intercept_sync(tool, arguments, session_id)

                if decision.is_blocked:
                    raise PermissionError(
                        f"AgentGuard: Tool '{tool}' is blocked — {decision.reason}"
                    )

                if decision.is_hitl:
                    raise RuntimeError(
                        f"AgentGuard: Tool '{tool}' requires human approval "
                        f"(gateId={decision.gate_id})"
                    )

                return func(*args, **kwargs)

            if asyncio.iscoroutinefunction(func):
                return async_wrapper
            return sync_wrapper

        return decorator


# ─── wrap_server ──────────────────────────────────────────────────────────────

def wrap_server(
    server: Any,
    api_key: str,
    agent_id: str,
    base_url: str = "https://api.agentguard.tech",
    session_id: Optional[str] = None,
    strict: bool = True,
) -> Any:
    """
    Wrap an MCP server instance with AgentGuard policy enforcement.

    Intercepts the server's tool call handler to evaluate each tool call
    against the agent's policy before execution.

    Works with MCP servers that follow the standard Python MCP SDK pattern:
    - ``server.call_tool(name, arguments)``
    - ``@server.call_tool()`` decorated handlers

    :param server: The MCP server instance to wrap.
    :param api_key: AgentGuard API key.
    :param agent_id: AgentGuard agent ID.
    :param base_url: AgentGuard API base URL.
    :param session_id: Session ID for audit continuity.
    :param strict: Block on policy eval errors (default: True).
    :returns: Wrapped server with the same interface.

    Example::

        from mcp.server import Server
        from agentguard.integrations.mcp import wrap_server

        server = Server("my-mcp-server")
        server = wrap_server(server, api_key="ag_...", agent_id="my-agent")

        @server.call_tool()
        async def filesystem_write(name: str, arguments: dict) -> list:
            path = arguments["path"]
            content = arguments["content"]
            with open(path, "w") as f:
                f.write(content)
            return [{"type": "text", "text": "Written successfully"}]

        # filesystem_write calls now go through AgentGuard policy check
    """
    guard = McpGuard(
        api_key=api_key,
        agent_id=agent_id,
        base_url=base_url,
        session_id=session_id,
        strict=strict,
    )

    # Wrap the server object using a proxy-like pattern
    return _McpServerWrapper(server, guard)


class _McpServerWrapper:
    """
    Internal wrapper that intercepts MCP server tool call handlers.
    """

    def __init__(self, server: Any, guard: McpGuard) -> None:
        self._server = server
        self._guard = guard

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._server, name)

        # Intercept call_tool decorator/method
        if name == "call_tool":
            return self._wrap_call_tool(attr)

        return attr

    def _wrap_call_tool(self, original: Any) -> Any:
        """
        Wraps the call_tool method/decorator to intercept tool calls.
        """
        if callable(original) and hasattr(original, "__call__"):
            def wrapped_decorator(*args: Any, **kwargs: Any) -> Any:
                decorator = original(*args, **kwargs)

                def inner(handler: Callable) -> Any:
                    @wraps(handler)
                    async def guarded_handler(name: str, arguments: Dict[str, Any], *hargs: Any, **hkwargs: Any) -> Any:
                        decision = await self._guard.intercept(name, arguments or {})

                        if decision.is_blocked:
                            return [{
                                "type": "text",
                                "text": json.dumps({
                                    "error": "blocked",
                                    "reason": decision.reason,
                                    "riskScore": decision.risk_score,
                                }),
                            }]

                        if decision.is_hitl:
                            return [{
                                "type": "text",
                                "text": json.dumps({
                                    "status": "hitl_pending",
                                    "gateId": decision.gate_id,
                                    "gateTimeoutSec": decision.gate_timeout_sec,
                                    "message": f"Tool '{name}' requires human approval",
                                }),
                            }]

                        return await handler(name, arguments, *hargs, **hkwargs)

                    return decorator(guarded_handler) if decorator is not None else guarded_handler

                return inner

            return wrapped_decorator

        return original
