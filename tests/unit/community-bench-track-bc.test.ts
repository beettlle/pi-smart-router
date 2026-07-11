/**
 * Unit tests for community-bench Track B skip + Track C offline — SP-195 / #105.
 */

import { describe, expect, it } from 'vitest';

import {
  parseCommunityBenchArgs,
  resolveTrackB,
  resolveTrackC,
  runCommunityBench,
  usage,
} from '../../scripts/eval/community-bench.js';
import {
  TRACK_B_SKIP_REASON_ADAPTER_INCOMPLETE,
  TRACK_C_SKIP_REASON_NOT_REQUESTED,
} from '../../scripts/eval/community-bench-report.js';
import { DEFAULT_LLMROUTERBENCH_SUBSET_PATH } from '../../scripts/eval/llmrouterbench-regret-report.js';

describe('community-bench Track B skip (SP-195)', () => {
  it('skips with explicit #95 adapter-incomplete reason when --dogfood-export is set', () => {
    const track = resolveTrackB('/tmp/fake-dogfood-export.jsonl');
    expect(track.status).toBe('skipped');
    expect(track.reason).toContain('#95');
    expect(track.reason).toContain(TRACK_B_SKIP_REASON_ADAPTER_INCOMPLETE);
    expect(track.reason).toContain('fake-dogfood-export.jsonl');
    // Never invent dogfood labels
    expect(track.reason.toLowerCase()).toContain('no dogfood labels invented');
  });

  it('skips with the same adapter-incomplete reason when dogfood export is omitted', () => {
    const track = resolveTrackB(null);
    expect(track.status).toBe('skipped');
    expect(track.reason).toBe(TRACK_B_SKIP_REASON_ADAPTER_INCOMPLETE);
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

  it('runCommunityBench embeds Track B skip + Track C ran when --llmrouterbench', () => {
    const report = runCommunityBench({
      dogfoodExportPath: '/tmp/dogfood.jsonl',
      llmrouterbench: true,
    });
    expect(report.tracks.B?.status).toBe('skipped');
    expect(report.tracks.B?.reason).toContain('#95');
    expect(report.tracks.C?.status).toBe('ran');
    if (report.tracks.C?.status === 'ran') {
      expect(report.tracks.C.downloads_corpus).toBe(false);
      expect(report.tracks.C.offline).toBe(true);
    }
  });

  it('documents Track B/C flags and offline paths in --help', () => {
    const text = usage();
    expect(text).toContain('--dogfood-export');
    expect(text).toContain('--llmrouterbench');
    expect(text).toContain('--full');
    expect(text).toContain('no full HF download');
    expect(text).toContain('llmrouterbench');
  });
});
