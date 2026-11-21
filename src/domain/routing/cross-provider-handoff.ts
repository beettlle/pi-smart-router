/**
 * First-tool-result re-check after an observed cross-provider handoff
 * (SP-324, #179).
 *
 * A handoff is detected from consecutive session-pin snapshots resolved
 * against the fleet. The transition remains pending until the first
 * tool_result, where it is consumed exactly once. Same-provider model changes
 * and newly-created pins do not qualify.
 *
 * Detection exception: pi-ai assistant messages carry provider metadata, but
 * the normalized RoutingRequest message contract intentionally omits it. An
 * external Cursor → API handoff with no prior smart-router pin is therefore
 * indistinguishable from a fresh session in the domain pipeline. Such a
 * handoff needs a host-provided routing signal before it can be detected; this
 * tracker never guesses and disables ordinary tool_result stickiness.
 */

import type {
  ModelProfile,
  SessionPin,
  TurnType,
} from '../types/index.js';

export interface CrossProviderHandoffObservation {
  readonly sessionId: string;
  readonly turnType: TurnType;
  readonly pin: SessionPin | null;
  readonly fleet: readonly ModelProfile[];
}

export interface CrossProviderHandoffResult {
  /** True only for the first tool_result after an observed provider change. */
  readonly shouldRecheck: boolean;
  readonly previousProvider: string | null;
  readonly currentProvider: string | null;
}

interface PinProviderSnapshot {
  readonly provider: string;
  readonly handoffPending: boolean;
}

function normalizeProvider(provider: string): string | null {
  const normalized = provider.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Stateful only across route calls; all session state remains in memory and is
 * isolated by session id. RouterPipeline owns one tracker through its single
 * turn-envelope stage, whose route calls are already serialized (SP-230).
 */
export class CrossProviderHandoffTracker {
  private readonly snapshots = new Map<string, PinProviderSnapshot>();

  observe(
    observation: CrossProviderHandoffObservation,
  ): CrossProviderHandoffResult {
    const { sessionId, turnType, pin, fleet } = observation;
    const previous = this.snapshots.get(sessionId) ?? null;
    const pinnedModel = pin
      ? fleet.find(
          (model) =>
            model.id === pin.pinned_model_id && model.healthy !== false,
        )
      : undefined;
    const currentProvider = pinnedModel
      ? normalizeProvider(pinnedModel.provider)
      : null;

    if (!pin || !pinnedModel || !currentProvider) {
      this.snapshots.delete(sessionId);
      return {
        shouldRecheck: false,
        previousProvider: previous?.provider ?? null,
        currentProvider: null,
      };
    }

    // Loop escalation re-pins earlier in this same routing pass; that provider
    // change is already a deliberate full-route escalation, not foreign replay.
    const providerChanged =
      pin.pin_reason !== 'loop_escalation' &&
      previous !== null &&
      previous.provider !== currentProvider;
    const handoffPending =
      providerChanged || (previous?.handoffPending ?? false);
    const shouldRecheck = turnType === 'tool_result' && handoffPending;

    this.snapshots.set(sessionId, {
      provider: currentProvider,
      // A non-tool turn preserves a pending transition until the first tool
      // result. That first tool result consumes it even when routing later
      // fails open, preventing repeated pin breaks on every tool turn.
      handoffPending: turnType === 'tool_result' ? false : handoffPending,
    });

    return {
      shouldRecheck,
      previousProvider: previous?.provider ?? null,
      currentProvider,
    };
  }
}
