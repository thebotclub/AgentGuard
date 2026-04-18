/**
 * AgentGuard — Webhook HMAC Signing
 *
 * Signs outbound webhook payloads with HMAC-SHA256 so receivers can
 * verify authenticity and detect tampering.
 *
 * Header format:  X-AgentGuard-Signature: t=<unix_ms>,v1=<hex_hmac>
 * HMAC input:     "<timestamp>.<payload_json>"
 */
import crypto from 'crypto';

const SIGNATURE_VERSION = 'v1';

/**
 * Generate an HMAC-SHA256 signature for a webhook payload.
 *
 * @param payload   - Raw JSON string of the payload
 * @param secret    - Per-tenant webhook secret
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Hex-encoded HMAC-SHA256 digest
 */
export function generateSignature(
  payload: string,
  secret: string,
  timestamp: number,
): string {
  const hmacInput = `${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(hmacInput).digest('hex');
}

/**
 * Sign a webhook payload and produce the complete set of delivery headers.
 *
 * @param payload - Object to be delivered (will be JSON-serialized)
 * @param secret  - Per-tenant webhook secret. If empty/null the payload is
 *                  returned unsigned (no signature header).
 * @returns Object with the serialised payload body and headers map
 */
export function signWebhookPayload(
  payload: object,
  secret: string | null | undefined,
): { payload: string; headers: Record<string, string> } {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (secret) {
    const timestamp = Date.now();
    const signature = generateSignature(body, secret, timestamp);
    headers['X-AgentGuard-Signature'] = `t=${timestamp},${SIGNATURE_VERSION}=${signature}`;
  }

  return { payload: body, headers };
}

/**
 * Verify an incoming X-AgentGuard-Signature header value.
 *
 * @param headerValue - The full header value (e.g. "t=1710000000000,v1=abcdef...")
 * @param body        - Raw request body string
 * @param secret      - The shared webhook secret
 * @param toleranceMs - Maximum age of the timestamp in ms (default 5 min)
 * @returns true if the signature is valid and within the time tolerance
 */
export function verifyWebhookSignature(
  headerValue: string,
  body: string,
  secret: string,
  toleranceMs: number = 5 * 60 * 1000,
): boolean {
  const parts = headerValue.split(',');
  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.substring(0, eqIdx).trim();
    const val = part.substring(eqIdx + 1).trim();
    if (key === 't') timestamp = Number(val);
    if (key === SIGNATURE_VERSION) signature = val;
  }

  if (timestamp === null || signature === null) return false;

  // Reject stale signatures
  if (Math.abs(Date.now() - timestamp) > toleranceMs) return false;

  const expected = generateSignature(body, secret, timestamp);
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

/**
 * Generate a cryptographically random webhook secret suitable for
 * per-tenant webhook signing.
 *
 * @returns 32-byte hex string (64 characters)
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}
