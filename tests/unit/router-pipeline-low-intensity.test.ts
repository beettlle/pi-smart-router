// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/pipeline/low-intensity-stage.ts tier gate (SP-103)
// and local-zero eligibility (SP-111) exercised via the pipeline.
import { describe, expect, it } from 'vitest';

import {
  HydraMatcher,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import type { ModelProfile } from '../../src/domain/types/index.js';
import {
  fleet,
  HARDWARE_CONFIG,
  LOCAL_TEST_CONFIG,
  makeClusterMatcher,
  makeModel,
  makeMockHydraProvider,
  makeRequest,
  makeSystemInfo,
  READY_FETCH,
  UNTRAINED_P_SUCCESS_WEIGHTS,
} from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('low_intensity tier gate (SP-103)', () => {
    it('sets zero-tier hint for high-confidence low_stakes cluster with full_local hardware', async () => {
      const lowStakesFleet: ModelProfile[] = [
        makeModel({ id: 'local-llama', tier: 'zero-tier' }),
        makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
        makeModel({ id: 'claude-opus', tier: 'frontier-cloud' }),
      ];

      const clusterMatcher = makeClusterMatcher({
        clusterId: 'low_stakes_general',
        tierBias: 'zero-tier',
        similarity: 0.92,
        margin: 0.12,
        confidence: 'high',
        elapsedMs: 2,
      });

      const pipeline = new RouterPipeline(lowStakesFleet, {
        clusterMatcher,
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: LOCAL_TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
        httpFetchPort: READY_FETCH,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Fix the typo in the README' }),
      );

      expect(decision.features?.tier_hint).toBe('zero-tier');
      expect(decision.features?.tier_hint_reason_code).toBe('cluster_low_stakes_general');
      expect(decision.features?.low_intensity_score).toBeGreaterThanOrEqual(0.65);
      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
    });

    it('leaves tier_hint null for ambiguous prompts in the defer band', async () => {
      const pipeline = new RouterPipeline(fleet, {
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.9,
          low_threshold: 0.1,
        },
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.tier_hint).toBeNull();
      expect(decision.features?.tier_hint_reason_code).toBeNull();
      expect(decision.features?.low_intensity_score).not.toBeNull();
      expect(decision.stage).toBe('fallback');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
    });

    it('attaches tier_hint fields on every routing decision', async () => {
      const clusterMatcher = makeClusterMatcher({
        clusterId: 'architecture',
        tierBias: 'frontier-cloud',
        similarity: 0.9,
        margin: 0.1,
        confidence: 'high',
        elapsedMs: 1,
      });

      const pipeline = new RouterPipeline(fleet, {
        clusterMatcher,
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          low_threshold: 0.55,
        },
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({
          prompt_text: 'Plan the architecture for a distributed payment service with migration strategy',
          turn_type: 'main_loop',
        }),
      );

      expect(decision.features).toMatchObject({
        tier_hint: 'frontier-cloud',
        tier_hint_reason_code: 'cluster_architecture',
        low_intensity_score: expect.any(Number),
      });
      expect(decision.stage).toBe('triage');
      expect(decision.tier).toBe('frontier-cloud');
    });

    it('constrains HyDRA fleet to economical tier when local is not ready', async () => {
      const requirements: RequirementVector = {
        reasoning: 0.2,
        code_gen: 0.2,
        tool_use: 0.2,
      };
      const hydraMatcher = new HydraMatcher(makeMockHydraProvider(requirements), {
        artifactCachePath: '.pi-smart-router/models/',
      });

      const clusterMatcher = makeClusterMatcher({
        clusterId: 'low_stakes_general',
        tierBias: 'zero-tier',
        similarity: 0.92,
        margin: 0.12,
        confidence: 'high',
        elapsedMs: 1,
      });

      const pipeline = new RouterPipeline(fleet, {
        hydraMatcher,
        clusterMatcher,
        lowIntensityConfig: DEFAULT_OPERATOR_CONFIG.low_intensity,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'what is 2+2 ?' }),
      );

      expect(decision.features?.tier_hint).toBe('economical-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('cluster_low_stakes_general');
      expect(decision.stage).toBe('hydra_match');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
    });

    it('uses structural reason code when cluster confidence is low', async () => {
      const clusterMatcher = makeClusterMatcher({
        clusterId: 'low_stakes_general',
        tierBias: 'zero-tier',
        similarity: 0.5,
        margin: 0.01,
        confidence: 'none',
        elapsedMs: 1,
      });

      const pipeline = new RouterPipeline(fleet, {
        clusterMatcher,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'what is 2+2 ?' }),
      );

      expect(decision.features?.tier_hint).toBe('economical-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('low_intensity_structural');
    });

    it('routes ambiguous low-stakes Q&A to local_zero when cluster and hardware are ready (SP-111)', async () => {
      const lowStakesFleet: ModelProfile[] = [
        makeModel({ id: 'local-llama', tier: 'zero-tier' }),
        makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
      ];

      const clusterMatcher = makeClusterMatcher({
        clusterId: 'low_stakes_general',
        tierBias: 'zero-tier',
        similarity: 0.92,
        margin: 0.12,
        confidence: 'high',
        elapsedMs: 2,
      });

      const pipeline = new RouterPipeline(lowStakesFleet, {
        clusterMatcher,
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: LOCAL_TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'what is 2+2 ?' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
      expect(decision.features?.local_eligible_reason).toBe('cluster_low_stakes_general');
    });

    it('emits triage_trivial local_eligible_reason for trivial keyword prompts (SP-111)', async () => {
      const lowStakesFleet: ModelProfile[] = [
        makeModel({ id: 'local-llama', tier: 'zero-tier' }),
        makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
      ];

      const pipeline = new RouterPipeline(lowStakesFleet, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: LOCAL_TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.features?.local_eligible_reason).toBe('triage_trivial');
    });

    it('does not route complex prompts to local even when phrasing is short (SP-111)', async () => {
      const pipeline = new RouterPipeline(fleet, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: LOCAL_TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'refactor auth layer' }),
      );

      expect(decision.stage).not.toBe('local_zero');
      expect(decision.tier).not.toBe('zero-tier');
      expect(decision.features?.local_eligible_reason).toBeNull();
    });
  });
});
