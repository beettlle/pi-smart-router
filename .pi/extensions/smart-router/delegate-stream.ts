import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type Model,
  type SimpleStreamOptions,
  streamSimple as defaultDelegateStream,
} from '@earendil-works/pi-ai/compat';

import { parseAssistantMessageError } from '../../../src/infrastructure/delegation/provider-error.js';
import {
  buildDelegationContext,
  modelToExecutionModel,
  resolveDelegationOptions,
  type DelegatedStreamResult,
  type DelegationHeadroomContext,
} from './delegation-runtime.js';
import type { StreamDelegationDeps } from './types.js';

export async function collectDelegatedStream(
  targetModel: Model<Api>,
  context: Context,
  deps: StreamDelegationDeps,
  options: SimpleStreamOptions | undefined,
  headroomContext?: DelegationHeadroomContext,
): Promise<DelegatedStreamResult> {
  if (options?.signal?.aborted) {
    throw new Error('Request was aborted');
  }

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
    if (options?.signal?.aborted) {
      throw new Error('Request was aborted');
    }
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

export async function delegateWithOutcome(
  targetModel: Model<Api>,
  context: Context,
  deps: StreamDelegationDeps,
  options: SimpleStreamOptions | undefined,
  sessionId: string | undefined,
  headroomContext?: DelegationHeadroomContext,
): Promise<DelegatedStreamResult> {
  const delegationContext = buildDelegationContext(
    context,
    targetModel,
    deps,
    sessionId,
  );

  const result = await collectDelegatedStream(
    targetModel,
    delegationContext,
    deps,
    options,
    headroomContext,
  );

  if (!result.finalMessage) {
    return result;
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

  return result;
}
