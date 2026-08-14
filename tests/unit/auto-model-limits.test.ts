import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildAutoModelEntry, wireSmartRouterExtension } from '../../.pi/extensions/smart-router/extension-setup.js';

/**
 * Auto-model registered limits must follow the delegated model's real context
 * window / max output, not a hardcoded 200k fallback. Regression guard for the
 * footer `X%/200k` mismatch (pi compaction uses the registered contextWindow).
 */
describe('smart-router auto model limits (context window from selected model)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to conservative limits when no model limits are known yet', () => {
    const entry = buildAutoModelEntry();
    expect(entry.contextWindow).toBe(200_000);
    expect(entry.maxTokens).toBe(16_384);
    expect(entry.id).toBe('auto');
  });

  it('uses the delegated model real context window and max output', () => {
    const entry = buildAutoModelEntry({ contextWindow: 1_000_000, maxTokens: 384_000 });
    expect(entry.contextWindow).toBe(1_000_000);
    expect(entry.maxTokens).toBe(384_000);
  });

  it('falls back per-field when a limit is missing or non-positive', () => {
    const entry = buildAutoModelEntry({ contextWindow: 0, maxTokens: Number.NaN });
    expect(entry.contextWindow).toBe(200_000);
    expect(entry.maxTokens).toBe(16_384);
  });

  it('re-registers the provider only when the delegated limits change', async () => {
    const registerProvider = vi.fn();
    const pi = {
      registerProvider,
      registerCommand: vi.fn(),
      on: vi.fn(),
    } as never;
    const runtime = {
      setLmuStatus: undefined,
      sessionPinner: {},
      streamDeps: {},
    } as never;

    await wireSmartRouterExtension(pi, runtime, { fn: undefined });

    // Initial registration uses the fallback entry.
    expect(registerProvider).toHaveBeenCalledTimes(1);
    const initialModels = registerProvider.mock.calls[0]![1]!.models;
    expect(initialModels[0].contextWindow).toBe(200_000);

    const sync = (runtime as { syncRegisteredLimits: (l: object) => void }).syncRegisteredLimits;

    // First sync with real limits re-registers.
    sync({ contextWindow: 1_000_000, maxTokens: 384_000 });
    expect(registerProvider).toHaveBeenCalledTimes(2);
    const updatedModels = registerProvider.mock.calls[1]![1]!.models;
    expect(updatedModels[0].contextWindow).toBe(1_000_000);
    expect(updatedModels[0].maxTokens).toBe(384_000);

    // Same limits again → no churn.
    sync({ contextWindow: 1_000_000, maxTokens: 384_000 });
    expect(registerProvider).toHaveBeenCalledTimes(2);

    // New limits → re-registers again.
    sync({ contextWindow: 128_000, maxTokens: 8192 });
    expect(registerProvider).toHaveBeenCalledTimes(3);
    const lastModels = registerProvider.mock.calls[2]![1]!.models;
    expect(lastModels[0].contextWindow).toBe(128_000);
  });

  it('includes api/baseUrl on every registration (pi validates raw config before merging)', async () => {
    const registerProvider = vi.fn();
    const pi = {
      registerProvider,
      registerCommand: vi.fn(),
      on: vi.fn(),
    } as never;
    const runtime = {
      setLmuStatus: undefined,
      sessionPinner: {},
      streamDeps: {},
    } as never;

    await wireSmartRouterExtension(pi, runtime, { fn: undefined });
    const sync = (runtime as { syncRegisteredLimits: (l: object) => void }).syncRegisteredLimits;
    sync({ contextWindow: 1_000_000, maxTokens: 384_000 });

    // Every payload must carry api + baseUrl; a models-only re-registration is
    // rejected by pi's validateExtensionProvider before the merge runs.
    for (const call of registerProvider.mock.calls) {
      const payload = call[1];
      expect(payload.api).toBe('openai-responses');
      expect(payload.baseUrl).toBe('https://smart-router.local');
    }
  });
});
