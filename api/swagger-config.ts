/**
 * AgentGuard — swagger-jsdoc Configuration
 *
 * Used by api/scripts/generate-openapi.ts to discover @openapi JSDoc
 * annotations in route files and merge them with the base openapi.yaml spec.
 *
 * Route files should annotate endpoints using the @openapi tag:
 *
 * @example
 * ```typescript
 * /**
 *  * @openapi
 *  * /my-endpoint:
 *  *   get:
 *  *     summary: My endpoint
 *  *     tags: [MyTag]
 *  *     responses:
 *  *       200:
 *  *         description: Success
 *  * \/
 * router.get('/api/v1/my-endpoint', handler);
 * ```
 */

export const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'AgentGuard Policy Engine API',
      version: '0.10.0',
      description: 'Runtime security platform for AI agents',
      contact: {
        name: 'AgentGuard Support',
        url: 'https://agentguard.tech',
      },
      license: {
        name: 'BSL 1.1',
        url: 'https://mariadb.com/bsl11/',
      },
    },
    servers: [
      {
        url: 'https://api.agentguard.tech/api/v1',
        description: 'Production',
      },
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Tenant API key (ag_live_ prefix)',
        },
        agentKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Agent-scoped key (ag_agent_ prefix)',
        },
        adminKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-admin-key',
          description: 'Platform admin key',
        },
      },
    },
  },
  // Glob patterns to scan for @openapi JSDoc annotations
  apis: [
    './api/routes/*.ts',
    './api/mcp-routes.ts',
    './api/validation-routes.ts',
  ],
};
