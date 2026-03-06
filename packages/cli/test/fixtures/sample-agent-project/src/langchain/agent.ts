/**
 * Sample LangChain agent — fixture for AgentGuard CLI tests
 */
import { DynamicTool, StructuredTool } from 'langchain/tools';
import { z } from 'zod';

// Tool 1: send_email
const emailTool = new DynamicTool({
  name: 'send_email',
  description: 'Send an email to a recipient',
  func: async (input: string) => {
    const { to, subject, body } = JSON.parse(input);
    console.log(`Sending email to ${to}: ${subject}`);
    return 'Email sent';
  },
});

// Tool 2: execute_sql
const sqlTool = new StructuredTool({
  name: 'execute_sql',
  description: 'Execute a SQL query against the database',
  schema: z.object({ query: z.string(), params: z.array(z.unknown()).optional() }),
  func: async ({ query }) => {
    // NOTE: This tool requires HITL approval before running
    return `Executed: ${query}`;
  },
});

export const tools = [emailTool, sqlTool];
