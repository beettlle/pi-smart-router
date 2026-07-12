import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeTwinRouterBenchOverRouting,
  ARCHIVED_OVER_ROUTING_RATE_MAX,
  buildOverRoutingAnalysis,
  collectOverRoutingSteps,
  formatOverRoutingAnalysisJson,
  formatOverRoutingAnalysisText,
  OVERROUTING_ANALYSIS_VERSION,
} from '../../scripts/eval/analyze-twinrouterbench-overrouting.js';
import {
  EVAL_FIXTURE_SCHEMA_VERSION,
  type EvalTraceFixture,
  type FrozenCatalog,
} from '../../scripts/eval/fixture-schema.js';

const CI_SUBSET_PATH = join('tests', 'eval', 'corpus', 'twinrouterbench', 'ci-subset.json');

const FIXTURE_CATALOG: FrozenCatalog = {
  catalog_id: 'pi-smart-router-v0.5.0-eval',
  checkpoint_date: '2026-07-01',
  models: [
    {
      model_id: 'ollama/llama3.2:3b',
      tier: 'zero-tier',
      cost_per_1m_input_usd: 0,
    },
    {
      model_id: 'gpt-4o-mini',
      tier: 'economical-cloud',
      cost_per_1m_input_usd: 0.15,
    },
    {
      model_id: 'claude-sonnet-4',
      tier: 'frontier-cloud',
      cost_per_1m_input_usd: 3,
    },
  ],
};

function makeFixture(overrides: {
  fixture_id: string;
  min_tier: 'zero-tier' | 'economical-cloud' | 'frontier-cloud';
  selected_tier: 'zero-tier' | 'economical-cloud' | 'frontier-cloud';
  reason_code: string;
  stage: string;
}): EvalTraceFixture {
  const minModel =
    overrides.min_tier === 'zero-tier'
      ? 'ollama/llama3.2:3b'
      : overrides.min_tier === 'economical-cloud'
        ? 'gpt-4o-mini'
        : 'claude-sonnet-4';
  const selectedModel =
    overrides.selected_tier === 'zero-tier'
      ? 'ollama/llama3.2:3b'
      : overrides.selected_tier === 'economical-cloud'
        ? 'gpt-4o-mini'
        : 'claude-sonnet-4';

  return {
    schema_version: EVAL_FIXTURE_SCHEMA_VERSION,
    fixture_id: overrides.fixture_id,
    frozen_catalog: FIXTURE_CATALOG,
    session: {
      session_id_hash: `hash-${overrides.fixture_id}`.padEnd(16, '0'),
      steps: [
        {
          step_index: 0,
          turn_type: overrides.stage,
          prefix_hash: `prefix-${overrides.fixture_id}`.padEnd(16, '0'),
          prefix_token_estimate: 100,
          actual: {
            tier: overrides.selected_tier,
            model_id: selectedModel,
            cost_usd: 0.001,
            reason_code: overrides.reason_code,
          },
          step_outcome: {
            success: true,
            min_tier: overrides.min_tier,
            min_model_id: minModel,
            verified_tool_progression: true,
          },
        },
      ],
    },
    outcome: {
      task_success: true,
      final_turn_index: 0,
    },
  };
}

describe('analyze-twinrouterbench-overrouting (SP-202)', () => {
  it('aggregates deterministic fixture over-routing by stage / reason / tiers', () => {
    const fixtures = [
      makeFixture({
        fixture_id: 'over-main',
        min_tier: 'zero-tier',
        selected_tier: 'economical-cloud',
        reason_code: 'downgrade_first_candidate',
        stage: 'main_loop',
      }),
      makeFixture({
        fixture_id: 'over-tool',
        min_tier: 'zero-tier',
        selected_tier: 'economical-cloud',
        reason_code: 'downgrade_first_candidate',
        stage: 'tool_result',
      }),
      makeFixture({
        fixture_id: 'ok-match',
        min_tier: 'economical-cloud',
        selected_tier: 'economical-cloud',
        reason_code: 'twinrouterbench_baseline',
        stage: 'main_loop',
      }),
    ];

    const analysis = buildOverRoutingAnalysis(fixtures, {
      corpusPath: 'fixture://unit',
    });
    const json = formatOverRoutingAnalysisJson(analysis);

    expect(json.analysis_version).toBe(OVERROUTING_ANALYSIS_VERSION);
    expect(json.source).toBe('twinrouterbench');
    expect(json.offline).toBe(true);

    const soft = json.soft_report as {
      step_count: number;
      over_routing_steps: number;
      step_over_routing_rate: number;
      mean_over_routing_rate: number;
      absolute_max: number;
      exceeds_absolute_max: boolean;
      fixture_count: number;
    };

    expect(soft.fixture_count).toBe(3);
    expect(soft.step_count).toBe(3);
    expect(soft.over_routing_steps).toBe(2);
    expect(soft.step_over_routing_rate).toBeCloseTo(2 / 3, 6);
    expect(soft.absolute_max).toBe(ARCHIVED_OVER_ROUTING_RATE_MAX);
    expect(soft.mean_over_routing_rate).toBeCloseTo(2 / 3, 6);
    expect(soft.exceeds_absolute_max).toBe(true);

    expect(json.by_reason_code).toEqual([
      {
        key: 'downgrade_first_candidate',
        count: 2,
        share_of_over_routing: 1,
      },
    ]);
    expect(json.by_min_tier).toEqual([
      { key: 'zero-tier', count: 2, share_of_over_routing: 1 },
    ]);
    expect(json.by_selected_tier).toEqual([
      { key: 'economical-cloud', count: 2, share_of_over_routing: 1 },
    ]);
    expect(json.by_min_to_selected).toEqual([
      {
        key: 'zero-tier->economical-cloud',
        count: 2,
        share_of_over_routing: 1,
      },
    ]);
    expect(json.by_stage).toEqual([
      { key: 'main_loop', count: 1, share_of_over_routing: 0.5 },
      { key: 'tool_result', count: 1, share_of_over_routing: 0.5 },
    ]);

    const rows = collectOverRoutingSteps(fixtures);
    expect(rows.filter((r) => r.over_routed)).toHaveLength(2);
  });

  it('reproduces CI corpus soft-report archive numbers', () => {
    const analysis = analyzeTwinRouterBenchOverRouting({ corpusPath: CI_SUBSET_PATH });
    const json = formatOverRoutingAnalysisJson(analysis);
    const soft = json.soft_report as {
      mean_over_routing_rate: number;
      over_routing_steps: number;
      step_count: number;
      exceeds_absolute_max: boolean;
    };

    // Archived HEAD soft-report (npm run routing:assert-release-gates:corpus-report).
    expect(soft.mean_over_routing_rate).toBe(0.868056);
    expect(soft.exceeds_absolute_max).toBe(true);
    expect(soft.step_count).toBe(148);
    expect(soft.over_routing_steps).toBe(100);

    expect(json.by_reason_code).toEqual([
      {
        key: 'downgrade_first_candidate',
        count: 100,
        share_of_over_routing: 1,
      },
    ]);
    expect(json.by_min_to_selected).toEqual([
      {
        key: 'zero-tier->economical-cloud',
        count: 100,
        share_of_over_routing: 1,
      },
    ]);
    expect((json.by_benchmark_source as unknown[]).length).toBeGreaterThan(0);
  });

  it('is deterministic across repeated runs on the CI subset', () => {
    const a = formatOverRoutingAnalysisJson(
      analyzeTwinRouterBenchOverRouting({ corpusPath: CI_SUBSET_PATH }),
    );
    const b = formatOverRoutingAnalysisJson(
      analyzeTwinRouterBenchOverRouting({ corpusPath: CI_SUBSET_PATH }),
    );

    expect(a).toEqual(b);
  });

  it('formats a text breakdown that includes the four required axes', () => {
    const text = formatOverRoutingAnalysisText(
      analyzeTwinRouterBenchOverRouting({ corpusPath: CI_SUBSET_PATH }),
    );

    expect(text).toContain('by_stage');
    expect(text).toContain('by_reason_code');
    expect(text).toContain('by_min_tier');
    expect(text).toContain('by_selected_tier');
    expect(text).toContain('downgrade_first_candidate');
    expect(text).toContain('0.868056');
  });
});
