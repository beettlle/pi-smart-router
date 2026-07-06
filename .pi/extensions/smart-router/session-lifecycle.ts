import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

import { SessionPinner } from '../../../src/domain/pinning/session-pinner.js';
import {
  bindSharedModelRegistry,
  ensureFleetFresh,
  formatLmuStatus,
  rebuildFleet,
} from './fleet-bootstrap.js';
import { notifyPricingStalenessIfNeeded } from './pricing-lifecycle.js';
import type { FleetMode, SmartRouterRuntime } from './types.js';

export const FLEET_MODE_ENTRY_TYPE = 'smart-router-fleet-mode' as const;

const SMART_ROUTER_PROVIDER = 'smart-router' as const;
const SMART_ROUTER_AUTO_ID = 'auto' as const;

export function isSmartRouterActive(model: { provider: string; id: string }): boolean {
  return model.provider === SMART_ROUTER_PROVIDER && model.id === SMART_ROUTER_AUTO_ID;
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

export function restoreFleetModeFromSession(ctx: ExtensionContext): FleetMode | undefined {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type === 'custom' && entry.customType === FLEET_MODE_ENTRY_TYPE) {
      return parseFleetModeEntry(entry.data);
    }
  }
  return undefined;
}

function restoreLmuFromLedger(runtime: SmartRouterRuntime, sessionId: string): void {
  const lastExec = runtime.executionLedger.getLastExecution(sessionId);
  if (lastExec) {
    runtime.setLmuStatus?.(lastExec.id);
  } else if (runtime.lastDecision) {
    runtime.setLmuStatus?.(runtime.lastDecision.selected_model_id);
  }
}

function wireLmuStatusHandlers(
  runtime: SmartRouterRuntime,
  ctx: ExtensionContext,
  getActiveModel: () => { provider: string; id: string },
): void {
  runtime.setLmuStatus = (modelId) => {
    if (!isSmartRouterActive(getActiveModel())) {
      return;
    }
    ctx.ui.setStatus(
      'smart-router-lmu',
      formatLmuStatus(modelId, ctx.ui.theme as { fg: (color: string, text: string) => string }),
    );
  };
  runtime.clearLmuStatus = () => {
    ctx.ui.setStatus('smart-router-lmu', undefined);
  };
}

export function setupSessionHooks(
  pi: ExtensionAPI,
  runtime: SmartRouterRuntime,
  sessionPinner: SessionPinner,
  datasetNotify: { fn: ((message: string) => void) | undefined },
): void {
  let activeModel: { provider: string; id: string } | undefined;

  pi.on('session_start', async (_event, ctx) => {
    activeModel = ctx.model;
    bindSharedModelRegistry(runtime, ctx.modelRegistry);
    runtime.sessionCwd = ctx.cwd;
    runtime.streamDeps.ensureFleetFresh = async () => {
      if (runtime.sessionCwd === undefined) {
        return;
      }
      await ensureFleetFresh(runtime, pi, runtime.sessionCwd);
    };

    const restoredMode = restoreFleetModeFromSession(ctx);
    if (restoredMode) {
      runtime.fleetMode = restoredMode;
    }
    await rebuildFleet(runtime, pi, ctx.cwd);

    notifyPricingStalenessIfNeeded(runtime, (message, level) => {
      ctx.ui.notify(message, level);
    });

    wireLmuStatusHandlers(runtime, ctx, () => {
      const model = activeModel ?? ctx.model;
      return model ?? { provider: '', id: '' };
    });
    runtime.notifyDatasetEnabled = (message) => {
      ctx.ui.notify(message, 'info');
    };
    datasetNotify.fn = runtime.notifyDatasetEnabled;

    const sessionId = ctx.sessionManager.getSessionId();
    await sessionPinner.restoreSessionPin(sessionId);

    if (ctx.model !== undefined && isSmartRouterActive(ctx.model)) {
      restoreLmuFromLedger(runtime, sessionId);
    } else {
      runtime.clearLmuStatus?.();
    }
  });

  pi.on('model_select', (event, ctx) => {
    activeModel = event.model;
    if (isSmartRouterActive(event.model)) {
      restoreLmuFromLedger(runtime, ctx.sessionManager.getSessionId());
    } else {
      runtime.clearLmuStatus?.();
    }
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    activeModel = undefined;
    delete runtime.setLmuStatus;
    delete runtime.clearLmuStatus;
    delete runtime.notifyDatasetEnabled;
    delete runtime.sessionCwd;
    delete runtime.streamDeps.ensureFleetFresh;
    datasetNotify.fn = undefined;
    ctx.ui.setStatus('smart-router-lmu', undefined);
  });
}
