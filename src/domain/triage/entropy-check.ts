/**
 * Length-normalized token entropy on prompt tail segments (SP-154, #82).
 *
 * Detects R2A / Route-to-Rome adversarial suffixes that inflate perceived
 * complexity via high-entropy token runs appended to otherwise normal prompts.
 *
 * False-positive mitigation (see module constants):
 * - Relative tail-vs-prefix delta (not absolute entropy alone)
 * - Minimum tail token count before strip/flag
 * - Short prompts skip entropy enforcement
 */

// ─── Configuration ───────────────────────────────────────────────────────────

/** Default tail window size in tokens analyzed for entropy anomaly. */
export const DEFAULT_TAIL_WINDOW_TOKENS = 32;

/** Minimum tail tokens required before strip/flag (avoids punishing short suffixes). */
export const MIN_TAIL_TOKENS = 8;

/**
 * Minimum combined anomaly delta (tail minus prefix segment score).
 * Blends token entropy with gibberish-token ratio for R2A suffix detection.
 */
export const ENTROPY_DELTA_THRESHOLD = 0.35;

/**
 * Absolute combined tail anomaly floor when delta triggers.
 */
export const ABSOLUTE_TAIL_ENTROPY_THRESHOLD = 0.55;

/** Fraction of tail tokens that must look gibberish when delta triggers. */
export const GIBBERISH_TAIL_RATIO_THRESHOLD = 0.45;

/** Minimum prefix tokens required for relative delta comparison. */
export const MIN_PREFIX_TOKENS = 4;

/** Prompts shorter than this (tokens) skip entropy enforcement entirely. */
export const MIN_PROMPT_TOKENS = MIN_PREFIX_TOKENS + MIN_TAIL_TOKENS;

// ─── Public types ──────────────────────────────────────────────────────────────

export interface EntropyCheckOptions {
  /** Tail window size in tokens (default {@link DEFAULT_TAIL_WINDOW_TOKENS}). */
  readonly tailWindowTokens?: number;
  /** When true, strip anomalous suffix; when false, flag only (default true). */
  readonly stripAnomaly?: boolean;
}

export interface EntropyCheckResult {
  /** Input text, with adversarial tail removed when stripAnomaly and anomaly detected. */
  readonly text: string;
  /** Length-normalized Shannon entropy of the tail window (0–1). */
  readonly entropy_score: number;
  /** Combined tail-minus-prefix anomaly delta (entropy + gibberish blend). */
  readonly tail_delta: number;
  /** Whether an anomalous high-entropy suffix was detected. */
  readonly anomaly_detected: boolean;
  /** Characters removed from the tail when stripping (0 when not stripped). */
  readonly tail_stripped_length: number;
}

// ─── Tokenization ──────────────────────────────────────────────────────────────

/**
 * Deterministic whitespace tokenization for triage entropy.
 * Splits on runs of whitespace; empty segments discarded.
 */
export function tokenizeForEntropy(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

// ─── Entropy math ──────────────────────────────────────────────────────────────

/**
 * Shannon entropy in bits for token frequency distribution.
 * Returns 0 for empty input.
 */
export function shannonEntropyBits(tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const n = tokens.length;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / n;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Length-normalized entropy: H / log2(n), capped at 1.
 * Maps maximum-diversity tails (all unique tokens) to ~1.0.
 */
export function normalizedTokenEntropy(tokens: readonly string[]): number {
  const n = tokens.length;
  if (n <= 1) return 0;

  const raw = shannonEntropyBits(tokens);
  const maxEntropy = Math.log2(n);
  if (maxEntropy <= 0) return 0;

  return Math.min(1, raw / maxEntropy);
}

const COMMON_SHORT_TOKENS = new Set(['a', 'i', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we']);

/**
 * Heuristic gibberish token ratio — digits, symbol-only tokens, or very short non-words.
 * R2A/GCG suffixes score high; natural-language tails score low.
 */
export function gibberishTokenRatio(tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;

  let gibberish = 0;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (/\d/.test(token)) {
      gibberish++;
    } else if (/^[^\p{L}]+$/u.test(token)) {
      gibberish++;
    } else if (token.length <= 2 && !COMMON_SHORT_TOKENS.has(lower)) {
      gibberish++;
    }
  }

  return gibberish / tokens.length;
}

/**
 * Combined segment anomaly score blending token entropy and gibberish ratio.
 */
export function segmentAnomalyScore(tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;
  return normalizedTokenEntropy(tokens) * 0.5 + gibberishTokenRatio(tokens) * 0.5;
}

// ─── Tail analysis ─────────────────────────────────────────────────────────────

function sliceTailTokens(tokens: readonly string[], windowSize: number): string[] {
  if (tokens.length === 0) return [];

  const maxTail = tokens.length - MIN_PREFIX_TOKENS;
  if (maxTail < MIN_TAIL_TOKENS) return [];

  const tailSize = Math.min(windowSize, maxTail);
  return tokens.slice(tokens.length - tailSize);
}

function slicePrefixTokens(
  tokens: readonly string[],
  tailTokens: readonly string[],
): string[] {
  if (tailTokens.length === 0) return tokens.slice();
  return tokens.slice(0, tokens.length - tailTokens.length);
}

function findTailStripIndex(text: string, stripTokenCount: number): number {
  if (stripTokenCount <= 0) return text.length;

  let remaining = stripTokenCount;
  let i = text.length;

  while (i > 0 && remaining > 0) {
    while (i > 0 && /\s/.test(text[i - 1]!)) i--;
    if (i === 0) break;

    while (i > 0 && !/\s/.test(text[i - 1]!)) i--;
    remaining--;
  }

  while (i > 0 && /\s/.test(text[i - 1]!)) i--;

  return i;
}

/**
 * Analyze prompt tail entropy and optionally strip adversarial suffixes.
 */
export function checkEntropyTail(
  text: string,
  options: EntropyCheckOptions = {},
): EntropyCheckResult {
  const tailWindow = options.tailWindowTokens ?? DEFAULT_TAIL_WINDOW_TOKENS;
  const stripAnomaly = options.stripAnomaly ?? true;

  const tokens = tokenizeForEntropy(text);

  if (tokens.length < MIN_PROMPT_TOKENS) {
    return {
      text,
      entropy_score: 0,
      tail_delta: 0,
      anomaly_detected: false,
      tail_stripped_length: 0,
    };
  }

  const tailTokens = sliceTailTokens(tokens, tailWindow);
  if (tailTokens.length < MIN_TAIL_TOKENS) {
    return {
      text,
      entropy_score: 0,
      tail_delta: 0,
      anomaly_detected: false,
      tail_stripped_length: 0,
    };
  }

  const prefixTokens = slicePrefixTokens(tokens, tailTokens);

  const tailEntropy = normalizedTokenEntropy(tailTokens);
  const tailScore = segmentAnomalyScore(tailTokens);
  const prefixScore = segmentAnomalyScore(prefixTokens);
  const tailDelta = tailScore - prefixScore;
  const tailGibberish = gibberishTokenRatio(tailTokens);

  const anomalyDetected =
    tailTokens.length >= MIN_TAIL_TOKENS &&
    tailDelta >= ENTROPY_DELTA_THRESHOLD &&
    tailScore >= ABSOLUTE_TAIL_ENTROPY_THRESHOLD &&
    tailGibberish >= GIBBERISH_TAIL_RATIO_THRESHOLD;

  if (!anomalyDetected || !stripAnomaly) {
    return {
      text,
      entropy_score: tailEntropy,
      tail_delta: tailDelta,
      anomaly_detected: anomalyDetected,
      tail_stripped_length: 0,
    };
  }

  const stripIndex = findTailStripIndex(text, tailTokens.length);
  const stripped = text.slice(0, stripIndex).trimEnd();

  return {
    text: stripped,
    entropy_score: tailEntropy,
    tail_delta: tailDelta,
    anomaly_detected: true,
    tail_stripped_length: text.length - stripped.length,
  };
}
