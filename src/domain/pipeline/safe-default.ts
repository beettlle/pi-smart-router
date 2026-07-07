/**
 * Safe cloud default — FR-022 fallback selector.
 *
 * Selects the first healthy economical-cloud model from the fleet,
 * falling back to frontier-cloud only when no economical model is available.
 * Never throws; returns undefined only when the fleet is completely empty or unhealthy.
 *
 * SP-095: when a request is provided, only models that fit context are eligible.
 */

import type { ModelProfile, RoutingRequest } from '../types/index.js';
import {
  modelFitsContext,
  resolveSafetyMargin,
  type ContextFitConfig,
} from '../routing/context-fit.js';

export interface SafeCloudDefaultOptions {
  readonly request?: RoutingRequest;
  readonly contextFitConfig?: ContextFitConfig;
}

function isHealthy(model: ModelProfile): boolean {
  return model.healthy !== false;
}

function fitsWhenRequired(
  model: ModelProfile,
  request: RoutingRequest | undefined,
  config: ContextFitConfig | undefined,
): boolean {
  if (!request) {
    return true;
  }

  const estimatedInputTokens =
    request.estimated_input_tokens ?? request.prompt_text.length;
  return modelFitsContext(model, estimatedInputTokens, resolveSafetyMargin(config));
}

/**
 * Select a safe cloud default model from the fleet catalog.
 *
 * Priority order:
 *   1. First healthy economical-cloud model (context-fit aware when request provided)
 *   2. First healthy frontier-cloud model (fallback)
 *   3. undefined (no viable model)
 */
export function safeCloudDefault(
  models: readonly ModelProfile[],
  options?: SafeCloudDefaultOptions,
): ModelProfile | undefined {
  const request = options?.request;
  const config = options?.contextFitConfig;

  const economical = models.find(
    (model) =>
      model.tier === 'economical-cloud' &&
      isHealthy(model) &&
      fitsWhenRequired(model, request, config),
  );
  if (economical) return economical;

  return models.find(
    (model) =>
      model.tier === 'frontier-cloud' &&
      isHealthy(model) &&
      fitsWhenRequired(model, request, config),
  );
}
