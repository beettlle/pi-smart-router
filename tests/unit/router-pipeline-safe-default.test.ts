// Extracted from tests/unit/router-pipeline.test.ts in SP-277 (wave 1, #155).
// Aligned with src/domain/pipeline/safe-default.ts.
import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { makeModel, makeRequest } from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('safe default fallback on failure', () => {
    it('returns safe default when fleet has only frontier models', async () => {
      const frontierOnly = [makeModel({ id: 'opus', tier: 'frontier-cloud' })];
      const pipeline = new RouterPipeline(frontierOnly);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('opus');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.stage).toBe('fallback');
    });

    it('returns unknown model when fleet is empty', async () => {
      const pipeline = new RouterPipeline([]);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('unknown');
      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
    });

    it('never throws even with empty fleet', async () => {
      const pipeline = new RouterPipeline([]);
      await expect(pipeline.route(makeRequest())).resolves.toBeDefined();
    });

    it('skips unhealthy economical models and falls back to frontier', async () => {
      const mixedFleet = [
        makeModel({ id: 'econ-down', tier: 'economical-cloud', healthy: false }),
        makeModel({ id: 'frontier-up', tier: 'frontier-cloud' }),
      ];
      const pipeline = new RouterPipeline(mixedFleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('frontier-up');
      expect(decision.tier).toBe('frontier-cloud');
    });
  });
});
