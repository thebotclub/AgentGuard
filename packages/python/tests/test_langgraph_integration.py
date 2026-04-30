"""Tests for AgentGuard LangGraph streaming integration.

Covers: AgentGuardNode (sync + async), guarded_stream(), aguarded_stream(),
wrap_tool_node(), create_branch_guard(), and streaming chunk evaluation.
No real LangGraph installation required — all LangGraph objects are mocked.
"""
from __future__ import annotations

import asyncio
import json
import unittest
from typing import Any, Dict, Iterator, AsyncIterator
from unittest.mock import AsyncMock, MagicMock, call, patch

from agentguard.integrations.langgraph import (
    AgentGuardNode,
    _GuardedToolNode,
    _evaluate_chunk,
    _state_to_dict,
    aguarded_stream,
    create_branch_guard,
    guarded_stream,
    wrap_tool_node,
)
from agentguard.integrations.errors import AgentGuardBlockError


# ─── Helpers ───────────────────────────────────────────────────────────────────


def _make_node(
    decision: str = "allow",
    risk_score: int = 0,
    reason: str = "OK",
    on_block=None,
    on_allow=None,
    blocked_node: str = "blocked",
    allowed_node: str = "tools",
    agent_id: str = None,
    branch_policies: dict = None,
) -> AgentGuardNode:
    node = AgentGuardNode(
        api_key="ag_test",
        agent_id=agent_id,
        on_block=on_block,
        on_allow=on_allow,
        blocked_node=blocked_node,
        allowed_node=allowed_node,
        branch_policies=branch_policies or {},
    )
    node._guard.evaluate = MagicMock(return_value={
        "result": decision,
        "riskScore": risk_score,
        "reason": reason,
    })
    return node


def _state_with_tool_calls(*tool_calls) -> Dict[str, Any]:
    """Build a messages-based state with tool calls on the last AI message."""

    class FakeMessage:
        def __init__(self, tool_calls):
            self.tool_calls = tool_calls

    return {"messages": [FakeMessage(list(tool_calls))]}


def _state_explicit_tool_calls(*tool_calls) -> Dict[str, Any]:
    """Build a state with explicit tool_calls list."""
    return {"tool_calls": list(tool_calls)}


def _tc(name: str, args: dict = None, id: str = "tc-1") -> dict:
    """Shorthand for a tool call dict."""
    return {"name": name, "args": args or {}, "id": id}


def _fake_graph(chunks: list) -> MagicMock:
    """Build a mocked LangGraph graph whose stream() yields given chunks."""
    graph = MagicMock()
    graph.stream = MagicMock(return_value=iter(chunks))
    return graph


async def _async_gen(items):
    for item in items:
        yield item


# ─── AgentGuardNode: state extraction ────────────────────────────────────────


class TestStateExtraction(unittest.TestCase):

    def test_extract_from_explicit_tool_calls(self):
        state = _state_explicit_tool_calls(
            _tc("read_file", {"path": "/data/a.csv"}),
        )
        calls = AgentGuardNode._extract_tool_calls(state)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["name"], "read_file")

    def test_extract_from_message_object(self):
        state = _state_with_tool_calls(_tc("search", {"query": "AI"}))
        calls = AgentGuardNode._extract_tool_calls(state)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["name"], "search")

    def test_extract_from_message_dict(self):
        state = {"messages": [{"tool_calls": [_tc("write_file", {"path": "/tmp/a.txt"})]}]}
        calls = AgentGuardNode._extract_tool_calls(state)
        self.assertEqual(len(calls), 1)

    def test_extract_multiple_tool_calls(self):
        state = _state_explicit_tool_calls(
            _tc("tool_a", {}, "tc-1"),
            _tc("tool_b", {}, "tc-2"),
        )
        calls = AgentGuardNode._extract_tool_calls(state)
        self.assertEqual(len(calls), 2)

    def test_extract_from_additional_kwargs_style(self):
        """OpenAI additional_kwargs style message."""

        class OpenAIStyleMessage:
            tool_calls = None
            additional_kwargs = {
                "tool_calls": [
                    {
                        "id": "tc-1",
                        "function": {
                            "name": "http_post",
                            "arguments": '{"url": "https://example.com"}',
                        },
                    }
                ]
            }

        state = {"messages": [OpenAIStyleMessage()]}
        calls = AgentGuardNode._extract_tool_calls(state)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["name"], "http_post")
        self.assertEqual(calls[0]["args"]["url"], "https://example.com")

    def test_empty_messages_returns_empty(self):
        calls = AgentGuardNode._extract_tool_calls({"messages": []})
        self.assertEqual(calls, [])

    def test_no_tool_calls_field_returns_empty(self):
        calls = AgentGuardNode._extract_tool_calls({"messages": [{"content": "hello"}]})
        self.assertEqual(calls, [])


# ─── AgentGuardNode: __call__ (sync) ─────────────────────────────────────────


class TestAgentGuardNodeCall(unittest.TestCase):

    def test_allow_passes_state_through(self):
        node = _make_node(decision="allow")
        state = _state_explicit_tool_calls(_tc("read_file"))
        result = node(state)
        # State returned (possibly dict or original)
        self.assertIsNotNone(result)
        # No block marker
        result_dict = _state_to_dict(result)
        self.assertNotIn("__agentguard_blocked__", result_dict)

    def test_block_adds_block_marker(self):
        node = _make_node(decision="block", reason="Forbidden access")
        state = _state_explicit_tool_calls(_tc("exec_cmd", {"cmd": "rm -rf /"}))
        result = node(state)
        result_dict = _state_to_dict(result)
        self.assertIn("__agentguard_blocked__", result_dict)
        block_info = result_dict["__agentguard_blocked__"]
        self.assertEqual(block_info["tool"], "exec_cmd")
        self.assertEqual(block_info["decision"], "block")
        self.assertEqual(block_info["reason"], "Forbidden access")

    def test_block_raises_when_flag_set(self):
        node = _make_node(decision="block")
        state = _state_explicit_tool_calls(_tc("exec_cmd"))
        state["__agentguard_raise_on_block__"] = True
        with self.assertRaises(AgentGuardBlockError):
            node(state)

    def test_on_block_callback_invoked(self):
        on_block_cb = MagicMock()
        node = _make_node(decision="block", on_block=on_block_cb)
        state = _state_explicit_tool_calls(_tc("exec_cmd"))
        node(state)
        on_block_cb.assert_called_once()
        arg = on_block_cb.call_args[0][0]
        self.assertIsInstance(arg, AgentGuardBlockError)

    def test_on_allow_callback_invoked(self):
        on_allow_cb = MagicMock()
        node = _make_node(decision="allow", on_allow=on_allow_cb)
        state = _state_explicit_tool_calls(_tc("read_file"))
        node(state)
        on_allow_cb.assert_called_once()

    def test_no_tool_calls_passes_through(self):
        node = _make_node(decision="allow")
        state = {"messages": [], "other": "data"}
        result = node(state)
        # Should not have evaluated anything
        node._guard.evaluate.assert_not_called()
        self.assertEqual(_state_to_dict(result).get("other"), "data")

    def test_multiple_tool_calls_first_block_stops(self):
        """When first tool call is blocked, second is not evaluated."""
        node = _make_node(decision="block")
        state = _state_explicit_tool_calls(
            _tc("tool_a"),
            _tc("tool_b"),
        )
        node(state)
        # Should only have evaluated the first tool
        self.assertEqual(node._guard.evaluate.call_count, 1)

    def test_require_approval_treated_as_block(self):
        node = _make_node(decision="require_approval")
        state = _state_explicit_tool_calls(_tc("send_email"))
        result = node(state)
        result_dict = _state_to_dict(result)
        self.assertIn("__agentguard_blocked__", result_dict)
        self.assertEqual(result_dict["__agentguard_blocked__"]["decision"], "require_approval")

    def test_branch_detected_from_state(self):
        node = _make_node(decision="allow", branch_policies={"sensitive": {"level": "high"}})
        state = {
            "__agentguard_branch__": "sensitive",
            "tool_calls": [_tc("write_file")],
        }
        node(state)
        # Evaluate should have been called with branch metadata in params
        _, kwargs = node._guard.evaluate.call_args
        self.assertIn("__branch_level", kwargs["params"])

    def test_json_string_args_parsed(self):
        node = _make_node(decision="allow")
        tc = {"name": "search", "args": '{"query": "AI tools"}', "id": "tc-1"}
        state = {"tool_calls": [tc]}
        node(state)
        _, kwargs = node._guard.evaluate.call_args
        self.assertEqual(kwargs["params"]["query"], "AI tools")


# ─── AgentGuardNode: route() ─────────────────────────────────────────────────


class TestAgentGuardNodeRoute(unittest.TestCase):

    def test_route_allowed(self):
        node = _make_node(decision="allow")
        state = _state_explicit_tool_calls(_tc("read_file"))
        node(state)
        self.assertEqual(node.route(state), "tools")

    def test_route_blocked_via_instance(self):
        node = _make_node(decision="block")
        state = _state_explicit_tool_calls(_tc("exec_cmd"))
        node(state)
        self.assertEqual(node.route(state), "blocked")

    def test_route_blocked_via_state_marker(self):
        node = _make_node(decision="allow")
        state = {"__agentguard_blocked__": {"tool": "exec_cmd"}}
        self.assertEqual(node.route(state), "blocked")

    def test_custom_blocked_node_name(self):
        node = _make_node(decision="block", blocked_node="policy_reject")
        state = _state_explicit_tool_calls(_tc("exec_cmd"))
        node(state)
        self.assertEqual(node.route(state), "policy_reject")

    def test_custom_allowed_node_name(self):
        node = _make_node(decision="allow", allowed_node="execute")
        state = _state_explicit_tool_calls(_tc("read_file"))
        node(state)
        self.assertEqual(node.route(state), "execute")


# ─── AgentGuardNode: async ────────────────────────────────────────────────────


class TestAgentGuardNodeAsync(unittest.TestCase):

    def test_ainvoke_allow(self):
        node = _make_node(decision="allow")
        state = _state_explicit_tool_calls(_tc("read_file"))
        result = asyncio.run(node.ainvoke(state))
        self.assertIsNotNone(result)

    def test_ainvoke_block_adds_marker(self):
        node = _make_node(decision="block")
        state = _state_explicit_tool_calls(_tc("exec_cmd"))
        result = asyncio.run(node.ainvoke(state))
        result_dict = _state_to_dict(result)
        self.assertIn("__agentguard_blocked__", result_dict)


# ─── guarded_stream tests ─────────────────────────────────────────────────────


class TestGuardedStream(unittest.TestCase):

    def _patched_guard(self, decision: str = "allow"):
        """Return a patcher that replaces AgentGuard.evaluate."""
        mock_guard = MagicMock()
        mock_guard.evaluate = MagicMock(return_value={
            "result": decision,
            "riskScore": 0,
            "reason": "OK",
        })
        return mock_guard

    def test_all_chunks_yielded_when_allowed(self):
        chunks = [
            {"messages": [], "tool_calls": [_tc("read_file")]},
            {"messages": [], "tool_calls": []},
            {"messages": [], "tool_calls": [_tc("search")]},
        ]
        graph = _fake_graph(chunks)

        with patch("agentguard.integrations.langgraph.AgentGuard") as MockGuard:
            MockGuard.return_value.evaluate = MagicMock(return_value={
                "result": "allow", "riskScore": 0, "reason": "OK"
            })
            result = list(guarded_stream(graph, {}, api_key="ag_test"))

        self.assertEqual(len(result), 3)

    def test_stream_stops_on_block_and_raises(self):
        chunks = [
            {"tool_calls": []},                              # OK
            {"tool_calls": [_tc("exec_cmd")]},               # BLOCKED
            {"tool_calls": [_tc("read_file")]},              # should not reach
        ]
        graph = _fake_graph(chunks)

        def evaluate(tool, params):
            if tool == "exec_cmd":
                return {"result": "block", "riskScore": 900, "reason": "Forbidden"}
            return {"result": "allow", "riskScore": 0, "reason": "OK"}

        with patch("agentguard.integrations.langgraph.AgentGuard") as MockGuard:
            MockGuard.return_value.evaluate = MagicMock(side_effect=evaluate)
            with self.assertRaises(AgentGuardBlockError):
                list(guarded_stream(graph, {}, api_key="ag_test"))

    def test_on_block_callback_stops_stream_without_raise(self):
        chunks = [
            {"tool_calls": []},
            {"tool_calls": [_tc("exec_cmd")]},
            {"tool_calls": [_tc("read_file")]},
        ]
        graph = _fake_graph(chunks)
        on_block_cb = MagicMock()

        def evaluate(tool, params):
            if tool == "exec_cmd":
                return {"result": "block", "riskScore": 900, "reason": "Forbidden"}
            return {"result": "allow", "riskScore": 0, "reason": "OK"}

        with patch("agentguard.integrations.langgraph.AgentGuard") as MockGuard:
            MockGuard.return_value.evaluate = MagicMock(side_effect=evaluate)
            result = list(guarded_stream(graph, {}, api_key="ag_test", on_block=on_block_cb))

        on_block_cb.assert_called_once()
        # Should have yielded only the first chunk (before the block)
        self.assertEqual(len(result), 1)

    def test_updates_mode_tuple_chunks(self):
        """guarded_stream handles (node_name, state_delta) tuples."""
        chunks = [
            ("agent", {"tool_calls": []}),
            ("tools", {"tool_calls": [_tc("read_file")]}),
        ]
        graph = _fake_graph(chunks)

        with patch("agentguard.integrations.langgraph.AgentGuard") as MockGuard:
            MockGuard.return_value.evaluate = MagicMock(return_value={
                "result": "allow", "riskScore": 0, "reason": "OK"
            })
            result = list(guarded_stream(graph, {}, api_key="ag_test", stream_mode="updates"))

        self.assertEqual(len(result), 2)

    def test_no_tool_calls_chunk_passes_through(self):
        chunks = [{"messages": [], "output": "done"}]
        graph = _fake_graph(chunks)

        with patch("agentguard.integrations.langgraph.AgentGuard") as MockGuard:
            MockGuard.return_value.evaluate = MagicMock()
            result = list(guarded_stream(graph, {}, api_key="ag_test"))

        # No tool calls → evaluate never called
        MockGuard.return_value.evaluate.assert_not_called()
        self.assertEqual(len(result), 1)


# ─── aguarded_stream tests ────────────────────────────────────────────────────


class TestAguardedStream(unittest.TestCase):

    def _collect(self, coro_gen):
        """Run an async generator to completion and collect results."""
        async def _run():
            results = []
            async for item in coro_gen:
                results.append(item)
            return results

        return asyncio.run(_run())

    def test_async_all_chunks_yielded(self):
        chunks = [{"tool_calls": []}, {"tool_calls": []}]

        async def fake_astream(inputs, **kwargs):
            for c in chunks:
                yield c

        graph = MagicMock()
        graph.astream = fake_astream

        with patch("agentguard.integrations.langgraph.AgentGuard") as MockGuard:
            MockGuard.return_value.evaluate = MagicMock(return_value={
                "result": "allow", "riskScore": 0, "reason": "OK"
            })
            result = self._collect(aguarded_stream(graph, {}, api_key="ag_test"))

        self.assertEqual(len(result), 2)

    def test_async_block_raises(self):
        chunks = [{"tool_calls": [_tc("exec_cmd")]}]

        async def fake_astream(inputs, **kwargs):
            for c in chunks:
                yield c

        graph = MagicMock()
        graph.astream = fake_astream

        async def _run():
            with self.assertRaises(AgentGuardBlockError):
                async for _ in aguarded_stream(graph, {}, api_key="ag_test"):
                    pass

        with patch("agentguard.integrations.langgraph.AgentGuard") as MockGuard:
            MockGuard.return_value.evaluate = MagicMock(return_value={
                "result": "block", "riskScore": 900, "reason": "Blocked"
            })
            asyncio.run(_run())


# ─── wrap_tool_node tests ─────────────────────────────────────────────────────


class TestWrapToolNode(unittest.TestCase):

    def test_wrap_returns_guarded_node(self):
        tool_node = MagicMock()
        guarded = wrap_tool_node(tool_node, api_key="ag_test")
        self.assertIsInstance(guarded, _GuardedToolNode)

    def test_allowed_delegates_to_underlying_node(self):
        underlying = MagicMock(return_value={"output": "done"})
        guarded = wrap_tool_node(underlying, api_key="ag_test")
        guarded._guard.evaluate = MagicMock(return_value={"result": "allow", "riskScore": 0, "reason": "OK"})

        state = _state_explicit_tool_calls(_tc("read_file"))
        result = guarded(state)
        underlying.assert_called_once_with(state)

    def test_blocked_does_not_delegate(self):
        underlying = MagicMock(return_value={"output": "done"})
        guarded = wrap_tool_node(underlying, api_key="ag_test")
        guarded._guard.evaluate = MagicMock(return_value={"result": "block", "riskScore": 900, "reason": "Blocked"})

        state = _state_explicit_tool_calls(_tc("exec_cmd"))
        with self.assertRaises(AgentGuardBlockError):
            guarded(state)
        underlying.assert_not_called()

    def test_blocked_with_on_block_does_not_raise(self):
        underlying = MagicMock()
        on_block_cb = MagicMock()
        guarded = wrap_tool_node(underlying, api_key="ag_test", on_block=on_block_cb)
        guarded._guard.evaluate = MagicMock(return_value={"result": "block", "riskScore": 900, "reason": "B"})

        state = _state_explicit_tool_calls(_tc("exec_cmd"))
        result = guarded(state)  # Should not raise
        on_block_cb.assert_called_once()
        underlying.assert_not_called()
        # Returns state unchanged
        self.assertIs(result, state)

    def test_async_ainvoke_allowed(self):
        underlying = MagicMock()
        underlying.ainvoke = AsyncMock(return_value={"output": "ok"})
        guarded = wrap_tool_node(underlying, api_key="ag_test")
        guarded._guard.evaluate = MagicMock(return_value={"result": "allow", "riskScore": 0, "reason": "OK"})

        state = _state_explicit_tool_calls(_tc("read_file"))
        result = asyncio.run(guarded.ainvoke(state))
        underlying.ainvoke.assert_called_once()

    def test_async_ainvoke_blocked_raises(self):
        underlying = MagicMock()
        underlying.ainvoke = AsyncMock()
        guarded = wrap_tool_node(underlying, api_key="ag_test")
        guarded._guard.evaluate = MagicMock(return_value={"result": "block", "riskScore": 900, "reason": "B"})

        state = _state_explicit_tool_calls(_tc("exec_cmd"))

        async def _run():
            with self.assertRaises(AgentGuardBlockError):
                await guarded.ainvoke(state)

        asyncio.run(_run())
        underlying.ainvoke.assert_not_called()


# ─── create_branch_guard tests ────────────────────────────────────────────────


class TestCreateBranchGuard(unittest.TestCase):

    def test_creates_one_node_per_branch(self):
        guards = create_branch_guard(
            api_key="ag_test",
            branches={
                "sensitive": "agent-sensitive",
                "public":    "agent-public",
            },
        )
        self.assertIn("sensitive", guards)
        self.assertIn("public", guards)
        self.assertIsInstance(guards["sensitive"], AgentGuardNode)
        self.assertIsInstance(guards["public"], AgentGuardNode)

    def test_agent_id_set_per_branch(self):
        guards = create_branch_guard(
            api_key="ag_test",
            branches={"branch_a": "agent-a", "branch_b": None},
        )
        self.assertEqual(guards["branch_a"]._agent_id, "agent-a")
        self.assertIsNone(guards["branch_b"]._agent_id)


# ─── _state_to_dict helper tests ─────────────────────────────────────────────


class TestStateToDictHelper(unittest.TestCase):

    def test_dict_returned_as_is(self):
        state = {"a": 1, "b": 2}
        self.assertEqual(_state_to_dict(state), state)

    def test_object_with_dict_converted(self):
        class MyState:
            def __init__(self):
                self.x = 10
                self.y = 20

        self.assertEqual(_state_to_dict(MyState()), {"x": 10, "y": 20})

    def test_pydantic_style_model_dump(self):
        class FakeModel:
            def model_dump(self):
                return {"field": "value"}

        result = _state_to_dict(FakeModel())
        self.assertEqual(result, {"field": "value"})

    def test_unknown_type_returns_empty(self):
        result = _state_to_dict(42)
        self.assertEqual(result, {})


if __name__ == "__main__":
    unittest.main()
