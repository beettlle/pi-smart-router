/**
 * pi-smart-router project-local extension.
 *
 * Discovers authenticated models from pi's model registry, maps them to a
 * router fleet, registers the smart-router/auto provider, and wires middleware
 * hooks for routing state. Stream delegation routes each request through the
 * pipeline and forwards to the selected provider's built-in streaming API.
 */

import {
  AuthStorage,
  ModelRegistry,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';

import { ExecutionLedger } from '../../../src/domain/delegation/execution-ledger.js';
import { SessionPinner } from '../../../src/domain/pinning/session-pinner.js';
import type { SessionRoutingSnapshot } from '../../../src/infrastructure/telemetry/outcome-recorder.js';
import { createRouterFromFleet, LifecycleHookState } from '../../../src/index.js';

import { registerSmartRouterCommand, getSmartRouterArgumentCompletions } from './commands.js';
import {
  createExtensionDatasetRecorder,
  createExtensionOutcomeRecorder,
  exportDatasetToFile,
  formatDatasetExportJsonl,
  formatDatasetExportTimestamp,
  getDatasetExportPath,
  toDatasetExportRecord,
} from './dataset-export.js';
import {
  createDispatchOptions,
  discoverFleet,
  formatLmuStatus,
  initHydraMatcher,
  rebuildFleet,
} from './fleet-bootstrap.js';
import {
  formatHistoryMessage,
  formatStatusMessage,
  parseSmartRouterArgs,
} from './command-formatters.js';
import { formatPricingStalenessLine, refreshPricingCatalog } from './pricing-lifecycle.js';
import {
  buildRoutingRequest,
  deriveTurnType,
  extractPromptText,
  mapContextMessages,
} from './routing-context.js';
import { capturePreRouteOutcomes, updateSessionRoutingSnapshot } from './routing-outcomes.js';
import { setupSessionHooks } from './session-lifecycle.js';
import {
  buildDelegationContext,
  createStreamSimple,
  getRoutingFeatureSidecar,
  logRoutingDecision,
  resolveDelegationOptions,
} from './stream-delegation.js';
import type { SmartRouterRuntime } from './types.js';
import { getRouterStateDbPath, createExtensionStore } from './utils.js';

const PROVIDER_NAME = 'smart-router' as const;
const AUTO_MODEL_ID = 'auto' as const;

export {
  buildRoutingRequest,
  buildDelegationContext,
  createDispatchOptions,
  createExtensionDatasetRecorder,
  createExtensionOutcomeRecorder,
  createStreamSimple,
  deriveTurnType,
  discoverFleet,
  exportDatasetToFile,
  extractPromptText,
  formatDatasetExportJsonl,
  formatDatasetExportTimestamp,
  formatLmuStatus,
  formatPricingStalenessLine,
  formatHistoryMessage,
  formatStatusMessage,
  getDatasetExportPath,
  getRouterStateDbPath,
  getRoutingFeatureSidecar,
  getSmartRouterArgumentCompletions,
  mapContextMessages,
  parseSmartRouterArgs,
  refreshPricingCatalog,
  resolveDelegationOptions,
  logRoutingDecision,
  toDatasetExportRecord,
  capturePreRouteOutcomes,
  updateSessionRoutingSnapshot,
  initHydraMatcher,
};
export { SMART_ROUTER_FULL_INVOCATIONS, SMART_ROUTER_USAGE } from './commands.js';

export default async function smartRouterExtension(pi: ExtensionAPI): Promise<void> {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const hydraMatcher = await initHydraMatcher();
  const cwd = process.cwd();
  const store = createExtensionStore(cwd);
  const sessionPinner = new SessionPinner({ store });
  const executionLedger = new ExecutionLedger();
  const lifecycleHookState = new LifecycleHookState();
  const datasetNotify = {
    fn: undefined as ((message: string) => void) | undefined,
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

  await rebuildFleet(runtime, pi, cwd);

  registerSmartRouterCommand(pi, runtime);

  setupSessionHooks(pi, runtime, sessionPinner, datasetNotify);

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
