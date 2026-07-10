/**
 * Shared ONNX text embedders — SP-100 (MiniLM), SP-156 (Granite trial).
 *
 * Embeds prompt text for HyDRA requirement projection and semantic cluster
 * matching. One ONNX session per instance; share across matchers via a single
 * factory call and coordinated dispose().
 */

import type { Encoder } from '../types/schemas.js';
import { DEFAULT_ENCODER } from '../types/schemas.js';

export const EMBEDDING_DIM = 384;

/** MiniLM ONNX model (384-dim, 512-token context). */
export const MINILM_ONNX_MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * Granite 97M ONNX artifact for @huggingface/transformers.
 * Source weights: ibm-granite/granite-embedding-97m-multilingual-r2 (384-dim).
 */
export const GRANITE_ONNX_MODEL =
  'onnx-community/granite-embedding-97m-multilingual-r2-ONNX';

export interface TextEmbedder {
  embed(text: string): Promise<Float32Array>;
  dispose(): Promise<void>;
}

// ─── ONNX runtime types ───────────────────────────────────────────────────────

interface OnnxPipelineOutput {
  readonly data: Float32Array;
}

type OnnxExtractorFn = (
  text: string,
  options: { readonly pooling: string; readonly normalize: boolean },
) => Promise<OnnxPipelineOutput>;

interface TransformersModule {
  pipeline(
    task: string,
    model: string,
    options: Record<string, unknown>,
  ): Promise<OnnxExtractorFn>;
}

async function loadTransformersModule(): Promise<TransformersModule> {
  const moduleName = '@huggingface/transformers';
  try {
    return (await import(moduleName)) as TransformersModule;
  } catch {
    throw new Error(
      `ONNX embedding requires ${moduleName}. Install: npm i ${moduleName}`,
    );
  }
}

async function createOnnxFeatureEmbedder(
  modelId: string,
  artifactCachePath: string,
): Promise<TextEmbedder> {
  const mod = await loadTransformersModule();
  const extractor: OnnxExtractorFn = await mod.pipeline(
    'feature-extraction',
    modelId,
    { cache_dir: artifactCachePath },
  );

  return {
    async embed(text: string): Promise<Float32Array> {
      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true,
      });
      if (output.data.length !== EMBEDDING_DIM) {
        throw new Error(
          `Embedding shape mismatch: expected ${EMBEDDING_DIM}, got ${output.data.length}`,
        );
      }
      return output.data;
    },

    async dispose(): Promise<void> {
      /* @huggingface/transformers pipelines have no explicit dispose */
    },
  };
}

/**
 * Creates a TextEmbedder backed by @huggingface/transformers ONNX runtime.
 * Model: Xenova/all-MiniLM-L6-v2 (384-dim).
 *
 * The package is loaded dynamically — not required at compile time.
 * Install: `npm i @huggingface/transformers`
 */
export async function createOnnxTextEmbedder(
  artifactCachePath: string,
): Promise<TextEmbedder> {
  return createOnnxFeatureEmbedder(MINILM_ONNX_MODEL, artifactCachePath);
}

/**
 * Granite 97M long-context embedder (384-dim ONNX drop-in for SP-115 head).
 * Model: ibm-granite/granite-embedding-97m-multilingual-r2 via ONNX runtime.
 */
export async function createGraniteOnnxTextEmbedder(
  artifactCachePath: string,
): Promise<TextEmbedder> {
  return createOnnxFeatureEmbedder(GRANITE_ONNX_MODEL, artifactCachePath);
}

/** Select ONNX text embedder by operator encoder flag. */
export async function createTextEmbedder(
  encoder: Encoder = DEFAULT_ENCODER,
  artifactCachePath: string,
): Promise<TextEmbedder> {
  switch (encoder) {
    case 'granite':
      return createGraniteOnnxTextEmbedder(artifactCachePath);
    case 'minilm':
      return createOnnxTextEmbedder(artifactCachePath);
    default: {
      const _exhaustive: never = encoder;
      throw new Error(`Unsupported encoder: ${String(_exhaustive)}`);
    }
  }
}
