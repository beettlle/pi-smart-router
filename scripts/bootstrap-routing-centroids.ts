#!/usr/bin/env node
/**
 * Offline bootstrap for routing cluster centroids — SP-114, GitHub #64.
 *
 * Loads routing-clusters.yaml, embeds reference prompts via MiniLM ONNX,
 * mean-pools to centroid vectors, and writes config/routing-centroids.json.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseRoutingClustersYaml } from '../src/config/routing-clusters-loader.js';
import { DEFAULT_OPERATOR_CONFIG } from '../src/config/defaults.js';
import { createOnnxTextEmbedder } from '../src/domain/matching/embedding-provider.js';
import {
  buildRoutingCentroidsArtifact,
  DEFAULT_ROUTING_CENTROIDS_PATH,
  serializeRoutingCentroidsArtifact,
} from '../src/domain/matching/cluster-matcher.js';

function usage(): void {
  console.error(
    'Usage: npm run routing:bootstrap-centroids -- [clusters.yaml] [output.json]',
  );
}

async function main(): Promise<void> {
  const clustersPath = process.argv[2] ?? resolve('config/routing-clusters.yaml');
  const outputPath = process.argv[3] ?? resolve(DEFAULT_ROUTING_CENTROIDS_PATH);

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const raw = readFileSync(clustersPath, 'utf8');
  const clusters = parseRoutingClustersYaml(raw);
  const artifactCachePath = DEFAULT_OPERATOR_CONFIG.hydra.artifact_cache_path;
  const embedder = await createOnnxTextEmbedder(artifactCachePath);

  try {
    const artifact = await buildRoutingCentroidsArtifact(clusters, embedder);
    writeFileSync(outputPath, serializeRoutingCentroidsArtifact(artifact), 'utf8');
    console.log(
      `Wrote ${artifact.clusters.length} cluster centroids (${artifact.embedding_dim}-dim) to ${outputPath}`,
    );
  } finally {
    await embedder.dispose();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`bootstrap-routing-centroids failed: ${message}`);
  process.exit(1);
});
