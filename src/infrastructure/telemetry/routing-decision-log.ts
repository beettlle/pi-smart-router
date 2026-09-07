/**
 * Routing decision log / explain payload builders — SP-276 (#143 bounded split).
 *
 * Enrichment pipeline and JSON payload shape for explain responses and
 * `SMART_ROUTER_LOG_ROUTING=1` stderr lines, including peak-pricing
 * observability. Extracted from `routing-telemetry.ts`; the emitter façade
 * re-exports these for import-path stability.
 */

import type { ContextFitConfig } from '../../domain/routing/context-fit.js';
import type { ClusterMatcher } from '../../domain/matching/cluster-matcher.js';
import type { SessionPinner } from '../../domain/pinning/session-pinner.js';
import type {
  ClusterMatchTableEntry,
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
  RoutingRequest,
  SaarConfig,
} from '../../domain/types/index.js';
import type { QuotaWindowPosition } from '../../domain/types/entities.js';
import type { VirtualCostV2Config } from '../../domain/types/schemas.js';
import {
  enrichRoutingDecisionWithContextFit,
  enrichRoutingDecisionWithTierSelection,
} from '../../domain/ports/telemetry-emitter-port.js';
import {
  resolvePeakPricingAdjustment,
  type PricingWindow,
} from '../../domain/pricing/peak-pricing.js';
import {
  buildFlipFlopObservability,
  enrichRoutingDecisionWithPinEconomics,
  type BreakevenObservabilityV2,
  type PinEconomicsObservabilityInput,
} from './pin-economics-telemetry.js';
import {
  enrichRoutingDecisionWithPlanningDelegate,
} from './planning-delegate-telemetry.js';
import { resolvePinOnlyFallbackActive } from './telemetry-scalar-fields.js';

export interface ExplainEnrichmentOptions {
  readonly fleet?: readonly ModelProfile[];
  readonly contextFitConfig?: ContextFitConfig;
  readonly clusterMatcher?: ClusterMatcher;
  readonly sessionPinner?: SessionPinner;
  readonly saarConfig?: SaarConfig;
  readonly priceCatalog?: PriceCatalog | null;
  readonly quotaWindowPosition?: QuotaWindowPosition;
  readonly virtualCostV2Config?: VirtualCostV2Config;
}

/** Attach context-fit and tier-selection observability for explain responses (SP-110, SP-113). */
export async function enrichRoutingDecisionForExplain(
  request: RoutingRequest,
  decision: RoutingDecision,
  options?: ExplainEnrichmentOptions,
): Promise<RoutingDecision> {
  const withContextFit = enrichRoutingDecisionWithContextFit(
    request,
    decision,
    options?.fleet,
    options?.contextFitConfig,
  );

  let clusterMatchTable: readonly ClusterMatchTableEntry[] | null = null;
  if (options?.clusterMatcher) {
    try {
      clusterMatchTable = await options.clusterMatcher.matchTable(request);
    } catch {
      clusterMatchTable = null;
    }
  }

  return enrichRoutingDecisionWithPinEconomics(
    request,
    enrichRoutingDecisionWithPlanningDelegate(
      enrichRoutingDecisionWithTierSelection(withContextFit, clusterMatchTable),
    ),
    pinEconomicsOptionsFromExplain(options),
  );
}

function pinEconomicsOptionsFromExplain(
  options?: ExplainEnrichmentOptions,
): Omit<PinEconomicsObservabilityInput, 'request' | 'decision'> {
  return {
    ...(options?.fleet !== undefined ? { fleet: options.fleet } : {}),
    ...(options?.sessionPinner !== undefined
      ? { sessionPinner: options.sessionPinner }
      : {}),
    ...(options?.saarConfig !== undefined ? { saarConfig: options.saarConfig } : {}),
    ...(options?.priceCatalog !== undefined ? { priceCatalog: options.priceCatalog } : {}),
    ...(options?.quotaWindowPosition !== undefined
      ? { quotaWindowPosition: options.quotaWindowPosition }
      : {}),
    ...(options?.virtualCostV2Config !== undefined
      ? { virtualCostV2Config: options.virtualCostV2Config }
      : {}),
  };
}

export interface RoutingDecisionLogDelegate {
  readonly provider: string;
  readonly modelId: string;
  readonly api: string;
}

/** Peak-pricing observability for explain/log payloads (SP-244, #165). */
export interface PeakPricingObservability {
  readonly window: PricingWindow;
  readonly cost_multiplier: number;
  readonly adapter_id: 'zai' | 'deepseek' | null;
}

/**
 * Resolve peak/off-peak pricing observability for a log/explain payload
 * (SP-244, #165). Prefers the fleet profile so provider-aware adapter matching
 * (e.g. `provider: 'zai'`) applies; falls back to the bare selected id so
 * `glm-*` / `deepseek-*` ids still classify when no fleet is available.
 * Never null — non-target providers yield `window: 'none'`, multiplier 1.
 */
export function buildPeakPricingObservability(
  modelId: string,
  fleet?: readonly ModelProfile[],
): PeakPricingObservability {
  const profile = fleet?.find((entry) => entry.id === modelId);
  const adjustment = resolvePeakPricingAdjustment(profile ?? { id: modelId });
  return {
    window: adjustment.window,
    cost_multiplier: adjustment.cost_multiplier,
    adapter_id: adjustment.adapter_id,
  };
}

/** JSON payload for SMART_ROUTER_LOG_ROUTING=1 stderr lines (SP-110). */
export function buildRoutingDecisionLogPayload(
  request: RoutingRequest,
  decision: RoutingDecision,
  delegate?: RoutingDecisionLogDelegate,
  fleet?: readonly ModelProfile[],
  contextFitConfig?: ContextFitConfig,
  pinEconomics?: Omit<PinEconomicsObservabilityInput, 'request' | 'decision' | 'fleet'>,
): Record<string, unknown> {
  const enriched = enrichRoutingDecisionWithPinEconomics(
    request,
    enrichRoutingDecisionWithPlanningDelegate(
      enrichRoutingDecisionWithTierSelection(
        enrichRoutingDecisionWithContextFit(
          request,
          decision,
          fleet,
          contextFitConfig,
        ),
      ),
    ),
    {
      ...(fleet !== undefined ? { fleet } : {}),
      ...(pinEconomics?.sessionPinner !== undefined
        ? { sessionPinner: pinEconomics.sessionPinner }
        : {}),
      ...(pinEconomics?.saarConfig !== undefined
        ? { saarConfig: pinEconomics.saarConfig }
        : {}),
    },
  );

  const tierSelection = enriched.features?.tier_selection;
  const breakeven = enriched.features?.breakeven as BreakevenObservabilityV2 | undefined;
  const saar = enriched.features?.saar;
  const planningDelegate = enriched.features?.planning_delegate;
  const flipFlop = buildFlipFlopObservability({
    request,
    decision,
    ...(fleet !== undefined ? { fleet } : {}),
    ...(pinEconomics?.sessionPinner !== undefined
      ? { sessionPinner: pinEconomics.sessionPinner }
      : {}),
    ...(pinEconomics?.saarConfig !== undefined
      ? { saarConfig: pinEconomics.saarConfig }
      : {}),
  });
  // SP-244 / #165: surface peak vs off-peak rationale on the log payload.
  const peakPricing = buildPeakPricingObservability(enriched.selected_model_id, fleet);

  return {
    request_id: enriched.request_id,
    selected_model_id: enriched.selected_model_id,
    tier: enriched.tier,
    stage: enriched.stage,
    reason_code: enriched.reason_code,
    // Top-level checklist fields for SMART_ROUTER_LOG_ROUTING=1 (SP-178 / #99)
    low_intensity_score:
      tierSelection?.low_intensity_score ??
      enriched.features?.low_intensity_score ??
      null,
    tier_hint: tierSelection?.tier_hint ?? enriched.features?.tier_hint ?? null,
    local_eligible_reason:
      tierSelection?.local_eligible_reason ??
      enriched.features?.local_eligible_reason ??
      null,
    cluster_id: tierSelection?.cluster_id ?? null,
    routing_latency_ms: enriched.routing_latency_ms,
    features: enriched.features ?? null,
    cluster_summary: tierSelection
      ? {
          cluster_id: tierSelection.cluster_id,
          cluster_similarity: tierSelection.cluster_similarity,
          cluster_margin: tierSelection.cluster_margin,
          tier_hint: tierSelection.tier_hint,
          tier_selection_reason_code: tierSelection.tier_selection_reason_code,
          low_intensity_score: tierSelection.low_intensity_score,
          p_success_cheap: tierSelection.p_success_cheap,
        }
      : null,
    breakeven_summary: breakeven
      ? {
          marginal_savings: breakeven.marginal_savings,
          future_cache_value: breakeven.future_cache_value,
          cache_reprime_cost: breakeven.cache_reprime_cost,
          decision: breakeven.decision,
          breakeven_reason_code: breakeven.breakeven_reason_code,
          quota_premium_usd: breakeven.quota_premium_usd,
          kv_cache_credit_usd: breakeven.kv_cache_credit_usd,
        }
      : null,
    saar_summary: saar
      ? {
          buffer_active: saar.buffer_active,
          hard_lock: saar.hard_lock,
          turn_index_in_session: saar.turn_index_in_session,
          planning_turn_buffer: saar.planning_turn_buffer,
          idle_timeout_seconds: saar.idle_timeout_seconds,
          saar_reason_code: saar.saar_reason_code,
        }
      : null,
    planning_delegate_summary: planningDelegate
      ? {
          path: planningDelegate.path,
          primary_model_id: planningDelegate.primary_model_id,
          delegate_model_id: planningDelegate.delegate_model_id,
          compressed_context: planningDelegate.compressed_context,
          planning_delegate_reason_code: planningDelegate.planning_delegate_reason_code,
          fallback_reason: planningDelegate.fallback_reason,
          workers_spawned: planningDelegate.workers_spawned,
          workers_succeeded: planningDelegate.workers_succeeded,
          worker_timeout_count: planningDelegate.worker_timeout_count,
        }
      : null,
    flip_flop_summary: flipFlop
      ? {
          consecutive_tier_flips: flipFlop.consecutive_tier_flips,
          tier_pinned: flipFlop.tier_pinned,
          shadow_event: flipFlop.shadow_event,
        }
      : null,
    pricing_window: peakPricing.window,
    peak_pricing_summary: peakPricing,
    pin_only_fallback_active: resolvePinOnlyFallbackActive(enriched),
    delegate,
  };
}
