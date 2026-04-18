# Swagger UI

When running AgentGuard locally, the Swagger UI is available at:

**[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**

::: tip Dev Only
The Swagger UI is only available in development mode. It is not exposed in production.
:::

## Accessing the Swagger UI

1. Start the API server:
   ```bash
   npm run dev
   ```

2. Open [http://localhost:3000/api-docs](http://localhost:3000/api-docs) in your browser

3. Authenticate by clicking **Authorize** and entering your API key

## OpenAPI Spec

The raw OpenAPI spec is available at:
- **YAML:** [http://localhost:3000/api-docs/openapi.yaml](http://localhost:3000/api-docs/openapi.yaml)
- **JSON:** [http://localhost:3000/api-docs/openapi.json](http://localhost:3000/api-docs/openapi.json)

You can also download the spec from the repository: `api/openapi.yaml`
