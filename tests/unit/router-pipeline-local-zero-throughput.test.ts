// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/pipeline/local-zero-stage.ts throughput gate (SP-164).
import { describe, expect, it, vi } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { THROUGHPUT_BELOW_THRESHOLD } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import type { ThroughputMeter } from '../../src/infrastructure/hardware/throughput-meter.js';
import type { ModelProfile } from '../../src/domain/types/index.js';
import {
  HARDWARE_CONFIG,
  LOCAL_TEST_CONFIG,
  makeModel,
  makeRequest,
  makeSystemInfo,
  READY_FETCH,
} from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('local_zero throughput gate (SP-164)', () => {
    function makeThroughputMeter(aboveThreshold: boolean): ThroughputMeter {
      return {
        recordSample: vi.fn(),
        getMedianTps: vi.fn(() => (aboveThreshold ? 30 : 10)),
        isAboveThreshold: vi.fn(() => aboveThreshold),
        getSampleCount: vi.fn(() => 1),
        getBreakdown: vi.fn(() => ({
          warmMedianTps: aboveThreshold ? 30 : 10,
          coldMedianTps: null,
          warmSamples: 1,
          coldSamples: 0,
          classification: 'warm' as const,
        })),
        isViable: vi.fn(() => aboveThreshold),
        clear: vi.fn(),
      };
    }

    const localReadyFleet: ModelProfile[] = [
      makeModel({ id: 'local-llama', tier: 'zero-tier' }),
      makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
    ];

    const localReadyOptions = {
      hardwareConfig: HARDWARE_CONFIG,
      localConfig: LOCAL_TEST_CONFIG,
      systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
      httpFetchPort: READY_FETCH,
    };

    it('dispatches local_zero when throughput meter is above threshold', async () => {
      const pipeline = new RouterPipeline(localReadyFleet, {
        ...localReadyOptions,
        throughputMeter: makeThroughputMeter(true),
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
      expect(decision.reason_code).toBe('local_model_ready');
    });

    it('falls through to economical cloud when throughput is below threshold', async () => {
      const pipeline = new RouterPipeline(localReadyFleet, {
        ...localReadyOptions,
        throughputMeter: makeThroughputMeter(false),
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
      expect(decision.reason_code).toBe(THROUGHPUT_BELOW_THRESHOLD);
      expect(decision.features?.local_eligible_reason).toBe('triage_trivial');
      expect(decision.features?.tier_selection?.local_zero_skip_reasons).toContain(
        THROUGHPUT_BELOW_THRESHOLD,
      );
    });

    it('preserves local_zero routing when throughput meter is not configured', async () => {
      const pipeline = new RouterPipeline(localReadyFleet, localReadyOptions);

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
    });
  });
});
