# Load Tests — k6 Baselines

## Prerequisites

Install [k6](https://k6.io/docs/get-started/installation/):

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C4911E9F328F
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Running the Tests

Start the API server first:

```bash
npm run dev
```

### Health & Metrics baseline

```bash
k6 run load-tests/api-health.js
```

### Evaluate endpoint baseline

```bash
# With a real API key (recommended):
API_KEY=ag_live_xxx k6 run load-tests/api-evaluate.js

# Without a key (requests will hit auth — useful for error-path baseline):
k6 run load-tests/api-evaluate.js
```

### Custom base URL

Both scripts default to `http://localhost:3000`. Override with:

```bash
BASE_URL=https://staging.agentguard.tech k6 run load-tests/api-health.js
```

## What Each Script Tests

| Script | Endpoint(s) | VU ramp | p95 target |
|---|---|---|---|
| `api-health.js` | `GET /health`, `GET /metrics` | 10 → 50 → 100 (2 min) | < 200 ms |
| `api-evaluate.js` | `POST /api/v1/evaluate` | 5 → 20 → 50 (3 min) | < 500 ms |

## Interpreting Results

k6 exits with code `0` when all thresholds pass. If a threshold fails, the exit code is non-zero — useful for CI gates:

```bash
k6 run load-tests/api-health.js || echo "Thresholds failed"
```
