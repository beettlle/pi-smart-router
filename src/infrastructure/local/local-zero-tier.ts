/**
 * Local zero-tier readiness pings — T045, FR-012, FR-013.
 *
 * SP-275 (#143 partial): the local runtime contracts and the ping
 * orchestration are domain-owned (`domain/ports/local-runtime-port.ts`).
 * This module is the impure adapter — it binds the default Node.js
 * global-fetch transport — and re-exports the domain symbols for
 * import-path stability.
 */

import {
  DEFAULT_LOCAL_CONFIG,
  pingLocalServices,
  type HttpFetchPort,
  type LocalRuntimePort,
  type LocalZeroTierConfig,
} from '../../domain/ports/local-runtime-port.js';

// ─── Domain-owned contracts (re-export; SP-275, #143) ────────────────────────

export type {
  HttpFetchPort,
  LocalReadinessResult,
  LocalRuntimePort,
  LocalZeroTierConfig,
  ServicePingResult,
} from '../../domain/ports/local-runtime-port.js';
export {
  DEFAULT_LOCAL_CONFIG,
  defaultLocalRuntimePort,
  pingLocalServices,
} from '../../domain/ports/local-runtime-port.js';

// ─── Default transport adapter ───────────────────────────────────────────────

/**
 * Default HTTP fetch port using Node.js global fetch.
 */
export const defaultHttpFetch: HttpFetchPort = {
  fetch: (url, init) => globalThis.fetch(url, init),
};

/**
 * Node-fetch-bound local runtime adapter (SP-275, #143): the domain default
 * fails closed when no transport is bound; this adapter restores the
 * pre-inversion production behavior by falling back to Node's global fetch.
 * The composition root (`GatewayDispatch`) wires it as the default
 * `PipelineOptions.localRuntime`.
 */
export const nodeLocalRuntimePort: LocalRuntimePort = {
  pingServices: (config?: LocalZeroTierConfig, httpFetch?: HttpFetchPort) =>
    pingLocalServices(config ?? DEFAULT_LOCAL_CONFIG, httpFetch ?? defaultHttpFetch),
};
