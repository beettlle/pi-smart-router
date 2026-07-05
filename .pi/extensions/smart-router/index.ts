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
  type AssistantMessageEvent,
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
import { normalizeDelegationContext } from '../../../src/domain/delegation/delegation-context.js';
import { ExecutionLedger } from '../../../src/domain/delegation/execution-ledger.js';
import { SessionPinner } from '../../../src/domain/pinning/session-pinner.js';
import type {
  Message as RoutingMessage,
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
  RoutingRequest,
  RoutingTelemetry,
  TurnType,
} from '../../../src/domain/types/index.js';
import { createResilientStore } from '../../../src/infrastructure/persistence/sqlite-store.js';
import type { StorePort } from '../../../src/domain/types/store-port.js';
import { getDefaultSystemInfo } from '../../../src/infrastructure/hardware/hardware-probe.js';
import { DEFAULT_LOCAL_CONFIG } from '../../../src/infrastructure/local/local-zero-tier.js';
import { RoutingTelemetryEmitter } from '../../../src/infrastructure/telemetry/routing-telemetry.js';
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
} from '../../../src/infrastructure/telemetry/telemetry-limits.js';
import { applyCatalogPricesToFleet } from '../../../src/infrastructure/pricing/price-broker.js';
import { fetchLitellmPriceCatalog } from '../../../src/infrastructure/pricing/litellm-fetch.js';
import { checkStaleness } from '../../../src/infrastructure/pricing/pricing-monitor.js';
import {
  isInfraAssistantError,
  parseAssistantMessageError,
} from '../../../src/infrastructure/delegation/provider-error.js';
import {
  createRouterFromFleet,
  type GatewayDispatchOptions,
  type PiExtensionHooks,
  type RouterHandle,
} from '../../../src/index.js';
import {
  SMART_ROUTER_USAGE,
  getSmartRouterArgumentCompletions,
} from './commands.js';

const PROVIDER_NAME = 'smart-router' as const;
const AUTO_MODEL_ID = 'auto' as const;
const FLEET_MODE_ENTRY_TYPE = 'smart-router-fleet-mode' as const;
const DEFAULT_ROUTER_STATE_DB_PATH = '.pi-smart-router/state.db';

type FleetMode = 'scoped' | 'all';

type SmartRouterCommand =
  | { command: 'status' }
  | { command: 'history'; limit: number }
  | { command: 'mode'; mode: FleetMode }
  | { command: 'pricing'; subcommand: 'refresh' };

interface StreamDelegationDeps {
  router: RouterHandle;
  readonly modelRegistry: ModelRegistry;
  fleet: ModelProfile[];
  readonly executionLedger: ExecutionLedger;
  onRoutingDecision?: (decision: RoutingDecision) => void;
  /** Fired when a delegated provider stream completes successfully. */
  onDelegatedModel?: (model: { readonly provider: string; readonly id: string }) => void;
}

interface SmartRouterRuntime {
  fleetMode: FleetMode;
  lastDecision: RoutingDecision | undefined;
  priceCatalog: PriceCatalog | null;
  readonly modelRegistry: ModelRegistry;
  readonly store: StorePort;
  readonly sessionPinner: SessionPinner;
  readonly executionLedger: ExecutionLedger;
  streamDeps: StreamDelegationDeps;
  hydraMatcher: HydraMatcher | undefined;
  setLmuStatus?: (modelId: string) => void;
  clearLmuStatus?: () => void;
}

/** Footer label for the last model that successfully served a delegated stream. */
function formatLmuStatus(
  modelId: string,
  theme?: { fg: (name: string, text: string) => string },
): string {
  const label = `LMU: ${modelId}`;
  return theme ? theme.fg('dim', label) : label;
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

function createDispatchOptions(
  store: StorePort,
  sessionPinner: SessionPinner,
  hydraMatcher?: HydraMatcher,
): GatewayDispatchOptions {
  const telemetryEmitter = new RoutingTelemetryEmitter({
    onRecord: (record) => {
      store.appendTelemetry(record);
    },
  });

  return {
    sessionPinner,
    hardwareConfig: DEFAULT_OPERATOR_CONFIG.local,
    systemInfoProvider: getDefaultSystemInfo,
    localConfig: DEFAULT_LOCAL_CONFIG,
    ...(hydraMatcher ? { hydraMatcher } : {}),
    telemetryEmitter,
  };
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
  const router = createRouterFromFleet(
    fleet,
    createDispatchOptions(runtime.store, runtime.sessionPinner, runtime.hydraMatcher),
  );
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

function parseHistoryLimit(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_HISTORY_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function parseSmartRouterArgs(args: string): SmartRouterCommand {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens[0] === 'status') {
    return { command: 'status' };
  }

  if (tokens[0] === 'history') {
    return { command: 'history', limit: parseHistoryLimit(tokens[1]) };
  }

  if (tokens[0] === 'mode' && (tokens[1] === 'scoped' || tokens[1] === 'all')) {
    return { command: 'mode', mode: tokens[1] };
  }

  if (tokens[0] === 'pricing' && tokens[1] === 'refresh') {
    return { command: 'pricing', subcommand: 'refresh' };
  }

  throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
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

function formatHistoryMessage(entries: readonly RoutingTelemetry[]): string {
  if (entries.length === 0) {
    return 'No routing history yet.';
  }

  return entries
    .map(
      (entry) =>
        `${entry.timestamp} | ${entry.selected_model_id} | ${entry.stage} | ${entry.turn_type} | ${entry.routing_latency_ms}ms`,
    )
    .join('\n');
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

function isRoutingLogEnabled(): boolean {
  return process.env.SMART_ROUTER_LOG_ROUTING === '1';
}

function logRoutingDecision(
  decision: RoutingDecision,
  delegate?: { provider: string; modelId: string; api: Api },
): void {
  if (!isRoutingLogEnabled()) {
    return;
  }

  console.warn(
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

/** Stream options safe to forward to a delegated provider call. */
const DELEGATION_CALLER_OPTION_KEYS = [
  'signal',
  'sessionId',
  'reasoning',
  'thinkingBudgets',
  'temperature',
  'maxTokens',
  'transport',
  'cacheRetention',
  'timeoutMs',
  'maxRetries',
  'maxRetryDelayMs',
  'metadata',
  'websocketConnectTimeoutMs',
] as const satisfies readonly (keyof SimpleStreamOptions)[];

function pickDelegationCallerOptions(
  callerOptions?: SimpleStreamOptions,
): SimpleStreamOptions {
  if (!callerOptions) {
    return {};
  }

  const picked: SimpleStreamOptions = {};
  const source = callerOptions as SimpleStreamOptions & Record<string, unknown>;
  for (const key of DELEGATION_CALLER_OPTION_KEYS) {
    if (source[key] !== undefined) {
      (picked as Record<string, unknown>)[key] = source[key];
    }
  }
  return picked;
}

async function resolveDelegationOptions(
  modelRegistry: ModelRegistry,
  targetModel: Model<Api>,
  callerOptions?: SimpleStreamOptions,
): Promise<SimpleStreamOptions> {
  const auth = await modelRegistry.getApiKeyAndHeaders(targetModel);
  if (!auth.ok) {
    throw new Error(auth.error);
  }

  const callerEnv = callerOptions?.env;
  const mergedEnv =
    auth.env || callerEnv
      ? { ...(auth.env ?? {}), ...(callerEnv ?? {}) }
      : undefined;

  return {
    ...pickDelegationCallerOptions(callerOptions),
    ...(auth.apiKey !== undefined ? { apiKey: auth.apiKey } : {}),
    ...(auth.headers !== undefined ? { headers: auth.headers } : {}),
    ...(mergedEnv !== undefined ? { env: mergedEnv } : {}),
  };
}

interface DelegatedStreamResult {
  readonly finalMessage: AssistantMessage | undefined;
  readonly failed: boolean;
  readonly events: AssistantMessageEvent[];
}

function modelToExecutionModel(model: Model<Api>) {
  return {
    provider: model.provider,
    api: model.api,
    id: model.id,
  };
}

function buildDelegationContext(
  context: Context,
  targetModel: Model<Api>,
  deps: StreamDelegationDeps,
  sessionId: string | undefined,
): Context {
  const sessionExecution = sessionId
    ? deps.executionLedger.getLastExecution(sessionId)
    : null;

  return normalizeDelegationContext(context, targetModel, {
    sessionExecution,
  });
}

function flushDelegatedEvents(
  outer: AssistantMessageEventStream,
  events: readonly AssistantMessageEvent[],
): void {
  for (const event of events) {
    outer.push(event);
  }
  outer.end();
}

async function collectDelegatedStream(
  targetModel: Model<Api>,
  context: Context,
  modelRegistry: ModelRegistry,
  options: SimpleStreamOptions | undefined,
): Promise<DelegatedStreamResult> {
  if (options?.signal?.aborted) {
    throw new Error('Request was aborted');
  }

  const delegationOptions = await resolveDelegationOptions(
    modelRegistry,
    targetModel,
    options,
  );
  const inner = delegateStreamSimple(targetModel, context, delegationOptions);
  const events: AssistantMessageEvent[] = [];
  let finalMessage: AssistantMessage | undefined;

  for await (const event of inner) {
    if (options?.signal?.aborted) {
      throw new Error('Request was aborted');
    }
    events.push(event);

    if (event.type === 'done') {
      finalMessage = event.message;
    } else if (event.type === 'error') {
      finalMessage = event.error;
    }
  }

  const failed =
    finalMessage !== undefined &&
    (finalMessage.stopReason === 'error' || finalMessage.stopReason === 'aborted');

  return { finalMessage, failed, events };
}

async function delegateWithOutcome(
  targetModel: Model<Api>,
  context: Context,
  deps: StreamDelegationDeps,
  options: SimpleStreamOptions | undefined,
  sessionId: string | undefined,
): Promise<DelegatedStreamResult> {
  const delegationContext = buildDelegationContext(
    context,
    targetModel,
    deps,
    sessionId,
  );

  const result = await collectDelegatedStream(
    targetModel,
    delegationContext,
    deps.modelRegistry,
    options,
  );

  if (!result.finalMessage) {
    return result;
  }

  if (result.failed) {
    const parsed = parseAssistantMessageError(result.finalMessage);
    deps.router.dispatch.recordOutcome(targetModel.id, parsed);
  } else {
    deps.router.dispatch.recordOutcome(targetModel.id);
    if (sessionId) {
      deps.executionLedger.recordSuccess(sessionId, modelToExecutionModel(targetModel));
    }
    deps.onDelegatedModel?.({
      provider: targetModel.provider,
      id: targetModel.id,
    });
  }

  return result;
}

function injectFailoverNotice(
  events: AssistantMessageEvent[],
  failedModelId: string,
  alternateModelId: string,
  errorObj?: ReturnType<typeof parseAssistantMessageError>,
): void {
  const reason = errorObj?.message || errorObj?.code || 'Unavailable';
  const notice = `> ⚠️ **pi-smart-router failover:** \`${failedModelId}\` failed (${reason}). Retrying with \`${alternateModelId}\`...`;

  let noticeInjected = false;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (event.type === 'start') {
      const newPartial = { ...event.partial, content: [...event.partial.content] };
      if (newPartial.content.length > 0 && newPartial.content[0].type === 'text') {
        newPartial.content[0] = { ...newPartial.content[0], text: notice + '\n\n' + newPartial.content[0].text };
      } else {
        newPartial.content.unshift({ type: 'text', text: notice + '\n\n' });
      }
      events[i] = { ...event, partial: newPartial };
    }

    if (!noticeInjected && event.type === 'content' && event.delta.type === 'text') {
      events[i] = { ...event, delta: { type: 'text', text: notice + '\n\n' + event.delta.text } };
      noticeInjected = true;
    }

    if (event.type === 'done' && event.message) {
      const newMsg = { ...event.message, content: [...event.message.content] };
      if (newMsg.content.length > 0 && newMsg.content[0].type === 'text') {
        newMsg.content[0] = { ...newMsg.content[0], text: notice + '\n\n' + newMsg.content[0].text };
      } else {
        newMsg.content.unshift({ type: 'text', text: notice + '\n\n' });
      }
      events[i] = { ...event, message: newMsg };
    }
  }

  if (!noticeInjected) {
    const startIdx = events.findIndex((e) => e.type === 'start');
    if (startIdx !== -1) {
      events.splice(startIdx + 1, 0, { type: 'content', delta: { type: 'text', text: notice + '\n\n' } });
    }
  }
}

async function routeAndDelegate(
  context: Context,
  options: SimpleStreamOptions | undefined,
  deps: StreamDelegationDeps,
  outer: AssistantMessageEventStream,
): Promise<void> {
  const sessionId = options?.sessionId;
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
    const fallbackResult = await delegateWithOutcome(
      fallbackModel,
      context,
      deps,
      options,
      sessionId,
    );
    flushDelegatedEvents(outer, fallbackResult.events);
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

  const failedModelIds: string[] = [];
  let pendingFailoverInfo: {
    failedModelId: string;
    alternateModelId: string;
    errorObj?: ReturnType<typeof parseAssistantMessageError>;
  } | undefined;

  while (true) {
    try {
      const result = await delegateWithOutcome(
        targetModel,
        context,
        deps,
        options,
        sessionId,
      );

      if (pendingFailoverInfo) {
        injectFailoverNotice(
          result.events,
          pendingFailoverInfo.failedModelId,
          pendingFailoverInfo.alternateModelId,
          pendingFailoverInfo.errorObj,
        );
        pendingFailoverInfo = undefined;
      }

      if (
        result.failed &&
        result.finalMessage &&
        isInfraAssistantError(result.finalMessage)
      ) {
        failedModelIds.push(targetModel.id);
        const failover = deps.router.dispatch.selectFailover(decision, failedModelIds);
        if (!failover) {
          flushDelegatedEvents(outer, result.events);
          return;
        }

        const alternateModel = resolveTargetModel(deps, failover);
        if (!alternateModel || alternateModel.id === targetModel.id) {
          flushDelegatedEvents(outer, result.events);
          return;
        }

        console.warn(
          '[smart-router] infra error, failing over to alternate model',
          alternateModel.id,
        );
        pendingFailoverInfo = {
          failedModelId: targetModel.id,
          alternateModelId: alternateModel.id,
          errorObj: parseAssistantMessageError(result.finalMessage),
        };
        decision = failover;
        targetModel = alternateModel;
        continue;
      }

      flushDelegatedEvents(outer, result.events);
      return;
    } catch (error) {
      deps.router.dispatch.recordOutcome(targetModel.id, { code: 'STREAM_DELEGATION_ERROR' });

      if (!failedModelIds.includes(targetModel.id)) {
        failedModelIds.push(targetModel.id);
      }
      
      const failover = deps.router.dispatch.selectFailover(decision, failedModelIds);
      const alternateModel = failover ? resolveTargetModel(deps, failover) : undefined;

      if (alternateModel && alternateModel.id !== targetModel.id) {
        console.warn(
          '[smart-router] stream delegation failed, failing over',
          error instanceof Error ? error.message : String(error),
        );
        pendingFailoverInfo = {
          failedModelId: targetModel.id,
          alternateModelId: alternateModel.id,
          errorObj: { message: error instanceof Error ? error.message : String(error) },
        };
        decision = failover!;
        targetModel = alternateModel;
        continue;
      }

      const fallbackModel = resolveFallbackModel(deps);
      if (!fallbackModel || fallbackModel.id === targetModel.id) {
        throw error;
      }

      console.warn(
        '[smart-router] stream delegation failed, using safe cloud default',
        error instanceof Error ? error.message : String(error),
      );
      pendingFailoverInfo = {
        failedModelId: targetModel.id,
        alternateModelId: fallbackModel.id,
        errorObj: { message: error instanceof Error ? error.message : String(error) },
      };

      const fallbackResult = await delegateWithOutcome(
        fallbackModel,
        context,
        deps,
        options,
        sessionId,
      );
      if (pendingFailoverInfo) {
        injectFailoverNotice(
          fallbackResult.events,
          pendingFailoverInfo.failedModelId,
          pendingFailoverInfo.alternateModelId,
          pendingFailoverInfo.errorObj,
        );
      }
      flushDelegatedEvents(outer, fallbackResult.events);
      return;
    }
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
    description:
      'Show routing status/history, switch fleet mode (scoped|all), or refresh pricing',
    getArgumentCompletions: getSmartRouterArgumentCompletions,
    handler: async (args, ctx) => {
      try {
        const parsed = parseSmartRouterArgs(args);

        if (parsed.command === 'status') {
          ctx.ui.notify(formatStatusMessage(runtime, runtime.lastDecision), 'info');
          return;
        }

        if (parsed.command === 'history') {
          const rows = await runtime.store.listTelemetry({ limit: parsed.limit });
          ctx.ui.notify(formatHistoryMessage(rows), 'info');
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
  buildDelegationContext,
  createStreamSimple,
  deriveTurnType,
  discoverFleet,
  extractPromptText,
  formatLmuStatus,
  formatPricingStalenessLine,
  formatHistoryMessage,
  formatStatusMessage,
  getRouterStateDbPath,
  getSmartRouterArgumentCompletions,
  mapContextMessages,
  parseSmartRouterArgs,
  refreshPricingCatalog,
  resolveDelegationOptions,
  logRoutingDecision,
};
export { SMART_ROUTER_FULL_INVOCATIONS, SMART_ROUTER_USAGE } from './commands.js';

export default async function smartRouterExtension(pi: ExtensionAPI): Promise<void> {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const hydraMatcher = await initHydraMatcher();
  const cwd = process.cwd();
  const store = createExtensionStore(cwd);
  const sessionPinner = new SessionPinner();
  const executionLedger = new ExecutionLedger();

  const runtime: SmartRouterRuntime = {
    fleetMode: 'scoped',
    lastDecision: undefined,
    priceCatalog: null,
    modelRegistry,
    store,
    sessionPinner,
    executionLedger,
    hydraMatcher,
    streamDeps: {
      router: createRouterFromFleet(
        [],
        createDispatchOptions(store, sessionPinner, hydraMatcher),
      ),
      modelRegistry,
      fleet: [],
      executionLedger,
      onRoutingDecision(decision) {
        runtime.lastDecision = decision;
      },
      onDelegatedModel(model) {
        runtime.setLmuStatus?.(model.id);
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

    runtime.setLmuStatus = (modelId) => {
      ctx.ui.setStatus('smart-router-lmu', formatLmuStatus(modelId, ctx.ui.theme));
    };
    runtime.clearLmuStatus = () => {
      ctx.ui.setStatus('smart-router-lmu', undefined);
    };

    const sessionId = ctx.sessionManager.getSessionId();
    const lastExec = runtime.executionLedger.getLastExecution(sessionId);
    if (lastExec) {
      runtime.setLmuStatus(lastExec.id);
    } else if (runtime.lastDecision) {
      runtime.setLmuStatus(runtime.lastDecision.selected_model_id);
    }
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    runtime.setLmuStatus = undefined;
    runtime.clearLmuStatus = undefined;
    ctx.ui.setStatus('smart-router-lmu', undefined);
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
