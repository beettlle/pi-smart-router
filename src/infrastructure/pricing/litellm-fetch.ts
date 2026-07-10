/**
 * LiteLLM pricing fetch — manual refresh path (SP-045).
 *
 * Fetches the public LiteLLM model pricing JSON and normalizes chat-model
 * rates into PriceCatalog.registry_snapshot entries keyed by model id and
 * provider/model aliases for tri-tier broker lookup.
 */

import type { ModelLimits, PriceCatalog } from '../../domain/types/index.js';

export const DEFAULT_LITELLM_PRICING_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const CHAT_MODES = new Set(['chat', 'completion']);

export interface LitellmFetchResult {
  readonly registry_snapshot: Readonly<Record<string, number>>;
  readonly registry_limits_snapshot: Readonly<Record<string, ModelLimits>>;
  /** Number of LiteLLM chat/completion models normalized (before alias keys). */
  readonly model_count: number;
}

export interface LitellmFetchDeps {
  readonly fetchFn?: typeof fetch;
  readonly pricingUrl?: string;
  /** When set, aborts the LiteLLM pricing HTTP request (ESC / ctx.signal). */
  readonly signal?: AbortSignal;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) {
      throw reason;
    }
    const error = new Error(typeof reason === 'string' && reason.length > 0 ? reason : 'Aborted');
    error.name = 'AbortError';
    throw error;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export class LitellmFetchError extends Error {
  override readonly name = 'LitellmFetchError';
}

/**
 * Resolve pricing URL from env with documented LiteLLM GitHub default.
 */
export function getLitellmPricingUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.LITELLM_PRICING_URL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_LITELLM_PRICING_URL;
}

/**
 * Weighted blend of input/output per-token rates → USD per 1M tokens.
 * Matches the registry-cost formula planned for SP-046.
 */
export function computeCostPer1MTokens(
  inputCostPerToken: number,
  outputCostPerToken: number,
): number {
  const inputPer1M = inputCostPerToken * 1_000_000;
  const outputPer1M = outputCostPerToken * 1_000_000;
  return (inputPer1M + outputPer1M) / 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumberField(entry: Record<string, unknown>, field: string): number | undefined {
  const value = entry[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringField(entry: Record<string, unknown>, field: string): string | undefined {
  const value = entry[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveIntField(entry: Record<string, unknown>, field: string): number | undefined {
  const value = entry[field];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function parseModelLimits(entry: Record<string, unknown>): ModelLimits | undefined {
  const maxInputTokens = readPositiveIntField(entry, 'max_input_tokens');
  const maxOutputTokens =
    readPositiveIntField(entry, 'max_output_tokens') ?? readPositiveIntField(entry, 'max_tokens');

  if (maxInputTokens === undefined && maxOutputTokens === undefined) {
    return undefined;
  }

  return {
    ...(maxInputTokens !== undefined ? { max_input_tokens: maxInputTokens } : {}),
    ...(maxOutputTokens !== undefined ? { max_output_tokens: maxOutputTokens } : {}),
  };
}

function storeLimitsAlias(
  registry_limits_snapshot: Record<string, ModelLimits>,
  key: string,
  limits: ModelLimits,
): void {
  registry_limits_snapshot[key] = limits;
}

/**
 * Normalize LiteLLM pricing JSON into registry_snapshot rates.
 * Validates shape and fails fast with actionable errors.
 */
export function normalizeLitellmPricing(raw: unknown): LitellmFetchResult {
  if (!isRecord(raw)) {
    throw new LitellmFetchError(
      'LiteLLM pricing response must be a JSON object. Check LITELLM_PRICING_URL points at model_prices_and_context_window.json.',
    );
  }

  const registry_snapshot: Record<string, number> = {};
  const registry_limits_snapshot: Record<string, ModelLimits> = {};
  let modelCount = 0;

  for (const [modelKey, entry] of Object.entries(raw)) {
    if (modelKey === 'sample_spec') {
      continue;
    }

    if (!isRecord(entry)) {
      throw new LitellmFetchError(
        `LiteLLM pricing entry "${modelKey}" must be an object. Received ${typeof entry}.`,
      );
    }

    const mode = readStringField(entry, 'mode');
    if (mode !== undefined && !CHAT_MODES.has(mode)) {
      continue;
    }

    const inputCost = readNumberField(entry, 'input_cost_per_token');
    const outputCost = readNumberField(entry, 'output_cost_per_token');
    if (inputCost === undefined || outputCost === undefined) {
      continue;
    }

    const costPer1M = computeCostPer1MTokens(inputCost, outputCost);
    registry_snapshot[modelKey] = costPer1M;
    modelCount += 1;

    const limits = parseModelLimits(entry);
    if (limits !== undefined) {
      storeLimitsAlias(registry_limits_snapshot, modelKey, limits);
    }

    const provider = readStringField(entry, 'litellm_provider');
    if (provider !== undefined) {
      registry_snapshot[`${provider}/${modelKey}`] = costPer1M;
      if (limits !== undefined) {
        storeLimitsAlias(registry_limits_snapshot, `${provider}/${modelKey}`, limits);
      }
    }
  }

  if (Object.keys(registry_snapshot).length === 0) {
    throw new LitellmFetchError(
      'LiteLLM pricing response contained no chat models with input/output token costs.',
    );
  }

  return {
    registry_snapshot,
    registry_limits_snapshot,
    model_count: modelCount,
  };
}

export interface LitellmPriceCatalogResult {
  readonly catalog: PriceCatalog;
  /** Number of chat/completion models in the LiteLLM source payload. */
  readonly model_count: number;
}

/**
 * Fetch LiteLLM pricing and build a PriceCatalog payload (does not persist).
 */
export async function fetchLitellmPriceCatalog(
  deps: LitellmFetchDeps = {},
): Promise<LitellmPriceCatalogResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const url = deps.pricingUrl ?? getLitellmPricingUrl();
  const { signal } = deps;

  throwIfAborted(signal);

  let response: Response;
  try {
    response = signal ? await fetchFn(url, { signal }) : await fetchFn(url);
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throwIfAborted(signal);
      if (isAbortError(error)) {
        throw error;
      }
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new LitellmFetchError(
      `Failed to fetch LiteLLM pricing from ${url}: ${detail}`,
    );
  }

  throwIfAborted(signal);

  if (!response.ok) {
    throw new LitellmFetchError(
      `LiteLLM pricing fetch failed (${response.status} ${response.statusText}) from ${url}`,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throwIfAborted(signal);
      if (isAbortError(error)) {
        throw error;
      }
    }
    throw new LitellmFetchError(
      `LiteLLM pricing response from ${url} is not valid JSON.`,
    );
  }

  throwIfAborted(signal);

  const normalized = normalizeLitellmPricing(raw);

  return {
    catalog: {
      registry_snapshot: normalized.registry_snapshot,
      registry_limits_snapshot: normalized.registry_limits_snapshot,
      user_overrides: {},
      last_updated: new Date().toISOString(),
      source: 'registry',
    },
    model_count: normalized.model_count,
  };
}
