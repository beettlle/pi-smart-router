import { describe, expect, it } from 'vitest';

import { safeCloudDefault } from '../../src/domain/pipeline/safe-default.js';
import type { ModelProfile } from '../../src/domain/types/index.js';

function makeModel(overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] }): ModelProfile {
  return {
    provider: 'test',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

describe('safeCloudDefault', () => {
  it('selects the first healthy economical-cloud model', () => {
    const models: ModelProfile[] = [
      makeModel({ id: 'local', tier: 'zero-tier' }),
      makeModel({ id: 'econ-1', tier: 'economical-cloud' }),
      makeModel({ id: 'econ-2', tier: 'economical-cloud' }),
      makeModel({ id: 'frontier-1', tier: 'frontier-cloud' }),
    ];

    const result = safeCloudDefault(models);
    expect(result?.id).toBe('econ-1');
    expect(result?.tier).toBe('economical-cloud');
  });

  it('falls back to frontier-cloud when no economical model is healthy', () => {
    const models: ModelProfile[] = [
      makeModel({ id: 'local', tier: 'zero-tier' }),
      makeModel({ id: 'econ-unhealthy', tier: 'economical-cloud', healthy: false }),
      makeModel({ id: 'frontier-1', tier: 'frontier-cloud' }),
    ];

    const result = safeCloudDefault(models);
    expect(result?.id).toBe('frontier-1');
    expect(result?.tier).toBe('frontier-cloud');
  });

  it('returns undefined when no cloud models are available', () => {
    const models: ModelProfile[] = [
      makeModel({ id: 'local', tier: 'zero-tier' }),
    ];

    expect(safeCloudDefault(models)).toBeUndefined();
  });

  it('returns undefined for an empty fleet', () => {
    expect(safeCloudDefault([])).toBeUndefined();
  });

  it('never throws even with empty input', () => {
    expect(() => safeCloudDefault([])).not.toThrow();
  });

  it('treats models with healthy=undefined as healthy', () => {
    const models: ModelProfile[] = [
      makeModel({ id: 'econ-no-flag', tier: 'economical-cloud' }),
    ];

    const result = safeCloudDefault(models);
    expect(result?.id).toBe('econ-no-flag');
  });

  it('skips unhealthy frontier models too', () => {
    const models: ModelProfile[] = [
      makeModel({ id: 'econ-down', tier: 'economical-cloud', healthy: false }),
      makeModel({ id: 'frontier-down', tier: 'frontier-cloud', healthy: false }),
    ];

    expect(safeCloudDefault(models)).toBeUndefined();
  });

  it('prefers economical over frontier regardless of catalog order', () => {
    const models: ModelProfile[] = [
      makeModel({ id: 'frontier-1', tier: 'frontier-cloud' }),
      makeModel({ id: 'econ-1', tier: 'economical-cloud' }),
    ];

    const result = safeCloudDefault(models);
    expect(result?.id).toBe('econ-1');
  });
});
