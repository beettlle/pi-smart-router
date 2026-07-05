/**
 * Local zero-tier readiness pings — T045, FR-012, FR-013.
 *
 * Pings LM Studio and Ollama HTTP endpoints in parallel to determine
 * whether a local model is loaded and ready. Combined latency target <15ms.
 *
 * Never throws — unreachable services return `available: false`.
 * Port-based HTTP for testability; default uses Node.js global fetch.
 */
export interface ServicePingResult {
    readonly available: boolean;
    readonly hasLoadedModel: boolean;
    readonly latencyMs: number;
}
export interface LocalReadinessResult {
    readonly lmStudio: ServicePingResult;
    readonly ollama: ServicePingResult;
    readonly anyModelReady: boolean;
    readonly combinedLatencyMs: number;
}
export interface LocalZeroTierConfig {
    readonly lmStudioBaseUrl: string;
    readonly ollamaBaseUrl: string;
    readonly pingTimeoutMs: number;
}
/** Port for HTTP fetch — allows stubbing in tests without network. */
export interface HttpFetchPort {
    fetch(url: string, init: {
        signal: AbortSignal;
    }): Promise<{
        ok: boolean;
        json(): Promise<unknown>;
    }>;
}
export declare const DEFAULT_LOCAL_CONFIG: LocalZeroTierConfig;
/**
 * Default HTTP fetch port using Node.js global fetch.
 */
export declare const defaultHttpFetch: HttpFetchPort;
/**
 * Ping LM Studio and Ollama in parallel. Returns readiness state for each
 * service and whether any local model is loaded and ready for inference.
 *
 * Combined latency target: <15ms on a healthy system.
 */
export declare function pingLocalServices(config?: LocalZeroTierConfig, httpFetch?: HttpFetchPort): Promise<LocalReadinessResult>;
//# sourceMappingURL=local-zero-tier.d.ts.map
