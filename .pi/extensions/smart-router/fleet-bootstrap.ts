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
import { resolveModelScope } from './pi-model-scope.js';
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

/** Bind pi's shared model registry (includes package-registered providers). */
export function bindSharedModelRegistry(
  runtime: SmartRouterRuntime,
  modelRegistry: ModelRegistry,
): void {
  runtime.modelRegistry = modelRegistry;
  runtime.streamDeps.modelRegistry = modelRegistry;
}

export function computeFleetScopeFingerprint(
  mode: FleetMode,
  patterns: readonly string[] | null | undefined,
  available: readonly Model<Api>[],
  catalogLastUpdated: string | null | undefined,
): string {
  const patternPart = patterns?.join('\n') ?? '';
  const modelPart = available
    .map((model) => `${model.provider}/${model.id}`)
    .sort()
    .join('\n');
  return `${mode}\0${patternPart}\0${modelPart}\0${catalogLastUpdated ?? ''}`;
}

async function readScopeFingerprintInputs(
  runtime: SmartRouterRuntime,
  cwd: string,
  deps?: DiscoverFleetDeps,
): Promise<{ patterns: string[] | null | undefined; available: Model<Api>[] }> {
  const available = await Promise.resolve(runtime.modelRegistry.getAvailable());
  if (runtime.fleetMode !== 'scoped') {
    return { patterns: null, available };
  }

  const settingsFactory = deps?.settingsFactory ?? SettingsManager.create;
  const settings = settingsFactory(cwd);
  return { patterns: settings.getEnabledModels(), available };
}

export async function computeCurrentFleetScopeFingerprint(
  runtime: SmartRouterRuntime,
  cwd: string,
  deps?: DiscoverFleetDeps,
): Promise<string> {
  const { patterns, available } = await readScopeFingerprintInputs(runtime, cwd, deps);
  const catalogLastUpdated = runtime.priceCatalog?.last_updated;
  return computeFleetScopeFingerprint(
    runtime.fleetMode,
    patterns,
    available,
    catalogLastUpdated,
  );
}

export async function discoverFleet(
  modelRegistry: ModelRegistry,
  mode: FleetMode,
  cwd: string,
  store: StorePort,
  deps?: DiscoverFleetDeps,
): Promise<{ fleet: ModelProfile[]; catalog: PriceCatalog | null }> {
  const available = await Promise.resolve(modelRegistry.getAvailable());
  let models = available;

  if (mode === 'scoped') {
    const settingsFactory = deps?.settingsFactory ?? SettingsManager.create;
    const settings = settingsFactory(cwd);
    const patterns = settings.getEnabledModels();
    if (patterns && patterns.length > 0) {
      const scopedModels = await resolveModelScope(patterns, modelRegistry);
      models = scopedModels.map((scoped) => scoped.model);
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
  deps?: DiscoverFleetDeps,
): Promise<void> {
  const fingerprint = await computeCurrentFleetScopeFingerprint(runtime, cwd, deps);
  const { fleet, catalog } = await discoverFleet(
    runtime.modelRegistry,
    runtime.fleetMode,
    cwd,
    runtime.store,
    deps,
  );
  runtime.priceCatalog = catalog;
  runtime.fleetScopeFingerprint = fingerprint;
  const router = createRouterFromFleet(fleet, {
    ...createDispatchOptions(runtime.store, runtime.sessionPinner, runtime.hydraMatcher),
    lifecycleHookState: runtime.lifecycleHookState,
  });
  router.register(createHooksAdapter(pi));
  runtime.streamDeps.router = router;
  runtime.streamDeps.fleet = fleet;
}

/**
 * Rebuild fleet only when scope fingerprint changed (mode, enabledModels, registry, pricing).
 */
export async function ensureFleetFresh(
  runtime: SmartRouterRuntime,
  pi: ExtensionAPI,
  cwd: string,
  deps?: DiscoverFleetDeps,
): Promise<void> {
  const fingerprint = await computeCurrentFleetScopeFingerprint(runtime, cwd, deps);
  if (fingerprint === runtime.fleetScopeFingerprint) {
    return;
  }
  await rebuildFleet(runtime, pi, cwd, deps);
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
