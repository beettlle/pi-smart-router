/**
 * SP-238 (#160): default delegation resolves the stream through the composed
 * provider (`modelRegistry.getProvider(...).streamSimple`) so extension-registered
 * custom-API models (claude-bridge et al.) delegate successfully; falls back to
 * pi-ai/compat streamSimple only when no composed provider exists; explicit
 * `deps.delegateStream` still wins over both defaults.
 */
import {
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai/compat';
import type { ModelRegistry } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';

import {
  collectDelegatedStream,
  pipeDelegatedStream,
} from '../../.pi/extensions/smart-router/delegate-stream.js';
import type { StreamDelegationDeps } from '../../.pi/extensions/smart-router/types.js';

function makeModel(
  overrides: Partial<Model<Api>> & { provider: string; id: string; api: Api },
): Model<Api> {
  const { provider, id, api, ...rest } = overrides;
  return {
    name: id,
    api,
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4096,
    provider: provider as Model<Api>['provider'],
    id,
    ...rest,
  };
}

const extensionModel = makeModel({
  provider: 'fake-bridge',
  id: 'fake-model',
  // Synthetic api id unknown to pi-ai's built-in registry — the #160 shape.
  api: 'fake-bridge' as Api,
});

function makeAssistantPartial(model: Model<Api>): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'hello from extension provider' }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

function makeSuccessStream(model: Model<Api>) {
  const stream = createAssistantMessageEventStream();
  const partial = makeAssistantPartial(model);
  void (async () => {
    stream.push({ type: 'start', partial });
    stream.push({ type: 'done', reason: 'stop', message: partial });
    stream.end(partial);
  })();
  return stream;
}

function makeContext(): Context {
  return { messages: [{ role: 'user', content: 'hi', timestamp: 1 }] };
}

interface RegistryStubOptions {
  /** When provided, exposed as `getProvider` on the registry stub. */
  getProvider?: (providerId: string) => { streamSimple: unknown } | undefined;
}

function makeRegistryStub(options: RegistryStubOptions = {}): ModelRegistry {
  const stub: Record<string, unknown> = {
    find(provider: string, id: string) {
      return provider === extensionModel.provider && id === extensionModel.id
        ? extensionModel
        : undefined;
    },
    async getApiKeyAndHeaders(model: Model<Api>) {
      return {
        ok: true as const,
        apiKey: `${model.provider}-delegation-key`,
        headers: undefined,
        env: undefined,
      };
    },
  };
  if (options.getProvider) {
    stub.getProvider = options.getProvider;
  }
  return stub as unknown as ModelRegistry;
}

function makeDeps(registry: ModelRegistry, delegateStream?: StreamDelegationDeps['delegateStream']): StreamDelegationDeps {
  return {
    modelRegistry: registry,
    ...(delegateStream ? { delegateStream } : {}),
  } as unknown as StreamDelegationDeps;
}

describe('delegate-stream composed-provider resolution (SP-238, #160)', () => {
  it('delegates to an extension-registered custom-API provider via getProvider', async () => {
    const extensionStreamSimple = vi.fn((model: Model<Api>) => makeSuccessStream(model));
    const registry = makeRegistryStub({
      getProvider: (providerId: string) =>
        providerId === 'fake-bridge' ? { streamSimple: extensionStreamSimple } : undefined,
    });

    const result = await collectDelegatedStream(
      extensionModel,
      makeContext(),
      makeDeps(registry),
      undefined,
    );

    expect(extensionStreamSimple).toHaveBeenCalledOnce();
    // Resolved delegation options (auth apiKey) pass through unchanged.
    expect(extensionStreamSimple).toHaveBeenCalledWith(
      extensionModel,
      expect.anything(),
      expect.objectContaining({ apiKey: 'fake-bridge-delegation-key' }),
    );
    expect(result.failed).toBe(false);
    expect(result.finalMessage?.stopReason).toBe('stop');
  });

  it('routes pipeDelegatedStream through the composed provider as well', async () => {
    const extensionStreamSimple = vi.fn((model: Model<Api>) => makeSuccessStream(model));
    const registry = makeRegistryStub({
      getProvider: () => ({ streamSimple: extensionStreamSimple }),
    });
    const outer = createAssistantMessageEventStream();

    const result = await pipeDelegatedStream(
      extensionModel,
      makeContext(),
      makeDeps(registry),
      undefined,
      undefined,
      { outer },
    );

    expect(extensionStreamSimple).toHaveBeenCalledOnce();
    expect(result.failed).toBe(false);
    expect(result.heldTerminal?.type).toBe('done');
  });

  it('falls back to compat streamSimple when the registry has no getProvider', async () => {
    const registry = makeRegistryStub();

    // compat streamSimple dispatches on model.api against pi-ai's built-in-only
    // registry — an unknown synthetic api proves the compat path was selected.
    await expect(
      collectDelegatedStream(extensionModel, makeContext(), makeDeps(registry), undefined),
    ).rejects.toThrow(/No API provider registered for api: fake-bridge/);
  });

  it('falls back to compat streamSimple when getProvider returns undefined', async () => {
    const registry = makeRegistryStub({ getProvider: () => undefined });

    await expect(
      collectDelegatedStream(extensionModel, makeContext(), makeDeps(registry), undefined),
    ).rejects.toThrow(/No API provider registered for api: fake-bridge/);
  });

  it('prefers explicit deps.delegateStream over the composed provider', async () => {
    const extensionStreamSimple = vi.fn((model: Model<Api>) => makeSuccessStream(model));
    const registry = makeRegistryStub({
      getProvider: () => ({ streamSimple: extensionStreamSimple }),
    });
    const override = vi.fn((model: Model<Api>) => makeSuccessStream(model));

    const result = await collectDelegatedStream(
      extensionModel,
      makeContext(),
      makeDeps(registry, override),
      undefined,
    );

    expect(override).toHaveBeenCalledOnce();
    expect(extensionStreamSimple).not.toHaveBeenCalled();
    expect(result.failed).toBe(false);
  });
});
