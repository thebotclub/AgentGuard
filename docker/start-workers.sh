#!/bin/sh
set -e

echo "Starting AgentGuard workers..."

WORKER_PIDS=""

# Start each worker if its entry point exists
for worker in telemetry-ingest siem-publisher policy-distributor; do
  ENTRY="dist/workers/${worker}.js"
  if [ -f "$ENTRY" ]; then
    echo "  ✓ Starting ${worker}"
    node "$ENTRY" &
    WORKER_PIDS="$WORKER_PIDS $!"
  else
    echo "  - Skipping ${worker} (not built)"
  fi
done

# Health HTTP server on :3002
node --input-type=module -e "
  import http from 'node:http';
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ status: 'ok', service: 'agentguard-worker' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(3002, '0.0.0.0', () => console.log('Worker health server on :3002'));
" &
HEALTH_PID=$!

echo "AgentGuard workers started. Health endpoint: http://localhost:3002/health"

# Wait for any process to exit, then clean up
if [ -n "$WORKER_PIDS" ]; then
  wait $WORKER_PIDS $HEALTH_PID 2>/dev/null || true
  echo "A process exited — shutting down"
  kill $WORKER_PIDS $HEALTH_PID 2>/dev/null || true
else
  # No workers to start — just keep health server alive
  wait $HEALTH_PID 2>/dev/null || true
fi
