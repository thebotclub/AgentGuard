"""
Sample CrewAI tools — fixture for AgentGuard CLI tests
"""
from crewai.tools import BaseTool, Tool
from langchain.tools import tool


class ShellExecutorTool(BaseTool):
    """Execute shell commands — HIGH RISK, requires HITL approval"""
    name = "shell_exec"
    description = "Execute a shell command on the local system"

    def _run(self, command: str) -> str:
        import subprocess
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.stdout


class DatabaseTool(BaseTool):
    """Query the database"""
    name = "db_query"
    description = "Execute a read-only database query"

    def _run(self, query: str) -> str:
        # TODO: Add AgentGuard policy check before execution
        return f"Results for: {query}"


@tool
def transfer_funds(amount: float, recipient: str, account: str) -> str:
    """Transfer funds to a recipient — CRITICAL, requires human approval"""
    # This tool must be covered by an AgentGuard HITL policy
    return f"Transfer of ${amount} to {recipient} initiated"


# CrewAI Tool() format
file_tool = Tool(name="file_write", description="Write content to a file")
