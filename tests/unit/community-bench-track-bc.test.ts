/**
 * Unit tests for community-bench Track B dogfood adapter + Track C offline — SP-203 / #111.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseCommunityBenchArgs,
  resolveTrackB,
  resolveTrackC,
  runCommunityBench,
  usage,
} from '../../scripts/eval/community-bench.js';
import {
  TRACK_B_SKIP_REASON_NOT_REQUESTED,
  TRACK_C_SKIP_REASON_NOT_REQUESTED,
} from '../../scripts/eval/community-bench-report.js';
import {
  DOGFOOD_TRACK_B_REQUIRED_OUTCOME_FIELDS,
  missingDogfoodOutcomeLabels,
  tryAdaptDogfoodTrackBExport,
} from '../../scripts/eval/dogfood-track-b-adapter.js';
import { DEFAULT_LLMROUTERBENCH_SUBSET_PATH } from '../../scripts/eval/llmrouterbench-regret-report.js';

const SYNTHETIC_LABELED_EXPORT = resolve(
  'tests/eval/fixtures/dogfood-track-b/synthetic-labeled-export.json',
);

describe('dogfood Track B adapter (SP-203)', () => {
  it('documents required outcome fields and refuses missing labels (no invention)', () => {
    expect(DOGFOOD_TRACK_B_REQUIRED_OUTCOME_FIELDS).toEqual([
      'success_label',
      'min_tier',
      'min_model_id',
    ]);
    expect(missingDogfoodOutcomeLabels({ tier: 'economical-cloud' })).toEqual([
      'success_label',
      'min_tier',
      'min_model_id',
    ]);
    expect(
      missingDogfoodOutcomeLabels({
        success_label: null,
        min_tier: 'economical-cloud',
        min_model_id: 'gpt-4o-mini',
      }),
    ).toContain('success_label');

    const refused = tryAdaptDogfoodTrackBExport({
      schema_version: '1.0.0',
      track: 'dogfood-track-b',
      frozen_catalog: {
        catalog_id: 'test',
        checkpoint_date: '2026-07-11',
        models: [
          {
            model_id: 'gpt-4o-mini',
            tier: 'economical-cloud',
            cost_per_1m_input_usd: 0.15,
          },
        ],
      },
      records: [
        {
          session_id_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          step_index: 0,
          turn_type: 'main_loop',
          tier: 'economical-cloud',
          selected_model_id: 'gpt-4o-mini',
          reason_code: 'downgrade_first_candidate',
          // success_label / min_tier / min_model_id intentionally omitted
        },
      ],
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason.toLowerCase()).toContain('no dogfood labels invented');
      expect(refused.reason).toContain('success_label');
    }
  });

  it('adapts the synthetic labeled fixture into harness fixtures', () => {
    const raw = JSON.parse(readFileSync(SYNTHETIC_LABELED_EXPORT, 'utf8')) as unknown;
    const adapted = tryAdaptDogfoodTrackBExport(raw);
    expect(adapted.ok).toBe(true);
    if (adapted.ok) {
      expect(adapted.record_count).toBe(2);
      expect(adapted.fixtures).toHaveLength(1);
      expect(adapted.fixtures[0]!.session.steps).toHaveLength(2);
      expect(adapted.fixtures[0]!.session.steps[0]!.step_outcome.min_tier).toBe('economical-cloud');
      expect(adapted.fixtures[0]!.session.steps[0]!.step_outcome.success).toBe(true);
    }
  });
});

describe('community-bench Track B (SP-203)', () => {
  it('skips with not-requested reason when dogfood export is omitted', () => {
    const track = resolveTrackB(null);
    expect(track.status).toBe('skipped');
    if (track.status === 'skipped') {
      expect(track.reason).toBe(TRACK_B_SKIP_REASON_NOT_REQUESTED);
      expect(track.reason.toLowerCase()).toContain('no dogfood labels invented');
    }
  });

  it('runs Track B and reports gates on the synthetic labeled export', () => {
    const track = resolveTrackB(SYNTHETIC_LABELED_EXPORT);
    expect(track.status).toBe('ran');
    if (track.status === 'ran') {
      expect(track.name).toBe('DogfoodExport');
      expect(track.export_path).toContain('synthetic-labeled-export.json');
      expect(track.record_count).toBe(2);
      expect(track.fixture_count).toBe(1);
      expect(track.catalog_id.length).toBeGreaterThan(0);
      expect(typeof track.metrics.mean_capability_adequacy_rate).toBe('number');
      expect(typeof track.gates.passed).toBe('boolean');
      expect(typeof track.passed).toBe('boolean');
    }
  });

  it('skips with incomplete-labels reason when export path is missing/unreadable', () => {
    const track = resolveTrackB('/tmp/does-not-exist-dogfood-export-sp203.json');
    expect(track.status).toBe('skipped');
    if (track.status === 'skipped') {
      expect(track.reason.toLowerCase()).toContain('no dogfood labels invented');
      expect(track.reason).toContain('does-not-exist-dogfood-export-sp203.json');
    }
  });

  it('parses --dogfood-export PATH', () => {
    const parsed = parseCommunityBenchArgs(['--dogfood-export', '/tmp/export.jsonl']);
    expect(parsed.dogfoodExportPath).toContain('export.jsonl');
    expect(parsed.llmrouterbench).toBe(false);
  });
});

describe('community-bench Track C offline (SP-195)', () => {
  it('skips Track C when --llmrouterbench / --full not requested', () => {
    const track = resolveTrackC({ enabled: false });
    expect(track.status).toBe('skipped');
    if (track.status === 'skipped') {
      expect(track.reason).toBe(TRACK_C_SKIP_REASON_NOT_REQUESTED);
    }
  });

  it('runs Track C offline on vendored LLMRouterBench subset when flagged', () => {
    const track = resolveTrackC({
      enabled: true,
      subsetPath: DEFAULT_LLMROUTERBENCH_SUBSET_PATH,
    });
    expect(track.status).toBe('ran');
    if (track.status === 'ran') {
      expect(track.name).toBe('LLMRouterBench');
      expect(track.offline).toBe(true);
      expect(track.downloads_corpus).toBe(false);
      expect(track.fixture_count).toBeGreaterThan(0);
      expect(track.subset_path).toContain('llmrouterbench');
      expect(track.catalog_id.length).toBeGreaterThan(0);
      expect(typeof track.cumulative_regret_usd).toBe('number');
      expect(typeof track.mean_cost_savings_ratio).toBe('number');
      expect(typeof track.mean_quality_retention).toBe('number');
    }
  });

  it('parses --llmrouterbench and --full as Track C enable flags', () => {
    expect(parseCommunityBenchArgs(['--llmrouterbench']).llmrouterbench).toBe(true);
    expect(parseCommunityBenchArgs(['--full']).llmrouterbench).toBe(true);
    expect(parseCommunityBenchArgs([]).llmrouterbench).toBe(false);
  });

  it('runCommunityBench embeds Track B ran + Track C ran when both requested', () => {
    const report = runCommunityBench({
      dogfoodExportPath: SYNTHETIC_LABELED_EXPORT,
      llmrouterbench: true,
    });
    expect(report.tracks.B?.status).toBe('ran');
    if (report.tracks.B?.status === 'ran') {
      expect(report.tracks.B.fixture_count).toBeGreaterThan(0);
    }
    expect(report.tracks.C?.status).toBe('ran');
    if (report.tracks.C?.status === 'ran') {
      expect(report.tracks.C.downloads_corpus).toBe(false);
      expect(report.tracks.C.offline).toBe(true);
    }
  });

  it('runCommunityBench skips Track B with incomplete reason for bogus export path', () => {
    const report = runCommunityBench({
      dogfoodExportPath: '/tmp/dogfood-missing-sp203.json',
      llmrouterbench: false,
    });
    expect(report.tracks.B?.status).toBe('skipped');
    if (report.tracks.B?.status === 'skipped') {
      expect(report.tracks.B.reason.toLowerCase()).toContain('no dogfood labels invented');
    }
  });

  it('documents Track B/C flags and offline paths in --help', () => {
    const text = usage();
    expect(text).toContain('--dogfood-export');
    expect(text).toContain('labeled dogfood export');
    expect(text).toContain('--llmrouterbench');
    expect(text).toContain('--full');
    expect(text).toContain('no full HF download');
    expect(text).toContain('llmrouterbench');
  });

  it('CLI usage footer maintainer contact matches COMMUNITY_BENCH_MAINTAINER_CONTACT', async () => {
    const { COMMUNITY_BENCH_MAINTAINER_CONTACT: contact } = await import(
      '../../scripts/eval/community-bench-report.js'
    );
    const readme = readFileSync('README.md', 'utf8');
    expect(usage()).toContain(contact);
    expect(readme).toContain(contact);
    expect(readme).toContain('Contribute a community bench report');
  });
});
