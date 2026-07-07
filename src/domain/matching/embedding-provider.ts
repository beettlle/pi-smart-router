/**
 * Shared MiniLM ONNX text embedder — SP-100.
 *
 * Embeds prompt text via Xenova/all-MiniLM-L6-v2 (384-dim) for HyDRA requirement
 * projection and semantic cluster matching. One ONNX session per instance; share
 * across matchers via a single factory call and coordinated dispose().
 */

export const EMBEDDING_DIM = 384;

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
  const moduleName = '@huggingface/transformers';
  let mod: TransformersModule;
  try {
    mod = (await import(moduleName)) as TransformersModule;
  } catch {
    throw new Error(
      `ONNX embedding requires ${moduleName}. Install: npm i ${moduleName}`,
    );
  }

  const extractor: OnnxExtractorFn = await mod.pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
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
