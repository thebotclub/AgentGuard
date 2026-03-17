/**
 * AgentGuard — Built-in Regex PII Detector
 *
 * Zero external dependencies.
 * Detects common PII patterns using high-confidence regexes to minimise
 * false positives, and redacts with deterministic SHA-256-based placeholders.
 *
 * Redaction format: [TYPE_REDACTED_xxxx]
 * where xxxx = first 4 chars of sha256(original matched text)
 */
import crypto from 'crypto';
import type { PIIEntity, PIIScanResult, PIIPlugin } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Return the first 4 hex chars of SHA-256(text) — deterministic so the same
 * PII value always produces the same placeholder within a run.
 */
function shortHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 4);
}

/**
 * Build a redaction placeholder for a given PII type and matched text.
 */
function placeholder(type: string, text: string): string {
  return `[${type}_REDACTED_${shortHash(text)}]`;
}

// ── Pattern definitions ────────────────────────────────────────────────────
// Each entry: { type, regex, score }
// Regexes use the 'g' flag so matchAll works correctly.
// Patterns are intentionally conservative (high precision > high recall).

interface PatternDef {
  type: string;
  regex: RegExp;
  score: number;
}

const PATTERNS: PatternDef[] = [
  // ── Email ─────────────────────────────────────────────────────────────
  // RFC-5321 compliant local part + domain; rejects bare IPs.
  {
    type: 'EMAIL',
    regex: /\b[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}\b/g,
    score: 0.95,
  },

  // ── Credit card numbers ───────────────────────────────────────────────
  // Visa (16 d), MC (16 d), Amex (15 d), Discover (16 d).
  // Optional separators: space or dash. Luhn not checked but pattern is tight.
  {
    type: 'CREDIT_CARD',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})(?:[-\s]?[0-9]{4})?\b/g,
    score: 0.90,
  },

  // ── SSN (US) ──────────────────────────────────────────────────────────
  // Format: XXX-XX-XXXX  (dashes required — avoids false positives).
  // Excludes 000/666/9xx area numbers that are administratively invalid.
  {
    type: 'SSN',
    regex: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    score: 0.92,
  },

  // ── IPv4 address ──────────────────────────────────────────────────────
  {
    type: 'IP_ADDRESS',
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\b/g,
    score: 0.85,
  },

  // ── Phone numbers ─────────────────────────────────────────────────────
  // Covers US (+1 xxx-xxx-xxxx), UK (+44 xxxx xxxxxx), AU (+61 x xxxx xxxx),
  // and generic E.164 international (+xx up to 15 digits).
  // Requires a word boundary or non-digit boundary to avoid matching version numbers etc.
  {
    type: 'PHONE',
    regex: /(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/g,
    score: 0.80,
  },

  // ── Date of birth ─────────────────────────────────────────────────────
  // ISO (YYYY-MM-DD), US (MM/DD/YYYY), EU (DD/MM/YYYY or DD.MM.YYYY).
  // High-confidence only: require 4-digit year to avoid version strings.
  {
    type: 'DATE_OF_BIRTH',
    regex: /\b(?:\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])|(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/\d{4}|(?:0[1-9]|[12]\d|3[01])[/.](?:0[1-9]|1[0-2])[/.](?:19|20)\d{2})\b/g,
    score: 0.75,
  },
];

// ── Detector class ─────────────────────────────────────────────────────────

export class RegexPIIDetector implements PIIPlugin {
  readonly name = 'regex-pii-detector';

  async scan(content: string): Promise<PIIScanResult> {
    // Collect all matches with their positions.
    const entities: PIIEntity[] = [];

    for (const def of PATTERNS) {
      // Reset lastIndex — important when reusing stateful RegExp objects
      def.regex.lastIndex = 0;

      for (const match of content.matchAll(def.regex)) {
        const text = match[0];
        const start = match.index ?? 0;
        const end = start + text.length;

        entities.push({
          type: def.type,
          start,
          end,
          score: def.score,
          text,
        });
      }
    }

    // Sort by start position for deterministic left-to-right replacement.
    entities.sort((a, b) => a.start - b.start || b.end - a.end);

    // Resolve overlaps: keep the entity with the highest score (or longest
    // match on tie) and discard any that overlap with an already-accepted one.
    const accepted: PIIEntity[] = [];
    let cursor = 0;
    for (const entity of entities) {
      if (entity.start < cursor) {
        // Overlaps with a previously accepted entity — skip
        continue;
      }
      accepted.push(entity);
      cursor = entity.end;
    }

    // Build redacted content by replacing accepted entities from right to left
    // so that earlier indices remain valid.
    let redacted = content;
    for (let i = accepted.length - 1; i >= 0; i--) {
      const e = accepted[i]!;
      const ph = placeholder(e.type, e.text);
      redacted = redacted.slice(0, e.start) + ph + redacted.slice(e.end);
    }

    return {
      entitiesFound: accepted.length,
      entities: accepted,
      redactedContent: redacted,
    };
  }
}

/** Singleton instance — shared across requests. */
export const defaultDetector = new RegexPIIDetector();
