/**
 * Low-intensity tier gate stage (SP-274, #143 partial): `low_intensity`.
 *
 * Behavior-preserving extraction from `RouterPipeline` behind the
 * `PipelineStage` / `RoutingContext` contract (SP-272).
 *
 * SP-103 / #58: runs after turn_envelope and context_fit, before
 * session_pin. Computes the low-intensity score from structural signals and
 * an optional cluster match; sets the tier hint (structural thresholds or
 * SP-149 expected-cost selection with virtual cost v2) and records
 * P(success) raw/calibrated outputs for the feature sidecar.
 *
 * The lazily loaded P(success) weights and isotonic calibrator artifacts are
 * cached in the stage factory closure — one cache per RouterPipeline
 * instance, exactly as the orchestrator fields they replace.
 */

import { triage as triageClassify } from '../triage/triage-engine.js';
import { resolveTriageCyclomaticThreshold } from '../triage/triage-thresholds.js';
import type { ClusterMatchResult } from '../matching/cluster-matcher.js';
import { clusterReasonCode } from '../../config/routing-clusters-loader.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../config/defaults.js';
import { buildTierFeatures, scoreLowIntensity } from '../routing/tier-features.js';
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
import type { Tier } from '../types/index.js';
import { isPinOnlyFallbackActive } from './stage-helpers.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';

function isLocalZeroTierReady(context: RoutingContext): boolean {
  const hasZeroTierModel = context.fleet.some(
    (model) => model.tier === 'zero-tier' && model.healthy !== false,
  );
  if (!hasZeroTierModel) {
    return false;
  }
  return context.hardwareResult === 'full_local';
}

function resolveLowIntensityTierHint(context: RoutingContext): Tier {
  if (isLocalZeroTierReady(context)) {
    return 'zero-tier';
  }
  return 'economical-cloud';
}

function resolveLowIntensityReasonCode(
  clusterMatch?: ClusterMatchResult,
): string {
  if (
    clusterMatch?.confidence === 'high' &&
    (clusterMatch.tierBias === 'zero-tier' ||
      clusterMatch.tierBias === 'economical-cloud')
  ) {
    return clusterReasonCode(clusterMatch.clusterId);
  }
  return 'low_intensity_structural';
}

function resolveHighIntensityReasonCode(
  clusterMatch?: ClusterMatchResult,
): string {
  if (clusterMatch?.confidence === 'high' && clusterMatch.tierBias === 'frontier-cloud') {
    return clusterReasonCode(clusterMatch.clusterId);
  }
  return 'high_intensity_structural';
}

function resolveTierHint(
  context: RoutingContext,
  score: number,
  highThreshold: number,
  lowThreshold: number,
  clusterMatch?: ClusterMatchResult,
): { tierHint: Tier | null; reasonCode: string | null } {
  if (score >= highThreshold) {
    return {
      tierHint: resolveLowIntensityTierHint(context),
      reasonCode: resolveLowIntensityReasonCode(clusterMatch),
    };
  }

  if (score <= lowThreshold) {
    return {
      tierHint: 'frontier-cloud',
      reasonCode: resolveHighIntensityReasonCode(clusterMatch),
    };
  }

  return { tierHint: null, reasonCode: null };
}

interface ExpectedCostTierHintSelection {
  tierHint: Tier | null;
  reasonCode: string | null;
  tierCosts: readonly ExpectedCostBreakdown[];
  rationale: string;
}

function selectExpectedCostTierHint(
  context: RoutingContext,
  pSuccessCheap: number,
  alpha: number,
): ExpectedCostTierHintSelection {
  const request = context.request;
  const estTokens =
    request.estimated_input_tokens ?? request.prompt_text.length;
  const pinner = context.options.sessionPinner;
  const sessionPin = pinner?.getPin(request.session_id) ?? undefined;
  const pinnedModel =
    sessionPin !== undefined
      ? context.fleet.find((model) => model.id === sessionPin.pinned_model_id)
      : undefined;

  const selection = selectTierByExpectedCost({
    fleet: context.fleet,
    priceCatalog: context.options.priceCatalog ?? null,
    estTokens,
    pSuccessCheap,
    alpha,
    localZeroReady: isLocalZeroTierReady(context),
    ...(pinnedModel !== undefined ? { pinnedModel } : {}),
    ...(sessionPin !== undefined ? { sessionPin } : {}),
    ...(context.options.quotaWindowPosition !== undefined
      ? { quotaWindowPosition: context.options.quotaWindowPosition }
      : {}),
    ...(context.options.virtualCostV2Config !== undefined
      ? { virtualCostV2Config: context.options.virtualCostV2Config }
      : {}),
  });

  context.expectedCostByTier = [...selection.tierCosts];

  return selection;
}

function logExpectedCostExplain(
  pSuccessCheap: number,
  alpha: number,
  selection: ExpectedCostTierHintSelection,
  calibration?: {
    readonly p_success_raw: number;
    readonly p_success_calibrated: number;
    readonly calibration_applied: boolean;
  },
): void {
  // SP-223 / #138: gate stdout explain behind SMART_ROUTER_LOG_ROUTING —
  // the full payload is already captured in decision features/telemetry, so
  // default runs must not flood stdout on every eligible route.
  if (process.env.SMART_ROUTER_LOG_ROUTING !== '1') {
    return;
  }
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
      virtual_cost_v2: entry.virtualCostV2
        ? {
            quota_decay_lambda: entry.virtualCostV2.quotaDecayLambda,
            quota_arbitrage_premium: entry.virtualCostV2.quotaArbitragePremium,
            exhaustion_risk_premium: entry.virtualCostV2.exhaustionRiskPremium,
            kv_cache_savings: entry.virtualCostV2.kvCacheSavings,
            effective_cost_usd: entry.virtualCostV2.effectiveCostUsd,
          }
        : null,
    })),
  });
}

/** Low-intensity tier gate: structural score → tier hint (never decides). */
export function createLowIntensityStage(): PipelineStage {
  // Lazily loaded artifact caches — one per RouterPipeline instance via the
  // factory closure, exactly as the orchestrator fields they replace.
  let pSuccessWeightsLoaded = false;
  let cachedPSuccessWeights: PSuccessWeights | null = null;
  let isotonicCalibratorLoaded = false;
  let cachedIsotonicCalibrator: IsotonicCalibratorArtifact | null = null;
  let cyclomaticThresholdLoaded = false;
  let cachedCyclomaticThreshold: number | undefined;

  const resolveWeights = (context: RoutingContext): PSuccessWeights => {
    if (context.options.pSuccessWeights) {
      return context.options.pSuccessWeights;
    }

    if (!pSuccessWeightsLoaded) {
      cachedPSuccessWeights = resolvePSuccessWeights({
        ...(context.options.pSuccessWeightsPath !== undefined
          ? { filePath: context.options.pSuccessWeightsPath }
          : {}),
      });
      pSuccessWeightsLoaded = true;
    }

    return cachedPSuccessWeights!;
  };

  const resolveCalibrator = (context: RoutingContext): IsotonicCalibratorArtifact | null => {
    if (context.options.isotonicCalibrator !== undefined) {
      return context.options.isotonicCalibrator;
    }

    if (!isotonicCalibratorLoaded) {
      cachedIsotonicCalibrator = resolveIsotonicCalibrator({
        ...(context.options.routingCalibrationPath !== undefined
          ? { filePath: context.options.routingCalibrationPath }
          : {}),
      });
      isotonicCalibratorLoaded = true;
    }

    return cachedIsotonicCalibrator;
  };

  const resolveCyclomaticThreshold = (context: RoutingContext): number => {
    if (context.options.cyclomaticThreshold !== undefined) {
      return context.options.cyclomaticThreshold;
    }
    if (!cyclomaticThresholdLoaded) {
      cachedCyclomaticThreshold = resolveTriageCyclomaticThreshold({
        ...(context.options.routingCalibrationPath !== undefined
          ? { filePath: context.options.routingCalibrationPath }
          : {}),
      });
      cyclomaticThresholdLoaded = true;
    }
    return cachedCyclomaticThreshold!;
  };

  return {
    name: 'low_intensity',
    async run(context: RoutingContext): Promise<StageResult> {
      const request = context.request;
      if (isPinOnlyFallbackActive(context.options, request)) {
        return { decided: false, stage: 'low_intensity' };
      }

      const config =
        context.options.lowIntensityConfig ?? DEFAULT_OPERATOR_CONFIG.low_intensity;
      const alpha = config.p_success_alpha;
      context.pSuccessAlpha = alpha;

      const cyclomaticThreshold = resolveCyclomaticThreshold(context);
      const triageResult = triageClassify(request.prompt_text, { cyclomaticThreshold });
      let clusterMatch: ClusterMatchResult | undefined;

      const matcher = context.options.clusterMatcher;
      if (matcher) {
        try {
          const result = await matcher.match(request);
          context.clusterMatch = result;
          clusterMatch = result;
        } catch {
          context.clusterMatch = null;
        }
      }

      const tierFeatures = buildTierFeatures(request, triageResult, undefined, clusterMatch);
      const score = scoreLowIntensity(tierFeatures, config.weights, { cyclomaticThreshold });
      context.lowIntensityScore = score;

      const weights = resolveWeights(context);
      const pFeatures = tierFeaturesToPSuccessFeatures(tierFeatures);
      const pResult = predictPSuccessCheapTimed(pFeatures, weights);
      const calibrator = resolveCalibrator(context);
      const calibratedResult = applyIsotonicCalibratorTimed(pResult.probability, calibrator);
      const pSuccessForGate = calibratedResult.calibrated;

      context.pSuccessRaw = pResult.probability;
      context.pSuccessCalibrated = pSuccessForGate;
      context.pSuccessCheap = pSuccessForGate;

      const structuralHint = resolveTierHint(
        context,
        score,
        config.high_threshold,
        config.low_threshold,
        clusterMatch,
      );
      const weightsTrained =
        weights.trained_sample_count >= weights.min_training_samples;
      const adjustedHint = weightsTrained
        ? (() => {
            const selection = selectExpectedCostTierHint(
              context,
              pSuccessForGate,
              alpha,
            );
            logExpectedCostExplain(pSuccessForGate, alpha, selection, {
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
      context.tierHint = adjustedHint.tierHint;
      context.tierHintReasonCode = adjustedHint.reasonCode;

      return { decided: false, stage: 'low_intensity' };
    },
  };
}
