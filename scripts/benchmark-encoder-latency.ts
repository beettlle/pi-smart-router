#!/usr/bin/env node
/**
 * Encoder latency benchmark — SP-157, GitHub #80 (part 2).
 *
 * Compares MiniLM vs Granite ONNX embedders on held-out agent turn samples.
 * Reports p50/p95 latency and asserts Granite stays within the 80–120 ms
 * HyDRA embedding stage budget.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { buildHydraInput } from '../src/domain/matching/hydra-input.js';
import {
  createGraniteOnnxTextEmbedder,
  createOnnxTextEmbedder,
  EMBEDDING_DIM,
  type TextEmbedder,
} from '../src/domain/matching/embedding-provider.js';
import type { RoutingRequest } from '../src/domain/types/index.js';

export const AGENT_TURN_SAMPLES_VERSION = 1 as const;

export const DEFAULT_AGENT_TURN_FIXTURES_PATH = resolve(
  'tests',
  'fixtures',
  'agent-turn-samples',
  'agent-turn-samples.json',
);

export const DEFAULT_ARTIFACT_CACHE_PATH = '.pi-smart-router/models/';

/** HyDRA embedding stage budget (routing-roadmap §1). */
export const GRANITE_LATENCY_BUDGET_MS_MIN = 80;
export const GRANITE_LATENCY_BUDGET_MS_MAX = 120;

const WARMUP_ITERATIONS = 3;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'tool', 'system']),
  content: z.string(),
});

const routingRequestSchema = z.object({
  request_id: z.string().min(1),
  session_id: z.string().min(1),
  prompt_text: z.string(),
  turn_type: z
    .enum(['main_loop', 'tool_result', 'planning', 'subagent', 'unknown'])
    .optional(),
  estimated_input_tokens: z.number().int().nonnegative().optional(),
  compaction_flag: z.boolean().optional(),
  messages: z.array(messageSchema).optional(),
});

const agentTurnSampleSchema = z.object({
  id: z.string().min(1),
  request: routingRequestSchema,
});

export const agentTurnSamplesFixtureSchema = z.object({
  version: z.literal(AGENT_TURN_SAMPLES_VERSION),
  description: z.string().min(1),
  samples: z.array(agentTurnSampleSchema).min(1),
});

export type AgentTurnSample = z.infer<typeof agentTurnSampleSchema>;
export type AgentTurnSamplesFixture = z.infer<typeof agentTurnSamplesFixtureSchema>;

export interface EncoderLatencyStats {
  readonly encoder: 'minilm' | 'granite';
  readonly sampleCount: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly meanMs: number;
  readonly maxMs: number;
}

export interface EncoderLatencyBenchmarkResult {
  readonly fixturePath: string;
  readonly sampleCount: number;
  readonly minilm: EncoderLatencyStats;
  readonly granite: EncoderLatencyStats;
  readonly budgetMs: { readonly typical: number; readonly max: number };
  readonly graniteWithinBudget: boolean;
}

export class AgentTurnFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentTurnFixtureError';
  }
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export function summarizeLatencies(
  encoder: 'minilm' | 'granite',
  latenciesMs: readonly number[],
): EncoderLatencyStats {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    encoder,
    sampleCount: sorted.length,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    meanMs: sorted.length > 0 ? total / sorted.length : 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

export function parseAgentTurnSamplesFixture(raw: unknown): AgentTurnSamplesFixture {
  const result = agentTurnSamplesFixtureSchema.safeParse(raw);
  if (!result.success) {
    throw new AgentTurnFixtureError(
      `Invalid agent turn samples fixture: ${result.error.message}`,
    );
  }
  return result.data;
}

export function loadAgentTurnSamples(
  fixturePath: string = DEFAULT_AGENT_TURN_FIXTURES_PATH,
): AgentTurnSamplesFixture {
  const resolved = resolve(fixturePath);
  if (!existsSync(resolved)) {
    throw new AgentTurnFixtureError(`Fixture not found: ${resolved}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new AgentTurnFixtureError(`Failed to parse fixture JSON at ${resolved}: ${detail}`);
  }

  return parseAgentTurnSamplesFixture(parsed);
}

/** Build HyDRA encoder inputs from held-out agent turn samples. */
export function buildEncoderTexts(samples: readonly AgentTurnSample[]): string[] {
  return samples.map((sample) => buildHydraInput(sample.request as RoutingRequest));
}

export function graniteWithinBudget(
  stats: Pick<EncoderLatencyStats, 'p50Ms' | 'p95Ms'>,
  budgetMaxMs: number = GRANITE_LATENCY_BUDGET_MS_MAX,
): boolean {
  return stats.p50Ms <= budgetMaxMs && stats.p95Ms <= budgetMaxMs;
}

async function measureEmbedLatencies(
  embedder: TextEmbedder,
  texts: readonly string[],
): Promise<number[]> {
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await embedder.embed(texts[i % texts.length] ?? texts[0] ?? '');
  }

  const latencies: number[] = [];
  for (const text of texts) {
    const start = performance.now();
    const embedding = await embedder.embed(text);
    latencies.push(performance.now() - start);

    if (embedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding shape mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`,
      );
    }
  }

  return latencies;
}

export interface RunEncoderLatencyBenchmarkOptions {
  readonly fixturePath?: string;
  readonly artifactCachePath?: string;
  readonly budgetMaxMs?: number;
}

export async function runEncoderLatencyBenchmark(
  options: RunEncoderLatencyBenchmarkOptions = {},
): Promise<EncoderLatencyBenchmarkResult> {
  const fixturePath = resolve(options.fixturePath ?? DEFAULT_AGENT_TURN_FIXTURES_PATH);
  const artifactCachePath = options.artifactCachePath ?? DEFAULT_ARTIFACT_CACHE_PATH;
  const budgetMaxMs = options.budgetMaxMs ?? GRANITE_LATENCY_BUDGET_MS_MAX;

  const fixture = loadAgentTurnSamples(fixturePath);
  const texts = buildEncoderTexts(fixture.samples);

  const minilmEmbedder = await createOnnxTextEmbedder(artifactCachePath);
  const graniteEmbedder = await createGraniteOnnxTextEmbedder(artifactCachePath);

  try {
    const [minilmLatencies, graniteLatencies] = await Promise.all([
      measureEmbedLatencies(minilmEmbedder, texts),
      measureEmbedLatencies(graniteEmbedder, texts),
    ]);

    const minilm = summarizeLatencies('minilm', minilmLatencies);
    const granite = summarizeLatencies('granite', graniteLatencies);

    return {
      fixturePath,
      sampleCount: fixture.samples.length,
      minilm,
      granite,
      budgetMs: { typical: GRANITE_LATENCY_BUDGET_MS_MIN, max: budgetMaxMs },
      graniteWithinBudget: graniteWithinBudget(granite, budgetMaxMs),
    };
  } finally {
    await Promise.all([minilmEmbedder.dispose(), graniteEmbedder.dispose()]);
  }
}

function formatStats(label: string, stats: EncoderLatencyStats): void {
  console.log(`\n${label}`);
  console.log(`  samples: ${stats.sampleCount}`);
  console.log(`  mean: ${stats.meanMs.toFixed(2)} ms`);
  console.log(`  p50: ${stats.p50Ms.toFixed(2)} ms`);
  console.log(`  p95: ${stats.p95Ms.toFixed(2)} ms`);
  console.log(`  max: ${stats.maxMs.toFixed(2)} ms`);
}

function usage(): void {
  console.error(
    'Usage: npm run benchmark:encoder -- [--fixtures path] [--cache path]',
  );
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    return 0;
  }

  let fixturePath = DEFAULT_AGENT_TURN_FIXTURES_PATH;
  let artifactCachePath = DEFAULT_ARTIFACT_CACHE_PATH;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fixtures') {
      fixturePath = argv[i + 1] ?? fixturePath;
      i += 1;
    } else if (arg === '--cache') {
      artifactCachePath = argv[i + 1] ?? artifactCachePath;
      i += 1;
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
      return 1;
    }
  }

  console.log('Encoder latency benchmark (SP-157)');
  console.log(`  fixtures: ${resolve(fixturePath)}`);
  console.log(`  cache: ${artifactCachePath}`);
  console.log(
    `  Granite budget: ~${GRANITE_LATENCY_BUDGET_MS_MIN}–${GRANITE_LATENCY_BUDGET_MS_MAX} ms (assert p50/p95 ≤ ${GRANITE_LATENCY_BUDGET_MS_MAX} ms)`,
  );

  const result = await runEncoderLatencyBenchmark({ fixturePath, artifactCachePath });

  console.log(`\nHeld-out agent turn samples: ${result.sampleCount}`);
  formatStats('MiniLM (Xenova/all-MiniLM-L6-v2)', result.minilm);
  formatStats('Granite (granite-embedding-97m-multilingual-r2 ONNX)', result.granite);

  if (result.graniteWithinBudget) {
    console.log(
      `\nPASS: Granite p50 (${result.granite.p50Ms.toFixed(2)} ms) and p95 (${result.granite.p95Ms.toFixed(2)} ms) within ${result.budgetMs.max} ms budget`,
    );
    return 0;
  }

  console.error(
    `\nFAIL: Granite latency exceeds ${result.budgetMs.max} ms budget — p50=${result.granite.p50Ms.toFixed(2)} ms, p95=${result.granite.p95Ms.toFixed(2)} ms`,
  );
  return 1;
}

const isDirectExecution =
  process.argv[1] !== undefined
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  main().then((code) => {
    process.exit(code);
  });
}
