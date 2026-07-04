import { describe, expect, it } from 'vitest';

import { createRouter } from '../../src/index.js';
import type { PiExtensionHooks } from '../../src/api/middleware/pi-router-middleware.js';

const MODELS_PATH = 'config/models.yaml.example';

describe('createRouter factory (T022)', () => {
  it('returns a valid RouterHandle with all expected properties', () => {
    const handle = createRouter({ modelsPath: MODELS_PATH });

    expect(handle).toHaveProperty('version');
    expect(handle).toHaveProperty('middleware');
    expect(handle).toHaveProperty('dispatch');
    expect(handle).toHaveProperty('fleet');
    expect(handle).toHaveProperty('register');
    expect(typeof handle.version).toBe('string');
    expect(typeof handle.register).toBe('function');
  });

  it('fleet contains models loaded from specified path', () => {
    const handle = createRouter({ modelsPath: MODELS_PATH });

    expect(Array.isArray(handle.fleet)).toBe(true);
    expect(handle.fleet.length).toBeGreaterThan(0);

    for (const model of handle.fleet) {
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('tier');
      expect(model).toHaveProperty('provider');
      expect(model).toHaveProperty('capabilities');
      expect(model).toHaveProperty('pricing');
    }
  });

  it('register delegates to middleware.register', () => {
    const handle = createRouter({ modelsPath: MODELS_PATH });
    const registered: string[] = [];

    const mockHooks = {
      on(event: string) {
        registered.push(event);
      },
    } as PiExtensionHooks;

    handle.register(mockHooks);

    expect(registered).toContain('context');
    expect(registered).toContain('session_compact');
    expect(registered).toContain('session_before_compact');
    expect(registered).toContain('model_select');
    expect(registered).not.toContain('before_provider_request');
  });

  it('middleware has getLastDecision method', () => {
    const handle = createRouter({ modelsPath: MODELS_PATH });

    expect(typeof handle.middleware.getLastDecision).toBe('function');
    expect(handle.middleware.getLastDecision()).toBeUndefined();
  });

  it('throws when models file does not exist', () => {
    expect(() =>
      createRouter({ modelsPath: 'nonexistent/models.yaml' }),
    ).toThrow();
  });

  it('version string identifies the package', () => {
    const handle = createRouter({ modelsPath: MODELS_PATH });
    expect(handle.version).toBe('pi-smart-router');
  });

  it('returned register is the same function as middleware.register', () => {
    const handle = createRouter({ modelsPath: MODELS_PATH });
    expect(handle.register).toBe(handle.middleware.register);
  });
});
