/**
 * AgentGuard — Swagger UI Documentation Route
 *
 * GET /api/docs           — Swagger UI (dark themed)
 * GET /api/docs/spec.yaml — OpenAPI 3.0 YAML spec (for Swagger UI + download)
 * GET /api/docs/swagger-ui.css         — Swagger UI CSS
 * GET /api/docs/swagger-ui-bundle.js   — Swagger UI bundle
 * GET /api/docs/swagger-ui-standalone-preset.js
 */
import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';

// Resolve paths
const SPEC_PATH = join(__dirname, '..', 'openapi.yaml');
const SWAGGER_DIST = join(__dirname, '..', '..', 'node_modules', 'swagger-ui-dist');

export function createDocsRoutes(): Router {
  const router = Router();

  // ── GET /api/docs — Swagger UI HTML ────────────────────────────────────
  router.get('/api/docs', (_req: Request, res: Response) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentGuard API Docs</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛡️</text></svg>">
  <link rel="stylesheet" href="/api/docs/swagger-ui.css">
  <style>
    :root {
      --ag-bg:#0a0a1a; --ag-bg-card:#111128; --ag-bg-card2:#13132e;
      --ag-accent:#5254d4; --ag-accent-dim:rgba(82,84,212,0.12); --ag-accent-hi:#818cf8;
      --ag-green:#22c55e; --ag-red:#ef4444; --ag-amber:#f59e0b;
      --ag-text:#e2e8f0; --ag-text-dim:#94a3b8; --ag-text-bright:#f8fafc;
      --ag-border:rgba(99,102,241,0.18); --ag-border-dim:rgba(255,255,255,0.06);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--ag-bg) !important; color: var(--ag-text) !important;
      font-family: 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif !important; }

    /* ── AgentGuard top bar ── */
    .ag-topbar {
      background: var(--ag-bg-card); border-bottom: 1px solid var(--ag-border-dim);
      padding: 12px 24px; display: flex; align-items: center; gap: 12px;
      position: sticky; top: 0; z-index: 100;
    }
    .ag-logo { font-size: 1.1rem; font-weight: 700; color: var(--ag-accent-hi);
      text-decoration: none; display: flex; align-items: center; gap: 8px; }
    .ag-badge {
      background: var(--ag-accent-dim); color: var(--ag-accent-hi);
      border: 1px solid var(--ag-border); border-radius: 20px;
      padding: 2px 10px; font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .ag-topbar-links { margin-left: auto; display: flex; gap: 20px; }
    .ag-topbar-links a { color: var(--ag-text-dim); text-decoration: none;
      font-size: 0.84rem; transition: color 0.15s; }
    .ag-topbar-links a:hover { color: var(--ag-accent-hi); }

    /* ── Swagger UI container ── */
    #swagger-ui { max-width: 1400px; margin: 0 auto; padding: 0 20px 60px; }

    /* Hide Swagger's own topbar since we have ours */
    .swagger-ui .topbar { display: none !important; }

    /* ── Dark overrides ── */
    .swagger-ui { background: var(--ag-bg) !important; }
    .swagger-ui .info .title { color: var(--ag-text-bright) !important; }
    .swagger-ui .info .description p,
    .swagger-ui .info .description li { color: var(--ag-text-dim) !important; }
    .swagger-ui .info a { color: var(--ag-accent-hi) !important; }
    .swagger-ui .info .base-url { color: var(--ag-text-dim) !important; }
    .swagger-ui .scheme-container {
      background: var(--ag-bg-card) !important; box-shadow: none !important;
      border: 1px solid var(--ag-border-dim) !important; border-radius: 8px !important;
      padding: 12px 16px !important;
    }
    .swagger-ui select, .swagger-ui .servers > label {
      background: var(--ag-bg) !important; color: var(--ag-text) !important;
      border: 1px solid var(--ag-border) !important; border-radius: 6px !important;
    }
    .swagger-ui .opblock-tag {
      border-bottom: 1px solid var(--ag-border-dim) !important;
      color: var(--ag-text-bright) !important;
    }
    .swagger-ui .opblock-tag:hover { background: var(--ag-accent-dim) !important; }
    .swagger-ui .opblock-tag small { color: var(--ag-text-dim) !important; }
    .swagger-ui .opblock {
      background: var(--ag-bg-card) !important;
      border: 1px solid var(--ag-border-dim) !important; border-radius: 8px !important;
      margin-bottom: 8px !important; box-shadow: none !important;
    }
    .swagger-ui .opblock.opblock-post .opblock-summary-path { color: var(--ag-accent-hi) !important; }
    .swagger-ui .opblock.opblock-get .opblock-summary-path { color: var(--ag-green) !important; }
    .swagger-ui .opblock.opblock-delete .opblock-summary-path { color: var(--ag-red) !important; }
    .swagger-ui .opblock.opblock-put .opblock-summary-path { color: var(--ag-amber) !important; }
    .swagger-ui .opblock .opblock-summary {
      border: none !important; background: transparent !important;
    }
    .swagger-ui .opblock-summary-description { color: var(--ag-text-dim) !important; }
    .swagger-ui .opblock-body { background: var(--ag-bg) !important; }
    .swagger-ui .opblock-section-header {
      background: var(--ag-bg-card2) !important; border: none !important;
    }
    .swagger-ui .opblock-section-header label { color: var(--ag-text) !important; }
    .swagger-ui .parameters-container { background: transparent !important; }
    .swagger-ui .parameter__name { color: var(--ag-text) !important; }
    .swagger-ui .parameter__type { color: var(--ag-accent-hi) !important; }
    .swagger-ui .parameter__in { color: var(--ag-text-dim) !important; }
    .swagger-ui .parameter__deprecated { color: var(--ag-red) !important; }
    .swagger-ui table thead tr th,
    .swagger-ui table thead tr td {
      color: var(--ag-text-dim) !important;
      border-bottom: 1px solid var(--ag-border-dim) !important;
      background: var(--ag-bg-card2) !important;
    }
    .swagger-ui td { color: var(--ag-text) !important; border-bottom: 1px solid var(--ag-border-dim) !important; }
    .swagger-ui .response-col_status { color: var(--ag-text) !important; font-weight: 600 !important; }
    .swagger-ui label, .swagger-ui h4, .swagger-ui h5 { color: var(--ag-text) !important; }
    .swagger-ui .model-box {
      background: var(--ag-bg-card) !important; border: 1px solid var(--ag-border) !important;
      border-radius: 8px !important;
    }
    .swagger-ui section.models {
      background: var(--ag-bg-card) !important; border: 1px solid var(--ag-border-dim) !important;
      border-radius: 8px !important;
    }
    .swagger-ui section.models .model-container {
      background: var(--ag-bg) !important; border-radius: 6px !important;
      margin: 8px 0 !important;
    }
    .swagger-ui .model-title { color: var(--ag-text) !important; }
    .swagger-ui .model { color: var(--ag-text-dim) !important; }
    .swagger-ui .prop-type { color: var(--ag-accent-hi) !important; }
    .swagger-ui .prop-name { color: var(--ag-text) !important; }
    .swagger-ui .highlight-code, .swagger-ui .microlight {
      background: #0d0d20 !important; border: 1px solid var(--ag-border) !important;
      border-radius: 6px !important; color: #a5b4fc !important;
    }
    .swagger-ui .btn.execute {
      background: var(--ag-accent) !important; border-color: var(--ag-accent) !important;
      color: #fff !important; border-radius: 6px !important; font-weight: 600 !important;
    }
    .swagger-ui .btn.execute:hover { background: #4042b0 !important; }
    .swagger-ui .btn.btn-clear {
      background: transparent !important; border-color: var(--ag-border) !important;
      color: var(--ag-text-dim) !important; border-radius: 6px !important;
    }
    .swagger-ui input[type=text], .swagger-ui input[type=password], .swagger-ui textarea {
      background: var(--ag-bg) !important; color: var(--ag-text) !important;
      border: 1px solid var(--ag-border) !important; border-radius: 6px !important;
    }
    .swagger-ui .dialog-ux .modal-ux {
      background: var(--ag-bg-card) !important; border: 1px solid var(--ag-border) !important;
      border-radius: 12px !important; box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
    }
    .swagger-ui .dialog-ux .modal-ux-header {
      background: var(--ag-bg-card2) !important;
      border-bottom: 1px solid var(--ag-border-dim) !important; border-radius: 12px 12px 0 0 !important;
    }
    .swagger-ui .dialog-ux .modal-ux-header h3 { color: var(--ag-text-bright) !important; }
    .swagger-ui .dialog-ux .modal-ux-content { color: var(--ag-text) !important; }
    .swagger-ui .auth-container { border-color: var(--ag-border) !important; }
    .swagger-ui .auth-container h4 { color: var(--ag-text) !important; }
    .swagger-ui .authorize {
      background: var(--ag-accent) !important; border-color: var(--ag-accent) !important;
      color: #fff !important; border-radius: 6px !important; font-weight: 600 !important;
    }
    .swagger-ui .btn.authorize { background: transparent !important;
      border-color: var(--ag-accent) !important; color: var(--ag-accent-hi) !important; }

    /* Method badges */
    .swagger-ui .opblock-summary-method {
      border-radius: 4px !important; font-weight: 700 !important;
      font-family: 'JetBrains Mono','Fira Code',monospace !important;
      min-width: 70px !important; text-align: center !important;
    }

    /* Filter input */
    .swagger-ui .filter-container .operation-filter-input {
      background: var(--ag-bg-card) !important; border: 1px solid var(--ag-border) !important;
      border-radius: 6px !important; color: var(--ag-text) !important;
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--ag-bg); }
    ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--ag-accent); }
  </style>
</head>
<body>
  <div class="ag-topbar">
    <a class="ag-logo" href="https://agentguard.tech" target="_blank" rel="noopener">
      🛡️ AgentGuard
    </a>
    <span class="ag-badge">API v0.9.0</span>
    <div class="ag-topbar-links">
      <a href="https://app.agentguard.tech" target="_blank">Dashboard</a>
      <a href="/api/docs/spec.yaml" download="agentguard-openapi.yaml">↓ Download Spec</a>
      <a href="/api/v1/signup">Get API Key</a>
    </div>
  </div>

  <div id="swagger-ui"></div>

  <script src="/api/docs/swagger-ui-bundle.js" charset="UTF-8"></script>
  <script src="/api/docs/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/api/docs/spec.yaml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset,
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl,
        ],
        layout: 'StandaloneLayout',
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 2,
        docExpansion: 'list',
        filter: true,
        showExtensions: true,
        tryItOutEnabled: true,
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        requestInterceptor: function(request) {
          var storedKey = localStorage.getItem('agentguard_api_key');
          if (storedKey && !request.headers['x-api-key']) {
            request.headers['x-api-key'] = storedKey;
          }
          return request;
        },
      });
    };
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  });

  // ── Static Swagger UI assets ────────────────────────────────────────────

  router.get('/api/docs/swagger-ui.css', (_req: Request, res: Response) => {
    try {
      res.setHeader('Content-Type', 'text/css');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(join(SWAGGER_DIST, 'swagger-ui.css'));
    } catch {
      res.status(404).send('/* not found */');
    }
  });

  router.get('/api/docs/swagger-ui-bundle.js', (_req: Request, res: Response) => {
    try {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(join(SWAGGER_DIST, 'swagger-ui-bundle.js'));
    } catch {
      res.status(404).send('// not found');
    }
  });

  router.get('/api/docs/swagger-ui-standalone-preset.js', (_req: Request, res: Response) => {
    try {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(join(SWAGGER_DIST, 'swagger-ui-standalone-preset.js'));
    } catch {
      res.status(404).send('// not found');
    }
  });

  // ── OpenAPI Spec ────────────────────────────────────────────────────────

  router.get('/api/docs/spec.yaml', (_req: Request, res: Response) => {
    try {
      const yaml = readFileSync(SPEC_PATH, 'utf8');
      res.setHeader('Content-Type', 'application/yaml');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(yaml);
    } catch {
      res.status(500).json({ error: 'Could not load OpenAPI spec' });
    }
  });

  // Redirect /api/docs/spec to YAML
  router.get('/api/docs/spec', (_req: Request, res: Response) => {
    res.redirect(301, '/api/docs/spec.yaml');
  });

  return router;
}
