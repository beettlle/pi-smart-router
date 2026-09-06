// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with estimated_cost_usd plumbing in the pipeline decision + telemetry (SP-085).
import { describe, expect, it, vi } from 'vitest';

import { HydraMatcher } from '../../src/domain/matching/hydra-matcher.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import { RoutingTelemetryEmitter } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import type { ModelProfile, PriceCatalog } from '../../src/domain/types/index.js';
import {
  makeModel,
  makeMockHydraProvider,
  makeRequest,
} from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('estimated_cost_usd telemetry (SP-085)', () => {
    const pricingFleet: ModelProfile[] = [
      makeModel({
        id: 'flash',
        tier: 'economical-cloud',
        pricing: { fallback_cost_per_1m: 0.6 },
      }),
    ];

    const emptyCatalog: PriceCatalog = {
      registry_snapshot: {},
      user_overrides: {},
      last_updated: '2026-07-05T00:00:00.000Z',
      source: 'yaml_fallback',
    };

    it('populates estimated_cost_usd on turn_envelope decisions', async () => {
      const pipeline = new RouterPipeline(pricingFleet, { priceCatalog: emptyCatalog });
      const decision = await pipeline.route(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 1_000_000 }),
      );

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.estimated_cost_usd).toBeCloseTo(0.6, 5);
    });

    it('populates estimated_cost_usd on session_pin decisions', async () => {
      const pinFleet: ModelProfile[] = [
        makeModel({
          id: 'frontier-a',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
      ];
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'frontier-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, {
        sessionPinner: pinner,
        priceCatalog: emptyCatalog,
      });
      const decision = await pipeline.route(
        makeRequest({ turn_type: 'main_loop', estimated_input_tokens: 2_000_000 }),
      );

      expect(decision.stage).toBe('session_pin');
      expect(decision.estimated_cost_usd).toBeCloseTo(30.0, 5);
    });

    it('populates estimated_cost_usd on hydra_match decisions', async () => {
      const hydraFleet: ModelProfile[] = [
        makeModel({
          id: 'gpt-4o-mini',
          tier: 'economical-cloud',
          pricing: { fallback_cost_per_1m: 0.6 },
        }),
        makeModel({
          id: 'claude-opus',
          tier: 'frontier-cloud',
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
      ];

      const requirements = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const hydraMatcher = new HydraMatcher(makeMockHydraProvider(requirements), {
        artifactCachePath: '.pi-smart-router/models/',
      });

      const pipeline = new RouterPipeline(hydraFleet, {
        hydraMatcher,
        priceCatalog: emptyCatalog,
      });
      const decision = await pipeline.route(
        makeRequest({
          prompt_text: 'Hello, how are you today?',
          estimated_input_tokens: 500_000,
        }),
      );

      expect(decision.stage).toBe('hydra_match');
      expect(decision.estimated_cost_usd).toBeGreaterThan(0);
    });

    it('emits non-zero estimated_cost_usd in telemetry when pricing is available', async () => {
      const onRecord = vi.fn();
      const telemetryEmitter = new RoutingTelemetryEmitter({ onRecord });
      const pipeline = new RouterPipeline(pricingFleet, {
        telemetryEmitter,
        priceCatalog: emptyCatalog,
      });

      await pipeline.route(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 1_000_000 }),
      );

      expect(onRecord).toHaveBeenCalledOnce();
      expect(onRecord.mock.calls[0]?.[0]?.estimated_cost_usd).toBeCloseTo(0.6, 5);
    });
  });
});
