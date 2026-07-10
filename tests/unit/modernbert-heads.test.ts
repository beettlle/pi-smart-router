import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  K4_CAPABILITY_DIMENSIONS,
  MODERNBERT_CLS_DIM,
  MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD,
  MODERNBERT_K4_HEAD_COUNT,
  MODERNBERT_ONNX_MODEL,
  ModernBertK4HeadWeightsLoaderError,
  k4CapabilityVectorToArray,
  loadModernBertK4HeadWeights,
  parseModernBertK4HeadWeightsJson,
  projectClsToK4Capabilities,
  projectClsToK4CapabilitiesPlaceholder,
  resolveModernBertK4HeadWeights,
  validateK4CapabilityVector,
  type K4CapabilityVector,
  type ModernBertK4HeadWeights,
} from '../../src/domain/matching/modernbert-heads.js';
import { k4CapabilityVectorToRequirements } from '../../src/domain/matching/hydra-matcher.js';
import { HydraConfigSchema, HydraHeadsSchema } from '../../src/domain/types/schemas.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeClsEmbedding(fill = 0): Float32Array {
  const embedding = new Float32Array(MODERNBERT_CLS_DIM);
  embedding.fill(fill);
  return embedding;
}

function makeK4HeadWeights(
  overrides: Partial<{
    reasoningScale: number;
    codeGenScale: number;
    toolUseScale: number;
    debuggingScale: number;
    bias: readonly [number, number, number, number];
  }> = {},
): ModernBertK4HeadWeights {
  const row = (scale: number): number[] =>
    Array.from({ length: MODERNBERT_CLS_DIM }, (_, index) => (index === 0 ? scale : 0));

  return {
    version: 1,
    cls_dim: MODERNBERT_CLS_DIM,
    weights: [
      row(overrides.reasoningScale ?? 1),
      row(overrides.codeGenScale ?? 0),
      row(overrides.toolUseScale ?? 0),
      row(overrides.debuggingScale ?? 0),
    ],
    bias: overrides.bias ?? [0, 0, 0, 0],
  };
}

function assertVectorInUnitInterval(vector: K4CapabilityVector): void {
  for (const key of K4_CAPABILITY_DIMENSIONS) {
    expect(vector[key]).toBeGreaterThanOrEqual(0);
    expect(vector[key]).toBeLessThanOrEqual(1);
  }
}

// ─── K=4 projection ──────────────────────────────────────────────────────────

describe('projectClsToK4Capabilities', () => {
  it('returns length-4 array with values in [0,1] for placeholder heads', () => {
    const cls = makeClsEmbedding(0.5);
    const vector = projectClsToK4Capabilities(cls);

    expect(k4CapabilityVectorToArray(vector)).toHaveLength(MODERNBERT_K4_HEAD_COUNT);
    assertVectorInUnitInterval(vector);
    validateK4CapabilityVector(vector);
  });

  it('covers all K=4 dimensions including debugging', () => {
    const vector = projectClsToK4Capabilities(makeClsEmbedding(0.25));

    expect(Object.keys(vector).sort()).toEqual([...K4_CAPABILITY_DIMENSIONS].sort());
    expect(vector.debugging).toBeTypeOf('number');
  });

  it('applies independent sigmoid heads from learned weights', () => {
    const cls = makeClsEmbedding(0);
    cls[0] = 2;
    const weights = makeK4HeadWeights({ reasoningScale: 1 });

    const vector = projectClsToK4Capabilities(cls, weights);

    expect(vector.reasoning).toBeCloseTo(1 / (1 + Math.exp(-2)), 6);
    expect(vector.code_gen).toBeCloseTo(0.5, 6);
    expect(vector.tool_use).toBeCloseTo(0.5, 6);
    expect(vector.debugging).toBeCloseTo(0.5, 6);
  });

  it('rejects wrong-dimension [CLS] embeddings', () => {
    expect(() => projectClsToK4Capabilities(new Float32Array(384))).toThrow(
      /\[CLS\] shape mismatch/,
    );
  });

  it('fires each K=4 head independently with learned weights', () => {
    const cls = makeClsEmbedding(0);

    for (const [dim, scaleKey] of [
      ['reasoning', 'reasoningScale'],
      ['code_gen', 'codeGenScale'],
      ['tool_use', 'toolUseScale'],
      ['debugging', 'debuggingScale'],
    ] as const) {
      cls.fill(0);
      cls[0] = 1;
      const weights = makeK4HeadWeights({
        reasoningScale: 0,
        codeGenScale: 0,
        toolUseScale: 0,
        debuggingScale: 0,
        [scaleKey]: 1,
      });
      const vector = projectClsToK4Capabilities(cls, weights);
      expect(vector[dim]).toBeCloseTo(1 / (1 + Math.exp(-1)), 6);
      for (const other of K4_CAPABILITY_DIMENSIONS) {
        if (other !== dim) {
          expect(vector[other]).toBeCloseTo(0.5, 6);
        }
      }
    }
  });

  it('returns k4CapabilityVectorToArray in K=4 dimension order', () => {
    const vector: K4CapabilityVector = {
      reasoning: 0.1,
      code_gen: 0.2,
      tool_use: 0.3,
      debugging: 0.4,
    };

    expect(k4CapabilityVectorToArray(vector)).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(k4CapabilityVectorToArray(vector)).toHaveLength(MODERNBERT_K4_HEAD_COUNT);
  });

  it('regresses placeholder head shape for extreme [CLS] values', () => {
    for (const fill of [-2, 0, 2]) {
      const vector = projectClsToK4CapabilitiesPlaceholder(makeClsEmbedding(fill));
      expect(k4CapabilityVectorToArray(vector)).toHaveLength(MODERNBERT_K4_HEAD_COUNT);
      assertVectorInUnitInterval(vector);
      validateK4CapabilityVector(vector);
    }
  });
});

describe('projectClsToK4CapabilitiesPlaceholder', () => {
  it('maps quarter-pooled [CLS] slices to four sigmoid outputs', () => {
    const vector = projectClsToK4CapabilitiesPlaceholder(makeClsEmbedding(1));

    expect(k4CapabilityVectorToArray(vector)).toHaveLength(4);
    assertVectorInUnitInterval(vector);
  });
});

// ─── Head weights artifact ───────────────────────────────────────────────────

describe('ModernBertK4HeadWeights loading', () => {
  it('parses valid K=4 head weights JSON', () => {
    const weights = makeK4HeadWeights();
    const parsed = parseModernBertK4HeadWeightsJson(JSON.stringify(weights));

    expect(parsed.version).toBe(1);
    expect(parsed.weights).toHaveLength(4);
    expect(parsed.weights[0]).toHaveLength(MODERNBERT_CLS_DIM);
  });

  it('returns null when artifact file is missing', () => {
    expect(loadModernBertK4HeadWeights({ filePath: '/nonexistent/k4-heads.json' })).toBeNull();
  });

  it('throws on invalid artifact shape', () => {
    expect(() => parseModernBertK4HeadWeightsJson('{"version":1}')).toThrow(
      ModernBertK4HeadWeightsLoaderError,
    );
  });

  it('resolveModernBertK4HeadWeights returns null on invalid file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'modernbert-k4-'));
    const filePath = join(dir, 'bad-heads.json');
    writeFileSync(filePath, '{"version":1}');

    try {
      expect(resolveModernBertK4HeadWeights({ filePath })).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── K=4 enablement documentation ────────────────────────────────────────────

describe('K=4 enablement threshold', () => {
  it('documents ~10% calibration Top-1 error gate for modernbert_k4', () => {
    expect(MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD).toBeCloseTo(0.1, 6);
  });

  it('documents enablement guidance in module constant and operator config', () => {
    expect(MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD).toBeGreaterThan(0);
    expect(MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD).toBeLessThanOrEqual(0.15);
    expect(HydraHeadsSchema.safeParse('modernbert_k4').success).toBe(true);
  });
});

// ─── Debugging dimension shortfall exclusion (SP-159/SP-160) ───────────────────

describe('K=4 debugging shortfall exclusion', () => {
  it('drops debugging from requirement vector before shortfall gate', () => {
    const requirements = k4CapabilityVectorToRequirements({
      reasoning: 0.4,
      code_gen: 0.5,
      tool_use: 0.6,
      debugging: 0.99,
    });

    expect(requirements).toEqual({
      reasoning: 0.4,
      code_gen: 0.5,
      tool_use: 0.6,
    });
    expect(requirements).not.toHaveProperty('debugging');
  });

  it('does not let high debugging alone inflate shortfall requirements', () => {
    const lowDebug = k4CapabilityVectorToRequirements({
      reasoning: 0.5,
      code_gen: 0.5,
      tool_use: 0.5,
      debugging: 0.1,
    });
    const highDebug = k4CapabilityVectorToRequirements({
      reasoning: 0.5,
      code_gen: 0.5,
      tool_use: 0.5,
      debugging: 1.0,
    });

    expect(highDebug).toEqual(lowDebug);
  });

  it('maps projected K=4 output to 3-dim requirements for matcher smoke', () => {
    const cls = makeClsEmbedding(0);
    cls[0] = 3;
    const weights = makeK4HeadWeights({ debuggingScale: 10 });
    const vector = projectClsToK4Capabilities(cls, weights);
    const requirements = k4CapabilityVectorToRequirements(vector);

    expect(vector.debugging).toBeGreaterThan(0.99);
    expect(requirements.reasoning).toBeCloseTo(vector.reasoning, 6);
    expect(requirements.code_gen).toBeCloseTo(vector.code_gen, 6);
    expect(requirements.tool_use).toBeCloseTo(vector.tool_use, 6);
    expect(requirements).not.toHaveProperty('debugging');
  });
});

// ─── Hydra config flag ───────────────────────────────────────────────────────

describe('HydraHeadsSchema (SP-158)', () => {
  it('accepts learned_projection and modernbert_k4', () => {
    expect(HydraHeadsSchema.safeParse('learned_projection').success).toBe(true);
    expect(HydraHeadsSchema.safeParse('modernbert_k4').success).toBe(true);
  });

  it('rejects unknown head modes', () => {
    expect(HydraHeadsSchema.safeParse('placeholder').success).toBe(false);
  });

  it('defaults hydra_heads to learned_projection in HydraConfigSchema', () => {
    const result = HydraConfigSchema.parse({
      artifact_cache_path: '.pi-smart-router/models/',
    });

    expect(result.hydra_heads).toBe('learned_projection');
  });

  it('accepts modernbert_k4 head mode in hydra config', () => {
    const result = HydraConfigSchema.safeParse({
      artifact_cache_path: '.pi-smart-router/models/',
      hydra_heads: 'modernbert_k4',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hydra_heads).toBe('modernbert_k4');
    }
  });
});

// ─── createModernBertHeadsPredictor (ONNX mock) ─────────────────────────────

const mockExtractor = vi.fn();
const mockPipeline = vi.fn(async () => mockExtractor);

vi.mock('@huggingface/transformers', () => ({
  pipeline: mockPipeline,
}));

describe('createModernBertHeadsPredictor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns K=4 capabilities from mocked ModernBERT ONNX [CLS] output', async () => {
    const cls = makeClsEmbedding(0.3);
    mockExtractor.mockResolvedValue({ data: cls });

    const { createModernBertHeadsPredictor } = await import(
      '../../src/domain/matching/modernbert-heads.js'
    );
    const predictor = await createModernBertHeadsPredictor('.cache/models');

    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      MODERNBERT_ONNX_MODEL,
      { cache_dir: '.cache/models' },
    );

    const vector = await predictor.predictCapabilities('debug this failing test');

    expect(mockExtractor).toHaveBeenCalledWith('debug this failing test', {
      pooling: 'cls',
      normalize: false,
    });
    expect(k4CapabilityVectorToArray(vector)).toHaveLength(4);
    assertVectorInUnitInterval(vector);
    expect(predictor.usesLearnedHeads()).toBe(false);

    await predictor.dispose();
  });

  it('rejects wrong-dimension ONNX [CLS] output', async () => {
    mockExtractor.mockResolvedValue({ data: new Float32Array(100) });

    const { createModernBertHeadsPredictor } = await import(
      '../../src/domain/matching/modernbert-heads.js'
    );
    const predictor = await createModernBertHeadsPredictor('.cache/models');

    await expect(predictor.predictCapabilities('bad shape')).rejects.toThrow(
      /\[CLS\] shape mismatch from ONNX/,
    );
  });
});
