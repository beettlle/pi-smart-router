import {
  AuthStorage,
  ModelRegistry,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';

import { ExecutionLedger } from '../../../src/domain/delegation/execution-ledger.js';
import { SessionPinner } from '../../../src/domain/pinning/session-pinner.js';
import type { SessionRoutingSnapshot } from '../../../src/infrastructure/telemetry/outcome-recorder.js';
import { createRouterFromFleet, LifecycleHookState } from '../../../src/index.js';

import { registerSmartRouterCommand } from './commands.js';
import {
  createExtensionDatasetRecorder,
  createExtensionOutcomeRecorder,
} from './dataset-export.js';
import { createDispatchOptions, initHydraMatcher } from './fleet-bootstrap.js';
import { setupSessionHooks } from './session-lifecycle.js';
import { createStreamSimple } from './stream-delegation.js';
import type { SmartRouterRuntime } from './types.js';
import { createExtensionStore } from './utils.js';

const PROVIDER_NAME = 'smart-router' as const;
const AUTO_MODEL_ID = 'auto' as const;

export type DatasetNotify = {
  fn: ((message: string) => void) | undefined;
};

export async function createSmartRouterRuntime(cwd: string): Promise<{
  runtime: SmartRouterRuntime;
  datasetNotify: DatasetNotify;
}> {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const hydraMatcher = await initHydraMatcher();
  const store = createExtensionStore(cwd);
  const sessionPinner = new SessionPinner({ store });
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
        ...createDispatchOptions(store, sessionPinner, hydraMatcher),
        lifecycleHookState,
      }),
      modelRegistry,
      fleet: [],
      executionLedger,
      lifecycleHookState,
      datasetRecorder,
      outcomeRecorder,
      sessionPinner,
      sessionRouting,
      onRoutingDecision(decision) {
        runtime.lastDecision = decision;
      },
      onDelegatedModel(model) {
        runtime.setLmuStatus?.(model.id);
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
