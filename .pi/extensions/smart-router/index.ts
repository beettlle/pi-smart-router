/**
 * pi-smart-router project-local extension.
 *
 * Discovers authenticated models from pi's model registry, maps them to a
 * router fleet, registers the smart-router/auto provider, and wires middleware
 * hooks for routing state. Stream delegation routes each request through the
 * pipeline and forwards to the selected provider's built-in streaming API.
 */

import { join } from 'node:path';

import { randomUUID } from 'node:crypto';

import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Message,
  type Model,
  type SimpleStreamOptions,
  type TextContent,
  createAssistantMessageEventStream,
  streamSimple as delegateStreamSimple,
} from '@earendil-works/pi-ai/compat';
import {
  AuthStorage,
  ModelRegistry,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';

import { mapFleetFromRegistry } from '../../../src/config/pi-model-mapper.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../../src/config/defaults.js';
import {
  HydraMatcher,
  createOnnxEmbeddingProvider,
} from '../../../src/domain/matching/hydra-matcher.js';
import { safeCloudDefault } from '../../../src/domain/pipeline/safe-default.js';
import type {
  Message as RoutingMessage,
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
  RoutingRequest,
  TurnType,
} from '../../../src/domain/types/index.js';
import { createResilientStore } from '../../../src/infrastructure/persistence/sqlite-store.js';
import type { StorePort } from '../../../src/domain/types/store-port.js';
import { applyCatalogPricesToFleet } from '../../../src/infrastructure/pricing/price-broker.js';
import { fetchLitellmPriceCatalog } from '../../../src/infrastructure/pricing/litellm-fetch.js';
import { checkStaleness } from '../../../src/infrastructure/pricing/pricing-monitor.js';
import {
  createRouterFromFleet,
  type GatewayDispatchOptions,
  type PiExtensionHooks,
  type RouterHandle,
} from '../../../src/index.js';

const PROVIDER_NAME = 'smart-router' as const;
const AUTO_MODEL_ID = 'auto' as const;
const FLEET_MODE_ENTRY_TYPE = 'smart-router-fleet-mode' as const;
const DEFAULT_ROUTER_STATE_DB_PATH = '.pi-smart-router/state.db';

type FleetMode = 'scoped' | 'all';

type SmartRouterCommand =
  | { command: 'status' }
  | { command: 'mode'; mode: FleetMode }
  | { command: 'pricing'; subcommand: 'refresh' };

interface StreamDelegationDeps {
  router: RouterHandle;
  readonly modelRegistry: ModelRegistry;
  fleet: ModelProfile[];
  onRoutingDecision?: (decision: RoutingDecision) => void;
}

interface SmartRouterRuntime {
  fleetMode: FleetMode;
  lastDecision: RoutingDecision | undefined;
  priceCatalog: PriceCatalog | null;
  readonly modelRegistry: ModelRegistry;
  readonly store: StorePort;
  streamDeps: StreamDelegationDeps;
  hydraMatcher: HydraMatcher | undefined;
  dispatchOptions: GatewayDispatchOptions | undefined;
}

function createHooksAdapter(pi: ExtensionAPI): PiExtensionHooks {
  return {
    on(event, handler) {
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

function getRouterStateDbPath(cwd: string): string {
  const configured = process.env.ROUTER_STATE_DB_PATH?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }
  return join(cwd, DEFAULT_ROUTER_STATE_DB_PATH);
}

function createExtensionStore(cwd: string): StorePort {
  return createResilientStore({
    dbPath: getRouterStateDbPath(cwd),
    models: [],
  }).store;
}

async function discoverFleet(
  modelRegistry: ModelRegistry,
  mode: FleetMode,
  cwd: string,
  store: StorePort,
): Promise<{ fleet: ModelProfile[]; catalog: PriceCatalog | null }> {
  const available = modelRegistry.getAvailable();
  let models = available;

  if (mode === 'scoped') {
    const settings = SettingsManager.create(cwd);
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

async function rebuildFleet(
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
  const router = createRouterFromFleet(fleet, runtime.dispatchOptions);
  router.register(createHooksAdapter(pi));
  runtime.streamDeps.router = router;
  runtime.streamDeps.fleet = fleet;
}

async function refreshPricingCatalog(
  runtime: SmartRouterRuntime,
  fetchFn?: typeof fetch,
): Promise<{ modelCount: number; lastUpdated: string }> {
  const existing = await runtime.store.getPriceCatalog();
  const { catalog: fetched, model_count: modelCount } = await fetchLitellmPriceCatalog(
    fetchFn ? { fetchFn } : {},
  );

  const catalog: PriceCatalog = {
    ...fetched,
    user_overrides: existing?.user_overrides ?? {},
  };

  await runtime.store.putPriceCatalog(catalog);
  runtime.priceCatalog = catalog;

  return { modelCount, lastUpdated: catalog.last_updated };
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

function parseFleetModeEntry(data: unknown): FleetMode | undefined {
  if (
    typeof data === 'object' &&
    data !== null &&
    'mode' in data &&
    (data.mode === 'scoped' || data.mode === 'all')
  ) {
    return data.mode;
  }
  return undefined;
}

function restoreFleetModeFromSession(ctx: ExtensionContext): FleetMode | undefined {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type === 'custom' && entry.customType === FLEET_MODE_ENTRY_TYPE) {
      return parseFleetModeEntry(entry.data);
    }
  }
  return undefined;
}

function parseSmartRouterArgs(args: string): SmartRouterCommand {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens[0] === 'status') {
    return { command: 'status' };
  }

  if (tokens[0] === 'mode' && (tokens[1] === 'scoped' || tokens[1] === 'all')) {
    return { command: 'mode', mode: tokens[1] };
  }

  if (tokens[0] === 'pricing' && tokens[1] === 'refresh') {
    return { command: 'pricing', subcommand: 'refresh' };
  }

  throw new Error(
    'Usage: /smart-router [status] | mode scoped|all | pricing refresh',
  );
}

function formatPricingStalenessLine(catalog: PriceCatalog | null): string | undefined {
  const staleness = checkStaleness(
    catalog,
    DEFAULT_OPERATOR_CONFIG.pricing.staleness_days,
  );
  return staleness.warning;
}

function formatStatusMessage(
  runtime: SmartRouterRuntime,
  decision: RoutingDecision | undefined,
): string {
  const lines = [
    `Fleet mode: ${runtime.fleetMode}`,
    `Fleet size: ${runtime.streamDeps.fleet.length}`,
  ];

  const stalenessLine = formatPricingStalenessLine(runtime.priceCatalog);
  if (stalenessLine) {
    lines.push(`Pricing: ${stalenessLine}`);
  } else if (runtime.priceCatalog) {
    lines.push(`Pricing: fresh (last_updated ${runtime.priceCatalog.last_updated})`);
  }

  if (!decision) {
    lines.push('Last routing decision: (none yet)');
    return lines.join('\n');
  }

  lines.push(
    `Model: ${decision.selected_model_id}`,
    `Stage: ${decision.stage}`,
    `Reason: ${decision.reason_code}`,
    `Latency: ${decision.routing_latency_ms}ms`,
  );
  return lines.join('\n');
}

function notifyPricingStalenessIfNeeded(
  runtime: SmartRouterRuntime,
  notify: (message: string, level: 'info' | 'warning' | 'error') => void,
): void {
  const stalenessLine = formatPricingStalenessLine(runtime.priceCatalog);
  if (stalenessLine) {
    notify(stalenessLine, 'warning');
  }
}

function messageContentToString(content: string | readonly (TextContent | { type: string })[]): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function extractPromptText(messages: readonly Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === 'user') {
      const text = messageContentToString(message.content);
      if (text.trim()) {
        return text;
      }
    }
  }
  return '';
}

function deriveTurnType(messages: readonly Message[]): TurnType {
  if (messages.length === 0) {
    return 'unknown';
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return 'unknown';
  }

  if (lastMessage.role === 'toolResult') {
    return 'tool_result';
  }

  if (lastMessage.role === 'user') {
    const text = messageContentToString(lastMessage.content).toLowerCase();
    if (
      text.includes('plan') ||
      text.includes('architect') ||
      text.includes('design')
    ) {
      return 'planning';
    }
  }

  return 'main_loop';
}

function mapContextMessages(messages: readonly Message[]): RoutingMessage[] {
  return messages.map((message) => {
    if (message.role === 'user') {
      return {
        role: message.role,
        content: messageContentToString(message.content),
      };
    }

    if (message.role === 'assistant') {
      const content = message.content
        .map((block) => {
          if (block.type === 'text') {
            return block.text;
          }
          if (block.type === 'thinking') {
            return block.thinking;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');

      return { role: message.role, content };
    }

    return {
      role: 'tool',
      content: messageContentToString(message.content),
      tool_blocks: [],
    };
  });
}

function buildRoutingRequest(
  context: Context,
  options: SimpleStreamOptions | undefined,
): RoutingRequest {
  return {
    request_id: randomUUID(),
    session_id: options?.sessionId ?? randomUUID(),
    prompt_text: extractPromptText(context.messages),
    messages: mapContextMessages(context.messages),
    turn_type: deriveTurnType(context.messages),
  };
}

function findFleetProfile(
  fleet: readonly ModelProfile[],
  modelId: string,
): ModelProfile | undefined {
  return fleet.find((profile) => profile.id === modelId);
}

function resolveRegistryModel(
  modelRegistry: ModelRegistry,
  profile: ModelProfile,
): Model<Api> | undefined {
  return modelRegistry.find(profile.provider, profile.id);
}

function resolveTargetModel(
  deps: StreamDelegationDeps,
  decision: RoutingDecision,
): Model<Api> | undefined {
  const profile = findFleetProfile(deps.fleet, decision.selected_model_id);
  if (!profile) {
    return undefined;
  }
  return resolveRegistryModel(deps.modelRegistry, profile);
}

function resolveFallbackModel(deps: StreamDelegationDeps): Model<Api> | undefined {
  const fallbackProfile = safeCloudDefault(deps.fleet);
  if (!fallbackProfile) {
    return undefined;
  }
  return resolveRegistryModel(deps.modelRegistry, fallbackProfile);
}

function logRoutingDecision(
  decision: RoutingDecision,
  delegate?: { provider: string; modelId: string; api: Api },
): void {
  console.info(
    '[smart-router] routing decision',
    JSON.stringify({
      request_id: decision.request_id,
      selected_model_id: decision.selected_model_id,
      tier: decision.tier,
      stage: decision.stage,
      reason_code: decision.reason_code,
      routing_latency_ms: decision.routing_latency_ms,
      delegate,
    }),
  );
}

function createErrorMessage(
  model: Model<Api>,
  options: SimpleStreamOptions | undefined,
  error: unknown,
): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: options?.signal?.aborted ? 'aborted' : 'error',
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  };
}

async function pipeDelegatedStream(
  outer: AssistantMessageEventStream,
  targetModel: Model<Api>,
  context: Context,
  options: SimpleStreamOptions | undefined,
): Promise<void> {
  if (options?.signal?.aborted) {
    throw new Error('Request was aborted');
  }

  const inner = delegateStreamSimple(targetModel, context, options);
  for await (const event of inner) {
    if (options?.signal?.aborted) {
      throw new Error('Request was aborted');
    }
    outer.push(event);
  }
  outer.end();
}

async function routeAndDelegate(
  context: Context,
  options: SimpleStreamOptions | undefined,
  deps: StreamDelegationDeps,
  outer: AssistantMessageEventStream,
): Promise<void> {
  let decision: RoutingDecision;
  try {
    const request = buildRoutingRequest(context, options);
    decision = await deps.router.dispatch.dispatch(request);
  } catch (error) {
    const fallbackModel = resolveFallbackModel(deps);
    if (!fallbackModel) {
      throw error;
    }
    console.warn(
      '[smart-router] routing failed, using safe cloud default',
      error instanceof Error ? error.message : String(error),
    );
    await pipeDelegatedStream(outer, fallbackModel, context, options);
    return;
  }

  deps.onRoutingDecision?.(decision);

  let targetModel = resolveTargetModel(deps, decision);
  if (!targetModel) {
    console.warn(
      '[smart-router] routed model not found in registry',
      decision.selected_model_id,
    );
    targetModel = resolveFallbackModel(deps);
  }

  if (!targetModel) {
    throw new Error(
      `No registry model available for routing decision ${decision.selected_model_id}`,
    );
  }

  logRoutingDecision(decision, {
    provider: targetModel.provider,
    modelId: targetModel.id,
    api: targetModel.api,
  });

  try {
    await pipeDelegatedStream(outer, targetModel, context, options);
  } catch (error) {
    const fallbackModel = resolveFallbackModel(deps);
    if (!fallbackModel || fallbackModel.id === targetModel.id) {
      throw error;
    }
    console.warn(
      '[smart-router] stream delegation failed, using safe cloud default',
      error instanceof Error ? error.message : String(error),
    );
    await pipeDelegatedStream(outer, fallbackModel, context, options);
  }
}

function createStreamSimple(deps: StreamDelegationDeps) {
  return function streamSimple(
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream {
    const stream = createAssistantMessageEventStream();

    void (async () => {
      try {
        await routeAndDelegate(context, options, deps, stream);
      } catch (error) {
        stream.push({
          type: 'error',
          reason: options?.signal?.aborted ? 'aborted' : 'error',
          error: createErrorMessage(model, options, error),
        });
        stream.end();
      }
    })();

    return stream;
  };
}

function registerSmartRouterCommand(
  pi: ExtensionAPI,
  runtime: SmartRouterRuntime,
): void {
  pi.registerCommand('smart-router', {
    description: 'Show routing status or switch fleet mode (scoped|all)',
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: 'status', label: 'Show last routing decision' },
        { value: 'mode scoped', label: 'Route among scoped models only' },
        { value: 'mode all', label: 'Route among all authenticated models' },
        { value: 'pricing refresh', label: 'Fetch LiteLLM rates and rebuild fleet' },
      ];
      const filtered = items.filter((item) => item.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      try {
        const parsed = parseSmartRouterArgs(args);

        if (parsed.command === 'status') {
          ctx.ui.notify(formatStatusMessage(runtime, runtime.lastDecision), 'info');
          return;
        }

        if (parsed.command === 'pricing') {
          const { modelCount, lastUpdated } = await refreshPricingCatalog(runtime);
          await rebuildFleet(runtime, pi, ctx.cwd);
          ctx.ui.notify(
            `Pricing refreshed: ${modelCount} models loaded (last_updated: ${lastUpdated}). Fleet rebuilt (${runtime.streamDeps.fleet.length} models).`,
            'info',
          );
          return;
        }

        if (parsed.mode === runtime.fleetMode) {
          ctx.ui.notify(`Fleet mode already set to ${parsed.mode}`, 'info');
          return;
        }

        runtime.fleetMode = parsed.mode;
        await rebuildFleet(runtime, pi, ctx.cwd);
        pi.appendEntry(FLEET_MODE_ENTRY_TYPE, { mode: parsed.mode });
        ctx.ui.notify(
          `Fleet mode set to ${parsed.mode} (${runtime.streamDeps.fleet.length} models)`,
          'info',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, 'error');
      }
    },
  });
}

export {
  buildRoutingRequest,
  createStreamSimple,
  deriveTurnType,
  discoverFleet,
  extractPromptText,
  formatPricingStalenessLine,
  formatStatusMessage,
  getRouterStateDbPath,
  mapContextMessages,
  parseSmartRouterArgs,
  refreshPricingCatalog,
};

export default async function smartRouterExtension(pi: ExtensionAPI): Promise<void> {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const hydraMatcher = await initHydraMatcher();
  const dispatchOptions = hydraMatcher ? { hydraMatcher } : undefined;
  const cwd = process.cwd();
  const store = createExtensionStore(cwd);

  const runtime: SmartRouterRuntime = {
    fleetMode: 'scoped',
    lastDecision: undefined,
    priceCatalog: null,
    modelRegistry,
    store,
    hydraMatcher,
    dispatchOptions,
    streamDeps: {
      router: createRouterFromFleet([], dispatchOptions),
      modelRegistry,
      fleet: [],
      onRoutingDecision(decision) {
        runtime.lastDecision = decision;
      },
    },
  };

  await rebuildFleet(runtime, pi, cwd);

  registerSmartRouterCommand(pi, runtime);

  pi.on('session_start', async (_event, ctx) => {
    const restoredMode = restoreFleetModeFromSession(ctx);
    if (restoredMode && restoredMode !== runtime.fleetMode) {
      runtime.fleetMode = restoredMode;
      await rebuildFleet(runtime, pi, ctx.cwd);
    }
    notifyPricingStalenessIfNeeded(runtime, (message, level) => {
      ctx.ui.notify(message, level);
    });
  });

  pi.registerProvider(PROVIDER_NAME, {
    name: 'Smart Router',
    baseUrl: 'https://smart-router.local',
    apiKey: 'local',
    api: 'openai-responses',
    models: [
      {
        id: AUTO_MODEL_ID,
        name: 'Auto (Smart Router)',
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200_000,
        maxTokens: 16_384,
      },
    ],
    streamSimple: createStreamSimple(runtime.streamDeps),
  });
}
