"""Tests for AgentGuard CrewAI integration.

Uses mocked CrewAI objects and a mocked AgentGuard client to avoid any
network calls or real framework dependencies.
"""
from __future__ import annotations

import json
import unittest
from typing import Any, Dict, Optional
from unittest.mock import MagicMock, patch, PropertyMock

from agentguard.integrations.crewai import (
    AgentGuardCallback,
    _CrewAIGuard,
    crewai_guard,
)
from agentguard.integrations.errors import AgentGuardBlockError


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _make_guard(
    decision: str = "allow",
    risk_score: int = 0,
    reason: str = "Allowed by rule",
    on_block=None,
    on_allow=None,
    block_actions: bool = True,
) -> AgentGuardCallback:
    """Build an AgentGuardCallback with a mocked evaluate response."""
    cb = AgentGuardCallback(
        api_key="ag_test",
        on_block=on_block,
        on_allow=on_allow,
        block_actions=block_actions,
    )
    cb._guard.evaluate = MagicMock(return_value={
        "result": decision,
        "riskScore": risk_score,
        "reason": reason,
    })
    return cb


def _make_action(tool: str, tool_input: Any = None):
    """Simulate a LangChain/CrewAI AgentAction object."""
    action = MagicMock()
    action.tool = tool
    action.tool_input = tool_input or {}
    return action


# ─── AgentGuardCallback tests ─────────────────────────────────────────────────


class TestAgentGuardCallbackToolStart(unittest.TestCase):

    def test_allow_passes_through(self):
        cb = _make_guard(decision="allow")
        # Should not raise
        cb.on_tool_start({"name": "read_file"}, '{"path": "/data/report.csv"}')
        cb._guard.evaluate.assert_called_once_with(
            tool="read_file", params={"path": "/data/report.csv"}
        )

    def test_block_raises(self):
        cb = _make_guard(decision="block", reason="File access restricted")
        with self.assertRaises(AgentGuardBlockError) as ctx:
            cb.on_tool_start({"name": "read_file"}, '{"path": "/etc/passwd"}')
        self.assertEqual(ctx.exception.decision, "block")
        self.assertIn("read_file", str(ctx.exception))

    def test_require_approval_raises(self):
        cb = _make_guard(decision="require_approval")
        with self.assertRaises(AgentGuardBlockError) as ctx:
            cb.on_tool_start({"name": "send_email"}, {"to": "boss@example.com"})
        self.assertEqual(ctx.exception.decision, "require_approval")

    def test_tool_name_extracted_from_id_list(self):
        """on_tool_start extracts tool name from serialized['id'] list."""
        cb = _make_guard(decision="allow")
        cb.on_tool_start({"id": ["tools", "WriteFileTool"]}, "{}")
        call_kwargs = cb._guard.evaluate.call_args
        self.assertEqual(call_kwargs[1]["tool"], "WriteFileTool")

    def test_json_string_input_parsed(self):
        cb = _make_guard(decision="allow")
        cb.on_tool_start({"name": "write_file"}, '{"path": "/tmp/out.txt", "content": "hello"}')
        _, kwargs = cb._guard.evaluate.call_args
        self.assertEqual(kwargs["params"], {"path": "/tmp/out.txt", "content": "hello"})

    def test_dict_input_passed_directly(self):
        cb = _make_guard(decision="allow")
        params = {"query": "SELECT * FROM users"}
        cb.on_tool_start({"name": "sql_query"}, params)
        _, kwargs = cb._guard.evaluate.call_args
        self.assertEqual(kwargs["params"], params)

    def test_invalid_json_string_wrapped_as_input(self):
        cb = _make_guard(decision="allow")
        cb.on_tool_start({"name": "search"}, "not-json-at-all")
        _, kwargs = cb._guard.evaluate.call_args
        self.assertEqual(kwargs["params"], {"input": "not-json-at-all"})

    def test_on_block_callback_invoked(self):
        block_cb = MagicMock()
        cb = _make_guard(decision="block", on_block=block_cb)
        with self.assertRaises(AgentGuardBlockError):
            cb.on_tool_start({"name": "exec_cmd"}, "{}")
        block_cb.assert_called_once()
        arg = block_cb.call_args[0][0]
        self.assertIsInstance(arg, AgentGuardBlockError)

    def test_on_allow_callback_invoked(self):
        allow_cb = MagicMock()
        cb = _make_guard(decision="allow", on_allow=allow_cb)
        cb.on_tool_start({"name": "search"}, "{}")
        allow_cb.assert_called_once()

    def test_monitor_only_mode_does_not_raise(self):
        cb = _make_guard(decision="block", block_actions=False)
        # Should NOT raise even on block
        cb.on_tool_start({"name": "exec_cmd"}, "{}")

    def test_monitor_only_invokes_on_block(self):
        block_cb = MagicMock()
        cb = _make_guard(decision="block", block_actions=False, on_block=block_cb)
        cb.on_tool_start({"name": "exec_cmd"}, "{}")
        block_cb.assert_called_once()


class TestAgentGuardCallbackAgentAction(unittest.TestCase):

    def test_agent_action_object_allowed(self):
        cb = _make_guard(decision="allow")
        action = _make_action("search", {"query": "python tutorial"})
        cb.on_agent_action(action)
        cb._guard.evaluate.assert_called_once()
        _, kwargs = cb._guard.evaluate.call_args
        self.assertEqual(kwargs["tool"], "search")

    def test_agent_action_object_blocked(self):
        cb = _make_guard(decision="block")
        action = _make_action("exec_shell", {"cmd": "rm -rf /"})
        with self.assertRaises(AgentGuardBlockError):
            cb.on_agent_action(action)

    def test_agent_action_dict_format(self):
        cb = _make_guard(decision="allow")
        action = {"tool": "write_file", "tool_input": {"path": "/tmp/a.txt"}}
        cb.on_agent_action(action)
        cb._guard.evaluate.assert_called_once_with(
            tool="write_file", params={"path": "/tmp/a.txt"}
        )

    def test_agent_action_json_string_input(self):
        cb = _make_guard(decision="allow")
        action = _make_action("http_post", '{"url": "https://example.com", "body": "..."}')
        cb.on_agent_action(action)
        _, kwargs = cb._guard.evaluate.call_args
        self.assertEqual(kwargs["params"]["url"], "https://example.com")

    def test_unknown_action_type_no_crash(self):
        cb = _make_guard(decision="allow")
        # Object with no .tool attribute at all
        cb.on_agent_action("just a string")
        # Should not evaluate (no tool name)
        cb._guard.evaluate.assert_not_called()


class TestAgentGuardCallbackChainHooks(unittest.TestCase):

    def test_on_chain_start_no_crash(self):
        cb = _make_guard(decision="allow")
        cb.on_chain_start({"name": "ResearchTask"}, {"input": "find AI papers"})

    def test_on_chain_end_no_crash(self):
        cb = _make_guard(decision="allow")
        cb.on_chain_end({"output": "done"})

    def test_on_chain_error_no_crash(self):
        cb = _make_guard(decision="allow")
        cb.on_chain_error(RuntimeError("something went wrong"))

    def test_on_llm_start_no_crash(self):
        cb = _make_guard(decision="allow")
        cb.on_llm_start({"name": "ChatOpenAI"}, ["Hello!"])

    def test_on_llm_end_no_crash(self):
        cb = _make_guard(decision="allow")
        cb.on_llm_end(MagicMock())

    def test_on_tool_end_no_crash(self):
        cb = _make_guard(decision="allow")
        cb.on_tool_end("tool result")

    def test_on_tool_error_no_crash(self):
        cb = _make_guard(decision="allow")
        cb.on_tool_error(ValueError("tool failed"))


class TestAgentGuardCallbackDelegation(unittest.TestCase):

    def test_delegation_text_evaluated(self):
        cb = _make_guard(decision="allow")
        cb.on_text("I need to delegate this task to the research agent.")
        cb._guard.evaluate.assert_called_once()
        _, kwargs = cb._guard.evaluate.call_args
        self.assertEqual(kwargs["tool"], "agent_delegation")

    def test_assign_to_pattern_triggers_eval(self):
        cb = _make_guard(decision="allow")
        cb.on_text("assign to the writer agent for drafting")
        cb._guard.evaluate.assert_called_once()

    def test_non_delegation_text_not_evaluated(self):
        cb = _make_guard(decision="allow")
        cb.on_text("The weather today is sunny.")
        cb._guard.evaluate.assert_not_called()

    def test_delegation_block_raises(self):
        cb = _make_guard(decision="block")
        with self.assertRaises(AgentGuardBlockError):
            cb.on_text("Please delegate this to another agent.")


class TestAgentGuardCallbackBeforeTaskStart(unittest.TestCase):

    def test_task_start_allowed(self):
        cb = _make_guard(decision="allow")
        result = cb.before_task_start("write_report", {"format": "pdf"})
        self.assertIn("decision", result)

    def test_task_start_blocked(self):
        cb = _make_guard(decision="block")
        with self.assertRaises(AgentGuardBlockError):
            cb.before_task_start("execute_sql")

    def test_before_tool_execution_allowed(self):
        cb = _make_guard(decision="allow", risk_score=10)
        result = cb.before_tool_execution("read_file", {"path": "/data/a.csv"})
        self.assertEqual(result["decision"], "allow")
        self.assertEqual(result["risk_score"], 10)

    def test_before_tool_execution_blocked(self):
        cb = _make_guard(decision="block", reason="Forbidden file access")
        with self.assertRaises(AgentGuardBlockError) as ctx:
            cb.before_tool_execution("read_file", {"path": "/etc/passwd"})
        self.assertEqual(ctx.exception.reason, "Forbidden file access")


# ─── _CrewAIGuard (imperative style) tests ───────────────────────────────────


class TestCrewAIGuardImperative(unittest.TestCase):

    def setUp(self):
        self.guard = crewai_guard(api_key="ag_test")
        self.guard._guard.evaluate = MagicMock(return_value={
            "result": "allow",
            "riskScore": 0,
            "reason": "Allowed",
        })

    def test_before_tool_execution_allow(self):
        result = self.guard.before_tool_execution("read_file", {"path": "/data/a.csv"})
        self.assertEqual(result["decision"], "allow")
        self.assertEqual(result["risk_score"], 0)

    def test_before_tool_execution_block(self):
        self.guard._guard.evaluate.return_value = {
            "result": "block",
            "riskScore": 750,
            "reason": "Blocked",
        }
        with self.assertRaises(AgentGuardBlockError):
            self.guard.before_tool_execution("exec_cmd", {"cmd": "rm -rf /"})

    def test_evaluate_batch_all_allowed(self):
        calls = [
            {"tool": "read_file", "args": {"path": "/data/a.csv"}},
            {"tool": "search",    "args": {"query": "weather"}},
        ]
        results = self.guard.evaluate_batch(calls)
        self.assertEqual(len(results), 2)
        self.assertTrue(all(r["decision"] == "allow" for r in results))

    def test_evaluate_batch_mixed(self):
        def side_effect(tool, params):
            if tool == "exec_cmd":
                return {"result": "block", "riskScore": 900, "reason": "Blocked"}
            return {"result": "allow", "riskScore": 0, "reason": "OK"}

        self.guard._guard.evaluate.side_effect = side_effect
        calls = [
            {"tool": "read_file", "args": {}},
            {"tool": "exec_cmd",  "args": {"cmd": "rm -rf /"}},
        ]
        results = self.guard.evaluate_batch(calls)
        self.assertEqual(results[0]["decision"], "allow")
        self.assertEqual(results[1]["decision"], "block")

    def test_evaluate_batch_evaluation_error_returns_block(self):
        self.guard._guard.evaluate.side_effect = RuntimeError("Network error")
        results = self.guard.evaluate_batch([{"tool": "read_file", "args": {}}])
        self.assertEqual(results[0]["decision"], "block")
        self.assertEqual(results[0]["matched_rule_id"], "EVAL_ERROR")
        self.assertIn("Network error", results[0]["reason"])

    def test_evaluate_batch_empty_list(self):
        results = self.guard.evaluate_batch([])
        self.assertEqual(results, [])

    def test_crewai_guard_factory_returns_guard(self):
        g = crewai_guard(api_key="ag_test")
        self.assertIsInstance(g, _CrewAIGuard)


# ─── Static helper tests ──────────────────────────────────────────────────────


class TestStaticHelpers(unittest.TestCase):

    def test_extract_tool_name_from_name_key(self):
        result = AgentGuardCallback._extract_tool_name({"name": "read_file"})
        self.assertEqual(result, "read_file")

    def test_extract_tool_name_from_id_list(self):
        result = AgentGuardCallback._extract_tool_name({"id": ["tools", "SearchTool"]})
        self.assertEqual(result, "SearchTool")

    def test_extract_tool_name_fallback(self):
        result = AgentGuardCallback._extract_tool_name({})
        self.assertEqual(result, "unknown_tool")

    def test_parse_input_dict(self):
        params = {"key": "val"}
        result = AgentGuardCallback._parse_input(params)
        self.assertEqual(result, params)

    def test_parse_input_valid_json_string(self):
        result = AgentGuardCallback._parse_input('{"a": 1}')
        self.assertEqual(result, {"a": 1})

    def test_parse_input_non_dict_json(self):
        result = AgentGuardCallback._parse_input('[1, 2, 3]')
        self.assertEqual(result, {"input": "[1, 2, 3]"})

    def test_parse_input_invalid_json(self):
        result = AgentGuardCallback._parse_input("raw string")
        self.assertEqual(result, {"input": "raw string"})

    def test_extract_action_object(self):
        action = MagicMock()
        action.tool = "my_tool"
        action.tool_input = {"x": 1}
        tool_name, params = AgentGuardCallback._extract_action(action)
        self.assertEqual(tool_name, "my_tool")
        self.assertEqual(params, {"x": 1})

    def test_extract_action_dict(self):
        action = {"tool": "my_tool", "tool_input": {"x": 1}}
        tool_name, params = AgentGuardCallback._extract_action(action)
        self.assertEqual(tool_name, "my_tool")
        self.assertEqual(params, {"x": 1})

    def test_extract_action_unknown_type(self):
        tool_name, params = AgentGuardCallback._extract_action("not an action")
        self.assertEqual(tool_name, "")
        self.assertEqual(params, {})


if __name__ == "__main__":
    unittest.main()
