/**
 * Local runtime ports (SP-275, #143 partial).
 *
 * Domain-owned contracts for local zero-tier runtime readiness (LM Studio +
 * Ollama). The ping orchestration lives here — it is routing policy (which
 * services qualify for local dispatch, fail-open never-throw semantics,
 * FR-022) expressed over the injectable {@link HttpFetchPort}; only the
 * default transport binding (Node.js global fetch) remains in
 * `infrastructure/local/local-zero-tier.ts`, which re-exports these symbols
 * for import-path stability.
 *
 * Dependency direction: domain owns the port; infrastructure implements.
 * `LocalRuntimePort` is the injectable boundary consumed by the pipeline
 * (`PipelineOptions.localRuntime`); `defaultLocalRuntimePort` fails closed
 * (services unavailable) when no HTTP transport is bound.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

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
  fetch(url: string, init: { signal: AbortSignal }): Promise<{
    ok: boolean;
    json(): Promise<unknown>;
  }>;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_LOCAL_CONFIG: LocalZeroTierConfig = {
  lmStudioBaseUrl: 'http://127.0.0.1:1234',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  pingTimeoutMs: 500,
};

const UNAVAILABLE: ServicePingResult = {
  available: false,
  hasLoadedModel: false,
  latencyMs: 0,
};

// ─── Ping implementations ────────────────────────────────────────────────────

interface LmStudioModelsResponse {
  data?: readonly unknown[];
}

interface OllamaTagsResponse {
  models?: readonly unknown[];
}

async function pingLmStudio(
  baseUrl: string,
  signal: AbortSignal,
  httpFetch: HttpFetchPort,
): Promise<ServicePingResult> {
  const start = performance.now();
  try {
    const res = await httpFetch.fetch(`${baseUrl}/v1/models`, { signal });
    const latencyMs = performance.now() - start;
    if (!res.ok) {
      return { available: true, hasLoadedModel: false, latencyMs };
    }
    const body = (await res.json()) as LmStudioModelsResponse;
    const hasLoadedModel = Array.isArray(body.data) && body.data.length > 0;
    return { available: true, hasLoadedModel, latencyMs };
  } catch {
    return { ...UNAVAILABLE, latencyMs: performance.now() - start };
  }
}

async function pingOllama(
  baseUrl: string,
  signal: AbortSignal,
  httpFetch: HttpFetchPort,
): Promise<ServicePingResult> {
  const start = performance.now();
  try {
    const res = await httpFetch.fetch(`${baseUrl}/api/tags`, { signal });
    const latencyMs = performance.now() - start;
    if (!res.ok) {
      return { available: true, hasLoadedModel: false, latencyMs };
    }
    const body = (await res.json()) as OllamaTagsResponse;
    const hasLoadedModel = Array.isArray(body.models) && body.models.length > 0;
    return { available: true, hasLoadedModel, latencyMs };
  } catch {
    return { ...UNAVAILABLE, latencyMs: performance.now() - start };
  }
}

/**
 * Stand-in transport used when no {@link HttpFetchPort} is bound: every
 * request rejects, which the ping helpers treat as an unreachable service
 * (fail closed to `available: false`). Infrastructure binds the real
 * Node.js global-fetch adapter (`infrastructure/local/local-zero-tier.ts`).
 */
const unboundHttpFetch: HttpFetchPort = {
  fetch: () =>
    Promise.reject(
      new Error('LocalRuntimePort: no HttpFetchPort bound (SP-275, #143)'),
    ),
};

// ─── Ping orchestration ──────────────────────────────────────────────────────

/**
 * Ping LM Studio and Ollama in parallel. Returns readiness state for each
 * service and whether any local model is loaded and ready for inference.
 *
 * Combined latency target: <15ms on a healthy system.
 *
 * When `httpFetch` is omitted the pings fail closed to `available: false`
 * (no transport); the infrastructure composition root binds the default
 * Node fetch adapter so production behavior is unchanged (SP-275).
 */
export async function pingLocalServices(
  config: LocalZeroTierConfig = DEFAULT_LOCAL_CONFIG,
  httpFetch: HttpFetchPort = unboundHttpFetch,
): Promise<LocalReadinessResult> {
  const overallStart = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.pingTimeoutMs,
  );

  try {
    const [lmStudio, ollama] = await Promise.all([
      pingLmStudio(config.lmStudioBaseUrl, controller.signal, httpFetch),
      pingOllama(config.ollamaBaseUrl, controller.signal, httpFetch),
    ]);

    const combinedLatencyMs = performance.now() - overallStart;
    const anyModelReady = lmStudio.hasLoadedModel || ollama.hasLoadedModel;

    return { lmStudio, ollama, anyModelReady, combinedLatencyMs };
  } catch {
    // FR-022: never crash — return both unavailable on unexpected error
    return {
      lmStudio: UNAVAILABLE,
      ollama: UNAVAILABLE,
      anyModelReady: false,
      combinedLatencyMs: performance.now() - overallStart,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Port ────────────────────────────────────────────────────────────────────

/**
 * Port for local runtime readiness probing (SP-275, #143).
 *
 * Consumed by the `local_zero` pipeline stage via
 * `PipelineOptions.localRuntime`. Infrastructure binds the default
 * Node-fetch-backed adapter; tests inject stubbed transports.
 */
export interface LocalRuntimePort {
  /**
   * Ping LM Studio + Ollama in parallel and report readiness.
   * Never throws — unreachable services report `available: false`.
   */
  pingServices(
    config?: LocalZeroTierConfig,
    httpFetch?: HttpFetchPort,
  ): Promise<LocalReadinessResult>;
}

/**
 * Domain default local runtime adapter — the ping orchestration itself with
 * no transport bound (fails closed). The infrastructure composition root
 * (`GatewayDispatch`) replaces it with the Node-fetch-bound adapter;
 * explicit `httpFetch` arguments still flow through when provided.
 */
export const defaultLocalRuntimePort: LocalRuntimePort = {
  pingServices: pingLocalServices,
};
