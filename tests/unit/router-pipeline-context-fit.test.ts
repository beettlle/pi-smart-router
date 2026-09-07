// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/pipeline/context-fit-stage.ts (SP-093) and
// src/domain/pipeline/context-overflow-fallback-stage.ts (SP-095).
import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import { CONTEXT_FIT_EXCEEDED } from '../../src/domain/routing/context-fit.js';
import type { ModelProfile } from '../../src/domain/types/index.js';
import {
  fleet,
  makeModel,
  makeRequest,
  UNTRAINED_P_SUCCESS_WEIGHTS,
} from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('context-fit gate (SP-093)', () => {
    const contextFleet: ModelProfile[] = [
      makeModel({
        id: 'small-window',
        tier: 'economical-cloud',
        limits: { max_input_tokens: 32_768 },
      }),
      makeModel({
        id: 'large-window',
        tier: 'frontier-cloud',
        limits: { max_input_tokens: 200_000 },
      }),
    ];

    it('excludes undersized models when estimated tokens exceed a 32K window', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'small-window', 'initial');

      const pipeline = new RouterPipeline(contextFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 34_000 }),
      );

      expect(decision.selected_model_id).not.toBe('small-window');
      expect(decision.features?.candidates?.some(
        (c) => c.model_id === 'small-window' && c.rejected_reason === CONTEXT_FIT_EXCEEDED,
      )).toBe(true);
    });

    it('leaves short-prompt routing unchanged when all models fit', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 50 }),
      );

      expect(decision.stage).toBe('fallback');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
      expect(decision.features?.candidates ?? []).toEqual([]);
    });

    it('records rejected candidates in decision features', async () => {
      const pipeline = new RouterPipeline(contextFleet);
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 34_000 }),
      );

      const rejected = decision.features?.candidates?.filter(
        (c) => c.rejected_reason === CONTEXT_FIT_EXCEEDED,
      );
      expect(rejected).toHaveLength(1);
      expect(rejected?.[0]?.model_id).toBe('small-window');
      expect(decision.selected_model_id).toBe('large-window');
    });

    it('honors contextFitConfig safety margin from pipeline options', async () => {
      const narrowFleet = [
        makeModel({
          id: 'mid-window',
          tier: 'economical-cloud',
          limits: { max_input_tokens: 20_000 },
        }),
        makeModel({
          id: 'wide-window',
          tier: 'frontier-cloud',
          limits: { max_input_tokens: 200_000 },
        }),
      ];

      const pipeline = new RouterPipeline(narrowFleet, {
        contextFitConfig: { safetyMargin: 0.95 },
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 18_000 }),
      );

      expect(decision.features?.candidates ?? []).toEqual([]);
      expect(decision.selected_model_id).toBe('mid-window');
    });
  });

  describe('context overflow fallback (SP-095)', () => {
    const overflowFleet: ModelProfile[] = [
      makeModel({
        id: 'gemini-flash-lite',
        tier: 'economical-cloud',
        provider: 'google',
        limits: { max_input_tokens: 32_768 },
        pricing: { fallback_cost_per_1m: 0.1 },
      }),
      makeModel({
        id: 'gpt-4o',
        tier: 'frontier-cloud',
        provider: 'openai',
        limits: { max_input_tokens: 128_000 },
        pricing: { fallback_cost_per_1m: 5.0 },
      }),
      makeModel({
        id: 'gemini-1.5-pro',
        tier: 'frontier-cloud',
        provider: 'google',
        limits: { max_input_tokens: 2_000_000 },
        pricing: { fallback_cost_per_1m: 3.0 },
      }),
    ];

    it('routes 1M token estimate to largest-window frontier model, not flash-lite', async () => {
      const pipeline = new RouterPipeline(overflowFleet);
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 1_000_000 }),
      );

      expect(decision.selected_model_id).toBe('gemini-1.5-pro');
      expect(decision.selected_model_id).not.toBe('gemini-flash-lite');
      expect(decision.reason_code).toBe('context_overflow_frontier_fallback');
      expect(decision.features?.candidates?.some(
        (candidate) =>
          candidate.model_id === 'gemini-flash-lite' &&
          candidate.rejected_reason === CONTEXT_FIT_EXCEEDED,
      )).toBe(true);
    });

    it('prefers same-provider largest-fit when pinned Gemini overflows', async () => {
      const geminiFleet: ModelProfile[] = [
        makeModel({
          id: 'gemini-flash',
          tier: 'economical-cloud',
          provider: 'google',
          limits: { max_input_tokens: 128_000 },
          pricing: { fallback_cost_per_1m: 0.5 },
        }),
        makeModel({
          id: 'gemini-pro',
          tier: 'economical-cloud',
          provider: 'google',
          limits: { max_input_tokens: 1_000_000 },
          pricing: { fallback_cost_per_1m: 1.0 },
        }),
        makeModel({
          id: 'claude-opus',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          limits: { max_input_tokens: 200_000 },
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
      ];
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'gemini-flash', 'initial');

      const pipeline = new RouterPipeline(geminiFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 500_000 }),
      );

      expect(decision.reason_code).toBe('context_overflow_same_provider_fallback');
      expect(decision.selected_model_id).toBe('gemini-pro');
    });

    it('returns context_overflow_no_fit instead of delegating undersized models', async () => {
      const tinyFleet: ModelProfile[] = [
        makeModel({
          id: 'small-econ',
          tier: 'economical-cloud',
          limits: { max_input_tokens: 32_768 },
        }),
        makeModel({
          id: 'small-frontier',
          tier: 'frontier-cloud',
          limits: { max_input_tokens: 128_000 },
        }),
      ];
      const pipeline = new RouterPipeline(tinyFleet);
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 1_000_000 }),
      );

      expect(decision.reason_code).toBe('context_overflow_no_fit');
      expect(decision.selected_model_id).toBe('unknown');
      expect(decision.selected_model_id).not.toBe('small-econ');
      expect(decision.selected_model_id).not.toBe('small-frontier');
      expect(decision.features?.candidates?.length).toBeGreaterThan(0);
    });
  });
});
