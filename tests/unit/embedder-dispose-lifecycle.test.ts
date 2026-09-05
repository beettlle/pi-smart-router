/**
 * SP-260 (#147) — embedder dispose() lifecycle tests.
 *
 * Proves the ONNX text embedder releases real pipeline/session handles on
 * dispose() (no silent no-op), is idempotent for shared-factory callers, and
 * fails closed on embed() after dispose (no silent session recreation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  EMBEDDING_DIM,
  GRANITE_ONNX_MODEL,
  MINILM_ONNX_MODEL,
  createGraniteOnnxTextEmbedder,
  createOnnxTextEmbedder,
  createTextEmbedder,
} from '../../src/domain/matching/embedding-provider.js';
import { wrapHydraEmbeddingProvider } from '../../src/domain/matching/hydra-matcher.js';

// ─── Mock @huggingface/transformers ──────────────────────────────────────────

const mockPipeline = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  pipeline: mockPipeline,
}));

function makeEmbedding(fill = 0): Float32Array {
  const embedding = new Float32Array(EMBEDDING_DIM);
  embedding.fill(fill);
  return embedding;
}

interface MockExtractorOptions {
  readonly withPipelineDispose?: boolean;
  readonly withModelDispose?: boolean;
}

/** Callable extractor matching the OnnxPipeline shape, with optional handles. */
function makeMockExtractor(options: MockExtractorOptions = {}) {
  const { withPipelineDispose = true, withModelDispose = false } = options;
  const pipelineDispose = vi.fn(async () => {});
  const modelDispose = vi.fn(async () => {});
  const extractor = Object.assign(
    vi.fn(async () => ({ data: makeEmbedding(0.5) })),
    {
      ...(withPipelineDispose ? { dispose: pipelineDispose } : {}),
      ...(withModelDispose ? { model: { dispose: modelDispose } } : {}),
    },
  );
  return { extractor, pipelineDispose, modelDispose };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Real dispose (release path) ─────────────────────────────────────────────

describe('TextEmbedder.dispose lifecycle (SP-260, #147)', () => {
  it('dispose() releases the ONNX pipeline via pipeline.dispose()', async () => {
    const { extractor, pipelineDispose } = makeMockExtractor();
    mockPipeline.mockResolvedValue(extractor);

    const embedder = await createOnnxTextEmbedder('.cache/models');
    await embedder.embed('warm up');
    await embedder.dispose();

    expect(pipelineDispose).toHaveBeenCalledOnce();
  });

  it('falls back to model.dispose() when pipeline.dispose() is absent', async () => {
    const { extractor, modelDispose } = makeMockExtractor({
      withPipelineDispose: false,
      withModelDispose: true,
    });
    mockPipeline.mockResolvedValue(extractor);

    const embedder = await createOnnxTextEmbedder('.cache/models');
    await embedder.dispose();

    expect(modelDispose).toHaveBeenCalledOnce();
  });

  it('fails loud when the pipeline exposes no dispose handle', async () => {
    const { extractor } = makeMockExtractor({ withPipelineDispose: false });
    mockPipeline.mockResolvedValue(extractor);

    const embedder = await createOnnxTextEmbedder('.cache/models');

    await expect(embedder.dispose()).rejects.toThrow(/No dispose handle/);
  });

  it('propagates release failures from the underlying pipeline', async () => {
    const { extractor, pipelineDispose } = makeMockExtractor();
    pipelineDispose.mockRejectedValue(new Error('ort session release failed'));
    mockPipeline.mockResolvedValue(extractor);

    const embedder = await createOnnxTextEmbedder('.cache/models');

    await expect(embedder.dispose()).rejects.toThrow(
      /ort session release failed/,
    );
  });

  it('dispose() is idempotent for shared-factory callers', async () => {
    const { extractor, pipelineDispose } = makeMockExtractor();
    mockPipeline.mockResolvedValue(extractor);

    const embedder = await createOnnxTextEmbedder('.cache/models');
    await embedder.dispose();
    await embedder.dispose();

    expect(pipelineDispose).toHaveBeenCalledOnce();
  });
});

// ─── Post-dispose embed() fails closed ───────────────────────────────────────

describe('post-dispose embed() fails closed (SP-260)', () => {
  it('rejects embed() after dispose and never touches the released session', async () => {
    const { extractor } = makeMockExtractor();
    mockPipeline.mockResolvedValue(extractor);

    const embedder = await createOnnxTextEmbedder('.cache/models');
    await embedder.embed('before dispose');
    await embedder.dispose();

    const callsBefore = extractor.mock.calls.length;
    await expect(embedder.embed('after dispose')).rejects.toThrow(
      /has been disposed; embed\(\) fails closed/,
    );
    expect(extractor.mock.calls.length).toBe(callsBefore);
  });

  it('keeps failing closed even when the release handle itself failed', async () => {
    const { extractor, pipelineDispose } = makeMockExtractor();
    pipelineDispose.mockRejectedValue(new Error('release exploded'));
    mockPipeline.mockResolvedValue(extractor);

    const embedder = await createOnnxTextEmbedder('.cache/models');
    await expect(embedder.dispose()).rejects.toThrow(/release exploded/);

    await expect(embedder.embed('still closed')).rejects.toThrow(
      /has been disposed; embed\(\) fails closed/,
    );
    expect(extractor).not.toHaveBeenCalled();
  });

  it('Granite embedder shares the same real dispose lifecycle', async () => {
    const { extractor, pipelineDispose } = makeMockExtractor();
    mockPipeline.mockResolvedValue(extractor);

    const embedder = await createGraniteOnnxTextEmbedder('.cache/models');
    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      GRANITE_ONNX_MODEL,
      { cache_dir: '.cache/models' },
    );

    await embedder.dispose();
    expect(pipelineDispose).toHaveBeenCalledOnce();

    await expect(embedder.embed('post dispose')).rejects.toThrow(
      /has been disposed; embed\(\) fails closed/,
    );
  });
});

// ─── Shared factory / HyDRA matcher coordination ─────────────────────────────

describe('shared embedder lifecycle coordination (SP-260)', () => {
  it('wrapHydraEmbeddingProvider.dispose() releases the shared ONNX pipeline', async () => {
    const { extractor, pipelineDispose } = makeMockExtractor();
    mockPipeline.mockResolvedValue(extractor);

    // Shared factory path: one embedder, HyDRA adapter shares its lifecycle.
    const embedder = await createTextEmbedder('minilm', '.cache/models');
    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      MINILM_ONNX_MODEL,
      { cache_dir: '.cache/models' },
    );
    const provider = wrapHydraEmbeddingProvider(embedder);

    await provider.extractRequirements('shutdown coordination');
    await provider.dispose();

    expect(pipelineDispose).toHaveBeenCalledOnce();
    await expect(provider.extractRequirements('after shutdown')).rejects.toThrow(
      /has been disposed; embed\(\) fails closed/,
    );
  });
});
