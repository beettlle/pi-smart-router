import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  EMBEDDING_DIM,
  GRANITE_ONNX_MODEL,
  MINILM_ONNX_MODEL,
  ONNX_PIN_FILE_ENV,
  ONNX_PIN_MODE_ENV,
  verifyOnnxArtifactPins,
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

const mockExtractor = Object.assign(vi.fn(), {
  dispose: vi.fn(async () => {}),
});
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

// ─── ONNX artifact digest pinning (SP-259, #147) ─────────────────────────────

describe('verifyOnnxArtifactPins', () => {
  const PINNED_REL_PATH = 'onnx/model_quantized.onnx';
  const FIXTURE_CONTENT = Buffer.from('fixture-onnx-weights');
  const FIXTURE_DIGEST = createHash('sha256').update(FIXTURE_CONTENT).digest('hex');
  const OTHER_DIGEST = createHash('sha256').update('other').digest('hex');

  let tmpDir: string;
  let cacheDir: string;
  let pinFilePath: string;

  async function writeCachedArtifact(
    modelId: string,
    content: Buffer = FIXTURE_CONTENT,
  ): Promise<void> {
    const artifactPath = path.join(cacheDir, modelId, PINNED_REL_PATH);
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, content);
  }

  async function writePinFile(
    pins: Record<string, Record<string, string>>,
  ): Promise<void> {
    await fs.writeFile(pinFilePath, JSON.stringify({ version: 1, pins }));
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sp259-pins-'));
    cacheDir = path.join(tmpDir, 'cache');
    pinFilePath = path.join(tmpDir, 'pins.json');
    await fs.mkdir(cacheDir, { recursive: true });
    delete process.env[ONNX_PIN_MODE_ENV];
    delete process.env[ONNX_PIN_FILE_ENV];
  });

  afterEach(async () => {
    delete process.env[ONNX_PIN_MODE_ENV];
    delete process.env[ONNX_PIN_FILE_ENV];
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('mode off skips verification entirely (no pin file needed)', async () => {
    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, { pinMode: 'off' }),
    ).resolves.toBeUndefined();
  });

  it('verify mode passes when cached artifact matches the pin', async () => {
    await writeCachedArtifact(MINILM_ONNX_MODEL);
    await writePinFile({ [MINILM_ONNX_MODEL]: { [PINNED_REL_PATH]: FIXTURE_DIGEST } });

    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, {
        pinMode: 'verify',
        pinFilePath,
      }),
    ).resolves.toBeUndefined();
  });

  it('verify mode fails closed on digest mismatch', async () => {
    await writeCachedArtifact(MINILM_ONNX_MODEL, Buffer.from('tampered-weights'));
    await writePinFile({ [MINILM_ONNX_MODEL]: { [PINNED_REL_PATH]: FIXTURE_DIGEST } });

    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, {
        pinMode: 'verify',
        pinFilePath,
      }),
    ).rejects.toThrow(/digest mismatch/);
  });

  it('fails closed when a pinned artifact is missing from the cache', async () => {
    await writePinFile({ [MINILM_ONNX_MODEL]: { [PINNED_REL_PATH]: FIXTURE_DIGEST } });

    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, {
        pinMode: 'verify',
        pinFilePath,
      }),
    ).rejects.toThrow(/missing from cache/);
  });

  it('verify mode allows unpinned models (first-run dogfood download)', async () => {
    await writePinFile({ [GRANITE_ONNX_MODEL]: { [PINNED_REL_PATH]: OTHER_DIGEST } });

    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, {
        pinMode: 'verify',
        pinFilePath,
      }),
    ).resolves.toBeUndefined();
  });

  it('verify mode without a pin file skips verification', async () => {
    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, {
        pinMode: 'verify',
        pinFilePath,
      }),
    ).resolves.toBeUndefined();
  });

  it('enforce mode fails closed when the pin file is missing', async () => {
    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, {
        pinMode: 'enforce',
        pinFilePath,
      }),
    ).rejects.toThrow(/requires a readable pin file/);
  });

  it('enforce mode fails closed when the model has no pins', async () => {
    await writePinFile({ [GRANITE_ONNX_MODEL]: { [PINNED_REL_PATH]: OTHER_DIGEST } });

    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, {
        pinMode: 'enforce',
        pinFilePath,
      }),
    ).rejects.toThrow(/requires pins for/);
  });

  it('enforce mode passes with valid pins and matching cache', async () => {
    await writeCachedArtifact(GRANITE_ONNX_MODEL);
    await writePinFile({ [GRANITE_ONNX_MODEL]: { [PINNED_REL_PATH]: FIXTURE_DIGEST } });

    await expect(
      verifyOnnxArtifactPins(GRANITE_ONNX_MODEL, cacheDir, {
        pinMode: 'enforce',
        pinFilePath,
      }),
    ).resolves.toBeUndefined();
  });

  it('fails closed on malformed pin digests', async () => {
    await writeCachedArtifact(MINILM_ONNX_MODEL);
    await writePinFile({ [MINILM_ONNX_MODEL]: { [PINNED_REL_PATH]: 'not-a-sha256' } });

    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, {
        pinMode: 'verify',
        pinFilePath,
      }),
    ).rejects.toThrow(/Invalid SHA-256 pin/);
  });

  it('fails closed on unparseable pin file', async () => {
    await fs.writeFile(pinFilePath, '{not json');

    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, {
        pinMode: 'verify',
        pinFilePath,
      }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it('resolves hub-style cache layout (models--org--name/snapshots/<rev>/)', async () => {
    const artifactPath = path.join(
      cacheDir,
      'models--Xenova--all-MiniLM-L6-v2',
      'snapshots',
      'abc123',
      PINNED_REL_PATH,
    );
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, FIXTURE_CONTENT);
    await writePinFile({ [MINILM_ONNX_MODEL]: { [PINNED_REL_PATH]: FIXTURE_DIGEST } });

    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir, {
        pinMode: 'enforce',
        pinFilePath,
      }),
    ).resolves.toBeUndefined();
  });

  it('reads pin mode and pin file from env vars', async () => {
    await writeCachedArtifact(MINILM_ONNX_MODEL);
    await writePinFile({ [MINILM_ONNX_MODEL]: { [PINNED_REL_PATH]: FIXTURE_DIGEST } });
    process.env[ONNX_PIN_MODE_ENV] = 'enforce';
    process.env[ONNX_PIN_FILE_ENV] = pinFilePath;

    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir),
    ).resolves.toBeUndefined();
  });

  it('rejects an invalid pin mode env value (fail loud)', async () => {
    process.env[ONNX_PIN_MODE_ENV] = 'yolo';

    await expect(
      verifyOnnxArtifactPins(MINILM_ONNX_MODEL, cacheDir),
    ).rejects.toThrow(/Invalid ONNX artifact pin mode/);
  });
});

describe('createOnnxTextEmbedder with artifact pins', () => {
  const PINNED_REL_PATH = 'onnx/model_quantized.onnx';
  const FIXTURE_CONTENT = Buffer.from('pipeline-fixture-weights');
  const FIXTURE_DIGEST = createHash('sha256').update(FIXTURE_CONTENT).digest('hex');

  let tmpDir: string;
  let cacheDir: string;
  let pinFilePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExtractor.mockResolvedValue({ data: makeEmbedding(0.4) });
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sp259-embedder-'));
    cacheDir = path.join(tmpDir, 'cache');
    pinFilePath = path.join(tmpDir, 'pins.json');
    const artifactPath = path.join(cacheDir, MINILM_ONNX_MODEL, PINNED_REL_PATH);
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, FIXTURE_CONTENT);
    delete process.env[ONNX_PIN_MODE_ENV];
    delete process.env[ONNX_PIN_FILE_ENV];
  });

  afterEach(async () => {
    delete process.env[ONNX_PIN_MODE_ENV];
    delete process.env[ONNX_PIN_FILE_ENV];
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads and embeds when the pinned artifact matches', async () => {
    await fs.writeFile(
      pinFilePath,
      JSON.stringify({
        version: 1,
        pins: { [MINILM_ONNX_MODEL]: { [PINNED_REL_PATH]: FIXTURE_DIGEST } },
      }),
    );

    const { createOnnxTextEmbedder } = await import(
      '../../src/domain/matching/embedding-provider.js'
    );
    const embedder = await createOnnxTextEmbedder(cacheDir, {
      pinMode: 'enforce',
      pinFilePath,
    });

    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      MINILM_ONNX_MODEL,
      { cache_dir: cacheDir },
    );
    const result = await embedder.embed('pinned load');
    expect(result.length).toBe(EMBEDDING_DIM);
  });

  it('fails closed on load when the cached artifact mismatches the pin', async () => {
    await fs.writeFile(
      pinFilePath,
      JSON.stringify({
        version: 1,
        pins: {
          [MINILM_ONNX_MODEL]: {
            [PINNED_REL_PATH]: createHash('sha256').update('expected').digest('hex'),
          },
        },
      }),
    );

    const { createOnnxTextEmbedder } = await import(
      '../../src/domain/matching/embedding-provider.js'
    );

    await expect(
      createOnnxTextEmbedder(cacheDir, { pinMode: 'verify', pinFilePath }),
    ).rejects.toThrow(/digest mismatch/);
  });

  it('fails closed in enforce mode when pins are missing (CI/prod)', async () => {
    const { createOnnxTextEmbedder } = await import(
      '../../src/domain/matching/embedding-provider.js'
    );

    await expect(
      createOnnxTextEmbedder(cacheDir, { pinMode: 'enforce', pinFilePath }),
    ).rejects.toThrow(/requires a readable pin file/);
  });

  it('verifies on load when pin mode is enabled via env vars', async () => {
    process.env[ONNX_PIN_MODE_ENV] = 'verify';
    process.env[ONNX_PIN_FILE_ENV] = pinFilePath;
    await fs.writeFile(
      pinFilePath,
      JSON.stringify({
        version: 1,
        pins: {
          [MINILM_ONNX_MODEL]: {
            [PINNED_REL_PATH]: createHash('sha256').update('expected').digest('hex'),
          },
        },
      }),
    );

    const { createOnnxTextEmbedder } = await import(
      '../../src/domain/matching/embedding-provider.js'
    );

    await expect(createOnnxTextEmbedder(cacheDir)).rejects.toThrow(/digest mismatch/);
  });

  it('shipped pin file is valid JSON with well-formed SHA-256 pins for both models', async () => {
    const shipped = JSON.parse(
      await fs.readFile(
        path.join(process.cwd(), 'config', 'onnx-artifact-pins.json'),
        'utf8',
      ),
    ) as { pins: Record<string, Record<string, string>> };

    expect(Object.keys(shipped.pins)).toEqual(
      expect.arrayContaining([MINILM_ONNX_MODEL, GRANITE_ONNX_MODEL]),
    );
    for (const modelPins of Object.values(shipped.pins)) {
      for (const digest of Object.values(modelPins)) {
        expect(digest).toMatch(/^[0-9a-f]{64}$/);
      }
    }
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
