import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

import { SessionPinner } from '../../../src/domain/pinning/session-pinner.js';
import { formatLmuStatus, rebuildFleet } from './fleet-bootstrap.js';
import { notifyPricingStalenessIfNeeded } from './pricing-lifecycle.js';
import type { FleetMode, SmartRouterRuntime } from './types.js';

export const FLEET_MODE_ENTRY_TYPE = 'smart-router-fleet-mode' as const;

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

export function setupSessionHooks(
  pi: ExtensionAPI,
  runtime: SmartRouterRuntime,
  sessionPinner: SessionPinner,
  datasetNotify: { fn: ((message: string) => void) | undefined },
): void {
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
      ctx.ui.setStatus('smart-router-lmu', formatLmuStatus(modelId, ctx.ui.theme as { fg: (color: string, text: string) => string }));
    };
    runtime.clearLmuStatus = () => {
      ctx.ui.setStatus('smart-router-lmu', undefined);
    };
    runtime.notifyDatasetEnabled = (message) => {
      ctx.ui.notify(message, 'info');
    };
    datasetNotify.fn = runtime.notifyDatasetEnabled;

    const sessionId = ctx.sessionManager.getSessionId();
    await sessionPinner.restoreSessionPin(sessionId);

    const lastExec = runtime.executionLedger.getLastExecution(sessionId);
    if (lastExec) {
      runtime.setLmuStatus(lastExec.id);
    } else if (runtime.lastDecision) {
      runtime.setLmuStatus(runtime.lastDecision.selected_model_id);
    }
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    delete runtime.setLmuStatus;
    delete runtime.clearLmuStatus;
    delete runtime.notifyDatasetEnabled;
    datasetNotify.fn = undefined;
    ctx.ui.setStatus('smart-router-lmu', undefined);
  });
}
