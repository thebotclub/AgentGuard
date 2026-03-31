"""AgentGuard — OpenClaw Integration (Python).

Provides OpenClaw plugin-compatible policy enforcement via AgentGuard.
Intercepts tool calls before execution by evaluating them against the
agent's active YAML policy.

Usage::

    # In your OpenClaw agent project, add to openclaw.json:
    # {
    #   "plugins": {
    #     "entries": {
    #       "agentguard": {
    #         "enabled": true,
    #         "config": {
    #           "apiKey": "${AGENTGUARD_API_KEY}",
    #           "agentId": "my-agent",
    #           "strict": true
    #         }
    #       }
    #     },
    #     "installs": {
    #       "agentguard": {
    #         "source": "npm",
    #         "spec": "@the-bot-club/agentguard@^1.0.0"
    #       }
    #     }
    #   }
    # }

    # For Python-side interception of OpenClaw tool events:
    from agentguard.integrations.openclaw import OpenClawGuard, openclaw_guard

    guard = openclaw_guard(
        api_key=os.environ["AGENTGUARD_API_KEY"],
        agent_id="my-agent",
    )

    # Intercept a tool call event from OpenClaw:
    async def before_tool_call(event: dict) -> dict | None:
        decision = await guard.intercept(
            tool_name=event["toolName"],
            params=event.get("params", {}),
            session_id=event.get("sessionId"),
            run_id=event.get("runId"),
            tool_call_id=event.get("toolCallId"),
        )
        if decision.is_blocked or decision.is_hitl:
            return {
                "block": True,
                "blockReason": decision.reason,
            }
        return None

    # Synchronous variant:
    decision = guard.intercept_sync("web_search", {"query": "agent frameworks"})
    if not decision.allowed:
        raise PermissionError(f"Tool blocked: {decision.reason}")
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Optional


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class OpenClawDecision:
    """Result of an AgentGuard OpenClaw policy evaluation."""
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

    def to_openclaw_result(self) -> Optional[Dict[str, Any]]:
        """
        Convert to an OpenClaw ``before_tool_call`` hook return value.

        Returns a dict with ``block`` and ``blockReason`` when the decision
        requires halting execution, or ``None`` to allow the call to proceed.
        """
        if self.is_blocked:
            return {
                "block": True,
                "blockReason": f"AgentGuard: {self.reason}",
            }
        if self.is_hitl:
            return {
                "block": True,
                "blockReason": json.dumps({
                    "status": "hitl_pending",
                    "gateId": self.gate_id,
                    "gateTimeoutSec": self.gate_timeout_sec,
                    "reason": self.reason,
                }),
            }
        return None


# ─── OpenClawGuard ────────────────────────────────────────────────────────────

class OpenClawGuard:
    """
    AgentGuard OpenClaw Policy Enforcer.

    Evaluates OpenClaw tool calls against the agent's active policy via the
    AgentGuard API. Supports blocking, monitoring, and HITL gating.

    Designed to be called from an OpenClaw ``before_tool_call`` plugin hook,
    but also usable as a standalone interceptor in any Python codebase.

    Example::

        guard = OpenClawGuard(api_key="ag_...", agent_id="my-agent")

        # Synchronous check
        decision = guard.intercept_sync(
            tool_name="filesystem_write",
            params={"path": "/etc/passwd", "content": "..."},
        )
        if not decision.allowed:
            raise PermissionError(decision.reason)

        # Async check
        decision = await guard.intercept(
            tool_name="web_request",
            params={"url": "https://example.com"},
        )

        # OpenClaw hook return value
        hook_result = decision.to_openclaw_result()  # None = allow
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
        self._api_key = api_key
        self._agent_id = agent_id
        self._base_url = base_url
        self._session_id = session_id or f"openclaw_{int(time.time())}"
        self._strict = strict
        self._timeout_sec = timeout_sec

    def intercept_sync(
        self,
        tool_name: str,
        params: Dict[str, Any],
        session_id: Optional[str] = None,
        run_id: Optional[str] = None,
        tool_call_id: Optional[str] = None,
    ) -> OpenClawDecision:
        """
        Synchronously evaluate an OpenClaw tool call against the agent's policy.

        :param tool_name: The name of the tool being called.
        :param params: The parameters passed to the tool.
        :param session_id: Session ID for audit continuity (optional).
        :param run_id: OpenClaw run ID from the event (optional).
        :param tool_call_id: OpenClaw tool call ID from the event (optional).
        :returns: OpenClawDecision with the policy result.
        """
        sid = session_id or self._session_id
        call_id = tool_call_id or f"py-sdk-{int(time.time() * 1000)}"
        start = time.monotonic()

        payload = json.dumps({
            "request": {
                "method": "tool_call",
                "id": call_id,
                "params": {
                    "name": tool_name,
                    "arguments": params,
                },
            },
            "identity": {
                "agentId": self._agent_id,
                "sessionId": sid,
                "runId": run_id,
            },
        }).encode("utf-8")

        url = f"{self._base_url}/v1/openclaw/intercept"
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._api_key}",
                "User-Agent": "agentguard-python-sdk/1.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=self._timeout_sec) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                evaluation_ms = (time.monotonic() - start) * 1000
                return OpenClawDecision(
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
            if self._strict:
                # Fail closed
                return OpenClawDecision(
                    allowed=False,
                    decision="block",
                    reason=f"AgentGuard evaluation failed (strict mode): {exc}",
                    risk_score=800,
                    evaluation_ms=evaluation_ms,
                )
            else:
                # Fail open
                return OpenClawDecision(
                    allowed=True,
                    decision="allow",
                    reason=f"AgentGuard evaluation failed (permissive mode): {exc}",
                    risk_score=100,
                    evaluation_ms=evaluation_ms,
                )

    async def intercept(
        self,
        tool_name: str,
        params: Dict[str, Any],
        session_id: Optional[str] = None,
        run_id: Optional[str] = None,
        tool_call_id: Optional[str] = None,
    ) -> OpenClawDecision:
        """
        Async version of intercept_sync.
        Runs the synchronous HTTP call in a thread pool to avoid blocking.
        """
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.intercept_sync(tool_name, params, session_id, run_id, tool_call_id),
        )

    async def before_tool_call(
        self,
        event: Dict[str, Any],
        ctx: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        OpenClaw-compatible ``before_tool_call`` hook handler.

        Accepts the raw OpenClaw event dict and returns either a block dict
        or ``None`` to allow execution to proceed.

        :param event: OpenClaw tool call event with ``toolName``, ``params``,
                      and optional ``runId`` / ``toolCallId`` fields.
        :param ctx: OpenClaw context dict (optional), may contain ``sessionId``.
        :returns: ``{"block": True, "blockReason": "..."}`` or ``None``.

        Example::

            guard = OpenClawGuard(api_key="ag_...", agent_id="my-agent")

            # Register as an OpenClaw hook:
            plugin.on("before_tool_call", guard.before_tool_call)
        """
        session_id = (ctx or {}).get("sessionId")
        decision = await self.intercept(
            tool_name=event.get("toolName", ""),
            params=event.get("params", {}),
            session_id=session_id,
            run_id=event.get("runId"),
            tool_call_id=event.get("toolCallId"),
        )
        return decision.to_openclaw_result()


# ─── Factory Function ─────────────────────────────────────────────────────────

def openclaw_guard(
    api_key: Optional[str] = None,
    agent_id: Optional[str] = None,
    base_url: str = "https://api.agentguard.tech",
    session_id: Optional[str] = None,
    strict: bool = True,
    timeout_sec: float = 10.0,
) -> OpenClawGuard:
    """
    Create an OpenClawGuard instance.

    Reads ``AGENTGUARD_API_KEY`` and ``AGENTGUARD_AGENT_ID`` from environment
    variables if not provided explicitly.

    :param api_key: AgentGuard API key (ag_...).
    :param agent_id: AgentGuard agent ID.
    :param base_url: AgentGuard API base URL (default: https://api.agentguard.tech).
    :param session_id: Session ID for audit continuity.
    :param strict: Block on policy eval errors (default: True / fail-closed).
    :param timeout_sec: HTTP request timeout in seconds (default: 10).
    :returns: Configured OpenClawGuard instance.

    Example::

        from agentguard.integrations.openclaw import openclaw_guard

        guard = openclaw_guard(
            api_key=os.environ["AGENTGUARD_API_KEY"],
            agent_id="my-research-agent",
        )

        # Evaluate a tool call
        decision = guard.intercept_sync("web_search", {"query": "recent AI papers"})
        print(decision.decision)  # 'allow', 'block', 'hitl', or 'monitor'
    """
    return OpenClawGuard(
        api_key=api_key or os.environ.get("AGENTGUARD_API_KEY") or "",
        agent_id=agent_id or os.environ.get("AGENTGUARD_AGENT_ID") or "",
        base_url=base_url or os.environ.get("AGENTGUARD_API_URL") or "https://api.agentguard.tech",
        session_id=session_id,
        strict=strict,
        timeout_sec=timeout_sec,
    )
