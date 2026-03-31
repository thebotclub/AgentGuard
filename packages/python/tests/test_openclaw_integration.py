"""Tests for AgentGuard OpenClaw integration.

Uses unittest.mock to patch urllib.request.urlopen — no real network calls
or openclaw package required.
"""
from __future__ import annotations

import asyncio
import json
import unittest
from io import BytesIO
from typing import Any, Dict, Optional
from unittest.mock import MagicMock, patch

from agentguard.integrations.openclaw import (
    OpenClawDecision,
    OpenClawGuard,
    openclaw_guard,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_response(
    allowed: bool = True,
    decision: str = "allow",
    reason: str = "Allowed by policy",
    risk_score: int = 0,
    matched_rule_id: Optional[str] = None,
    gate_id: Optional[str] = None,
    gate_timeout_sec: Optional[int] = None,
) -> MagicMock:
    """Build a fake urllib response context manager."""
    body = json.dumps({
        "allowed": allowed,
        "decision": decision,
        "reason": reason,
        "riskScore": risk_score,
        "matchedRuleId": matched_rule_id,
        "gateId": gate_id,
        "gateTimeoutSec": gate_timeout_sec,
    }).encode("utf-8")
    mock_resp = MagicMock()
    mock_resp.read.return_value = body
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    return mock_resp


def _make_guard(strict: bool = True) -> OpenClawGuard:
    return OpenClawGuard(
        api_key="ag_test",
        agent_id="test-agent",
        strict=strict,
    )


# ─── OpenClawDecision tests ───────────────────────────────────────────────────


class TestOpenClawDecision(unittest.TestCase):

    def test_is_blocked_true_for_block(self):
        d = OpenClawDecision(allowed=False, decision="block", reason="r", risk_score=800)
        self.assertTrue(d.is_blocked)
        self.assertFalse(d.is_hitl)
        self.assertFalse(d.is_monitor)

    def test_is_hitl_true_for_hitl(self):
        d = OpenClawDecision(allowed=False, decision="hitl", reason="r", risk_score=600)
        self.assertTrue(d.is_hitl)
        self.assertFalse(d.is_blocked)

    def test_is_monitor_true_for_monitor(self):
        d = OpenClawDecision(allowed=True, decision="monitor", reason="r", risk_score=200)
        self.assertTrue(d.is_monitor)

    def test_to_openclaw_result_allow_returns_none(self):
        d = OpenClawDecision(allowed=True, decision="allow", reason="OK", risk_score=0)
        self.assertIsNone(d.to_openclaw_result())

    def test_to_openclaw_result_monitor_returns_none(self):
        d = OpenClawDecision(allowed=True, decision="monitor", reason="Logged", risk_score=150)
        self.assertIsNone(d.to_openclaw_result())

    def test_to_openclaw_result_block_returns_block_dict(self):
        d = OpenClawDecision(allowed=False, decision="block", reason="Forbidden path", risk_score=900)
        result = d.to_openclaw_result()
        self.assertIsNotNone(result)
        self.assertTrue(result["block"])
        self.assertIn("Forbidden path", result["blockReason"])

    def test_to_openclaw_result_hitl_returns_block_with_json(self):
        d = OpenClawDecision(
            allowed=False,
            decision="hitl",
            reason="Needs approval",
            risk_score=500,
            gate_id="gate-abc",
            gate_timeout_sec=300,
        )
        result = d.to_openclaw_result()
        self.assertIsNotNone(result)
        self.assertTrue(result["block"])
        payload = json.loads(result["blockReason"])
        self.assertEqual(payload["status"], "hitl_pending")
        self.assertEqual(payload["gateId"], "gate-abc")
        self.assertEqual(payload["gateTimeoutSec"], 300)


# ─── OpenClawGuard.intercept_sync tests ──────────────────────────────────────


class TestOpenClawGuardInterceptSync(unittest.TestCase):

    @patch("urllib.request.urlopen")
    def test_allow_decision(self, mock_urlopen):
        mock_urlopen.return_value = _make_response(allowed=True, decision="allow")
        guard = _make_guard()
        decision = guard.intercept_sync("web_search", {"query": "AI news"})
        self.assertTrue(decision.allowed)
        self.assertEqual(decision.decision, "allow")

    @patch("urllib.request.urlopen")
    def test_block_decision(self, mock_urlopen):
        mock_urlopen.return_value = _make_response(
            allowed=False,
            decision="block",
            reason="Domain not in allowlist",
            risk_score=900,
            matched_rule_id="rule-001",
        )
        guard = _make_guard()
        decision = guard.intercept_sync("web_request", {"url": "https://evil.example.com"})
        self.assertFalse(decision.allowed)
        self.assertTrue(decision.is_blocked)
        self.assertEqual(decision.matched_rule_id, "rule-001")
        self.assertEqual(decision.risk_score, 900)

    @patch("urllib.request.urlopen")
    def test_hitl_decision(self, mock_urlopen):
        mock_urlopen.return_value = _make_response(
            allowed=False,
            decision="hitl",
            reason="Shell command requires approval",
            risk_score=600,
            gate_id="gate-xyz",
            gate_timeout_sec=120,
        )
        guard = _make_guard()
        decision = guard.intercept_sync("exec_shell", {"cmd": "ls -la"})
        self.assertTrue(decision.is_hitl)
        self.assertEqual(decision.gate_id, "gate-xyz")
        self.assertEqual(decision.gate_timeout_sec, 120)

    @patch("urllib.request.urlopen")
    def test_monitor_decision_allowed(self, mock_urlopen):
        mock_urlopen.return_value = _make_response(
            allowed=True,
            decision="monitor",
            reason="Logged for audit",
            risk_score=200,
        )
        guard = _make_guard()
        decision = guard.intercept_sync("filesystem_read", {"path": "/data/report.csv"})
        self.assertTrue(decision.allowed)
        self.assertTrue(decision.is_monitor)

    @patch("urllib.request.urlopen")
    def test_request_body_contains_correct_fields(self, mock_urlopen):
        mock_urlopen.return_value = _make_response()
        guard = _make_guard()
        guard.intercept_sync(
            "filesystem_write",
            {"path": "/tmp/out.txt", "content": "hello"},
            session_id="sess-001",
            run_id="run-abc",
            tool_call_id="call-123",
        )
        call_args = mock_urlopen.call_args
        req = call_args[0][0]
        body = json.loads(req.data.decode("utf-8"))
        self.assertEqual(body["request"]["method"], "tool_call")
        self.assertEqual(body["request"]["id"], "call-123")
        self.assertEqual(body["request"]["params"]["name"], "filesystem_write")
        self.assertEqual(body["request"]["params"]["arguments"]["path"], "/tmp/out.txt")
        self.assertEqual(body["identity"]["agentId"], "test-agent")
        self.assertEqual(body["identity"]["sessionId"], "sess-001")
        self.assertEqual(body["identity"]["runId"], "run-abc")

    @patch("urllib.request.urlopen")
    def test_endpoint_is_openclaw_intercept(self, mock_urlopen):
        mock_urlopen.return_value = _make_response()
        guard = _make_guard()
        guard.intercept_sync("some_tool", {})
        req = mock_urlopen.call_args[0][0]
        self.assertIn("/v1/openclaw/intercept", req.full_url)

    def test_strict_mode_fail_closed_on_network_error(self):
        with patch("urllib.request.urlopen", side_effect=OSError("Connection refused")):
            guard = _make_guard(strict=True)
            decision = guard.intercept_sync("web_search", {"query": "test"})
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.decision, "block")
        self.assertIn("strict mode", decision.reason)
        self.assertEqual(decision.risk_score, 800)

    def test_permissive_mode_fail_open_on_network_error(self):
        with patch("urllib.request.urlopen", side_effect=OSError("Connection refused")):
            guard = _make_guard(strict=False)
            decision = guard.intercept_sync("web_search", {"query": "test"})
        self.assertTrue(decision.allowed)
        self.assertEqual(decision.decision, "allow")
        self.assertIn("permissive mode", decision.reason)

    def test_strict_mode_fail_closed_on_timeout(self):
        import socket
        with patch("urllib.request.urlopen", side_effect=socket.timeout("timed out")):
            guard = _make_guard(strict=True)
            decision = guard.intercept_sync("slow_tool", {})
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.decision, "block")

    def test_evaluation_ms_populated(self):
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.return_value = _make_response()
            guard = _make_guard()
            decision = guard.intercept_sync("tool", {})
        self.assertGreaterEqual(decision.evaluation_ms, 0.0)


# ─── OpenClawGuard.intercept (async) tests ───────────────────────────────────


class TestOpenClawGuardInterceptAsync(unittest.TestCase):

    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    @patch("urllib.request.urlopen")
    def test_async_allow(self, mock_urlopen):
        mock_urlopen.return_value = _make_response(allowed=True, decision="allow")
        guard = _make_guard()
        decision = self._run(guard.intercept("web_search", {"query": "python"}))
        self.assertTrue(decision.allowed)

    @patch("urllib.request.urlopen")
    def test_async_block(self, mock_urlopen):
        mock_urlopen.return_value = _make_response(
            allowed=False, decision="block", reason="Blocked"
        )
        guard = _make_guard()
        decision = self._run(guard.intercept("exec_shell", {"cmd": "rm -rf /"}))
        self.assertTrue(decision.is_blocked)

    def test_async_strict_fail_closed(self):
        with patch("urllib.request.urlopen", side_effect=OSError("down")):
            guard = _make_guard(strict=True)
            decision = self._run(guard.intercept("tool", {}))
        self.assertFalse(decision.allowed)

    def test_async_permissive_fail_open(self):
        with patch("urllib.request.urlopen", side_effect=OSError("down")):
            guard = _make_guard(strict=False)
            decision = self._run(guard.intercept("tool", {}))
        self.assertTrue(decision.allowed)


# ─── OpenClawGuard.before_tool_call hook tests ───────────────────────────────


class TestOpenClawGuardBeforeToolCall(unittest.TestCase):

    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    @patch("urllib.request.urlopen")
    def test_allow_returns_none(self, mock_urlopen):
        mock_urlopen.return_value = _make_response(allowed=True, decision="allow")
        guard = _make_guard()
        event = {"toolName": "web_search", "params": {"query": "test"}}
        result = self._run(guard.before_tool_call(event))
        self.assertIsNone(result)

    @patch("urllib.request.urlopen")
    def test_block_returns_block_dict(self, mock_urlopen):
        mock_urlopen.return_value = _make_response(
            allowed=False, decision="block", reason="Blocked by policy"
        )
        guard = _make_guard()
        event = {"toolName": "exec_shell", "params": {"cmd": "cat /etc/passwd"}}
        result = self._run(guard.before_tool_call(event))
        self.assertIsNotNone(result)
        self.assertTrue(result["block"])
        self.assertIn("Blocked by policy", result["blockReason"])

    @patch("urllib.request.urlopen")
    def test_hitl_returns_block_with_gate_info(self, mock_urlopen):
        mock_urlopen.return_value = _make_response(
            allowed=False,
            decision="hitl",
            reason="Approval required",
            gate_id="gate-001",
            gate_timeout_sec=60,
        )
        guard = _make_guard()
        event = {"toolName": "send_email", "params": {"to": "ceo@company.com"}}
        result = self._run(guard.before_tool_call(event))
        self.assertIsNotNone(result)
        self.assertTrue(result["block"])
        payload = json.loads(result["blockReason"])
        self.assertEqual(payload["status"], "hitl_pending")
        self.assertEqual(payload["gateId"], "gate-001")

    @patch("urllib.request.urlopen")
    def test_session_id_passed_from_ctx(self, mock_urlopen):
        mock_urlopen.return_value = _make_response()
        guard = _make_guard()
        event = {"toolName": "tool", "params": {}}
        ctx = {"sessionId": "ctx-session-999"}
        self._run(guard.before_tool_call(event, ctx))
        req = mock_urlopen.call_args[0][0]
        body = json.loads(req.data.decode("utf-8"))
        self.assertEqual(body["identity"]["sessionId"], "ctx-session-999")

    @patch("urllib.request.urlopen")
    def test_run_id_and_tool_call_id_from_event(self, mock_urlopen):
        mock_urlopen.return_value = _make_response()
        guard = _make_guard()
        event = {
            "toolName": "tool",
            "params": {},
            "runId": "run-42",
            "toolCallId": "call-99",
        }
        self._run(guard.before_tool_call(event))
        req = mock_urlopen.call_args[0][0]
        body = json.loads(req.data.decode("utf-8"))
        self.assertEqual(body["identity"]["runId"], "run-42")
        self.assertEqual(body["request"]["id"], "call-99")


# ─── openclaw_guard factory tests ────────────────────────────────────────────


class TestOpenClawGuardFactory(unittest.TestCase):

    def test_returns_openclaw_guard_instance(self):
        guard = openclaw_guard(api_key="ag_test", agent_id="agent-1")
        self.assertIsInstance(guard, OpenClawGuard)

    def test_reads_api_key_from_env(self):
        import os
        os.environ["AGENTGUARD_API_KEY"] = "ag_env_key"
        try:
            guard = openclaw_guard(agent_id="agent-1")
            self.assertEqual(guard._api_key, "ag_env_key")
        finally:
            del os.environ["AGENTGUARD_API_KEY"]

    def test_reads_agent_id_from_env(self):
        import os
        os.environ["AGENTGUARD_AGENT_ID"] = "env-agent"
        try:
            guard = openclaw_guard(api_key="ag_key")
            self.assertEqual(guard._agent_id, "env-agent")
        finally:
            del os.environ["AGENTGUARD_AGENT_ID"]

    def test_default_strict_is_true(self):
        guard = openclaw_guard(api_key="ag_key", agent_id="agent")
        self.assertTrue(guard._strict)

    def test_permissive_mode(self):
        guard = openclaw_guard(api_key="ag_key", agent_id="agent", strict=False)
        self.assertFalse(guard._strict)

    def test_custom_base_url(self):
        guard = openclaw_guard(
            api_key="ag_key",
            agent_id="agent",
            base_url="http://localhost:8080",
        )
        self.assertEqual(guard._base_url, "http://localhost:8080")


if __name__ == "__main__":
    unittest.main()
