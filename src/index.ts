/**
 * Public package exports — pi-smart-router.
 *
 * Exposes the router factory (T022) and pi lifecycle hook registrar (T021).
 * Full pi integration uses `.pi/extensions/smart-router/`; library embedders
 * route via `dispatch.dispatch()` after calling `register(hooks)`.
 */

import type { ModelProfile, RoutingDecision } from './domain/types/index.js';
import { loadModels, type FleetCatalog } from './config/models-loader.js';
import {
  loadRoutingClusters,
  clusterReasonCode,
  type TextEmbedder,
} from './config/routing-clusters-loader.js';
import {
  GatewayDispatch,
  type GatewayDispatchOptions,
} from './infrastructure/gateway/gateway-dispatch.js';
import {
  createPiRouterMiddleware,
  LifecycleHookState,
  type PiRouterMiddleware,
  type PiExtensionHooks,
} from './api/middleware/pi-router-middleware.js';

/** Package identifier for diagnostics and telemetry. */
export const PACKAGE_NAME = 'pi-smart-router' as const;

// ─── Router factory types ────────────────────────────────────────────────────

export interface RouterFactoryOptions {
  readonly modelsPath?: string;
}

export interface RouterHandle {
  readonly version: string;
  readonly middleware: PiRouterMiddleware;
  readonly dispatch: GatewayDispatch;
  readonly fleet: readonly ModelProfile[];
  readonly register: (hooks: PiExtensionHooks) => void;
}

// ─── Router factory (T022) ───────────────────────────────────────────────────

/**
 * Create a router handle from the default fleet catalog (T022).
 *
 * Concurrency contract (SP-230, #141): the underlying `RouterPipeline`
 * serializes concurrent `route()` calls (single-flight) because per-route
 * transient state lives on instance fields while stages run. A shared handle
 * is therefore safe under overlapping requests — a concurrent caller queues
 * behind the in-flight route for at most one routing latency, and routing
 * policy outcomes are unchanged. Create separate handles for parallel
 * routing throughput.
 */
export function createRouter(options?: RouterFactoryOptions): RouterHandle {
  const catalog = loadModels(
    options?.modelsPath ? { filePath: options.modelsPath } : undefined,
  );

  return createRouterFromCatalog(catalog);
}

export function createRouterFromCatalog(catalog: FleetCatalog): RouterHandle {
  return createRouterFromFleet([...catalog.models]);
}

export interface CreateRouterFromFleetOptions extends GatewayDispatchOptions {
  readonly lifecycleHookState?: LifecycleHookState;
}

export function createRouterFromFleet(
  fleet: ModelProfile[],
  options?: CreateRouterFromFleetOptions,
): RouterHandle {
  const { lifecycleHookState, ...dispatchOptions } = options ?? {};
  const dispatch = new GatewayDispatch(fleet, dispatchOptions);
  const middleware = createPiRouterMiddleware(
    lifecycleHookState !== undefined ? { lifecycleHookState } : undefined,
  );

  return {
    version: 'pi-smart-router',
    middleware,
    dispatch,
    fleet,
    register: middleware.register,
  };
}

// ─── Re-exports for consumer convenience ─────────────────────────────────────

export type { RoutingDecision, ModelProfile };
export {
  loadRoutingClusters,
  clusterReasonCode,
};
export type { TextEmbedder };
export type { RoutingClusterCatalog } from './domain/types/index.js';
export type {
  PiRouterMiddleware,
  PiRouterMiddlewareOptions,
  PiExtensionHooks,
  PiExtensionContext,
  PiProviderRequestEvent,
  PiContextEvent,
  PiModelSelectEvent,
  PiSessionManager,
  LifecycleFlags,
} from './api/middleware/pi-router-middleware.js';
export { createPiRouterMiddleware, LifecycleHookState } from './api/middleware/pi-router-middleware.js';
export { evictInMemorySessionState } from './api/session-eviction.js';
export type { SessionEvictionTargets } from './api/session-eviction.js';
export type { GatewayDispatchOptions } from './infrastructure/gateway/gateway-dispatch.js';
export type { PipelineOptions } from './domain/pipeline/router-pipeline.js';

// ─── Extension facade re-exports (SP-255, #149) ──────────────────────────────
//
// Stable public surface for everything `.pi/extensions/smart-router/` needs, so
// the extension can import from `pi-smart-router` instead of deep `src/**`
// paths. Additive only — no existing export is renamed or removed.

// Domain types
export type {
  AdaptiveReasoningConfig,
  CompressedContextSpec,
  Message,
  PlanningDelegateConfig,
  PlanningDelegateObservability,
  PriceCatalog,
  RoutingDatasetRecord,
  RoutingFeatureSidecar,
  RoutingOutcomeRecord,
  RoutingReasoningTelemetry,
  RoutingRequest,
  RoutingTelemetry,
  RoutingUsageActuals,
  StorePort,
  TurnType,
} from './domain/types/index.js';
export type { QuotaWindowPosition } from './domain/types/entities.js';
export type { OperatorConfig } from './domain/types/schemas.js';
export { DEFAULT_PLANNING_DELEGATE_CONFIG } from './domain/types/schemas.js';

// Config
export {
  DEFAULT_OPERATOR_CONFIG,
  resolveOperatorConfigFromEnv,
} from './config/defaults.js';
export { mapFleetFromRegistry } from './config/pi-model-mapper.js';

// Domain — delegation
export {
  applyConcisenessHint,
  resolveAdaptiveReasoning,
  type AdaptiveReasoningResult,
  type AdaptiveReasoningSignal,
} from './domain/delegation/adaptive-reasoning.js';
export {
  isGoogleDelegationTarget,
  normalizeDelegationContext,
  repairGeminiReplayContext,
} from './domain/delegation/delegation-context.js';
export { ExecutionLedger } from './domain/delegation/execution-ledger.js';
export {
  computeOutputHeadroom,
  type OutputHeadroomConfig,
} from './domain/delegation/output-headroom.js';

// Domain — matching, pinning, pipeline, pricing, routing
export {
  HydraMatcher,
  createOnnxEmbeddingProvider,
} from './domain/matching/hydra-matcher.js';
export { SessionPinner } from './domain/pinning/session-pinner.js';
export { safeCloudDefault } from './domain/pipeline/safe-default.js';
export { resolvePeakPricingAdjustment } from './domain/pricing/peak-pricing.js';
export {
  collectPoolModelIds,
  resolveQuotaWindowEstimateConfigFromEnv,
  resolveQuotaWindowPosition,
  type QuotaWindowAdapter,
  type QuotaWindowEstimateConfig,
} from './domain/pricing/quota-window-feed.js';
export {
  CONTEXT_OVERFLOW_NO_FIT,
  resolveContextOverflowFallback,
} from './domain/routing/context-fit.js';
export {
  attachOutcomeLabelsToExport,
  indexOutcomesByRequestId,
} from './domain/routing/p-success-classifier.js';
export {
  GEMINI_TOOL_HISTORY_EXCLUDED,
  assertRoutableFleetAfterGeminiToolHistoryGuard,
  isGoogleGeminiProfile,
  resolveEffectiveFleet,
  type GeminiToolHistoryGuardResult,
} from './domain/routing/tool-history-guard.js';

// Infrastructure — providers, gateway, hardware, persistence, pricing
export { GEMINI_REPLAY_INCOMPATIBLE } from './infra/gemini-provider.js';
export {
  formatGeminiThoughtSignatureErrorMessage,
  formatProviderErrorMessage,
  isGeminiThoughtSignatureAssistantError,
  parseAssistantMessageError,
  sanitizeLengthStopMessage,
  type LengthStopHints,
} from './infrastructure/delegation/provider-error.js';
export {
  shouldFailoverOnProviderError,
  type RateLimitPort,
} from './infrastructure/gateway/gateway-dispatch.js';
export { getDefaultSystemInfo } from './infrastructure/hardware/hardware-probe.js';
export {
  collectPlacementPlan,
  type PlacementPlanReport,
} from './infrastructure/hardware/placement-plan.js';
export { DEFAULT_LOCAL_CONFIG } from './infrastructure/local/local-zero-tier.js';
export {
  createResilientStore,
  SqliteStore,
  SqliteStoreError,
} from './infrastructure/persistence/sqlite-store.js';
export { fetchLitellmPriceCatalog } from './infrastructure/pricing/litellm-fetch.js';
export { applyCatalogPricesToFleet } from './infrastructure/pricing/price-broker.js';
export { checkStaleness } from './infrastructure/pricing/pricing-monitor.js';

// Infrastructure — telemetry
export { DATASET_MAX_ENTRIES } from './infrastructure/telemetry/dataset-limits.js';
export {
  DATASET_ENABLED_NOTIFY_MESSAGE,
  DatasetRecorder,
} from './infrastructure/telemetry/dataset-recorder.js';
export {
  OutcomeRecorder,
  type SessionRoutingSnapshot,
} from './infrastructure/telemetry/outcome-recorder.js';
export {
  PLANNING_DELEGATE,
  PLANNING_DELEGATE_TIMEOUT,
  PLANNING_DELEGATE_UNAVAILABLE,
  PLANNING_DIRECT_FRONTIER,
  RoutingTelemetryEmitter,
  createPlanningDelegateObservability,
  enrichRoutingDecisionWithPlanningDelegate,
  extractUsageActuals,
} from './infrastructure/telemetry/routing-telemetry.js';
export {
  aggregateSessionStatsFromFleet,
  type SessionStatsSnapshot,
} from './infrastructure/telemetry/session-stats.js';
export {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
} from './infrastructure/telemetry/telemetry-limits.js';

// CLI helpers used by extension commands
export {
  DEFAULT_TELEMETRY_CONTRIB_EXPORT_LIMIT,
  exportTelemetryContrib,
  parseExportTelemetryContribArgs,
} from './cli/smart-router-cli.js';
