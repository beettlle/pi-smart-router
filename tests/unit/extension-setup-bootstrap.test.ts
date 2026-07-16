import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import {
  HydraMatcher,
  type EmbeddingProvider,
} from '../../src/domain/matching/hydra-matcher.js';

vi.mock('../../.pi/extensions/smart-router/fleet-bootstrap.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../.pi/extensions/smart-router/fleet-bootstrap.js')
  >();
  return {
    ...actual,
    initHydraMatcher: vi.fn(async () => {
      const embedding: EmbeddingProvider = {
        extractRequirements: async () => ({ reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 }),
        dispose: async () => {},
      };
      return new HydraMatcher(embedding, { artifactCachePath: '.pi-smart-router/models/' });
    }),
    createOperatorAwareSessionPinner: vi.fn((store) => new SessionPinner({ store })),
  };
});

vi.mock('../../.pi/extensions/smart-router/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../.pi/extensions/smart-router/utils.js')>();
  return {
    ...actual,
    createExtensionStore: vi.fn(() => new MemoryStore()),
  };
});

describe('createSmartRouterRuntime bootstrap (Pi 0.80.8+)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a runtime via ModelRuntime.create and ModelRegistry (no AuthStorage)', async () => {
    const sourcePath = join(
      process.cwd(),
      '.pi/extensions/smart-router/extension-setup.ts',
    );
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toMatch(/\bAuthStorage\b/);
    expect(source).toMatch(/ModelRuntime\.create/);
    expect(source).toMatch(/new ModelRegistry\(/);

    const fakeRuntime = { kind: 'test-model-runtime' } as never;
    const createSpy = vi.spyOn(ModelRuntime, 'create').mockResolvedValue(fakeRuntime);

    const { createSmartRouterRuntime } = await import(
      '../../.pi/extensions/smart-router/extension-setup.js'
    );

    const { runtime } = await createSmartRouterRuntime('/tmp/smart-router-bootstrap-test');

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(runtime.modelRegistry).toBeDefined();
    expect(runtime.streamDeps.modelRegistry).toBe(runtime.modelRegistry);
  });
});
