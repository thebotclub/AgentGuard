/**
 * Tool registry — fixture for AgentGuard CLI tests
 * Lists all tools available to the agent
 */

export const HIGH_RISK_TOOLS = [
  'transfer_funds',
  'execute_sql',
  'shell_exec',
  'db_delete',
] as const;

export const MEDIUM_RISK_TOOLS = [
  'send_email',
  'http_request',
  'file_write',
] as const;

export const LOW_RISK_TOOLS = [
  'file_read',
  'web_search',
  'read_file',
] as const;

export type ToolName =
  | typeof HIGH_RISK_TOOLS[number]
  | typeof MEDIUM_RISK_TOOLS[number]
  | typeof LOW_RISK_TOOLS[number];
