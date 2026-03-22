/**
 * AgentGuard — Prompt Injection Heuristic Checks
 *
 * Statistical anomaly detection using signal analysis:
 *   1. Shannon entropy analysis (high entropy → potential base64 / encoded payload)
 *   2. Character distribution analysis (unusual Unicode ratios)
 *   3. Suspicious structural signals (repetition, abnormal length, format anomalies)
 *   4. Base64 payload detection
 *   5. Invisible / control character density
 *   6. Instruction-density scoring (imperative verb + object patterns)
 *
 * Returns a HeuristicsResult with individual signal scores and an aggregate
 * heuristic confidence (0–100) indicating injection likelihood.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface HeuristicSignal {
  id: string;
  name: string;
  score: number;         // 0–100 contribution to this signal
  weight: number;        // Relative weight in aggregate
  triggered: boolean;
  details: string;
}

export interface HeuristicsResult {
  signals: HeuristicSignal[];
  aggregateScore: number;   // Weighted average of triggered signal scores (0–100)
  triggered: boolean;       // true if any critical heuristic fired
}

// ─── 1. Shannon Entropy Analysis ─────────────────────────────────────────────
// Normal English prose: entropy ≈ 3.5–4.5 bits/char
// Base64: entropy ≈ 5.9–6.0 bits/char
// Random bytes: entropy ≈ 7.5–8.0 bits/char

const ENTROPY_HIGH_THRESHOLD = 5.7;   // Suspicious
const ENTROPY_CRITICAL_THRESHOLD = 6.2; // Likely encoded

function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const ch of text) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }

  let entropy = 0;
  const len = text.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

function checkEntropy(input: string): HeuristicSignal {
  // Use the longest contiguous alphanumeric run to avoid noise from whitespace
  const runs = input.match(/[A-Za-z0-9+/=]{30,}/g) ?? [];
  const maxEntropy = runs.reduce((max, run) => Math.max(max, shannonEntropy(run)), 0);

  let score = 0;
  let details = `max entropy in text blocks: ${maxEntropy.toFixed(2)} bits/char`;

  if (maxEntropy >= ENTROPY_CRITICAL_THRESHOLD) {
    score = 90;
    details += ` (critical threshold: ≥${ENTROPY_CRITICAL_THRESHOLD})`;
  } else if (maxEntropy >= ENTROPY_HIGH_THRESHOLD) {
    score = 55;
    details += ` (high threshold: ≥${ENTROPY_HIGH_THRESHOLD})`;
  }

  return {
    id: 'H-ENT',
    name: 'High-entropy content (possible encoding)',
    score,
    weight: 30,
    triggered: score > 0,
    details,
  };
}

// ─── 2. Base64 Block Detection ────────────────────────────────────────────────
// Looks for sizeable base64-encoded blocks that could smuggle instructions.

const BASE64_BLOCK_RE = /(?:[A-Za-z0-9+/]{20,}={0,2})/g;
const MIN_BASE64_LENGTH = 32;

function checkBase64Blocks(input: string): HeuristicSignal {
  const matches = [...input.matchAll(BASE64_BLOCK_RE)];
  const longBlocks = matches.filter((m) => (m[0]?.length ?? 0) >= MIN_BASE64_LENGTH);

  let score = 0;
  const count = longBlocks.length;

  if (count >= 3) score = 80;
  else if (count >= 2) score = 60;
  else if (count === 1) score = 35;

  // Boost if it decodes to something instruction-like
  if (count > 0) {
    try {
      const sample = longBlocks[0]?.[0] ?? '';
      const decoded = Buffer.from(sample, 'base64').toString('utf8');
      const instructionKw = /\b(?:ignore|system|prompt|instructions?|bypass|override)\b/i;
      if (instructionKw.test(decoded)) score = Math.min(100, score + 30);
    } catch {
      // Not valid UTF-8 after decode — still potentially suspicious
    }
  }

  return {
    id: 'H-B64',
    name: 'Base64 encoded content blocks',
    score,
    weight: 25,
    triggered: score > 0,
    details: `found ${count} base64 block(s) of length ≥${MIN_BASE64_LENGTH}`,
  };
}

// ─── 3. Invisible / Control Character Density ────────────────────────────────
// Detects zero-width spaces, soft hyphens, and other invisible chars used to
// smuggle instructions past naive string-matching filters.

const INVISIBLE_CHARS_RE = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\uFEFF\u00AD]/g;
const INVISIBLE_DENSITY_THRESHOLD = 0.005; // 0.5% of chars

function checkInvisibleChars(input: string): HeuristicSignal {
  const matches = input.match(INVISIBLE_CHARS_RE) ?? [];
  const density = input.length > 0 ? matches.length / input.length : 0;

  let score = 0;
  if (matches.length >= 3) score = 90;
  else if (matches.length >= 1) score = 70;

  return {
    id: 'H-INV',
    name: 'Invisible / zero-width character injection',
    score,
    weight: 35,
    triggered: score > 0,
    details: `${matches.length} invisible chars found (density: ${(density * 100).toFixed(3)}%, threshold: ${INVISIBLE_DENSITY_THRESHOLD * 100}%)`,
  };
}

// ─── 4. Repetitive Structure Detection ───────────────────────────────────────
// Token-stuffing / jailbreak prompts often use extreme repetition to push
// the model toward a specific output.

const MAX_SANE_REPETITIONS = 5;

function checkRepetitiveStructure(input: string): HeuristicSignal {
  // Split into lines and detect repeated line blocks
  const lines = input.split(/\r?\n/).filter((l) => l.trim().length > 10);
  const freq = new Map<string, number>();
  for (const line of lines) {
    const key = line.trim().toLowerCase();
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  const maxRepetitions = Math.max(0, ...freq.values());
  let score = 0;

  if (maxRepetitions > MAX_SANE_REPETITIONS * 4) score = 80;
  else if (maxRepetitions > MAX_SANE_REPETITIONS * 2) score = 50;
  else if (maxRepetitions > MAX_SANE_REPETITIONS) score = 30;

  return {
    id: 'H-REP',
    name: 'Highly repetitive structure',
    score,
    weight: 15,
    triggered: score > 0,
    details: `max line repetitions: ${maxRepetitions} (threshold: ${MAX_SANE_REPETITIONS})`,
  };
}

// ─── 5. Abnormal Input Length ─────────────────────────────────────────────────
// Extremely long inputs can be used to overwhelm context and slide injections
// past attention mechanisms.

const LENGTH_WARNING_THRESHOLD = 5_000;   // chars
const LENGTH_CRITICAL_THRESHOLD = 20_000; // chars

function checkInputLength(input: string): HeuristicSignal {
  const len = input.length;
  let score = 0;

  if (len >= LENGTH_CRITICAL_THRESHOLD) score = 60;
  else if (len >= LENGTH_WARNING_THRESHOLD) score = 25;

  return {
    id: 'H-LEN',
    name: 'Abnormally long input',
    score,
    weight: 10,
    triggered: score > 0,
    details: `input length: ${len} chars (warning: ≥${LENGTH_WARNING_THRESHOLD}, critical: ≥${LENGTH_CRITICAL_THRESHOLD})`,
  };
}

// ─── 6. Instruction Density (Imperative Commands) ────────────────────────────
// High density of imperative verbs targeting AI behavior is a soft signal.

const IMPERATIVE_VERBS = [
  'ignore', 'disregard', 'forget', 'override', 'bypass', 'pretend',
  'simulate', 'roleplay', 'reveal', 'print', 'output', 'repeat',
  'disable', 'deactivate', 'unlock', 'jailbreak', 'escape', 'exit',
  'execute', 'run', 'do', 'follow', 'obey',
];

const IMPERATIVE_RE = new RegExp(
  `\\b(${IMPERATIVE_VERBS.join('|')})\\b`,
  'gi',
);

const IMPERATIVE_DENSITY_THRESHOLD = 0.015; // 1.5 commands per 100 words

function checkImperativeDensity(input: string): HeuristicSignal {
  const wordCount = input.split(/\s+/).filter((w) => w.length > 0).length;
  const imperatives = [...input.matchAll(IMPERATIVE_RE)];
  const density = wordCount > 0 ? imperatives.length / wordCount : 0;

  let score = 0;
  if (density >= IMPERATIVE_DENSITY_THRESHOLD * 3) score = 70;
  else if (density >= IMPERATIVE_DENSITY_THRESHOLD * 2) score = 45;
  else if (density >= IMPERATIVE_DENSITY_THRESHOLD) score = 20;

  return {
    id: 'H-IMP',
    name: 'High density of imperative commands',
    score,
    weight: 20,
    triggered: score > 0,
    details: `${imperatives.length} imperative verbs / ${wordCount} words = density ${(density * 100).toFixed(2)}% (threshold: ${(IMPERATIVE_DENSITY_THRESHOLD * 100).toFixed(2)}%)`,
  };
}

// ─── 7. Mixed-Script Anomaly ──────────────────────────────────────────────────
// Using Cyrillic, Greek, or other Unicode script lookalikes alongside Latin
// characters is a common homograph technique to bypass regex filters.

const MIXED_SCRIPT_RE = /[\u0400-\u04FF]/; // Cyrillic
const LATIN_PROPORTION_THRESHOLD = 0.8;    // <80% Latin → suspicious if Cyrillic present

function checkMixedScript(input: string): HeuristicSignal {
  const hasCyrillic = MIXED_SCRIPT_RE.test(input);
  if (!hasCyrillic) {
    return { id: 'H-MSC', name: 'Mixed script (homograph)', score: 0, weight: 20, triggered: false, details: 'no Cyrillic chars detected' };
  }

  const latinChars = (input.match(/[A-Za-z]/g) ?? []).length;
  const cyrillicChars = (input.match(/[\u0400-\u04FF]/g) ?? []).length;
  const totalAlpha = latinChars + cyrillicChars;
  const latinProportion = totalAlpha > 0 ? latinChars / totalAlpha : 1;

  let score = 0;
  if (cyrillicChars > 3 && latinProportion < LATIN_PROPORTION_THRESHOLD) score = 65;
  else if (cyrillicChars > 1) score = 35;

  return {
    id: 'H-MSC',
    name: 'Mixed script (homograph attack)',
    score,
    weight: 20,
    triggered: score > 0,
    details: `${cyrillicChars} Cyrillic chars alongside ${latinChars} Latin chars (Latin proportion: ${(latinProportion * 100).toFixed(1)}%)`,
  };
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

/**
 * Run all heuristic checks against the input string.
 * Returns individual signals and a weighted aggregate score (0–100).
 */
export function runHeuristics(input: string): HeuristicsResult {
  const signals: HeuristicSignal[] = [
    checkEntropy(input),
    checkBase64Blocks(input),
    checkInvisibleChars(input),
    checkRepetitiveStructure(input),
    checkInputLength(input),
    checkImperativeDensity(input),
    checkMixedScript(input),
  ];

  const triggeredSignals = signals.filter((s) => s.triggered);

  // Weighted average of triggered signals
  const totalWeight = triggeredSignals.reduce((sum, s) => sum + s.weight, 0);
  const aggregateScore =
    totalWeight > 0
      ? triggeredSignals.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight
      : 0;

  return {
    signals,
    aggregateScore: Math.round(aggregateScore),
    triggered: triggeredSignals.length > 0,
  };
}
