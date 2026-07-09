/**
 * Pipeline stage orchestrator — FR-001, FR-006, FR-022.
 *
 * Runs stages sequentially with early-exit on decision.
 * Documented order (SP-119, #69):
 *   hardware_probe → loop_escalation → turn_envelope → context_fit → low_intensity
 *   → session_pin → triage → local_zero → triage_cloud_fallback → hydra_match
 *   → safe_default → context_overflow_fallback
 * Any stage failure falls back to safeCloudDefault(); never throws to host.
 */

import type {
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
  RoutingFeatureSidecar,
  RoutingRequest,
  SaarConfig,
  Tier,
  CandidateScore,
} from '../types/index.js';
import type { LowIntensityConfig } from '../types/schemas.js';
import type { HardwareProbeConfig, HardwareProbeResult, SystemInfo } from '../../infrastructure/hardware/hardware-probe.js';
import type { HttpFetchPort, LocalZeroTierConfig } from '../../infrastructure/local/local-zero-tier.js';
import { probeHardware } from '../../infrastructure/hardware/hardware-probe.js';
import { pingLocalServices } from '../../infrastructure/local/local-zero-tier.js';
import { triage as triageClassify } from '../triage/triage-engine.js';
import type { TriageResult, TriageVerdict } from '../triage/triage-engine.js';
import { classifyTurnEnvelope } from '../triage/turn-envelope.js';
import { safeCloudDefault } from './safe-default.js';
import {
  isGoogleGeminiProfile,
  sessionHasGoogleReplayRiskForDeprioritize,
} from '../routing/tool-history-guard.js';
import {
  filterFleetByContextFit,
  needsContextOverflowFallback,
  resolveContextOverflowFallback,
  CONTEXT_OVERFLOW_NO_FIT,
  type ContextFitConfig,
} from '../routing/context-fit.js';
import type { SessionPinner } from '../pinning/session-pinner.js';
import { evaluateModelSwitchBreakeven } from '../pinning/session-pinner.js';
import { evaluateLoopEscalation } from '../pinning/loop-escalation.js';
import type { LoopEscalationConfig } from '../pinning/loop-escalation.js';
import { selectLowestCostModel } from '../pinning/sub-route-policy.js';
import {
  RoutingTelemetryEmitter,
  estimateRoutingCost,
  enrichRoutingDecisionWithContextFit,
  enrichRoutingDecisionWithTierSelection,
} from '../../infrastructure/telemetry/routing-telemetry.js';
import type { HydraMatcher as HydraMatcherType, MatchResult } from '../matching/hydra-matcher.js';
import type { ClusterMatcher, ClusterMatchResult } from '../matching/cluster-matcher.js';
import { clusterReasonCode } from '../../config/routing-clusters-loader.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../config/defaults.js';
import {
  buildTierFeatures,
  scoreLowIntensity,
} from '../routing/tier-features.js';
import {
  applyIsotonicCalibratorTimed,
  resolveIsotonicCalibrator,
  type IsotonicCalibratorArtifact,
} from '../routing/isotonic-calibrator.js';
import {
  predictPSuccessCheapTimed,
  resolvePSuccessWeights,
  tierFeaturesToPSuccessFeatures,
  type PSuccessWeights,
} from '../routing/p-success-classifier.js';
import {
  selectTierByExpectedCost,
  type ExpectedCostBreakdown,
} from '../routing/expected-cost.js';

// ─── Stage result ────────────────────────────────────────────────────────────

export interface StageResult {
  readonly decided: boolean;
  readonly decision?: RoutingDecision;
  readonly stage: string;
}

export type PipelineStage = (request: RoutingRequest) => Promise<StageResult>;

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

interface NamedPipelineStage {
  readonly name: string;
  readonly run: PipelineStage;
}

/** Inputs for local_zero eligibility beyond trivial-only triage (SP-111, #59). */
export interface LocalEligibleInput {
  readonly triageVerdict: TriageVerdict | null;
  readonly tierHint: Tier | null;
  readonly lowIntensityScore: number | null;
  readonly highThreshold: number;
  readonly clusterMatch: ClusterMatchResult | null;
}

export interface LocalEligibleResult {
  readonly eligible: boolean;
  readonly reason: string | null;
}

/**
 * Disjunction: triage trivial OR low-intensity zero-tier hint (high confidence)
 * OR high-confidence zero-tier cluster match.
 */
export function resolveLocalEligible(input: LocalEligibleInput): LocalEligibleResult {
  const clusterZeroTier =
    input.clusterMatch?.confidence === 'high' &&
    input.clusterMatch.tierBias === 'zero-tier';

  const lowIntensityZeroTier =
    input.tierHint === 'zero-tier' &&
    input.lowIntensityScore !== null &&
    input.lowIntensityScore >= input.highThreshold;

  const triageTrivial = input.triageVerdict === 'trivial';

  if (!triageTrivial && !lowIntensityZeroTier && !clusterZeroTier) {
    return { eligible: false, reason: null };
  }

  if (triageTrivial) {
    return { eligible: true, reason: 'triage_trivial' };
  }

  if (clusterZeroTier) {
    return {
      eligible: true,
      reason: clusterReasonCode(input.clusterMatch!.clusterId),
    };
  }

  return { eligible: true, reason: 'low_intensity_structural' };
}

// ─── Pipeline configuration ──────────────────────────────────────────────────

export interface PipelineOptions {
  readonly hardwareConfig?: HardwareProbeConfig;
  readonly localConfig?: LocalZeroTierConfig;
  readonly systemInfoProvider?: () => Promise<SystemInfo>;
  readonly httpFetchPort?: HttpFetchPort;
  readonly sessionPinner?: SessionPinner;
  readonly loopEscalationConfig?: LoopEscalationConfig;
  readonly telemetryEmitter?: RoutingTelemetryEmitter;
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
  private currentExpectedCostByTier: ExpectedCostBreakdown[] | null = null;
  private currentLocalEligibleReason: string | null = null;
  private pSuccessWeightsLoaded = false;
  private cachedPSuccessWeights: PSuccessWeights | null = null;
  private isotonicCalibratorLoaded = false;
  private cachedIsotonicCalibrator: IsotonicCalibratorArtifact | null = null;
  private currentContextFitRejected: readonly CandidateScore[] = [];
  private currentContextFitViableCount = 0;
  private contextOverflowPreferredProvider: string | null = null;
  private contextOverflowTriggered = false;
  /** Internal breakeven gate reason for SP-126 explain wiring. */
  private currentBreakevenReason: string | null = null;

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

  async route(
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
    };

    const withBaseFeatures = { ...decision, features };
    const withContextFit = enrichRoutingDecisionWithContextFit(
      request,
      withBaseFeatures,
      this.fullFleet,
      this.options.contextFitConfig,
    );
    return enrichRoutingDecisionWithTierSelection(withContextFit);
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
      error: this.redactPromptFromError(error, request.prompt_text),
    });
  }

  private redactPromptFromError(error: unknown, promptText: string): string {
    const message = error instanceof Error ? error.message : String(error);
    if (!promptText || !message.includes(promptText)) {
      return message;
    }
    return message.replaceAll(promptText, '[REDACTED]');
  }

  private emitPipelineErrorTelemetry(
    request: RoutingRequest,
    failedStage: string,
    fallback: RoutingDecision,
  ): void {
    this.options.telemetryEmitter?.emitPipelineError(request, failedStage, fallback);
  }

  /** Step 7: emit routing telemetry after decision (T040). */
  private emitTelemetry(request: RoutingRequest, decision: RoutingDecision): void {
    this.options.telemetryEmitter?.emit(request, decision);
  }

  private withEstimatedCost(
    request: RoutingRequest,
    model: ModelProfile,
    decision: RoutingDecision,
  ): RoutingDecision {
    return {
      ...decision,
      estimated_cost_usd: estimateRoutingCost(
        model,
        request,
        this.options.priceCatalog ?? null,
      ),
    };
  }

  private buildFallbackDecision(
    request: RoutingRequest,
    elapsedMs: number,
  ): RoutingDecision {
    if (this.shouldAttemptContextOverflowFallback(request)) {
      return this.buildContextOverflowFallbackDecision(request, elapsedMs);
    }

    const fallbackModel = safeCloudDefault(this.activeFleet, {
      request,
      ...(this.options.contextFitConfig !== undefined
        ? { contextFitConfig: this.options.contextFitConfig }
        : {}),
    });
    const modelId = fallbackModel?.id ?? 'unknown';
    const tier = fallbackModel?.tier ?? 'economical-cloud';

    return {
      request_id: request.request_id,
      selected_model_id: modelId,
      tier,
      stage: 'fallback',
      reason_code: 'safe_cloud_default',
      routing_latency_ms: elapsedMs,
      pin_reason: null,
    };
  }

  private shouldAttemptContextOverflowFallback(request: RoutingRequest): boolean {
    if (request.force_model_id) {
      return false;
    }

    if (this.contextOverflowTriggered) {
      return true;
    }

    return needsContextOverflowFallback(
      this.activeFleet,
      this.currentContextFitRejected,
      this.fullFleet,
    );
  }

  private buildContextOverflowFallbackDecision(
    request: RoutingRequest,
    elapsedMs: number,
  ): RoutingDecision {
    const overflow = resolveContextOverflowFallback(
      this.fullFleet,
      request,
      this.contextOverflowPreferredProvider,
      this.options.contextFitConfig,
    );

    if (overflow.kind === 'no_fit') {
      return {
        request_id: request.request_id,
        selected_model_id: 'unknown',
        tier: 'economical-cloud',
        stage: 'fallback',
        reason_code: CONTEXT_OVERFLOW_NO_FIT,
        candidates: this.currentContextFitRejected,
        routing_latency_ms: elapsedMs,
        pin_reason: null,
      };
    }

    const model = overflow.model!;
    return this.withEstimatedCost(request, model, {
      request_id: request.request_id,
      selected_model_id: model.id,
      tier: model.tier,
      stage: 'fallback',
      reason_code: overflow.reasonCode,
      candidates: this.currentContextFitRejected,
      routing_latency_ms: elapsedMs,
      pin_reason: null,
    });
  }

  /**
   * SP-095: after safe_default, escalate to largest-fit model when economical
   * models cannot fit the current context.
   */
  private async contextOverflowFallback(request: RoutingRequest): Promise<StageResult> {
    if (!this.shouldAttemptContextOverflowFallback(request)) {
      return { decided: false, stage: 'context_overflow_fallback' };
    }

    const elapsedMs = 0;
    const decision = this.buildContextOverflowFallbackDecision(request, elapsedMs);
    return {
      decided: true,
      stage: 'context_overflow_fallback',
      decision,
    };
  }

  /**
   * SP-022: economical-cloud default when no earlier stage decides.
   * Defers to context_overflow_fallback when economical models were context-rejected.
   */
  private async safeDefaultStage(request: RoutingRequest): Promise<StageResult> {
    if (this.shouldAttemptContextOverflowFallback(request)) {
      return { decided: false, stage: 'safe_default' };
    }

    const fallbackModel = safeCloudDefault(this.activeFleet, {
      request,
      ...(this.options.contextFitConfig !== undefined
        ? { contextFitConfig: this.options.contextFitConfig }
        : {}),
    });

    if (!fallbackModel) {
      return { decided: false, stage: 'safe_default' };
    }

    return {
      decided: true,
      stage: 'fallback',
      decision: {
        request_id: request.request_id,
        selected_model_id: fallbackModel.id,
        tier: fallbackModel.tier,
        stage: 'fallback',
        reason_code: 'safe_cloud_default',
        routing_latency_ms: 0,
        pin_reason: null,
      },
    };
  }

  private markContextOverflowFromPin(
    request: RoutingRequest,
    pinnedModelId: string,
  ): void {
    const pinnedModel = this.fullFleet.find((model) => model.id === pinnedModelId);
    this.contextOverflowTriggered = true;
    this.contextOverflowPreferredProvider = pinnedModel?.provider ?? null;
  }

  // ─── Implemented stages ─────────────────────────────────────────────────────

  private async hardwareProbeStage(request: RoutingRequest): Promise<StageResult> {
    void request;
    if (!this.options.hardwareConfig || !this.options.systemInfoProvider) {
      return { decided: false, stage: 'hardware_probe' };
    }

    const systemInfo = await this.options.systemInfoProvider();
    this.currentHardwareResult = probeHardware(this.options.hardwareConfig, systemInfo);
    return { decided: false, stage: 'hardware_probe' };
  }

  /**
   * SP-093: filter fleet to models whose context window fits estimated input
   * tokens before session pin and HyDRA matching.
   */
  private async contextFitStage(request: RoutingRequest): Promise<StageResult> {
    const result = filterFleetByContextFit(
      this.activeFleet,
      request,
      this.options.contextFitConfig,
    );
    this.activeFleet = result.effectiveFleet;
    this.currentContextFitRejected = result.rejected;
    this.currentContextFitViableCount = result.effectiveFleet.length;
    return { decided: false, stage: 'context_fit' };
  }

  /**
   * SC-007: classification_only MUST NOT dispatch full local.
   * Eligibility: triage trivial OR low-intensity zero-tier hint OR zero-tier cluster (SP-111).
   */
  private async localZeroTierStage(request: RoutingRequest): Promise<StageResult> {
    const lowIntensityConfig =
      this.options.lowIntensityConfig ?? DEFAULT_OPERATOR_CONFIG.low_intensity;
    const eligibility = resolveLocalEligible({
      triageVerdict: this.currentTriageResult?.verdict ?? null,
      tierHint: this.currentTierHint,
      lowIntensityScore: this.currentLowIntensityScore,
      highThreshold: lowIntensityConfig.high_threshold,
      clusterMatch: this.currentClusterMatch,
    });

    if (!eligibility.eligible) {
      return { decided: false, stage: 'local_zero' };
    }

    if (this.currentHardwareResult !== 'full_local') {
      return { decided: false, stage: 'local_zero' };
    }

    const readiness = await pingLocalServices(
      this.options.localConfig,
      this.options.httpFetchPort,
    );

    if (!readiness.anyModelReady) {
      return { decided: false, stage: 'local_zero' };
    }

    const localModel = this.activeFleet.find(
      (m) => m.tier === 'zero-tier' && m.healthy !== false,
    );

    if (!localModel) {
      return { decided: false, stage: 'local_zero' };
    }

    this.currentLocalEligibleReason = eligibility.reason;

    return {
      decided: true,
      stage: 'local_zero',
      decision: {
        request_id: request.request_id,
        selected_model_id: localModel.id,
        tier: 'zero-tier',
        stage: 'local_zero',
        reason_code: 'local_model_ready',
        routing_latency_ms: readiness.combinedLatencyMs,
        pin_reason: null,
      },
    };
  }

  // ─── Triage stage (FR-003, SC-004 <5ms budget) ──────────────────────────────

  private async triage(request: RoutingRequest): Promise<StageResult> {
    const result = triageClassify(request.prompt_text);
    this.currentTriageResult = result;

    if (result.verdict === 'ambiguous') {
      return { decided: false, stage: 'triage' };
    }

    // Trivial prompts defer cloud routing until after local zero-tier (PRD Step 4).
    if (result.verdict === 'trivial') {
      return { decided: false, stage: 'triage' };
    }

    const targetTier = 'frontier-cloud';
    const model = this.activeFleet.find((m) => m.tier === targetTier && m.healthy !== false);

    if (!model) {
      return { decided: false, stage: 'triage' };
    }

    return {
      decided: true,
      stage: 'triage',
      decision: {
        request_id: request.request_id,
        selected_model_id: model.id,
        tier: targetTier,
        stage: 'triage',
        reason_code: result.reason_code,
        routing_latency_ms: 0,
        pin_reason: null,
      },
    };
  }

  /**
   * Economical-cloud fallback for trivial prompts after local zero-tier is skipped
   * or unavailable (PRD Step 4 cloud fallback).
   */
  private async triageCloudFallback(request: RoutingRequest): Promise<StageResult> {
    if (this.currentTriageResult?.verdict !== 'trivial') {
      return { decided: false, stage: 'triage' };
    }

    const model = this.activeFleet.find(
      (m) => m.tier === 'economical-cloud' && m.healthy !== false,
    );

    if (!model) {
      return { decided: false, stage: 'triage' };
    }

    return {
      decided: true,
      stage: 'triage',
      decision: {
        request_id: request.request_id,
        selected_model_id: model.id,
        tier: 'economical-cloud',
        stage: 'triage',
        reason_code: this.currentTriageResult.reason_code,
        routing_latency_ms: 0,
        pin_reason: null,
      },
    };
  }

  // ─── Session pin stage (FR-006, FR-007, FR-008) ──────────────────────────

  private async sessionPin(request: RoutingRequest): Promise<StageResult> {
    const pinner = this.options.sessionPinner;
    if (!pinner) {
      return { decided: false, stage: 'session_pin' };
    }

    const existingPin = pinner.getPin(request.session_id);
    const saarRequest = this.enrichRequestWithSaarCandidate(request);
    const result = pinner.lookupPin(saarRequest, this.activeFleet);

    switch (result.action) {
      case 'use_pin': {
        const model = result.pinnedModel!;
        const pin = pinner.getPin(request.session_id);
        const reasonCode =
          result.saarReason === 'saar_hard_lock'
            ? 'saar_hard_lock'
            : result.saarReason === 'saar_tier_upgrade'
              ? 'saar_tier_upgrade'
              : 'session_pinned';
        return {
          decided: true,
          stage: 'session_pin',
          decision: this.withEstimatedCost(request, model, {
            request_id: request.request_id,
            selected_model_id: model.id,
            tier: model.tier,
            stage: 'session_pin',
            reason_code: reasonCode,
            routing_latency_ms: 0,
            pin_reason: pin?.pin_reason ?? null,
          }),
        };
      }

      case 'saar_route': {
        const model = result.saarRouteModel!;
        const pin = pinner.getPin(request.session_id);
        return {
          decided: true,
          stage: 'session_pin',
          decision: this.withEstimatedCost(request, model, {
            request_id: request.request_id,
            selected_model_id: model.id,
            tier: model.tier,
            stage: 'session_pin',
            reason_code: result.saarReason ?? 'saar_buffer_active',
            routing_latency_ms: 0,
            pin_reason: pin?.pin_reason ?? null,
          }),
        };
      }

      case 'sub_route': {
        const model = result.subRouteModel!;
        const pin = pinner.getPin(request.session_id);
        return {
          decided: true,
          stage: 'session_pin',
          decision: this.withEstimatedCost(request, model, {
            request_id: request.request_id,
            selected_model_id: model.id,
            tier: model.tier,
            stage: 'session_pin',
            reason_code: 'tool_result_sub_route',
            routing_latency_ms: 0,
            pin_reason: pin?.pin_reason ?? null,
          }),
        };
      }

      case 'break':
        if (result.breakReason === 'context_overflow' && existingPin) {
          this.markContextOverflowFromPin(request, existingPin.pinned_model_id);
        }
        return { decided: false, stage: 'session_pin' };

      case 'no_pin':
        if (existingPin) {
          const wasContextRejected = this.currentContextFitRejected.some(
            (candidate) => candidate.model_id === existingPin.pinned_model_id,
          );
          if (wasContextRejected) {
            this.markContextOverflowFromPin(request, existingPin.pinned_model_id);
          }
        }
        return { decided: false, stage: 'session_pin' };

      default:
        return { decided: false, stage: 'session_pin' };
    }
  }

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
    if (decision.reason_code === 'saar_buffer_active') return;
    if (decision.reason_code === 'saar_hard_lock') return;

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

  private enrichRequestWithSaarCandidate(request: RoutingRequest): RoutingRequest {
    if (request.candidate_model_id) {
      return request;
    }

    const turnType = request.turn_type ?? classifyTurnEnvelope(request.messages);
    const targetTier = RouterPipeline.TURN_TIER_MAP[turnType] ?? null;
    if (!targetTier) {
      return request;
    }

    const tierCandidates = this.activeFleet.filter(
      (m) => m.tier === targetTier && m.healthy !== false,
    );
    const model = selectLowestCostModel(tierCandidates);
    if (!model) {
      return request;
    }

    return { ...request, candidate_model_id: model.id };
  }

  private shouldDeferPlanningForSaar(request: RoutingRequest): boolean {
    const saarConfig = this.options.saarConfig;
    const pinner = this.options.sessionPinner;
    if (!saarConfig || !pinner) {
      return false;
    }

    const pin = pinner.getPin(request.session_id);
    if (!pin) {
      return false;
    }

    const saarState = pinner.getSaarState(request.session_id);
    const turnIndex = saarState?.turn_index ?? 0;
    return turnIndex >= saarConfig.planning_turn_buffer;
  }

  /**
   * SP-123: SAAR planning buffer explicitly allows frontier planning turns
   * without breakeven gating (#73 composes with buffer, not replaces it).
   */
  private isSaarPlanningBufferActive(request: RoutingRequest): boolean {
    const saarConfig = this.options.saarConfig;
    const pinner = this.options.sessionPinner;
    if (!saarConfig || !pinner) {
      return false;
    }

    if (!pinner.getPin(request.session_id)) {
      return false;
    }

    const saarState = pinner.getSaarState(request.session_id);
    if (!saarState) {
      return false;
    }

    return saarState.turn_index < saarConfig.planning_turn_buffer;
  }

  // ─── Turn envelope stage (Step 2b, <2ms budget) ─────────────────────────

  private static readonly TURN_TIER_MAP: Readonly<Record<string, Tier | null>> = {
    planning: 'frontier-cloud',
    tool_result: 'economical-cloud',
    subagent: 'economical-cloud',
    main_loop: null,
    unknown: null,
  };

  private async turnEnvelope(request: RoutingRequest): Promise<StageResult> {
    const turnType = request.turn_type ?? classifyTurnEnvelope(request.messages);
    const targetTier = RouterPipeline.TURN_TIER_MAP[turnType] ?? null;

    if (!targetTier) {
      return { decided: false, stage: 'turn_envelope' };
    }

    // SP-123: post-buffer planning defers to session_pin SAAR hard-lock.
    if (turnType === 'planning' && this.shouldDeferPlanningForSaar(request)) {
      return { decided: false, stage: 'turn_envelope' };
    }

    const tierCandidates = this.activeFleet.filter(
      (m) => m.tier === targetTier && m.healthy !== false,
    );
    const model = selectLowestCostModel(tierCandidates);
    if (!model) {
      return { decided: false, stage: 'turn_envelope' };
    }

    const pinner = this.options.sessionPinner;
    const pin = pinner?.getPin(request.session_id) ?? null;
    if (pin) {
      const pinnedModel = this.activeFleet.find(
        (m) => m.id === pin.pinned_model_id && m.healthy !== false,
      );
      if (pinnedModel && pinnedModel.id !== model.id) {
        const skipBreakeven =
          turnType === 'planning' && this.isSaarPlanningBufferActive(request);
        if (!skipBreakeven) {
          const tokenEstimate =
            request.estimated_input_tokens ?? request.prompt_text.length;
          const breakeven = evaluateModelSwitchBreakeven(
            pinnedModel,
            model,
            tokenEstimate,
            tokenEstimate,
            this.options.saarConfig,
          );
          if (!breakeven.shouldSwitch) {
            this.currentBreakevenReason = 'breakeven_blocked';
            return { decided: false, stage: 'turn_envelope' };
          }
          this.currentBreakevenReason = 'breakeven_pass';
        }
      }
    }

    return {
      decided: true,
      stage: 'turn_envelope',
      decision: this.withEstimatedCost(request, model, {
        request_id: request.request_id,
        selected_model_id: model.id,
        tier: targetTier,
        stage: 'turn_envelope',
        reason_code: `turn_${turnType}`,
        routing_latency_ms: 0,
        pin_reason: null,
      }),
    };
  }

  // ─── Low-intensity tier gate (SP-103, #58) ───────────────────────────────

  /**
   * Runs after turn_envelope and context_fit, before session_pin. Computes low-intensity score
   * from structural signals and optional cluster match; sets tier_hint and constrains
   * the active fleet for subsequent HyDRA matching when confidence is high.
   */
  private async lowIntensityGate(request: RoutingRequest): Promise<StageResult> {
    const config =
      this.options.lowIntensityConfig ?? DEFAULT_OPERATOR_CONFIG.low_intensity;
    const alpha = config.p_success_alpha;
    this.currentPSuccessAlpha = alpha;

    const triageResult = triageClassify(request.prompt_text);
    let clusterMatch: ClusterMatchResult | undefined;

    const matcher = this.options.clusterMatcher;
    if (matcher) {
      try {
        const result = await matcher.match(request);
        this.currentClusterMatch = result;
        clusterMatch = result;
      } catch {
        this.currentClusterMatch = null;
      }
    }

    const tierFeatures = buildTierFeatures(request, triageResult, undefined, clusterMatch);
    const score = scoreLowIntensity(tierFeatures, config.weights);
    this.currentLowIntensityScore = score;

    const weights = this.resolvePSuccessWeights();
    const pFeatures = tierFeaturesToPSuccessFeatures(tierFeatures);
    const pResult = predictPSuccessCheapTimed(pFeatures, weights);
    const calibrator = this.resolveIsotonicCalibrator();
    const calibratedResult = applyIsotonicCalibratorTimed(pResult.probability, calibrator);
    const pSuccessForGate = calibratedResult.calibrated;

    this.currentPSuccessRaw = pResult.probability;
    this.currentPSuccessCalibrated = pSuccessForGate;
    this.currentPSuccessCheap = pSuccessForGate;

    const structuralHint = this.resolveTierHint(
      score,
      config.high_threshold,
      config.low_threshold,
      clusterMatch,
    );
    const weightsTrained =
      weights.trained_sample_count >= weights.min_training_samples;
    const adjustedHint = weightsTrained
      ? (() => {
          const selection = this.selectExpectedCostTierHint(
            request,
            pSuccessForGate,
            alpha,
          );
          this.logExpectedCostExplain(pSuccessForGate, alpha, selection, {
            p_success_raw: pResult.probability,
            p_success_calibrated: pSuccessForGate,
            calibration_applied: calibratedResult.calibration_applied,
          });
          return {
            tierHint: selection.tierHint,
            reasonCode: selection.reasonCode,
          };
        })()
      : structuralHint;
    this.currentTierHint = adjustedHint.tierHint;
    this.currentTierHintReasonCode = adjustedHint.reasonCode;

    return { decided: false, stage: 'low_intensity' };
  }

  private selectExpectedCostTierHint(
    request: RoutingRequest,
    pSuccessCheap: number,
    alpha: number,
  ): {
    tierHint: Tier | null;
    reasonCode: string | null;
    tierCosts: readonly ExpectedCostBreakdown[];
    rationale: string;
  } {
    const estTokens =
      request.estimated_input_tokens ?? request.prompt_text.length;
    const pinner = this.options.sessionPinner;
    const sessionPin = pinner?.getPin(request.session_id) ?? undefined;
    const pinnedModel =
      sessionPin !== undefined
        ? this.activeFleet.find((model) => model.id === sessionPin.pinned_model_id)
        : undefined;

    const selection = selectTierByExpectedCost({
      fleet: this.activeFleet,
      priceCatalog: this.options.priceCatalog ?? null,
      estTokens,
      pSuccessCheap,
      alpha,
      localZeroReady: this.isLocalZeroTierReady(),
      ...(pinnedModel !== undefined ? { pinnedModel } : {}),
      ...(sessionPin !== undefined ? { sessionPin } : {}),
    });

    this.currentExpectedCostByTier = [...selection.tierCosts];

    return {
      tierHint: selection.tierHint,
      reasonCode: selection.reasonCode,
      tierCosts: selection.tierCosts,
      rationale: selection.rationale,
    };
  }

  private logExpectedCostExplain(
    pSuccessCheap: number,
    alpha: number,
    selection: {
      tierHint: Tier | null;
      reasonCode: string | null;
      tierCosts: readonly ExpectedCostBreakdown[];
      rationale: string;
    },
    calibration?: {
      readonly p_success_raw: number;
      readonly p_success_calibrated: number;
      readonly calibration_applied: boolean;
    },
  ): void {
    console.info('Expected-cost tier gate', {
      reason: selection.reasonCode,
      p_success_cheap: pSuccessCheap,
      p_success_raw: calibration?.p_success_raw ?? pSuccessCheap,
      p_success_calibrated: calibration?.p_success_calibrated ?? pSuccessCheap,
      calibration_applied: calibration?.calibration_applied ?? false,
      alpha,
      chosen_tier: selection.tierHint,
      rationale: selection.rationale,
      expected_cost_by_tier: selection.tierCosts.map((entry) => ({
        tier: entry.tier,
        p_success: entry.pSuccess,
        cost_per_1m: entry.costPer1M,
        expected_cost_usd: entry.expectedCostUsd,
        adjusted_expected_cost_usd: entry.adjustedExpectedCostUsd,
      })),
    });
  }

  private resolvePSuccessWeights(): PSuccessWeights {
    if (this.options.pSuccessWeights) {
      return this.options.pSuccessWeights;
    }

    if (!this.pSuccessWeightsLoaded) {
      this.cachedPSuccessWeights = resolvePSuccessWeights({
        ...(this.options.pSuccessWeightsPath !== undefined
          ? { filePath: this.options.pSuccessWeightsPath }
          : {}),
      });
      this.pSuccessWeightsLoaded = true;
    }

    return this.cachedPSuccessWeights!;
  }

  private resolveIsotonicCalibrator(): IsotonicCalibratorArtifact | null {
    if (this.options.isotonicCalibrator !== undefined) {
      return this.options.isotonicCalibrator;
    }

    if (!this.isotonicCalibratorLoaded) {
      this.cachedIsotonicCalibrator = resolveIsotonicCalibrator({
        ...(this.options.routingCalibrationPath !== undefined
          ? { filePath: this.options.routingCalibrationPath }
          : {}),
      });
      this.isotonicCalibratorLoaded = true;
    }

    return this.cachedIsotonicCalibrator;
  }

  private resolveTierHint(
    score: number,
    highThreshold: number,
    lowThreshold: number,
    clusterMatch?: ClusterMatchResult,
  ): { tierHint: Tier | null; reasonCode: string | null } {
    if (score >= highThreshold) {
      return {
        tierHint: this.resolveLowIntensityTierHint(),
        reasonCode: this.resolveLowIntensityReasonCode(clusterMatch),
      };
    }

    if (score <= lowThreshold) {
      return {
        tierHint: 'frontier-cloud',
        reasonCode: this.resolveHighIntensityReasonCode(clusterMatch),
      };
    }

    return { tierHint: null, reasonCode: null };
  }

  private resolveLowIntensityTierHint(): Tier {
    if (this.isLocalZeroTierReady()) {
      return 'zero-tier';
    }
    return 'economical-cloud';
  }

  private isLocalZeroTierReady(): boolean {
    const hasZeroTierModel = this.activeFleet.some(
      (model) => model.tier === 'zero-tier' && model.healthy !== false,
    );
    if (!hasZeroTierModel) {
      return false;
    }
    return this.currentHardwareResult === 'full_local';
  }

  private resolveLowIntensityReasonCode(clusterMatch?: ClusterMatchResult): string {
    if (
      clusterMatch?.confidence === 'high' &&
      (clusterMatch.tierBias === 'zero-tier' ||
        clusterMatch.tierBias === 'economical-cloud')
    ) {
      return clusterReasonCode(clusterMatch.clusterId);
    }
    return 'low_intensity_structural';
  }

  private resolveHighIntensityReasonCode(clusterMatch?: ClusterMatchResult): string {
    if (clusterMatch?.confidence === 'high' && clusterMatch.tierBias === 'frontier-cloud') {
      return clusterReasonCode(clusterMatch.clusterId);
    }
    return 'high_intensity_structural';
  }

  private constrainFleetToTierHint(
    fleet: readonly ModelProfile[],
    tierHint: Tier,
  ): readonly ModelProfile[] {
    const filtered = fleet.filter(
      (model) => model.tier === tierHint && model.healthy !== false,
    );
    return filtered.length > 0 ? filtered : fleet;
  }

  // ─── Loop escalation (Step 3b — FR-014) ─────────────────────────────────

  /**
   * Observational loop escalation: detects repeated identical tool failures
   * and re-pins the session to a frontier-capable tier.
   *
   * Runs before turn_envelope and session_pin so it can modify pin state.
   * Never returns decided: true — turnEnvelope or sessionPin picks up the
   * (potentially escalated) pin on subsequent stages.
   */
  private async loopEscalation(request: RoutingRequest): Promise<StageResult> {
    const pinner = this.options.sessionPinner;
    const config = this.options.loopEscalationConfig;
    if (!pinner || !config) {
      return { decided: false, stage: 'loop_escalation' };
    }

    const pin = pinner.getPin(request.session_id);
    const result = evaluateLoopEscalation(pin, request, this.activeFleet, config);

    if (result.updatedPin) {
      pinner.loadPin(result.updatedPin);
    }

    if (result.shouldEscalate && result.escalationTarget) {
      pinner.breakPin(request.session_id);
      pinner.recordPin(
        request.session_id,
        result.escalationTarget.id,
        'loop_escalation',
      );
    }

    return { decided: false, stage: 'loop_escalation' };
  }

  /**
   * Step 5: HyDRA embedding matcher for ambiguous prompts (T050).
   * Scores fleet candidates via embedding cosine similarity with shortfall gate.
   * Pass-through when no matcher is configured.
   */
  private async hydraMatcher(request: RoutingRequest): Promise<StageResult> {
    const matcher = this.options.hydraMatcher;
    if (!matcher) {
      return { decided: false, stage: 'hydra_match' };
    }

    const fleetForMatch = this.currentTierHint
      ? this.constrainFleetToTierHint(this.activeFleet, this.currentTierHint)
      : this.activeFleet;

    const result = await matcher.match(request, fleetForMatch);
    this.currentHydraResult = result;

    if (!result.selected) {
      return { decided: false, stage: 'hydra_match' };
    }

    const selectedModel = this.activeFleet.find(
      (m) => m.id === result.selected!.model_id,
    );
    if (!selectedModel) {
      return { decided: false, stage: 'hydra_match' };
    }

    return {
      decided: true,
      stage: 'hydra_match',
      decision: this.withEstimatedCost(request, selectedModel, {
        request_id: request.request_id,
        selected_model_id: selectedModel.id,
        tier: selectedModel.tier,
        stage: 'hydra_match',
        reason_code: 'hydra_embedding_match',
        candidates: result.candidates,
        routing_latency_ms: result.elapsedMs,
        pin_reason: null,
      }),
    };
  }
}
