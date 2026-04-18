import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // ramp to 10
    { duration: '60s', target: 50 },   // ramp to 50
    { duration: '30s', target: 100 },  // ramp to 100
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed:   ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // --- /health ---
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    '/health status 200': (r) => r.status === 200,
    '/health has status field': (r) => {
      try { return JSON.parse(r.body).status !== undefined; }
      catch { return false; }
    },
  });

  sleep(0.5);

  // --- /metrics ---
  const metricsRes = http.get(`${BASE_URL}/metrics`);
  check(metricsRes, {
    '/metrics status 200':     (r) => r.status === 200,
    '/metrics prometheus format': (r) => r.body.includes('http_requests'),
  });

  sleep(1);
}
