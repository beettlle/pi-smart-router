/**
 * Pipeline stage orchestrator — FR-001, FR-006, FR-022.
 *
 * Runs stages sequentially with early-exit on decision.
 * Documented order (SP-119, #69):
 *   hardware_probe → loop_escalation → turn_envelope → context_fit → low_intensity
 *   → session_pin → triage → local_zero → triage_cloud_fallback → hydra_match
 *   → safe_default → context_overflow_fallback
 * Any stage failure falls back to safeCloudDefault(); never throws to host.
 *
 * SP-273 + SP-274 / #143: every stage now lives in a focused module behind
 * the PipelineStage + RoutingContext contract (SP-272) — triage / pin /
 * hydra clusters (SP-273) and hardware_probe / turn_envelope / context_fit /
 * low_intensity / local_zero / safe_default / context_overflow_fallback
 * (SP-274). This file is the thin coordinator: stage wiring, per-route
 * context snapshot/sync-back, telemetry + feature attachment, fallback and
 * pin persistence. No behavior change.
 */

import type {
  CandidateScore,
  ModelProfile,
  PlanningDelegateConfig,
  PlanningDelegateObservability,
  PriceCatalog,
  RoutePath,
  RoutingDecision,
  RoutingFeatureSidecar,
  RoutingRequest,
  SaarConfig,
  Tier,
} from '../types/index.js';
import type { QuotaWindowPosition } from '../types/entities.js';
import type { LowIntensityConfig, LocalZeroConfig, VirtualCostV2Config } from '../types/schemas.js';
import type {
  HardwareProbeConfig,
  HardwareProbePort,
  HardwareProbeResult,
  SystemInfo,
  ThroughputMeter,
} from '../ports/hardware-probe-port.js';
import type {
  HttpFetchPort,
  LocalRuntimePort,
  LocalZeroTierConfig,
} from '../ports/local-runtime-port.js';
import type { TriageResult } from '../triage/triage-engine.js';
import {
  isGoogleGeminiProfile,
  sessionHasGoogleReplayRiskForDeprioritize,
} from '../routing/tool-history-guard.js';
import type { ContextFitConfig } from '../routing/context-fit.js';
import type { SessionPinner } from '../pinning/session-pinner.js';
import {
  FORCE_REJECTED_NOT_IN_FLEET,
  FORCE_REJECTED_UNHEALTHY,
} from '../pinning/session-pinner.js';
import type { LoopEscalationConfig } from '../pinning/loop-escalation.js';
import {
  enrichRoutingDecisionWithContextFit,
  enrichRoutingDecisionWithTierSelection,
  LOCAL_ZERO_DISABLED,
  TOOL_USE_CAPABILITY_SHORTFALL,
  type RoutingCostEstimator,
  type TelemetryEmitterPort,
} from '../ports/telemetry-emitter-port.js';
import type { HydraMatcher as HydraMatcherType, MatchResult } from '../matching/hydra-matcher.js';
import type { ClusterMatcher, ClusterMatchResult } from '../matching/cluster-matcher.js';
import type {
  CompiledPatternPack,
  DegradedRouteConfig,
  LearnedRouteStore,
} from '../routing/degraded-route-sandwich.js';
import type { IsotonicCalibratorArtifact } from '../routing/isotonic-calibrator.js';
import type { PSuccessWeights } from '../routing/p-success-classifier.js';
import type { ExpectedCostBreakdown } from '../routing/expected-cost.js';
import type {
  PrewarmOutcome,
  SpeculativePrewarmConfig,
  SpeculativePrewarmGuard,
} from '../routing/speculative-prewarm.js';
import { createTriageCloudFallbackStage, createTriageStage } from './triage-stage.js';
import {
  createLoopEscalationStage,
  createSessionPinStage,
} from './session-pin-stage.js';
import { createHydraMatchStage } from './hydra-match-stage.js';
import { createHardwareProbeStage } from './hardware-probe-stage.js';
import { createTurnEnvelopeStage } from './turn-envelope-stage.js';
import { createContextFitStage } from './context-fit-stage.js';
import { createLowIntensityStage } from './low-intensity-stage.js';
import { createLocalZeroStage } from './local-zero-stage.js';
import {
  createSafeDefaultStage,
  buildSafeDefaultFallbackDecision,
} from './safe-default-stage.js';
import {
  createContextOverflowFallbackStage,
  buildContextOverflowFallbackDecision,
  shouldAttemptContextOverflowFallback,
} from './context-overflow-fallback-stage.js';
import { redactPromptFromError } from './stage-helpers.js';

// ─── Stage result ────────────────────────────────────────────────────────────

export interface StageResult {
  readonly decided: boolean;
  readonly decision?: RoutingDecision;
  readonly stage: string;
}

export type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';

/** Canonical pipeline stage order — keep README/specs in sync (SP-119). */
export const PIPELINE_STAGE_ORDER = [
  'hardware_probe',
  'loop_escalation',
  'turn_envelope',
  'context_fit',
  'low_intensity',
  'session_pin',
  'triage',
  'local_zero',
  'triage_cloud_fallback',
  'hydra_match',
  'safe_default',
  'context_overflow_fallback',
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGE_ORDER)[number];

type StageRun = (request: RoutingRequest) => Promise<StageResult>;

interface NamedPipelineStage {
  readonly name: string;
  readonly run: StageRun;
}

/** Inputs for local_zero eligibility beyond trivial-only triage (SP-111, #59).
 * Moved to ./stage-helpers.ts (SP-273); re-exported for import-path stability. */
export {
  estimateCheapToolUseRequirement,
  resolveLocalEligible,
  resolveLocalZeroToolUseCeiling,
} from './stage-helpers.js';
export type { LocalEligibleInput, LocalEligibleResult } from './stage-helpers.js';

// ─── Pipeline configuration ──────────────────────────────────────────────────

export interface PipelineOptions {
  readonly hardwareConfig?: HardwareProbeConfig;
  readonly localConfig?: LocalZeroTierConfig;
  readonly systemInfoProvider?: () => Promise<SystemInfo>;
  readonly httpFetchPort?: HttpFetchPort;
  /** Injected hardware probe port (SP-275, #143); defaults to the pure domain kernel. */
  readonly hardwareProbe?: HardwareProbePort;
  /** Injected local runtime port (SP-275, #143); composition root binds the Node fetch adapter. */
  readonly localRuntime?: LocalRuntimePort;
  readonly sessionPinner?: SessionPinner;
  readonly loopEscalationConfig?: LoopEscalationConfig;
  /** Telemetry emitter port (SP-275, #143); infra implements (`RoutingTelemetryEmitter`). */
  readonly telemetryEmitter?: TelemetryEmitterPort;
  /**
   * Routing cost estimator seam (SP-275, #143 partial). The default lives in
   * infrastructure (`estimateRoutingCost`) until the pricing port is inverted;
   * the composition root (`GatewayDispatch`) wires it. Unwired direct
   * constructions produce decisions without `estimated_cost_usd`.
   */
  readonly costEstimator?: RoutingCostEstimator;
  readonly hydraMatcher?: HydraMatcherType;
  readonly clusterMatcher?: ClusterMatcher;
  readonly lowIntensityConfig?: LowIntensityConfig;
  readonly priceCatalog?: PriceCatalog | null;
  readonly contextFitConfig?: ContextFitConfig;
  /** Preloaded P(success) weights for tests; lazy-loads artifact when omitted (SP-105). */
  readonly pSuccessWeights?: PSuccessWeights;
  readonly pSuccessWeightsPath?: string;
  /** Preloaded isotonic calibrator for tests; lazy-loads bundle when omitted (SP-133). */
  readonly isotonicCalibrator?: IsotonicCalibratorArtifact | null;
  readonly routingCalibrationPath?: string;
  /** SAAR pin policy (SP-123). Must match sessionPinner.saarConfig when enabled. */
  readonly saarConfig?: SaarConfig;
  /** Planning delegate operator knobs (SP-143, #71). Defaults to operator config. */
  readonly planningDelegateConfig?: PlanningDelegateConfig;
  /** Rolling subscription quota position for virtual cost v2 (SP-149). */
  readonly quotaWindowPosition?: QuotaWindowPosition;
  /** Virtual cost v2 operator knobs (SP-149). */
  readonly virtualCostV2Config?: VirtualCostV2Config;
  /**
   * Emergency pin-only fallback (#83, SP-161). When true, warm sessions skip
   * turn_envelope and multi-stage routing; session_pin use_pin path handles them.
   */
  readonly pinOnlyFallback?: boolean;
  /** Rolling median tok/s gate for local_zero dispatch (SP-164, #84). */
  readonly throughputMeter?: ThroughputMeter;
  /** Pre-local_zero tool-use capability gate (SP-177, #98). */
  readonly localZeroConfig?: LocalZeroConfig;
  /** Degraded neural failover sandwich knobs (SP-212, #119). */
  readonly degradedRouteConfig?: DegradedRouteConfig;
  /** Speculative prewarm knobs (SP-217, #117). Default off; fail open. */
  readonly prewarmConfig?: SpeculativePrewarmConfig;
  /** Injected prewarm guard for tests; lazily created from prewarmConfig when omitted. */
  readonly prewarmGuard?: SpeculativePrewarmGuard;
  /** Privacy-safe learned map for the degraded sandwich (SP-212, #119). */
  readonly learnedRouteStore?: LearnedRouteStore;
  /** Compiled operator pattern pack overlay for the degraded sandwich (SP-212, #119). */
  readonly patternPack?: CompiledPatternPack;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export class RouterPipeline {
  private readonly stages: readonly NamedPipelineStage[];
  private readonly fleet: readonly ModelProfile[];
  private readonly options: PipelineOptions;

  /** Per-route transient fleet — defaults to constructor fleet. */
  private activeFleet: readonly ModelProfile[] = [];

  /** Unfiltered fleet for overflow escalation (SP-095). */
  private fullFleet: readonly ModelProfile[] = [];

  /** Per-route transient state — reset on each route() call. */
  private currentHardwareResult: HardwareProbeResult = 'disabled';
  private currentTriageResult: TriageResult | null = null;
  private currentHydraResult: MatchResult | null = null;
  private currentClusterMatch: ClusterMatchResult | null = null;
  private currentTierHint: Tier | null = null;
  private currentTierHintReasonCode: string | null = null;
  private currentLowIntensityScore: number | null = null;
  private currentPSuccessCheap: number | null = null;
  private currentPSuccessRaw: number | null = null;
  private currentPSuccessCalibrated: number | null = null;
  private currentPSuccessAlpha: number | null = null;
  private currentExpectedCostByTier: readonly ExpectedCostBreakdown[] | null = null;
  private currentLocalEligibleReason: string | null = null;
  private currentContextFitRejected: readonly CandidateScore[] = [];
  private currentContextFitViableCount = 0;
  private contextOverflowPreferredProvider: string | null = null;
  private contextOverflowTriggered = false;
  /** Internal breakeven gate reason for SP-126 explain wiring. */
  private currentBreakevenReason: string | null = null;
  /** Planning delegate observability for SP-143 explain/telemetry wiring. */
  private currentPlanningDelegate: PlanningDelegateObservability | null = null;
  /** Explicit local_zero gate skip reasons for tier-selection telemetry (SP-164). */
  private currentLocalZeroGateSkipReasons: readonly string[] = [];
  /** Degraded sandwich route path for explain/telemetry (SP-212, #119). */
  private currentRoutePath: RoutePath | null = null;
  private currentRoutePathConfidence: number | null = null;
  /** Speculative prewarm outcome for explain/telemetry (SP-217, #117). */
  private currentPrewarmOutcome: PrewarmOutcome | null = null;

  /** Extracted stage instances (SP-273/SP-274) — run via runStageWithContext(). */
  private readonly hardwareProbePipelineStage: PipelineStage = createHardwareProbeStage();
  private readonly loopEscalationPipelineStage: PipelineStage = createLoopEscalationStage();
  private readonly turnEnvelopePipelineStage: PipelineStage = createTurnEnvelopeStage();
  private readonly contextFitPipelineStage: PipelineStage = createContextFitStage();
  private readonly lowIntensityPipelineStage: PipelineStage = createLowIntensityStage();
  private readonly sessionPinPipelineStage: PipelineStage = createSessionPinStage();
  private readonly triagePipelineStage: PipelineStage = createTriageStage();
  private readonly localZeroPipelineStage: PipelineStage = createLocalZeroStage();
  private readonly triageCloudFallbackPipelineStage: PipelineStage =
    createTriageCloudFallbackStage();
  private readonly hydraMatchPipelineStage: PipelineStage = createHydraMatchStage();
  private readonly safeDefaultPipelineStage: PipelineStage = createSafeDefaultStage();
  private readonly contextOverflowFallbackPipelineStage: PipelineStage =
    createContextOverflowFallbackStage();

  /**
   * Single-flight serialization tail (SP-230, #141).
   *
   * Concurrency contract: `route()` calls on one RouterPipeline instance are
   * serialized — a concurrent caller queues behind the in-flight call. The
   * pipeline keeps per-route transient state on instance fields (the
   * `current*` / `activeFleet` / `fullFleet` members above), which every stage
   * reads and writes; overlapping route() executions would race on that state
   * and corrupt routing decisions (e.g. a second call's reset swapping
   * `activeFleet` mid-flight for the first). Routing is a fast, bounded,
   * in-memory computation, so serialization costs at most one routing latency
   * of queuing and never changes routing policy outcomes.
   *
   * Safety notes:
   * - No reentrancy: nothing on a route() execution path awaits another
   *   route()/dispatch() on the same instance, so the chain cannot deadlock.
   * - The tail is chained with a rejection handler so a rejected call (the
   *   zero-crash catch makes this defensive-only) cannot wedge the queue.
   */
  private routeTail: Promise<void> = Promise.resolve();

  constructor(fleet: readonly ModelProfile[], options?: PipelineOptions) {
    this.fleet = fleet;
    this.options = options ?? {};
    this.stages = [
      { name: 'hardware_probe', run: this.hardwareProbeStage.bind(this) },
      { name: 'loop_escalation', run: this.loopEscalation.bind(this) },
      { name: 'turn_envelope', run: this.turnEnvelope.bind(this) },
      { name: 'context_fit', run: this.contextFitStage.bind(this) },
      { name: 'low_intensity', run: this.lowIntensityGate.bind(this) },
      { name: 'session_pin', run: this.sessionPin.bind(this) },
      { name: 'triage', run: this.triage.bind(this) },
      { name: 'local_zero', run: this.localZeroTierStage.bind(this) },
      { name: 'triage_cloud_fallback', run: this.triageCloudFallback.bind(this) },
      { name: 'hydra_match', run: this.hydraMatcher.bind(this) },
      { name: 'safe_default', run: this.safeDefaultStage.bind(this) },
      { name: 'context_overflow_fallback', run: this.contextOverflowFallback.bind(this) },
    ];
  }

  /**
   * Route a request through the pipeline. Concurrent calls are serialized
   * (single-flight) — see `routeTail` for the concurrency contract (SP-230).
   */
  async route(
    request: RoutingRequest,
    fleetOverride?: readonly ModelProfile[],
  ): Promise<RoutingDecision> {
    const queued = this.routeTail.then(() =>
      this.routeExclusive(request, fleetOverride),
    );
    // Keep the tail alive even if a call rejects (defensive: routeExclusive
    // catches stage errors, but a throw outside that catch must not wedge the
    // queue for subsequent callers).
    this.routeTail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  /** Exclusive-route body — never invoke concurrently; see `route()` (SP-230). */
  private async routeExclusive(
    request: RoutingRequest,
    fleetOverride?: readonly ModelProfile[],
  ): Promise<RoutingDecision> {
    const start = Date.now();
    this.activeFleet = this.prioritizeFleetForToolHistory(
      fleetOverride ?? this.fleet,
      request,
    );
    this.fullFleet = this.activeFleet;
    this.currentHardwareResult = 'disabled';
    this.currentTriageResult = null;
    this.currentHydraResult = null;
    this.currentClusterMatch = null;
    this.currentTierHint = null;
    this.currentTierHintReasonCode = null;
    this.currentLowIntensityScore = null;
    this.currentPSuccessCheap = null;
    this.currentPSuccessRaw = null;
    this.currentPSuccessCalibrated = null;
    this.currentPSuccessAlpha = null;
    this.currentExpectedCostByTier = null;
    this.currentLocalEligibleReason = null;
    this.currentContextFitRejected = [];
    this.currentContextFitViableCount = 0;
    this.contextOverflowPreferredProvider = null;
    this.contextOverflowTriggered = false;
    this.currentBreakevenReason = null;
    this.currentPlanningDelegate = null;
    this.currentLocalZeroGateSkipReasons = [];
    this.currentRoutePath = null;
    this.currentRoutePathConfidence = null;
    this.currentPrewarmOutcome = null;

    let currentStage: NamedPipelineStage | undefined;

    try {
      for (const stage of this.stages) {
        currentStage = stage;
        const result = await stage.run(request);
        if (result.decided && result.decision) {
          this.finalizeRoute(request, result.decision);
          this.emitTelemetry(request, result.decision);
          return this.attachFeatures(request, result.decision);
        }
      }
    } catch (error: unknown) {
      // Constitution VI: zero-crash resilience — degrade to safe default
      const failedStage = this.resolveFailedStage(currentStage);
      const elapsedMs = Date.now() - start;
      const fallback = this.buildFallbackDecision(request, elapsedMs);
      this.logPipelineError(request, failedStage, error);
      this.emitPipelineErrorTelemetry(request, failedStage, fallback);
      this.persistPinIfNeeded(request, fallback);
      this.recordSaarTurnIfNeeded(request);
      return this.attachFeatures(request, fallback);
    }

    const fallback = this.buildFallbackDecision(request, Date.now() - start);
    this.finalizeRoute(request, fallback);
    this.emitTelemetry(request, fallback);
    return this.attachFeatures(request, fallback);
  }

  /**
   * SP-080: move Google/Gemini profiles to the end of the fleet when prior tool
   * calls exist so tier `.find()` passes prefer non-Gemini models first.
   * Honors `force_model_id` by leaving fleet order unchanged.
   */
  private prioritizeFleetForToolHistory(
    fleet: readonly ModelProfile[],
    request: RoutingRequest,
  ): readonly ModelProfile[] {
    if (request.force_model_id) {
      return fleet;
    }

    const messages = request.messages;
    if (
      !messages ||
      messages.length === 0 ||
      !sessionHasGoogleReplayRiskForDeprioritize(request)
    ) {
      return fleet;
    }

    const preferred: ModelProfile[] = [];
    const deprioritized: ModelProfile[] = [];

    for (const profile of fleet) {
      if (isGoogleGeminiProfile(profile)) {
        deprioritized.push(profile);
      } else {
        preferred.push(profile);
      }
    }

    if (deprioritized.length === 0) {
      return fleet;
    }

    return [...preferred, ...deprioritized];
  }

  /** Attach privacy-safe dataset features captured during pipeline stages (SP-057, SP-119). */
  private attachFeatures(
    request: RoutingRequest,
    decision: RoutingDecision,
  ): RoutingDecision {
    const features: RoutingFeatureSidecar = {
      triage: this.currentTriageResult
        ? {
            verdict: this.currentTriageResult.verdict,
            reason_code: this.currentTriageResult.reason_code,
            cyclomatic_score: this.currentTriageResult.cyclomatic_score,
          }
        : null,
      requirements: this.currentHydraResult?.requirements ?? null,
      candidates: this.mergeFeatureCandidates(),
      tier_hint: this.currentTierHint,
      tier_hint_reason_code: this.currentTierHintReasonCode,
      low_intensity_score: this.currentLowIntensityScore,
      p_success_cheap: this.currentPSuccessCheap,
      p_success_raw: this.currentPSuccessRaw,
      p_success_calibrated: this.currentPSuccessCalibrated,
      p_success_alpha: this.currentPSuccessAlpha,
      local_eligible_reason: this.currentLocalEligibleReason,
      ...(this.currentPlanningDelegate
        ? { planning_delegate: this.currentPlanningDelegate }
        : {}),
      route_path: this.resolveRoutePathTelemetry(decision).routePath,
      route_path_confidence: this.resolveRoutePathTelemetry(decision).routePathConfidence,
      ...(this.currentPrewarmOutcome
        ? {
            prewarm_attempted: this.currentPrewarmOutcome.attempted,
            prewarm_accepted: this.currentPrewarmOutcome.accepted,
            prewarm_disabled_reason: this.currentPrewarmOutcome.attempted
              ? null
              : this.currentPrewarmOutcome.reason,
          }
        : {}),
    };

    const withBaseFeatures = { ...decision, features };
    const withContextFit = enrichRoutingDecisionWithContextFit(
      request,
      withBaseFeatures,
      this.fullFleet,
      this.options.contextFitConfig,
    );
    return this.attachLocalZeroGateSkipReasons(
      enrichRoutingDecisionWithTierSelection(withContextFit),
    );
  }

  /** Merge pipeline-recorded local_zero gate skip reasons into tier_selection (SP-164). */
  private attachLocalZeroGateSkipReasons(decision: RoutingDecision): RoutingDecision {
    if (this.currentLocalZeroGateSkipReasons.length === 0) {
      return decision;
    }

    const tierSelection = decision.features?.tier_selection;
    if (!tierSelection) {
      return decision;
    }

    const capabilityGateActive = this.currentLocalZeroGateSkipReasons.some(
      (reason) =>
        reason === TOOL_USE_CAPABILITY_SHORTFALL || reason === LOCAL_ZERO_DISABLED,
    );
    const inferredReasons = capabilityGateActive
      ? tierSelection.local_zero_skip_reasons.filter(
          (reason) => reason !== 'hardware_or_local_unavailable',
        )
      : tierSelection.local_zero_skip_reasons;

    const mergedSkipReasons = [
      ...inferredReasons,
      ...this.currentLocalZeroGateSkipReasons.filter(
        (reason) => !inferredReasons.includes(reason),
      ),
    ];

    return {
      ...decision,
      features: {
        ...(decision.features ?? {
          triage: null,
          requirements: null,
          candidates: null,
          tier_hint: null,
          tier_hint_reason_code: null,
          low_intensity_score: null,
          p_success_cheap: null,
          p_success_raw: null,
          p_success_calibrated: null,
          p_success_alpha: null,
          local_eligible_reason: null,
        }),
        tier_selection: {
          ...tierSelection,
          local_zero_skip_reasons: mergedSkipReasons,
        },
      },
    };
  }

  private mergeFeatureCandidates(): readonly CandidateScore[] | null {
    const hydraCandidates = this.currentHydraResult?.candidates ?? [];
    const expectedCostCandidates =
      this.currentExpectedCostByTier?.map((entry) => ({
        model_id: `__expected_cost_${entry.tier}__`,
        score: entry.expectedCostUsd,
        shortfall: entry.adjustedExpectedCostUsd,
        rejected_reason: `p_success=${entry.pSuccess.toFixed(4)}`,
      })) ?? [];

    if (
      this.currentContextFitRejected.length === 0 &&
      hydraCandidates.length === 0 &&
      expectedCostCandidates.length === 0
    ) {
      return null;
    }
    return [
      ...this.currentContextFitRejected,
      ...expectedCostCandidates,
      ...hydraCandidates,
    ];
  }

  private resolveFailedStage(stage: NamedPipelineStage | undefined): string {
    return stage?.name ?? 'unknown';
  }

  private logPipelineError(
    request: RoutingRequest,
    stage: string,
    error: unknown,
  ): void {
    console.warn('Router pipeline stage failed; degrading to safe default', {
      stage,
      request_id: request.request_id,
      session_id: request.session_id,
      error: redactPromptFromError(error, request.prompt_text),
    });
  }

  private emitPipelineErrorTelemetry(
    request: RoutingRequest,
    failedStage: string,
    fallback: RoutingDecision,
  ): void {
    this.options.telemetryEmitter?.emitPipelineError(request, failedStage, fallback, {
      routePath: 'safe_default',
      routePathConfidence: null,
    });
  }

  /**
   * Resolve route_path classification for telemetry/explain (SP-212, #119).
   * Degraded/neural paths set currentRoutePath explicitly; other stages map
   * to heuristic (deterministic rules) or safe_default (fallback stage).
   */
  private resolveRoutePathTelemetry(decision: RoutingDecision): {
    routePath: RoutePath;
    routePathConfidence: number | null;
  } {
    if (this.currentRoutePath !== null) {
      return {
        routePath: this.currentRoutePath,
        routePathConfidence: this.currentRoutePathConfidence,
      };
    }

    if (decision.stage === 'fallback') {
      return { routePath: 'safe_default', routePathConfidence: null };
    }
    if (decision.stage === 'hydra_match') {
      return { routePath: 'neural', routePathConfidence: null };
    }
    return { routePath: 'heuristic', routePathConfidence: null };
  }

  /** Step 7: emit routing telemetry after decision (T040). */
  private emitTelemetry(request: RoutingRequest, decision: RoutingDecision): void {
    const { routePath, routePathConfidence } = this.resolveRoutePathTelemetry(decision);
    this.options.telemetryEmitter?.emit(request, decision, {
      routePath,
      routePathConfidence,
    });
  }

  /**
   * Pipeline-error / no-stage-decided fallback: overflow escalation when the
   * context_fit stage rejected every economical candidate, else the safe
   * cloud default. Builders live with their stages (SP-274).
   */
  private buildFallbackDecision(
    request: RoutingRequest,
    elapsedMs: number,
  ): RoutingDecision {
    const context = this.buildRoutingContext(request);
    if (shouldAttemptContextOverflowFallback(context)) {
      return buildContextOverflowFallbackDecision(context, elapsedMs);
    }
    return buildSafeDefaultFallbackDecision(context, elapsedMs);
  }

  // ─── RoutingContext seam (SP-272 → SP-273/SP-274) ──────────────────────────

  /** Snapshot the per-route shared context (SP-272 seam for SP-273/SP-274). */
  private buildRoutingContext(request: RoutingRequest): RoutingContext {
    return {
      request,
      options: this.options,
      fleet: this.activeFleet,
      fullFleet: this.fullFleet,
      hardwareResult: this.currentHardwareResult,
      triageResult: this.currentTriageResult,
      hydraResult: this.currentHydraResult,
      clusterMatch: this.currentClusterMatch,
      tierHint: this.currentTierHint,
      tierHintReasonCode: this.currentTierHintReasonCode,
      lowIntensityScore: this.currentLowIntensityScore,
      pSuccessCheap: this.currentPSuccessCheap,
      pSuccessRaw: this.currentPSuccessRaw,
      pSuccessCalibrated: this.currentPSuccessCalibrated,
      pSuccessAlpha: this.currentPSuccessAlpha,
      expectedCostByTier: this.currentExpectedCostByTier,
      localEligibleReason: this.currentLocalEligibleReason,
      contextFitRejected: this.currentContextFitRejected,
      contextFitViableCount: this.currentContextFitViableCount,
      contextOverflowTriggered: this.contextOverflowTriggered,
      contextOverflowPreferredProvider: this.contextOverflowPreferredProvider,
      breakevenReason: this.currentBreakevenReason,
      planningDelegate: this.currentPlanningDelegate,
      localZeroGateSkipReasons: this.currentLocalZeroGateSkipReasons,
      routePath: this.currentRoutePath,
      routePathConfidence: this.currentRoutePathConfidence,
      prewarmOutcome: this.currentPrewarmOutcome,
    };
  }

  /**
   * Run an extracted PipelineStage against a snapshot of the shared
   * RoutingContext, then sync context writes back to the per-route fields
   * (SP-272 seam). No behavior change.
   */
  private async runStageWithContext(
    stage: PipelineStage,
    request: RoutingRequest,
  ): Promise<StageResult> {
    const context = this.buildRoutingContext(request);
    const result = await stage.run(context);
    this.syncRoutingContext(context);
    return result;
  }

  /** Sync all mutable RoutingContext fields back to the per-route fields. */
  private syncRoutingContext(context: RoutingContext): void {
    this.activeFleet = context.fleet;
    this.currentHardwareResult = context.hardwareResult;
    this.currentTriageResult = context.triageResult;
    this.currentHydraResult = context.hydraResult;
    this.currentClusterMatch = context.clusterMatch;
    this.currentTierHint = context.tierHint;
    this.currentTierHintReasonCode = context.tierHintReasonCode;
    this.currentLowIntensityScore = context.lowIntensityScore;
    this.currentPSuccessCheap = context.pSuccessCheap;
    this.currentPSuccessRaw = context.pSuccessRaw;
    this.currentPSuccessCalibrated = context.pSuccessCalibrated;
    this.currentPSuccessAlpha = context.pSuccessAlpha;
    this.currentExpectedCostByTier = context.expectedCostByTier;
    this.currentLocalEligibleReason = context.localEligibleReason;
    this.currentContextFitRejected = context.contextFitRejected;
    this.currentContextFitViableCount = context.contextFitViableCount;
    this.contextOverflowTriggered = context.contextOverflowTriggered;
    this.contextOverflowPreferredProvider = context.contextOverflowPreferredProvider;
    this.currentBreakevenReason = context.breakevenReason;
    this.currentPlanningDelegate = context.planningDelegate;
    this.currentLocalZeroGateSkipReasons = context.localZeroGateSkipReasons;
    this.currentRoutePath = context.routePath;
    this.currentRoutePathConfidence = context.routePathConfidence;
    this.currentPrewarmOutcome = context.prewarmOutcome;
  }

  // ─── Stage wrappers (SP-273/SP-274, #143) ──────────────────────────────────
  // Thin delegations that keep the pre-extraction method names so prototype
  // spies in tests (e.g. SP-071 stage-error telemetry) keep working; the
  // stage logic lives in the extracted PipelineStage modules.

  private async hardwareProbeStage(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.hardwareProbePipelineStage, request);
  }

  private async loopEscalation(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.loopEscalationPipelineStage, request);
  }

  private async turnEnvelope(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.turnEnvelopePipelineStage, request);
  }

  private async contextFitStage(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.contextFitPipelineStage, request);
  }

  private async lowIntensityGate(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.lowIntensityPipelineStage, request);
  }

  private async sessionPin(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.sessionPinPipelineStage, request);
  }

  private async triage(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.triagePipelineStage, request);
  }

  private async localZeroTierStage(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.localZeroPipelineStage, request);
  }

  private async triageCloudFallback(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.triageCloudFallbackPipelineStage, request);
  }

  private async hydraMatcher(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.hydraMatchPipelineStage, request);
  }

  private async safeDefaultStage(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.safeDefaultPipelineStage, request);
  }

  private async contextOverflowFallback(request: RoutingRequest): Promise<StageResult> {
    return this.runStageWithContext(this.contextOverflowFallbackPipelineStage, request);
  }

  // ─── Pin persistence ────────────────────────────────────────────────────────

  /**
   * After a routing decision, persist an initial pin when none exists.
   * Sub-routes and already-pinned decisions skip persistence.
   */
  private persistPinIfNeeded(
    request: RoutingRequest,
    decision: RoutingDecision,
  ): void {
    const pinner = this.options.sessionPinner;
    if (!pinner) return;

    if (decision.reason_code === 'tool_result_sub_route') return;
    if (decision.reason_code === 'session_pinned') return;
    if (decision.reason_code === 'pin_only_fallback') return;
    if (decision.reason_code === 'saar_buffer_active') return;
    if (decision.reason_code === 'saar_hard_lock') return;
    // SP-209 / #121: a rejected force must not overwrite the existing pin — the
    // one-shot override simply could not be applied.
    if (decision.reason_code === FORCE_REJECTED_NOT_IN_FLEET) return;
    if (decision.reason_code === FORCE_REJECTED_UNHEALTHY) return;

    // Turn envelope is a per-turn tier bias — do not overwrite an existing pin (SP-064).
    if (decision.stage === 'turn_envelope' && pinner.getPin(request.session_id)) return;

    pinner.recordPin(request.session_id, decision.selected_model_id, 'initial');
  }

  /** Persist pin updates and advance SAAR turn index after each routed turn (SP-123). */
  private finalizeRoute(request: RoutingRequest, decision: RoutingDecision): void {
    this.persistPinIfNeeded(request, decision);
    this.recordSaarTurnIfNeeded(request);
  }

  private recordSaarTurnIfNeeded(request: RoutingRequest): void {
    this.options.sessionPinner?.recordSaarTurn(request.session_id);
  }
}
