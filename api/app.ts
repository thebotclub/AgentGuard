/**
 * AgentGuard — Express App Factory
 *
 * Creates and configures the Express application with all pre-database
 * middleware. Database-dependent routes are registered separately via
 * configureApp() from routes/index.ts.
 */
import express from 'express';
import { setupMiddleware } from './middleware/index.js';
import './types.js'; // Request.requestId augmentation

/**
 * Create a configured Express app (pre-DB middleware only).
 * Call configureApp() after database initialization to mount routes.
 */
export function createApp(): express.Express {
  const app = express();
  setupMiddleware(app);
  return app;
}
