/**
 * Triage engine — FR-003, FR-004, US2.
 *
 * Deterministic fast-path classifier: obvious-trivial → economical tier,
 * obvious-complex → frontier tier, otherwise ambiguous for deeper stages.
 *
 * Pipeline: sanitize (T026, FR-004) → entropy tail check (SP-154) →
 *           Aho-Corasick keyword scan (T025) → cyclomatic scan (T025b) → verdict.
 */

import { checkEntropyTail } from './entropy-check.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export type TriageVerdict = 'trivial' | 'complex' | 'ambiguous';

export interface TriageResult {
  readonly verdict: TriageVerdict;
  readonly reason_code: string;
  readonly trivial_hits: number;
  readonly complex_hits: number;
  readonly cyclomatic_score: number;
  readonly sanitized_length_delta: number;
  /** Length-normalized Shannon entropy of the analyzed tail window (0–1). */
  readonly entropy_score: number;
  /** Tail entropy minus prefix entropy; large positive values indicate adversarial suffixes. */
  readonly entropy_tail_delta: number;
  /** Characters removed by entropy tail stripping (0 when none). */
  readonly entropy_tail_stripped_length: number;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const CYCLOMATIC_THRESHOLD = 15;

// ─── Adversarial Sanitization (T026, FR-004) ──────────────────────────────────

const RE_BASE64_BLOCK = /[A-Za-z0-9+/=]{64,}/g;
const RE_HEX_BLOCK = /(?:0x)?[0-9a-fA-F]{32,}/g;
const RE_HTML_TAGS = /<\/?[a-z][^>]*>/gi;
const RE_HTML_COMMENT = /<!--[\s\S]*?-->/g;
const RE_URL_ENCODED = /%[0-9A-Fa-f]{2}/g;
const RE_REPEATED_CHARS = /(.)\1{4,}/g;
const RE_MULTI_HSPACE = /[^\S\r\n]{2,}/g;
const RE_MULTI_NEWLINE = /\n{3,}/g;

/**
 * Strip adversarial complexity-inflation patterns from prompt text (FR-004).
 *
 * Removes base64 blocks, long hex runs, HTML/XML markup, URL-encoded sequences,
 * and excessive character repetition. Preserves newlines and indentation so code
 * blocks remain extractable by the cyclomatic scanner.
 */
export function sanitize(raw: string): string {
  let text = raw;
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(RE_BASE64_BLOCK, ' ');
  text = text.replace(RE_HEX_BLOCK, ' ');
  text = text.replace(RE_HTML_COMMENT, ' ');
  text = text.replace(RE_HTML_TAGS, ' ');
  text = text.replace(RE_URL_ENCODED, '');
  text = text.replace(RE_REPEATED_CHARS, '$1$1');
  text = text.replace(RE_MULTI_HSPACE, ' ');
  text = text.replace(RE_MULTI_NEWLINE, '\n\n');
  return text.trim();
}

// ─── Aho-Corasick Multi-Pattern Matcher (T025) ───────────────────────────────

type KeywordSet = 'trivial' | 'complex';

interface PatternMeta {
  readonly length: number;
  readonly set: KeywordSet;
}

interface AhoState {
  children: Map<string, number>;
  fail: number;
  outputs: PatternMeta[];
}

function isWordChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

/**
 * Aho-Corasick automaton for simultaneous multi-pattern matching.
 *
 * Builds a trie with failure links for O(n + m + z) scanning where n is text
 * length, m is total pattern length, and z is the number of matches. Word-boundary
 * checks prevent substring false positives (e.g. "format" in "information").
 */
class AhoCorasick {
  private readonly states: AhoState[];

  constructor(patterns: ReadonlyArray<{ text: string; set: KeywordSet }>) {
    this.states = [{ children: new Map(), fail: 0, outputs: [] }];
    this.buildGoto(patterns);
    this.buildFailure();
  }

  private buildGoto(patterns: ReadonlyArray<{ text: string; set: KeywordSet }>): void {
    for (const { text, set } of patterns) {
      let current = 0;
      const lower = text.toLowerCase();
      for (const ch of lower) {
        const state = this.states[current]!;
        let next = state.children.get(ch);
        if (next === undefined) {
          next = this.states.length;
          this.states.push({ children: new Map(), fail: 0, outputs: [] });
          state.children.set(ch, next);
        }
        current = next;
      }
      this.states[current]!.outputs.push({ length: lower.length, set });
    }
  }

  private buildFailure(): void {
    const queue: number[] = [];
    const root = this.states[0]!;

    for (const [, child] of root.children) {
      this.states[child]!.fail = 0;
      queue.push(child);
    }

    let head = 0;
    while (head < queue.length) {
      const r = queue[head++]!;
      const rState = this.states[r]!;

      for (const [ch, s] of rState.children) {
        queue.push(s);
        let f = rState.fail;
        while (f !== 0 && !this.states[f]!.children.has(ch)) {
          f = this.states[f]!.fail;
        }
        const target = this.states[f]!.children.get(ch);
        const failTarget = target !== undefined && target !== s ? target : 0;
        this.states[s]!.fail = failTarget;

        const failOutputs = this.states[failTarget]!.outputs;
        if (failOutputs.length > 0) {
          this.states[s]!.outputs = [...this.states[s]!.outputs, ...failOutputs];
        }
      }
    }
  }

  /**
   * Scan text and return unique keyword hits per set.
   * Word boundaries prevent substring false positives.
   */
  search(text: string): { trivialHits: number; complexHits: number } {
    const lower = text.toLowerCase();
    let current = 0;
    let trivialHits = 0;
    let complexHits = 0;
    const seen = new Set<string>();

    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i]!;
      while (current !== 0 && !this.states[current]!.children.has(ch)) {
        current = this.states[current]!.fail;
      }
      current = this.states[current]!.children.get(ch) ?? 0;

      for (const entry of this.states[current]!.outputs) {
        const start = i - entry.length + 1;

        if (start > 0 && isWordChar(lower[start - 1]!)) continue;
        if (i < lower.length - 1 && isWordChar(lower[i + 1]!)) continue;

        const key = `${start}:${entry.length}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (entry.set === 'trivial') trivialHits++;
        else complexHits++;
      }
    }

    return { trivialHits, complexHits };
  }
}

// ─── Keyword Dictionaries ─────────────────────────────────────────────────────

export const TRIVIAL_KEYWORDS: readonly string[] = [
  'format',
  'formatting',
  'lint',
  'linting',
  'rename',
  'indent',
  'indentation',
  'prettier',
  'eslint',
  'semicolon',
  'whitespace',
  'spacing',
  'typo',
  'boilerplate',
  'template',
  'uncomment',
  'sort imports',
  'fix import',
  'fix imports',
  'add export',
  'remove unused',
  'unused import',
  'unused variable',
  'fix spacing',
  'fix whitespace',
  'simple test',
  'move file',
];

export const COMPLEX_KEYWORDS: readonly string[] = [
  'architect',
  'architecture',
  'refactor',
  'refactoring',
  'debug',
  'debugging',
  'distributed',
  'microservice',
  'microservices',
  'concurrency',
  'concurrent',
  'deadlock',
  'race condition',
  'migration',
  'migrate',
  'scalability',
  'infrastructure',
  'optimize',
  'optimization',
  'performance tuning',
  'security audit',
  'vulnerability',
  'exploit',
  'algorithm',
  'algorithmic',
  'system design',
  'design pattern',
  'design patterns',
  'memory leak',
  'memory management',
  'state machine',
  'error handling strategy',
  'api design',
  'schema design',
  // Repo-hygiene / destructive-intent (SP-176, #97) — never zero-tier on turn 1
  'clean up the repo',
  'cleanup the repo',
  'repo cleanup',
  'clean up',
  'cleanup',
  'mistakenly added',
  'accidentally added',
  'accidental add',
  'unstage',
  'git rm',
  'rm -rf',
  'force push',
  'git reset --hard',
  'destructive',
];

/** Module-level singleton — built once at import time. */
const MATCHER = new AhoCorasick([
  ...TRIVIAL_KEYWORDS.map((text) => ({ text, set: 'trivial' as const })),
  ...COMPLEX_KEYWORDS.map((text) => ({ text, set: 'complex' as const })),
]);

// ─── AST Cyclomatic Scan (T025b) ─────────────────────────────────────────────

const RE_CODE_FENCE = /```[\w]*\n([\s\S]*?)```/g;
const RE_INDENTED_BLOCK = /(?:^|\n)((?:(?: {4}|\t).+(?:\n|$))+)/g;

function extractCode(text: string): string {
  const blocks: string[] = [];

  let m: RegExpExecArray | null;
  const fenceRe = new RegExp(RE_CODE_FENCE.source, RE_CODE_FENCE.flags);
  while ((m = fenceRe.exec(text)) !== null) {
    if (m[1]) blocks.push(m[1]);
  }

  if (blocks.length === 0) {
    const indentRe = new RegExp(RE_INDENTED_BLOCK.source, RE_INDENTED_BLOCK.flags);
    while ((m = indentRe.exec(text)) !== null) {
      if (m[1]) blocks.push(m[1]);
    }
  }

  return blocks.join('\n');
}

const DECISION_PATTERNS: readonly RegExp[] = [
  /\bif\b/g,
  /\belif\b/g,
  /\bfor\b/g,
  /\bwhile\b/g,
  /\bcase\b/g,
  /\bcatch\b/g,
  /&&/g,
  /\|\|/g,
  /\?\?/g,
];

/**
 * Estimate cyclomatic complexity of code embedded in the prompt.
 * Extracts fenced or indented code blocks and counts decision points.
 * Returns 1 (baseline) when no code is detected.
 */
export function cyclomaticScan(text: string): number {
  const code = extractCode(text);
  if (code.length === 0) return 1;

  let score = 1;
  for (const pattern of DECISION_PATTERNS) {
    const matches = code.match(new RegExp(pattern.source, 'g'));
    if (matches) score += matches.length;
  }
  return score;
}

// ─── Triage Entry Point ──────────────────────────────────────────────────────

/**
 * Classify a prompt as trivial, complex, or ambiguous for fast-path routing.
 *
 * Deterministic and synchronous — runs in the triage pipeline stage (FR-003).
 * Sanitizes adversarial content before scoring (FR-004).
 * Strips high-entropy tail suffixes after sanitization (SP-154, #82).
 *
 * False-positive mitigation for entropy stripping:
 * - Requires both relative tail-vs-prefix delta AND absolute tail entropy threshold
 * - Skips enforcement on short prompts and tails below MIN_TAIL_TOKENS
 * - Prefix comparison preserves classification when entire prompt is uniformly high-entropy (e.g. code)
 */
export function triage(promptText: string): TriageResult {
  if (!promptText || promptText.trim().length === 0) {
    return {
      verdict: 'ambiguous',
      reason_code: 'empty_prompt',
      trivial_hits: 0,
      complex_hits: 0,
      cyclomatic_score: 0,
      sanitized_length_delta: 0,
      entropy_score: 0,
      entropy_tail_delta: 0,
      entropy_tail_stripped_length: 0,
    };
  }

  const sanitized = sanitize(promptText);
  const entropy = checkEntropyTail(sanitized);
  const scoredText = entropy.text;
  const delta = promptText.length - scoredText.length;

  if (!scoredText || scoredText.trim().length === 0) {
    return {
      verdict: 'ambiguous',
      reason_code: 'empty_prompt',
      trivial_hits: 0,
      complex_hits: 0,
      cyclomatic_score: 0,
      sanitized_length_delta: delta,
      entropy_score: entropy.entropy_score,
      entropy_tail_delta: entropy.tail_delta,
      entropy_tail_stripped_length: entropy.tail_stripped_length,
    };
  }

  const { trivialHits, complexHits } = MATCHER.search(scoredText);
  const cyclomatic = cyclomaticScan(scoredText);

  let verdict: TriageVerdict;
  let reason: string;

  if (cyclomatic >= CYCLOMATIC_THRESHOLD) {
    verdict = 'complex';
    reason = 'cyclomatic_high';
  } else if (complexHits > 0 && trivialHits === 0) {
    verdict = 'complex';
    reason = 'keyword_frontier';
  } else if (trivialHits > 0 && complexHits === 0) {
    verdict = 'trivial';
    reason = 'keyword_economical';
  } else if (complexHits > trivialHits) {
    verdict = 'complex';
    reason = 'keyword_frontier';
  } else if (trivialHits > complexHits) {
    verdict = 'trivial';
    reason = 'keyword_economical';
  } else {
    verdict = 'ambiguous';
    reason = 'no_fast_path';
  }

  return {
    verdict,
    reason_code: reason,
    trivial_hits: trivialHits,
    complex_hits: complexHits,
    cyclomatic_score: cyclomatic,
    sanitized_length_delta: delta,
    entropy_score: entropy.entropy_score,
    entropy_tail_delta: entropy.tail_delta,
    entropy_tail_stripped_length: entropy.tail_stripped_length,
  };
}
