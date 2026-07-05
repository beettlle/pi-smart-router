/**
 * HyDRA embedding matcher — T048, FR-005.
 *
 * Embeds prompt text via ONNX (Xenova/all-MiniLM-L6-v2 384-dim),
 * projects to requirement dimensions [reasoning, code_gen, tool_use],
 * and scores fleet candidates with a shortfall gate.
 *
 * Shortfall gate (data-model §Validation): candidate excluded when
 * any capability dimension shortfall > 0 (quality parity).
 *
 * Budget: 80–120 ms (configurable, default 100 ms).
 */
const DEFAULT_BUDGET_MS = 100;
const MIN_BUDGET_MS = 80;
const MAX_BUDGET_MS = 120;
const EMBEDDING_DIM = 384;
// ─── Scoring helpers ─────────────────────────────────────────────────────────
function dimensionShortfall(requirement, capability) {
    return Math.max(0, requirement - capability);
}
function computeShortfall(requirement, capabilities) {
    const reasoning = dimensionShortfall(requirement.reasoning, capabilities.reasoning);
    const codeGen = dimensionShortfall(requirement.code_gen, capabilities.code_gen);
    const toolUse = dimensionShortfall(requirement.tool_use, capabilities.tool_use);
    return {
        perDimension: { reasoning, code_gen: codeGen, tool_use: toolUse },
        max: Math.max(reasoning, codeGen, toolUse),
        total: reasoning + codeGen + toolUse,
    };
}
function cosineSimilarity(a, b) {
    const dot = a.reasoning * b.reasoning + a.code_gen * b.code_gen + a.tool_use * b.tool_use;
    const magA = Math.sqrt(a.reasoning ** 2 + a.code_gen ** 2 + a.tool_use ** 2);
    const magB = Math.sqrt(b.reasoning ** 2 + b.code_gen ** 2 + b.tool_use ** 2);
    if (magA === 0 || magB === 0)
        return 0;
    return dot / (magA * magB);
}
// ─── Projection helpers (384-dim → 3 requirement dimensions) ─────────────────
function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}
function meanSlice(embedding, start, end) {
    let sum = 0;
    for (let i = start; i < end; i++) {
        sum += embedding[i] ?? 0;
    }
    return sum / (end - start);
}
/**
 * Fixed deterministic projection from 384-dim embedding to 3 requirement
 * dimensions via mean-pooled thirds + sigmoid normalization.
 *
 * Production refinement: replace with a learned linear projection loaded
 * from artifact cache (Phase 2).
 */
export function projectToRequirements(embedding) {
    if (embedding.length !== EMBEDDING_DIM) {
        throw new Error(`Embedding shape mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`);
    }
    const third = Math.floor(EMBEDDING_DIM / 3);
    return {
        reasoning: sigmoid(meanSlice(embedding, 0, third)),
        code_gen: sigmoid(meanSlice(embedding, third, 2 * third)),
        tool_use: sigmoid(meanSlice(embedding, 2 * third, EMBEDDING_DIM)),
    };
}
// ─── HydraMatcher ────────────────────────────────────────────────────────────
export class HydraMatcher {
    provider;
    budgetMs;
    constructor(provider, config) {
        const budget = config.budgetMs ?? DEFAULT_BUDGET_MS;
        if (budget < MIN_BUDGET_MS || budget > MAX_BUDGET_MS) {
            throw new Error(`HyDRA budget must be ${MIN_BUDGET_MS}–${MAX_BUDGET_MS}ms, got ${budget}ms`);
        }
        this.provider = provider;
        this.budgetMs = budget;
    }
    async match(request, fleet) {
        const start = performance.now();
        const requirements = await this.provider.extractRequirements(request.prompt_text);
        this.validateRequirements(requirements);
        const healthyFleet = fleet.filter((m) => m.healthy !== false);
        const candidates = [];
        for (const model of healthyFleet) {
            const elapsed = performance.now() - start;
            if (elapsed > this.budgetMs) {
                break;
            }
            const shortfall = computeShortfall(requirements, model.capabilities);
            const hasShortfall = shortfall.max > 0;
            const score = hasShortfall
                ? 0
                : cosineSimilarity(requirements, model.capabilities);
            candidates.push({
                model_id: model.id,
                score,
                shortfall: shortfall.max,
                rejected_reason: hasShortfall ? 'shortfall_gate' : null,
            });
        }
        const viable = candidates.filter((c) => c.rejected_reason === null);
        const best = viable.length > 0
            ? viable.reduce((a, b) => (b.score > a.score ? b : a))
            : null;
        const elapsedMs = performance.now() - start;
        return {
            selected: best,
            candidates,
            requirements,
            elapsedMs,
            budgetExceeded: elapsedMs > this.budgetMs,
        };
    }
    async dispose() {
        await this.provider.dispose();
    }
    validateRequirements(req) {
        const dims = [
            'reasoning',
            'code_gen',
            'tool_use',
        ];
        for (const key of dims) {
            const value = req[key];
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                throw new Error(`Invalid requirement dimension '${key}': ${String(value)}`);
            }
        }
    }
}
/**
 * Creates an EmbeddingProvider backed by @huggingface/transformers ONNX runtime.
 * Model: Xenova/all-MiniLM-L6-v2 (384-dim).
 *
 * The package is loaded dynamically — not required at compile time.
 * Install: `npm i @huggingface/transformers`
 */
export async function createOnnxEmbeddingProvider(artifactCachePath) {
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
        async extractRequirements(text) {
            const output = await extractor(text, {
                pooling: 'mean',
                normalize: true,
            });
            return projectToRequirements(output.data);
        },
        async dispose() {
            /* @huggingface/transformers pipelines have no explicit dispose */
        },
    };
}
//# sourceMappingURL=hydra-matcher.js.map