"""AgentGuard — CrewAI Integration (Python).

Provides two integration styles:

1. **Native callback handler** (recommended) — plug directly into CrewAI's
   callback system:

    .. code-block:: python

        from agentguard.integrations.crewai import AgentGuardCallback

        crew = Crew(
            agents=[agent],
            tasks=[task],
            callbacks=[AgentGuardCallback(api_key="ag_...")],
        )

   Intercepts: tool use, agent actions, task start/completion, and agent
   delegation events.  Raises ``AgentGuardBlockError`` on block decisions.

2. **Imperative guard hook** — for manual integration in pre-execution hooks:

    .. code-block:: python

        from agentguard.integrations import crewai_guard, AgentGuardBlockError

        guard = crewai_guard(api_key="ag_...")

        try:
            guard.before_tool_execution("read_file", {"path": "/data/report.csv"})
            result = read_file(path="/data/report.csv")
        except AgentGuardBlockError as e:
            print(f"Blocked: {e.reason}")
            print(f"Suggestion: {e.suggestion}")

Both styles are duck-typed — no hard dependency on ``crewai`` is required.
Works with any framework that exposes a LangChain-compatible callback interface
or a pre-execution hook pattern.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Union

from ..client import AgentGuard
from .errors import AgentGuardBlockError

logger = logging.getLogger("agentguard.integrations.crewai")


# ─── AgentGuardCallback ────────────────────────────────────────────────────────


class AgentGuardCallback:
    """Native CrewAI callback handler for AgentGuard policy enforcement.

    Implements CrewAI's (LangChain-compatible) callback interface.  Pass an
    instance directly to ``Crew(callbacks=[...])`` or to any CrewAI agent /
    executor that accepts callback handlers.

    Intercepted events
    ------------------
    - **Tool use** (``on_tool_start``) — evaluated before the tool runs.
    - **Agent action** (``on_agent_action``) — evaluated when an agent
      decides to take a structured action (e.g. call a tool or delegate).
    - **Task start** (``on_chain_start``) — logged / monitored when a
      CrewAI task chain begins.
    - **Task completion** (``on_chain_end``) — logged / monitored when a
      task chain finishes.
    - **Agent delegation** (``on_text``) — best-effort detection of
      CrewAI agent delegation patterns within streamed text.

    Args:
        api_key:        AgentGuard API key (``ag_...``)
        base_url:       Override the AgentGuard API base URL
        agent_id:       Optional agent ID for scoped evaluations
        block_actions:  When True (default), block actions that fail policy.
                        When False, log violations but allow them through
                        (monitor-only mode).
        on_block:       Optional callback invoked on each blocked event.
                        Receives the ``AgentGuardBlockError`` instance.
        on_allow:       Optional callback invoked on each allowed event.
                        Receives the raw result dict.

    Example::

        from crewai import Crew, Agent, Task
        from agentguard.integrations.crewai import AgentGuardCallback

        guard_cb = AgentGuardCallback(
            api_key="ag_...",
            on_block=lambda err: logger.warning("Blocked: %s", err.reason),
        )

        crew = Crew(
            agents=[research_agent, writer_agent],
            tasks=[research_task, write_task],
            callbacks=[guard_cb],
        )
        result = crew.kickoff()
    """

    # The callback name is surfaced in LangChain/CrewAI debug logs.
    name = "AgentGuardCallback"

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.agentguard.tech",
        agent_id: Optional[str] = None,
        block_actions: bool = True,
        on_block: Optional[Any] = None,
        on_allow: Optional[Any] = None,
    ) -> None:
        self._agent_id = agent_id
        self._block_actions = block_actions
        self._on_block = on_block
        self._on_allow = on_allow
        self._guard = AgentGuard(api_key=api_key, base_url=base_url)

    # ── Internal evaluation helper ─────────────────────────────────────────────

    def _evaluate(
        self,
        tool_name: str,
        params: Optional[Dict[str, Any]] = None,
        *,
        event_type: str = "tool_use",
    ) -> Dict[str, Any]:
        """Evaluate a tool/action against the AgentGuard policy engine.

        Returns the raw result dict.  Raises ``AgentGuardBlockError`` on block
        decisions (when ``block_actions=True``).
        """
        result = self._guard.evaluate(tool=tool_name, params=params or {})
        decision = result.get("result", result.get("decision", "allow"))

        logger.debug(
            "AgentGuard [%s] %s → %s (risk=%s)",
            event_type,
            tool_name,
            decision,
            result.get("riskScore", result.get("risk_score", 0)),
        )

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
            if self._block_actions:
                raise err
            # Monitor-only mode: log but allow through
            logger.warning(
                "AgentGuard [monitor-only] tool=%s decision=%s reason=%s",
                tool_name,
                decision,
                err.reason,
            )
        else:
            if self._on_allow is not None:
                try:
                    self._on_allow(result)
                except Exception:  # noqa: BLE001
                    pass

        return result

    # ── LangChain / CrewAI callback interface ─────────────────────────────────

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: Union[str, Dict[str, Any]],
        **kwargs: Any,
    ) -> None:
        """Called by CrewAI/LangChain immediately before a tool executes.

        This is the primary interception point for tool use.  Raises
        ``AgentGuardBlockError`` if the policy blocks the call.

        Args:
            serialized: Tool serialization dict (must contain ``name`` or ``id``)
            input_str:  Tool input as a JSON string or dict
        """
        tool_name = self._extract_tool_name(serialized)
        params = self._parse_input(input_str)
        self._evaluate(tool_name, params, event_type="tool_use")

    def on_tool_end(self, output: str, **kwargs: Any) -> None:
        """Called after a tool completes successfully.  No-op (monitoring only)."""

    def on_tool_error(
        self, error: Union[Exception, KeyboardInterrupt], **kwargs: Any
    ) -> None:
        """Called when a tool raises an error.  No-op."""

    def on_agent_action(self, action: Any, **kwargs: Any) -> None:
        """Called when a CrewAI/LangChain agent decides to take an action.

        Intercepts structured agent actions such as tool calls or delegation
        requests.  Evaluates the action against AgentGuard policies.

        Args:
            action: An ``AgentAction``-compatible object with ``tool`` and
                    ``tool_input`` attributes (or a dict with the same keys).
        """
        tool_name, params = self._extract_action(action)
        if tool_name:
            self._evaluate(tool_name, params, event_type="agent_action")

    def on_agent_finish(self, finish: Any, **kwargs: Any) -> None:
        """Called when an agent finishes its reasoning loop.  No-op."""

    def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        **kwargs: Any,
    ) -> None:
        """Called when a CrewAI task chain starts.

        Used to monitor task initiation.  Does not block (task chains are
        not individually evaluated — tool calls within them are).

        Args:
            serialized: Chain serialization (contains class/name info)
            inputs:     Chain inputs (may include ``input``, ``task``, etc.)
        """
        chain_name = self._extract_chain_name(serialized)
        logger.info("AgentGuard [task_start] chain=%s", chain_name)

    def on_chain_end(self, outputs: Dict[str, Any], **kwargs: Any) -> None:
        """Called when a CrewAI task chain completes.  No-op (logged at DEBUG)."""
        logger.debug("AgentGuard [task_end] outputs_keys=%s", list(outputs.keys()))

    def on_chain_error(
        self, error: Union[Exception, KeyboardInterrupt], **kwargs: Any
    ) -> None:
        """Called when a chain errors out.  No-op."""

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        **kwargs: Any,
    ) -> None:
        """Called before an LLM call.  No-op (LLM calls are not policy-evaluated)."""

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        """Called after an LLM responds.  No-op."""

    def on_llm_error(
        self, error: Union[Exception, KeyboardInterrupt], **kwargs: Any
    ) -> None:
        """Called when an LLM call errors.  No-op."""

    def on_text(self, text: str, **kwargs: Any) -> None:
        """Called with streamed/intermediate text from the agent.

        Performs best-effort detection of CrewAI agent delegation patterns.
        When a delegation instruction is detected, it is evaluated as an
        ``agent_delegation`` action.

        Args:
            text: Streamed text chunk from the agent or task output.
        """
        lower = text.lower() if isinstance(text, str) else ""
        # CrewAI delegation patterns: "I need to delegate this to..."
        # or "Delegating to Agent: ..."
        if "delegat" in lower or "assign to" in lower or "hand off" in lower:
            logger.debug("AgentGuard [delegation_detected] text_snippet=%r", text[:120])
            self._evaluate(
                "agent_delegation",
                {"text_snippet": text[:500]},
                event_type="agent_delegation",
            )

    # ── Pre-execution guard (for step_callback / manual integration) ───────────

    def before_task_start(
        self,
        task_name: str,
        inputs: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Evaluate a task start event.

        Call this from CrewAI's ``step_callback`` or ``task_callback`` hooks
        to gate task execution.

        Args:
            task_name: Name or description of the task
            inputs:    Optional task input parameters

        Returns:
            Normalised decision dict with keys: decision, risk_score, reason,
            matched_rule_id.

        Raises:
            AgentGuardBlockError: If the task is blocked by policy.

        Example::

            guard_cb = AgentGuardCallback(api_key="ag_...")

            def my_step_callback(step_output):
                guard_cb.before_task_start("write_report", {"format": "pdf"})
        """
        result = self._evaluate(
            f"task:{task_name}",
            inputs or {},
            event_type="task_start",
        )
        decision = result.get("result", result.get("decision", "allow"))
        return {
            "decision": decision,
            "risk_score": result.get("riskScore", result.get("risk_score", 0)),
            "reason": result.get("reason"),
            "matched_rule_id": result.get("matchedRuleId", result.get("matched_rule_id")),
        }

    def before_tool_execution(
        self,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Evaluate a tool call before execution (imperative style).

        Args:
            tool_name: Name of the tool about to be executed
            args:      Tool arguments as a plain dict

        Returns:
            Decision dict with keys: decision, risk_score, reason, matched_rule_id

        Raises:
            AgentGuardBlockError: If the tool call is blocked by policy.
        """
        result = self._evaluate(tool_name, args or {}, event_type="tool_use")
        decision = result.get("result", result.get("decision", "allow"))
        return {
            "decision": decision,
            "risk_score": result.get("riskScore", result.get("risk_score", 0)),
            "reason": result.get("reason"),
            "matched_rule_id": result.get("matchedRuleId", result.get("matched_rule_id")),
        }

    # ── Internal helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _extract_tool_name(serialized: Any) -> str:
        if isinstance(serialized, dict):
            name = serialized.get("name")
            if name:
                return str(name)
            ids = serialized.get("id", [])
            if isinstance(ids, list) and ids:
                return str(ids[-1])
        return "unknown_tool"

    @staticmethod
    def _parse_input(input_str: Union[str, Dict[str, Any]]) -> Dict[str, Any]:
        if isinstance(input_str, dict):
            return input_str
        if isinstance(input_str, str):
            try:
                parsed = json.loads(input_str)
                if isinstance(parsed, dict):
                    return parsed
                return {"input": input_str}
            except (json.JSONDecodeError, ValueError):
                return {"input": input_str}
        return {"input": str(input_str)}

    @staticmethod
    def _extract_action(action: Any) -> tuple:
        """Return (tool_name, params) from an AgentAction-like object."""
        # Supports dataclass-style (action.tool, action.tool_input) and dict
        if hasattr(action, "tool") and hasattr(action, "tool_input"):
            tool_name = action.tool
            tool_input = action.tool_input
            if isinstance(tool_input, str):
                try:
                    params = json.loads(tool_input)
                    if not isinstance(params, dict):
                        params = {"input": tool_input}
                except (json.JSONDecodeError, ValueError):
                    params = {"input": tool_input}
            elif isinstance(tool_input, dict):
                params = tool_input
            else:
                params = {"input": str(tool_input)}
            return tool_name, params

        if isinstance(action, dict):
            tool_name = action.get("tool", action.get("action", ""))
            params = action.get("tool_input", action.get("input", {}))
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except (json.JSONDecodeError, ValueError):
                    params = {"input": params}
            return tool_name, params or {}

        return "", {}

    @staticmethod
    def _extract_chain_name(serialized: Any) -> str:
        if isinstance(serialized, dict):
            name = serialized.get("name")
            if name:
                return str(name)
            ids = serialized.get("id", [])
            if isinstance(ids, list) and ids:
                return str(ids[-1])
        return "unknown_chain"


# ─── _CrewAIGuard (imperative hook style, kept for backwards compat) ──────────


class _CrewAIGuard:
    """Guard object returned by ``crewai_guard()``.

    Provides ``before_tool_execution`` and ``evaluate_batch`` methods
    to integrate with CrewAI's lifecycle hooks.

    .. note::
        For new projects, prefer ``AgentGuardCallback`` which plugs directly
        into ``Crew(callbacks=[...])``.
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
    """Create a CrewAI-compatible guard hook (imperative style).

    .. note::
        For new projects, prefer ``AgentGuardCallback`` which plugs directly
        into ``Crew(callbacks=[...])``.

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
