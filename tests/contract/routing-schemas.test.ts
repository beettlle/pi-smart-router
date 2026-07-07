/**
 * Contract tests for routing JSON schemas.
 *
 * Validates sample payloads against the canonical JSON-schema contracts
 * AND against the Zod runtime schemas to ensure they stay in sync.
 *
 * Contract sources:
 *   - specs/001-build-smart-router/contracts/routing-request.schema.json
 *   - specs/001-build-smart-router/contracts/routing-decision.schema.json
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, beforeAll } from 'vitest';

import {
  RoutingRequestSchema,
  RoutingDecisionSchema,
} from '../../src/domain/types/schemas.js';

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

    it('accepts each valid stage value', () => {
      const stages = ['triage', 'turn_envelope', 'session_pin', 'local_zero', 'hydra_match', 'fallback'];
      for (const s of stages) {
        const payload = { ...validRoutingDecision(), stage: s };
        expect(validate(payload)).toBe(true);
        expect(RoutingDecisionSchema.safeParse(payload).success).toBe(true);
      }
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
