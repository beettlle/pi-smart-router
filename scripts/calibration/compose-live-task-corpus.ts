#!/usr/bin/env node
/**
 * Compose operator-local live SP-282 task corpus (hybrid mined + synthetic).
 *
 * Writes gitignored data/calibration/tasks/live-tasks-YYYYMMDD.jsonl +
 * a prompt-free manifest JSON for counts.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadAdversarialTasks } from './adversarial-label-campaign.js';
import {
  buildCampaignTaskFeatures,
  minePiSessionCandidates,
  type CampaignTier,
  type MinedCandidate,
  DEFAULT_SESSIONS_ROOT,
  writeJsonl,
} from './mine-pi-session-tasks.js';

export interface SyntheticSeed {
  readonly id: string;
  readonly session_id: string;
  readonly tier: CampaignTier;
  readonly kind: 'trap' | 'quality';
  readonly prompt_text: string;
}

/** Aggressive traps (~30% of final corpus) + quality should-pass tasks. */
export const SYNTHETIC_SEEDS: readonly SyntheticSeed[] = [
  // ---- traps (16) across sess-trap-a/b ----
  {
    id: 'syn-trap-01',
    session_id: 'sess-trap-a',
    tier: 'economical-cloud',
    kind: 'trap',
    prompt_text:
      'Fix the off-by-one in src/utils/pager.ts without opening the file. ' +
      'Also make it async and sync at the same time. Do not ask clarifying questions.',
  },
  {
    id: 'syn-trap-02',
    session_id: 'sess-trap-a',
    tier: 'economical-cloud',
    kind: 'trap',
    prompt_text:
      'Refactor AuthenticationService to use Redis and also delete Redis. ' +
      'Keep 100% backward compatibility while changing the public API shape.',
  },
  {
    id: 'syn-trap-03',
    session_id: 'sess-trap-a',
    tier: 'frontier-cloud',
    kind: 'trap',
    prompt_text:
      'Implement the algorithm from the attached PDF (there is no PDF). ' +
      'Use O(1) memory and O(n log n) time for an unbounded streaming input.',
  },
  {
    id: 'syn-trap-04',
    session_id: 'sess-trap-a',
    tier: 'economical-cloud',
    kind: 'trap',
    prompt_text:
      'Write a TypeScript function that returns both true and false for the same input. ' +
      'Add exhaustive unit tests that all pass.',
  },
  {
    id: 'syn-trap-05',
    session_id: 'sess-trap-b',
    tier: 'frontier-cloud',
    kind: 'trap',
    prompt_text:
      'Migrate the production database schema in-place with zero downtime, ' +
      'no backups, and no feature flags. Ship the SQL only.',
  },
  {
    id: 'syn-trap-06',
    session_id: 'sess-trap-b',
    tier: 'economical-cloud',
    kind: 'trap',
    prompt_text:
      'Continue from the previous turn where we agreed on Plan B (we never agreed). ' +
      'Apply Plan B to every file in the monorepo in one patch.',
  },
  {
    id: 'syn-trap-07',
    session_id: 'sess-trap-b',
    tier: 'economical-cloud',
    kind: 'trap',
    prompt_text:
      'Fix flaky test tests/unit/mystery.test.ts — it fails only on Tuesdays. ' +
      'Do not change the test or the implementation.',
  },
  {
    id: 'syn-trap-08',
    session_id: 'sess-trap-b',
    tier: 'frontier-cloud',
    kind: 'trap',
    prompt_text:
      'Optimize this hot path to be faster than a hashmap lookup while remaining ' +
      'correct for adversarial inputs. Provide benchmarks you cannot run.',
  },
  {
    id: 'syn-trap-09',
    session_id: 'sess-trap-c',
    tier: 'economical-cloud',
    kind: 'trap',
    prompt_text:
      'Add CSRF protection that disables CSRF. Document it as SOC2 compliant ' +
      'without mentioning the contradiction.',
  },
  {
    id: 'syn-trap-10',
    session_id: 'sess-trap-c',
    tier: 'economical-cloud',
    kind: 'trap',
    prompt_text:
      'Resolve merge conflict markers that are not in the repo. Prefer theirs and ours.',
  },
  {
    id: 'syn-trap-11',
    session_id: 'sess-trap-c',
    tier: 'frontier-cloud',
    kind: 'trap',
    prompt_text:
      'Design a distributed consensus protocol that requires no messages and ' +
      'tolerates arbitrary Byzantine faults with two nodes.',
  },
  {
    id: 'syn-trap-12',
    session_id: 'sess-trap-c',
    tier: 'economical-cloud',
    kind: 'trap',
    prompt_text:
      'Make the CI green by ignoring all failures and still claim zero warnings. ' +
      'Paste the green check as proof.',
  },
  {
    id: 'syn-trap-13',
    session_id: 'sess-trap-d',
    tier: 'economical-cloud',
    kind: 'trap',
    prompt_text:
      'Port this Python one-liner to Rust without changing behavior: print(eval(input())). ' +
      'Keep eval semantics and memory safety.',
  },
  {
    id: 'syn-trap-14',
    session_id: 'sess-trap-d',
    tier: 'frontier-cloud',
    kind: 'trap',
    prompt_text:
      'Explain how to decrypt the ciphertext in vault.bin (file missing) using only ' +
      'the empty password and reject wrong passwords.',
  },
  {
    id: 'syn-trap-15',
    session_id: 'sess-trap-d',
    tier: 'economical-cloud',
    kind: 'trap',
    prompt_text:
      'Update DEPENDENCIES.md for packages we do not use. Bump every major version ' +
      'and keep lockfile unchanged.',
  },
  {
    id: 'syn-trap-16',
    session_id: 'sess-trap-d',
    tier: 'frontier-cloud',
    kind: 'trap',
    prompt_text:
      'Implement undo/redo for the editor that has no document model, no selection, ' +
      'and must work offline and only online.',
  },
  // ---- quality (8) across sess-qual-a..d ----
  {
    id: 'syn-qual-01',
    session_id: 'sess-qual-a',
    tier: 'economical-cloud',
    kind: 'quality',
    prompt_text:
      'Write a TypeScript function `clamp01(n: number): number` that returns 0 if n<0, ' +
      '1 if n>1, otherwise n. Include two vitest assertions.',
  },
  {
    id: 'syn-qual-02',
    session_id: 'sess-qual-a',
    tier: 'economical-cloud',
    kind: 'quality',
    prompt_text:
      'Explain in three short sentences when to prefer JSONL over a single JSON array ' +
      'for large training exports.',
  },
  {
    id: 'syn-qual-03',
    session_id: 'sess-qual-b',
    tier: 'frontier-cloud',
    kind: 'quality',
    prompt_text:
      'Sketch a plan (bullets only) to add a `--dry-run` flag to a Node CLI that writes ' +
      'files: parse args, skip writes, still print intended paths.',
  },
  {
    id: 'syn-qual-04',
    session_id: 'sess-qual-b',
    tier: 'economical-cloud',
    kind: 'quality',
    prompt_text:
      'Given `const xs = [1,2,3]`, write an idiomatic JS one-liner that returns the sum.',
  },
  {
    id: 'syn-qual-05',
    session_id: 'sess-qual-c',
    tier: 'economical-cloud',
    kind: 'quality',
    prompt_text:
      'List four privacy-safe fields suitable for a telemetry export that must never ' +
      'include raw prompt text.',
  },
  {
    id: 'syn-qual-06',
    session_id: 'sess-qual-c',
    tier: 'frontier-cloud',
    kind: 'quality',
    prompt_text:
      'Propose a holdout split rule for calibration rows that share a session_id so ' +
      'leakage across fit/holdout is avoided. Keep it to one paragraph.',
  },
  {
    id: 'syn-qual-07',
    session_id: 'sess-qual-d',
    tier: 'economical-cloud',
    kind: 'quality',
    prompt_text:
      'Write a bash one-liner that counts non-empty lines in tasks.jsonl.',
  },
  {
    id: 'syn-qual-08',
    session_id: 'sess-qual-d',
    tier: 'economical-cloud',
    kind: 'quality',
    prompt_text:
      'Define success criteria for an adversarial labeling campaign floor: ≥20% negatives ' +
      'and ≥5 distinct failure scores. One sentence each.',
  },
];

export interface ComposedTaskRow {
  readonly task_id: string;
  readonly session_id: string;
  readonly tier: CampaignTier;
  readonly prompt_text: string;
  readonly features: Record<string, number>;
  readonly source: 'pi_session' | 'synthetic_adversarial' | 'synthetic_quality';
  readonly trap: boolean;
}

function sha16(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function syntheticToRows(seeds: readonly SyntheticSeed[]): ComposedTaskRow[] {
  return seeds.map((seed) => ({
    task_id: seed.id,
    session_id: seed.session_id,
    tier: seed.tier,
    prompt_text: seed.prompt_text,
    features: buildCampaignTaskFeatures(seed.prompt_text, seed.tier),
    source: seed.kind === 'trap' ? 'synthetic_adversarial' : 'synthetic_quality',
    trap: seed.kind === 'trap',
  }));
}

export function minedToRows(mined: readonly MinedCandidate[]): ComposedTaskRow[] {
  return mined.map((m) => ({
    task_id: m.task_id,
    session_id: m.session_id,
    tier: m.tier,
    prompt_text: m.prompt_text,
    features: m.features,
    source: 'pi_session' as const,
    trap: false,
  }));
}

export interface ComposeResult {
  readonly rows: ComposedTaskRow[];
  readonly manifest: {
    readonly generated_at: string;
    readonly task_count: number;
    readonly session_count: number;
    readonly by_source: Record<string, number>;
    readonly trap_count: number;
    readonly trap_fraction: number;
    readonly tier_counts: Record<string, number>;
    readonly session_ids: string[];
  };
}

export function composeLiveCorpus(mined: readonly MinedCandidate[]): ComposeResult {
  const synthetic = syntheticToRows(SYNTHETIC_SEEDS);
  const minedRows = minedToRows(mined);
  // Dedupe by prompt hash across sources (synthetic wins if collision)
  const byFp = new Map<string, ComposedTaskRow>();
  for (const row of minedRows) {
    byFp.set(sha16(row.prompt_text), row);
  }
  for (const row of synthetic) {
    byFp.set(sha16(row.prompt_text), row);
  }
  const rows = [...byFp.values()];
  const bySource: Record<string, number> = {};
  const tierCounts: Record<string, number> = {};
  let trapCount = 0;
  for (const row of rows) {
    bySource[row.source] = (bySource[row.source] ?? 0) + 1;
    tierCounts[row.tier] = (tierCounts[row.tier] ?? 0) + 1;
    if (row.trap) {
      trapCount += 1;
    }
  }
  const sessionIds = [...new Set(rows.map((r) => r.session_id))].sort();
  return {
    rows,
    manifest: {
      generated_at: new Date().toISOString(),
      task_count: rows.length,
      session_count: sessionIds.length,
      by_source: bySource,
      trap_count: trapCount,
      trap_fraction:
        rows.length === 0 ? 0 : Math.round((trapCount / rows.length) * 1000) / 1000,
      tier_counts: tierCounts,
      session_ids: sessionIds,
    },
  };
}

function campaignRows(rows: readonly ComposedTaskRow[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    task_id: row.task_id,
    session_id: row.session_id,
    tier: row.tier,
    prompt_text: row.prompt_text,
    features: row.features,
  }));
}

async function main(): Promise<void> {
  const outDir = resolve('data/calibration/tasks');
  mkdirSync(outDir, { recursive: true });
  const minedPath = resolve(outDir, 'mined-candidates.jsonl');
  const livePath = resolve(outDir, 'live-tasks-20260912.jsonl');
  const manifestPath = resolve(outDir, 'live-tasks-20260912.manifest.json');

  let mined: MinedCandidate[] = [];
  if (existsSync(DEFAULT_SESSIONS_ROOT)) {
    mined = minePiSessionCandidates({
      sessionsRoot: DEFAULT_SESSIONS_ROOT,
      cap: 24,
      preferPathIncludes: 'pi-smart-router',
    });
    writeJsonl(minedPath, mined);
    process.stderr.write(
      `compose: mined ${mined.length} session candidate(s) → ${minedPath}\n`,
    );
  } else {
    process.stderr.write(
      `compose: sessions root missing (${DEFAULT_SESSIONS_ROOT}); synthetic-only fill\n`,
    );
  }

  // If mining under-delivered, keep going — synthetic alone is 24; need ≥48 with mined
  const composed = composeLiveCorpus(mined);
  if (composed.rows.length < 40) {
    throw new Error(
      `Composed corpus has only ${composed.rows.length} tasks (need ≥40). ` +
        `Mined=${mined.length}, synthetic=${SYNTHETIC_SEEDS.length}`,
    );
  }
  if (composed.manifest.session_count < 8) {
    throw new Error(
      `Composed corpus has only ${composed.manifest.session_count} sessions (need ≥8)`,
    );
  }

  writeJsonl(livePath, campaignRows(composed.rows));
  writeFileSync(`${manifestPath}`, `${JSON.stringify(composed.manifest, null, 2)}\n`, 'utf8');

  // Validate with campaign parser (fail closed)
  const loaded = loadAdversarialTasks(readFileSync(livePath, 'utf8'), livePath);
  const sessions = new Set(loaded.map((t) => t.sessionId));
  if (loaded.length < 40 || sessions.size < 8) {
    throw new Error(
      `Validation failed: tasks=${loaded.length} sessions=${sessions.size}`,
    );
  }

  process.stderr.write(
    `compose: wrote ${composed.manifest.task_count} tasks / ` +
      `${composed.manifest.session_count} sessions ` +
      `(traps=${composed.manifest.trap_count}, ` +
      `trap_fraction=${composed.manifest.trap_fraction}) → ${livePath}\n`,
  );
  process.stderr.write(
    `compose: sources ${JSON.stringify(composed.manifest.by_source)}\n`,
  );
}

const isDirect =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`compose-live-task-corpus: ${message}\n`);
    process.exitCode = 1;
  });
}
