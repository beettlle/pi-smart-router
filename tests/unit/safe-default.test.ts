import { describe, expect, it } from 'vitest';

import { safeCloudDefault } from '../../src/domain/pipeline/safe-default.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

function makeModel(overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] }): ModelProfile {
  return {
    provider: 'test',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'safe-default-test-001',
    session_id: 'sess-safe',
    prompt_text: 'test prompt',
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

describe('safe-default error-path (T024, FR-022, SC-001)', () => {
  describe('pipeline returns safe default on internal stage errors', () => {
    it('routing failure with healthy fleet returns economical model', async () => {
      const fleet = [
        makeModel({ id: 'econ-primary', tier: 'economical-cloud' }),
        makeModel({ id: 'frontier-backup', tier: 'frontier-cloud' }),
      ];
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
      expect(decision.selected_model_id).toBe('econ-primary');
      expect(decision.tier).toBe('economical-cloud');
    });

    it('routing failure with degraded fleet falls back to frontier', async () => {
      const fleet = [
        makeModel({ id: 'econ-sick', tier: 'economical-cloud', healthy: false }),
        makeModel({ id: 'frontier-alive', tier: 'frontier-cloud' }),
      ];
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('frontier-alive');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.stage).toBe('fallback');
    });

    it('routing failure with fully degraded fleet returns unknown model', async () => {
      const fleet = [
        makeModel({ id: 'econ-down', tier: 'economical-cloud', healthy: false }),
        makeModel({ id: 'frontier-down', tier: 'frontier-cloud', healthy: false }),
      ];
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('unknown');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.stage).toBe('fallback');
    });

    it('routing failure with empty fleet returns graceful fallback', async () => {
      const pipeline = new RouterPipeline([]);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('unknown');
      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
      expect(decision.routing_latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('zero-crash resilience under adversarial inputs', () => {
    it('never throws with empty prompt text', async () => {
      const fleet = [makeModel({ id: 'econ', tier: 'economical-cloud' })];
      const pipeline = new RouterPipeline(fleet);

      await expect(
        pipeline.route(makeRequest({ prompt_text: '' })),
      ).resolves.toBeDefined();
    });

    it('never throws with very long prompt text', async () => {
      const fleet = [makeModel({ id: 'econ', tier: 'economical-cloud' })];
      const pipeline = new RouterPipeline(fleet);
      const longPrompt = 'x'.repeat(100_000);

      const decision = await pipeline.route(makeRequest({ prompt_text: longPrompt }));
      expect(decision.selected_model_id).toBe('econ');
    });

    it('never throws with special characters in prompt', async () => {
      const fleet = [makeModel({ id: 'econ', tier: 'economical-cloud' })];
      const pipeline = new RouterPipeline(fleet);
      const adversarial = '${process.exit(1)} `rm -rf /` {{template}} <script>alert(1)</script>';

      const decision = await pipeline.route(makeRequest({ prompt_text: adversarial }));
      expect(decision).toBeDefined();
      expect(decision.tier).toMatch(/^(zero-tier|economical-cloud|frontier-cloud)$/);
    });

    it('never throws with undefined optional fields', async () => {
      const fleet = [makeModel({ id: 'econ', tier: 'economical-cloud' })];
      const pipeline = new RouterPipeline(fleet);

      const decision = await pipeline.route({
        request_id: 'minimal-req',
        session_id: 'minimal-sess',
        prompt_text: 'minimal',
      });
      expect(decision).toBeDefined();
      expect(decision.selected_model_id).toBe('econ');
    });

    it('handles only zero-tier models gracefully (no cloud fallback)', async () => {
      const fleet = [makeModel({ id: 'local-only', tier: 'zero-tier' })];
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('unknown');
      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
    });
  });

  describe('decision preserves request context on failure path', () => {
    it('fallback decision includes the original request_id', async () => {
      const pipeline = new RouterPipeline([]);
      const decision = await pipeline.route(
        makeRequest({ request_id: 'preserve-me-123' }),
      );
      expect(decision.request_id).toBe('preserve-me-123');
    });

    it('fallback decision has null pin_reason', async () => {
      const fleet = [makeModel({ id: 'econ', tier: 'economical-cloud' })];
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.pin_reason).toBeNull();
    });

    it('fallback decision reports non-negative routing latency', async () => {
      const fleet = [makeModel({ id: 'econ', tier: 'economical-cloud' })];
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.routing_latency_ms).toBeGreaterThanOrEqual(0);
      expect(decision.routing_latency_ms).toBeLessThan(1000);
    });
  });
});
