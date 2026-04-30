# Troubleshooting

Common issues and how to fix them.

## Authentication Errors

### 401 Unauthorized

```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "Invalid API key" }
}
```

**Causes and fixes:**

1. **Wrong header name** — The header must be `x-api-key` (lowercase).
   ```bash
   # ❌ Wrong
   curl -H "Authorization: Bearer ag_live_..."
   curl -H "X-API-Key: ag_live_..."   # HTTP/2 headers are lowercase
   
   # ✅ Correct
   curl -H "x-api-key: ag_live_..."
   ```

2. **Whitespace in the key** — Copy-paste often adds a trailing newline.
   ```python
   # ❌ Wrong — trailing newline from file read
   api_key = open(".env").read()
   
   # ✅ Correct
   api_key = open(".env").read().strip()
   # or just use python-dotenv / os.environ
   ```

3. **Revoked key** — Keys can be revoked from the dashboard. Check [agentguard.tech/dashboard](https://agentguard.tech/dashboard/) → API Keys.

4. **Using test key in wrong environment** — `ag_test_*` keys work against `https://api.agentguard.tech` too, but confirm you're not accidentally pointing at a local instance that doesn't have the key.

### 403 Forbidden

```json
{
  "success": false,
  "error": { "code": "FORBIDDEN", "message": "Agent keys cannot perform this operation" }
}
```

You're using an `ag_agent_*` key for an admin-only endpoint. Agent keys can only call:
- `POST /api/v1/evaluate`
- `POST /api/v1/evaluate/batch`
- `GET /api/v1/audit`
- `POST /api/v1/mcp/proxy`

For all other operations, use your tenant key (`ag_live_*`).

---

## Rate Limit Errors

### 429 Too Many Requests

```json
{
  "success": false,
  "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Rate limit exceeded" },
  "retryAfter": 45
}
```

**Check your limits:**

```bash
curl https://api.agentguard.tech/api/v1/usage \
  -H "x-api-key: $AGENTGUARD_API_KEY"
```

```json
{
  "data": {
    "eventsThisMonth": 98450,
    "monthlyLimit": 100000,
    "requestsLastMinute": 97,
    "requestsPerMinuteLimit": 100
  }
}
```

**Default limits:**

| Scope | Limit |
|-------|-------|
| Unauthenticated (IP) | 10 requests/min |
| Authenticated (tenant) | 100 requests/min |
| Monthly events (free tier) | 100,000 |
| Signup endpoint | 5 per hour per IP |

**Fixes:**

1. **Burst reduction** — Use `POST /evaluate/batch` (up to 50 calls per request) to reduce request count:
   ```typescript
   // ❌ 50 requests
   for (const toolCall of toolCalls) {
     await guard.evaluate(toolCall);
   }
   
   // ✅ 1 request
   await guard.evaluateBatch(toolCalls);
   ```

2. **Implement retry with backoff:**
   ```typescript
   async function evaluateWithRetry(call, maxRetries = 3) {
     for (let attempt = 0; attempt < maxRetries; attempt++) {
       try {
         return await guard.evaluate(call);
       } catch (err) {
         if (err.status === 429) {
           const delay = err.retryAfter ? err.retryAfter * 1000 : (attempt + 1) * 1000;
           await new Promise(r => setTimeout(r, delay));
           continue;
         }
         throw err;
       }
     }
     throw new Error('Max retries exceeded');
   }
   ```

3. **Upgrade tier** — Contact support for higher limits.

---

## Policy Issues

### Everything Returns `allow` (Expected Some Blocks)

Your tenant is using the **default permissive policy** (no custom rules uploaded).

**Check your active policy:**
```bash
curl https://api.agentguard.tech/api/v1/policies \
  -H "x-api-key: $AGENTGUARD_API_KEY"
```

If the response is empty or shows only the built-in template, you need to upload a policy:

```bash
curl -X POST https://api.agentguard.tech/api/v1/policies \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "yaml": "id: my-policy\nname: My Policy\ndefault: block\nrules:\n  - id: allow-reads\n    action: allow\n    priority: 100\n    when:\n      - tool:\n          in: [file_read, db_read]\n"
  }'
```

Or start from a built-in template:

```bash
# List available templates
curl https://api.agentguard.tech/api/v1/policies/templates \
  -H "x-api-key: $AGENTGUARD_API_KEY"

# Apply the OWASP LLM Top 10 template
curl -X POST https://api.agentguard.tech/api/v1/policies \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -d '{ "templateId": "owasp-llm-top10" }'
```

### Rule Not Matching When It Should

**Debug checklist:**

1. **Check rule priority** — Lower number = evaluated first. A lower-priority rule further down may be matching first.
   ```yaml
   # ❌ This allow rule (priority 100) is evaluated AFTER the block rule (priority 10)
   rules:
     - id: block-all-writes
       action: block
       priority: 10
       when: [tool.in: [file_write]]
     
     - id: allow-safe-write
       action: allow
       priority: 100   # Higher number = lower priority!
       when: [tool.in: [file_write], params.path.startsWith: "/tmp/"]
   
   # ✅ Fix: lower numbers win
   rules:
     - id: allow-safe-write
       action: allow
       priority: 10   # Evaluated first
       when: [tool.in: [file_write], params.path.startsWith: "/tmp/"]
     
     - id: block-all-writes
       action: block
       priority: 50   # Only reached if above doesn't match
   ```

2. **Verify condition operators** — `in`, `startsWith`, `contains`, `matches` are all case-sensitive by default.
   ```yaml
   # ❌ Tool name must match exactly
   when:
     - tool:
         in: [File_Read]   # Won't match "file_read"
   
   # ✅ Use exact lowercase tool names
   when:
     - tool:
         in: [file_read]
   ```

3. **Test with the playground** — Send a test evaluation to the demo endpoint to see which rule matched:
   ```bash
   curl -X POST https://api.agentguard.tech/api/v1/evaluate \
     -H "x-api-key: $AGENTGUARD_API_KEY" \
     -d '{ "tool": "file_write", "params": { "path": "/tmp/test.txt" } }'
   # Response includes matchedRuleId
   ```

4. **Check for `default: block`** — If your policy has `default: block` and no rule matches, the call is blocked. Check the `matchedRuleId` in the response — if it's `null`, no rule matched.

### Policy Upload Returns 400 Bad Request

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid policy YAML" } }
```

**Common YAML mistakes:**

```yaml
# ❌ Missing required fields
id: my-policy
# Missing: name, default

# ✅ Minimal valid policy
id: my-policy
name: My Policy
version: 1.0.0
default: block
rules: []
```

```yaml
# ❌ Incorrect rule structure
rules:
  - allow file_read   # Not valid

# ✅ Correct structure
rules:
  - id: allow-reads
    action: allow
    priority: 100
    when:
      - tool:
          in: [file_read]
```

Validate your YAML locally before uploading:

```bash
python3 -c "import yaml; yaml.safe_load(open('policy.yaml'))" && echo "Valid"
```

---

## SDK Issues

### TypeScript: `AgentGuardBlockError` Not Thrown

The SDK only throws on `block` decisions, not `monitor` or `require_approval`. Check your decision handling:

```typescript
const decision = await guard.evaluate({ tool: 'file_write', ... });

// decision.result values:
// 'allow' — proceeds silently
// 'monitor' — proceeds; event is flagged (does NOT throw)
// 'block' — throws AgentGuardBlockError
// 'require_approval' — does NOT throw by default; handle manually
if (decision.result === 'require_approval') {
  throw new Error('This action requires human approval');
}
```

### Python: `ImportError` on `agentguard`

```
ModuleNotFoundError: No module named 'agentguard'
```

The Python package name is `agentguard-tech` (with a hyphen) but imports as `agentguard`:

```bash
pip install agentguard-tech
```

```python
from agentguard import AgentGuard  # correct import
```

### SDK Calls Timing Out

Default timeout is 10 seconds. For high-load or slow networks:

```typescript
const guard = new AgentGuard({
  apiKey: process.env.AGENTGUARD_API_KEY!,
  timeout: 30_000,   // 30 seconds
});
```

```python
guard = AgentGuard(
    api_key=os.environ["AGENTGUARD_API_KEY"],
    timeout=30,   # seconds
)
```

---

## Audit Trail Issues

### Audit Verification Fails

```json
{ "data": { "valid": false, "brokenAt": 1847, "reason": "Hash mismatch" } }
```

This means the audit chain was broken — a row was modified directly in the database (e.g., during a failed migration, manual DB operation, or data import). 

**Note:** Chain breaks do not affect new events going forward. The chain is re-anchored from the last valid event. Contact support if you believe this was unexpected.

### Audit Log Missing Events

Events are written asynchronously. There may be a short delay (typically <1 second) between an evaluation and the event appearing in `GET /audit`.

For real-time event streaming, set up a webhook:

```bash
curl -X POST https://api.agentguard.tech/api/v1/webhooks \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -d '{
    "url": "https://your-app.com/agentguard-events",
    "events": ["evaluation.blocked", "evaluation.require_approval"]
  }'
```

---

## Health Check

To verify the API is reachable and healthy:

```bash
curl https://api.agentguard.tech/health
```

```json
{ "status": "ok", "version": "0.10.0" }
```

If `db` is not `ok`, the API may be in a degraded state. Check [status.agentguard.tech](https://status.agentguard.tech) for incidents.

---

## Getting Help

- **Dashboard:** [agentguard.tech/dashboard](https://agentguard.tech/dashboard/) — view audit logs, test policies
- **Demo playground:** [demo.agentguard.tech](https://demo.agentguard.tech) — test evaluations without auth
- **GitHub Issues:** [github.com/thebotclub/AgentGuard](https://github.com/thebotclub/AgentGuard/issues)
- **OpenAPI Spec:** [API Reference →](/api/swagger) — interactive docs for all 144 endpoints

When reporting issues, include:
- Your `requestId` from the error response
- The `x-api-key` prefix (first 12 chars only — never share the full key)
- SDK version (`npm list @the-bot-club/agentguard` or `pip show agentguard-tech`)
- Example request and full response body
