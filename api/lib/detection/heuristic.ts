/**
 * AgentGuard — Heuristic Detection Plugin
 *
 * Built-in, zero-external-dependency prompt injection detection.
 * Uses pattern matching against known injection / jailbreak signatures.
 */

import type { DetectionPlugin, DetectionResult, DetectionInput } from './types.js';

// ── Pattern loading ────────────────────────────────────────────────────────

interface Patterns {
  prompt_injection: string[];
  jailbreak: string[];
  system_exposure: string[];
  sql_injection: string[];
}

function loadPatterns(): Patterns {
  try {
    // Use Node.js require for JSON — works in both CJS and tsx/ESM via interop
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const patternsPath = require.resolve('./patterns.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(patternsPath) as Patterns;
  } catch {
    // Fallback inline patterns if file is unavailable
    return {
      prompt_injection: [
        'ignore previous instructions',
        'disregard previous instructions',
        'forget your instructions',
        'override your instructions',
      ],
      jailbreak: [
        'you are now',
        'act as',
        'pretend you are',
        'developer mode',
        'jailbreak',
      ],
      system_exposure: [
        'reveal your instructions',
        'system prompt',
        'repeat everything above',
      ],
      sql_injection: [
        "'; drop",
        'union select',
        'or 1=1',
        'drop table',
      ],
    };
  }
}

const PATTERNS: Patterns = loadPatterns();

// ── Base64 detection ───────────────────────────────────────────────────────

const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4}){4,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function looksLikeBase64Payload(value: string): boolean {
  // Only flag strings that are long enough to encode meaningful content
  if (value.length < 32) return false;
  return BASE64_REGEX.test(value.trim());
}

function containsExcessiveControlChars(value: string): boolean {
  // Count non-printable control characters (excluding common whitespace)
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) count++;
  }
  return count > 3;
}

function containsExcessiveSpecialChars(value: string): boolean {
  if (value.length < 20) return false;
  let specials = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (/[^a-zA-Z0-9\s.,!?:;'"()\-_]/.test(c)) specials++;
  }
  return specials / value.length > 0.4;
}

// ── Scoring ────────────────────────────────────────────────────────────────

interface Match {
  category: 'prompt_injection' | 'jailbreak' | 'system_exposure' | 'sql_injection';
  pattern: string;
  confidence: number;
}

function scanText(text: string): Match[] {
  const lower = text.toLowerCase();
  const matches: Match[] = [];

  for (const pattern of PATTERNS.prompt_injection) {
    if (lower.includes(pattern)) {
      matches.push({ category: 'prompt_injection', pattern, confidence: 0.9 });
    }
  }
  for (const pattern of PATTERNS.jailbreak) {
    if (lower.includes(pattern)) {
      matches.push({ category: 'jailbreak', pattern, confidence: 0.85 });
    }
  }
  for (const pattern of PATTERNS.system_exposure) {
    if (lower.includes(pattern)) {
      matches.push({ category: 'prompt_injection', pattern, confidence: 0.8 });
    }
  }
  for (const pattern of PATTERNS.sql_injection) {
    if (lower.includes(pattern)) {
      matches.push({ category: 'prompt_injection', pattern, confidence: 0.75 });
    }
  }

  if (looksLikeBase64Payload(text)) {
    matches.push({ category: 'prompt_injection', pattern: 'base64_payload', confidence: 0.6 });
  }
  if (containsExcessiveControlChars(text)) {
    matches.push({ category: 'prompt_injection', pattern: 'control_chars', confidence: 0.65 });
  }
  if (containsExcessiveSpecialChars(text)) {
    matches.push({ category: 'prompt_injection', pattern: 'excessive_special_chars', confidence: 0.5 });
  }

  return matches;
}

function extractStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(extractStrings);
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(extractStrings);
  }
  return [];
}

function computeScore(matches: Match[]): number {
  if (matches.length === 0) return 0;
  // Combine confidences: first match carries most weight, subsequent add diminishing returns
  let score = 0;
  for (let i = 0; i < matches.length; i++) {
    const weight = 1 / (i + 1);
    score += (matches[i]!.confidence * weight);
  }
  // Normalise so a single high-confidence hit ~= its raw confidence
  return Math.min(score, 1.0);
}

function dominantCategory(matches: Match[]): string {
  if (matches.length === 0) return 'safe';
  // Count by category
  const tally: Record<string, number> = {};
  for (const m of matches) {
    tally[m.category] = (tally[m.category] ?? 0) + m.confidence;
  }
  // Return the category with the highest weighted count, mapped to output categories
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]![0];
  if (top === 'jailbreak') return 'jailbreak';
  return 'prompt_injection';
}

// ── Plugin ────────────────────────────────────────────────────────────────

export class HeuristicDetectionPlugin implements DetectionPlugin {
  readonly name = 'heuristic';

  async detect(input: DetectionInput): Promise<DetectionResult> {
    const allMatches: Match[] = [];

    // Scan tool name
    allMatches.push(...scanText(input.toolName));

    // Scan all string values in tool input (recursive)
    const inputStrings = extractStrings(input.toolInput);
    for (const s of inputStrings) {
      allMatches.push(...scanText(s));
    }

    // Scan message history if provided (last 10 messages to bound cost)
    if (input.messageHistory) {
      const recent = input.messageHistory.slice(-10);
      for (const msg of recent) {
        allMatches.push(...scanText(msg.content));
      }
    }

    const score = computeScore(allMatches);
    const detected = score >= 0.5;
    const category = detected ? dominantCategory(allMatches) : 'safe';

    return {
      detected,
      score,
      category,
      provider: 'heuristic',
    };
  }
}
