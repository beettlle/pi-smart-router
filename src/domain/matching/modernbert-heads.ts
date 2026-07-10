/**
 * ModernBERT-base K=4 capability heads — SP-158, #81.
 *
 * Optional HyDRA-fidelity encoder path: ModernBERT-base ONNX with K=4 independent
 * sigmoid heads on the [CLS] token (reasoning, code_gen, tool_use, debugging).
 *
 * **When to enable K=4 (`hydra_heads: modernbert_k4`):** Prefer SP-115
 * `learned_projection` until offline calibration Top-1 error exceeds ~10%
 * (routing-roadmap.md §2 P3). The fourth debugging dimension adds matcher
 * fidelity for terminal/tool-loop workloads; wiring into shortfall is SP-159.
 *
 * Module only — matcher integration is SP-159.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

// ─── Model constants ─────────────────────────────────────────────────────────

/** ModernBERT-base ONNX artifact for @huggingface/transformers (768-dim [CLS]). */
export const MODERNBERT_ONNX_MODEL = 'onnx-community/ModernBERT-base-ONNX';

export const MODERNBERT_CLS_DIM = 768;

export const MODERNBERT_K4_HEAD_COUNT = 4;

/** Recommended calibration Top-1 error threshold before enabling K=4 heads. */
export const MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD = 0.1;

export const K4_CAPABILITY_DIMENSIONS = [
  'reasoning',
  'code_gen',
  'tool_use',
  'debugging',
] as const;

export type K4CapabilityDimension = (typeof K4_CAPABILITY_DIMENSIONS)[number];

export interface K4CapabilityVector {
  readonly reasoning: number;
  readonly code_gen: number;
  readonly tool_use: number;
  readonly debugging: number;
}

export const DEFAULT_MODERNBERT_K4_HEADS_PATH = resolve(
  'config',
  'modernbert-k4-heads.json',
);

// ─── Head weights artifact ───────────────────────────────────────────────────

export const ModernBertK4HeadWeightsSchema = z.object({
  version: z.literal(1),
  cls_dim: z.literal(MODERNBERT_CLS_DIM),
  weights: z
    .array(z.array(z.number().finite()).length(MODERNBERT_CLS_DIM))
    .length(MODERNBERT_K4_HEAD_COUNT),
  bias: z.array(z.number().finite()).length(MODERNBERT_K4_HEAD_COUNT),
});

export interface ModernBertK4HeadWeights {
  readonly version: 1;
  readonly cls_dim: typeof MODERNBERT_CLS_DIM;
  readonly weights: readonly (readonly number[])[];
  readonly bias: readonly number[];
}

export interface LoadModernBertK4HeadWeightsOptions {
  readonly filePath?: string;
}

export class ModernBertK4HeadWeightsLoaderError extends Error {
  override readonly name = 'ModernBertK4HeadWeightsLoaderError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
}

export function parseModernBertK4HeadWeightsJson(raw: string): ModernBertK4HeadWeights {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ModernBertK4HeadWeightsLoaderError(`Failed to parse JSON: ${message}`, {
      cause: err,
    });
  }

  const result = ModernBertK4HeadWeightsSchema.safeParse(parsed);
  if (!result.success) {
    throw new ModernBertK4HeadWeightsLoaderError(
      `Invalid ModernBERT K=4 head weights artifact:\n${formatZodIssues(result.error)}`,
      { cause: result.error },
    );
  }

  return result.data;
}

export function loadModernBertK4HeadWeights(
  options?: LoadModernBertK4HeadWeightsOptions,
): ModernBertK4HeadWeights | null {
  const filePath = options?.filePath ?? DEFAULT_MODERNBERT_K4_HEADS_PATH;

  if (!existsSync(filePath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ModernBertK4HeadWeightsLoaderError(`Failed to read weights file: ${message}`, {
      cause: err,
    });
  }

  return parseModernBertK4HeadWeightsJson(raw);
}

export function resolveModernBertK4HeadWeights(
  options?: LoadModernBertK4HeadWeightsOptions,
): ModernBertK4HeadWeights | null {
  try {
    return loadModernBertK4HeadWeights(options);
  } catch (err: unknown) {
    console.warn('ModernBERT K=4 head weights artifact invalid; using placeholder heads', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Head math (768-dim [CLS] → K=4 sigmoid) ─────────────────────────────────

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function meanSlice(embedding: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += embedding[i] ?? 0;
  }
  return sum / (end - start);
}

function linearK4Projection(
  clsEmbedding: Float32Array,
  weights: ModernBertK4HeadWeights,
): readonly [number, number, number, number] {
  const logits: number[] = [];

  for (let head = 0; head < MODERNBERT_K4_HEAD_COUNT; head++) {
    const row = weights.weights[head]!;
    let sum = weights.bias[head] ?? 0;
    for (let i = 0; i < MODERNBERT_CLS_DIM; i++) {
      sum += (clsEmbedding[i] ?? 0) * (row[i] ?? 0);
    }
    logits.push(sum);
  }

  return [logits[0]!, logits[1]!, logits[2]!, logits[3]!];
}

/** Deterministic quarter-pooled [CLS] placeholder when learned head weights are absent. */
export function projectClsToK4CapabilitiesPlaceholder(
  clsEmbedding: Float32Array,
): K4CapabilityVector {
  const quarter = Math.floor(MODERNBERT_CLS_DIM / MODERNBERT_K4_HEAD_COUNT);

  return {
    reasoning: sigmoid(meanSlice(clsEmbedding, 0, quarter)),
    code_gen: sigmoid(meanSlice(clsEmbedding, quarter, 2 * quarter)),
    tool_use: sigmoid(meanSlice(clsEmbedding, 2 * quarter, 3 * quarter)),
    debugging: sigmoid(meanSlice(clsEmbedding, 3 * quarter, MODERNBERT_CLS_DIM)),
  };
}

/** Apply K=4 independent sigmoid heads to a ModernBERT [CLS] embedding. */
export function projectClsToK4Capabilities(
  clsEmbedding: Float32Array,
  weights?: ModernBertK4HeadWeights | null,
): K4CapabilityVector {
  if (clsEmbedding.length !== MODERNBERT_CLS_DIM) {
    throw new Error(
      `[CLS] shape mismatch: expected ${MODERNBERT_CLS_DIM}, got ${clsEmbedding.length}`,
    );
  }

  if (!weights) {
    return projectClsToK4CapabilitiesPlaceholder(clsEmbedding);
  }

  const [reasoningLogit, codeGenLogit, toolUseLogit, debuggingLogit] = linearK4Projection(
    clsEmbedding,
    weights,
  );

  return {
    reasoning: sigmoid(reasoningLogit),
    code_gen: sigmoid(codeGenLogit),
    tool_use: sigmoid(toolUseLogit),
    debugging: sigmoid(debuggingLogit),
  };
}

/** Flat K=4 head output as a length-4 array (values in [0, 1]). */
export function k4CapabilityVectorToArray(vector: K4CapabilityVector): readonly number[] {
  return [
    vector.reasoning,
    vector.code_gen,
    vector.tool_use,
    vector.debugging,
  ] as const;
}

export function validateK4CapabilityVector(vector: K4CapabilityVector): void {
  for (const key of K4_CAPABILITY_DIMENSIONS) {
    const value = vector[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Invalid K=4 capability dimension '${key}': ${String(value)}`);
    }
    if (value < 0 || value > 1) {
      throw new Error(
        `K=4 capability dimension '${key}' out of range [0,1]: ${String(value)}`,
      );
    }
  }
}

// ─── ONNX runtime integration ────────────────────────────────────────────────

interface OnnxPipelineOutput {
  readonly data: Float32Array;
}

type OnnxClsExtractorFn = (
  text: string,
  options: { readonly pooling: 'cls'; readonly normalize: boolean },
) => Promise<OnnxPipelineOutput>;

interface TransformersModule {
  pipeline(
    task: string,
    model: string,
    options: Record<string, unknown>,
  ): Promise<OnnxClsExtractorFn>;
}

async function loadTransformersModule(): Promise<TransformersModule> {
  const moduleName = '@huggingface/transformers';
  try {
    return (await import(moduleName)) as TransformersModule;
  } catch {
    throw new Error(
      `ModernBERT K=4 heads require ${moduleName}. Install: npm i ${moduleName}`,
    );
  }
}

export interface ModernBertHeadsPredictor {
  predictCapabilities(text: string): Promise<K4CapabilityVector>;
  usesLearnedHeads(): boolean;
  dispose(): Promise<void>;
}

export interface CreateModernBertHeadsPredictorOptions {
  readonly headWeightsPath?: string;
}

/**
 * Creates a predictor backed by ModernBERT-base ONNX [CLS] extraction plus
 * optional learned K=4 head weights.
 */
export async function createModernBertHeadsPredictor(
  artifactCachePath: string,
  options?: CreateModernBertHeadsPredictorOptions,
): Promise<ModernBertHeadsPredictor> {
  const mod = await loadTransformersModule();
  const extractor: OnnxClsExtractorFn = await mod.pipeline(
    'feature-extraction',
    MODERNBERT_ONNX_MODEL,
    { cache_dir: artifactCachePath },
  );

  const headWeights = resolveModernBertK4HeadWeights(
    options?.headWeightsPath ? { filePath: options.headWeightsPath } : undefined,
  );

  return {
    usesLearnedHeads(): boolean {
      return headWeights !== null;
    },

    async predictCapabilities(text: string): Promise<K4CapabilityVector> {
      const output = await extractor(text, { pooling: 'cls', normalize: false });
      if (output.data.length !== MODERNBERT_CLS_DIM) {
        throw new Error(
          `[CLS] shape mismatch from ONNX: expected ${MODERNBERT_CLS_DIM}, got ${output.data.length}`,
        );
      }

      const vector = projectClsToK4Capabilities(output.data, headWeights);
      validateK4CapabilityVector(vector);
      return vector;
    },

    async dispose(): Promise<void> {
      /* @huggingface/transformers pipelines have no explicit dispose */
    },
  };
}
