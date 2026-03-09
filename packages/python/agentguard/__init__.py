"""AgentGuard — Runtime security for AI agents."""
from .client import AgentGuard
from .integrations.errors import AgentGuardBlockError

__version__ = "0.9.0"
__all__ = ["AgentGuard", "AgentGuardBlockError"]
