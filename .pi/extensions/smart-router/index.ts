/**
 * pi-smart-router project-local extension.
 *
 * Discovers authenticated models from pi's model registry, maps them to a
 * router fleet, registers the smart-router/auto provider, and wires middleware
 * hooks for routing state. Stream delegation routes each request through the
 * pipeline and forwards to the selected provider's built-in streaming API.
 *
 * Imports from ../../../src/** (not dist/) because the extension is loaded by pi
 * from source at dev time and is excluded from the npm dist artifact.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { getSmartRouterArgumentCompletions } from './commands.js';
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
  bindSharedModelRegistry,
  computeCurrentFleetScopeFingerprint,
  computeFleetScopeFingerprint,
  ensureFleetFresh,
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
import {
  buildDelegationContext,
  createStreamSimple,
  getRoutingFeatureSidecar,
  logRoutingDecision,
  resolveDelegationOptions,
} from './stream-delegation.js';
import { createSmartRouterRuntime, wireSmartRouterExtension } from './extension-setup.js';
import { getRouterStateDbPath } from './utils.js';

export {
  buildRoutingRequest,
  buildDelegationContext,
  createDispatchOptions,
  createExtensionDatasetRecorder,
  createExtensionOutcomeRecorder,
  createSmartRouterRuntime,
  createStreamSimple,
  deriveTurnType,
  discoverFleet,
  bindSharedModelRegistry,
  computeCurrentFleetScopeFingerprint,
  computeFleetScopeFingerprint,
  ensureFleetFresh,
  rebuildFleet,
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
  wireSmartRouterExtension,
};
export {
  buildCompressedDelegateContext,
  defaultSpawnPlanningDelegate,
  extractAssistantText,
  injectPlanningDelegateObservation,
  isPlanningDelegateActive,
  PLANNING_DELEGATE_OBSERVATION_PREFIX,
  resolvePlanningDelegatePath,
} from './planning-delegate.js';
export { SMART_ROUTER_FULL_INVOCATIONS, SMART_ROUTER_USAGE } from './commands.js';
export { routeAndDelegate } from './route-and-delegate.js';
export {
  formatGeminiThoughtSignatureErrorMessage,
  isGeminiThoughtSignatureAssistantError,
} from '../../../src/infrastructure/delegation/provider-error.js';
export {
  GEMINI_TOOL_HISTORY_EXCLUDED,
  hasToolCallHistory,
  hasToolCallHistoryFromContext,
  isGoogleGeminiProfile,
  resolveEffectiveFleet,
} from '../../../src/domain/routing/tool-history-guard.js';

export default async function smartRouterExtension(pi: ExtensionAPI): Promise<void> {
  const cwd = process.cwd();
  const { runtime, datasetNotify } = await createSmartRouterRuntime(cwd);
  await wireSmartRouterExtension(pi, runtime, datasetNotify);
}
