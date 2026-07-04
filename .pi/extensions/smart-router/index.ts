/**
 * pi-smart-router project-local extension.
 *
 * Discovers authenticated models from pi's model registry, maps them to a
 * router fleet, registers the smart-router/auto provider, and wires middleware
 * hooks for routing state. Stream delegation routes each request through the
 * pipeline and forwards to the selected provider's built-in streaming API.
 */

import { randomUUID } from 'node:crypto';

import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Message,
  type Model,
  type SimpleStreamOptions,
  type TextContent,
  createAssistantMessageEventStream,
  streamSimple as delegateStreamSimple,
} from '@earendil-works/pi-ai/compat';
import {
  AuthStorage,
  ModelRegistry,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';

import { mapFleetFromRegistry } from '../../../src/config/pi-model-mapper.js';
import { safeCloudDefault } from '../../../src/domain/pipeline/safe-default.js';
import type {
  Message as RoutingMessage,
  ModelProfile,
  RoutingDecision,
  RoutingRequest,
  TurnType,
} from '../../../src/domain/types/index.js';
import {
  createRouterFromFleet,
  type PiExtensionHooks,
  type RouterHandle,
} from '../../../src/index.js';

const PROVIDER_NAME = 'smart-router' as const;
const AUTO_MODEL_ID = 'auto' as const;

interface StreamDelegationDeps {
  readonly router: RouterHandle;
  readonly modelRegistry: ModelRegistry;
  readonly fleet: readonly ModelProfile[];
}

function createHooksAdapter(pi: ExtensionAPI): PiExtensionHooks {
  return {
    on(event, handler) {
      pi.on(event as never, handler as never);
    },
  };
}

function discoverFleet(modelRegistry: ModelRegistry): ModelProfile[] {
  const available = modelRegistry.getAvailable();
  return mapFleetFromRegistry(
    available.map((model) => ({
      provider: model.provider,
      id: model.id,
      ...(model.name !== undefined ? { name: model.name } : {}),
    })),
  );
}

function messageContentToString(content: string | readonly (TextContent | { type: string })[]): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function extractPromptText(messages: readonly Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === 'user') {
      const text = messageContentToString(message.content);
      if (text.trim()) {
        return text;
      }
    }
  }
  return '';
}

function deriveTurnType(messages: readonly Message[]): TurnType {
  if (messages.length === 0) {
    return 'unknown';
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return 'unknown';
  }

  if (lastMessage.role === 'toolResult') {
    return 'tool_result';
  }

  if (lastMessage.role === 'user') {
    const text = messageContentToString(lastMessage.content).toLowerCase();
    if (
      text.includes('plan') ||
      text.includes('architect') ||
      text.includes('design')
    ) {
      return 'planning';
    }
  }

  return 'main_loop';
}

function mapContextMessages(messages: readonly Message[]): RoutingMessage[] {
  return messages.map((message) => {
    if (message.role === 'user') {
      return {
        role: message.role,
        content: messageContentToString(message.content),
      };
    }

    if (message.role === 'assistant') {
      const content = message.content
        .map((block) => {
          if (block.type === 'text') {
            return block.text;
          }
          if (block.type === 'thinking') {
            return block.thinking;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');

      return { role: message.role, content };
    }

    return {
      role: 'tool',
      content: messageContentToString(message.content),
      tool_blocks: [],
    };
  });
}

function buildRoutingRequest(
  context: Context,
  options: SimpleStreamOptions | undefined,
): RoutingRequest {
  return {
    request_id: randomUUID(),
    session_id: options?.sessionId ?? randomUUID(),
    prompt_text: extractPromptText(context.messages),
    messages: mapContextMessages(context.messages),
    turn_type: deriveTurnType(context.messages),
  };
}

function findFleetProfile(
  fleet: readonly ModelProfile[],
  modelId: string,
): ModelProfile | undefined {
  return fleet.find((profile) => profile.id === modelId);
}

function resolveRegistryModel(
  modelRegistry: ModelRegistry,
  profile: ModelProfile,
): Model<Api> | undefined {
  return modelRegistry.find(profile.provider, profile.id);
}

function resolveTargetModel(
  deps: StreamDelegationDeps,
  decision: RoutingDecision,
): Model<Api> | undefined {
  const profile = findFleetProfile(deps.fleet, decision.selected_model_id);
  if (!profile) {
    return undefined;
  }
  return resolveRegistryModel(deps.modelRegistry, profile);
}

function resolveFallbackModel(deps: StreamDelegationDeps): Model<Api> | undefined {
  const fallbackProfile = safeCloudDefault(deps.fleet);
  if (!fallbackProfile) {
    return undefined;
  }
  return resolveRegistryModel(deps.modelRegistry, fallbackProfile);
}

function logRoutingDecision(
  decision: RoutingDecision,
  delegate?: { provider: string; modelId: string; api: Api },
): void {
  console.info(
    '[smart-router] routing decision',
    JSON.stringify({
      request_id: decision.request_id,
      selected_model_id: decision.selected_model_id,
      tier: decision.tier,
      stage: decision.stage,
      reason_code: decision.reason_code,
      routing_latency_ms: decision.routing_latency_ms,
      delegate,
    }),
  );
}

function createErrorMessage(
  model: Model<Api>,
  options: SimpleStreamOptions | undefined,
  error: unknown,
): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: options?.signal?.aborted ? 'aborted' : 'error',
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  };
}

async function pipeDelegatedStream(
  outer: AssistantMessageEventStream,
  targetModel: Model<Api>,
  context: Context,
  options: SimpleStreamOptions | undefined,
): Promise<void> {
  if (options?.signal?.aborted) {
    throw new Error('Request was aborted');
  }

  const inner = delegateStreamSimple(targetModel, context, options);
  for await (const event of inner) {
    if (options?.signal?.aborted) {
      throw new Error('Request was aborted');
    }
    outer.push(event);
  }
  outer.end();
}

async function routeAndDelegate(
  context: Context,
  options: SimpleStreamOptions | undefined,
  deps: StreamDelegationDeps,
  outer: AssistantMessageEventStream,
): Promise<void> {
  let decision: RoutingDecision;
  try {
    const request = buildRoutingRequest(context, options);
    decision = await deps.router.dispatch.dispatch(request);
  } catch (error) {
    const fallbackModel = resolveFallbackModel(deps);
    if (!fallbackModel) {
      throw error;
    }
    console.warn(
      '[smart-router] routing failed, using safe cloud default',
      error instanceof Error ? error.message : String(error),
    );
    await pipeDelegatedStream(outer, fallbackModel, context, options);
    return;
  }

  let targetModel = resolveTargetModel(deps, decision);
  if (!targetModel) {
    console.warn(
      '[smart-router] routed model not found in registry',
      decision.selected_model_id,
    );
    targetModel = resolveFallbackModel(deps);
  }

  if (!targetModel) {
    throw new Error(
      `No registry model available for routing decision ${decision.selected_model_id}`,
    );
  }

  logRoutingDecision(decision, {
    provider: targetModel.provider,
    modelId: targetModel.id,
    api: targetModel.api,
  });

  try {
    await pipeDelegatedStream(outer, targetModel, context, options);
  } catch (error) {
    const fallbackModel = resolveFallbackModel(deps);
    if (!fallbackModel || fallbackModel.id === targetModel.id) {
      throw error;
    }
    console.warn(
      '[smart-router] stream delegation failed, using safe cloud default',
      error instanceof Error ? error.message : String(error),
    );
    await pipeDelegatedStream(outer, fallbackModel, context, options);
  }
}

function createStreamSimple(deps: StreamDelegationDeps) {
  return function streamSimple(
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream {
    const stream = createAssistantMessageEventStream();

    void (async () => {
      try {
        await routeAndDelegate(context, options, deps, stream);
      } catch (error) {
        stream.push({
          type: 'error',
          reason: options?.signal?.aborted ? 'aborted' : 'error',
          error: createErrorMessage(model, options, error),
        });
        stream.end();
      }
    })();

    return stream;
  };
}

export {
  buildRoutingRequest,
  createStreamSimple,
  deriveTurnType,
  extractPromptText,
  mapContextMessages,
};

export default async function smartRouterExtension(pi: ExtensionAPI): Promise<void> {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const fleet = discoverFleet(modelRegistry);
  const router: RouterHandle = createRouterFromFleet(fleet);

  router.register(createHooksAdapter(pi));

  const streamDeps: StreamDelegationDeps = {
    router,
    modelRegistry,
    fleet,
  };

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
    streamSimple: createStreamSimple(streamDeps),
  });
}
