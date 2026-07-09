/**
 * Shared MiniLM ONNX text embedder — SP-100.
 *
 * Embeds prompt text via Xenova/all-MiniLM-L6-v2 (384-dim) for HyDRA requirement
 * projection and semantic cluster matching. One ONNX session per instance; share
 * across matchers via a single factory call and coordinated dispose().
 */
export declare const EMBEDDING_DIM = 384;
export interface TextEmbedder {
    embed(text: string): Promise<Float32Array>;
    dispose(): Promise<void>;
}
/**
 * Creates a TextEmbedder backed by @huggingface/transformers ONNX runtime.
 * Model: Xenova/all-MiniLM-L6-v2 (384-dim).
 *
 * The package is loaded dynamically — not required at compile time.
 * Install: `npm i @huggingface/transformers`
 */
export declare function createOnnxTextEmbedder(artifactCachePath: string): Promise<TextEmbedder>;
//# sourceMappingURL=embedding-provider.d.ts.map