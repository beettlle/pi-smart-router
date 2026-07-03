/**
 * Public package exports.
 * Router factory implementation is wired in later spine tasks (SP-012+).
 */

/** Package identifier for diagnostics and telemetry. */
export const PACKAGE_NAME = 'pi-smart-router' as const;

/** Placeholder router factory type — implemented when pipeline is ready. */
export type RouterFactory = (options?: RouterFactoryOptions) => Promise<RouterHandle>;

/** Options passed when creating a router instance. */
export interface RouterFactoryOptions {
  readonly modelsPath?: string;
}

/** Opaque handle returned by the router factory. */
export interface RouterHandle {
  readonly version: typeof PACKAGE_NAME;
}
