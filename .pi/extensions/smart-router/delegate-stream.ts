import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  streamSimple as defaultDelegateStream,
} from '@earendil-works/pi-ai/compat';

import { parseAssistantMessageError } from '../../../src/infrastructure/delegation/provider-error.js';
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
import type { StreamDelegationDeps } from './types.js';
import { throwIfAborted } from './utils.js';

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
): Promise<DelegatedStreamResult> {
  throwIfAborted(options);

  const delegationOptions = await resolveDelegationOptions(
    deps.modelRegistry,
    targetModel,
    options,
    headroomContext,
  );
  const delegateStream = deps.delegateStream ?? defaultDelegateStream;
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
): Promise<PipedDelegatedStreamResult> {
  throwIfAborted(options);

  const delegationOptions = await resolveDelegationOptions(
    deps.modelRegistry,
    targetModel,
    options,
    headroomContext,
  );
  const delegateStream = deps.delegateStream ?? defaultDelegateStream;
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
): void {
  if (!result.finalMessage) {
    return;
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
    });
  }
}

/**
 * Delegate with outcome recording. When `pipe` is provided, live-forwards to outer
 * (holding the terminal event). Otherwise collects into a buffer (planning / probes).
 */
export async function delegateWithOutcome(
  targetModel: Model<Api>,
  context: Context,
  deps: StreamDelegationDeps,
  options: SimpleStreamOptions | undefined,
  sessionId: string | undefined,
  headroomContext?: DelegationHeadroomContext,
  pipe?: PipeDelegatedStreamOptions,
): Promise<PipedDelegatedStreamResult | DelegatedStreamResult> {
  const delegationContext = buildDelegationContext(
    context,
    targetModel,
    deps,
    sessionId,
  );

  const result = pipe
    ? await pipeDelegatedStream(
        targetModel,
        delegationContext,
        deps,
        options,
        headroomContext,
        pipe,
      )
    : await collectDelegatedStream(
        targetModel,
        delegationContext,
        deps,
        options,
        headroomContext,
      );

  recordDelegateOutcome(targetModel, deps, sessionId, result);

  return result;
}
