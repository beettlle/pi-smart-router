import type { Api, Model } from '@earendil-works/pi-ai/compat';
import {
  ModelRegistry,
  SettingsManager,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';

import { mapFleetFromRegistry } from '../../../src/config/pi-model-mapper.js';
import {
  DEFAULT_OPERATOR_CONFIG,
  resolveOperatorConfigFromEnv,
} from '../../../src/config/defaults.js';
import {
  HydraMatcher,
  createOnnxEmbeddingProvider,
} from '../../../src/domain/matching/hydra-matcher.js';
import { SessionPinner } from '../../../src/domain/pinning/session-pinner.js';
import {
  collectPoolModelIds,
  resolveQuotaWindowEstimateConfigFromEnv,
  resolveQuotaWindowPosition,
  type QuotaWindowAdapter,
  type QuotaWindowEstimateConfig,
} from '../../../src/domain/pricing/quota-window-feed.js';
import type { ModelProfile, PriceCatalog } from '../../../src/domain/types/index.js';
import type { QuotaWindowPosition } from '../../../src/domain/types/entities.js';
import type { OperatorConfig } from '../../../src/domain/types/schemas.js';
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

/** Optional overrides for extension dispatch wiring (SP-173). */
export interface CreateDispatchOptionsExtras {
  /** Base operator config before env merge; defaults to DEFAULT_OPERATOR_CONFIG. */
  readonly operatorConfig?: OperatorConfig;
  /** Live price catalog when fleet discovery has loaded one. */
  readonly priceCatalog?: PriceCatalog | null;
  /** Rolling subscription quota position when available (see resolveQuotaWindowFeedPosition, SP-214). */
  readonly quotaWindowPosition?: QuotaWindowPosition;
}

/** Max telemetry rows scanned for the quota-window burn estimate (SP-214). */
const QUOTA_FEED_TELEMETRY_LIMIT = 5000;

export interface ResolveQuotaWindowFeedDeps {
  /** Optional provider adapter (degrade chain step 1). */
  readonly adapter?: QuotaWindowAdapter;
  /** Estimate config override; defaults to env-resolved config. */
  readonly estimateConfig?: QuotaWindowEstimateConfig;
  readonly now?: Date;
}

/**
 * Resolve the pool-level `QuotaWindowPosition` for the fleet via the SP-214
 * degrade chain: adapter → telemetry burn estimate → omit. Returns `undefined`
 * when the fleet has no subscription pool and no adapter, or when the feed is
 * disabled — callers then fall back to flat virtual cost + SP-097 failover.
 */
export async function resolveQuotaWindowFeedPosition(
  store: StorePort,
  fleet: readonly ModelProfile[],
  deps?: ResolveQuotaWindowFeedDeps,
): Promise<QuotaWindowPosition | undefined> {
  const poolModelIds = collectPoolModelIds(fleet);
  if (poolModelIds.size === 0 && !deps?.adapter) {
    return undefined;
  }
  const estimateConfig =
    deps?.estimateConfig ?? resolveQuotaWindowEstimateConfigFromEnv();
  const entries =
    poolModelIds.size > 0
      ? await store.listTelemetry({ limit: QUOTA_FEED_TELEMETRY_LIMIT })
      : [];
  return resolveQuotaWindowPosition({
    adapter: deps?.adapter,
    entries,
    poolModelIds,
    estimateConfig,
    ...(deps?.now !== undefined ? { now: deps.now } : {}),
  });
}

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

  // The virtual router model dispatches through this fleet; including it would recurse.
  models = models.filter(
    (model) => !(model.provider === 'smart-router' && model.id === 'auto'),
  );

  const mappedFleet = mapFleetFromRegistry(registryModelsToFleetInput(models));
  const catalog = await store.getPriceCatalog();
  const fleet = applyCatalogPricesToFleet(mappedFleet, catalog);

  return { fleet, catalog };
}

export function createDispatchOptions(
  store: StorePort,
  sessionPinner: SessionPinner,
  hydraMatcher?: HydraMatcher,
  extras?: CreateDispatchOptionsExtras,
): GatewayDispatchOptions {
  const operatorConfig = resolveOperatorConfigFromEnv(
    extras?.operatorConfig ?? DEFAULT_OPERATOR_CONFIG,
  );
  const telemetryEmitter = new RoutingTelemetryEmitter({
    onRecord: (record) => {
      store.appendTelemetry(record);
    },
    sessionPinner,
    saarConfig: operatorConfig.saar,
    ...(extras?.priceCatalog !== undefined ? { priceCatalog: extras.priceCatalog } : {}),
    ...(extras?.quotaWindowPosition !== undefined
      ? { quotaWindowPosition: extras.quotaWindowPosition }
      : {}),
  });
  const rateLimiter = resolveRateLimiter(store);

  return {
    sessionPinner,
    hardwareConfig: operatorConfig.local,
    systemInfoProvider: getDefaultSystemInfo,
    localConfig: DEFAULT_LOCAL_CONFIG,
    loopEscalationConfig: operatorConfig.loop_escalation,
    saarConfig: operatorConfig.saar,
    planningDelegateConfig: operatorConfig.planning_delegate,
    pinOnlyFallback: operatorConfig.pin_only_fallback,
    ...(extras?.priceCatalog !== undefined ? { priceCatalog: extras.priceCatalog } : {}),
    ...(extras?.quotaWindowPosition !== undefined
      ? { quotaWindowPosition: extras.quotaWindowPosition }
      : {}),
    ...(hydraMatcher ? { hydraMatcher } : {}),
    ...(rateLimiter ? { rateLimiter } : {}),
    telemetryEmitter,
  };
}

/**
 * Build a SessionPinner wired with operator SAAR / pin-only settings (SP-173).
 * No operator-config.json loader exists yet — env + optional base config only.
 */
export function createOperatorAwareSessionPinner(
  store: StorePort,
  operatorConfig: OperatorConfig = resolveOperatorConfigFromEnv(),
): SessionPinner {
  return new SessionPinner({
    store,
    saarConfig: operatorConfig.saar,
    pinOnlyFallback: operatorConfig.pin_only_fallback,
  });
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
  const quotaWindowPosition = await resolveQuotaWindowFeedPosition(runtime.store, fleet);
  const router = createRouterFromFleet(fleet, {
    ...createDispatchOptions(runtime.store, runtime.sessionPinner, runtime.hydraMatcher, {
      priceCatalog: catalog,
      ...(quotaWindowPosition !== undefined ? { quotaWindowPosition } : {}),
    }),
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
