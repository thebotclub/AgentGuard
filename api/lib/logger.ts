/**
 * AgentGuard — Structured JSON Logger
 * Replaces console.log with structured output including request IDs.
 */

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  msg: string;
  requestId?: string;
  tenantId?: string;
  [key: string]: unknown;
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
  });
}

export const logger = {
  info(msg: string, meta?: Record<string, unknown>) {
    console.log(formatLog({ level: 'info', msg, ...meta }));
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    console.warn(formatLog({ level: 'warn', msg, ...meta }));
  },
  error(msg: string, meta?: Record<string, unknown>) {
    console.error(formatLog({ level: 'error', msg, ...meta }));
  },
  debug(msg: string, meta?: Record<string, unknown>) {
    if (process.env['LOG_LEVEL'] === 'debug') {
      console.log(formatLog({ level: 'debug', msg, ...meta }));
    }
  },
};
