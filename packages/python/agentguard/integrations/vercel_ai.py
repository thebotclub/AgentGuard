"""AgentGuard — Vercel AI SDK Integration (Python Stub).

The Vercel AI SDK is a JavaScript/TypeScript framework, so this module
provides a **structural reference** and utility functions for Python
applications that interact with Vercel AI SDK-powered backends.

Use cases:
  - Server-side policy evaluation for tool calls received from a
    Vercel AI SDK frontend via API routes.
  - Batch evaluation of tool calls before forwarding to execution.
  - Shared policy logic in polyglot stacks (Python backend + JS frontend).

Usage::

    from agentguard.integrations.vercel_ai import VercelAIGuard

    guard = VercelAIGuard(api_key="ag_...")

    # Evaluate a batch of tool calls from a Vercel AI SDK request
    results = guard.evaluate_tool_calls([
        {"tool": "readFile", "params": {"path": "/etc/passwd"}},
        {"tool": "sendEmail", "params": {"to": "user@example.com"}},
    ])

    for result in results:
        if result["decision"] == "block":
            print(f"Blocked {result['tool']}: {result['reason']}")

Note: For the primary Vercel AI SDK middleware integration, use the
TypeScript package: ``@the-bot-club/agentguard``.
"""
from typing import Any, Callable, Dict, List, Optional

from ..client import AgentGuard
from .errors import AgentGuardBlockError


class VercelAIGuard:
    """Guard for evaluating tool calls from Vercel AI SDK applications.

    Provides batch evaluation and per-call evaluation of tool calls
    against AgentGuard policies. Designed for Python backends that
    serve Vercel AI SDK frontends.

    Args:
        api_key:        AgentGuard API key (``ag_...``)
        base_url:       Optional override for the AgentGuard API base URL
        agent_id:       Optional agent ID for scoped evaluations
        throw_on_block: If True, raise ``AgentGuardBlockError`` on first block
        on_block:       Optional callback when a tool call is blocked
        on_allow:       Optional callback when a tool call is allowed
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.agentguard.tech",
        agent_id: Optional[str] = None,
        throw_on_block: bool = False,
        on_block: Optional[Callable[[Dict[str, Any]], None]] = None,
        on_allow: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> None:
        self._guard = AgentGuard(api_key=api_key, base_url=base_url)
        self._agent_id = agent_id
        self._throw_on_block = throw_on_block
        self._on_block = on_block
        self._on_allow = on_allow

    def evaluate_tool_calls(
        self,
        calls: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Evaluate a batch of tool calls against AgentGuard policies.

        Each call should be a dict with ``tool`` (str) and optional
        ``params`` (dict) keys.

        Args:
            calls: List of tool call descriptors.

        Returns:
            List of decision dicts, one per call. Each contains:
            ``tool``, ``decision``, ``risk_score``, ``reason``,
            ``suggestion``, ``alternatives``, ``matched_rule_id``.

        Raises:
            AgentGuardBlockError: If ``throw_on_block`` is True and any
                call is blocked.
        """
        decisions: List[Dict[str, Any]] = []

        for call in calls:
            tool_name = call.get("tool", "unknown")
            params = call.get("params", {})

            result = self._guard.evaluate(tool=tool_name, params=params)
            decision_val = result.get("result", result.get("decision", "allow"))

            decision: Dict[str, Any] = {
                "tool": tool_name,
                "decision": decision_val,
                "risk_score": result.get("riskScore", result.get("risk_score", 0)),
                "reason": result.get("reason"),
                "suggestion": result.get("suggestion"),
                "docs": result.get("docs"),
                "alternatives": result.get("alternatives", []),
                "matched_rule_id": result.get(
                    "matchedRuleId", result.get("matched_rule_id")
                ),
                "approval_url": result.get(
                    "approvalUrl", result.get("approval_url")
                ),
            }
            decisions.append(decision)

            is_blocked = decision_val in ("block", "require_approval")

            if is_blocked and self._on_block:
                self._on_block(decision)
            elif not is_blocked and self._on_allow:
                self._on_allow(decision)

            if is_blocked and self._throw_on_block:
                raise AgentGuardBlockError(
                    {**decision, "agent_id": self._agent_id}
                )

        return decisions

    def evaluate_single(
        self,
        tool: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Evaluate a single tool call.

        Convenience wrapper around :meth:`evaluate_tool_calls` for
        one-off checks.

        Args:
            tool:   Tool name
            params: Optional tool parameters

        Returns:
            Decision dict for the tool call.

        Raises:
            AgentGuardBlockError: If ``throw_on_block`` is True and blocked.
        """
        results = self.evaluate_tool_calls(
            [{"tool": tool, "params": params or {}}]
        )
        return results[0]


def vercel_ai_guard(
    api_key: str,
    base_url: str = "https://api.agentguard.tech",
    agent_id: Optional[str] = None,
    throw_on_block: bool = False,
    on_block: Optional[Callable[[Dict[str, Any]], None]] = None,
    on_allow: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> VercelAIGuard:
    """Factory function to create a VercelAIGuard instance.

    One-liner::

        from agentguard.integrations.vercel_ai import vercel_ai_guard
        guard = vercel_ai_guard(api_key="ag_...")
        results = guard.evaluate_tool_calls([...])

    Args:
        api_key:        AgentGuard API key
        base_url:       Optional API base URL override
        agent_id:       Optional agent ID for scoped evaluations
        throw_on_block: Raise on block instead of returning decision
        on_block:       Callback for blocked calls
        on_allow:       Callback for allowed calls

    Returns:
        Configured VercelAIGuard instance.
    """
    return VercelAIGuard(
        api_key=api_key,
        base_url=base_url,
        agent_id=agent_id,
        throw_on_block=throw_on_block,
        on_block=on_block,
        on_allow=on_allow,
    )
