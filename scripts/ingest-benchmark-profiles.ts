#!/usr/bin/env node
/**
 * Benchmark capability profile ingest — SP-134, GitHub #75 (part 1).
 *
 * Ingests checked-in leaderboard fixture snapshots (SWE-bench Verified,
 * Terminal-Bench, LiveCodeBench, BFCL) and emits normalized per-model
 * capability scores for SP-136 mapper integration.
 *
 * Fixture layout: `tests/fixtures/benchmark-leaderboards/<benchmark>.json`
 * Output artifact: versioned JSON with provenance + model capability rows.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

export const BENCHMARK_PROFILES_VERSION = 1 as const;

export const BENCHMARK_IDS = [
  'swebench_verified',
  'terminal_bench',
  'livecodebench',
  'bfcl',
] as const;

export type BenchmarkId = (typeof BENCHMARK_IDS)[number];

export const DEFAULT_BENCHMARK_FIXTURES_DIR = resolve(
  'tests',
  'fixtures',
  'benchmark-leaderboards',
);
export const DEFAULT_BENCHMARK_PROFILES_PATH = resolve('config', 'benchmark-profiles.json');

/** Public leaderboard URLs recorded in provenance (fixtures mirror these sources). */
export const BENCHMARK_SOURCE_URLS: Readonly<Record<BenchmarkId, string>> = {
  swebench_verified: 'https://www.swebench.com/',
  terminal_bench: 'https://www.tbench.ai/leaderboard',
  livecodebench: 'https://livecodebench.github.io/leaderboard.html',
  bfcl: 'https://gorilla.cs.berkeley.edu/leaderboard.html',
};

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
  benchmark_sources: z.record(z.enum(BENCHMARK_IDS), benchmarkSourceSchema),
});

const provenanceSchema = z.object({
  source_urls: z.record(z.enum(BENCHMARK_IDS), z.string().url()),
  scrape_date: z.string().regex(ISO_DATE_PATTERN),
  catalog_freeze_date: z.string().regex(ISO_DATE_PATTERN),
});

const benchmarkProfilesArtifactSchema = z.object({
  version: z.literal(BENCHMARK_PROFILES_VERSION),
  provenance: provenanceSchema,
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
      benchmark_sources: benchmarkSources as Record<BenchmarkId, BenchmarkSourceScore>,
    });
  }

  if (models.length === 0) {
    throw new BenchmarkIngestError('No model profiles produced from fixtures');
  }

  const artifact: BenchmarkProfilesArtifact = {
    version: BENCHMARK_PROFILES_VERSION,
    provenance: {
      source_urls: { ...BENCHMARK_SOURCE_URLS },
      scrape_date: scrapeDate,
      catalog_freeze_date: catalogFreezeDate,
    },
    models,
  };

  return parseBenchmarkProfilesArtifact(artifact);
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
  return `${JSON.stringify(validated, null, 2)}\n`;
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

function usage(): void {
  console.error(
    'Usage: npm run routing:ingest-benchmarks -- [--fixtures DIR] [--output PATH] [--catalog-freeze-date YYYY-MM-DD] [--scrape-date YYYY-MM-DD]',
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  let fixturesDir = DEFAULT_BENCHMARK_FIXTURES_DIR;
  let outputPath = DEFAULT_BENCHMARK_PROFILES_PATH;
  let catalogFreezeDate: string | undefined;
  let scrapeDate: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--fixtures') {
      const next = args[i + 1];
      if (!next) {
        throw new BenchmarkIngestError('--fixtures requires a path');
      }
      fixturesDir = resolve(next);
      i++;
      continue;
    }
    if (arg === '--output') {
      const next = args[i + 1];
      if (!next) {
        throw new BenchmarkIngestError('--output requires a path');
      }
      outputPath = resolve(next);
      i++;
      continue;
    }
    if (arg === '--catalog-freeze-date') {
      const next = args[i + 1];
      if (!next) {
        throw new BenchmarkIngestError('--catalog-freeze-date requires a value');
      }
      catalogFreezeDate = next;
      i++;
      continue;
    }
    if (arg === '--scrape-date') {
      const next = args[i + 1];
      if (!next) {
        throw new BenchmarkIngestError('--scrape-date requires a value');
      }
      scrapeDate = next;
      i++;
      continue;
    }
    throw new BenchmarkIngestError(`Unknown argument: ${arg}`);
  }

  const artifact = ingestBenchmarkProfilesFromDir(fixturesDir, {
    ...(catalogFreezeDate !== undefined ? { catalogFreezeDate } : {}),
    ...(scrapeDate !== undefined ? { scrapeDate } : {}),
  });

  writeFileSync(outputPath, serializeBenchmarkProfilesArtifact(artifact), 'utf8');
  console.error(
    `ingest-benchmark-profiles: wrote v${artifact.version} (${artifact.models.length} model(s)) to ${outputPath}`,
  );
  console.error(
    `  catalog_freeze_date=${artifact.provenance.catalog_freeze_date}, scrape_date=${artifact.provenance.scrape_date}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ingest-benchmark-profiles failed: ${message}`);
    process.exit(1);
  });
}
