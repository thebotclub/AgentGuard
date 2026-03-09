"""AgentGuard integration error classes."""
from typing import Any, Dict, List, Optional


class AgentGuardBlockError(Exception):
    """Raised when AgentGuard blocks a tool call.

    Contains the full decision context so callers can log, display, or act
    on the reason for the block without string-parsing.

    Attributes:
        decision:       "block" or "require_approval"
        risk_score:     Risk score 0–1000
        reason:         Human-readable explanation
        suggestion:     What the agent should do instead
        docs:           Link to relevant documentation
        alternatives:   Allowed tools with similar capability
        tool:           The tool that was blocked
        matched_rule_id: The matched policy rule ID (if any)
        approval_url:   Approval URL (if decision is "require_approval")
        approval_id:    Approval ID (if decision is "require_approval")

    Example::

        try:
            guard.before_tool_execution("exec", {"cmd": "rm -rf /"})
        except AgentGuardBlockError as e:
            print(f"Blocked: {e.reason}")
            print(f"Try instead: {e.alternatives}")
    """

    def __init__(self, result: Dict[str, Any]) -> None:
        tool = result.get("tool", "unknown")
        reason = result.get("reason", "Blocked by AgentGuard policy")
        super().__init__(f'AgentGuard blocked tool "{tool}": {reason}')

        self.decision: str = result.get("decision", "block")
        self.risk_score: int = result.get("riskScore", result.get("risk_score", 0))
        self.reason: str = reason
        self.suggestion: str = result.get("suggestion", "")
        self.docs: str = result.get("docs", "https://agentguard.tech/docs/policy")
        self.alternatives: List[str] = result.get("alternatives", [])
        self.tool: Optional[str] = tool
        self.matched_rule_id: Optional[str] = result.get(
            "matchedRuleId", result.get("matched_rule_id")
        )
        self.approval_url: Optional[str] = result.get(
            "approvalUrl", result.get("approval_url")
        )
        self.approval_id: Optional[str] = result.get(
            "approvalId", result.get("approval_id")
        )
