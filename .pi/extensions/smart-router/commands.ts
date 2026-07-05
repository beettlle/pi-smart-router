import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import {
  formatHistoryMessage,
  formatStatusMessage,
  parseSmartRouterArgs,
} from './command-formatters.js';
import { exportDatasetToFile } from './dataset-export.js';
import { rebuildFleet } from './fleet-bootstrap.js';
import { refreshPricingCatalog } from './pricing-lifecycle.js';
import { FLEET_MODE_ENTRY_TYPE } from './session-lifecycle.js';
import type { SmartRouterRuntime } from './types.js';

export const SMART_ROUTER_USAGE =
  '/smart-router [status] | history [limit] | mode scoped|all | pricing refresh | export dataset [--limit N] | feedback good|bad';

type CompletionItem = { value: string; label: string };

const TOP_LEVEL: CompletionItem[] = [
  { value: 'status', label: 'Show last routing decision' },
  { value: 'history', label: 'Show recent routing history' },
  { value: 'mode', label: 'Switch fleet mode (scoped or all)' },
  { value: 'pricing', label: 'Manage pricing catalog' },
  { value: 'export', label: 'Export opt-in routing dataset' },
  { value: 'feedback', label: 'Label last routing outcome good or bad' },
];

const MODE_COMPLETIONS: CompletionItem[] = [
  { value: 'mode scoped', label: 'Route among scoped models only' },
  { value: 'mode all', label: 'Route among all authenticated models' },
];

const PRICING_COMPLETIONS: CompletionItem[] = [
  { value: 'pricing refresh', label: 'Fetch LiteLLM rates and rebuild fleet' },
];

const EXPORT_COMPLETIONS: CompletionItem[] = [
  { value: 'export dataset', label: 'Export privacy-safe dataset JSONL' },
];

const FEEDBACK_COMPLETIONS: CompletionItem[] = [
  { value: 'feedback good', label: 'Mark last routing outcome as good' },
  { value: 'feedback bad', label: 'Mark last routing outcome as bad' },
];

/** Full invocations used to keep completions and parseSmartRouterArgs in sync. */
export const SMART_ROUTER_FULL_INVOCATIONS = [
  '',
  'status',
  'history',
  'history 10',
  'mode scoped',
  'mode all',
  'pricing refresh',
  'export dataset',
  'export dataset --limit 100',
  'feedback good',
  'feedback bad',
] as const;

function filterByPrefix(items: CompletionItem[], prefix: string): CompletionItem[] {
  return items.filter((item) => item.value.startsWith(prefix));
}

export function getSmartRouterArgumentCompletions(prefix: string): CompletionItem[] | null {
  const trimmed = prefix.trimStart();
  const tokens = trimmed.split(/\s+/).filter(Boolean);

  if (tokens[0] === 'mode') {
    const subPrefix = tokens.slice(1).join(' ');
    const filtered = filterByPrefix(MODE_COMPLETIONS, `mode${subPrefix ? ` ${subPrefix}` : ''}`);
    return filtered.length > 0 ? filtered : null;
  }

  if (tokens[0] === 'pricing') {
    const subPrefix = tokens.slice(1).join(' ');
    const filtered = filterByPrefix(PRICING_COMPLETIONS, `pricing${subPrefix ? ` ${subPrefix}` : ''}`);
    return filtered.length > 0 ? filtered : null;
  }

  if (tokens[0] === 'export') {
    const subPrefix = tokens.slice(1).join(' ');
    const filtered = filterByPrefix(EXPORT_COMPLETIONS, `export${subPrefix ? ` ${subPrefix}` : ''}`);
    return filtered.length > 0 ? filtered : null;
  }

  if (tokens[0] === 'feedback') {
    const subPrefix = tokens.slice(1).join(' ');
    const filtered = filterByPrefix(FEEDBACK_COMPLETIONS, `feedback${subPrefix ? ` ${subPrefix}` : ''}`);
    return filtered.length > 0 ? filtered : null;
  }

  if (tokens[0] === 'history') {
    return [{ value: 'history', label: 'Show recent routing history' }];
  }

  const firstToken = tokens[0] ?? '';
  const filtered = filterByPrefix(TOP_LEVEL, firstToken);
  return filtered.length > 0 ? filtered : null;
}

export function registerSmartRouterCommand(
  pi: ExtensionAPI,
  runtime: SmartRouterRuntime,
): void {
  pi.registerCommand('smart-router', {
    description:
      'Show routing status/history, switch fleet mode (scoped|all), refresh pricing, or export dataset',
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

        if (parsed.command === 'export') {
          const result = await exportDatasetToFile(runtime.store, ctx.cwd, parsed.limit);
          if (!result) {
            ctx.ui.notify('No routing dataset records to export.', 'info');
            return;
          }
          ctx.ui.notify(
            `Exported ${result.recordCount} dataset record(s) to ${result.path}`,
            'info',
          );
          return;
        }

        if (parsed.command === 'feedback') {
          const sessionId = ctx.sessionManager.getSessionId();
          const snapshot = runtime.sessionRouting.get(sessionId);
          if (!snapshot) {
            ctx.ui.notify('No recent auto-routed request to label.', 'info');
            return;
          }

          const record = runtime.outcomeRecorder?.recordFeedback(
            snapshot,
            sessionId,
            parsed.rating,
          );
          if (!record) {
            ctx.ui.notify('Outcome labels require SMART_ROUTER_DATASET=1.', 'info');
            return;
          }

          ctx.ui.notify(
            `Recorded ${parsed.rating} feedback for request ${snapshot.lastRequestId}.`,
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
