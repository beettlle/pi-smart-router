/**
 * Pipeline stage contract + shared routing context (SP-272, #143 partial).
 *
 * Target architecture: each pipeline stage implements {@link PipelineStage}
 * and reads/writes a shared per-route {@link RoutingContext} instead of
 * private `RouterPipeline` instance fields. This packet introduces the
 * interface and context only — SP-273/SP-274 extract stage clusters behind
 * it, SP-275 inverts the infrastructure ports. No routing behavior changes.
 *
 * Imports from `./router-pipeline.js` are type-only (erased at runtime), so
 * the router-pipeline ↔ pipeline-stage reference is not a runtime cycle.
 */

import type {
  CandidateScore,
  ModelProfile,
  PlanningDelegateObservability,
  RoutePath,
  RoutingRequest,
  Tier,
} from '../types/index.js';
import type { HardwareProbeResult } from '../../infrastructure/hardware/hardware-probe.js';
import type { TriageResult } from '../triage/triage-engine.js';
import type { MatchResult } from '../matching/hydra-matcher.js';
import type { ClusterMatchResult } from '../matching/cluster-matcher.js';
import type { ExpectedCostBreakdown } from '../routing/expected-cost.js';
import type { PrewarmOutcome } from '../routing/speculative-prewarm.js';
import type {
  PipelineOptions,
  PipelineStageName,
  StageResult,
} from './router-pipeline.js';

/**
 * Shared per-route state handed to every {@link PipelineStage}.
 *
 * Replaces the `RouterPipeline.current*` transient fields as the single
 * source of truth for cross-stage data flow. One context exists per
 * `route()` execution; the orchestrator resets it between routes (route()
 * calls are already single-flight serialized, SP-230).
 *
 * Mutability contract:
 * - `request`, `options`, and `fullFleet` are immutable for the route.
 * - `fleet` starts as the full fleet; `context_fit` may narrow it.
 * - Stage-output fields are written by the stage that produces them and read
 *   by later stages and by the orchestrator's telemetry/feature attachment.
 */
export interface RoutingContext {
  /** Incoming request being routed. Immutable for the route's lifetime. */
  readonly request: RoutingRequest;

  /**
   * Operator/injected pipeline options. Infrastructure dependencies live here
   * until SP-275 inverts them into domain ports.
   */
  readonly options: PipelineOptions;

  /** Fleet stages route against; `context_fit` narrows it per route. */
  fleet: readonly ModelProfile[];

  /** Unfiltered fleet for context-overflow escalation (SP-095). */
  readonly fullFleet: readonly ModelProfile[];

  // ── Per-route stage outputs (reset per route) ────────────────────────────

  /** hardware_probe result; gates local_zero dispatch. */
  hardwareResult: HardwareProbeResult;

  /** triage verdict + scores (FR-003). */
  triageResult: TriageResult | null;

  /** hydra_match neural match output (candidates + requirement vector). */
  hydraResult: MatchResult | null;

  /** Cluster matcher output feeding local_zero eligibility (SP-111). */
  clusterMatch: ClusterMatchResult | null;

  /** Expected-cost tier hint from low_intensity (SP-149 virtual cost v2). */
  tierHint: Tier | null;
  tierHintReasonCode: string | null;

  /** low_intensity structural score (0–1). */
  lowIntensityScore: number | null;

  /** P(success) classifier outputs: cheap pre-gate, raw, calibrated, alpha. */
  pSuccessCheap: number | null;
  pSuccessRaw: number | null;
  pSuccessCalibrated: number | null;
  pSuccessAlpha: number | null;

  /** Per-tier expected cost breakdown for explain/telemetry (SP-149). */
  expectedCostByTier: readonly ExpectedCostBreakdown[] | null;

  /** Why local_zero eligibility passed, for the feature sidecar (SP-111). */
  localEligibleReason: string | null;

  /** context_fit rejections + surviving fleet size (SP-093). */
  contextFitRejected: readonly CandidateScore[];
  contextFitViableCount: number;

  /** Context-overflow escalation state (SP-095). */
  contextOverflowTriggered: boolean;
  contextOverflowPreferredProvider: string | null;

  /** Pin-breakeven gate reason for explain wiring (SP-126). */
  breakevenReason: string | null;

  /** Planning-delegate observability for explain/telemetry (SP-143). */
  planningDelegate: PlanningDelegateObservability | null;

  /** Explicit local_zero gate skip reasons for tier-selection telemetry (SP-164). */
  localZeroGateSkipReasons: readonly string[];

  /** Degraded-sandwich route path classification (SP-212, #119). */
  routePath: RoutePath | null;
  routePathConfidence: number | null;

  /** Speculative prewarm outcome for explain/telemetry (SP-217, #117). */
  prewarmOutcome: PrewarmOutcome | null;
}

/**
 * Pipeline stage contract (SP-272, #143).
 *
 * A stage examines the shared {@link RoutingContext} and either:
 * - returns `{ decided: true, decision }` to short-circuit the pipeline, or
 * - returns `{ decided: false }` after recording any outputs on the context.
 *
 * Stages never throw routing-policy errors to the host: the orchestrator
 * catches any throw and degrades to the safe cloud default (constitution VI,
 * zero-crash resilience).
 */
export interface PipelineStage {
  /** Canonical stage name from `PIPELINE_STAGE_ORDER` (SP-119). */
  readonly name: PipelineStageName;

  /** Execute the stage against the shared per-route context. */
  run(context: RoutingContext): Promise<StageResult>;
}
