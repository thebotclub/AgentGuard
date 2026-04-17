/**
 * AgentGuard — Integration Config Encryption
 *
 * AES-256-GCM symmetric encryption for sensitive integration configs
 * (Slack signing secrets, webhook URLs).
 *
 * Key: INTEGRATION_ENCRYPTION_KEY env var (32-byte hex string).
 * Falls back to a deterministic dev key derived from a fixed seed.
 * In production, always set INTEGRATION_ENCRYPTION_KEY.
 */
import crypto from 'crypto';
import { logger } from './logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const _TAG_LENGTH = 16; // 128-bit auth tag — implicit in node:crypto AES-GCM, reserved for explicit use

/** Get or derive the 32-byte encryption key */
function getEncryptionKey(): Buffer {
  const envKey = process.env['INTEGRATION_ENCRYPTION_KEY'];
  if (envKey) {
    const key = Buffer.from(envKey, 'hex');
    if (key.length !== 32) {
      throw new Error(
        'INTEGRATION_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)',
      );
    }
    return key;
  }
  // In production, refuse to start without a proper key
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'INTEGRATION_ENCRYPTION_KEY is required in production. Generate with: openssl rand -hex 32',
    );
  }
  // Dev fallback: derive from a fixed seed (NOT for production)
  logger.warn('[integration-crypto] WARNING: Using dev fallback encryption key. Set INTEGRATION_ENCRYPTION_KEY in production.');
  return crypto
    .createHash('sha256')
    .update('agentguard-dev-integration-key-fallback')
    .digest();
}

/**
 * Encrypt a JSON-serialisable value.
 * Returns a base64url-encoded string: iv:ciphertext:tag
 */
export function encryptConfig(value: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plain = JSON.stringify(value);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Encode as base64url parts joined with dots
  return [
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

/**
 * Decrypt a config encrypted with encryptConfig().
 * Returns the parsed object, or throws on tampering/bad key.
 */
export function decryptConfig(encrypted: string): Record<string, unknown> {
  const key = getEncryptionKey();
  const parts = encrypted.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted config format');
  }
  const [ivB64, ciphertextB64, tagB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, 'base64url');
  const ciphertext = Buffer.from(ciphertextB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as Record<string, unknown>;
}
