import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import {
  clusterReasonCode,
  loadRoutingClusters,
  parseRoutingClustersYaml,
  RoutingClustersLoaderError,
} from '../../src/config/routing-clusters-loader.js';
import { RoutingClustersFileSchema } from '../../src/domain/types/schemas.js';

const VALID_CATALOG = `
clusters:
  - id: low_stakes_general
    tier_bias: zero-tier
    reference_prompts:
      - "what is 2+2"
      - "define polymorphism"
    min_similarity: 0.82
    min_margin: 0.05

  - id: architecture
    tier_bias: frontier-cloud
    reference_prompts:
      - "design a microservices migration"
    min_similarity: 0.78
    min_margin: 0.04
`;

const INVALID_CLUSTER_ID = `
clusters:
  - id: Invalid-ID
    tier_bias: zero-tier
    reference_prompts:
      - "test"
    min_similarity: 0.8
    min_margin: 0.05
`;

const DUPLICATE_IDS = `
clusters:
  - id: low_stakes_general
    tier_bias: zero-tier
    reference_prompts:
      - "what is 2+2"
    min_similarity: 0.82
    min_margin: 0.05
  - id: low_stakes_general
    tier_bias: economical-cloud
    reference_prompts:
      - "another prompt"
    min_similarity: 0.80
    min_margin: 0.05
`;

const EMPTY_PROMPTS = `
clusters:
  - id: low_stakes_general
    tier_bias: zero-tier
    reference_prompts: []
    min_similarity: 0.82
    min_margin: 0.05
`;

const INVALID_THRESHOLDS = `
clusters:
  - id: low_stakes_general
    tier_bias: zero-tier
    reference_prompts:
      - "what is 2+2"
    min_similarity: 1.5
    min_margin: -0.1
`;

function createMockEmbedder(dimension = 4): {
  embed: (text: string) => Promise<Float32Array>;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    embed: async (text: string) => {
      calls.push(text);
      const vector = new Float32Array(dimension);
      for (let i = 0; i < dimension; i++) {
        vector[i] = (text.charCodeAt(i % text.length) % 97) / 100;
      }
      return vector;
    },
  };
}

describe('routing-clusters-loader', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'routing-clusters-loader-test-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeFixture(name: string, content: string): string {
    const filePath = join(tempDir, name);
    writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  describe('clusterReasonCode', () => {
    it('prefixes cluster id with cluster_', () => {
      expect(clusterReasonCode('low_stakes_general')).toBe('cluster_low_stakes_general');
      expect(clusterReasonCode('architecture')).toBe('cluster_architecture');
    });
  });

  describe('schema validation', () => {
    it('accepts a valid routing cluster catalog', () => {
      const parsed = parseRoutingClustersYaml(VALID_CATALOG);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]!.id).toBe('low_stakes_general');
      expect(parsed[0]!.tier_bias).toBe('zero-tier');
      expect(parsed[0]!.min_similarity).toBe(0.82);
    });

    it('rejects invalid cluster id format', () => {
      expect(() => parseRoutingClustersYaml(INVALID_CLUSTER_ID)).toThrow(
        RoutingClustersLoaderError,
      );
      expect(() => parseRoutingClustersYaml(INVALID_CLUSTER_ID)).toThrow(
        /Invalid routing cluster catalog/,
      );
    });

    it('rejects duplicate cluster ids', () => {
      const result = RoutingClustersFileSchema.safeParse({
        clusters: [
          {
            id: 'low_stakes_general',
            tier_bias: 'zero-tier',
            reference_prompts: ['a'],
            min_similarity: 0.8,
            min_margin: 0.05,
          },
          {
            id: 'low_stakes_general',
            tier_bias: 'economical-cloud',
            reference_prompts: ['b'],
            min_similarity: 0.8,
            min_margin: 0.05,
          },
        ],
      });
      expect(result.success).toBe(false);
      expect(() => parseRoutingClustersYaml(DUPLICATE_IDS)).toThrow(/Duplicate cluster id/);
    });

    it('rejects empty reference_prompts', () => {
      expect(() => parseRoutingClustersYaml(EMPTY_PROMPTS)).toThrow(
        RoutingClustersLoaderError,
      );
    });

    it('rejects thresholds outside 0–1', () => {
      expect(() => parseRoutingClustersYaml(INVALID_THRESHOLDS)).toThrow(
        RoutingClustersLoaderError,
      );
    });

    it('rejects invalid YAML syntax', () => {
      expect(() => parseRoutingClustersYaml('{ invalid: yaml: [}')).toThrow(
        /Failed to parse YAML/,
      );
    });
  });

  describe('loadRoutingClusters', () => {
    it('loads clusters and computes centroid embeddings at load time', async () => {
      const filePath = writeFixture('valid.yaml', VALID_CATALOG);
      const embedder = createMockEmbedder(4);
      const catalog = await loadRoutingClusters({ filePath, embedder: embedder });

      expect(catalog.clusters).toHaveLength(2);
      expect(catalog.clusters[0]!.centroid).toBeInstanceOf(Float32Array);
      expect(catalog.clusters[0]!.centroid.length).toBe(4);
      expect(embedder.calls).toEqual([
        'what is 2+2',
        'define polymorphism',
        'design a microservices migration',
      ]);
    });

    it('centroid is mean of reference prompt embeddings', async () => {
      const singlePromptCatalog = `
clusters:
  - id: low_stakes_general
    tier_bias: zero-tier
    reference_prompts:
      - "alpha"
      - "beta"
    min_similarity: 0.82
    min_margin: 0.05
`;
      const filePath = writeFixture('single-cluster.yaml', singlePromptCatalog);
      const embedder = createMockEmbedder(2);
      const catalog = await loadRoutingClusters({ filePath, embedder: embedder });

      const alpha = await embedder.embed('alpha');
      const beta = await embedder.embed('beta');
      const expected = new Float32Array([
        (alpha[0]! + beta[0]!) / 2,
        (alpha[1]! + beta[1]!) / 2,
      ]);

      expect(Array.from(catalog.clusters[0]!.centroid)).toEqual(Array.from(expected));
    });

    it('throws when file does not exist', async () => {
      const embedder = createMockEmbedder();
      await expect(
        loadRoutingClusters({
          filePath: '/nonexistent/routing-clusters.yaml',
          embedder,
        }),
      ).rejects.toThrow(RoutingClustersLoaderError);
      await expect(
        loadRoutingClusters({
          filePath: '/nonexistent/routing-clusters.yaml',
          embedder,
        }),
      ).rejects.toThrow(/Failed to read routing clusters file/);
    });

    it('throws on embedding shape mismatch within a cluster', async () => {
      const filePath = writeFixture('valid-for-mismatch.yaml', VALID_CATALOG);
      const embedder = {
        embed: async (text: string) => {
          const dim = text === 'what is 2+2' ? 4 : 8;
          return new Float32Array(dim);
        },
      };

      await expect(loadRoutingClusters({ filePath, embedder })).rejects.toThrow(
        /Embedding shape mismatch/,
      );
    });
  });
});
