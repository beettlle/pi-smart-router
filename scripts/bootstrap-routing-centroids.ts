#!/usr/bin/env node
/**
 * Offline bootstrap for routing cluster centroids — SP-114, GitHub #64.
 *
 * Loads routing-clusters.yaml, embeds reference prompts via the selected ONNX
 * encoder, mean-pools to centroid vectors, and writes a centroid artifact.
 *
 * SP-293 (#173 part 3): `--encoder minilm|granite` (default `minilm`) selects
 * the embedding encoder and stamps the artifact with an `encoder` flavor
 * field. Granite output is namespaced to `config/routing-centroids.granite.json`
 * by default so it can never overwrite the shipped MiniLM baseline.
 * `verify-routing-calibration` rejects calibration bundles that mix encoder
 * flavors — centroids and HyDRA projection must come from one encoder space.
 *
 * Usage:
 *   npm run routing:bootstrap-centroids -- [clusters.yaml] [output.json] [--encoder minilm|granite]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseRoutingClustersYaml } from '../src/config/routing-clusters-loader.js';
import { DEFAULT_OPERATOR_CONFIG } from '../src/config/defaults.js';
import { createTextEmbedder } from '../src/domain/matching/embedding-provider.js';
import {
  buildRoutingCentroidsArtifact,
  DEFAULT_ROUTING_CENTROIDS_PATH,
  type RoutingCentroidsArtifact,
} from '../src/domain/matching/cluster-matcher.js';
import { DEFAULT_ENCODER, type Encoder } from '../src/domain/types/schemas.js';

const ENCODER_FLAVORS: readonly Encoder[] = ['minilm', 'granite'];

/** Centroid artifact stamped with the encoder flavor that produced it (SP-293). */
export interface FlavoredRoutingCentroidsArtifact extends RoutingCentroidsArtifact {
  readonly encoder: Encoder;
}

export interface BootstrapCliArgs {
  readonly clustersPath: string;
  readonly outputPath: string;
  readonly encoder: Encoder;
  readonly help: boolean;
}

/** Namespaced default output per encoder flavor — granite never clobbers the MiniLM baseline. */
export function defaultCentroidsOutputPath(encoder: Encoder): string {
  return encoder === 'minilm'
    ? resolve(DEFAULT_ROUTING_CENTROIDS_PATH)
    : resolve(`config/routing-centroids.${encoder}.json`);
}

export function parseBootstrapCliArgs(argv: readonly string[]): BootstrapCliArgs {
  const positional: string[] = [];
  let encoder: Encoder = DEFAULT_ENCODER;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--encoder') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error('--encoder requires a value (minilm|granite)');
      }
      if (!ENCODER_FLAVORS.includes(value as Encoder)) {
        throw new Error(
          `Unsupported encoder '${value}'; expected one of: ${ENCODER_FLAVORS.join(', ')}`,
        );
      }
      encoder = value as Encoder;
      i += 1;
      continue;
    }
    if (arg.startsWith('--encoder=')) {
      const value = arg.slice('--encoder='.length);
      if (!ENCODER_FLAVORS.includes(value as Encoder)) {
        throw new Error(
          `Unsupported encoder '${value}'; expected one of: ${ENCODER_FLAVORS.join(', ')}`,
        );
      }
      encoder = value as Encoder;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    positional.push(arg);
  }

  const clustersPath = resolve(positional[0] ?? 'config/routing-clusters.yaml');
  const outputPath =
    positional[1] !== undefined ? resolve(positional[1]) : defaultCentroidsOutputPath(encoder);

  return { clustersPath, outputPath, encoder, help };
}

/** Serialize a centroid artifact with its encoder flavor stamp (SP-293). */
export function serializeFlavoredCentroidsArtifact(
  artifact: RoutingCentroidsArtifact,
  encoder: Encoder,
): string {
  const flavored: FlavoredRoutingCentroidsArtifact = { ...artifact, encoder };
  return `${JSON.stringify(flavored, null, 2)}\n`;
}

function usage(): void {
  console.error(
    'Usage: npm run routing:bootstrap-centroids -- [clusters.yaml] [output.json] [--encoder minilm|granite]',
  );
}

async function main(): Promise<void> {
  const args = parseBootstrapCliArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    return;
  }

  const raw = readFileSync(args.clustersPath, 'utf8');
  const clusters = parseRoutingClustersYaml(raw);
  const artifactCachePath = DEFAULT_OPERATOR_CONFIG.hydra.artifact_cache_path;
  const embedder = await createTextEmbedder(args.encoder, artifactCachePath);

  try {
    const artifact = await buildRoutingCentroidsArtifact(clusters, embedder);
    writeFileSync(args.outputPath, serializeFlavoredCentroidsArtifact(artifact, args.encoder), 'utf8');
    console.log(
      `Wrote ${artifact.clusters.length} cluster centroids (${artifact.embedding_dim}-dim, encoder=${args.encoder}) to ${args.outputPath}`,
    );
  } finally {
    await embedder.dispose();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`bootstrap-routing-centroids failed: ${message}`);
    process.exit(1);
  });
}
