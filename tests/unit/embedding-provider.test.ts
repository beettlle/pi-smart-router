import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  EMBEDDING_DIM,
  type TextEmbedder,
} from '../../src/domain/matching/embedding-provider.js';
import {
  wrapHydraEmbeddingProvider,
  projectToRequirements,
} from '../../src/domain/matching/hydra-matcher.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeEmbedding(fill = 0): Float32Array {
  const embedding = new Float32Array(EMBEDDING_DIM);
  embedding.fill(fill);
  return embedding;
}

function makeMockEmbedder(embedding = makeEmbedding()): TextEmbedder {
  return {
    embed: vi.fn(async () => embedding),
    dispose: vi.fn(async () => {}),
  };
}

// ─── wrapHydraEmbeddingProvider ──────────────────────────────────────────────

describe('wrapHydraEmbeddingProvider', () => {
  it('projects embed() output to requirement dimensions', async () => {
    const embedding = makeEmbedding(0);
    const embedder = makeMockEmbedder(embedding);
    const provider = wrapHydraEmbeddingProvider(embedder);

    const requirements = await provider.extractRequirements('test prompt');

    expect(embedder.embed).toHaveBeenCalledWith('test prompt');
    expect(requirements).toEqual(projectToRequirements(embedding));
  });

  it('delegates dispose to the shared embedder', async () => {
    const embedder = makeMockEmbedder();
    const provider = wrapHydraEmbeddingProvider(embedder);

    await provider.dispose();

    expect(embedder.dispose).toHaveBeenCalledOnce();
  });
});

// ─── createOnnxTextEmbedder ──────────────────────────────────────────────────

const mockExtractor = vi.fn();
const mockPipeline = vi.fn(async () => mockExtractor);

vi.mock('@huggingface/transformers', () => ({
  pipeline: mockPipeline,
}));

describe('createOnnxTextEmbedder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 384-dim embeddings from mocked ONNX pipeline', async () => {
    const mockData = makeEmbedding(0.25);
    mockExtractor.mockResolvedValue({ data: mockData });

    const { createOnnxTextEmbedder } = await import(
      '../../src/domain/matching/embedding-provider.js'
    );
    const embedder = await createOnnxTextEmbedder('.cache/models');

    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { cache_dir: '.cache/models' },
    );

    const result = await embedder.embed('hello world');
    expect(result).toBe(mockData);
    expect(result.length).toBe(EMBEDDING_DIM);
    expect(mockExtractor).toHaveBeenCalledWith('hello world', {
      pooling: 'mean',
      normalize: true,
    });
  });

  it('rejects wrong-dimension ONNX output', async () => {
    mockExtractor.mockResolvedValue({ data: new Float32Array(100) });

    const { createOnnxTextEmbedder } = await import(
      '../../src/domain/matching/embedding-provider.js'
    );
    const embedder = await createOnnxTextEmbedder('.cache/models');

    await expect(embedder.embed('bad shape')).rejects.toThrow(
      /Embedding shape mismatch/,
    );
  });
});
