"""AgentGuard — A2A (Agent-to-Agent) Protocol Integration (Python).

Security guardrails for Google's A2A protocol. Intercepts and evaluates
agent-to-agent task submissions, enforcing allowlists, scope limits,
input validation, and rate limiting per agent.

Usage::

    from agentguard.integrations.a2a import A2AGuard

    guard = A2AGuard(api_key="ag_...")

    # Validate an incoming task
    decision = guard.validate_task({
        "id": "task-1",
        "messages": [{"role": "user", "parts": [{"text": "..."}]}],
    }, caller_agent="agent-xyz")

    if decision["blocked"]:
        print(f"Blocked: {decision['reason']}")

    # As ASGI middleware
    app = guard.asgi_middleware(app)

    # As WSGI middleware
    app = guard.wsgi_middleware(app)
"""
import json
import re
import threading
import time
from fnmatch import fnmatch
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from ..client import AgentGuard
from .errors import AgentGuardBlockError


# ─── A2A task methods (protocol methods that carry tasks) ─────────────────────

A2A_TASK_METHODS: Set[str] = {
    "tasks/send",
    "tasks/sendSubscribe",
    "tasks/get",
    "tasks/cancel",
    "tasks/pushNotification/set",
    "tasks/pushNotification/get",
    "tasks/resubscribe",
}


# ─── In-memory rate limiter ──────────────────────────────────────────────────

class _RateLimiter:
    """Simple in-memory sliding-window rate limiter per agent."""

    def __init__(self, max_requests: int = 100, window_ms: int = 60_000) -> None:
        self._max = max_requests
        self._window_ms = window_ms
        self._entries: Dict[str, Tuple[int, float]] = {}  # agent -> (count, window_start)
        self._lock = threading.Lock()

    def check(self, agent_id: str) -> Dict[str, Any]:
        now = time.time() * 1000
        with self._lock:
            entry = self._entries.get(agent_id)
            if entry is None or now - entry[1] >= self._window_ms:
                self._entries[agent_id] = (1, now)
                return {"allowed": True, "remaining": self._max - 1, "reset_ms": self._window_ms}

            count, window_start = entry
            count += 1
            self._entries[agent_id] = (count, window_start)
            remaining = max(0, self._max - count)
            reset_ms = window_start + self._window_ms - now

            return {
                "allowed": count <= self._max,
                "remaining": remaining,
                "reset_ms": reset_ms,
            }


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _glob_match(pattern: str, value: str) -> bool:
    """Simple glob matching supporting * and ? wildcards."""
    return fnmatch(value, pattern)


def _is_agent_allowed(agent_id: str, allowed_agents: List[str]) -> bool:
    return any(_glob_match(p, agent_id) for p in allowed_agents)


def _extract_input_summary(messages: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    """Extract a summary of message parts for policy evaluation."""
    if not messages:
        return {}
    parts: List[Dict[str, Any]] = []
    for msg in messages:
        for part in msg.get("parts", []):
            if part.get("text"):
                parts.append({"type": "text", "text": part["text"]})
            elif part.get("file"):
                f = part["file"]
                parts.append({"type": "file", "name": f.get("name"), "mimeType": f.get("mimeType")})
            elif part.get("data"):
                parts.append({"type": "data", "keys": list(part["data"].keys())})
    return {"messageCount": len(messages), "parts": parts}


# ─── A2AGuard ────────────────────────────────────────────────────────────────

class A2AGuard:
    """Security guard for A2A (Agent-to-Agent) protocol interactions.

    Evaluates which agent is calling, what task they're requesting, and what
    inputs they're sending. Enforces agent allowlists, task scope limits,
    input validation, and rate limiting per agent.

    Args:
        api_key:         AgentGuard API key (ag_...).
        base_url:        Override the AgentGuard API base URL.
        agent_id:        Optional agent ID for scoped evaluations (this agent's identity).
        allowed_agents:  Allowlist of agent identifiers. Supports glob patterns.
        max_task_depth:  Maximum task delegation depth. Default: 10.
        throw_on_block:  Raise AgentGuardBlockError on block. Default: False.
        on_block:        Callback invoked on block decisions.
        on_allow:        Callback invoked on allow decisions.
        rate_limit_max:  Max requests per agent per window. Default: 100.
        rate_limit_window_ms: Rate limit window in ms. Default: 60000.

    Example::

        guard = A2AGuard(api_key="ag_...", allowed_agents=["trusted-*"])

        decision = guard.validate_task(task, caller_agent="agent-abc")
        if decision["blocked"]:
            return error_response(decision["reason"])
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.agentguard.tech",
        agent_id: Optional[str] = None,
        allowed_agents: Optional[List[str]] = None,
        max_task_depth: int = 10,
        throw_on_block: bool = False,
        on_block: Optional[Callable[[Dict[str, Any]], None]] = None,
        on_allow: Optional[Callable[[Dict[str, Any]], None]] = None,
        rate_limit_max: int = 100,
        rate_limit_window_ms: int = 60_000,
    ) -> None:
        self._guard = AgentGuard(api_key=api_key, base_url=base_url)
        self._agent_id = agent_id
        self._allowed_agents = allowed_agents or []
        self._max_task_depth = max_task_depth
        self._throw_on_block = throw_on_block
        self._on_block = on_block
        self._on_allow = on_allow
        self._rate_limiter = _RateLimiter(
            max_requests=rate_limit_max,
            window_ms=rate_limit_window_ms,
        )

    def _emit_decision(self, decision: Dict[str, Any]) -> Dict[str, Any]:
        if decision["blocked"]:
            if self._on_block:
                self._on_block(decision)
        else:
            if self._on_allow:
                self._on_allow(decision)
        return decision

    def _maybe_throw(self, decision: Dict[str, Any]) -> None:
        if self._throw_on_block and decision["blocked"]:
            raise AgentGuardBlockError({
                "tool": f"a2a:{decision.get('method', 'task')}",
                "decision": decision["decision"],
                "riskScore": decision["risk_score"],
                "reason": decision.get("reason"),
                "suggestion": decision.get("suggestion"),
            })

    def _evaluate_core(
        self,
        agent_id: str,
        task: Dict[str, Any],
        method: str,
        direction: str,
    ) -> Dict[str, Any]:
        """Core evaluation logic shared by all public methods.

        Args:
            agent_id:   The calling/target agent identifier.
            task:       The A2A task dict (must have 'id').
            method:     The A2A JSON-RPC method (e.g. 'tasks/send').
            direction:  'inbound' or 'outbound'.

        Returns:
            Decision dict with 'blocked', 'decision', 'risk_score', etc.
        """
        # ── Allowlist check ───────────────────────────────────────────
        if self._allowed_agents and not _is_agent_allowed(agent_id, self._allowed_agents):
            decision: Dict[str, Any] = {
                "blocked": True,
                "decision": "block",
                "risk_score": 900,
                "reason": f'Agent "{agent_id}" is not in the allowed agents list',
                "agent": agent_id,
                "method": method,
            }
            self._emit_decision(decision)
            self._maybe_throw(decision)
            return decision

        # ── Rate limit check ──────────────────────────────────────────
        rate_result = self._rate_limiter.check(agent_id)
        if not rate_result["allowed"]:
            reset_s = int(rate_result["reset_ms"] / 1000) + 1
            decision = {
                "blocked": True,
                "decision": "block",
                "risk_score": 700,
                "reason": f'Rate limit exceeded for agent "{agent_id}". Resets in {reset_s}s',
                "agent": agent_id,
                "method": method,
            }
            self._emit_decision(decision)
            self._maybe_throw(decision)
            return decision

        # ── Depth check ───────────────────────────────────────────────
        metadata = task.get("metadata", {}) or {}
        depth = metadata.get("depth", 0)
        if isinstance(depth, (int, float)) and depth > self._max_task_depth:
            decision = {
                "blocked": True,
                "decision": "block",
                "risk_score": 800,
                "reason": f"Task delegation depth ({depth}) exceeds maximum allowed ({self._max_task_depth})",
                "agent": agent_id,
                "method": method,
                "suggestion": "Reduce the chain of agent delegations or increase max_task_depth",
            }
            self._emit_decision(decision)
            self._maybe_throw(decision)
            return decision

        # ── AgentGuard policy evaluation ──────────────────────────────
        tool_name = f"a2a:{method}"
        input_summary = _extract_input_summary(task.get("messages"))

        result = self._guard.evaluate(
            tool=tool_name,
            params={
                "agent": agent_id,
                "direction": direction,
                "taskId": task.get("id", "unknown"),
                "sessionId": task.get("sessionId"),
                "depth": depth,
                **input_summary,
                **{k: v for k, v in metadata.items() if k != "depth"},
            },
        )

        policy_decision = result.get("result", result.get("decision", "allow"))
        is_blocked = policy_decision in ("block", "require_approval")

        decision = {
            "blocked": is_blocked,
            "decision": policy_decision,
            "risk_score": result.get("riskScore", result.get("risk_score", 0)),
            "reason": result.get("reason"),
            "agent": agent_id,
            "method": method,
            "matched_rule_id": result.get("matchedRuleId", result.get("matched_rule_id")),
            "suggestion": result.get("suggestion"),
        }

        self._emit_decision(decision)
        self._maybe_throw(decision)
        return decision

    def validate_task(
        self,
        task: Dict[str, Any],
        caller_agent: str = "unknown",
        method: str = "tasks/send",
    ) -> Dict[str, Any]:
        """Validate an A2A task (inbound or general-purpose check).

        Args:
            task:          The A2A task dict.
            caller_agent:  Identity of the calling agent.
            method:        The A2A method. Default: 'tasks/send'.

        Returns:
            Decision dict with 'blocked', 'decision', 'risk_score', etc.
        """
        return self._evaluate_core(caller_agent, task, method, "inbound")

    def guard_incoming(
        self,
        request: Dict[str, Any],
        caller_agent: str = "unknown",
    ) -> Dict[str, Any]:
        """Guard an incoming A2A JSON-RPC request.

        Parses the JSON-RPC request, extracts the task, and evaluates it.

        Args:
            request:       The A2A JSON-RPC request dict.
            caller_agent:  Identity of the calling agent.

        Returns:
            Decision dict with 'blocked', 'decision', 'risk_score', etc.
        """
        method = request.get("method", "")

        # Non-task methods pass through
        if method not in A2A_TASK_METHODS:
            decision: Dict[str, Any] = {
                "blocked": False,
                "decision": "allow",
                "risk_score": 0,
                "method": method,
                "reason": f'Non-task method "{method}" allowed by default',
            }
            self._emit_decision(decision)
            return decision

        params = request.get("params", {}) or {}
        task: Dict[str, Any] = {
            "id": params.get("id", params.get("taskId", "unknown")),
            "sessionId": params.get("sessionId"),
            "messages": [params["message"]] if "message" in params else params.get("messages", []),
            "metadata": params.get("metadata", {}),
        }

        return self._evaluate_core(caller_agent, task, method, "inbound")

    def guard_outgoing(
        self,
        task: Dict[str, Any],
        target_agent: str = "unknown",
        method: str = "tasks/send",
    ) -> Dict[str, Any]:
        """Guard an outbound A2A task before sending to another agent.

        Args:
            task:          The A2A task dict to send.
            target_agent:  Identity of the target agent.
            method:        The A2A method. Default: 'tasks/send'.

        Returns:
            Decision dict with 'blocked', 'decision', 'risk_score', etc.
        """
        return self._evaluate_core(target_agent, task, method, "outbound")

    # ─── ASGI Middleware ──────────────────────────────────────────────────

    def asgi_middleware(
        self,
        app: Any,
        path_prefix: str = "/a2a",
        agent_id_header: str = "x-agent-id",
    ) -> Any:
        """Wrap an ASGI app with A2A security middleware.

        Intercepts POST requests matching ``path_prefix``, parses the JSON-RPC
        body, and validates it. On block, returns a 403 JSON-RPC error response.

        Args:
            app:              The ASGI application to wrap.
            path_prefix:      URL path prefix to intercept. Default: '/a2a'.
            agent_id_header:  Header name for caller agent identity. Default: 'x-agent-id'.

        Returns:
            Wrapped ASGI application.

        Example::

            from agentguard.integrations.a2a import A2AGuard

            guard = A2AGuard(api_key="ag_...")
            app = guard.asgi_middleware(app)
        """
        header_key = agent_id_header.lower().encode("utf-8")

        async def middleware(scope: Dict[str, Any], receive: Any, send: Any) -> None:
            if scope["type"] != "http":
                await app(scope, receive, send)
                return

            path: str = scope.get("path", "")
            method: str = scope.get("method", "GET")

            if not path.startswith(path_prefix) or method != "POST":
                await app(scope, receive, send)
                return

            # Extract caller agent from headers
            headers = dict(scope.get("headers", []))
            caller_agent = (headers.get(header_key, b"unknown")).decode("utf-8", errors="replace")

            # Read request body
            body_parts: List[bytes] = []
            while True:
                message = await receive()
                body_parts.append(message.get("body", b""))
                if not message.get("more_body", False):
                    break
            body = b"".join(body_parts)

            try:
                rpc_request = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                await app(scope, receive, send)
                return

            if not isinstance(rpc_request, dict) or "method" not in rpc_request:
                await app(scope, receive, send)
                return

            try:
                decision = self.guard_incoming(rpc_request, caller_agent=caller_agent)
            except AgentGuardBlockError as exc:
                decision = {
                    "blocked": True,
                    "decision": exc.decision,
                    "risk_score": exc.risk_score,
                    "reason": exc.reason,
                }

            if decision["blocked"]:
                error_body = json.dumps({
                    "jsonrpc": "2.0",
                    "id": rpc_request.get("id"),
                    "error": {
                        "code": -32600,
                        "message": decision.get("reason", "Blocked by AgentGuard policy"),
                        "data": {
                            "decision": decision["decision"],
                            "riskScore": decision.get("risk_score", 0),
                            "agent": decision.get("agent"),
                        },
                    },
                }).encode("utf-8")

                await send({
                    "type": "http.response.start",
                    "status": 403,
                    "headers": [
                        [b"content-type", b"application/json"],
                        [b"content-length", str(len(error_body)).encode()],
                    ],
                })
                await send({"type": "http.response.body", "body": error_body})
                return

            # Replay the body for the inner app
            body_sent = False

            async def receive_replay() -> Dict[str, Any]:
                nonlocal body_sent
                if not body_sent:
                    body_sent = True
                    return {"type": "http.request", "body": body, "more_body": False}
                return await receive()

            await app(scope, receive_replay, send)

        return middleware

    # ─── WSGI Middleware ──────────────────────────────────────────────────

    def wsgi_middleware(
        self,
        app: Any,
        path_prefix: str = "/a2a",
        agent_id_header: str = "X-Agent-Id",
    ) -> Any:
        """Wrap a WSGI app with A2A security middleware.

        Intercepts POST requests matching ``path_prefix``, parses the JSON-RPC
        body, and validates it. On block, returns a 403 JSON-RPC error response.

        Args:
            app:              The WSGI application to wrap.
            path_prefix:      URL path prefix to intercept. Default: '/a2a'.
            agent_id_header:  Header name for caller agent identity. Default: 'X-Agent-Id'.

        Returns:
            Wrapped WSGI application.

        Example::

            from agentguard.integrations.a2a import A2AGuard

            guard = A2AGuard(api_key="ag_...")
            app = guard.wsgi_middleware(app)
        """
        # WSGI header format: HTTP_X_AGENT_ID
        wsgi_header = "HTTP_" + agent_id_header.upper().replace("-", "_")

        def middleware(environ: Dict[str, Any], start_response: Any) -> Any:
            path = environ.get("PATH_INFO", "")
            method = environ.get("REQUEST_METHOD", "GET")

            if not path.startswith(path_prefix) or method != "POST":
                return app(environ, start_response)

            caller_agent = environ.get(wsgi_header, "unknown")

            try:
                content_length = int(environ.get("CONTENT_LENGTH", 0) or 0)
                body = environ["wsgi.input"].read(content_length)
            except (ValueError, KeyError):
                return app(environ, start_response)

            try:
                rpc_request = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                return app(environ, start_response)

            if not isinstance(rpc_request, dict) or "method" not in rpc_request:
                return app(environ, start_response)

            try:
                decision = self.guard_incoming(rpc_request, caller_agent=caller_agent)
            except AgentGuardBlockError as exc:
                decision = {
                    "blocked": True,
                    "decision": exc.decision,
                    "risk_score": exc.risk_score,
                    "reason": exc.reason,
                }

            if decision["blocked"]:
                error_body = json.dumps({
                    "jsonrpc": "2.0",
                    "id": rpc_request.get("id"),
                    "error": {
                        "code": -32600,
                        "message": decision.get("reason", "Blocked by AgentGuard policy"),
                        "data": {
                            "decision": decision["decision"],
                            "riskScore": decision.get("risk_score", 0),
                            "agent": decision.get("agent"),
                        },
                    },
                }).encode("utf-8")

                start_response("403 Forbidden", [
                    ("Content-Type", "application/json"),
                    ("Content-Length", str(len(error_body))),
                ])
                return [error_body]

            # Replay body for the inner app via a BytesIO wrapper
            import io
            environ["wsgi.input"] = io.BytesIO(body)
            environ["CONTENT_LENGTH"] = str(len(body))
            return app(environ, start_response)

        return middleware
