/**
 * pi-smart-router project-local extension.
 *
 * Discovers authenticated models from pi's model registry, maps them to a
 * router fleet, registers the smart-router/auto provider, and wires middleware
 * hooks for routing state. Real stream delegation is implemented in SP-041.
 */

import {
  type Api,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai/compat';
import {
  AuthStorage,
  ModelRegistry,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';

import { mapFleetFromRegistry } from '../../../src/config/pi-model-mapper.js';
import { safeCloudDefault } from '../../../src/domain/pipeline/safe-default.js';
import type { ModelProfile } from '../../../src/domain/types/index.js';
import {
  createRouterFromFleet,
  type PiExtensionHooks,
  type RouterHandle,
} from '../../../src/index.js';

const PROVIDER_NAME = 'smart-router' as const;
const AUTO_MODEL_ID = 'auto' as const;

function createHooksAdapter(pi: ExtensionAPI): PiExtensionHooks {
  return {
    on(event, handler) {
      pi.on(event, handler as never);
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

function streamSimplePlaceholder(
  model: Model<Api>,
  _context: Context,
  options: SimpleStreamOptions | undefined,
  fleet: readonly ModelProfile[],
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  const fallback = safeCloudDefault(fleet);
  const message = fallback
    ? `[smart-router] Placeholder (SP-041). Safe cloud default: ${fallback.provider}/${fallback.id}`
    : '[smart-router] Placeholder (SP-041). No safe cloud default available in fleet.';

  void (async () => {
    const output = {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: '' }],
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
      stopReason: 'stop' as const,
      timestamp: Date.now(),
    };

    try {
      if (options?.signal?.aborted) {
        throw new Error('Request was aborted');
      }

      stream.push({ type: 'start', partial: output });
      output.content[0] = { type: 'text', text: message };
      stream.push({ type: 'text_start', contentIndex: 0, partial: output });
      stream.push({ type: 'text_delta', contentIndex: 0, delta: message, partial: output });
      stream.push({ type: 'text_end', contentIndex: 0, content: message, partial: output });
      stream.push({ type: 'done', reason: 'stop', message: output });
      stream.end();
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? 'aborted' : 'error';
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: 'error', reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}

export default async function smartRouterExtension(pi: ExtensionAPI): Promise<void> {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const fleet = discoverFleet(modelRegistry);
  const router: RouterHandle = createRouterFromFleet(fleet);

  router.register(createHooksAdapter(pi));

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
    streamSimple(model, context, options) {
      return streamSimplePlaceholder(model, context, options, fleet);
    },
  });
}
