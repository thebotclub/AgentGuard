import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 5 },   // ramp to 5
    { duration: '1m', target: 20 },  // ramp to 20
    { duration: '1m', target: 50 },  // ramp to 50
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Sample payloads — rotated per iteration to vary the load
const SAMPLES = [
  { tool: 'sudo', params: { command: 'cat /etc/shadow' } },
  { tool: 'rm',   params: { path: '/tmp/log', recursive: true } },
  { tool: 'curl', params: { url: 'https://example.com/api' } },
  { tool: 'sql',  params: { query: 'DROP TABLE users' } },
  { tool: 'fs',   params: { action: 'write', path: '/etc/passwd', content: 'root::0:0' } },
];

export function setup() {
  const apiKey = __ENV.API_KEY;
  if (!apiKey) {
    console.warn('WARNING: API_KEY not set — requests may be rejected by auth middleware');
  }
  return { apiKey: apiKey || '' };
}

export default function (data) {
  const payload = JSON.stringify(SAMPLES[__VU % SAMPLES.length]);
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  if (data.apiKey) {
    params.headers['X-API-Key'] = data.apiKey;
  }

  const res = http.post(`${BASE_URL}/api/v1/evaluate`, payload, params);

  check(res, {
    'evaluate status 2xx': (r) => r.status >= 200 && r.status < 300,
    'evaluate has decision': (r) => {
      if (r.status >= 400) return true; // auth/validation errors are expected without valid key
      try { return JSON.parse(r.body).decision !== undefined; }
      catch { return false; }
    },
  });

  sleep(1);
}
