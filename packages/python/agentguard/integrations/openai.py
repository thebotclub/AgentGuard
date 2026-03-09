"""AgentGuard — OpenAI Integration (Python).

Wraps an OpenAI client instance to intercept function/tool calls returned
in chat completion responses, evaluating each through AgentGuard before
the caller can execute them.

Usage::

    from openai import OpenAI
    from agentguard.integrations import openai_guard

    client = OpenAI(api_key="sk-...")
    guarded = openai_guard(client, api_key="ag_...")

    response = guarded.chat.completions.create(
        model="gpt-4o",
        messages=[...],
        tools=[...],
    )

    # response has _agentguard attached with per-call decisions
    if response._agentguard and response._agentguard["has_blocks"]:
        # One or more tool calls were blocked — do not execute them
        for decision in response._agentguard["decisions"]:
            if decision["decision"] == "block":
                print(f"Blocked {decision['tool']}: {decision['reason']}")

The guard attaches an ``_agentguard`` attribute to responses that contain
tool calls. Check this before executing the tool calls.
"""
import json
from typing import Any, Dict, List, Optional

from ..client import AgentGuard
from .errors import AgentGuardBlockError


def openai_guard(
    client: Any,
    api_key: str,
    base_url: str = "https://api.agentguard.tech",
    agent_id: Optional[str] = None,
    throw_on_block: bool = False,
) -> Any:
    """Wrap an OpenAI client with AgentGuard policy enforcement.

    Intercepts ``chat.completions.create`` responses that contain tool_calls,
    evaluating each tool call through AgentGuard before returning the response.

    One-liner::

        from agentguard.integrations import openai_guard
        guarded = openai_guard(client, api_key="ag_...")

    Args:
        client:         An OpenAI client instance (``openai.OpenAI`` or compatible)
        api_key:        AgentGuard API key (``ag_...``)
        base_url:       Optional override for the AgentGuard API base URL
        agent_id:       Optional agent ID for scoped evaluations
        throw_on_block: If True, raise ``AgentGuardBlockError`` on first block
                        instead of attaching results to the response object.

    Returns:
        A wrapped client with the same interface as the original, with
        ``chat.completions.create`` intercepted.
    """
    guard = AgentGuard(api_key=api_key, base_url=base_url)

    class _GuardedCompletions:
        """Proxy that wraps the original completions interface."""

        def __init__(self, original: Any) -> None:
            self._original = original

        def create(self, **kwargs: Any) -> Any:
            response = self._original.create(**kwargs)

            # Only intercept responses that have tool_calls
            tool_calls = _extract_tool_calls(response)
            if not tool_calls:
                return response

            # Evaluate each tool call through AgentGuard
            decisions: List[Dict[str, Any]] = []
            for idx, tc in enumerate(tool_calls):
                tool_name = _get_tool_name(tc)
                raw_args = _get_tool_args(tc)
                try:
                    parsed_args: Dict[str, Any] = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
                except (json.JSONDecodeError, ValueError):
                    parsed_args = {"_raw": raw_args}

                result = guard.evaluate(tool=tool_name, params=parsed_args)
                decision_val = result.get("result", result.get("decision", "allow"))

                decision: Dict[str, Any] = {
                    "index": idx,
                    "tool": tool_name,
                    "decision": decision_val,
                    "risk_score": result.get("riskScore", result.get("risk_score", 0)),
                    "reason": result.get("reason"),
                    "suggestion": result.get("suggestion"),
                    "docs": result.get("docs"),
                    "alternatives": result.get("alternatives", []),
                    "matched_rule_id": result.get("matchedRuleId", result.get("matched_rule_id")),
                    "approval_url": result.get("approvalUrl", result.get("approval_url")),
                }
                decisions.append(decision)

            # Build summary
            blocked = [d for d in decisions if d["decision"] == "block"]
            summary = {
                "total": len(decisions),
                "allowed": sum(1 for d in decisions if d["decision"] == "allow"),
                "blocked": len(blocked),
                "monitored": sum(1 for d in decisions if d["decision"] == "monitor"),
                "require_approval": sum(1 for d in decisions if d["decision"] == "require_approval"),
            }

            agentguard_result = {
                "decisions": decisions,
                "has_blocks": len(blocked) > 0,
                "has_approvals": summary["require_approval"] > 0,
                "blocked_indices": [d["index"] for d in blocked],
                "summary": summary,
            }

            # Attach to response (works for both OpenAI and mock objects)
            try:
                object.__setattr__(response, "_agentguard", agentguard_result)
            except (AttributeError, TypeError):
                try:
                    response._agentguard = agentguard_result  # type: ignore[attr-defined]
                except (AttributeError, TypeError):
                    pass

            # Throw on first block if requested
            if throw_on_block and blocked:
                raise AgentGuardBlockError({**blocked[0], "agent_id": agent_id})

            return response

    class _GuardedChat:
        """Proxy that wraps the original chat interface."""

        def __init__(self, original: Any) -> None:
            self._original = original
            self.completions = _GuardedCompletions(original.completions)

        def __getattr__(self, name: str) -> Any:
            return getattr(self._original, name)

    class _GuardedClient:
        """Proxy wrapper around the original OpenAI client."""

        def __init__(self, original: Any) -> None:
            self._original = original
            self.chat = _GuardedChat(original.chat)

        def __getattr__(self, name: str) -> Any:
            return getattr(self._original, name)

    return _GuardedClient(client)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extract_tool_calls(response: Any) -> List[Any]:
    """Extract tool_calls from an OpenAI response object."""
    try:
        choices = response.choices
        if choices and len(choices) > 0:
            msg = choices[0].message
            return list(msg.tool_calls or [])
    except AttributeError:
        pass
    # Dict-style response fallback
    if isinstance(response, dict):
        choices = response.get("choices", [])
        if choices:
            msg = choices[0].get("message", {})
            return msg.get("tool_calls", []) or []
    return []


def _get_tool_name(tool_call: Any) -> str:
    """Extract tool name from a tool_call object or dict."""
    try:
        return tool_call.function.name
    except AttributeError:
        pass
    if isinstance(tool_call, dict):
        return tool_call.get("function", {}).get("name", "unknown")
    return "unknown"


def _get_tool_args(tool_call: Any) -> Any:
    """Extract tool arguments from a tool_call object or dict."""
    try:
        return tool_call.function.arguments
    except AttributeError:
        pass
    if isinstance(tool_call, dict):
        return tool_call.get("function", {}).get("arguments", "{}")
    return "{}"
