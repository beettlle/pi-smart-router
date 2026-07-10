import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  EMBEDDING_DIM,
  GRANITE_ONNX_MODEL,
  MINILM_ONNX_MODEL,
  type TextEmbedder,
} from '../../src/domain/matching/embedding-provider.js';
import {
  wrapHydraEmbeddingProvider,
  projectToRequirements,
  type HydraProjectionWeights,
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

  it('uses learned projection weights when provided', async () => {
    const embedding = makeEmbedding(0);
    embedding[0] = 2;
    const embedder = makeMockEmbedder(embedding);
    const weights: HydraProjectionWeights = {
      version: 1,
      embedding_dim: 384,
      weights: [
        Array.from({ length: EMBEDDING_DIM }, (_, index) => (index === 0 ? 1 : 0)),
        Array.from({ length: EMBEDDING_DIM }, () => 0),
        Array.from({ length: EMBEDDING_DIM }, () => 0),
      ],
      bias: [0, 0, 0],
    };
    const provider = wrapHydraEmbeddingProvider(embedder, weights);

    const requirements = await provider.extractRequirements('test prompt');

    expect(requirements.reasoning).toBeCloseTo(1 / (1 + Math.exp(-2)), 6);
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
      MINILM_ONNX_MODEL,
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

// ─── createGraniteOnnxTextEmbedder ───────────────────────────────────────────

describe('createGraniteOnnxTextEmbedder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 384-dim embeddings from mocked Granite ONNX pipeline', async () => {
    const mockData = makeEmbedding(0.5);
    mockExtractor.mockResolvedValue({ data: mockData });

    const { createGraniteOnnxTextEmbedder } = await import(
      '../../src/domain/matching/embedding-provider.js'
    );
    const embedder = await createGraniteOnnxTextEmbedder('.cache/models');

    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      GRANITE_ONNX_MODEL,
      { cache_dir: '.cache/models' },
    );

    const result = await embedder.embed('long context prompt');
    expect(result.length).toBe(EMBEDDING_DIM);
    expect(result).toBe(mockData);
  });
});

// ─── createTextEmbedder (encoder swap) ───────────────────────────────────────

describe('createTextEmbedder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to MiniLM and produces valid 384-dim embeddings', async () => {
    const mockData = makeEmbedding(0.1);
    mockExtractor.mockResolvedValue({ data: mockData });

    const { createTextEmbedder } = await import(
      '../../src/domain/matching/embedding-provider.js'
    );
    const embedder = await createTextEmbedder('minilm', '.cache/models');

    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      MINILM_ONNX_MODEL,
      { cache_dir: '.cache/models' },
    );

    const result = await embedder.embed('swap test');
    expect(result.length).toBe(EMBEDDING_DIM);
  });

  it('selects Granite encoder when configured', async () => {
    const mockData = makeEmbedding(0.2);
    mockExtractor.mockResolvedValue({ data: mockData });

    const { createTextEmbedder } = await import(
      '../../src/domain/matching/embedding-provider.js'
    );
    const embedder = await createTextEmbedder('granite', '.cache/models');

    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      GRANITE_ONNX_MODEL,
      { cache_dir: '.cache/models' },
    );

    const result = await embedder.embed('granite swap test');
    expect(result.length).toBe(EMBEDDING_DIM);
  });
});

// ─── HyDRA integration: encoder swap via createHydraMatcherFromHydraConfig ───

describe('createHydraMatcherFromHydraConfig encoder swap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires granite encoder from hydra config into matcher init', async () => {
    const mockData = makeEmbedding(0.3);
    mockExtractor.mockResolvedValue({ data: mockData });

    const { createHydraMatcherFromHydraConfig } = await import(
      '../../src/domain/matching/hydra-matcher.js'
    );

    const matcher = await createHydraMatcherFromHydraConfig({
      artifact_cache_path: '.cache/models',
      encoder: 'granite',
    });

    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      GRANITE_ONNX_MODEL,
      { cache_dir: '.cache/models' },
    );

    const result = await matcher.match(
      {
        request_id: '00000000-0000-4000-8000-000000000001',
        session_id: 'sess-1',
        prompt_text: 'integration test',
      },
      [
        {
          id: 'model-a',
          tier: 'economical-cloud',
          provider: 'openai',
          capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
          pricing: { fallback_cost_per_1m: 1 },
        },
      ],
    );

    expect(result.requirements.reasoning).toBeGreaterThanOrEqual(0);
    expect(result.requirements.reasoning).toBeLessThanOrEqual(1);

    await matcher.dispose();
  });
});
