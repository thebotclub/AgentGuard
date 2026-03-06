/**
 * AgentGuard CLI — Tool Detection Patterns
 *
 * Regex patterns for detecting AI agent tool usage across JS/TS/Python files.
 * Covers: LangChain, OpenAI function-calling, CrewAI, MCP schema, and raw
 * tool name literals.
 *
 * Each pattern entry has:
 *   - regex   : RegExp with a capture group (group 1) for the tool name
 *   - framework: human-readable framework label
 */

export interface ToolPattern {
  regex: RegExp;
  framework: string;
}

// ── LangChain patterns ────────────────────────────────────────────────────────

const LANGCHAIN_PATTERNS: ToolPattern[] = [
  // .tool() / Tool() / StructuredTool() / DynamicTool() in TS/JS
  // e.g. new DynamicTool({ name: "file_read", ... })
  {
    regex: /(?:DynamicTool|StructuredTool|Tool)\s*\(\s*\{[^}]*?name\s*:\s*["'`]([a-z][a-z0-9_-]{1,60})["'`]/gs,
    framework: 'langchain',
  },
  // LangChain createTool / tool() builder
  // e.g. const t = tool(fn, { name: "send_email" })
  {
    regex: /\btool\s*\(\s*[^,)]+,\s*\{[^}]*?name\s*:\s*["'`]([a-z][a-z0-9_-]{1,60})["'`]/gs,
    framework: 'langchain',
  },
  // Python @tool decorator on a function
  // @tool\ndef tool_name(
  {
    regex: /@tool\s*\r?\n\s*(?:async\s+)?def\s+([a-z][a-z0-9_]{1,60})\s*\(/g,
    framework: 'langchain',
  },
  // Python @tool("tool_name") decorator with explicit name
  {
    regex: /@tool\s*\(\s*["']([a-z][a-z0-9_-]{1,60})["']\s*\)/g,
    framework: 'langchain',
  },
  // LangChain Tool(name="...") in Python
  {
    regex: /(?:Tool|StructuredTool|DynamicTool)\s*\(\s*name\s*=\s*["']([a-z][a-z0-9_-]{1,60})["']/g,
    framework: 'langchain',
  },
  // LangGraph node tool call in TS: .addNode("tool_name", ...)
  {
    regex: /\.addNode\s*\(\s*["'`]([a-z][a-z0-9_-]{1,60})["'`]\s*,/g,
    framework: 'langgraph',
  },
];

// ── OpenAI function-calling patterns ─────────────────────────────────────────

const OPENAI_PATTERNS: ToolPattern[] = [
  // OpenAI functions array (legacy): { name: "tool_name" }
  {
    regex: /\{\s*(?:\/\/[^\n]*)?\s*"?name"?\s*:\s*["'`]([a-z][a-z0-9_-]{1,60})["'`]\s*,\s*(?:\/\/[^\n]*)?\s*"?description"?/g,
    framework: 'openai',
  },
  // OpenAI tools array: tools: [ { type: "function", function: { name: "..." } } ]
  {
    regex: /function\s*:\s*\{[^}]*?name\s*:\s*["'`]([a-z][a-z0-9_-]{1,60})["'`]/gs,
    framework: 'openai',
  },
  // Python openai.chat.completions.create(tools=[...])
  // { "type": "function", "function": { "name": "tool_name" } }
  {
    regex: /"function"\s*:\s*\{[^}]*?"name"\s*:\s*"([a-z][a-z0-9_-]{1,60})"/gs,
    framework: 'openai',
  },
  // Anthropic tool_use: { "name": "tool_name", "input": { ... } }
  {
    regex: /"name"\s*:\s*"([a-z][a-z0-9_-]{1,60})"\s*,\s*"input_schema"/g,
    framework: 'anthropic',
  },
];

// ── CrewAI patterns ───────────────────────────────────────────────────────────

const CREWAI_PATTERNS: ToolPattern[] = [
  // Python class MyTool(BaseTool): → name = "tool_name"
  {
    regex: /class\s+\w+\s*\(\s*BaseTool\s*\)[^:]*:[\s\S]{0,200}?name\s*=\s*["']([a-z][a-z0-9_-]{1,60})["']/g,
    framework: 'crewai',
  },
  // @tool decorator (CrewAI uses same decorator pattern as LangChain)
  // Already captured by LANGCHAIN_PATTERNS, but add CrewAI-specific tool() usage
  {
    regex: /Tool\s*\(\s*name\s*=\s*["']([a-z][a-z0-9_-]{1,60})["']/g,
    framework: 'crewai',
  },
  // CrewAI TS: new Tool({ name: "tool_name", ... })
  {
    regex: /new\s+Tool\s*\(\s*\{[^}]*?name\s*:\s*["'`]([a-z][a-z0-9_-]{1,60})["'`]/gs,
    framework: 'crewai',
  },
];

// ── MCP / generic schema patterns ────────────────────────────────────────────

const MCP_PATTERNS: ToolPattern[] = [
  // JSON schema / MCP tool definition: "name": "tool_name"
  {
    regex: /"name"\s*:\s*"([a-z][a-z0-9_-]{1,60})"/g,
    framework: 'mcp',
  },
  // YAML: name: tool_name  (with tool_name: somewhere nearby)
  {
    regex: /\btool_name\s*:\s*["']?([a-z][a-z0-9_-]{1,60})["']?/g,
    framework: 'mcp',
  },
  // tool: "tool_name" (AgentGuard SDK / generic config)
  {
    regex: /\btool\s*:\s*["'`]([a-z][a-z0-9_-]{1,60})["'`]/g,
    framework: 'mcp',
  },
];

// ── Raw / generic tool name literals ─────────────────────────────────────────

const RAW_PATTERNS: ToolPattern[] = [
  // Any quoted snake_case / kebab-case identifier — broad catch-all
  // Must have at least one _ or - separator
  {
    regex: /["'`]((?:[a-z][a-z0-9]*_)+[a-z0-9]+|[a-z][a-z0-9]*-[a-z][a-z0-9-]*)["'`]/g,
    framework: 'generic',
  },
];

// ── Well-known tool names allow-list ─────────────────────────────────────────

/**
 * Known AgentGuard tool names used to filter out false positives from the
 * broad RAW_PATTERNS catch-all. Only names that match snake/kebab-case AND
 * appear in this set (or meet a structural heuristic) are kept.
 */
export const KNOWN_TOOLS = new Set<string>([
  // HTTP / network
  'http_request', 'http_post', 'http_get', 'http_put', 'http_delete',
  'fetch', 'curl', 'wget',
  // File operations
  'file_read', 'file_write', 'file_delete', 'file_append', 'file_copy', 'file_move',
  'read_file', 'write_file', 'delete_file',
  'rm', 'rmdir', 'unlink', 'mkdir', 'ls', 'list_files',
  // Shell / system
  'shell_exec', 'shell_run', 'sudo', 'chmod', 'chown', 'system_command',
  'exec', 'bash', 'sh', 'execute_command', 'run_command', 'subprocess',
  // Database
  'db_query', 'db_read', 'db_write', 'db_delete', 'sql_execute', 'sql_query',
  'db_read_public', 'drop_table', 'create_table', 'execute_sql',
  // LLM calls
  'llm_query', 'openai_chat', 'anthropic_complete', 'gpt4', 'gpt3', 'claude',
  'gemini', 'cohere_complete',
  // Financial
  'transfer_funds', 'create_payment', 'execute_transaction', 'process_refund',
  'get_balance', 'wire_transfer',
  // Email / messaging
  'send_email', 'send_sms', 'send_slack', 'post_message', 'send_notification',
  // Other common tool names
  'get_config', 'set_config', 'list_users', 'get_user', 'create_user',
  'update_record', 'search_web', 'web_search', 'browser_navigate',
  'read_calendar', 'write_calendar', 'create_event',
  'github_create_issue', 'github_create_pr', 'github_push',
  'jira_create_ticket', 'jira_update_ticket',
  'slack_send_message', 'slack_post_message',
  'stripe_charge', 'stripe_refund',
  'twilio_send_sms', 'twilio_make_call',
]);

// ── Framework-specific patterns (ordered from most specific to least) ─────────

/**
 * Patterns applied to source with higher specificity (framework-aware).
 * Run before RAW_PATTERNS.
 */
export const FRAMEWORK_PATTERNS: ToolPattern[] = [
  ...LANGCHAIN_PATTERNS,
  ...OPENAI_PATTERNS,
  ...CREWAI_PATTERNS,
  ...MCP_PATTERNS,
];

/**
 * Fallback raw patterns — applied after framework patterns to catch any
 * remaining snake_case / kebab-case tool name literals.
 */
export { RAW_PATTERNS };

/**
 * All patterns combined in priority order.
 */
export const ALL_PATTERNS: ToolPattern[] = [
  ...FRAMEWORK_PATTERNS,
  ...RAW_PATTERNS,
];
