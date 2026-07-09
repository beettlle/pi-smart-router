import { describe, expect, it } from 'vitest';

import type { RoutingFeatureSidecar, RoutingTelemetry } from '../../src/domain/types/index.js';
import {
  COMMUNITY_TELEMETRY_ENABLED_ENV,
  formatCommunityTelemetryJsonl,
  formatHydraCalibrationJsonl,
  hashSessionIdForTelemetryExport,
  isCommunityTelemetryExportEnabled,
  isHydraMatchTelemetry,
  scrubTelemetryExportObject,
  selectHydraMatchTelemetry,
  toCommunityTelemetryRecord,
  toHydraCalibrationRecord,
} from '../../src/infra/telemetry.js';
import { DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS, DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS, DEFAULT_BREAKEVEN_TELEMETRY_FIELDS, DEFAULT_SAAR_TELEMETRY_FIELDS } from '../../src/infrastructure/telemetry/routing-telemetry.js';

function makeTelemetry(overrides?: Partial<RoutingTelemetry>): RoutingTelemetry {
  return {
    timestamp: '2026-07-05T12:00:00.000Z',
    session_id: 'sess-secret',
    request_id: 'req-secret',
    turn_type: 'main_loop',
    stage: 'hydra_match',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'gpt-4o-mini',
    estimated_cost_usd: 0.001,
    routing_latency_ms: 12,
    pin_reason: null,
    ...DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
    ...DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
    ...DEFAULT_BREAKEVEN_TELEMETRY_FIELDS,
    ...DEFAULT_SAAR_TELEMETRY_FIELDS,
    ...overrides,
  };
}

describe('community telemetry export (SP-082)', () => {
  it('is opt-in via SMART_ROUTER_COMMUNITY_TELEMETRY=1', () => {
    const previous = process.env[COMMUNITY_TELEMETRY_ENABLED_ENV];
    try {
      delete process.env[COMMUNITY_TELEMETRY_ENABLED_ENV];
      expect(isCommunityTelemetryExportEnabled()).toBe(false);

      process.env[COMMUNITY_TELEMETRY_ENABLED_ENV] = '1';
      expect(isCommunityTelemetryExportEnabled()).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env[COMMUNITY_TELEMETRY_ENABLED_ENV];
      } else {
        process.env[COMMUNITY_TELEMETRY_ENABLED_ENV] = previous;
      }
    }
  });

  it('hashes session_id and omits request_id from community export', () => {
    const exported = toCommunityTelemetryRecord(makeTelemetry());

    expect(exported).not.toHaveProperty('session_id');
    expect(exported).not.toHaveProperty('request_id');
    expect(exported.session_id_hash).toBe(hashSessionIdForTelemetryExport('sess-secret'));
    expect(exported.session_id_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(exported.stage).toBe('hydra_match');
    expect(exported.selected_model_id).toBe('gpt-4o-mini');
  });

  it('formats community JSONL without prompt or session identifiers', () => {
    const jsonl = formatCommunityTelemetryJsonl([
      makeTelemetry({ request_id: 'req-a' }),
      makeTelemetry({ request_id: 'req-b', stage: 'fallback' }),
    ]);

    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]!) as Record<string, unknown>;
    const second = JSON.parse(lines[1]!) as Record<string, unknown>;

    expect(first).not.toHaveProperty('session_id');
    expect(first).not.toHaveProperty('request_id');
    expect(second.stage).toBe('fallback');
    expect(jsonl).not.toContain('sess-secret');
    expect(jsonl).not.toContain('req-a');
  });

  it('selects hydra_match rows for calibration export', () => {
    const records = [
      makeTelemetry({ request_id: 'req-hydra', stage: 'hydra_match' }),
      makeTelemetry({ request_id: 'req-fallback', stage: 'fallback' }),
    ];

    expect(isHydraMatchTelemetry(records[0]!)).toBe(true);
    expect(selectHydraMatchTelemetry(records)).toHaveLength(1);
    expect(selectHydraMatchTelemetry(records)[0]?.request_id).toBe('req-hydra');
  });

  it('maps hydra calibration rows with requirement vectors and top candidate', () => {
    const features: RoutingFeatureSidecar = {
      triage: null,
      requirements: {
        reasoning: 0.8,
        code_gen: 0.6,
        tool_use: 0.2,
      },
      candidates: [
        {
          model_id: 'gpt-4o-mini',
          score: 0.91,
          shortfall: 0,
          rejected_reason: null,
        },
        {
          model_id: 'gpt-4o',
          score: 0.95,
          shortfall: 0,
          rejected_reason: null,
        },
      ],
      tier_hint: null,
      tier_hint_reason_code: null,
      low_intensity_score: null,
      p_success_cheap: null,
      p_success_alpha: null,
      local_eligible_reason: null,
    };

    const exported = toHydraCalibrationRecord(makeTelemetry(), features);

    expect(exported).not.toHaveProperty('session_id');
    expect(exported).not.toHaveProperty('request_id');
    expect(exported.requirement_reasoning).toBe(0.8);
    expect(exported.requirement_code_gen).toBe(0.6);
    expect(exported.requirement_tool_use).toBe(0.2);
    expect(exported.top_candidate_model_id).toBe('gpt-4o');
    expect(exported.top_candidate_score).toBe(0.95);
  });

  it('formats hydra calibration JSONL using optional feature sidecars', () => {
    const features = new Map<string, RoutingFeatureSidecar>([
      [
        'req-hydra',
        {
          triage: null,
          requirements: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
          candidates: null,
          tier_hint: null,
          tier_hint_reason_code: null,
          low_intensity_score: null,
          p_success_cheap: null,
          p_success_alpha: null,
          local_eligible_reason: null,
        },
      ],
    ]);

    const jsonl = formatHydraCalibrationJsonl(
      [
        makeTelemetry({ request_id: 'req-hydra', stage: 'hydra_match' }),
        makeTelemetry({ request_id: 'req-skip', stage: 'session_pin' }),
      ],
      features,
    );

    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.requirement_reasoning).toBe(0.5);
    expect(parsed).not.toHaveProperty('request_id');
    expect(jsonl).not.toContain('sess-secret');
  });

  it('scrubs forbidden keys from loose export objects', () => {
    const scrubbed = scrubTelemetryExportObject({
      session_id: 'sess-secret',
      request_id: 'req-secret',
      prompt_text: 'never export',
      stage: 'hydra_match',
      selected_model_id: 'gpt-4o-mini',
    });

    expect(scrubbed).not.toHaveProperty('session_id');
    expect(scrubbed).not.toHaveProperty('request_id');
    expect(scrubbed).not.toHaveProperty('prompt_text');
    expect(scrubbed.stage).toBe('hydra_match');
  });
});
