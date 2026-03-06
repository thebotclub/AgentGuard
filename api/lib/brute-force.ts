/**
 * AgentGuard — Brute-Force Protection
 * Tracks failed auth attempts per IP. Blocks after threshold.
 */

interface AttemptRecord {
  count: number;
  firstAttempt: number;
  blockedUntil: number;
}

const attempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 10;       // max failed attempts per window
const WINDOW_MS = 15 * 60_000; // 15 minute window
const BLOCK_MS = 30 * 60_000;  // 30 minute block

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of attempts) {
    if (now - record.firstAttempt > WINDOW_MS * 2 && now > record.blockedUntil) {
      attempts.delete(ip);
    }
  }
}, 10 * 60_000).unref();

export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now - record.firstAttempt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAttempt: now, blockedUntil: 0 });
    return;
  }
  record.count++;
  if (record.count >= MAX_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_MS;
  }
}

export function isBlocked(ip: string): boolean {
  const record = attempts.get(ip);
  if (!record) return false;
  return Date.now() < record.blockedUntil;
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip);
}
