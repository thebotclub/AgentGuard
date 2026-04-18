# Download OpenAPI Spec

The AgentGuard OpenAPI 3.0.3 specification is available in multiple formats.

## Files

| Format | Path | Size |
|--------|------|------|
| YAML | `api/openapi.yaml` | ~3000 lines |
| JSON | `api/openapi.json` | ~4700 lines |

## Live Endpoints (local dev only)

When running the API server locally:

| Endpoint | Description |
|----------|-------------|
| [`/api-docs`](http://localhost:3000/api-docs) | Swagger UI (redirects to `/api/docs`) |
| [`/api/docs`](http://localhost:3000/api/docs) | Swagger UI (dark themed) |
| [`/api-docs/openapi.json`](http://localhost:3000/api-docs/openapi.json) | JSON spec |
| [`/api-docs/openapi.yaml`](http://localhost:3000/api-docs/openapi.yaml) | YAML spec |
| [`/api/docs/spec.yaml`](http://localhost:3000/api/docs/spec.yaml) | YAML spec |

::: warning
`/api-docs` and `/api-docs/openapi.json` are only available when `NODE_ENV !== 'production'`.
:::

## Generating the Spec

To regenerate `openapi.json` from the YAML source:

```bash
npm run openapi:generate
```

This converts `api/openapi.yaml` → `api/openapi.json` and prints a summary.

## Using with Client Generators

Generate TypeScript client from the spec:

```bash
npx openapi-typescript api/openapi.yaml -o src/api-types.ts
```

Generate Python client:

```bash
pip install openapi-generator-cli
openapi-generator-cli generate \
  -i api/openapi.yaml \
  -g python \
  -o ./generated/python-client
```

## Coverage

The spec covers:

| Tag | Endpoints |
|-----|-----------|
| Health | 2 |
| Auth | 5 |
| Evaluate | 3 |
| Agents | 5 |
| Audit | 3 |
| Webhooks | 2 |
| Policy | 2 |
| Approvals | 2 |
| Analytics | 2 |
| Compliance | 3 |
| PII | 2 |
| MCP | 4 |
| Slack | 3 |
| Agent Hierarchy | 6 |
| Kill Switch | 1 |
| **Total** | **52** |
