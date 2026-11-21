// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/pipeline/low-intensity-stage.ts tier gate (SP-103)
// and local-zero eligibility (SP-111) exercised via the pipeline.
import { describe, expect, it } from 'vitest';

import {
  HydraMatcher,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { createLowIntensityStage } from '../../src/domain/pipeline/low-intensity-stage.js';
import { createRoutingContext } from '../../src/domain/pipeline/pipeline-stage.js';
import type { TypedJudgment } from '../../src/domain/judgment/index.js';
import {
  DEFAULT_OPERATOR_CONFIG,
  DEFAULT_TYPED_JUDGMENT_CONFIG,
} from '../../src/config/defaults.js';
import type {
  ModelProfile,
  RoutingRequest,
} from '../../src/domain/types/index.js';
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

describe('low_intensity typed-judgment capability hints (SP-326)', () => {
  function makeJudgment(
    capabilityDeserved: number | null,
    confidence = 0.9,
  ): TypedJudgment {
    return {
      taskKind: null,
      taskKindConfidence: null,
      capabilityDeserved,
      deepReasoningP: null,
      codeGen: null,
      toolUse: null,
      destructiveP: null,
      confidences:
        capabilityDeserved === null
          ? {}
          : { capability_deserved: confidence },
    };
  }

  async function runCapabilityJudgment(
    capabilityDeserved: number | null,
    confidence = 0.9,
    overrides: {
      models?: readonly ModelProfile[];
      request?: RoutingRequest;
      lowThreshold?: number;
      highThreshold?: number;
    } = {},
  ) {
    const models = overrides.models ?? fleet;
    const context = createRoutingContext({
      request:
        overrides.request ??
        makeRequest({
          prompt_text: 'Hello, how are you today?',
          turn_type: 'main_loop',
        }),
      options: {
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          low_threshold: overrides.lowThreshold ?? -1,
          high_threshold: overrides.highThreshold ?? 2,
        },
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
        typedJudgmentConfig: {
          ...DEFAULT_TYPED_JUDGMENT_CONFIG,
          enabled: true,
        },
      },
      fleet: models,
    });
    context.typedJudgment = makeJudgment(capabilityDeserved, confidence);
    await createLowIntensityStage().run(context);
    return context;
  }

  it('maps Minimal to zero-tier and High to frontier-cloud with typed reason codes', async () => {
    const minimal = await runCapabilityJudgment(0, 0.9, {
      lowThreshold: 2,
      highThreshold: 3,
    });
    const high = await runCapabilityJudgment(2 / 3, 0.9);

    expect(minimal.tierHint).toBe('zero-tier');
    expect(minimal.tierHintReasonCode).toBe(
      'typed_judgment_tier_zero-tier',
    );
    expect(high.tierHint).toBe('frontier-cloud');
    expect(high.tierHintReasonCode).toBe(
      'typed_judgment_tier_frontier-cloud',
    );
  });

  it('maps Standard to economical-cloud and excludes zero-tier and flash-class models', async () => {
    const models = [
      makeModel({
        id: 'local-capable',
        tier: 'zero-tier',
        capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
      }),
      makeModel({
        id: 'gpt-mini',
        tier: 'economical-cloud',
        capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
      }),
      makeModel({
        id: 'econ-standard',
        tier: 'economical-cloud',
        capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
      }),
      makeModel({
        id: 'frontier-capable',
        tier: 'frontier-cloud',
        capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
      }),
    ];

    const context = await runCapabilityJudgment(1 / 3, 0.9, { models });

    expect(context.tierHint).toBe('economical-cloud');
    expect(context.tierHintReasonCode).toBe(
      'typed_judgment_tier_economical-cloud',
    );
    expect(context.fleet.map((model) => model.id)).toEqual([
      'econ-standard',
      'frontier-capable',
    ]);
  });

  it.each([0, 1 / 3])(
    'never lets low-confidence capability %s lower a frontier structural hint',
    async (capabilityDeserved) => {
      const context = await runCapabilityJudgment(
        capabilityDeserved,
        0.2,
        { lowThreshold: 2, highThreshold: 3 },
      );

      expect(context.tierHint).toBe('frontier-cloud');
      expect(context.tierHintReasonCode).toBe('high_intensity_structural');
    },
  );

  it('allows low-confidence capability to raise an economical structural hint', async () => {
    const context = await runCapabilityJudgment(2 / 3, 0.2, {
      lowThreshold: -1,
      highThreshold: 0,
    });

    expect(context.tierHint).toBe('frontier-cloud');
    expect(context.tierHintReasonCode).toBe(
      'typed_judgment_tier_frontier-cloud',
    );
  });

  it('never lets Minimal lower the SP-323 deep-session capability floor', async () => {
    const flash = makeModel({
      id: 'glm-flash',
      tier: 'economical-cloud',
      capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 },
    });
    const capablePeer = makeModel({
      id: 'glm-standard',
      tier: 'economical-cloud',
      capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
    });
    const context = await runCapabilityJudgment(0, 0.95, {
      models: [flash, capablePeer],
      request: makeRequest({
        turn_type: 'main_loop',
        estimated_input_tokens: 100_001,
      }),
    });

    expect(context.tierHint).toBe('frontier-cloud');
    expect(context.tierHintReasonCode).toBe(
      'typed_judgment_tier_frontier-cloud',
    );
  });

  it('preserves prior structural behavior when capability judgment is null', async () => {
    const context = await runCapabilityJudgment(null, 0.9, {
      lowThreshold: 2,
      highThreshold: 3,
    });

    expect(context.tierHint).toBe('frontier-cloud');
    expect(context.tierHintReasonCode).toBe('high_intensity_structural');
  });
});
