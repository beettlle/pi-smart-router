import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  streamSimple as compatDelegateStream,
} from '@earendil-works/pi-ai/compat';

import { parseAssistantMessageError } from '../../../src/infrastructure/delegation/provider-error.js';
import { extractUsageActuals } from '../../../src/infrastructure/telemetry/routing-telemetry.js';
import {
  resolveAdaptiveReasoning,
  type AdaptiveReasoningResult,
  type AdaptiveReasoningSignal,
} from '../../../src/domain/delegation/adaptive-reasoning.js';
import {
  buildDelegationContext,
  forwardDelegatedEvent,
  modelToExecutionModel,
  pushFailoverNotice,
  resolveDelegationOptions,
  type DelegatedStreamResult,
  type DelegationHeadroomContext,
  type FailoverNoticeInfo,
  type FlushDelegatedEventsOptions,
} from './delegation-runtime.js';
import type { DelegateStreamFn, StreamDelegationDeps } from './types.js';
import { throwIfAborted } from './utils.js';

/**
 * Minimal structural view of pi's composed provider (pi-coding-agent
 * `ModelRegistry.getProvider()` → `composeModelProvider`). Typed structurally
 * because `getProvider` only exists on newer pi-coding-agent versions (0.84+);
 * the extension must keep loading against older ones.
 */
interface ComposedProviderLike {
  streamSimple: DelegateStreamFn;
}

type RegistryWithProviders = StreamDelegationDeps['modelRegistry'] & {
  getProvider?: (providerId: string) => ComposedProviderLike | undefined;
};

/**
 * Resolve the stream entrypoint for a delegation target (SP-238, #160).
 *
 * Priority:
 * 1. Explicit `deps.delegateStream` injection (tests / operator override).
 * 2. The **composed provider** from `modelRegistry.getProvider(model.provider)` —
 *    the same path pi's own agent loop delegates through. Its `streamSimple`
 *    checks extension-registered providers (`extension.streamSimple` when
 *    `model.api === extension.api`) before falling back to pi-ai's built-in
 *    registry, so custom-API models (claude-bridge et al.) resolve correctly.
 * 3. Bare `pi-ai/compat streamSimple` — dispatches only on `model.api` against
 *    pi-ai's private built-in registry; used when no composed provider exists
 *    (older pi-coding-agent, or providers never composed through ModelRuntime).
 */
function resolveDelegateStream(
  targetModel: Model<Api>,
  deps: StreamDelegationDeps,
): DelegateStreamFn {
  if (deps.delegateStream) {
    return deps.delegateStream;
  }
  const registry = deps.modelRegistry as RegistryWithProviders;
  const provider =
    typeof registry.getProvider === 'function'
      ? registry.getProvider(targetModel.provider)
      : undefined;
  if (provider && typeof provider.streamSimple === 'function') {
    return (model, context, options) => provider.streamSimple(model, context, options);
  }
  return compatDelegateStream;
}

function isTerminalEvent(
  event: AssistantMessageEvent,
): event is Extract<AssistantMessageEvent, { type: 'done' | 'error' }> {
  return event.type === 'done' || event.type === 'error';
}

/**
 * Buffer the full inner stream (no outer push).
 *
 * Used by the planning-delegate ephemeral sub-call: only the final observation
 * text is injected into primary context — intermediate tokens must not reach the
 * user-facing outer stream (SP-170: planning stays buffered by design).
 */
export async function collectDelegatedStream(
  targetModel: Model<Api>,
  context: Context,
  deps: StreamDelegationDeps,
  options: SimpleStreamOptions | undefined,
  headroomContext?: DelegationHeadroomContext,
  reasoning?: AdaptiveReasoningResult,
): Promise<DelegatedStreamResult> {
  throwIfAborted(options);

  const delegationOptions = await resolveDelegationOptions(
    deps.modelRegistry,
    targetModel,
    options,
    headroomContext,
    reasoning,
  );
  const delegateStream = resolveDelegateStream(targetModel, deps);
  const inner = delegateStream(targetModel, context, delegationOptions);
  const events: AssistantMessageEvent[] = [];
  let finalMessage: AssistantMessage | undefined;

  for await (const event of inner) {
    throwIfAborted(options);
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

export interface PipeDelegatedStreamOptions extends FlushDelegatedEventsOptions {
  readonly outer: AssistantMessageEventStream;
  /**
   * When set, push a synthetic failover `text_delta` immediately after the first
   * live `start` event (before further retry tokens).
   */
  readonly failoverNotice?: FailoverNoticeInfo;
  /**
   * When true (default), forward non-terminal events live and hold `done`/`error`
   * until {@link commitPipedTerminal}. Set false to buffer only (no outer push).
   */
  readonly live?: boolean;
}

export interface PipedDelegatedStreamResult extends DelegatedStreamResult {
  /** Terminal event held back so callers can decide failover before commit. */
  readonly heldTerminal: AssistantMessageEvent | undefined;
  readonly flushOptions: FlushDelegatedEventsOptions;
  readonly outer: AssistantMessageEventStream | undefined;
}

/**
 * Live-pipe provider events to `outer` as they arrive (SP-170).
 *
 * Non-terminal events (`start`, `text_delta`, …) are forwarded immediately so the
 * UI is not frozen. Terminal `done`/`error` are held until the caller commits or
 * discards them (failover discards without ending the outer stream).
 */
export async function pipeDelegatedStream(
  targetModel: Model<Api>,
  context: Context,
  deps: StreamDelegationDeps,
  options: SimpleStreamOptions | undefined,
  headroomContext: DelegationHeadroomContext | undefined,
  pipe: PipeDelegatedStreamOptions,
  reasoning?: AdaptiveReasoningResult,
): Promise<PipedDelegatedStreamResult> {
  throwIfAborted(options);

  const delegationOptions = await resolveDelegationOptions(
    deps.modelRegistry,
    targetModel,
    options,
    headroomContext,
    reasoning,
  );
  const delegateStream = resolveDelegateStream(targetModel, deps);
  const inner = delegateStream(targetModel, context, delegationOptions);
  const events: AssistantMessageEvent[] = [];
  let finalMessage: AssistantMessage | undefined;
  let heldTerminal: AssistantMessageEvent | undefined;
  let noticePushed = false;
  const live = pipe.live !== false;
  const flushOptions: FlushDelegatedEventsOptions = {
    ...(pipe.sanitizeErrors !== undefined
      ? { sanitizeErrors: pipe.sanitizeErrors }
      : {}),
    ...(pipe.contextWindow !== undefined
      ? { contextWindow: pipe.contextWindow }
      : {}),
  };

  for await (const event of inner) {
    throwIfAborted(options);
    events.push(event);

    if (event.type === 'done') {
      finalMessage = event.message;
      heldTerminal = event;
      continue;
    }
    if (event.type === 'error') {
      finalMessage = event.error;
      heldTerminal = event;
      continue;
    }

    if (!live) {
      continue;
    }

    forwardDelegatedEvent(pipe.outer, event, flushOptions);

    if (
      !noticePushed &&
      pipe.failoverNotice &&
      event.type === 'start'
    ) {
      pushFailoverNotice(pipe.outer, pipe.failoverNotice, event.partial);
      noticePushed = true;
    }
  }

  // Error-only streams never emit `start` — still surface the notice before commit
  // when the caller is about to show a successful retry that also lacked start
  // (handled by commit path via leftover failoverNotice on next pipe call).

  const failed =
    finalMessage !== undefined &&
    (finalMessage.stopReason === 'error' || finalMessage.stopReason === 'aborted');

  return {
    finalMessage,
    failed,
    events,
    heldTerminal,
    flushOptions,
    outer: pipe.outer,
  };
}

/** Forward a held terminal event and end the outer stream. */
export function commitPipedTerminal(
  result: PipedDelegatedStreamResult,
  overrides?: FlushDelegatedEventsOptions,
): void {
  const outer = result.outer;
  if (!outer) {
    return;
  }
  const opts = { ...result.flushOptions, ...overrides };
  if (result.heldTerminal) {
    forwardDelegatedEvent(outer, result.heldTerminal, opts);
  }
  const endMessage =
    result.heldTerminal && isTerminalEvent(result.heldTerminal)
      ? result.heldTerminal.type === 'done'
        ? result.heldTerminal.message
        : result.heldTerminal.error
      : result.finalMessage;
  outer.end(endMessage);
}

function recordDelegateOutcome(
  targetModel: Model<Api>,
  deps: StreamDelegationDeps,
  sessionId: string | undefined,
  result: DelegatedStreamResult,
  requestId?: string,
): void {
  if (!result.finalMessage) {
    return;
  }

  // SP-241 / #164: capture post-turn usage actuals (success and
  // failed-with-usage terminals). Fail open — extraction/hook errors and
  // missing usage must never fail the route.
  if (requestId !== undefined) {
    try {
      const actuals = extractUsageActuals(result.finalMessage.usage);
      if (actuals) {
        deps.onDelegationUsage?.(requestId, actuals);
      }
    } catch (error) {
      console.warn(
        '[smart-router] usage actuals capture failed (fail open)',
        error instanceof Error ? error.message : String(error),
      );
    }
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
      contextWindow: targetModel.contextWindow,
      maxTokens: targetModel.maxTokens,
    });
  }
}

/**
 * Delegate with outcome recording. When `pipe` is provided, live-forwards to outer
 * (holding the terminal event). Otherwise collects into a buffer (planning / probes).
 *
 * SP-245 (#166): when `reasoningSignal` is provided, the adaptive reasoning
 * policy resolves the effective thinking level from turn signals and merges it
 * into the delegated stream options (never lowering an explicit operator
 * /thinking; fail open on non-reasoning models).
 */
export async function delegateWithOutcome(
  targetModel: Model<Api>,
  context: Context,
  deps: StreamDelegationDeps,
  options: SimpleStreamOptions | undefined,
  sessionId: string | undefined,
  headroomContext?: DelegationHeadroomContext,
  pipe?: PipeDelegatedStreamOptions,
  /** Routing request id for post-turn usage actuals capture (SP-241, #164). */
  requestId?: string,
  /** Turn/routing signals for adaptive reasoning (SP-245, #166). */
  reasoningSignal?: AdaptiveReasoningSignal,
): Promise<PipedDelegatedStreamResult | DelegatedStreamResult> {
  const reasoning = reasoningSignal
    ? resolveAdaptiveReasoning(targetModel, reasoningSignal, options?.reasoning)
    : undefined;

  const delegationContext = buildDelegationContext(
    context,
    targetModel,
    deps,
    sessionId,
    reasoning,
  );

  const result = pipe
    ? await pipeDelegatedStream(
        targetModel,
        delegationContext,
        deps,
        options,
        headroomContext,
        pipe,
        reasoning,
      )
    : await collectDelegatedStream(
        targetModel,
        delegationContext,
        deps,
        options,
        headroomContext,
        reasoning,
      );

  recordDelegateOutcome(targetModel, deps, sessionId, result, requestId);

  return result;
}
