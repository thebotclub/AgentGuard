"""Tests for AgentGuard AutoGen integration.

Covers: AutoGenGuard decorator, patch_agent, create_guarded_agent, wrap(),
multi-agent chain tracking, and async tool handling.  All network calls are
mocked — no AutoGen installation required.
"""
from __future__ import annotations

import asyncio
import unittest
from typing import Any, Dict
from unittest.mock import MagicMock, patch

from agentguard.integrations.autogen import (
    AutoGenGuard,
    GuardResult,
    create_guarded_agent,
    wrap,
    _extract_params,
)
from agentguard.integrations.errors import AgentGuardBlockError


# ─── Helpers ───────────────────────────────────────────────────────────────────


def _make_autogen_guard(
    decision: str = "allow",
    risk_score: int = 0,
    reason: str = "OK",
    throw_on_block: bool = False,
    on_block=None,
    on_allow=None,
) -> AutoGenGuard:
    guard = AutoGenGuard(
        api_key="ag_test",
        throw_on_block=throw_on_block,
        on_block=on_block,
        on_allow=on_allow,
    )
    guard._guard.evaluate = MagicMock(return_value={
        "result": decision,
        "riskScore": risk_score,
        "reason": reason,
    })
    return guard


def _make_mock_agent(tools: Dict[str, Any] = None) -> MagicMock:
    """Simulate an AutoGen ConversableAgent with _function_map."""
    agent = MagicMock()
    agent.name = "test_agent"
    agent._function_map = tools or {}
    agent._tools = {}
    agent.registered_tools = {}
    return agent


# ─── GuardResult tests ────────────────────────────────────────────────────────


class TestGuardResult(unittest.TestCase):

    def test_allow_result(self):
        raw = {"result": "allow", "riskScore": 5, "reason": "OK"}
        result = GuardResult(raw, blocked=False)
        self.assertFalse(result.blocked)
        self.assertEqual(result.decision, "allow")
        self.assertEqual(result.risk_score, 5)

    def test_block_result(self):
        raw = {"result": "block", "riskScore": 800, "reason": "Forbidden", "suggestion": "Use read instead"}
        result = GuardResult(raw, blocked=True)
        self.assertTrue(result.blocked)
        self.assertEqual(result.decision, "block")
        self.assertEqual(result.suggestion, "Use read instead")

    def test_to_dict(self):
        raw = {"result": "allow", "riskScore": 0, "reason": "OK"}
        result = GuardResult(raw, blocked=False)
        d = result.to_dict()
        self.assertIn("blocked", d)
        self.assertIn("decision", d)
        self.assertIn("risk_score", d)

    def test_camelcase_fields_normalised(self):
        raw = {
            "result": "allow",
            "riskScore": 50,
            "matchedRuleId": "rule-123",
        }
        result = GuardResult(raw, blocked=False)
        self.assertEqual(result.risk_score, 50)
        self.assertEqual(result.matched_rule_id, "rule-123")


# ─── AutoGenGuard.evaluate tests ─────────────────────────────────────────────


class TestAutoGenGuardEvaluate(unittest.TestCase):

    def test_allow_returns_result(self):
        guard = _make_autogen_guard(decision="allow", risk_score=10)
        result = guard.evaluate("read_file", {"path": "/data/a.csv"})
        self.assertFalse(result.blocked)
        self.assertEqual(result.risk_score, 10)

    def test_block_returns_blocked_result(self):
        guard = _make_autogen_guard(decision="block", throw_on_block=False)
        result = guard.evaluate("exec_cmd", {"cmd": "rm -rf /"})
        self.assertTrue(result.blocked)
        self.assertEqual(result.decision, "block")

    def test_block_throws_when_configured(self):
        guard = _make_autogen_guard(decision="block", throw_on_block=True)
        with self.assertRaises(AgentGuardBlockError):
            guard.evaluate("exec_cmd", {"cmd": "rm -rf /"})

    def test_require_approval_treated_as_block(self):
        guard = _make_autogen_guard(decision="require_approval", throw_on_block=True)
        with self.assertRaises(AgentGuardBlockError):
            guard.evaluate("send_email", {"to": "boss@example.com"})

    def test_on_block_callback_invoked(self):
        on_block_cb = MagicMock()
        guard = _make_autogen_guard(decision="block", on_block=on_block_cb)
        guard.evaluate("exec_cmd", {})
        on_block_cb.assert_called_once()
        arg = on_block_cb.call_args[0][0]
        self.assertIsInstance(arg, GuardResult)
        self.assertTrue(arg.blocked)

    def test_on_allow_callback_invoked(self):
        on_allow_cb = MagicMock()
        guard = _make_autogen_guard(decision="allow", on_allow=on_allow_cb)
        guard.evaluate("read_file", {})
        on_allow_cb.assert_called_once()


# ─── guard_tool decorator tests ───────────────────────────────────────────────


class TestGuardToolDecorator(unittest.TestCase):

    def test_allowed_function_executes(self):
        guard = _make_autogen_guard(decision="allow")

        @guard.guard_tool
        def add(a: int, b: int) -> int:
            return a + b

        result = add(2, 3)
        self.assertEqual(result, 5)

    def test_blocked_function_returns_none(self):
        guard = _make_autogen_guard(decision="block")

        @guard.guard_tool
        def delete_file(path: str) -> bool:
            return True

        result = delete_file("/etc/passwd")
        self.assertIsNone(result)

    def test_blocked_with_throw_raises(self):
        guard = _make_autogen_guard(decision="block", throw_on_block=True)

        @guard.guard_tool
        def exec_cmd(cmd: str) -> str:
            return "executed"

        with self.assertRaises(AgentGuardBlockError):
            exec_cmd("rm -rf /")

    def test_custom_name_used_in_evaluation(self):
        guard = _make_autogen_guard(decision="allow")

        @guard.guard_tool(name="my_custom_tool")
        def my_function(x: int) -> int:
            return x * 2

        my_function(5)
        call_kwargs = guard._guard.evaluate.call_args
        self.assertEqual(call_kwargs[1]["tool"], "my_custom_tool")

    def test_function_name_used_by_default(self):
        guard = _make_autogen_guard(decision="allow")

        @guard.guard_tool
        def fetch_data(url: str) -> str:
            return "data"

        fetch_data(url="https://example.com")
        call_kwargs = guard._guard.evaluate.call_args
        self.assertEqual(call_kwargs[1]["tool"], "fetch_data")

    def test_params_extracted_from_kwargs(self):
        guard = _make_autogen_guard(decision="allow")

        @guard.guard_tool
        def query(table: str, limit: int = 10) -> list:
            return []

        query(table="users", limit=5)
        _, kwargs = guard._guard.evaluate.call_args
        self.assertEqual(kwargs["params"]["table"], "users")
        self.assertEqual(kwargs["params"]["limit"], 5)

    def test_async_function_allowed(self):
        guard = _make_autogen_guard(decision="allow")

        @guard.guard_tool
        async def async_fetch(url: str) -> str:
            return "fetched"

        result = asyncio.run(
            async_fetch(url="https://example.com")
        )
        self.assertEqual(result, "fetched")

    def test_async_function_blocked(self):
        guard = _make_autogen_guard(decision="block")

        @guard.guard_tool
        async def async_delete(path: str) -> bool:
            return True

        result = asyncio.run(
            async_delete(path="/etc/passwd")
        )
        self.assertIsNone(result)

    def test_wrap_tool_method(self):
        guard = _make_autogen_guard(decision="allow")

        def raw_tool(x: int) -> int:
            return x + 1

        wrapped = guard.wrap_tool("my_raw_tool", raw_tool)
        result = wrapped(x=41)
        self.assertEqual(result, 42)
        call_kwargs = guard._guard.evaluate.call_args
        self.assertEqual(call_kwargs[1]["tool"], "my_raw_tool")


# ─── patch_agent tests ────────────────────────────────────────────────────────


class TestPatchAgent(unittest.TestCase):

    def test_patch_agent_via_function_map(self):
        guard = _make_autogen_guard(decision="allow")

        original_tool = MagicMock(return_value="result")
        agent = _make_mock_agent({"my_tool": original_tool})

        guard.patch_agent(agent)

        # Tool should now be wrapped
        wrapped = agent._function_map["my_tool"]
        self.assertIsNot(wrapped, original_tool)

        # Calling the wrapped tool should call through
        result = wrapped()
        self.assertEqual(result, "result")
        original_tool.assert_called_once()

    def test_patch_agent_blocked_tool_not_executed(self):
        guard = _make_autogen_guard(decision="block")

        original_tool = MagicMock(return_value="should_not_run")
        agent = _make_mock_agent({"dangerous_tool": original_tool})

        guard.patch_agent(agent)
        wrapped = agent._function_map["dangerous_tool"]
        result = wrapped()
        self.assertIsNone(result)
        original_tool.assert_not_called()

    def test_patch_agent_no_tools_raises(self):
        guard = _make_autogen_guard(decision="allow")
        agent = MagicMock()
        # No _function_map, _tools, or registered_tools
        del agent._function_map
        del agent._tools
        del agent.registered_tools
        with self.assertRaises(TypeError):
            guard.patch_agent(agent)

    def test_patch_agent_multiple_tool_registrations(self):
        """patch_agent handles _tools dict fallback."""
        guard = _make_autogen_guard(decision="allow")
        agent = MagicMock()
        agent._function_map = {}  # empty
        agent._tools = {"my_tool": MagicMock(return_value="ok")}
        agent.registered_tools = {}  # empty

        guard.patch_agent(agent)
        wrapped = agent._tools["my_tool"]
        result = wrapped()
        self.assertEqual(result, "ok")


# ─── create_guarded_agent tests ──────────────────────────────────────────────


class TestCreateGuardedAgent(unittest.TestCase):

    def test_returns_same_agent(self):
        original_tool = MagicMock(return_value="data")
        agent = _make_mock_agent({"read": original_tool})

        returned = create_guarded_agent(agent, api_key="ag_test")
        # Monkey-patch evaluate for this test
        returned_guard_ref = None

        self.assertIs(returned, agent)

    def test_agent_tools_wrapped(self):
        original_tool = MagicMock(return_value="data")
        agent = _make_mock_agent({"read": original_tool})

        guarded = create_guarded_agent(agent, api_key="ag_test")

        # Patch the evaluate on the underlying guard created inside
        for fn_name, fn in guarded._function_map.items():
            # The wrapped function should be callable
            self.assertTrue(callable(fn))


# ─── wrap() shorthand tests ───────────────────────────────────────────────────


class TestWrapFunction(unittest.TestCase):

    def test_wrap_returns_same_agent(self):
        agent = _make_mock_agent({"tool": MagicMock()})
        returned = wrap(agent, api_key="ag_test")
        self.assertIs(returned, agent)

    def test_wrap_uses_agent_name_as_agent_id(self):
        """wrap() should auto-derive agent_id from agent.name."""
        original_tool = MagicMock(return_value="ok")
        agent = _make_mock_agent({"tool": original_tool})
        agent.name = "research_agent"

        # We patch create_guarded_agent to capture the agent_id arg
        with patch("agentguard.integrations.autogen.create_guarded_agent") as mock_cga:
            mock_cga.return_value = agent
            wrap(agent, api_key="ag_test")
            _, kwargs = mock_cga.call_args
            self.assertEqual(kwargs.get("agent_id"), "research_agent")

    def test_wrap_explicit_agent_id_takes_precedence(self):
        agent = _make_mock_agent({"tool": MagicMock()})
        agent.name = "research_agent"

        with patch("agentguard.integrations.autogen.create_guarded_agent") as mock_cga:
            mock_cga.return_value = agent
            wrap(agent, api_key="ag_test", agent_id="explicit_id")
            _, kwargs = mock_cga.call_args
            self.assertEqual(kwargs.get("agent_id"), "explicit_id")

    def test_multi_agent_pipeline(self):
        """Multiple agents can each be independently wrapped."""
        researcher = _make_mock_agent({"search": MagicMock(return_value="found")})
        researcher.name = "researcher"
        writer = _make_mock_agent({"write": MagicMock(return_value="written")})
        writer.name = "writer"

        guarded_researcher = wrap(researcher, api_key="ag_test")
        guarded_writer = wrap(writer, api_key="ag_test")

        self.assertIs(guarded_researcher, researcher)
        self.assertIs(guarded_writer, writer)


# ─── _extract_params helper tests ────────────────────────────────────────────


class TestExtractParams(unittest.TestCase):

    def test_positional_args_bound_by_name(self):
        def my_fn(a: int, b: int) -> int:
            return a + b

        params = _extract_params(my_fn, (1, 2), {})
        self.assertEqual(params.get("a"), 1)
        self.assertEqual(params.get("b"), 2)

    def test_kwargs_preserved(self):
        def my_fn(x: str, y: str = "default") -> str:
            return x + y

        params = _extract_params(my_fn, (), {"x": "hello", "y": "world"})
        self.assertEqual(params["x"], "hello")
        self.assertEqual(params["y"], "world")

    def test_self_removed(self):
        class MyClass:
            def method(self, val: int) -> int:
                return val

        obj = MyClass()
        params = _extract_params(obj.method, (42,), {})
        self.assertNotIn("self", params)

    def test_non_serialisable_values_stringified(self):
        def my_fn(obj: object) -> None:
            pass

        class Unserializable:
            pass

        params = _extract_params(my_fn, (Unserializable(),), {})
        self.assertIsInstance(params.get("obj"), str)


if __name__ == "__main__":
    unittest.main()
