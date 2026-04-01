"""AgentGuard Python SDK — Runtime security for AI agents."""
import json
import os
import platform
import re
import sys
import threading
import time
import uuid
from fnmatch import fnmatch
from typing import Any, Dict, List, Optional, Tuple
from urllib.request import Request, urlopen
from urllib.error import HTTPError

__version__ = "0.9.0"


# ─── Local Policy Engine ───────────────────────────────────────────────────────

class _LocalPolicyEngine:
    """
    In-process policy evaluator for <5ms local evaluation.

    Consumes a PolicyBundle dict (same shape as GET /api/v1/policy/bundle)
    and evaluates tool calls without any I/O.
    """

    _BASE_RISK: Dict[str, int] = {
        "allow": 0,
        "monitor": 10,
        "block": 50,
        "require_approval": 40,
    }

    def __init__(self) -> None:
        self._policy: Optional[Dict] = None
        self._lock = threading.Lock()

    def is_ready(self) -> bool:
        with self._lock:
            return self._policy is not None

    def policy_version(self) -> Optional[str]:
        with self._lock:
            return self._policy.get("version") if self._policy else None

    def policy_checksum(self) -> Optional[str]:
        with self._lock:
            return self._policy.get("checksum") if self._policy else None

    def load_policy(self, policy_json: str) -> None:
        bundle = json.loads(policy_json)
        if not isinstance(bundle, dict) or not isinstance(bundle.get("rules"), list):
            raise ValueError("_LocalPolicyEngine: invalid policy JSON")
        with self._lock:
            self._policy = bundle

    def load_bundle(self, bundle: Dict) -> None:
        with self._lock:
            self._policy = bundle

    def evaluate(self, tool: str, params: Optional[Dict] = None) -> Dict:
        with self._lock:
            policy = self._policy
        if policy is None:
            raise RuntimeError(
                "_LocalPolicyEngine: no policy loaded. Call sync_policies() first."
            )
        start = time.perf_counter()
        result = self._evaluate(tool, params or {}, policy)
        result["duration_ms"] = (time.perf_counter() - start) * 1000
        return result

    def _evaluate(self, tool: str, params: Dict, bundle: Dict) -> Dict:
        tool_index: Dict[str, List[int]] = bundle.get("toolIndex", {})
        rules: List[Dict] = bundle.get("rules", [])

        exact = tool_index.get(tool, [])
        wildcard = tool_index.get("*", [])
        no_tool = tool_index.get("__no_tool__", [])

        candidate_indices = set(exact) | set(wildcard) | set(no_tool)
        candidates = [rules[i] for i in candidate_indices if i < len(rules)]
        candidates.sort(key=lambda r: r.get("priority", 100))

        monitor_boost = 0
        winning_priority: Optional[int] = None
        terminal_group: List[Dict] = []

        # Pass 1: collect monitor rules (accumulate, never terminate)
        for rule in candidates:
            if rule.get("action") != "monitor":
                continue
            if self._matches_rule(rule, tool, params):
                monitor_boost += rule.get("riskBoost", 0)

        # Pass 2: first-match terminal rule
        for rule in candidates:
            if rule.get("action") == "monitor":
                continue
            if not self._matches_rule(rule, tool, params):
                continue
            priority = rule.get("priority", 100)
            if winning_priority is None:
                winning_priority = priority
                terminal_group.append(rule)
            elif priority == winning_priority:
                terminal_group.append(rule)
            else:
                break

        terminal_rule: Optional[Dict] = None
        if len(terminal_group) == 1:
            terminal_rule = terminal_group[0]
        elif len(terminal_group) > 1:
            rank = {"block": 3, "require_approval": 2, "monitor": 1, "allow": 0}
            terminal_rule = max(terminal_group, key=lambda r: rank.get(r.get("action", "allow"), 0))

        if terminal_rule is None:
            action = bundle.get("defaultAction", "block")
            if action == "block":
                reason = "No matching rule — default action is block (fail-closed)"
            elif action == "monitor":
                reason = "No matching rule — default action is monitor (unknown tool flagged for review)"
            else:
                reason = "No matching rule — default action is allow (fail-open)"
            matched_rule_id = None
        else:
            action = terminal_rule.get("action", "block")
            matched_rule_id = terminal_rule.get("id")
            action_labels = {
                "allow": "Allowed",
                "block": "Blocked",
                "monitor": "Monitored",
                "require_approval": "Human approval required",
            }
            label = action_labels.get(action, "Handled")
            reason = f'{label} by rule "{matched_rule_id}"'

        base = self._BASE_RISK.get(action, 0)
        risk_score = min(1000, round((base + monitor_boost) * 1.5))

        result: Dict = {
            "result": action,
            "risk_score": risk_score,
            "reason": reason,
        }
        if matched_rule_id is not None:
            result["matched_rule_id"] = matched_rule_id
        return result

    def _matches_rule(self, rule: Dict, tool: str, params: Dict) -> bool:
        # Tool condition
        tc = rule.get("toolCondition")
        if tc and not self._matches_tool(tc, tool):
            return False
        # Param conditions (AND logic)
        for param_map in rule.get("paramConditions", []):
            if not self._matches_params(param_map, params):
                return False
        # Composite conditions (AND/OR/NOT)
        for composite in rule.get("compositeConditions", []):
            if not self._eval_composite(composite, tool, params):
                return False
        return True

    def _eval_composite(self, cond: Dict, tool: str, params: Dict) -> bool:
        """Recursively evaluate AND/OR/NOT composite conditions."""
        if "AND" in cond:
            return all(self._eval_composite(c, tool, params) for c in cond["AND"])
        if "OR" in cond:
            return any(self._eval_composite(c, tool, params) for c in cond["OR"])
        if "NOT" in cond:
            return not self._eval_composite(cond["NOT"], tool, params)
        # Leaf conditions
        if "tool" in cond:
            return self._matches_tool(cond["tool"], tool)
        if "params" in cond:
            return self._matches_params(cond["params"], params)
        if "context" in cond:
            return True  # context conditions not available in local engine
        if "dataClass" in cond:
            return True  # data class conditions not available in local engine
        if "timeWindow" in cond:
            return True  # time window conditions not available in local engine
        return True

    def _matches_tool(self, condition: Dict, tool: str) -> bool:
        in_list = condition.get("in")
        if in_list is not None and len(in_list) > 0:
            if tool not in in_list:
                return False
        not_in_list = condition.get("not_in")
        if not_in_list is not None and len(not_in_list) > 0:
            if tool in not_in_list:
                return False
        matches = condition.get("matches")
        if matches is not None and len(matches) > 0:
            if not any(fnmatch(tool, pat) for pat in matches):
                return False
        regex = condition.get("regex")
        if regex is not None:
            if not re.search(regex, tool):
                return False
        return True

    def _matches_params(self, conditions: Dict, params: Dict) -> bool:
        for field, constraint in conditions.items():
            value = params.get(field)
            if value is None and field not in params:
                c = constraint if isinstance(constraint, dict) else {}
                if c.get("exists") is False:
                    continue
                if c.get("is_null") is True:
                    continue
                return False  # absent param cannot satisfy positive constraint
            if not self._eval_constraint(constraint, value):
                return False
        return True

    def _eval_constraint(self, c: Any, value: Any) -> bool:
        if not isinstance(c, dict):
            return True
        if "eq" in c and c["eq"] is not None and value != c["eq"]:
            return False
        if "not_eq" in c and c["not_eq"] is not None and value == c["not_eq"]:
            return False
        if "gt" in c and c["gt"] is not None:
            if not isinstance(value, (int, float)) or value <= c["gt"]:
                return False
        if "gte" in c and c["gte"] is not None:
            if not isinstance(value, (int, float)) or value < c["gte"]:
                return False
        if "lt" in c and c["lt"] is not None:
            if not isinstance(value, (int, float)) or value >= c["lt"]:
                return False
        if "lte" in c and c["lte"] is not None:
            if not isinstance(value, (int, float)) or value > c["lte"]:
                return False
        if "in" in c and c["in"] is not None:
            if value not in c["in"]:
                return False
        if "not_in" in c and c["not_in"] is not None:
            if value in c["not_in"]:
                return False
        if "contains" in c and c["contains"] is not None:
            if c["contains"] not in str(value):
                return False
        if "contains_any" in c and c["contains_any"] is not None:
            if not any(s in str(value) for s in c["contains_any"]):
                return False
        if "pattern" in c and c["pattern"] is not None:
            if not fnmatch(str(value), c["pattern"]):
                return False
        if "regex" in c and c["regex"] is not None:
            if not re.search(c["regex"], str(value)):
                return False
        if "exists" in c and c["exists"] is not None:
            exists = value is not None
            if c["exists"] != exists:
                return False
        if "is_null" in c and c["is_null"] is not None:
            is_null = value is None
            if c["is_null"] != is_null:
                return False
        return True


# ─── AgentGuard Client ─────────────────────────────────────────────────────────

class AgentGuard:
    """Client for the AgentGuard API."""

    _AUDIT_BATCH_MAX = 100
    _AUDIT_FLUSH_INTERVAL = 5.0  # seconds

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.agentguard.tech",
        telemetry: bool = True,
        local_eval: bool = False,
        policy_sync_interval_ms: int = 60_000,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._trace_id = str(uuid.uuid4())
        # Disable telemetry if env var set or constructor option is False
        self._telemetry_enabled = (
            telemetry and os.environ.get("AGENTGUARD_NO_TELEMETRY") != "1"
        )
        self._telemetry_sent = False

        # Local eval
        self._local_eval = local_eval
        self._policy_sync_interval = policy_sync_interval_ms / 1000.0
        self._local_engine = _LocalPolicyEngine()
        self._sync_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # Audit batching
        self._audit_batch: List[Dict] = []
        self._audit_lock = threading.Lock()
        self._audit_thread: Optional[threading.Thread] = None

        if self._local_eval:
            self._start_policy_sync()
            self._start_audit_flush()

    # ── Background threads ─────────────────────────────────────────────────────

    def _start_policy_sync(self) -> None:
        """Start the background policy sync thread."""
        # Non-blocking initial sync
        t = threading.Thread(target=self._bg_sync_once, daemon=True)
        t.start()
        # Periodic background sync
        self._sync_thread = threading.Thread(target=self._bg_sync_loop, daemon=True)
        self._sync_thread.start()

    def _bg_sync_once(self) -> None:
        try:
            self.sync_policies()
        except Exception:
            pass

    def _bg_sync_loop(self) -> None:
        while not self._stop_event.wait(self._policy_sync_interval):
            try:
                self.sync_policies()
            except Exception:
                pass

    def _start_audit_flush(self) -> None:
        """Start the background audit flush thread."""
        self._audit_thread = threading.Thread(target=self._bg_audit_loop, daemon=True)
        self._audit_thread.start()

    def _bg_audit_loop(self) -> None:
        while not self._stop_event.wait(self._AUDIT_FLUSH_INTERVAL):
            self._flush_audit()

    def destroy(self) -> None:
        """Stop background threads and flush the audit batch."""
        self._stop_event.set()
        self._flush_audit()

    def sync_policies(self) -> None:
        """Download the tenant's compiled policy bundle and cache it in memory.

        Safe to call manually to force a refresh (e.g. after updating your policy).
        Failures are swallowed — the existing cached policy remains active.
        """
        try:
            url = f"{self.base_url}/api/v1/policy/bundle"
            req = Request(
                url,
                headers={
                    "X-API-Key": self.api_key,
                    "User-Agent": f"agentguard-python/{__version__}",
                    "X-Trace-ID": self._trace_id,
                    "X-Span-ID": str(uuid.uuid4()),
                },
                method="GET",
            )
            with urlopen(req, timeout=10) as resp:
                bundle = json.loads(resp.read().decode())
                self._local_engine.load_bundle(bundle)
        except Exception:
            pass  # Never crash the host process

    # ── Audit batching ─────────────────────────────────────────────────────────

    def _queue_audit_event(self, tool: str, result: str) -> None:
        with self._audit_lock:
            self._audit_batch.append({
                "tool": tool,
                "result": result,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
            if len(self._audit_batch) >= self._AUDIT_BATCH_MAX:
                # Flush immediately (fire-and-forget in a daemon thread)
                events = self._audit_batch[:]
                self._audit_batch.clear()
                t = threading.Thread(target=self._post_audit, args=(events,), daemon=True)
                t.start()

    def _flush_audit(self) -> None:
        with self._audit_lock:
            if not self._audit_batch:
                return
            events = self._audit_batch[:]
            self._audit_batch.clear()
        self._post_audit(events)

    def _post_audit(self, events: List[Dict]) -> None:
        try:
            data = json.dumps({"events": events}).encode()
            req = Request(
                f"{self.base_url}/api/v1/audit",
                data=data,
                headers={
                    "X-API-Key": self.api_key,
                    "Content-Type": "application/json",
                    "User-Agent": f"agentguard-python/{__version__}",
                    "X-Trace-ID": self._trace_id,
                    "X-Span-ID": str(uuid.uuid4()),
                },
                method="POST",
            )
            with urlopen(req, timeout=5) as _:
                pass
        except Exception:
            pass  # Fire-and-forget; never raise

    # ── Telemetry ping ─────────────────────────────────────────────────────────

    def _send_telemetry(self) -> None:
        """Fire-and-forget telemetry ping (opt-in, anonymous)."""
        if not self._telemetry_enabled or self._telemetry_sent:
            return
        self._telemetry_sent = True

        def _ping():
            try:
                payload = {
                    "sdk_version": __version__,
                    "language": "python",
                    "node_version": f"python/{sys.version.split()[0]}",
                    "os_platform": platform.system().lower(),
                }
                data = json.dumps(payload).encode()
                req = Request(
                    f"{self.base_url}/api/v1/telemetry",
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urlopen(req, timeout=3) as _:
                    pass
            except Exception:
                pass  # Silently ignore all errors

        t = threading.Thread(target=_ping, daemon=True)
        t.start()

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": f"agentguard-python/{__version__}",
            "X-Trace-ID": self._trace_id,
            "X-Span-ID": str(uuid.uuid4()),
        }
        data = json.dumps(body).encode() if body else None
        req = Request(url, data=data, headers=headers, method=method)
        try:
            with urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except HTTPError as e:
            raise RuntimeError(f"AgentGuard API error: {e.code} {e.read().decode()}") from e

    def evaluate(self, tool: str, params: Optional[dict] = None) -> dict:
        """Evaluate an agent action against the policy engine.

        When ``local_eval=True`` and a policy is cached (via ``sync_policies()``),
        evaluation runs in-process with <5ms latency. Falls back to HTTP if no
        policy is cached yet.

        Args:
            tool: Name of the tool being called (e.g. "send_email", "read_file")
            params: Optional dict of parameters passed to the tool

        Returns:
            dict with keys: result, risk_score, reason, duration_ms, matched_rule_id (optional)
            result is one of: "allow", "block", "monitor", "require_approval"
        """
        self._send_telemetry()

        # ── Local eval path ────────────────────────────────────────────────
        if self._local_eval and self._local_engine.is_ready():
            result = self._local_engine.evaluate(tool, params)
            self._queue_audit_event(tool, result.get("result", ""))
            return result

        # ── HTTP fallback ──────────────────────────────────────────────────
        return self._request("POST", "/api/v1/evaluate", {"tool": tool, "params": params or {}})

    def get_usage(self) -> dict:
        """Get usage statistics for your tenant.

        Returns:
            dict with usage data including request counts and limits
        """
        return self._request("GET", "/api/v1/usage")

    def get_audit(self, limit: int = 50, offset: int = 0) -> dict:
        """Get audit trail events.

        Args:
            limit: Maximum number of events to return (default 50)
            offset: Pagination offset (default 0)

        Returns:
            dict with 'events' list and pagination metadata
        """
        return self._request("GET", f"/api/v1/audit?limit={limit}&offset={offset}")

    def kill_switch(self, active: bool) -> dict:
        """Activate or deactivate the kill switch.

        Args:
            active: True to halt all agents, False to resume operations

        Returns:
            dict with confirmation of the kill switch state
        """
        return self._request("POST", "/api/v1/killswitch", {"active": active})

    def verify_audit(self) -> dict:
        """Verify audit trail hash chain integrity.

        Returns:
            dict with 'valid' boolean and optional 'invalidAt' index
        """
        return self._request("GET", "/api/v1/audit/verify")

    # ── Webhooks ────────────────────────────────────────────────────────────────

    def create_webhook(self, url: str, events: list, secret: Optional[str] = None) -> dict:
        """Create a new webhook subscription.

        Args:
            url: The HTTPS endpoint to deliver events to
            events: List of event types ('block', 'killswitch', 'hitl', '*')
            secret: Optional signing secret for payload verification

        Returns:
            dict with the created webhook details including id
        """
        body = {"url": url, "events": events}
        if secret is not None:
            body["secret"] = secret
        return self._request("POST", "/api/v1/webhooks", body)

    def list_webhooks(self) -> dict:
        """List all webhook subscriptions for your tenant.

        Returns:
            dict with 'webhooks' list
        """
        return self._request("GET", "/api/v1/webhooks")

    def delete_webhook(self, webhook_id: str) -> dict:
        """Delete a webhook subscription.

        Args:
            webhook_id: ID of the webhook to delete

        Returns:
            dict with deletion confirmation
        """
        return self._request("DELETE", f"/api/v1/webhooks/{webhook_id}")

    # ── Agents ──────────────────────────────────────────────────────────────────

    def create_agent(self, name: str, policy_scope: Optional[list] = None) -> dict:
        """Register a new agent with AgentGuard.

        Args:
            name: Human-readable name for the agent
            policy_scope: Optional list of policy scope rules for this agent

        Returns:
            dict with the created agent details including id
        """
        body: dict = {"name": name}
        if policy_scope is not None:
            body["policy_scope"] = policy_scope
        return self._request("POST", "/api/v1/agents", body)

    def list_agents(self) -> dict:
        """List all registered agents for your tenant.

        Returns:
            dict with 'agents' list
        """
        return self._request("GET", "/api/v1/agents")

    def delete_agent(self, agent_id: str) -> dict:
        """Delete a registered agent.

        Args:
            agent_id: ID of the agent to delete

        Returns:
            dict with deletion confirmation
        """
        return self._request("DELETE", f"/api/v1/agents/{agent_id}")

    # ── Templates ───────────────────────────────────────────────────────────────

    def list_templates(self) -> dict:
        """List all available policy templates.

        Returns:
            dict with 'templates' list
        """
        return self._request("GET", "/api/v1/templates")

    def get_template(self, name: str) -> dict:
        """Get a specific policy template by name.

        Args:
            name: Template ID (e.g. 'apra-cps234', 'eu-ai-act', 'owasp-agentic')

        Returns:
            dict with template details and policy rules
        """
        return self._request("GET", f"/api/v1/templates/{name}")

    def apply_template(self, name: str) -> dict:
        """Apply a policy template to your tenant.

        Args:
            name: Template name to apply

        Returns:
            dict with confirmation and applied policy version
        """
        return self._request("POST", f"/api/v1/templates/{name}/apply")

    # ── Rate Limits ─────────────────────────────────────────────────────────────

    def set_rate_limit(self, window_seconds: int, max_requests: int, agent_id: Optional[str] = None) -> dict:
        """Set a rate limit rule.

        Args:
            window_seconds: Time window duration in seconds
            max_requests: Maximum number of requests allowed in the window
            agent_id: Optional agent ID to scope the limit; omit for tenant-wide

        Returns:
            dict with the created rate limit details including id
        """
        body: dict = {"windowSeconds": window_seconds, "maxRequests": max_requests}
        if agent_id is not None:
            body["agentId"] = agent_id
        return self._request("POST", "/api/v1/rate-limits", body)

    def list_rate_limits(self) -> dict:
        """List all rate limit rules for your tenant.

        Returns:
            dict with 'rateLimits' list
        """
        return self._request("GET", "/api/v1/rate-limits")

    def delete_rate_limit(self, limit_id: str) -> dict:
        """Delete a rate limit rule.

        Args:
            limit_id: ID of the rate limit to delete

        Returns:
            dict with deletion confirmation
        """
        return self._request("DELETE", f"/api/v1/rate-limits/{limit_id}")

    # ── Cost ────────────────────────────────────────────────────────────────────

    def get_cost_summary(self, agent_id: Optional[str] = None, from_date: Optional[str] = None, to_date: Optional[str] = None, group_by: Optional[str] = None) -> dict:
        """Get a cost summary for your tenant.

        Args:
            agent_id: Optional agent ID to filter costs
            from_date: Optional ISO 8601 start date (e.g. '2024-01-01')
            to_date: Optional ISO 8601 end date (e.g. '2024-01-31')
            group_by: Optional grouping field (e.g. 'agent', 'day', 'month')

        Returns:
            dict with cost breakdown and totals
        """
        parts = []
        if agent_id is not None:
            parts.append(f"agentId={agent_id}")
        if from_date is not None:
            parts.append(f"from={from_date}")
        if to_date is not None:
            parts.append(f"to={to_date}")
        if group_by is not None:
            parts.append(f"groupBy={group_by}")
        qs = ("?" + "&".join(parts)) if parts else ""
        return self._request("GET", f"/api/v1/costs/summary{qs}")

    def get_agent_costs(self) -> dict:
        """Get per-agent cost breakdown for your tenant.

        Returns:
            dict with costs listed per agent
        """
        return self._request("GET", "/api/v1/costs/agents")

    def track_cost(self, tool: str, agent_id: Optional[str] = None, estimated_cost_cents: Optional[int] = None) -> dict:
        """Track a cost event for a tool call.

        Args:
            tool: Name of the tool being tracked
            agent_id: Optional agent ID to associate the cost with
            estimated_cost_cents: Optional estimated cost in cents

        Returns:
            dict with the recorded cost event details
        """
        body: dict = {"tool": tool}
        if agent_id is not None:
            body["agentId"] = agent_id
        if estimated_cost_cents is not None:
            body["estimatedCostCents"] = estimated_cost_cents
        return self._request("POST", "/api/v1/costs/track", body)

    # ── Dashboard ───────────────────────────────────────────────────────────────

    def get_dashboard_stats(self) -> dict:
        """Get high-level dashboard statistics.

        Returns:
            dict with summary stats (requests, blocks, risk scores, etc.)
        """
        return self._request("GET", "/api/v1/dashboard/stats")

    def get_dashboard_feed(self, since: Optional[str] = None) -> dict:
        """Get the live activity feed for the dashboard.

        Args:
            since: Optional ISO 8601 timestamp; returns only events after this time

        Returns:
            dict with 'events' list
        """
        qs = f"?since={since}" if since is not None else ""
        return self._request("GET", f"/api/v1/dashboard/feed{qs}")

    def get_agent_activity(self) -> dict:
        """Get per-agent activity summary.

        Returns:
            dict with activity breakdown per agent
        """
        return self._request("GET", "/api/v1/dashboard/agents")

    # ── MCP (Model Context Protocol) ─────────────────────────────────────────

    def evaluate_mcp(
        self,
        tool_name: str,
        arguments: Optional[dict] = None,
        session_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        action_mapping: Optional[dict] = None,
        mcp_message: Optional[dict] = None,
    ) -> dict:
        """Evaluate an MCP tool call against the AgentGuard policy engine.

        Use this to intercept MCP ``tools/call`` requests before forwarding them
        to the actual MCP tool server. If the returned ``blocked`` field is True,
        do not forward the call — return ``mcp_error_response`` to the MCP client
        instead.

        Args:
            tool_name: The MCP tool name (e.g. "write_file", "execute_command")
            arguments: Optional dict of tool arguments
            session_id: Optional existing MCP session ID to continue a session
            agent_id: Optional AgentGuard agent ID for scoped evaluation
            action_mapping: Optional dict mapping tool names to AgentGuard action names
                            (e.g. {"write_file": "file:write"})
            mcp_message: Optional raw MCP JSON-RPC message dict (alternative to
                         tool_name + arguments)

        Returns:
            dict with keys:
                - decision: "allow" | "block" | "monitor" | "require_approval"
                - blocked: bool — True if the tool call should be stopped
                - risk_score: int
                - duration_ms: float
                - session_id: str — use in subsequent calls to continue the session
                - matched_rule_id: str (optional)
                - reason: str (optional)
                - mcp_error_response: dict (optional) — ready-to-send MCP error

        Example::

            result = client.evaluate_mcp(
                "write_file",
                arguments={"path": "/etc/passwd", "content": "..."},
                action_mapping={"write_file": "file:write"},
            )
            if result["blocked"]:
                # Return result["mcp_error_response"] to the MCP client
                return result["mcp_error_response"]
            # Otherwise forward to the upstream MCP tool server
        """
        body: dict = {"toolName": tool_name}
        if arguments is not None:
            body["arguments"] = arguments
        if session_id is not None:
            body["sessionId"] = session_id
        if agent_id is not None:
            body["agentId"] = agent_id
        if action_mapping is not None:
            body["actionMapping"] = action_mapping
        if mcp_message is not None:
            body["mcpMessage"] = mcp_message
        return self._request("POST", "/api/v1/mcp/evaluate", body)

    def get_mcp_config(self, config_id: Optional[str] = None) -> dict:
        """Get MCP proxy configuration(s) for the tenant.

        Args:
            config_id: Optional config ID to retrieve a specific config.
                       If omitted, returns all configs.

        Returns:
            dict with either:
                - ``config``: single McpConfig (when config_id is provided)
                - ``configs``: list of McpConfig + ``count`` (when no ID)

        Example::

            # List all configs
            result = client.get_mcp_config()
            for cfg in result["configs"]:
                print(cfg["name"])

            # Get specific config
            result = client.get_mcp_config("cfg-abc123")
            print(result["config"]["upstreamUrl"])
        """
        path = "/api/v1/mcp/config"
        if config_id is not None:
            path += f"?id={config_id}"
        return self._request("GET", path)

    def set_mcp_config(
        self,
        name: Optional[str] = None,
        upstream_url: Optional[str] = None,
        transport: str = "sse",
        agent_id: Optional[str] = None,
        action_mapping: Optional[dict] = None,
        default_action: str = "allow",
        enabled: bool = True,
        config_id: Optional[str] = None,
    ) -> dict:
        """Create or update an MCP proxy configuration.

        When ``config_id`` is provided, updates the existing config.
        When ``config_id`` is omitted, creates a new config (``name`` required).

        Args:
            name: Human-readable name for this proxy config (required for create)
            upstream_url: URL of the actual MCP tool server (e.g. "http://localhost:4000/mcp")
            transport: Transport type — "sse" (HTTP+SSE) or "stdio" (default: "sse")
            agent_id: Optional AgentGuard agent ID to scope this proxy config
            action_mapping: Optional dict mapping MCP tool names to AgentGuard action names
                            (e.g. {"write_file": "file:write", "read_file": "file:read"})
            default_action: Default decision when no rule matches — "allow" or "block"
                            (default: "allow")
            enabled: Whether this config is active (default: True)
            config_id: Existing config ID to update (omit to create new)

        Returns:
            dict with keys:
                - ``config``: the created or updated McpConfig
                - ``created``: True (on create)
                - ``updated``: True (on update)

        Example::

            # Create new config
            result = client.set_mcp_config(
                name="filesystem-guarded",
                upstream_url="http://localhost:4000/mcp",
                transport="sse",
                action_mapping={"write_file": "file:write"},
            )
            config_id = result["config"]["id"]

            # Disable it later
            client.set_mcp_config(config_id=config_id, enabled=False)
        """
        body: dict = {}
        if config_id is not None:
            body["id"] = config_id
        if name is not None:
            body["name"] = name
        if upstream_url is not None:
            body["upstreamUrl"] = upstream_url
        if transport is not None:
            body["transport"] = transport
        if agent_id is not None:
            body["agentId"] = agent_id
        if action_mapping is not None:
            body["actionMapping"] = action_mapping
        if default_action is not None:
            body["defaultAction"] = default_action
        if enabled is not None:
            body["enabled"] = enabled
        return self._request("PUT", "/api/v1/mcp/config", body)

    def list_mcp_sessions(self) -> dict:
        """List active MCP sessions for the tenant.

        Returns:
            dict with keys:
                - ``sessions``: list of MCP session objects
                - ``count``: number of sessions

        Each session includes:
            - id, tenant_id, agent_id, config_id
            - transport, upstream_url
            - tool_call_count, blocked_count
            - created_at, last_activity_at

        Example::

            result = client.list_mcp_sessions()
            print(f"{result['count']} active MCP sessions")
            for session in result["sessions"]:
                print(f"  {session['id']}: {session['tool_call_count']} calls")
        """
        return self._request("GET", "/api/v1/mcp/sessions")

    # ── Validation & Certification ───────────────────────────────────────────

    def validate_agent(self, agent_id: str, declared_tools: list) -> dict:
        """Dry-run an agent's declared tools through the policy engine.

        Validates every tool in ``declared_tools`` against the active policy rules
        without executing any real actions. Returns a coverage score and per-tool
        results. An agent must reach 100% coverage before it can be certified.

        Args:
            agent_id: The agent ID to validate.
            declared_tools: List of tool name strings the agent intends to use
                            (e.g. ``["file_read", "http_post", "llm_query"]``).

        Returns:
            dict with keys:
                - ``agent_id``: str
                - ``valid``: bool — True if all tools are covered by a policy rule
                - ``coverage``: int — percentage of tools with explicit rule coverage (0–100)
                - ``risk_score``: int — aggregate risk score across all tools (0–1000)
                - ``results``: list of per-tool dicts with tool, decision, rule_id, risk_score, reason
                - ``uncovered``: list of tool names with no matching policy rule
                - ``validated_at``: ISO 8601 timestamp

        Example::

            result = client.validate_agent("agt_abc123", [
                "file_read", "http_post", "llm_query",
            ])
            print(f"Coverage: {result['coverage']}%  Risk: {result['risk_score']}")
            if result["uncovered"]:
                print("Uncovered tools:", result["uncovered"])
        """
        return self._request(
            "POST",
            f"/api/v1/agents/{agent_id}/validate",
            {"declaredTools": declared_tools},
        )

    def get_agent_readiness(self, agent_id: str) -> dict:
        """Get the current readiness / certification status of an agent.

        Possible statuses:
            - ``"registered"`` — agent exists but has never been validated
            - ``"validated"``  — agent has been validated but not certified (or coverage < 100%)
            - ``"certified"``  — agent has a valid, unexpired certification
            - ``"expired"``    — agent's certification has expired; re-validate and re-certify

        Args:
            agent_id: The agent ID to check.

        Returns:
            dict with keys:
                - ``agent_id``: str
                - ``name``: str
                - ``status``: one of "certified", "validated", "registered", "expired"
                - ``last_validated``: ISO 8601 timestamp or None
                - ``coverage``: int or None
                - ``certified_at``: ISO 8601 timestamp or None
                - ``expires_at``: ISO 8601 timestamp or None

        Example::

            status = client.get_agent_readiness("agt_abc123")
            if status["status"] != "certified":
                print(f"Agent is not certified: {status['status']}")
        """
        return self._request("GET", f"/api/v1/agents/{agent_id}/readiness")

    def certify_agent(self, agent_id: str) -> dict:
        """Certify an agent that has passed validation with 100% policy coverage.

        Certification is valid for 30 days. The returned ``certification_token``
        can be stored and passed to deployment pipelines as proof the agent is
        certified.

        Requirements:
            - Agent must have been validated via ``validate_agent()`` first.
            - Validation must have achieved 100% coverage (all declared tools matched a rule).

        Args:
            agent_id: The agent ID to certify.

        Returns:
            dict with keys:
                - ``agent_id``: str
                - ``name``: str
                - ``certified``: bool
                - ``certified_at``: ISO 8601 timestamp
                - ``expires_at``: ISO 8601 timestamp (30 days from now)
                - ``certification_token``: str — store this securely
                - ``coverage``: int
                - ``message``: str

        Raises:
            RuntimeError: If the agent hasn't been validated or coverage is < 100%.

        Example::

            cert = client.certify_agent("agt_abc123")
            print(f"Certified until {cert['expires_at']}")
            print(f"Token: {cert['certification_token']}")
        """
        return self._request("POST", f"/api/v1/agents/{agent_id}/certify")

    def admit_mcp_server(self, server_url: str, tools: list) -> dict:
        """Pre-flight admission check for an MCP server.

        Evaluates all tools provided by the MCP server against the policy engine
        before allowing the server to be connected. Returns ``admitted: True`` only
        if every tool passes evaluation (no blocks, 100% coverage).

        Use this in CI/CD pipelines or at MCP proxy startup to gate tool server
        admission.

        Args:
            server_url: The URL or identifier of the MCP tool server.
            tools: List of tool descriptor dicts from the MCP server's tools/list
                   response. Each dict must have a ``"name"`` key (str), and may
                   optionally include ``"description"`` and ``"inputSchema"``.

        Returns:
            dict with keys:
                - ``server_url``: str
                - ``admitted``: bool — True if all tools pass, False otherwise
                - ``coverage``: int — percentage of tools with explicit rule coverage
                - ``uncovered``: list of tool names with no matching policy rule
                - ``results``: list of per-tool dicts (tool, decision, rule_id, risk_score, reason)
                - ``checked_at``: ISO 8601 timestamp

        Example::

            result = client.admit_mcp_server(
                "http://localhost:4000/mcp",
                [
                    {"name": "read_file", "description": "Read a file"},
                    {"name": "write_file", "description": "Write a file"},
                ],
            )
            if not result["admitted"]:
                raise RuntimeError("MCP server rejected by policy engine")
        """
        return self._request(
            "POST",
            "/api/v1/mcp/admit",
            {"serverUrl": server_url, "tools": tools},
        )
