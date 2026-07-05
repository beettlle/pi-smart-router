/**
 * Local zero-tier readiness pings — T045, FR-012, FR-013.
 *
 * Pings LM Studio and Ollama HTTP endpoints in parallel to determine
 * whether a local model is loaded and ready. Combined latency target <15ms.
 *
 * Never throws — unreachable services return `available: false`.
 * Port-based HTTP for testability; default uses Node.js global fetch.
 */
// ─── Defaults ────────────────────────────────────────────────────────────────
export const DEFAULT_LOCAL_CONFIG = {
    lmStudioBaseUrl: 'http://127.0.0.1:1234',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    pingTimeoutMs: 500,
};
const UNAVAILABLE = {
    available: false,
    hasLoadedModel: false,
    latencyMs: 0,
};
async function pingLmStudio(baseUrl, signal, httpFetch) {
    const start = performance.now();
    try {
        const res = await httpFetch.fetch(`${baseUrl}/v1/models`, { signal });
        const latencyMs = performance.now() - start;
        if (!res.ok) {
            return { available: true, hasLoadedModel: false, latencyMs };
        }
        const body = (await res.json());
        const hasLoadedModel = Array.isArray(body.data) && body.data.length > 0;
        return { available: true, hasLoadedModel, latencyMs };
    }
    catch {
        return { ...UNAVAILABLE, latencyMs: performance.now() - start };
    }
}
async function pingOllama(baseUrl, signal, httpFetch) {
    const start = performance.now();
    try {
        const res = await httpFetch.fetch(`${baseUrl}/api/tags`, { signal });
        const latencyMs = performance.now() - start;
        if (!res.ok) {
            return { available: true, hasLoadedModel: false, latencyMs };
        }
        const body = (await res.json());
        const hasLoadedModel = Array.isArray(body.models) && body.models.length > 0;
        return { available: true, hasLoadedModel, latencyMs };
    }
    catch {
        return { ...UNAVAILABLE, latencyMs: performance.now() - start };
    }
}
// ─── Public API ──────────────────────────────────────────────────────────────
/**
 * Default HTTP fetch port using Node.js global fetch.
 */
export const defaultHttpFetch = {
    fetch: (url, init) => globalThis.fetch(url, init),
};
/**
 * Ping LM Studio and Ollama in parallel. Returns readiness state for each
 * service and whether any local model is loaded and ready for inference.
 *
 * Combined latency target: <15ms on a healthy system.
 */
export async function pingLocalServices(config = DEFAULT_LOCAL_CONFIG, httpFetch = defaultHttpFetch) {
    const overallStart = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.pingTimeoutMs);
    try {
        const [lmStudio, ollama] = await Promise.all([
            pingLmStudio(config.lmStudioBaseUrl, controller.signal, httpFetch),
            pingOllama(config.ollamaBaseUrl, controller.signal, httpFetch),
        ]);
        const combinedLatencyMs = performance.now() - overallStart;
        const anyModelReady = lmStudio.hasLoadedModel || ollama.hasLoadedModel;
        return { lmStudio, ollama, anyModelReady, combinedLatencyMs };
    }
    catch {
        // FR-022: never crash — return both unavailable on unexpected error
        return {
            lmStudio: UNAVAILABLE,
            ollama: UNAVAILABLE,
            anyModelReady: false,
            combinedLatencyMs: performance.now() - overallStart,
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=local-zero-tier.js.map
