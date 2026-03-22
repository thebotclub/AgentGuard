/**
 * AgentGuard MCP Types
 *
 * Type definitions for MCP (Model Context Protocol) runtime policy enforcement.
 * MCP is how AI agents call tools — AgentGuard intercepts and evaluates
 * tool calls against policies before allowing execution.
 */

// ─── MCP Protocol Types ────────────────────────────────────────────────────────

/**
 * Standard MCP tools/call request shape.
 */
export interface McpToolCallRequest {
  /** JSON-RPC method — always "tools/call" for tool invocations */
  method: 'tools/call';
  /** JSON-RPC ID */
  id?: string | number;
  params: {
    /** Tool being invoked */
    name: string;
    /** Arguments passed to the tool */
    arguments?: Record<string, unknown>;
  };
}

/**
 * Standard MCP JSON-RPC response.
 */
export interface McpToolCallResponse {
  id?: string | number;
  result?: {
    content: Array<{
      type: 'text' | 'image' | 'resource';
      text?: string;
      data?: string;
      mimeType?: string;
    }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Metadata about the calling agent extracted from the request.
 */
export interface McpAgentIdentity {
  /** AgentGuard agent ID (from API key or header) */
  agentId: string;
  /** Session ID for audit trail continuity */
  sessionId: string;
  /** Tenant ID */
  tenantId: string;
  /** Optional: IP address or origin */
  remoteAddress?: string;
  /** Optional: additional metadata from connection */
  metadata?: Record<string, unknown>;
}

/**
 * The result of intercepting an MCP tool call.
 */
export interface McpInterceptionResult {
  /** Whether the tool call is permitted to proceed */
  allowed: boolean;
  /** The policy decision that was made */
  decision: McpPolicyDecision;
  /** Optional HITL gate ID (when decision is hitl) */
  gateId?: string | null;
  /** Seconds until HITL gate times out */
  gateTimeoutSec?: number | null;
  /** Human-readable reason for the decision */
  reason: string;
  /** Risk score (0-1000) */
  riskScore: number;
  /** Policy rule that matched */
  matchedRuleId?: string | null;
  /** Audit event ID for tracking */
  auditEventId?: string;
  /** Duration of policy evaluation in ms */
  evaluationMs: number;
}

/**
 * MCP-specific policy decision outcomes.
 */
export type McpPolicyDecision = 'allow' | 'block' | 'hitl' | 'monitor';

/**
 * MCP-specific policy rule action (maps to AgentGuard policy actions).
 */
export type McpRuleAction = 'allow' | 'block' | 'hitl' | 'monitor';

/**
 * MCP tool access rule in a policy.
 */
export interface McpToolAccessRule {
  /** Tool name pattern (exact or glob, e.g. "filesystem_write", "shell_*") */
  tool: string;
  /** Action to take */
  action: McpRuleAction;
  /** For filesystem tools: restrict to specific path patterns */
  paths?: string[];
  /** For web/network tools: restrict to specific domains */
  domains?: string[];
  /** For shell tools: restrict to specific commands */
  commands?: string[];
  /** Human-readable reason for this rule */
  reason?: string;
}

/**
 * Parsed MCP-specific policy check from policy YAML.
 * Extends the existing policy checks mechanism.
 */
export interface McpToolAccessCheck {
  type: 'mcp_tool_access';
  rules: McpToolAccessRule[];
  /** Default action when no rule matches (defaults to 'allow') */
  default?: McpRuleAction;
}

/**
 * Configuration for MCP proxy mode.
 */
export interface McpProxyConfig {
  /** Port to listen on (default: 3100) */
  port: number;
  /** Upstream MCP server URL */
  upstreamUrl: string;
  /** AgentGuard API base URL */
  agentguardUrl: string;
  /** AgentGuard API key */
  agentguardApiKey: string;
  /** Agent ID to evaluate policy for */
  agentId: string;
  /** Default session ID prefix */
  sessionPrefix?: string;
  /** Timeout for upstream MCP server requests (ms) */
  upstreamTimeoutMs?: number;
  /** Whether to run in strict mode (block on policy eval errors) */
  strict?: boolean;
}

/**
 * Context for MCP policy evaluation.
 */
export interface McpEvaluationContext {
  /** The MCP tool call request */
  request: McpToolCallRequest;
  /** The agent making the call */
  identity: McpAgentIdentity;
  /** Timestamp of the call */
  timestamp: string;
}
