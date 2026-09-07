// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/pipeline/router-pipeline.ts error path + SP-053 telemetry.
import { describe, expect, it, vi } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { RoutingTelemetryEmitter } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import type { RoutingRequest } from '../../src/domain/types/index.js';
import { fleet, makeRequest, HARDWARE_CONFIG } from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('pipeline error telemetry (SP-053)', () => {
    it('emits pipeline_error telemetry and returns safe default when a stage throws', async () => {
      const onRecord = vi.fn();
      const telemetryEmitter = new RoutingTelemetryEmitter({ onRecord });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const secretPrompt = 'super-secret-prompt-content';
      const pipeline = new RouterPipeline(fleet, {
        telemetryEmitter,
        hardwareConfig: HARDWARE_CONFIG,
        systemInfoProvider: async () => {
          throw new Error(`probe failed for prompt: ${secretPrompt}`);
        },
      });

      const decision = await pipeline.route(makeRequest({ prompt_text: secretPrompt }));

      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');

      expect(onRecord).toHaveBeenCalledOnce();
      expect(onRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          reason_code: 'pipeline_error',
          stage: 'hardware_probe',
          selected_model_id: 'gpt-4o-mini',
        }),
      );

      expect(warnSpy).toHaveBeenCalledOnce();
      const warnPayload = warnSpy.mock.calls[0]?.[1] as { error?: string };
      expect(warnPayload.error).toContain('[REDACTED]');
      expect(warnPayload.error).not.toContain(secretPrompt);

      warnSpy.mockRestore();
    });

    it('never propagates stage exceptions to the caller', async () => {
      const pipeline = new RouterPipeline(fleet, {
        hardwareConfig: HARDWARE_CONFIG,
        systemInfoProvider: async () => {
          throw new Error('hardware probe unavailable');
        },
      });

      await expect(pipeline.route(makeRequest())).resolves.toMatchObject({
        stage: 'fallback',
        reason_code: 'safe_cloud_default',
      });
    });

    it('reports triage_cloud_fallback (not triage) when cloud fallback stage throws (SP-071)', async () => {
      const onRecord = vi.fn();
      const telemetryEmitter = new RoutingTelemetryEmitter({ onRecord });

      const cloudFallbackSpy = vi
        .spyOn(
          RouterPipeline.prototype as unknown as {
            triageCloudFallback: (request: RoutingRequest) => Promise<unknown>;
          },
          'triageCloudFallback',
        )
        .mockRejectedValue(new Error('cloud fallback failed'));

      const pipeline = new RouterPipeline(fleet, { telemetryEmitter });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Fix the typo in the README' }),
      );

      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');

      expect(onRecord).toHaveBeenCalledOnce();
      expect(onRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          reason_code: 'pipeline_error',
          stage: 'triage_cloud_fallback',
        }),
      );

      cloudFallbackSpy.mockRestore();
    });
  });
});
