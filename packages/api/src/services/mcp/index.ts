/**
 * AgentGuard MCP Enforcement — Public API
 *
 * Exports:
 * - McpInterceptor: core interception middleware
 * - McpPolicyEvaluator: MCP-specific policy evaluation
 * - createMcpProxy: proxy server factory
 * - mcpProxyConfigFromEnv: config from environment variables
 * - Types: all MCP-related types
 */

export { McpInterceptor } from './mcp-interceptor.js';
export type { McpInterceptorConfig } from './mcp-interceptor.js';

export { McpPolicyEvaluator } from './mcp-policy-evaluator.js';

export { createMcpProxy, mcpProxyConfigFromEnv } from './mcp-proxy.js';

export type {
  McpToolCallRequest,
  McpToolCallResponse,
  McpAgentIdentity,
  McpInterceptionResult,
  McpPolicyDecision,
  McpRuleAction,
  McpToolAccessRule,
  McpToolAccessCheck,
  McpProxyConfig,
  McpEvaluationContext,
} from './types.js';
