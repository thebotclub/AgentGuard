/**
 * AgentGuard API — entry point.
 * Starts the Hono server using @hono/node-server.
 */
import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const PORT = parseInt(process.env['PORT'] ?? '8080', 10);

const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.info(`[agentguard-api] Listening on http://localhost:${info.port}`);
    console.info(`[agentguard-api] Environment: ${process.env['NODE_ENV'] ?? 'development'}`);
  },
);

export { app };
