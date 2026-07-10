#!/usr/bin/env node
/**
 * Benchmark capability profile ingest — SP-134 / SP-179, GitHub #75 / #100.
 *
 * Modes:
 * 1. Fixtures (default, CI-safe) — checked-in leaderboard snapshots, no network.
 * 2. Live + record — per-benchmark live adapter → recorded → checked-in fixtures,
 *    write assembled snapshots, then ingest (one live failure does not block siblings).
 * 3. Recorded replay — ingest from recorded live snapshots offline (CI/unit path).
 *
 * Fixture layout: `tests/fixtures/benchmark-leaderboards/<benchmark>.json`
 * Recorded layout: `tests/fixtures/benchmark-leaderboards/recorded/<benchmark>.json`
 * Output artifact: versioned JSON with provenance + model capability rows.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import {
  AST_VALIDATION_FALSE_NEGATIVE_NOTE,
  validateToolCallAst,
  type ToolCallValidationReasonCode,
} from './lib/ast-tool-validation.js';

/** Type-only imports from live-fetch module (runtime load is dynamic to avoid cycles). */
import type {
  LeaderboardFetchFn,
  LiveLeaderboardFetchOptions,
} from './lib/benchmark-leaderboard-fetch.js';

export const BENCHMARK_PROFILES_VERSION = 1 as const;

export const BENCHMARK_IDS = [
  'swebench_verified',
  'terminal_bench',
  'livecodebench',
  'bfcl',
] as const;

export type BenchmarkId = (typeof BENCHMARK_IDS)[number];

/** Benchmarks whose rows may carry representative tool-call snippets (SP-135). */
export const TOOL_USE_BENCHMARK_IDS = ['terminal_bench', 'bfcl'] as const satisfies readonly BenchmarkId[];

export type ToolUseBenchmarkId = (typeof TOOL_USE_BENCHMARK_IDS)[number];

export const DEFAULT_BENCHMARK_FIXTURES_DIR = resolve(
  'tests',
  'fixtures',
  'benchmark-leaderboards',
);
/** Recorded live snapshots (SP-179); sibling of checked-in fixtures. */
export const DEFAULT_RECORDED_LEADERBOARDS_DIR = resolve(
  'tests',
  'fixtures',
  'benchmark-leaderboards',
  'recorded',
);
export const DEFAULT_BENCHMARK_PROFILES_PATH = resolve('config', 'benchmark-profiles.json');

/**
 * Human-facing provenance URLs (HTML docs / leaderboard pages).
 * Distinct from machine-readable live fetch endpoints on adapters (`liveFetchUrl`).
 * Artifact provenance and fixture `source_url` fields use these values.
 */
export const BENCHMARK_SOURCE_URLS: Readonly<Record<BenchmarkId, string>> = {
  swebench_verified: 'https://www.swebench.com/',
  terminal_bench: 'https://www.tbench.ai/leaderboard',
  livecodebench: 'https://livecodebench.github.io/leaderboard.html',
  bfcl: 'https://gorilla.cs.berkeley.edu/leaderboard.html',
};

/**
 * Default live fetch URL overrides are empty while stub adapters are in use
 * (SP-181). Native adapters (SP-182–SP-185) set `liveFetchUrl` on the registry;
 * operators may still pass `--live-url BENCHMARK=URL` for JSON mirrors.
 */
export const BENCHMARK_LIVE_FETCH_URLS: Readonly<Partial<Record<BenchmarkId, string>>> = {};

/**
 * HyDRA K=3 dimension weights per benchmark source.
 * Multiple benchmarks may contribute to the same dimension (averaged).
 */
export const BENCHMARK_CAPABILITY_WEIGHTS: Readonly<
  Record<BenchmarkId, Readonly<Partial<Record<CapabilityDimension, number>>>>
> = {
  swebench_verified: { reasoning: 1, code_gen: 0.5 },
  terminal_bench: { tool_use: 1, reasoning: 0.3 },
  livecodebench: { code_gen: 1 },
  bfcl: { tool_use: 1 },
};

export const CAPABILITY_DIMENSIONS = ['reasoning', 'code_gen', 'tool_use'] as const;
export type CapabilityDimension = (typeof CAPABILITY_DIMENSIONS)[number];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const leaderboardEntrySchema = z.object({
  model_id: z.string().min(1),
  score: z.number().finite(),
  tool_call_snippet: z.string().min(1).optional(),
});

const leaderboardFixtureSchema = z.object({
  benchmark: z.enum(BENCHMARK_IDS),
  source_url: z.string().url(),
  scrape_date: z.string().regex(ISO_DATE_PATTERN),
  entries: z.array(leaderboardEntrySchema).min(1),
});

const capabilitiesSchema = z.object({
  reasoning: z.number().min(0).max(1),
  code_gen: z.number().min(0).max(1),
  tool_use: z.number().min(0).max(1),
});

const benchmarkSourceSchema = z.object({
  raw_score: z.number().min(0).max(100),
  normalized: z.number().min(0).max(1),
});

const modelProfileSchema = z.object({
  model_id: z.string().min(1),
  capabilities: capabilitiesSchema,
  benchmark_sources: z
    .partialRecord(z.enum(BENCHMARK_IDS), benchmarkSourceSchema)
    .refine((sources) => Object.keys(sources).length > 0, {
      message: 'benchmark_sources must include at least one benchmark',
    }),
});

const provenanceSchema = z.object({
  source_urls: z.record(z.enum(BENCHMARK_IDS), z.string().url()),
  scrape_date: z.string().regex(ISO_DATE_PATTERN),
  catalog_freeze_date: z.string().regex(ISO_DATE_PATTERN),
});

/**
 * Scoped-fleet registry IDs → canonical ingest `model_id` (SP-174 / #94).
 * Prefer aliasing live pi/Cursor IDs onto grounded rows over inventing scores.
 * Operators may extend `aliases` in `config/benchmark-profiles.json`; re-ingest
 * preserves that map (see CLI). Seed defaults cover common dogfood fleet IDs.
 */
export const DEFAULT_FLEET_BENCHMARK_ALIASES: Readonly<Record<string, string>> = {
  // Anthropic — registry short / dated IDs → fixture rows
  'claude-opus-4': 'claude-opus-4-5',
  'claude-opus-4-20250514': 'claude-opus-4-5',
  'claude-sonnet-4': 'claude-sonnet-4-6',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-3.5-sonnet': 'claude-sonnet-4-6',
  'claude-3-5-sonnet': 'claude-sonnet-4-6',
  'claude-3.5-sonnet-latest': 'claude-sonnet-4-6',
  // OpenAI — frontier coding IDs → gpt-5.3-codex row
  'gpt-5.5': 'gpt-5.3-codex',
  'gpt-5.3': 'gpt-5.3-codex',
  'gpt-5': 'gpt-5.3-codex',
  'gpt-5-codex': 'gpt-5.3-codex',
  // Gemini — flash family variants → gemini-2.5-flash row
  'gemini-2.5-flash-preview': 'gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash',
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-flash-latest': 'gemini-2.5-flash',
  // Cursor / opaque fleet placeholders → strongest grounded coding row
  'cursor/auto': 'gpt-5.3-codex',
  'composer-latest': 'gpt-5.3-codex',
  'composer-1': 'gpt-5.3-codex',
  'cursor/composer-latest': 'gpt-5.3-codex',
  default: 'gpt-5.3-codex',
};

const fleetAliasesSchema = z.record(z.string().min(1), z.string().min(1));

const benchmarkProfilesArtifactSchema = z.object({
  version: z.literal(BENCHMARK_PROFILES_VERSION),
  provenance: provenanceSchema,
  /** Optional fleet-id → canonical model_id map (SP-174). */
  aliases: fleetAliasesSchema.optional(),
  models: z.array(modelProfileSchema).min(1),
});

export type BenchmarkLeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type BenchmarkLeaderboardFixture = z.infer<typeof leaderboardFixtureSchema>;
export type BenchmarkModelCapabilities = z.infer<typeof capabilitiesSchema>;
export type BenchmarkSourceScore = z.infer<typeof benchmarkSourceSchema>;
export type BenchmarkProfileRecord = z.infer<typeof modelProfileSchema>;
export type BenchmarkProfilesProvenance = z.infer<typeof provenanceSchema>;
export type BenchmarkProfilesArtifact = z.infer<typeof benchmarkProfilesArtifactSchema>;

export class BenchmarkIngestError extends Error {
  override readonly name = 'BenchmarkIngestError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export interface IngestBenchmarkProfilesOptions {
  readonly fixturesDir?: string;
  readonly catalogFreezeDate?: string;
  readonly scrapeDate?: string;
  /** Fleet-id aliases preserved across re-ingest (SP-174). */
  readonly aliases?: Readonly<Record<string, string>>;
  readonly onSkippedToolCallEntry?: (entry: SkippedToolCallEntry) => void;
}

export interface SkippedToolCallEntry {
  readonly benchmark: BenchmarkId;
  readonly model_id: string;
  readonly reasonCode: ToolCallValidationReasonCode;
  readonly detail?: string;
}

export function isToolUseBenchmark(benchmark: BenchmarkId): benchmark is ToolUseBenchmarkId {
  return (TOOL_USE_BENCHMARK_IDS as readonly BenchmarkId[]).includes(benchmark);
}

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new BenchmarkIngestError(`${label} must be YYYY-MM-DD, got: ${value}`);
  }
}

/** Normalize raw leaderboard score (0–100 or already 0–1) to [0, 1]. */
export function normalizeBenchmarkScore(rawScore: number): number {
  if (!Number.isFinite(rawScore)) {
    throw new BenchmarkIngestError(`Invalid benchmark score: ${String(rawScore)}`);
  }
  if (rawScore < 0) {
    throw new BenchmarkIngestError(`Benchmark score must be >= 0, got ${rawScore}`);
  }
  if (rawScore > 100) {
    throw new BenchmarkIngestError(`Benchmark score must be <= 100, got ${rawScore}`);
  }

  const normalized = rawScore > 1 ? rawScore / 100 : rawScore;
  return Math.min(1, Math.max(0, normalized));
}

export function parseBenchmarkLeaderboardFixture(
  text: string,
  sourceLabel: string,
): BenchmarkLeaderboardFixture {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new BenchmarkIngestError(`Invalid JSON in ${sourceLabel}`, { cause: err });
  }

  const result = leaderboardFixtureSchema.safeParse(parsed);
  if (!result.success) {
    throw new BenchmarkIngestError(
      `Invalid leaderboard fixture ${sourceLabel}: ${result.error.message}`,
    );
  }
  return result.data;
}

export function loadBenchmarkFixturesFromDir(fixturesDir: string): BenchmarkLeaderboardFixture[] {
  if (!existsSync(fixturesDir)) {
    throw new BenchmarkIngestError(`Fixture directory not found: ${fixturesDir}`);
  }

  const fixtures: BenchmarkLeaderboardFixture[] = [];
  const files = readdirSync(fixturesDir)
    .filter((name) => name.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    throw new BenchmarkIngestError(`No fixture JSON files in ${fixturesDir}`);
  }

  for (const file of files) {
    const text = readFileSync(join(fixturesDir, file), 'utf8');
    const fixture = parseBenchmarkLeaderboardFixture(text, join(fixturesDir, file));
    fixtures.push(fixture);
  }

  return fixtures;
}

interface MutableModelAccumulator {
  readonly benchmarkSources: Partial<Record<BenchmarkId, BenchmarkSourceScore>>;
  readonly dimensionScores: Record<CapabilityDimension, number[]>;
}

function createModelAccumulator(): MutableModelAccumulator {
  return {
    benchmarkSources: {},
    dimensionScores: {
      reasoning: [],
      code_gen: [],
      tool_use: [],
    },
  };
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    throw new BenchmarkIngestError('Cannot average empty score list');
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundCapability(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function aggregateBenchmarkProfiles(
  fixtures: readonly BenchmarkLeaderboardFixture[],
  options: IngestBenchmarkProfilesOptions = {},
): BenchmarkProfilesArtifact {
  const catalogFreezeDate = options.catalogFreezeDate ?? new Date().toISOString().slice(0, 10);
  const scrapeDates = fixtures.map((fixture) => fixture.scrape_date);
  const scrapeDate =
    options.scrapeDate ?? scrapeDates.sort().at(-1) ?? catalogFreezeDate;

  assertIsoDate(catalogFreezeDate, 'catalog_freeze_date');
  assertIsoDate(scrapeDate, 'scrape_date');

  const byModel = new Map<string, MutableModelAccumulator>();
  const skippedToolCallEntries: SkippedToolCallEntry[] = [];

  for (const fixture of fixtures) {
    const weights = BENCHMARK_CAPABILITY_WEIGHTS[fixture.benchmark];
    if (!weights) {
      throw new BenchmarkIngestError(`Missing capability weights for ${fixture.benchmark}`);
    }

    for (const entry of fixture.entries) {
      const modelId = entry.model_id.trim();
      if (modelId.length === 0) {
        throw new BenchmarkIngestError(`Empty model_id in ${fixture.benchmark} fixture`);
      }

      if (isToolUseBenchmark(fixture.benchmark) && entry.tool_call_snippet !== undefined) {
        const validation = validateToolCallAst(entry.tool_call_snippet);
        if (!validation.valid) {
          const skipped: SkippedToolCallEntry = {
            benchmark: fixture.benchmark,
            model_id: modelId,
            reasonCode: validation.reasonCode,
            ...(validation.detail !== undefined ? { detail: validation.detail } : {}),
          };
          skippedToolCallEntries.push(skipped);
          options.onSkippedToolCallEntry?.(skipped);
          continue;
        }
      }

      const normalized = normalizeBenchmarkScore(entry.score);
      if (entry.score > 1 && (entry.score < 0 || entry.score > 100)) {
        throw new BenchmarkIngestError(
          `Score out of range for ${modelId} in ${fixture.benchmark}: ${entry.score}`,
        );
      }

      const accumulator = byModel.get(modelId) ?? createModelAccumulator();
      if (accumulator.benchmarkSources[fixture.benchmark] !== undefined) {
        throw new BenchmarkIngestError(
          `Duplicate ${fixture.benchmark} entry for model ${modelId}`,
        );
      }

      accumulator.benchmarkSources[fixture.benchmark] = {
        raw_score: entry.score > 1 ? entry.score : entry.score * 100,
        normalized,
      };

      for (const dimension of CAPABILITY_DIMENSIONS) {
        const weight = weights[dimension];
        if (weight !== undefined && weight > 0) {
          accumulator.dimensionScores[dimension].push(normalized);
        }
      }

      byModel.set(modelId, accumulator);
    }
  }

  const models: BenchmarkProfileRecord[] = [];

  for (const [modelId, accumulator] of [...byModel.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const capabilities: Partial<BenchmarkModelCapabilities> = {};
    for (const dimension of CAPABILITY_DIMENSIONS) {
      const scores = accumulator.dimensionScores[dimension];
      if (scores.length === 0) {
        throw new BenchmarkIngestError(
          `Model ${modelId} is missing capability dimension ${dimension} after ingest`,
        );
      }
      capabilities[dimension] = roundCapability(average(scores));
    }

    const parsedCapabilities = capabilitiesSchema.parse(capabilities);
    const benchmarkSources = accumulator.benchmarkSources;
    if (Object.keys(benchmarkSources).length === 0) {
      throw new BenchmarkIngestError(`Model ${modelId} has no benchmark sources`);
    }

    models.push({
      model_id: modelId,
      capabilities: parsedCapabilities,
      benchmark_sources: benchmarkSources,
    });
  }

  if (models.length === 0) {
    throw new BenchmarkIngestError('No model profiles produced from fixtures');
  }

  if (skippedToolCallEntries.length > 0) {
    console.error(
      `ingest-benchmark-profiles: skipped ${skippedToolCallEntries.length} tool-use row(s) after AST validation`,
    );
    for (const skipped of skippedToolCallEntries) {
      const detail = skipped.detail !== undefined ? ` (${skipped.detail})` : '';
      console.error(
        `  skip ${skipped.benchmark}/${skipped.model_id}: ${skipped.reasonCode}${detail}`,
      );
    }
    console.error(`  note: ${AST_VALIDATION_FALSE_NEGATIVE_NOTE}`);
  }

  const aliases =
    options.aliases !== undefined
      ? { ...options.aliases }
      : { ...DEFAULT_FLEET_BENCHMARK_ALIASES };

  const artifact: BenchmarkProfilesArtifact = {
    version: BENCHMARK_PROFILES_VERSION,
    provenance: {
      source_urls: { ...BENCHMARK_SOURCE_URLS },
      scrape_date: scrapeDate,
      catalog_freeze_date: catalogFreezeDate,
    },
    aliases,
    models,
  };

  return parseBenchmarkProfilesArtifact(artifact);
}

/** Load aliases from an existing artifact file (for re-ingest preserve). */
export function loadAliasesFromBenchmarkProfilesFile(
  filePath: string,
): Readonly<Record<string, string>> | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = parseBenchmarkProfilesArtifact(JSON.parse(readFileSync(filePath, 'utf8')));
    return parsed.aliases;
  } catch {
    return undefined;
  }
}

export function parseBenchmarkProfilesArtifact(value: unknown): BenchmarkProfilesArtifact {
  const result = benchmarkProfilesArtifactSchema.safeParse(value);
  if (!result.success) {
    throw new BenchmarkIngestError(`Invalid benchmark profiles artifact: ${result.error.message}`);
  }
  return result.data;
}

export function serializeBenchmarkProfilesArtifact(
  artifact: BenchmarkProfilesArtifact,
): string {
  const validated = parseBenchmarkProfilesArtifact(artifact);
  // Stable key order: version, provenance, aliases (sorted), models
  const aliases =
    validated.aliases !== undefined
      ? Object.fromEntries(
          Object.entries(validated.aliases).sort(([a], [b]) => a.localeCompare(b)),
        )
      : undefined;
  const ordered = {
    version: validated.version,
    provenance: validated.provenance,
    ...(aliases !== undefined ? { aliases } : {}),
    models: validated.models,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function ingestBenchmarkProfilesFromDir(
  fixturesDir: string = DEFAULT_BENCHMARK_FIXTURES_DIR,
  options: IngestBenchmarkProfilesOptions = {},
): BenchmarkProfilesArtifact {
  const fixtures = loadBenchmarkFixturesFromDir(fixturesDir);
  const foundBenchmarks = new Set(fixtures.map((fixture) => fixture.benchmark));
  for (const benchmark of BENCHMARK_IDS) {
    if (!foundBenchmarks.has(benchmark)) {
      throw new BenchmarkIngestError(`Missing fixture for benchmark: ${benchmark}`);
    }
  }
  return aggregateBenchmarkProfiles(fixtures, options);
}

/** Aggregate already-loaded fixtures (live/recorded path) with full-benchmark check. */
export function ingestBenchmarkProfilesFromFixtures(
  fixtures: readonly BenchmarkLeaderboardFixture[],
  options: IngestBenchmarkProfilesOptions = {},
): BenchmarkProfilesArtifact {
  const foundBenchmarks = new Set(fixtures.map((fixture) => fixture.benchmark));
  for (const benchmark of BENCHMARK_IDS) {
    if (!foundBenchmarks.has(benchmark)) {
      throw new BenchmarkIngestError(`Missing fixture for benchmark: ${benchmark}`);
    }
  }
  return aggregateBenchmarkProfiles(fixtures, options);
}

export function buildUsageText(): string {
  return [
    'Usage: npm run routing:ingest-benchmarks -- [options]',
    '',
    'Modes (default = checked-in fixtures, no network):',
    '  --fixtures DIR              Ingest from fixture directory',
    `                              (default: ${DEFAULT_BENCHMARK_FIXTURES_DIR})`,
    '  --recorded [DIR]            Ingest from recorded live snapshots (offline)',
    `                              (default DIR: ${DEFAULT_RECORDED_LEADERBOARDS_DIR})`,
    '  --live                      Per-benchmark live adapter fetch with fallback to',
    '                              recorded then checked-in fixtures; write --record-dir, ingest',
    '  --record-dir DIR            With --live: directory for written snapshots',
    `                              (default: ${DEFAULT_RECORDED_LEADERBOARDS_DIR})`,
    '  --live-url BENCHMARK=URL    Override live fetch URL for one benchmark (repeatable;',
    '                              required for stub adapters until native parsers land)',
    '',
    'Common:',
    '  --output PATH               Profiles artifact path',
    `                              (default: ${DEFAULT_BENCHMARK_PROFILES_PATH})`,
    '  --catalog-freeze-date DATE  YYYY-MM-DD catalog freeze provenance',
    '  --scrape-date DATE          YYYY-MM-DD scrape provenance (also stamps live records)',
    '  -h, --help                  Show this help',
    '',
    'Stub live adapters require fixture-shaped JSON (same schema as checked-in fixtures).',
    'HTML pages fail the live attempt for that benchmark only, then fall back — scores',
    'are never invented. If every source fails for a benchmark, the profiles output',
    'file is left unchanged.',
  ].join('\n');
}

function usage(): void {
  console.error(buildUsageText());
}

export interface ParsedIngestCliArgs {
  readonly mode: 'fixtures' | 'recorded' | 'live';
  readonly fixturesDir: string;
  readonly recordDir: string;
  readonly outputPath: string;
  readonly catalogFreezeDate?: string;
  readonly scrapeDate?: string;
  readonly liveSourceUrls: Readonly<Partial<Record<BenchmarkId, string>>>;
}

function parseLiveUrlOverride(raw: string): { benchmark: BenchmarkId; url: string } {
  const eq = raw.indexOf('=');
  if (eq <= 0) {
    throw new BenchmarkIngestError(
      `--live-url requires BENCHMARK=URL (benchmarks: ${BENCHMARK_IDS.join(', ')})`,
    );
  }
  const benchmark = raw.slice(0, eq);
  const url = raw.slice(eq + 1);
  if (!(BENCHMARK_IDS as readonly string[]).includes(benchmark)) {
    throw new BenchmarkIngestError(
      `Unknown benchmark in --live-url: ${benchmark} (expected ${BENCHMARK_IDS.join(', ')})`,
    );
  }
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file:')) {
    throw new BenchmarkIngestError(`--live-url URL must be http(s) or file: got ${url}`);
  }
  return { benchmark: benchmark as BenchmarkId, url };
}

export function parseIngestCliArgs(args: readonly string[]): ParsedIngestCliArgs {
  let mode: ParsedIngestCliArgs['mode'] = 'fixtures';
  let fixturesDir = DEFAULT_BENCHMARK_FIXTURES_DIR;
  let recordDir = resolve(DEFAULT_RECORDED_LEADERBOARDS_DIR);
  let outputPath = DEFAULT_BENCHMARK_PROFILES_PATH;
  let catalogFreezeDate: string | undefined;
  let scrapeDate: string | undefined;
  const liveSourceUrls: Partial<Record<BenchmarkId, string>> = {};
  let fixturesExplicit = false;
  let recordedExplicit = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--fixtures') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new BenchmarkIngestError('--fixtures requires a path');
      }
      fixturesDir = resolve(next);
      fixturesExplicit = true;
      mode = 'fixtures';
      i++;
      continue;
    }
    if (arg === '--recorded') {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        fixturesDir = resolve(next);
        i++;
      } else {
        fixturesDir = resolve(DEFAULT_RECORDED_LEADERBOARDS_DIR);
      }
      recordedExplicit = true;
      mode = 'recorded';
      continue;
    }
    if (arg === '--live') {
      mode = 'live';
      continue;
    }
    if (arg === '--record-dir') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new BenchmarkIngestError('--record-dir requires a path');
      }
      recordDir = resolve(next);
      i++;
      continue;
    }
    if (arg === '--live-url') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new BenchmarkIngestError('--live-url requires BENCHMARK=URL');
      }
      const override = parseLiveUrlOverride(next);
      liveSourceUrls[override.benchmark] = override.url;
      i++;
      continue;
    }
    if (arg === '--output') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new BenchmarkIngestError('--output requires a path');
      }
      outputPath = resolve(next);
      i++;
      continue;
    }
    if (arg === '--catalog-freeze-date') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new BenchmarkIngestError('--catalog-freeze-date requires a value');
      }
      catalogFreezeDate = next;
      i++;
      continue;
    }
    if (arg === '--scrape-date') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new BenchmarkIngestError('--scrape-date requires a value');
      }
      scrapeDate = next;
      i++;
      continue;
    }
    throw new BenchmarkIngestError(`Unknown argument: ${arg}`);
  }

  if (mode === 'live' && (fixturesExplicit || recordedExplicit)) {
    throw new BenchmarkIngestError(
      'Do not combine --live with --fixtures or --recorded; live writes --record-dir then ingests from it',
    );
  }
  if (fixturesExplicit && recordedExplicit) {
    throw new BenchmarkIngestError('Use either --fixtures or --recorded, not both');
  }

  return {
    mode,
    fixturesDir,
    recordDir,
    outputPath,
    ...(catalogFreezeDate !== undefined ? { catalogFreezeDate } : {}),
    ...(scrapeDate !== undefined ? { scrapeDate } : {}),
    liveSourceUrls,
  };
}

export interface RunIngestCliOptions {
  readonly fetchFn?: LeaderboardFetchFn;
  readonly liveFetchOptions?: Omit<LiveLeaderboardFetchOptions, 'fetchFn' | 'sourceUrls' | 'scrapeDate'>;
}

/**
 * CLI entry body — exported for unit tests (injectable fetch; no process.exit).
 * Writes `config/benchmark-profiles.json` only after a successful aggregate.
 */
export async function runIngestCli(
  args: readonly string[],
  options: RunIngestCliOptions = {},
): Promise<BenchmarkProfilesArtifact> {
  const parsed = parseIngestCliArgs(args);
  const preservedAliases = loadAliasesFromBenchmarkProfilesFile(parsed.outputPath);
  const ingestOptions: IngestBenchmarkProfilesOptions = {
    ...(parsed.catalogFreezeDate !== undefined
      ? { catalogFreezeDate: parsed.catalogFreezeDate }
      : {}),
    ...(parsed.scrapeDate !== undefined ? { scrapeDate: parsed.scrapeDate } : {}),
    aliases: preservedAliases ?? DEFAULT_FLEET_BENCHMARK_ALIASES,
  };

  let artifact: BenchmarkProfilesArtifact;

  if (parsed.mode === 'live') {
    const {
      fetchAllLiveLeaderboards,
      writeRecordedLeaderboardSnapshots,
    } = await import('./lib/benchmark-leaderboard-fetch.js');
    // Fallback reads checked-in recorded/fixtures (defaults); --record-dir is write-only.
    const { fixtures: liveFixtures, loads } = await fetchAllLiveLeaderboards({
      ...(options.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
      ...(parsed.scrapeDate !== undefined ? { scrapeDate: parsed.scrapeDate } : {}),
      sourceUrls: parsed.liveSourceUrls,
      ...options.liveFetchOptions,
    });
    for (const load of loads) {
      console.error(
        `ingest-benchmark-profiles: ${load.benchmark} source=${load.source} (${load.detail})`,
      );
    }
    const written = writeRecordedLeaderboardSnapshots(liveFixtures, parsed.recordDir);
    console.error(
      `ingest-benchmark-profiles: recorded ${written.length} snapshot(s) under ${parsed.recordDir}`,
    );
    artifact = ingestBenchmarkProfilesFromFixtures(liveFixtures, ingestOptions);
  } else {
    artifact = ingestBenchmarkProfilesFromDir(parsed.fixturesDir, ingestOptions);
  }

  writeFileSync(parsed.outputPath, serializeBenchmarkProfilesArtifact(artifact), 'utf8');
  const aliasCount = artifact.aliases !== undefined ? Object.keys(artifact.aliases).length : 0;
  const modeLabel =
    parsed.mode === 'live' ? 'live+record' : parsed.mode === 'recorded' ? 'recorded' : 'fixtures';
  console.error(
    `ingest-benchmark-profiles: wrote v${artifact.version} (${artifact.models.length} model(s), ${aliasCount} alias(es)) to ${parsed.outputPath} [mode=${modeLabel}]`,
  );
  console.error(
    `  catalog_freeze_date=${artifact.provenance.catalog_freeze_date}, scrape_date=${artifact.provenance.scrape_date}`,
  );
  console.error(
    '  tool-call validation: Switchcraft-style AST checks on optional tool_call_snippet for terminal_bench/bfcl rows',
  );
  console.error(
    '  fleet aliases: preserved from existing artifact when present; else DEFAULT_FLEET_BENCHMARK_ALIASES (SP-174)',
  );
  console.error(`  ${AST_VALIDATION_FALSE_NEGATIVE_NOTE}`);
  return artifact;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }
  await runIngestCli(args);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ingest-benchmark-profiles failed: ${message}`);
    process.exit(1);
  });
}
