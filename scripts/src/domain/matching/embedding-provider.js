/**
 * Shared MiniLM ONNX text embedder — SP-100.
 *
 * Embeds prompt text via Xenova/all-MiniLM-L6-v2 (384-dim) for HyDRA requirement
 * projection and semantic cluster matching. One ONNX session per instance; share
 * across matchers via a single factory call and coordinated dispose().
 */
export const EMBEDDING_DIM = 384;
/**
 * Creates a TextEmbedder backed by @huggingface/transformers ONNX runtime.
 * Model: Xenova/all-MiniLM-L6-v2 (384-dim).
 *
 * The package is loaded dynamically — not required at compile time.
 * Install: `npm i @huggingface/transformers`
 */
export async function createOnnxTextEmbedder(artifactCachePath) {
    const moduleName = '@huggingface/transformers';
    let mod;
    try {
        mod = (await import(moduleName));
    }
    catch {
        throw new Error(`ONNX embedding requires ${moduleName}. Install: npm i ${moduleName}`);
    }
    const extractor = await mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { cache_dir: artifactCachePath });
    return {
        async embed(text) {
            const output = await extractor(text, {
                pooling: 'mean',
                normalize: true,
            });
            if (output.data.length !== EMBEDDING_DIM) {
                throw new Error(`Embedding shape mismatch: expected ${EMBEDDING_DIM}, got ${output.data.length}`);
            }
            return output.data;
        },
        async dispose() {
            /* @huggingface/transformers pipelines have no explicit dispose */
        },
    };
}
//# sourceMappingURL=embedding-provider.js.map