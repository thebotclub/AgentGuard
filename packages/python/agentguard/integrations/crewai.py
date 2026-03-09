"""AgentGuard — CrewAI Integration (Python).

A guard object that wraps CrewAI (and any pre-execution hook style framework)
tool execution. Intercept tool calls before they execute using
``before_tool_execution``.

Usage::

    from agentguard.integrations import crewai_guard, AgentGuardBlockError

    guard = crewai_guard(api_key="ag_...")

    # In your CrewAI agent's tool execution lifecycle:
    try:
        guard.before_tool_execution("read_file", {"path": "/data/report.csv"})
        result = read_file(path="/data/report.csv")
    except AgentGuardBlockError as e:
        print(f"Blocked: {e.reason}")
        print(f"Suggestion: {e.suggestion}")

Works with any framework that exposes a pre-execution hook pattern — not
strictly limited to CrewAI.
"""
from typing import Any, Dict, List, Optional

from ..client import AgentGuard
from .errors import AgentGuardBlockError


class _CrewAIGuard:
    """Guard object returned by ``crewai_guard()``.

    Provides ``before_tool_execution`` and ``evaluate_batch`` methods
    to integrate with CrewAI's lifecycle hooks.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.agentguard.tech",
        agent_id: Optional[str] = None,
    ) -> None:
        self._agent_id = agent_id
        self._guard = AgentGuard(api_key=api_key, base_url=base_url)

    def before_tool_execution(
        self,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Evaluate a tool call before execution.

        Call this at the start of your tool execution hook. Raises
        ``AgentGuardBlockError`` if the policy decision is "block" or
        "require_approval". Returns the decision dict otherwise.

        Args:
            tool_name:  Name of the tool about to be executed
            args:       Tool arguments as a plain dict (default: empty dict)

        Returns:
            Decision dict with keys: decision, risk_score, reason, matched_rule_id

        Raises:
            AgentGuardBlockError: If the tool call is blocked by policy.

        Example::

            guard = crewai_guard(api_key="ag_...")

            def my_tool_hook(tool_name, args):
                guard.before_tool_execution(tool_name, args)
                # Safe to execute if we reach here
                return execute_tool(tool_name, args)
        """
        result = self._guard.evaluate(tool=tool_name, params=args or {})
        decision = result.get("result", result.get("decision", "allow"))

        if decision in ("block", "require_approval"):
            raise AgentGuardBlockError({
                **result,
                "tool": tool_name,
                "decision": decision,
                "agent_id": self._agent_id,
            })

        return {
            "decision": decision,
            "risk_score": result.get("riskScore", result.get("risk_score", 0)),
            "reason": result.get("reason"),
            "matched_rule_id": result.get("matchedRuleId", result.get("matched_rule_id")),
        }

    def evaluate_batch(
        self,
        calls: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Evaluate multiple tool calls without throwing.

        Unlike ``before_tool_execution``, this method does not throw on
        block decisions — it returns the full result for each call, allowing
        the caller to inspect and handle blocks manually.

        Args:
            calls:  List of dicts with keys:
                        - ``tool`` (str, required): Tool name
                        - ``args`` (dict, optional): Tool arguments

        Returns:
            List of result dicts, one per call, in the same order as input.
            Each dict contains: decision, risk_score, reason, matched_rule_id, tool.

        Example::

            results = guard.evaluate_batch([
                {"tool": "file_read", "args": {"path": "/data/report.csv"}},
                {"tool": "send_email", "args": {"to": "boss@example.com"}},
            ])
            blocked = [r for r in results if r["decision"] == "block"]
            if blocked:
                print(f"{len(blocked)} tool(s) blocked")
        """
        results = []
        for call in calls:
            tool_name = call.get("tool", "")
            args: Dict[str, Any] = call.get("args", {}) or {}
            try:
                result = self._guard.evaluate(tool=tool_name, params=args)
                decision = result.get("result", result.get("decision", "allow"))
                results.append({
                    "tool": tool_name,
                    "decision": decision,
                    "risk_score": result.get("riskScore", result.get("risk_score", 0)),
                    "reason": result.get("reason"),
                    "matched_rule_id": result.get("matchedRuleId", result.get("matched_rule_id")),
                    "suggestion": result.get("suggestion"),
                    "alternatives": result.get("alternatives", []),
                })
            except Exception as exc:  # noqa: BLE001
                results.append({
                    "tool": tool_name,
                    "decision": "block",
                    "risk_score": 500,
                    "reason": f"Evaluation failed: {exc}",
                    "matched_rule_id": "EVAL_ERROR",
                    "suggestion": "",
                    "alternatives": [],
                })
        return results


def crewai_guard(
    api_key: str,
    base_url: str = "https://api.agentguard.tech",
    agent_id: Optional[str] = None,
) -> _CrewAIGuard:
    """Create a CrewAI-compatible guard hook.

    One-liner::

        from agentguard.integrations import crewai_guard

        guard = crewai_guard(api_key="ag_...")
        guard.before_tool_execution("send_email", {"to": "boss@example.com"})

    Args:
        api_key:   AgentGuard API key (``ag_...``)
        base_url:  Optional override for the AgentGuard API base URL
        agent_id:  Optional agent ID for scoped evaluations

    Returns:
        A guard object with ``before_tool_execution`` and ``evaluate_batch`` methods.
    """
    return _CrewAIGuard(api_key=api_key, base_url=base_url, agent_id=agent_id)
