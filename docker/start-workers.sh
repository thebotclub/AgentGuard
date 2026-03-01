#!/bin/sh
set -e

echo "Starting AgentGuard workers..."
echo "  - telemetry-ingest"
echo "  - siem-publisher"
echo "  - policy-distributor"

# Start workers in parallel
node dist/workers/telemetry-ingest.js &
PID1=$!

node dist/workers/siem-publisher.js &
PID2=$!

node dist/workers/policy-distributor.js &
PID3=$!

# Minimal health HTTP server on :3001
node --input-type=module -e "
  import http from 'node:http';
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ status: 'ok', workers: ['telemetry-ingest', 'siem-publisher', 'policy-distributor'] }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(3001, () => console.log('Worker health server on :3001'));
" &
PID4=$!

# If any process exits, shut everything down
wait -n $PID1 $PID2 $PID3 $PID4 2>/dev/null || true
echo "A worker process exited — shutting down"
kill $PID1 $PID2 $PID3 $PID4 2>/dev/null || true
exit 1
