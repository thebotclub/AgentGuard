/**
 * Sample OpenAI function-calling definitions — fixture for AgentGuard CLI tests
 */

// OpenAI function definitions (legacy format)
export const functions = [
  {
    name: 'http_request',
    description: 'Make an HTTP request to an external URL',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to request' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        body: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_file',
    description: 'Read contents of a file from the local filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
      },
      required: ['path'],
    },
  },
];

// OpenAI tools array (new format)
export const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
];
