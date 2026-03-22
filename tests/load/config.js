/**
 * AgentGuard Load Testing — Shared Configuration
 *
 * Set environment variables before running:
 *   BASE_URL     API base URL (default: http://localhost:3000)
 *   API_KEY      AgentGuard API key for tenant under test
 *   SCIM_TOKEN   SCIM bearer token for provisioning tests
 *   JWT_TOKEN    Dashboard JWT token for management API tests
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const API_KEY = __ENV.API_KEY || 'ag-test-key-replace-me';
export const SCIM_TOKEN = __ENV.SCIM_TOKEN || 'ag-scim-replace-me';
export const JWT_TOKEN = __ENV.JWT_TOKEN || 'replace-me-jwt';

// Common headers
export const apiHeaders = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

export const scimHeaders = {
  'Content-Type': 'application/scim+json',
  'Authorization': `Bearer ${SCIM_TOKEN}`,
};

export const jwtHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${JWT_TOKEN}`,
};

// Thresholds shared across tests
export const commonThresholds = {
  http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true }], // <1% error rate
  http_req_duration: ['p(95)<500'], // 95th percentile < 500ms
};
