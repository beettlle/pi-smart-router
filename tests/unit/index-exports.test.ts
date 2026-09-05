import { describe, expect, it } from 'vitest';

// SP-255 (#149): the package entrypoint is the stable public facade for
// everything `.pi/extensions/smart-router/` needs. These tests import every
// facade symbol from `src/index.js` (the package `exports` surface) so a
// dropped or renamed re-export fails here before SP-256 migrates the
// extension's deep `../../../src/` imports.
import {
  // Domain — config
  DEFAULT_OPERATOR_CONFIG,
  resolveOperatorConfigFromEnv,
  mapFleetFromRegistry,
  DEFAULT_PLANNING_DELEGATE_CONFIG,
  // Domain — delegation
  applyConcisenessHint,
  resolveAdaptiveReasoning,
  isGoogleDelegationTarget,
  normalizeDelegationContext,
  repairGeminiReplayContext,
  ExecutionLedger,
  computeOutputHeadroom,
  // Domain — matching, pinning, pipeline, pricing, routing
  HydraMatcher,
  createOnnxEmbeddingProvider,
  SessionPinner,
  safeCloudDefault,
  resolvePeakPricingAdjustment,
  collectPoolModelIds,
  resolveQuotaWindowEstimateConfigFromEnv,
  resolveQuotaWindowPosition,
  CONTEXT_OVERFLOW_NO_FIT,
  resolveContextOverflowFallback,
  attachOutcomeLabelsToExport,
  indexOutcomesByRequestId,
  GEMINI_TOOL_HISTORY_EXCLUDED,
  assertRoutableFleetAfterGeminiToolHistoryGuard,
  isGoogleGeminiProfile,
  resolveEffectiveFleet,
  // Infrastructure — providers, gateway, hardware, persistence, pricing
  GEMINI_REPLAY_INCOMPATIBLE,
  formatGeminiThoughtSignatureErrorMessage,
  formatProviderErrorMessage,
  isGeminiThoughtSignatureAssistantError,
  parseAssistantMessageError,
  sanitizeLengthStopMessage,
  shouldFailoverOnProviderError,
  getDefaultSystemInfo,
  collectPlacementPlan,
  DEFAULT_LOCAL_CONFIG,
  createResilientStore,
  SqliteStore,
  SqliteStoreError,
  fetchLitellmPriceCatalog,
  applyCatalogPricesToFleet,
  checkStaleness,
  // Infrastructure — telemetry
  DATASET_MAX_ENTRIES,
  DATASET_ENABLED_NOTIFY_MESSAGE,
  DatasetRecorder,
  OutcomeRecorder,
  PLANNING_DELEGATE,
  PLANNING_DELEGATE_TIMEOUT,
  PLANNING_DELEGATE_UNAVAILABLE,
  PLANNING_DIRECT_FRONTIER,
  RoutingTelemetryEmitter,
  createPlanningDelegateObservability,
  enrichRoutingDecisionWithPlanningDelegate,
  extractUsageActuals,
  aggregateSessionStatsFromFleet,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  // CLI helpers used by extension commands
  DEFAULT_TELEMETRY_CONTRIB_EXPORT_LIMIT,
  exportTelemetryContrib,
  parseExportTelemetryContribArgs,
  // Pre-existing exports the extension already consumes via src/index.js
  createRouter,
  createRouterFromFleet,
  LifecycleHookState,
  evictInMemorySessionState,
} from '../../src/index.js';

import type {
  AdaptiveReasoningConfig,
  CompressedContextSpec,
  Message,
  ModelProfile,
  OperatorConfig,
  OutputHeadroomConfig,
  PlanningDelegateConfig,
  PlanningDelegateObservability,
  PriceCatalog,
  QuotaWindowAdapter,
  QuotaWindowEstimateConfig,
  QuotaWindowPosition,
  RateLimitPort,
  RoutingDatasetRecord,
  RoutingDecision,
  RoutingFeatureSidecar,
  RoutingOutcomeRecord,
  RoutingReasoningTelemetry,
  RoutingRequest,
  RoutingTelemetry,
  RoutingUsageActuals,
  SessionRoutingSnapshot,
  SessionStatsSnapshot,
  StorePort,
  TurnType,
  AdaptiveReasoningResult,
  AdaptiveReasoningSignal,
  GeminiToolHistoryGuardResult,
  LengthStopHints,
  PlacementPlanReport,
  GatewayDispatchOptions,
  PiExtensionHooks,
  RouterHandle,
} from '../../src/index.js';

describe('index facade exports (SP-255)', () => {
  it('re-exports runtime values and classes needed by the pi extension', () => {
    const runtimeSymbols: Record<string, unknown> = {
      DEFAULT_OPERATOR_CONFIG,
      resolveOperatorConfigFromEnv,
      mapFleetFromRegistry,
      DEFAULT_PLANNING_DELEGATE_CONFIG,
      applyConcisenessHint,
      resolveAdaptiveReasoning,
      isGoogleDelegationTarget,
      normalizeDelegationContext,
      repairGeminiReplayContext,
      ExecutionLedger,
      computeOutputHeadroom,
      HydraMatcher,
      createOnnxEmbeddingProvider,
      SessionPinner,
      safeCloudDefault,
      resolvePeakPricingAdjustment,
      collectPoolModelIds,
      resolveQuotaWindowEstimateConfigFromEnv,
      resolveQuotaWindowPosition,
      CONTEXT_OVERFLOW_NO_FIT,
      resolveContextOverflowFallback,
      attachOutcomeLabelsToExport,
      indexOutcomesByRequestId,
      GEMINI_TOOL_HISTORY_EXCLUDED,
      assertRoutableFleetAfterGeminiToolHistoryGuard,
      isGoogleGeminiProfile,
      resolveEffectiveFleet,
      GEMINI_REPLAY_INCOMPATIBLE,
      formatGeminiThoughtSignatureErrorMessage,
      formatProviderErrorMessage,
      isGeminiThoughtSignatureAssistantError,
      parseAssistantMessageError,
      sanitizeLengthStopMessage,
      shouldFailoverOnProviderError,
      getDefaultSystemInfo,
      collectPlacementPlan,
      DEFAULT_LOCAL_CONFIG,
      createResilientStore,
      SqliteStore,
      SqliteStoreError,
      fetchLitellmPriceCatalog,
      applyCatalogPricesToFleet,
      checkStaleness,
      DATASET_MAX_ENTRIES,
      DATASET_ENABLED_NOTIFY_MESSAGE,
      DatasetRecorder,
      OutcomeRecorder,
      PLANNING_DELEGATE,
      PLANNING_DELEGATE_TIMEOUT,
      PLANNING_DELEGATE_UNAVAILABLE,
      PLANNING_DIRECT_FRONTIER,
      RoutingTelemetryEmitter,
      createPlanningDelegateObservability,
      enrichRoutingDecisionWithPlanningDelegate,
      extractUsageActuals,
      aggregateSessionStatsFromFleet,
      DEFAULT_HISTORY_LIMIT,
      MAX_HISTORY_LIMIT,
      DEFAULT_TELEMETRY_CONTRIB_EXPORT_LIMIT,
      exportTelemetryContrib,
      parseExportTelemetryContribArgs,
      createRouter,
      createRouterFromFleet,
      LifecycleHookState,
      evictInMemorySessionState,
    };

    for (const [name, value] of Object.entries(runtimeSymbols)) {
      expect(value, `facade export ${name} must be defined`).toBeDefined();
    }
  });

  it('keeps exported constant values stable', () => {
    expect(CONTEXT_OVERFLOW_NO_FIT).toBe('context_overflow_no_fit');
    expect(GEMINI_TOOL_HISTORY_EXCLUDED).toBe('gemini_tool_history_excluded');
    expect(GEMINI_REPLAY_INCOMPATIBLE).toBe('gemini_replay_incompatible');
    expect(PLANNING_DELEGATE).toBe('planning_delegate');
    expect(PLANNING_DIRECT_FRONTIER).toBe('planning_direct_frontier');
    expect(DATASET_MAX_ENTRIES).toBeGreaterThan(0);
    expect(MAX_HISTORY_LIMIT).toBeGreaterThanOrEqual(DEFAULT_HISTORY_LIMIT);
  });

  it('exposes facade types from the package entry (compile-time)', () => {
    // Type-only assertions: if any facade type export disappears, this file
    // fails `npm run typecheck`.
    const typeCheck = {
      config: null as unknown as AdaptiveReasoningConfig | OperatorConfig | PlanningDelegateConfig | null,
      routing: null as unknown as
        | CompressedContextSpec
        | Message
        | ModelProfile
        | PlanningDelegateObservability
        | PriceCatalog
        | RoutingDatasetRecord
        | RoutingDecision
        | RoutingFeatureSidecar
        | RoutingOutcomeRecord
        | RoutingReasoningTelemetry
        | RoutingRequest
        | RoutingTelemetry
        | RoutingUsageActuals
        | TurnType
        | null,
      ports: null as unknown as QuotaWindowAdapter | RateLimitPort | StorePort | null,
      quota: null as unknown as QuotaWindowEstimateConfig | QuotaWindowPosition | null,
      delegation: null as unknown as
        | AdaptiveReasoningResult
        | AdaptiveReasoningSignal
        | GeminiToolHistoryGuardResult
        | LengthStopHints
        | OutputHeadroomConfig
        | null,
      infra: null as unknown as PlacementPlanReport | SessionRoutingSnapshot | SessionStatsSnapshot | null,
      api: null as unknown as GatewayDispatchOptions | PiExtensionHooks | RouterHandle | null,
    };

    expect(typeCheck).toBeDefined();
  });
});
