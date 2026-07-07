#!/usr/bin/env node
/**
 * HyDRA projection head latency benchmark — SP-115.
 *
 * Measures learned vs placeholder projection latency over many iterations.
 * Projection should stay well under the 80–120 ms HyDRA stage budget.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EMBEDDING_DIM } from '../dist/domain/matching/embedding-provider.js';
import {
  DEFAULT_HYDRA_PROJECTION_WEIGHTS_PATH,
  parseHydraProjectionWeightsJson,
  projectToRequirements,
} from '../dist/domain/matching/hydra-matcher.js';

const DEFAULT_ITERATIONS = 10_000;
const HYDRA_BUDGET_MS = 120;

function usage(): void {
  console.error(
    'Usage: npm run routing:test-projection -- [weights.json] [iterations]',
  );
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function benchmark(
  label: string,
  embedding: Float32Array,
  iterations: number,
  weights?: ReturnType<typeof parseHydraProjectionWeightsJson> | null,
): void {
  for (let i = 0; i < 100; i++) {
    projectToRequirements(embedding, weights);
  }

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    projectToRequirements(embedding, weights);
    samples.push(performance.now() - start);
  }

  samples.sort((a, b) => a - b);
  const totalMs = samples.reduce((sum, value) => sum + value, 0);

  console.log(`\n${label}`);
  console.log(`  iterations: ${iterations}`);
  console.log(`  total: ${totalMs.toFixed(3)} ms`);
  console.log(`  mean: ${(totalMs / iterations).toFixed(6)} ms`);
  console.log(`  p50: ${percentile(samples, 50).toFixed(6)} ms`);
  console.log(`  p99: ${percentile(samples, 99).toFixed(6)} ms`);
  console.log(`  max: ${(samples[samples.length - 1] ?? 0).toFixed(6)} ms`);
}

function main(): void {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const weightsPath = process.argv[2] ?? DEFAULT_HYDRA_PROJECTION_WEIGHTS_PATH;
  const iterations = Number.parseInt(process.argv[3] ?? String(DEFAULT_ITERATIONS), 10);

  if (!Number.isFinite(iterations) || iterations < 1) {
    console.error('iterations must be a positive integer');
    usage();
    process.exit(1);
  }

  const embedding = new Float32Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    embedding[i] = Math.sin(i * 0.1);
  }

  let weights: ReturnType<typeof parseHydraProjectionWeightsJson> | null = null;
  try {
    const raw = readFileSync(resolve(weightsPath), 'utf8');
    weights = parseHydraProjectionWeightsJson(raw);
    console.log(`Loaded projection weights v${weights.version} from ${weightsPath}`);
  } catch (err: unknown) {
    console.warn(
      `No valid weights at ${weightsPath}; learned benchmark skipped`,
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log(`HyDRA stage budget reference: ${HYDRA_BUDGET_MS} ms (projection should be << budget)`);

  benchmark('Placeholder projection', embedding, iterations, null);
  if (weights) {
    benchmark('Learned projection', embedding, iterations, weights);
  }
}

main();
