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
  createCascadingTextEmbedder,
  verifyOnnxArtifactPins,
  type CascadeEmbedderTelemetry,
  type TextEmbedder,
} from '../../src/domain/matching/embedding-provider.js';
import {
  wrapHydraEmbeddingProvider,
  projectToRequirements,
  HydraMatcher,
  type EmbeddingProvider,
  type HydraProjectionWeights,
} from '../../src/domain/matching/hydra-matcher.js';
import {
  DEFAULT_ENCODER_CASCADE_CONFIG,
  RoutingFeatureSidecarSchema,
  type Encoder,
  type EncoderCascadeConfig,
} from '../../src/domain/types/schemas.js';

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

// ─── Cascading embedder (SP-292, #173 part 2) ────────────────────────────────

const CASCADE_ENABLED: EncoderCascadeConfig = {
  ...DEFAULT_ENCODER_CASCADE_CONFIG,
  enabled: true,
};

const SHORT_PROMPT = 'short prompt';
const LONG_PROMPT = 'x'.repeat(512); // at threshold → long-context encoder

interface CascadeSessionHarness {
  readonly factory: (encoder: Encoder) => Promise<TextEmbedder>;
  readonly calls: Encoder[];
  readonly sessions: Map<Encoder, TextEmbedder>;
  failLoadFor?: Encoder;
  failEmbedFor?: Encoder;
  failDisposeFor?: Encoder;
}

/** Deterministic session factory — no ONNX, records load attempts per encoder. */
function makeCascadeSessionHarness(): CascadeSessionHarness {
  const harness: CascadeSessionHarness = {
    calls: [],
    sessions: new Map(),
    factory: async (encoder: Encoder): Promise<TextEmbedder> => {
      harness.calls.push(encoder); // attempts, including failures
      if (harness.failLoadFor === encoder) {
        throw new Error(`simulated ${encoder} artifact load failure`);
      }
      const marker = encoder === 'granite' ? 0.9 : 0.1;
      const session: TextEmbedder = {
        embed: vi.fn(async () => {
          if (harness.failEmbedFor === encoder) {
            throw new Error(`simulated ${encoder} embed failure`);
          }
          return makeEmbedding(marker);
        }),
        dispose: vi.fn(async () => {
          if (harness.failDisposeFor === encoder) {
            throw new Error(`simulated ${encoder} dispose failure`);
          }
        }),
      };
      harness.sessions.set(encoder, session);
      return session;
    },
  };
  return harness;
}

function makeCascade(
  harness: CascadeSessionHarness,
  config: EncoderCascadeConfig = CASCADE_ENABLED,
) {
  return createCascadingTextEmbedder(config, '.cache/models', {
    sessionFactory: harness.factory,
  });
}

describe('createCascadingTextEmbedder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('selection', () => {
    it('routes under-threshold prompts to the primary encoder', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness);

      const vector = await embedder.embed(SHORT_PROMPT);

      expect(harness.calls).toEqual(['minilm']);
      expect(vector[0]).toBeCloseTo(0.1, 5);
      expect(embedder.lastTelemetry()).toEqual({
        encoder_selected: 'minilm',
        token_estimate: SHORT_PROMPT.length,
        cascade_threshold: 512,
        reason_code: 'under_threshold',
        cascade_fallback_reason: null,
      } satisfies CascadeEmbedderTelemetry);
    });

    it('routes at/over-threshold prompts to the long-context encoder', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness);

      const vector = await embedder.embed(LONG_PROMPT);

      expect(harness.calls).toEqual(['granite']);
      expect(vector[0]).toBeCloseTo(0.9, 5);
      expect(embedder.lastTelemetry()).toEqual({
        encoder_selected: 'granite',
        token_estimate: LONG_PROMPT.length,
        cascade_threshold: 512,
        reason_code: 'over_threshold',
        cascade_fallback_reason: null,
      } satisfies CascadeEmbedderTelemetry);
    });

    it('never mixes spaces: each embed returns exactly one encoder session vector', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness);

      const shortVector = await embedder.embed(SHORT_PROMPT);
      const longVector = await embedder.embed(LONG_PROMPT);

      const minilmSession = harness.sessions.get('minilm')!;
      const graniteSession = harness.sessions.get('granite')!;
      expect(minilmSession.embed).toHaveBeenCalledTimes(1);
      expect(graniteSession.embed).toHaveBeenCalledTimes(1);
      expect(minilmSession.embed).toHaveBeenCalledWith(SHORT_PROMPT);
      expect(graniteSession.embed).toHaveBeenCalledWith(LONG_PROMPT);
      expect(shortVector).not.toBe(longVector);
    });

    it('keeps the primary encoder for every prompt when the cascade is disabled', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness, DEFAULT_ENCODER_CASCADE_CONFIG);

      const vector = await embedder.embed(LONG_PROMPT);

      expect(harness.calls).toEqual(['minilm']);
      expect(vector[0]).toBeCloseTo(0.1, 5);
      expect(embedder.lastTelemetry()?.reason_code).toBe('cascade_disabled');
      expect(embedder.lastTelemetry()?.encoder_selected).toBe('minilm');
    });
  });

  describe('lazy load', () => {
    it('loads no session until the first embed', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness);

      expect(harness.calls).toEqual([]);
      expect(embedder.lastTelemetry()).toBeNull();
    });

    it('does not load the Granite session for short prompts', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness);

      await embedder.embed(SHORT_PROMPT);
      await embedder.embed(SHORT_PROMPT);

      expect(harness.calls).toEqual(['minilm']);
      expect(harness.sessions.has('granite')).toBe(false);
    });

    it('reuses each encoder session across prompts (one session per encoder)', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness);

      await embedder.embed(SHORT_PROMPT);
      await embedder.embed(LONG_PROMPT);
      await embedder.embed(SHORT_PROMPT);
      await embedder.embed(LONG_PROMPT);

      expect(harness.calls).toEqual(['minilm', 'granite']);
    });
  });

  describe('fallback (degrade, never mix)', () => {
    it('serves with MiniLM + explicit reason when the Granite session fails to load', async () => {
      const harness = makeCascadeSessionHarness();
      harness.failLoadFor = 'granite';
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const embedder = makeCascade(harness);

      const vector = await embedder.embed(LONG_PROMPT);

      expect(vector[0]).toBeCloseTo(0.1, 5); // MiniLM vector, not Granite
      expect(harness.calls).toEqual(['granite', 'minilm']); // tried Granite, degraded
      expect(embedder.lastTelemetry()).toEqual({
        encoder_selected: 'minilm',
        token_estimate: LONG_PROMPT.length,
        cascade_threshold: 512,
        reason_code: 'granite_fallback',
        cascade_fallback_reason: 'granite_fallback',
      } satisfies CascadeEmbedderTelemetry);
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });

    it('latches the fallback: later long prompts go straight to MiniLM without retrying Granite', async () => {
      const harness = makeCascadeSessionHarness();
      harness.failLoadFor = 'granite';
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const embedder = makeCascade(harness);

      await embedder.embed(LONG_PROMPT);
      await embedder.embed(LONG_PROMPT);

      // Granite attempted exactly once: the failure latches longContextAvailable
      // off, so the second long prompt reuses the already-loaded MiniLM session
      // (no Granite retry, no new session load).
      expect(harness.calls).toEqual(['granite', 'minilm']);
      expect(embedder.lastTelemetry()?.reason_code).toBe('granite_fallback');
      vi.restoreAllMocks();
    });

    it('falls back when the Granite session loads but embed() fails', async () => {
      const harness = makeCascadeSessionHarness();
      harness.failEmbedFor = 'granite';
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const embedder = makeCascade(harness);

      const vector = await embedder.embed(LONG_PROMPT);

      expect(vector[0]).toBeCloseTo(0.1, 5);
      expect(embedder.lastTelemetry()?.cascade_fallback_reason).toBe(
        'granite_fallback',
      );
      vi.restoreAllMocks();
    });

    it('propagates primary-encoder embed failures (fail loud, no silent swallow)', async () => {
      const harness = makeCascadeSessionHarness();
      harness.failEmbedFor = 'minilm';
      const embedder = makeCascade(harness);

      await expect(embedder.embed(SHORT_PROMPT)).rejects.toThrow(
        'simulated minilm embed failure',
      );
    });
  });

  describe('dispose', () => {
    it('closes every session that was loaded', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness);

      await embedder.embed(SHORT_PROMPT);
      await embedder.embed(LONG_PROMPT);
      await embedder.dispose();

      expect(harness.sessions.get('minilm')!.dispose).toHaveBeenCalledOnce();
      expect(harness.sessions.get('granite')!.dispose).toHaveBeenCalledOnce();
    });

    it('is idempotent and safe when no session was ever loaded', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness);

      await embedder.dispose();
      await embedder.embed(SHORT_PROMPT).catch(() => {}); // fails closed, loads nothing new
      await embedder.dispose();

      expect(harness.sessions.size).toBe(0);
    });

    it('fails closed on embed() after dispose', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness);

      await embedder.embed(SHORT_PROMPT);
      await embedder.dispose();

      await expect(embedder.embed(SHORT_PROMPT)).rejects.toThrow(
        'disposed; embed() fails closed',
      );
      expect(harness.sessions.get('minilm')!.embed).toHaveBeenCalledTimes(1);
    });

    it('fails loud when a session dispose fails', async () => {
      const harness = makeCascadeSessionHarness();
      const embedder = makeCascade(harness);

      await embedder.embed(LONG_PROMPT);
      harness.failDisposeFor = 'granite';

      await expect(embedder.dispose()).rejects.toThrow(
        'CascadingTextEmbedder dispose failed',
      );
    });
  });
});

// ─── Cascade telemetry wiring (SP-292, #173) ─────────────────────────────────

describe('cascade telemetry wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wrapHydraEmbeddingProvider exposes cascadeTelemetry for cascading embedders', async () => {
    const harness = makeCascadeSessionHarness();
    const embedder = makeCascade(harness);
    const provider = wrapHydraEmbeddingProvider(embedder);

    expect(provider.cascadeTelemetry?.()).toBeNull(); // before first embed

    await provider.extractRequirements(SHORT_PROMPT);

    expect(provider.cascadeTelemetry?.()).toEqual({
      encoder_selected: 'minilm',
      token_estimate: SHORT_PROMPT.length,
      cascade_threshold: 512,
      reason_code: 'under_threshold',
      cascade_fallback_reason: null,
    } satisfies CascadeEmbedderTelemetry);
  });

  it('wrapHydraEmbeddingProvider omits cascadeTelemetry for single-encoder embedders', () => {
    const provider = wrapHydraEmbeddingProvider(makeMockEmbedder());

    expect(provider.cascadeTelemetry).toBeUndefined();
  });

  it('HydraMatcher.match carries cascade_telemetry on the match result', async () => {
    const telemetry: CascadeEmbedderTelemetry = {
      encoder_selected: 'granite',
      token_estimate: 700,
      cascade_threshold: 512,
      reason_code: 'over_threshold',
      cascade_fallback_reason: null,
    };
    const provider: EmbeddingProvider = {
      extractRequirements: vi.fn(async () => ({
        reasoning: 0.5,
        code_gen: 0.5,
        tool_use: 0.5,
      })),
      cascadeTelemetry: () => telemetry,
      dispose: vi.fn(async () => {}),
    };
    const matcher = new HydraMatcher(provider, {
      artifactCachePath: '.cache/models',
    });

    const result = await matcher.match(
      {
        request_id: '00000000-0000-4000-8000-0000000000c1',
        session_id: 'sess-1',
        prompt_text: LONG_PROMPT,
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

    expect(result.cascade_telemetry).toEqual(telemetry);
  });

  it('HydraMatcher.match omits cascade_telemetry on single-encoder providers', async () => {
    const provider: EmbeddingProvider = {
      extractRequirements: vi.fn(async () => ({
        reasoning: 0.5,
        code_gen: 0.5,
        tool_use: 0.5,
      })),
      dispose: vi.fn(async () => {}),
    };
    const matcher = new HydraMatcher(provider, {
      artifactCachePath: '.cache/models',
    });

    const result = await matcher.match(
      {
        request_id: '00000000-0000-4000-8000-0000000000c2',
        session_id: 'sess-1',
        prompt_text: SHORT_PROMPT,
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

    expect(result.cascade_telemetry).toBeUndefined();
  });

  it('feature sidecar schema accepts the cascade telemetry fields', () => {
    const parsed = RoutingFeatureSidecarSchema.parse({
      triage: null,
      requirements: null,
      candidates: null,
      tier_hint: null,
      tier_hint_reason_code: null,
      low_intensity_score: null,
      p_success_cheap: null,
      p_success_raw: null,
      p_success_calibrated: null,
      p_success_alpha: null,
      local_eligible_reason: null,
      encoder_selected: 'granite',
      token_estimate: 700,
      cascade_threshold: 512,
      cascade_fallback_reason: 'granite_fallback',
    });

    expect(parsed.encoder_selected).toBe('granite');
    expect(parsed.token_estimate).toBe(700);
    expect(parsed.cascade_threshold).toBe(512);
    expect(parsed.cascade_fallback_reason).toBe('granite_fallback');
  });
});

// ─── HyDRA integration: cascade path via createHydraMatcherFromHydraConfig ───

describe('createHydraMatcherFromHydraConfig encoder cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractor.mockResolvedValue({ data: makeEmbedding(0.3) });
  });

  const FLEET = [
    {
      id: 'model-a',
      tier: 'economical-cloud' as const,
      provider: 'openai',
      capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
      pricing: { fallback_cost_per_1m: 1 },
    },
  ];

  it('keeps the single-encoder path when the cascade is disabled (default)', async () => {
    const { createHydraMatcherFromHydraConfig } = await import(
      '../../src/domain/matching/hydra-matcher.js'
    );

    const matcher = await createHydraMatcherFromHydraConfig({
      artifact_cache_path: '.cache/models',
      encoder: 'minilm',
      encoder_cascade: DEFAULT_ENCODER_CASCADE_CONFIG,
    });

    await matcher.match(
      {
        request_id: '00000000-0000-4000-8000-0000000000d1',
        session_id: 'sess-1',
        prompt_text: LONG_PROMPT,
      },
      FLEET,
    );

    const models = mockPipeline.mock.calls.map(
      (call) => (call as unknown[])[1],
    );
    expect(models).toEqual([MINILM_ONNX_MODEL]);
    expect(models).not.toContain(GRANITE_ONNX_MODEL);

    await matcher.dispose();
  });

  it('routes over-threshold prompts to Granite and exposes telemetry when enabled', async () => {
    const { createHydraMatcherFromHydraConfig } = await import(
      '../../src/domain/matching/hydra-matcher.js'
    );

    const matcher = await createHydraMatcherFromHydraConfig({
      artifact_cache_path: '.cache/models',
      encoder: 'minilm',
      encoder_cascade: CASCADE_ENABLED,
    });

    // Short prompt: no Granite session is loaded (lazy).
    await matcher.match(
      {
        request_id: '00000000-0000-4000-8000-0000000000d2',
        session_id: 'sess-1',
        prompt_text: SHORT_PROMPT,
      },
      FLEET,
    );
    expect(
      mockPipeline.mock.calls.map((call) => (call as unknown[])[1]),
    ).toEqual([
      MINILM_ONNX_MODEL,
    ]);

    // Long prompt: Granite session loads on first over-threshold hit.
    const result = await matcher.match(
      {
        request_id: '00000000-0000-4000-8000-0000000000d3',
        session_id: 'sess-1',
        prompt_text: LONG_PROMPT,
      },
      FLEET,
    );
    expect(
      mockPipeline.mock.calls.map((call) => (call as unknown[])[1]),
    ).toEqual([
      MINILM_ONNX_MODEL,
      GRANITE_ONNX_MODEL,
    ]);
    // The gate estimates tokens over the metadata-prefixed HyDRA input — the
    // exact text the encoder embeds (and would truncate), so >= threshold.
    expect(result.cascade_telemetry).toMatchObject({
      encoder_selected: 'granite',
      cascade_threshold: 512,
      reason_code: 'over_threshold',
      cascade_fallback_reason: null,
    });
    expect(result.cascade_telemetry?.token_estimate).toBeGreaterThanOrEqual(
      LONG_PROMPT.length,
    );

    await matcher.dispose();
  });
});
