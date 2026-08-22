/**
 * Contract tests for routing JSON schemas.
 *
 * Validates sample payloads against the canonical JSON-schema contracts
 * AND against the Zod runtime schemas to ensure they stay in sync.
 *
 * Contract sources:
 *   - specs/001-build-smart-router/contracts/routing-request.schema.json
 * Release matrix: routing-request and routing-decision JSON schema contracts.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, beforeAll } from 'vitest';

import { RouterPipeline, PIPELINE_STAGE_ORDER } from '../../src/domain/pipeline/router-pipeline.js';
import {
  RoutingRequestSchema,
  RoutingDecisionSchema,
  RoutingStageSchema,
} from '../../src/domain/types/schemas.js';
import type { ModelProfile } from '../../src/domain/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const CONTRACTS = resolve(ROOT, 'specs/001-build-smart-router/contracts');

type ValidateFn = (data: unknown) => boolean;

/**
 * Create a JSON-schema validator for the given schema file.
 * Uses ajv/dist/2020 for draft 2020-12 support.
 * Handles ESM/CJS interop under NodeNext via dynamic import.
 */
async function compileValidator(schemaFile: string): Promise<ValidateFn> {
  const ajvMod = await import('ajv/dist/2020.js');
  const formatsMod = await import('ajv-formats');
  const AjvCtor = (ajvMod as Record<string, unknown>).default ?? ajvMod;
  const addFmts = (formatsMod as Record<string, unknown>).default ?? formatsMod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ajv = new (AjvCtor as any)({ strict: false, allErrors: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (addFmts as any)(ajv);
  const schema = loadJsonSchema(schemaFile);
  return ajv.compile(schema) as ValidateFn;
}

function loadJsonSchema(filename: string): Record<string, unknown> {
  const raw = readFileSync(resolve(CONTRACTS, filename), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Decision stages = full PIPELINE_STAGE_ORDER + 'fallback' degradation marker (SP-229, #136). */
const EXPECTED_DECISION_STAGES = [...PIPELINE_STAGE_ORDER, 'fallback'] as const;

function validRoutingRequest(): Record<string, unknown> {
  return {
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    session_id: 'sess-abc-123',
    prompt_text: 'Refactor the auth module to use JWT tokens',
  };
}

function fullRoutingRequest(): Record<string, unknown> {
  return {
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    session_id: 'sess-abc-123',
    prompt_text: 'Implement caching layer for database queries',
    messages: [
      { role: 'user', content: 'Add Redis caching' },
      { role: 'assistant', content: 'I will add a caching layer.' },
      { role: 'tool', content: '{"result": "ok"}', tool_call_id: 'tc-1' },
    ],
    turn_type: 'tool_result',
    compaction_flag: false,
    force_model_id: 'gpt-4o',
    estimated_input_tokens: 2048,
  };
}

function liveFeatureSidecar(): Record<string, unknown> {
  return {
    triage: { verdict: 'complex', reason_code: 'code_fence', cyclomatic_score: 3 },
    requirements: { reasoning: 0.8, code_gen: 0.9, tool_use: 0.4 },
    candidates: [
      { model_id: 'claude-sonnet-4-20250514', score: 0.95, shortfall: 0, rejected_reason: null },
    ],
    tier_hint: 'frontier-cloud',
    tier_hint_reason_code: 'low_intensity_high',
    low_intensity_score: 0.12,
    p_success_cheap: 0.31,
    p_success_raw: 0.33,
    p_success_calibrated: 0.3,
    p_success_alpha: 0.5,
    context_fit: {
      estimated_input_tokens: 2048,
      context_fit_viable_count: 2,
      context_fit_rejected_json: null,
      context_overflow_pin_break: false,
      selected_model_max_input_tokens: 200000,
      context_fit_reason_code: null,
    },
    tier_selection: {
      cluster_id: null,
      cluster_similarity: null,
      cluster_margin: null,
      low_intensity_score: 0.12,
      tier_hint: 'frontier-cloud',
      p_success_cheap: 0.31,
      local_eligible_reason: null,
      tier_selection_reason_code: 'expected_cost_frontier',
      cluster_match_table: [
        {
          cluster_id: 'deep_debug',
          tier_bias: 'frontier-cloud',
          similarity: 0.87,
          margin: 0.12,
          confidence: 'high',
          selected: true,
        },
      ],
      tier_feature_summary: {
        triage_verdict: 'complex',
        triage_reason_code: 'code_fence',
        cyclomatic_score: 3,
        requirement_reasoning: 0.8,
        requirement_code_gen: 0.9,
        requirement_tool_use: 0.4,
      },
      low_intensity_breakdown: {
        score: 0.12,
        tier_hint: 'frontier-cloud',
        tier_hint_reason_code: 'low_intensity_high',
        tier_selection_reason_code: 'expected_cost_frontier',
        p_success_cheap: 0.31,
        p_success_raw: 0.33,
        p_success_calibrated: 0.3,
        p_success_alpha: 0.5,
        rejected_tiers: [
          {
            tier: 'economical-cloud',
            expected_cost_usd: 0.001,
            adjusted_expected_cost_usd: 0.0012,
            reason: 'capability_shortfall',
          },
        ],
      },
      local_zero_skip_reasons: ['tool_use_requirement_above_ceiling'],
    },
    breakeven: {
      marginal_savings: null,
      future_cache_value: null,
      cache_reprime_cost: null,
      decision: null,
      breakeven_reason_code: null,
    },
    saar: {
      buffer_active: false,
      hard_lock: true,
      turn_index_in_session: 4,
      planning_turn_buffer: 2,
      idle_timeout_seconds: 300,
      saar_reason_code: null,
    },
    planning_delegate: {
      path: 'direct',
      primary_model_id: 'claude-sonnet-4-20250514',
      delegate_model_id: null,
      compressed_context: {
        max_messages: 12,
        max_tokens: 16384,
        exclude_execution_history: true,
      },
      planning_delegate_reason_code: 'planning_direct_frontier',
      fallback_reason: null,
      workers_spawned: null,
      workers_succeeded: null,
      worker_timeout_count: null,
    },
    local_eligible_reason: null,
    route_path: 'neural',
    route_path_confidence: null,
    prewarm_attempted: false,
    prewarm_accepted: null,
    prewarm_disabled_reason: 'low_acceptance_rate',
  };
}

function validRoutingDecision(): Record<string, unknown> {
  return {
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    selected_model_id: 'claude-sonnet-4-20250514',
    tier: 'frontier-cloud',
    stage: 'hydra_match',
    reason_code: 'capability_fit',
    routing_latency_ms: 12.5,
    pin_reason: null,
  };
}

function fullRoutingDecision(): Record<string, unknown> {
  return {
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    selected_model_id: 'claude-sonnet-4-20250514',
    tier: 'frontier-cloud',
    stage: 'hydra_match',
    reason_code: 'capability_fit',
    candidates: [
      { model_id: 'claude-sonnet-4-20250514', score: 0.95, shortfall: 0, rejected_reason: null },
      { model_id: 'gpt-4o-mini', score: 0.72, shortfall: 0.15, rejected_reason: 'below_threshold' },
    ],
    estimated_cost_usd: 0.0032,
    routing_latency_ms: 12.5,
    pin_reason: 'initial',
  };
}

// ─── Test suites ─────────────────────────────────────────────────────────────

describe('@release', () => {
describe('routing-request.schema.json', () => {
  let validate: ValidateFn;

  beforeAll(async () => {
    validate = await compileValidator('routing-request.schema.json');
  });

  describe('valid payloads', () => {
    it('accepts a minimal request (required fields only)', () => {
      const payload = validRoutingRequest();
      const jsonValid = validate(payload);
      expect(jsonValid).toBe(true);

      const zodResult = RoutingRequestSchema.safeParse(payload);
      expect(zodResult.success).toBe(true);
    });

    it('accepts a full request with all optional fields', () => {
      const payload = fullRoutingRequest();
      const jsonValid = validate(payload);
      expect(jsonValid).toBe(true);

      const zodResult = RoutingRequestSchema.safeParse(payload);
      expect(zodResult.success).toBe(true);
    });

    it('accepts each valid turn_type value', () => {
      const turnTypes = ['planning', 'tool_result', 'subagent', 'main_loop', 'unknown'];
      for (const tt of turnTypes) {
        const payload = { ...validRoutingRequest(), turn_type: tt };
        expect(validate(payload)).toBe(true);
        expect(RoutingRequestSchema.safeParse(payload).success).toBe(true);
      }
    });

    it('accepts messages with tool_calls array', () => {
      const payload = {
        ...validRoutingRequest(),
        messages: [
          {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read', arguments: '{}' } }],
          },
        ],
      };
      expect(validate(payload)).toBe(true);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(true);
    });
  });

  describe('invalid payloads', () => {
    it('rejects missing request_id', () => {
      const payload = { ...validRoutingRequest() };
      delete (payload as { request_id?: string }).request_id;
      expect(validate(payload)).toBe(false);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects missing session_id', () => {
      const payload = { ...validRoutingRequest() };
      delete (payload as { session_id?: string }).session_id;
      expect(validate(payload)).toBe(false);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects missing prompt_text', () => {
      const payload = { ...validRoutingRequest() };
      delete (payload as { prompt_text?: string }).prompt_text;
      expect(validate(payload)).toBe(false);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects empty session_id', () => {
      const payload = { ...validRoutingRequest(), session_id: '' };
      expect(validate(payload)).toBe(false);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects non-uuid request_id', () => {
      const payload = { ...validRoutingRequest(), request_id: 'not-a-uuid' };
      expect(validate(payload)).toBe(false);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects invalid turn_type', () => {
      const payload = { ...validRoutingRequest(), turn_type: 'invalid_type' };
      expect(validate(payload)).toBe(false);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects negative estimated_input_tokens', () => {
      const payload = { ...validRoutingRequest(), estimated_input_tokens: -1 };
      expect(validate(payload)).toBe(false);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects additional properties', () => {
      const payload = { ...validRoutingRequest(), rogue_field: 'surprise' };
      expect(validate(payload)).toBe(false);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects unknown keys inside messages (strict Zod + JSON schema)', () => {
      const payload = {
        ...validRoutingRequest(),
        messages: [{ role: 'user', content: 'hi', rogue: true }],
      };
      expect(validate(payload)).toBe(false);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects invalid message role', () => {
      const payload = {
        ...validRoutingRequest(),
        messages: [{ role: 'moderator', content: 'hi' }],
      };
      expect(validate(payload)).toBe(false);
      expect(RoutingRequestSchema.safeParse(payload).success).toBe(false);
    });
  });
});

describe('routing-decision.schema.json', () => {
  let validate: ValidateFn;

  beforeAll(async () => {
    validate = await compileValidator('routing-decision.schema.json');
  });

  describe('valid payloads', () => {
    it('accepts a minimal decision (required fields only)', () => {
      const payload = validRoutingDecision();
      const jsonValid = validate(payload);
      expect(jsonValid).toBe(true);

      const zodResult = RoutingDecisionSchema.safeParse(payload);
      expect(zodResult.success).toBe(true);
    });

    it('accepts a full decision with all optional fields', () => {
      const payload = fullRoutingDecision();
      const jsonValid = validate(payload);
      expect(jsonValid).toBe(true);

      const zodResult = RoutingDecisionSchema.safeParse(payload);
      expect(zodResult.success).toBe(true);
    });

    it('accepts each valid tier value', () => {
      const tiers = ['zero-tier', 'economical-cloud', 'frontier-cloud'];
      for (const t of tiers) {
        const payload = { ...validRoutingDecision(), tier: t };
        expect(validate(payload)).toBe(true);
        expect(RoutingDecisionSchema.safeParse(payload).success).toBe(true);
      }
    });

    it('accepts each valid stage value (full PIPELINE_STAGE_ORDER + fallback)', () => {
      for (const s of EXPECTED_DECISION_STAGES) {
        const payload = { ...validRoutingDecision(), stage: s };
        expect(validate(payload)).toBe(true);
        expect(RoutingDecisionSchema.safeParse(payload).success).toBe(true);
      }
    });

    it('accepts a decision carrying the live features sidecar', () => {
      const payload = { ...fullRoutingDecision(), features: liveFeatureSidecar() };
      expect(validate(payload)).toBe(true);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(true);
    });

    it('accepts null pin_reason', () => {
      const payload = { ...validRoutingDecision(), pin_reason: null };
      expect(validate(payload)).toBe(true);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(true);
    });

    it('accepts each valid pin_reason enum value', () => {
      const reasons = ['initial', 'user_forced', 'loop_escalation', 'compaction', 'cache_economics', 'context_overflow'];
      for (const r of reasons) {
        const payload = { ...validRoutingDecision(), pin_reason: r };
        expect(validate(payload)).toBe(true);
        expect(RoutingDecisionSchema.safeParse(payload).success).toBe(true);
      }
    });

    it('accepts decision with empty candidates array', () => {
      const payload = { ...validRoutingDecision(), candidates: [] };
      expect(validate(payload)).toBe(true);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(true);
    });
  });

  describe('invalid payloads', () => {
    it('rejects missing required fields', () => {
      const required = ['request_id', 'selected_model_id', 'tier', 'stage', 'reason_code', 'routing_latency_ms'];
      for (const field of required) {
        const payload = { ...validRoutingDecision() };
        delete payload[field];
        expect(validate(payload)).toBe(false);
        expect(RoutingDecisionSchema.safeParse(payload).success).toBe(false);
      }
    });

    it('rejects non-uuid request_id', () => {
      const payload = { ...validRoutingDecision(), request_id: 'bad-id' };
      expect(validate(payload)).toBe(false);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects invalid tier', () => {
      const payload = { ...validRoutingDecision(), tier: 'mega-tier' };
      expect(validate(payload)).toBe(false);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects invalid stage', () => {
      const payload = { ...validRoutingDecision(), stage: 'warp_drive' };
      expect(validate(payload)).toBe(false);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects negative routing_latency_ms', () => {
      const payload = { ...validRoutingDecision(), routing_latency_ms: -5 };
      expect(validate(payload)).toBe(false);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects negative estimated_cost_usd', () => {
      const payload = { ...validRoutingDecision(), estimated_cost_usd: -0.01 };
      expect(validate(payload)).toBe(false);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects additional properties', () => {
      const payload = { ...validRoutingDecision(), extra_field: true };
      expect(validate(payload)).toBe(false);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects unknown keys inside the features sidecar', () => {
      const payload = {
        ...validRoutingDecision(),
        features: { ...liveFeatureSidecar(), rogue_feature: 1 },
      };
      expect(validate(payload)).toBe(false);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects invalid pin_reason enum value', () => {
      const payload = { ...validRoutingDecision(), pin_reason: 'magic' };
      expect(validate(payload)).toBe(false);
      expect(RoutingDecisionSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects candidate missing required score', () => {
      const payload = {
        ...validRoutingDecision(),
        candidates: [{ model_id: 'test-model' }],
      };
      expect(validate(payload)).toBe(false);
    });
  });
});

describe('schema cross-validation', () => {
  it('Zod RoutingRequestSchema and JSON schema agree on a valid minimal payload', async () => {
    const validate = await compileValidator('routing-request.schema.json');
    const payload = validRoutingRequest();
    expect(validate(payload)).toBe(true);
    expect(RoutingRequestSchema.safeParse(payload).success).toBe(true);
  });

  it('Zod RoutingDecisionSchema and JSON schema agree on a valid full payload', async () => {
    const validate = await compileValidator('routing-decision.schema.json');
    const payload = fullRoutingDecision();
    expect(validate(payload)).toBe(true);
    expect(RoutingDecisionSchema.safeParse(payload).success).toBe(true);
  });

  it('both schemas reject a completely empty object', async () => {
    const validateReq = await compileValidator('routing-request.schema.json');
    const validateDec = await compileValidator('routing-decision.schema.json');
    const empty = {};
    expect(validateReq(empty)).toBe(false);
    expect(validateDec(empty)).toBe(false);
    expect(RoutingRequestSchema.safeParse(empty).success).toBe(false);
    expect(RoutingDecisionSchema.safeParse(empty).success).toBe(false);
  });
});

describe('stage enum sync guard (SP-229, #136)', () => {
  it('Zod RoutingStageSchema covers PIPELINE_STAGE_ORDER + fallback', () => {
    expect([...RoutingStageSchema.options].sort()).toEqual(
      [...EXPECTED_DECISION_STAGES].sort(),
    );
  });

  it('routing-decision.schema.json stage enum covers PIPELINE_STAGE_ORDER + fallback', () => {
    const schema = loadJsonSchema('routing-decision.schema.json');
    const stageEnum = (
      schema.properties as Record<string, { enum: string[] }>
    )['stage']!.enum;
    expect([...stageEnum].sort()).toEqual([...EXPECTED_DECISION_STAGES].sort());
  });
});

describe('live RouterPipeline.route() round-trip (SP-229, #136)', () => {
  function makeLiveModel(
    overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
  ): ModelProfile {
    return {
      provider: 'test',
      capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
      pricing: { fallback_cost_per_1m: 1.0 },
      ...overrides,
    };
  }

  it('live route() decision validates against JSON Schema and strict Zod', async () => {
    const validate = await compileValidator('routing-decision.schema.json');
    const fleet = [
      makeLiveModel({ id: 'econ-1', tier: 'economical-cloud' }),
      makeLiveModel({ id: 'frontier-1', tier: 'frontier-cloud' }),
    ];
    const pipeline = new RouterPipeline(fleet);

    const decision = await pipeline.route({
      request_id: '550e8400-e29b-41d4-a716-446655440000',
      session_id: 'sess-contract-live',
      prompt_text: 'Refactor the auth module to use JWT tokens',
    });

    // Simulate the wire: JSON round-trip strips functions/undefined.
    const wire: unknown = JSON.parse(JSON.stringify(decision));

    // Live decisions always carry the features sidecar (SP-057 attachFeatures).
    expect(decision.features).toBeDefined();
    expect(EXPECTED_DECISION_STAGES).toContain(decision.stage);

    expect(validate(wire)).toBe(true);

    const zodResult = RoutingDecisionSchema.safeParse(wire);
    expect(zodResult.success).toBe(true);
  });
});
});
