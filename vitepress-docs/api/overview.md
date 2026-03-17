# API Overview

AgentGuard provides a REST API with 60+ endpoints for policy evaluation, agent management, audit trail access, and platform analytics.

## Base URLs

| Environment | URL |
|-------------|-----|
| Production | `https://api.agentguard.tech/api/v1` |
| Local Dev | `http://localhost:3000/api/v1` |

## Authentication

AgentGuard uses three authentication schemes:

### API Key (`x-api-key`)

Your tenant API key, prefixed `ag_live_`. Used for most authenticated endpoints.

```http
GET /api/v1/agents
x-api-key: ag_live_your_key_here
```

### Agent Key

Agent-scoped key, prefixed `ag_agent_`. Used for evaluate calls from specific agents.

### Admin Key (`x-admin-key`)

Platform admin key. Required for admin-only endpoints.

## Rate Limits

| Client Type | Limit |
|-------------|-------|
| Unauthenticated | 10 requests/min per IP |
| Authenticated | 100 requests/min per IP |
| Signup | 5 per hour per IP |

## Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "requestId": "req_abc123"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}
```

## Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/signup` | Create account |
| `POST` | `/auth/login` | Login |
| `POST` | `/evaluate` | Evaluate tool call |
| `GET` | `/agents` | List agents |
| `POST` | `/agents` | Register agent |
| `GET` | `/audit` | Query audit trail |
| `POST` | `/kill` | Kill switch |
| `GET` | `/analytics/usage` | Usage analytics |
| `GET` | `/compliance/owasp` | OWASP report |

## Interactive Documentation

When running locally, visit [`/api-docs`](http://localhost:3000/api-docs) for the Swagger UI with full interactive API documentation.

You can also download the [OpenAPI Spec](/api/spec-download).
