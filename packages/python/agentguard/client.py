"""AgentGuard Python SDK — Runtime security for AI agents."""
import json
from typing import Any, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError


class AgentGuard:
    """Client for the AgentGuard API."""

    def __init__(self, api_key: str, base_url: str = "https://api.agentguard.tech"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
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

        Args:
            tool: Name of the tool being called (e.g. "send_email", "read_file")
            params: Optional dict of parameters passed to the tool

        Returns:
            dict with keys: result, riskScore, reason, durationMs, matchedRuleId (optional)
            result is one of: "allow", "block", "monitor", "require_approval"
        """
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

    def create_webhook(self, url: str, events: list, secret: str = None) -> dict:
        """Create a new webhook subscription.

        Args:
            url: The HTTPS endpoint to deliver events to
            events: List of event types to subscribe to
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

    def create_agent(self, name: str, policy_scope: list = None) -> dict:
        """Register a new agent with AgentGuard.

        Args:
            name: Human-readable name for the agent
            policy_scope: Optional list of policy scope rules for this agent

        Returns:
            dict with the created agent details including id
        """
        body = {"name": name}
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
            name: Template name (e.g. 'strict', 'permissive', 'financial')

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

    def set_rate_limit(self, window_seconds: int, max_requests: int, agent_id: str = None) -> dict:
        """Set a rate limit rule.

        Args:
            window_seconds: Time window duration in seconds
            max_requests: Maximum number of requests allowed in the window
            agent_id: Optional agent ID to scope the limit; omit for tenant-wide

        Returns:
            dict with the created rate limit details including id
        """
        body = {"windowSeconds": window_seconds, "maxRequests": max_requests}
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

    def get_cost_summary(self, agent_id: str = None, from_date: str = None, to_date: str = None, group_by: str = None) -> dict:
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

    def track_cost(self, tool: str, agent_id: str = None, estimated_cost_cents: int = None) -> dict:
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

    def get_dashboard_feed(self, since: str = None) -> dict:
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
