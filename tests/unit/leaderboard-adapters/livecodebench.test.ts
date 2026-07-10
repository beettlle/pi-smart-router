/**
 * Offline unit tests for LiveCodeBench native adapter — SP-183.
 * Uses a truncated performances sample (no network).
 */

import { describe, expect, it } from 'vitest';

import { BENCHMARK_SOURCE_URLS } from '../../../scripts/ingest-benchmark-profiles.js';
import {
  aggregateLiveCodeBenchPerformances,
  buildLiveCodeBenchModelLookup,
  LIVECODEBENCH_LIVE_FETCH_URL,
  LIVECODEBENCH_MODEL_ID_MAP,
  livecodebenchAdapter,
  parseLiveCodeBenchPayload,
} from '../../../scripts/lib/leaderboard-adapters/livecodebench.js';
import { getLeaderboardAdapter } from '../../../scripts/lib/leaderboard-adapters/index.js';

/**
 * Truncated performances_generation.json sample for CI (no network).
 * Includes mapped models, an unmapped model, and models[] metadata.
 */
const TRUNCATED_LCB_SAMPLE = {
  performances: [
    {
      question_id: '1873_A',
      model: 'Claude-Opus-4',
      date: 1692662400000,
      difficulty: 'easy',
      'pass@1': 100.0,
      platform: 'codeforces',
    },
    {
      question_id: '1873_B',
      model: 'Claude-Opus-4',
      date: 1692662400000,
      difficulty: 'easy',
      'pass@1': 80.0,
      platform: 'codeforces',
    },
    {
      question_id: '1873_A',
      model: 'Claude-Sonnet-4',
      date: 1692662400000,
      difficulty: 'easy',
      'pass@1': 60.0,
      platform: 'codeforces',
    },
    {
      question_id: '1873_B',
      model: 'Claude-Sonnet-4',
      date: 1692662400000,
      difficulty: 'easy',
      'pass@1': 40.0,
      platform: 'codeforces',
    },
    {
      question_id: '1873_A',
      model: 'Gemini-2.5-Flash-Preview',
      date: 1692662400000,
      difficulty: 'easy',
      'pass@1': 50.0,
      platform: 'codeforces',
    },
    {
      question_id: '1873_B',
      model: 'Gemini-2.5-Flash-Preview',
      date: 1692662400000,
      difficulty: 'easy',
      'pass@1': 70.0,
      platform: 'codeforces',
    },
    // Unmapped — must be skipped
    {
      question_id: '1873_A',
      model: 'DeepSeek-V3',
      date: 1692662400000,
      difficulty: 'easy',
      'pass@1': 99.0,
      platform: 'codeforces',
    },
    // Same catalog id via model_name key — first-wins (Claude-Opus-4 already claimed)
    {
      question_id: '1873_A',
      model: 'claude-opus-4-20250514_nothink',
      date: 1692662400000,
      difficulty: 'easy',
      'pass@1': 10.0,
      platform: 'codeforces',
    },
  ],
  models: [
    {
      model_name: 'claude-opus-4-20250514_nothink',
      model_repr: 'Claude-Opus-4',
    },
    {
      model_name: 'claude-sonnet-4-20250514_nothink',
      model_repr: 'Claude-Sonnet-4',
    },
    {
      model_name: 'gemini-2.5-flash-preview-04-17',
      model_repr: 'Gemini-2.5-Flash-Preview',
    },
    {
      model_name: 'deepseek-chat',
      model_repr: 'DeepSeek-V3',
    },
  ],
};

describe('livecodebench native adapter (SP-183)', () => {
  it('registers default live fetch URL on the registry adapter', () => {
    const adapter = getLeaderboardAdapter('livecodebench');
    expect(adapter).toBe(livecodebenchAdapter);
    expect(adapter.liveFetchUrl).toBe(LIVECODEBENCH_LIVE_FETCH_URL);
    expect(adapter.provenanceUrl).toBe(BENCHMARK_SOURCE_URLS.livecodebench);
  });

  it('aggregates mean pass@1 per mapped model and skips unmapped', () => {
    const payload = parseLiveCodeBenchPayload(JSON.stringify(TRUNCATED_LCB_SAMPLE), 'sample');
    const lookup = buildLiveCodeBenchModelLookup(payload.models);
    const entries = aggregateLiveCodeBenchPerformances(payload, lookup);

    expect(entries).toEqual([
      { model_id: 'claude-opus-4-5', score: 90.0 },
      { model_id: 'claude-sonnet-4-6', score: 50.0 },
      { model_id: 'gemini-2.5-flash', score: 60.0 },
    ]);
    expect(entries.every((e) => e.model_id !== 'DeepSeek-V3')).toBe(true);
    expect(LIVECODEBENCH_MODEL_ID_MAP['DeepSeek-V3']).toBeUndefined();
  });

  it('maps model_name metadata onto the same catalog ids', () => {
    const lookup = buildLiveCodeBenchModelLookup(TRUNCATED_LCB_SAMPLE.models);
    expect(lookup.get('claude-opus-4-20250514_nothink')).toBe('claude-opus-4-5');
    expect(lookup.get('claude-sonnet-4-20250514_nothink')).toBe('claude-sonnet-4-6');
    expect(lookup.get('gemini-2.5-flash-preview-04-17')).toBe('gemini-2.5-flash');
    expect(lookup.get('deepseek-chat')).toBeUndefined();
  });

  it('fetchAndNormalize returns fixture-shaped entries offline', async () => {
    const fixture = await livecodebenchAdapter.fetchAndNormalize({
      url: 'https://example.test/lcb-sample.json',
      scrapeDate: '2026-07-10',
      timeoutMs: 5_000,
      fetchFn: async () =>
        new Response(JSON.stringify(TRUNCATED_LCB_SAMPLE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    expect(fixture.benchmark).toBe('livecodebench');
    expect(fixture.scrape_date).toBe('2026-07-10');
    expect(fixture.source_url).toBe(BENCHMARK_SOURCE_URLS.livecodebench);
    expect(fixture.entries).toHaveLength(3);
    expect(fixture.entries.map((e) => e.model_id).sort()).toEqual([
      'claude-opus-4-5',
      'claude-sonnet-4-6',
      'gemini-2.5-flash',
    ]);
  });

  it('rejects HTML and empty bodies without inventing scores', async () => {
    await expect(
      livecodebenchAdapter.fetchAndNormalize({
        url: 'https://example.test/html',
        scrapeDate: '2026-07-10',
        timeoutMs: 5_000,
        fetchFn: async () =>
          new Response('<!DOCTYPE html><html></html>', { status: 200 }),
      }),
    ).rejects.toThrow(/HTML/);

    await expect(
      livecodebenchAdapter.fetchAndNormalize({
        url: 'https://example.test/empty',
        scrapeDate: '2026-07-10',
        timeoutMs: 5_000,
        fetchFn: async () => new Response('   ', { status: 200 }),
      }),
    ).rejects.toThrow(/empty/);
  });

  it('throws when every model is unmapped', async () => {
    const onlyUnmapped = {
      performances: [
        {
          question_id: '1',
          model: 'Totally-Unknown-Model',
          'pass@1': 50,
        },
      ],
      models: [],
    };

    await expect(
      livecodebenchAdapter.fetchAndNormalize({
        url: 'https://example.test/unmapped',
        scrapeDate: '2026-07-10',
        timeoutMs: 5_000,
        fetchFn: async () => new Response(JSON.stringify(onlyUnmapped), { status: 200 }),
      }),
    ).rejects.toThrow(/zero mapped entries/);
  });
});
