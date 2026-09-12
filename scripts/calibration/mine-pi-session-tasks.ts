#!/usr/bin/env node
/**
 * Mine pi session user turns into privacy-scrubbed campaign task candidates.
 *
 * Operator-local only — outputs under data/calibration/tasks/ (gitignored).
 * Never invents labels; never writes pack rows.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { P_SUCCESS_FEATURE_NAMES } from '../../src/domain/routing/p-success-classifier.js';
import { collectLabelPackForbiddenKeys } from '../lib/label-pack-schema.js';

export const DEFAULT_SESSIONS_ROOT = join(homedir(), '.pi', 'agent', 'sessions');
export const DEFAULT_MINED_CAP = 24;
export const MIN_PROMPT_CHARS = 40;
export const MAX_PROMPT_CHARS = 2000;

export type CampaignTier = 'economical-cloud' | 'frontier-cloud';

export interface MinedCandidate {
  readonly task_id: string;
  readonly session_id: string;
  readonly prompt_text: string;
  readonly tier: CampaignTier;
  readonly features: Record<string, number>;
  readonly source: 'pi_session';
  readonly prompt_fingerprint: string;
  readonly origin_session_file?: string;
}

export class MinePiSessionError extends Error {
  override readonly name = 'MinePiSessionError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Redact secrets and absolute home paths; truncate long prompts. */
export function redactPromptText(raw: string): string {
  let text = raw;
  // Absolute macOS/Linux home paths
  text = text.replace(/\/Users\/[^/\s]+/g, '$HOME');
  text = text.replace(/\/home\/[^/\s]+/g, '$HOME');
  // Bearer / API key-ish tokens
  text = text.replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  text = text.replace(
    /\b(sk|sk-proj|or|ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]{8,}\b/g,
    '[REDACTED_TOKEN]',
  );
  text = text.replace(
    /\b(api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[^\s'"]+/gi,
    '$1=[REDACTED]',
  );
  if (text.length > MAX_PROMPT_CHARS) {
    text = `${text.slice(0, MAX_PROMPT_CHARS)}\n…[truncated]`;
  }
  return text.trim();
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  const parts: string[] = [];
  for (const part of content) {
    if (!isPlainObject(part)) {
      continue;
    }
    if (part.type === 'text' && typeof part.text === 'string') {
      parts.push(part.text);
    }
  }
  return parts.join('\n').trim();
}

/** Build P(success) feature map from prompt heuristics + intended tier. */
export function buildCampaignTaskFeatures(
  promptText: string,
  tier: CampaignTier,
): Record<string, number> {
  const length = promptText.length;
  const lower = promptText.toLowerCase();
  const hasTool =
    /\b(tool|bash|grep|file|read|write|test|npm|git|sqlite|api)\b/i.test(promptText)
      ? 1
      : 0;
  const codeish =
    /```|function |class |import |export |const |interface /.test(promptText) ? 1 : 0;
  const planning =
    /\b(plan|design|architect|tradeoff|roadmap|decompose)\b/i.test(promptText) ? 1 : 0;
  const complexHits =
    (lower.match(/\b(and|then|also|must|should|without|except)\b/g) ?? []).length;
  const cyclomatic = clamp01(0.15 + complexHits * 0.05 + codeish * 0.2);

  const features: Record<string, number> = {
    prompt_length_norm: clamp01(length / 4000),
    estimated_input_tokens_norm: clamp01(length / 4 / 4000),
    triage_cyclomatic_score: cyclomatic,
    requirement_reasoning: clamp01(0.25 + planning * 0.35 + cyclomatic * 0.2),
    requirement_code_gen: clamp01(0.2 + codeish * 0.45 + hasTool * 0.1),
    requirement_tool_use: clamp01(hasTool * 0.7 + codeish * 0.15),
    has_tool_context: hasTool,
    compaction_flag: 0,
    routing_latency_norm: 0.1,
    economical_tier: tier === 'economical-cloud' ? 1 : 0,
  };

  for (const name of P_SUCCESS_FEATURE_NAMES) {
    if (!(name in features)) {
      throw new MinePiSessionError(`Missing feature ${name}`);
    }
  }
  const forbidden = collectLabelPackForbiddenKeys({ features });
  if (forbidden.length > 0) {
    throw new MinePiSessionError(`Tainted feature keys: ${forbidden.join(', ')}`);
  }
  return features;
}

function listJsonlFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const path = join(dir, name);
      let st;
      try {
        st = statSync(path);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(path);
      } else if (name.endsWith('.jsonl')) {
        out.push(path);
      }
    }
  };
  walk(root);
  return out;
}

function sessionBucketId(sessionFile: string): string {
  // Prefer parent folder name (project cwd slug) + file stem hash
  const parent = basename(resolve(sessionFile, '..'));
  const stem = basename(sessionFile, '.jsonl');
  return `sess-${sha256Hex(`${parent}:${stem}`).slice(0, 10)}`;
}

export interface MineOptions {
  readonly sessionsRoot: string;
  readonly cap: number;
  /** Prefer files whose path contains this substring (e.g. pi-smart-router). */
  readonly preferPathIncludes?: string;
}

export function minePiSessionCandidates(options: MineOptions): MinedCandidate[] {
  const files = listJsonlFiles(options.sessionsRoot);
  if (files.length === 0) {
    throw new MinePiSessionError(`No session JSONL under ${options.sessionsRoot}`);
  }

  const scored = files
    .map((path) => {
      let mtime = 0;
      try {
        mtime = statSync(path).mtimeMs;
      } catch {
        mtime = 0;
      }
      const prefer =
        options.preferPathIncludes !== undefined &&
        path.includes(options.preferPathIncludes)
          ? 1
          : 0;
      return { path, mtime, prefer };
    })
    .sort((a, b) => b.prefer - a.prefer || b.mtime - a.mtime);

  const seenFingerprints = new Set<string>();
  const bySession = new Map<string, MinedCandidate[]>();
  const maxPerSession = 4;

  for (const { path } of scored) {
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    const sessionId = sessionBucketId(path);
    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line.length === 0) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isPlainObject(parsed) || parsed.type !== 'message') {
        continue;
      }
      const message = parsed.message;
      if (!isPlainObject(message) || message.role !== 'user') {
        continue;
      }
      const extracted = extractTextFromContent(message.content);
      if (extracted.length < MIN_PROMPT_CHARS) {
        continue;
      }
      // Skip obvious slash-commands / noise
      if (/^\/(model|login|settings|new|quit|help)\b/i.test(extracted.trim())) {
        continue;
      }
      const promptText = redactPromptText(extracted);
      if (promptText.length < MIN_PROMPT_CHARS) {
        continue;
      }
      const fingerprint = sha256Hex(promptText).slice(0, 16);
      if (seenFingerprints.has(fingerprint)) {
        continue;
      }
      const bucket = bySession.get(sessionId) ?? [];
      if (bucket.length >= maxPerSession) {
        continue;
      }
      const tier: CampaignTier =
        bucket.length % 3 === 2 ? 'frontier-cloud' : 'economical-cloud';
      const candidate: MinedCandidate = {
        task_id: `mine-${fingerprint}`,
        session_id: sessionId,
        prompt_text: promptText,
        tier,
        features: buildCampaignTaskFeatures(promptText, tier),
        source: 'pi_session',
        prompt_fingerprint: fingerprint,
        origin_session_file: path.replace(homedir(), '$HOME'),
      };
      seenFingerprints.add(fingerprint);
      bucket.push(candidate);
      bySession.set(sessionId, bucket);
    }
  }

  // Prefer sessions with multiple turns, then fill to cap
  const multi = [...bySession.values()]
    .filter((rows) => rows.length >= 2)
    .flat();
  const singles = [...bySession.values()]
    .filter((rows) => rows.length === 1)
    .flat();
  const ordered = [...multi, ...singles];
  return ordered.slice(0, options.cap);
}

function parseArgs(argv: readonly string[]): {
  sessionsRoot: string;
  output: string;
  cap: number;
  prefer: string;
} {
  let sessionsRoot = DEFAULT_SESSIONS_ROOT;
  let output = 'data/calibration/tasks/mined-candidates.jsonl';
  let cap = DEFAULT_MINED_CAP;
  let prefer = 'pi-smart-router';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) {
        throw new MinePiSessionError(`Missing value after ${arg}`);
      }
      return v;
    };
    if (arg === '--sessions-root') {
      sessionsRoot = next();
    } else if (arg === '--output') {
      output = next();
    } else if (arg === '--cap') {
      cap = Number(next());
      if (!Number.isInteger(cap) || cap < 1) {
        throw new MinePiSessionError('--cap must be a positive integer');
      }
    } else if (arg === '--prefer') {
      prefer = next();
    } else if (arg === '--help' || arg === '-h') {
      process.stderr.write(
        'Usage: npx tsx scripts/calibration/mine-pi-session-tasks.ts ' +
          '[--sessions-root DIR] [--output PATH] [--cap N] [--prefer SUBSTR]\n',
      );
      process.exit(0);
    } else {
      throw new MinePiSessionError(`Unknown argument: ${arg}`);
    }
  }
  return { sessionsRoot, output, cap, prefer };
}

export function writeJsonl(path: string, rows: readonly unknown[]): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  const body =
    rows.length === 0 ? '' : `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  writeFileSync(path, body, 'utf8');
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  if (!existsSync(args.sessionsRoot)) {
    throw new MinePiSessionError(`Sessions root not found: ${args.sessionsRoot}`);
  }
  const candidates = minePiSessionCandidates({
    sessionsRoot: args.sessionsRoot,
    cap: args.cap,
    preferPathIncludes: args.prefer,
  });
  writeJsonl(args.output, candidates);
  const sessions = new Set(candidates.map((c) => c.session_id));
  process.stderr.write(
    `mine-pi-session-tasks: wrote ${candidates.length} candidate(s) ` +
      `across ${sessions.size} session(s) → ${args.output}\n`,
  );
}

const isDirect =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mine-pi-session-tasks: ${message}\n`);
    process.exitCode = 1;
  });
}
