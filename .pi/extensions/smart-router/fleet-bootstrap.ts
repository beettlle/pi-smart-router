import type { Api, Model } from '@earendil-works/pi-ai/compat';
import {
  ModelRegistry,
  SettingsManager,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';

import { mapFleetFromRegistry } from '../../../src/config/pi-model-mapper.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../../src/config/defaults.js';
import {
  HydraMatcher,
  createOnnxEmbeddingProvider,
} from '../../../src/domain/matching/hydra-matcher.js';
import { SessionPinner } from '../../../src/domain/pinning/session-pinner.js';
import type { ModelProfile, PriceCatalog } from '../../../src/domain/types/index.js';
import type { StorePort } from '../../../src/domain/types/store-port.js';
import { getDefaultSystemInfo } from '../../../src/infrastructure/hardware/hardware-probe.js';
import { DEFAULT_LOCAL_CONFIG } from '../../../src/infrastructure/local/local-zero-tier.js';
import { RoutingTelemetryEmitter } from '../../../src/infrastructure/telemetry/routing-telemetry.js';
import { applyCatalogPricesToFleet } from '../../../src/infrastructure/pricing/price-broker.js';
import {
  createRouterFromFleet,
  type GatewayDispatchOptions,
  type PiExtensionHooks,
} from '../../../src/index.js';
import type { FleetMode, SmartRouterRuntime } from './types.js';
import { resolveRateLimiter } from './utils.js';

/** Minimal settings surface used for scoped fleet discovery. */
export interface ScopedSettingsReader {
  getEnabledModels(): string[] | null | undefined;
}

export interface DiscoverFleetDeps {
  settingsFactory?: (cwd: string) => ScopedSettingsReader;
}

/** Footer label for the last model that successfully served a delegated stream. */
export function formatLmuStatus(
  modelId: string,
  theme?: { fg: (color: string, text: string) => string },
): string {
  const label = `LMU: ${modelId}`;
  return theme ? theme.fg('dim', label) : label;
}

export function createHooksAdapter(pi: ExtensionAPI): PiExtensionHooks {
  return {
    on(event, handler) {
      // PiExtensionHooks event names are a subset of ExtensionAPI; cast bridges the gap.
      pi.on(event as never, handler as never);
    },
  };
}

const THINKING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);

function stripThinkingLevelSuffix(pattern: string): string {
  const colonIdx = pattern.lastIndexOf(':');
  if (colonIdx === -1) {
    return pattern;
  }

  const suffix = pattern.substring(colonIdx + 1);
  if (THINKING_LEVELS.has(suffix)) {
    return pattern.substring(0, colonIdx);
  }

  return pattern;
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexSource = `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`;
  return new RegExp(regexSource, 'i');
}

function matchesScopedPattern(model: Model<Api>, pattern: string): boolean {
  const modelPattern = stripThinkingLevelSuffix(pattern);
  const fullId = `${model.provider}/${model.id}`;

  if (modelPattern.includes('*') || modelPattern.includes('?') || modelPattern.includes('[')) {
    const regex = patternToRegExp(modelPattern);
    return regex.test(fullId) || regex.test(model.id);
  }

  if (modelPattern.includes('/')) {
    return fullId === modelPattern;
  }

  return model.id === modelPattern || fullId === modelPattern;
}

function filterScopedModels(available: readonly Model<Api>[], patterns: readonly string[]): Model<Api>[] {
  const matched = new Set<string>();
  const result: Model<Api>[] = [];

  for (const pattern of patterns) {
    for (const model of available) {
      const key = `${model.provider}/${model.id}`;
      if (matchesScopedPattern(model, pattern) && !matched.has(key)) {
        matched.add(key);
        result.push(model);
      }
    }
  }

  return result;
}

function registryModelsToFleetInput(models: readonly Model<Api>[]) {
  return models.map((model) => ({
    provider: model.provider,
    id: model.id,
    ...(model.name !== undefined ? { name: model.name } : {}),
    cost: {
      input: model.cost.input,
      output: model.cost.output,
      cacheRead: model.cost.cacheRead,
      cacheWrite: model.cost.cacheWrite,
    },
  }));
}

export async function discoverFleet(
  modelRegistry: ModelRegistry,
  mode: FleetMode,
  cwd: string,
  store: StorePort,
  deps?: DiscoverFleetDeps,
): Promise<{ fleet: ModelProfile[]; catalog: PriceCatalog | null }> {
  const available = modelRegistry.getAvailable();
  let models = available;

  if (mode === 'scoped') {
    const settingsFactory = deps?.settingsFactory ?? SettingsManager.create;
    const settings = settingsFactory(cwd);
    const patterns = settings.getEnabledModels();
    if (patterns && patterns.length > 0) {
      models = filterScopedModels(available, patterns);
    }
  }

  const mappedFleet = mapFleetFromRegistry(registryModelsToFleetInput(models));
  const catalog = await store.getPriceCatalog();
  const fleet = applyCatalogPricesToFleet(mappedFleet, catalog);

  return { fleet, catalog };
}

export function createDispatchOptions(
  store: StorePort,
  sessionPinner: SessionPinner,
  hydraMatcher?: HydraMatcher,
): GatewayDispatchOptions {
  const telemetryEmitter = new RoutingTelemetryEmitter({
    onRecord: (record) => {
      store.appendTelemetry(record);
    },
  });
  const rateLimiter = resolveRateLimiter(store);

  return {
    sessionPinner,
    hardwareConfig: DEFAULT_OPERATOR_CONFIG.local,
    systemInfoProvider: getDefaultSystemInfo,
    localConfig: DEFAULT_LOCAL_CONFIG,
    loopEscalationConfig: DEFAULT_OPERATOR_CONFIG.loop_escalation,
    ...(hydraMatcher ? { hydraMatcher } : {}),
    ...(rateLimiter ? { rateLimiter } : {}),
    telemetryEmitter,
  };
}

export async function rebuildFleet(
  runtime: SmartRouterRuntime,
  pi: ExtensionAPI,
  cwd: string,
): Promise<void> {
  const { fleet, catalog } = await discoverFleet(
    runtime.modelRegistry,
    runtime.fleetMode,
    cwd,
    runtime.store,
  );
  runtime.priceCatalog = catalog;
  const router = createRouterFromFleet(fleet, {
    ...createDispatchOptions(runtime.store, runtime.sessionPinner, runtime.hydraMatcher),
    lifecycleHookState: runtime.lifecycleHookState,
  });
  router.register(createHooksAdapter(pi));
  runtime.streamDeps.router = router;
  runtime.streamDeps.fleet = fleet;
}

/**
 * Optional HyDRA matcher bootstrap.
 *
 * Requires `@huggingface/transformers` at runtime (see root package.json).
 * Install: `npm i @huggingface/transformers`
 *
 * pi exposes no extension teardown hook — ONNX provider dispose is a no-op.
 */
export interface HydraInitDeps {
  readonly createOnnxEmbeddingProvider?: typeof createOnnxEmbeddingProvider;
}

export async function initHydraMatcher(
  deps?: HydraInitDeps,
): Promise<HydraMatcher | undefined> {
  const createProvider = deps?.createOnnxEmbeddingProvider ?? createOnnxEmbeddingProvider;
  const artifactCachePath = DEFAULT_OPERATOR_CONFIG.hydra.artifact_cache_path;

  try {
    const provider = await createProvider(artifactCachePath);
    return new HydraMatcher(provider, { artifactCachePath });
  } catch (error) {
    console.warn(
      '[smart-router] HyDRA matcher disabled',
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}
