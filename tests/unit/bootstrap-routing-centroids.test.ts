import { describe, expect, it } from 'vitest';

import {
  defaultCentroidsOutputPath,
  parseBootstrapCliArgs,
  serializeFlavoredCentroidsArtifact,
} from '../../scripts/bootstrap-routing-centroids.js';
import { EMBEDDING_DIM } from '../../src/domain/matching/embedding-provider.js';
import type { RoutingCentroidsArtifact } from '../../src/domain/matching/cluster-matcher.js';

function makeCentroidsArtifact(): RoutingCentroidsArtifact {
  return {
    version: 1,
    embedding_dim: EMBEDDING_DIM,
    clusters: [
      {
        cluster_id: 'low_stakes_general',
        tier_bias: 'economical-cloud',
        centroid: new Array<number>(EMBEDDING_DIM).fill(0),
        reference_count: 1,
      },
    ],
  };
}

describe('bootstrap routing centroids --encoder (SP-293 / #173 part 3)', () => {
  it('defaults to minilm with the shipped baseline output path', () => {
    const args = parseBootstrapCliArgs([]);
    expect(args.encoder).toBe('minilm');
    expect(args.help).toBe(false);
    expect(args.outputPath).toBe(defaultCentroidsOutputPath('minilm'));
    expect(args.outputPath).toMatch(/config\/routing-centroids\.json$/);
  });

  it('namespaces granite output so it cannot clobber the MiniLM baseline', () => {
    const args = parseBootstrapCliArgs(['--encoder', 'granite']);
    expect(args.encoder).toBe('granite');
    expect(args.outputPath).toMatch(/config\/routing-centroids\.granite\.json$/);
    expect(args.outputPath).not.toBe(defaultCentroidsOutputPath('minilm'));
  });

  it('supports --encoder=granite and explicit positional overrides', () => {
    const args = parseBootstrapCliArgs(['--encoder=granite', 'clusters.yaml', 'out.json']);
    expect(args.encoder).toBe('granite');
    expect(args.clustersPath).toMatch(/clusters\.yaml$/);
    expect(args.outputPath).toMatch(/out\.json$/);
  });

  it('rejects unknown encoder flavors and flags fail-fast', () => {
    expect(() => parseBootstrapCliArgs(['--encoder', 'bert'])).toThrow(/Unsupported encoder/);
    expect(() => parseBootstrapCliArgs(['--encoder=bert'])).toThrow(/Unsupported encoder/);
    expect(() => parseBootstrapCliArgs(['--encoder'])).toThrow(/requires a value/);
    expect(() => parseBootstrapCliArgs(['--nope'])).toThrow(/Unknown flag/);
  });

  it('stamps the serialized artifact with the encoder flavor', () => {
    const serialized = serializeFlavoredCentroidsArtifact(makeCentroidsArtifact(), 'granite');
    const parsed = JSON.parse(serialized) as {
      readonly encoder?: string;
      readonly version?: number;
      readonly clusters?: readonly unknown[];
    };
    expect(parsed.encoder).toBe('granite');
    expect(parsed.version).toBe(1);
    expect(parsed.clusters).toHaveLength(1);
  });

  it('stamps minilm artifacts explicitly (never flipped by granite path)', () => {
    const serialized = serializeFlavoredCentroidsArtifact(makeCentroidsArtifact(), 'minilm');
    const parsed = JSON.parse(serialized) as { readonly encoder?: string };
    expect(parsed.encoder).toBe('minilm');
  });
});
