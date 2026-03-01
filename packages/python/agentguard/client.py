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
