import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

import { evictInMemorySessionState } from '../../../src/api/session-eviction.js';
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

/**
 * Orphan-session TTL fallback (SP-248, #145). `session_shutdown` is the primary
 * teardown signal; if pi ever shuts a session down without delivering it
 * (extension reload races, missed events), the session's in-memory routing
 * state is evicted once it has been idle for ORPHAN_SESSION_TTL_MS. The sweep
 * runs on `session_start` and fails open — eviction must never break startup.
 */
export const ORPHAN_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

/**
 * Restore the registered auto entry's limits from the last delegated model so
 * the footer/compaction are correct immediately on session resume (instead of
 * showing the 200k fallback until the first routed turn completes).
 */
function restoreLimitsFromLedger(runtime: SmartRouterRuntime, sessionId: string): void {
  const lastExec = runtime.executionLedger.getLastExecution(sessionId);
  if (!lastExec) {
    return;
  }
  const model = runtime.modelRegistry.find(lastExec.provider, lastExec.id);
  if (model) {
    runtime.syncRegisteredLimits?.({
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    });
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

  // Last-seen stamp per session for the orphan-TTL fallback (SP-248).
  const lastSeenBySession = new Map<string, number>();

  /** Evict all in-memory routing state for one session via the SP-247 helper. */
  function evictSessionState(sessionId: string | undefined): void {
    // Fail open: a missing/empty session id must never break teardown.
    if (sessionId === undefined || sessionId === '') {
      return;
    }
    evictInMemorySessionState(sessionId, {
      executionLedger: runtime.executionLedger,
      lifecycleHookState: runtime.lifecycleHookState,
      sessionRouting: runtime.sessionRouting,
    });
    lastSeenBySession.delete(sessionId);
  }

  /** Drop sessions idle longer than ORPHAN_SESSION_TTL_MS (never throws). */
  function sweepOrphanedSessions(now: number): void {
    try {
      for (const [sessionId, lastSeen] of lastSeenBySession) {
        if (now - lastSeen > ORPHAN_SESSION_TTL_MS) {
          evictSessionState(sessionId);
        }
      }
    } catch (error) {
      console.warn(
        '[smart-router] orphan session sweep failed (fail open)',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

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
    const now = Date.now();
    lastSeenBySession.set(sessionId, now);
    sweepOrphanedSessions(now);

    await sessionPinner.restoreSessionPin(sessionId);

    if (ctx.model !== undefined && isSmartRouterActive(ctx.model)) {
      restoreLmuFromLedger(runtime, sessionId);
      restoreLimitsFromLedger(runtime, sessionId);
    } else {
      runtime.clearLmuStatus?.();
    }
  });

  pi.on('model_select', (event, ctx) => {
    activeModel = event.model;
    if (isSmartRouterActive(event.model)) {
      restoreLmuFromLedger(runtime, ctx.sessionManager.getSessionId());
      restoreLimitsFromLedger(runtime, ctx.sessionManager.getSessionId());
    } else {
      runtime.clearLmuStatus?.();
    }
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    activeModel = undefined;
    delete runtime.setLmuStatus;
    delete runtime.clearLmuStatus;
    delete runtime.syncRegisteredLimits;
    delete runtime.notifyDatasetEnabled;
    delete runtime.sessionCwd;
    delete runtime.streamDeps.ensureFleetFresh;
    datasetNotify.fn = undefined;
    ctx.ui.setStatus('smart-router-lmu', undefined);

    // SP-248 (#145): drop per-session routing state so long-running pi
    // processes do not retain ledger/lifecycle/routing maps forever.
    // Fail open — teardown cleanup must never crash the host agent.
    try {
      evictSessionState(ctx.sessionManager.getSessionId());
    } catch (error) {
      console.warn(
        '[smart-router] session teardown eviction failed (fail open)',
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}
