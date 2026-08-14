import {
  ModelRegistry,
  ModelRuntime,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';

import { resolveOperatorConfigFromEnv } from '../../../src/config/defaults.js';
import { ExecutionLedger } from '../../../src/domain/delegation/execution-ledger.js';
import type { SessionRoutingSnapshot } from '../../../src/infrastructure/telemetry/outcome-recorder.js';
import { createRouterFromFleet, LifecycleHookState } from '../../../src/index.js';

import { registerSmartRouterCommand } from './commands.js';
import {
  createExtensionDatasetRecorder,
  createExtensionOutcomeRecorder,
} from './dataset-export.js';
import {
  createDispatchOptions,
  createOperatorAwareSessionPinner,
  initHydraMatcher,
} from './fleet-bootstrap.js';
import { setupSessionHooks } from './session-lifecycle.js';
import { createStreamSimple } from './stream-delegation.js';
import type { SmartRouterRuntime } from './types.js';
import { createExtensionStore } from './utils.js';

const PROVIDER_NAME = 'smart-router' as const;
const AUTO_MODEL_ID = 'auto' as const;

/**
 * Static provider registration fields. `api`/`baseUrl` must be present on EVERY
 * registration: pi's `ModelRuntime.registerProvider` validates the raw config
 * (via `validateExtensionProvider`/`applyExtension`) BEFORE merging with the
 * previous registration, so a models-only re-registration throws
 * "no \"api\" specified" and silently breaks the footer context-window sync.
 */
const PROVIDER_BASE_CONFIG = {
  name: 'Smart Router',
  baseUrl: 'https://smart-router.local',
  apiKey: 'local',
  api: 'openai-responses',
} as const;

/**
 * Conservative fallback limits for the registered auto entry (SP-092) when no
 * real model has been delegated yet. Once the router selects a model, the entry
 * is re-registered with that model's actual context window / max output.
 */
const AUTO_MODEL_FALLBACK_CONTEXT_WINDOW = 200_000;
const AUTO_MODEL_FALLBACK_MAX_TOKENS = 16_384;

export type ModelLimits = { contextWindow?: number; maxTokens?: number };

export function buildAutoModelEntry(limits?: ModelLimits) {
  return {
    id: AUTO_MODEL_ID,
    name: 'Auto (Smart Router)',
    reasoning: true,
    input: ['text', 'image'] as Array<'text' | 'image'>,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow:
      limits?.contextWindow !== undefined && Number.isFinite(limits.contextWindow) && limits.contextWindow > 0
        ? limits.contextWindow
        : AUTO_MODEL_FALLBACK_CONTEXT_WINDOW,
    maxTokens:
      limits?.maxTokens !== undefined && Number.isFinite(limits.maxTokens) && limits.maxTokens > 0
        ? limits.maxTokens
        : AUTO_MODEL_FALLBACK_MAX_TOKENS,
  };
}

export type DatasetNotify = {
  fn: ((message: string) => void) | undefined;
};

export async function createSmartRouterRuntime(cwd: string): Promise<{
  runtime: SmartRouterRuntime;
  datasetNotify: DatasetNotify;
}> {
  // Placeholder until session_start / commands bind ctx.modelRegistry (SP-087).
  const modelRuntime = await ModelRuntime.create();
  const modelRegistry = new ModelRegistry(modelRuntime);
  const hydraMatcher = await initHydraMatcher();
  const store = createExtensionStore(cwd);
  const operatorConfig = resolveOperatorConfigFromEnv();
  const sessionPinner = createOperatorAwareSessionPinner(store, operatorConfig);
  const executionLedger = new ExecutionLedger();
  const lifecycleHookState = new LifecycleHookState();
  const datasetNotify: DatasetNotify = {
    fn: undefined,
  };
  const datasetRecorder = createExtensionDatasetRecorder(store, cwd, (message) => {
    datasetNotify.fn?.(message);
  });
  const outcomeRecorder = createExtensionOutcomeRecorder(store);
  const sessionRouting = new Map<string, SessionRoutingSnapshot>();

  const runtime: SmartRouterRuntime = {
    fleetMode: 'scoped',
    lastDecision: undefined,
    priceCatalog: null,
    modelRegistry,
    store,
    sessionPinner,
    executionLedger,
    lifecycleHookState,
    hydraMatcher,
    datasetRecorder,
    outcomeRecorder,
    sessionRouting,
    streamDeps: {
      router: createRouterFromFleet([], {
        ...createDispatchOptions(store, sessionPinner, hydraMatcher, {
          operatorConfig,
        }),
        lifecycleHookState,
      }),
      modelRegistry,
      fleet: [],
      executionLedger,
      lifecycleHookState,
      planningDelegateConfig: operatorConfig.planning_delegate,
      datasetRecorder,
      outcomeRecorder,
      sessionPinner,
      sessionRouting,
      onRoutingDecision(decision) {
        runtime.lastDecision = decision;
      },
      onDelegatedModel(model) {
        runtime.setLmuStatus?.(model.id);
        const limits: ModelLimits = {};
        if (model.contextWindow !== undefined) {
          limits.contextWindow = model.contextWindow;
        }
        if (model.maxTokens !== undefined) {
          limits.maxTokens = model.maxTokens;
        }
        runtime.syncRegisteredLimits?.(limits);
      },
    },
  };

  return { runtime, datasetNotify };
}

export async function wireSmartRouterExtension(
  pi: ExtensionAPI,
  runtime: SmartRouterRuntime,
  datasetNotify: DatasetNotify,
): Promise<void> {
  registerSmartRouterCommand(pi, runtime);

  setupSessionHooks(pi, runtime, runtime.sessionPinner, datasetNotify);

  let registeredLimits: ModelLimits | undefined;

  // Re-register the auto model entry with the delegated model's real limits.
  // Pi's ModelRuntime merges re-registrations and refreshes the current model,
  // so the footer context percentage and the compaction threshold follow the
  // model actually selected by the router instead of a hardcoded 200k.
  runtime.syncRegisteredLimits = (limits) => {
    const current = registeredLimits;
    if (
      current !== undefined &&
      current.contextWindow === limits.contextWindow &&
      current.maxTokens === limits.maxTokens
    ) {
      return;
    }
    const nextLimits: ModelLimits = { ...limits };
    registeredLimits = nextLimits;
    try {
      pi.registerProvider(PROVIDER_NAME, {
        ...PROVIDER_BASE_CONFIG,
        models: [buildAutoModelEntry(nextLimits)],
      });
    } catch (error) {
      // A footer display issue must never fail the routed request.
      console.error('[smart-router] failed to sync auto model limits:', error);
    }
  };

  pi.registerProvider(PROVIDER_NAME, {
    ...PROVIDER_BASE_CONFIG,
    models: [buildAutoModelEntry()],
    streamSimple: createStreamSimple(runtime.streamDeps),
  });
}
