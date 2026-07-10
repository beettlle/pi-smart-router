/**
 * BFCL CSV native adapter unit tests — SP-184 (offline; no network).
 */

import { describe, expect, it } from 'vitest';

import { BENCHMARK_SOURCE_URLS } from '../../../scripts/ingest-benchmark-profiles.js';
import {
  BFCL_LIVE_FETCH_URL,
  bfclAdapter,
  mapBfclModelToCatalogId,
  parseBfclOverallCsv,
  parseOverallAcc,
  stripBfclModeSuffix,
} from '../../../scripts/lib/leaderboard-adapters/bfcl.js';
import { getDefaultLiveFetchUrls, getLeaderboardAdapter } from '../../../scripts/lib/leaderboard-adapters/index.js';

/** Truncated Gorilla data_overall.csv sample for CI (no network). */
const SAMPLE_BFCL_CSV = `Rank,Overall Acc,Model,Model Link,Organization
1,77.47%,Claude-Opus-4-5-20251101 (FC),https://example.com/opus,Anthropic
2,56.24%,Gemini-2.5-Flash (FC),https://example.com/flash,Google
3,99.00%,Totally-Unknown-Model (FC),https://example.com/unknown,Unknown
4,33.47%,Claude-Opus-4-5-20251101 (Prompt),https://example.com/opus-prompt,Anthropic
5,70.60%,Claude-3.5-Haiku (Prompt),https://example.com/haiku,Anthropic
6,N/A,gpt-5.3-codex (FC),https://example.com/codex,OpenAI
7,84.50%,Claude-Sonnet-4-5-20250929 (FC),https://example.com/sonnet,Anthropic
`;

describe('bfcl adapter (SP-184)', () => {
  it('registers the Gorilla data_overall.csv live URL', () => {
    const adapter = getLeaderboardAdapter('bfcl');
    expect(adapter).toBe(bfclAdapter);
    expect(adapter.liveFetchUrl).toBe(BFCL_LIVE_FETCH_URL);
    expect(getDefaultLiveFetchUrls().bfcl).toBe(BFCL_LIVE_FETCH_URL);
  });

  it('strips (FC) / (Prompt) suffixes and maps catalog stems', () => {
    expect(stripBfclModeSuffix('Claude-Opus-4-5-20251101 (FC)')).toBe(
      'Claude-Opus-4-5-20251101',
    );
    expect(stripBfclModeSuffix('Gemini-2.5-Flash (Prompt)')).toBe('Gemini-2.5-Flash');
    expect(mapBfclModelToCatalogId('Claude-Opus-4-5-20251101 (FC)')).toBe('claude-opus-4-5');
    expect(mapBfclModelToCatalogId('Claude-Sonnet-4-5-20250929 (FC)')).toBe(
      'claude-sonnet-4-6',
    );
    expect(mapBfclModelToCatalogId('Gemini-2.5-Flash (FC)')).toBe('gemini-2.5-flash');
    expect(mapBfclModelToCatalogId('Claude-3.5-Haiku (Prompt)')).toBe('claude-3.5-haiku');
    expect(mapBfclModelToCatalogId('Totally-Unknown-Model (FC)')).toBeUndefined();
  });

  it('parses Overall Acc percentages and rejects N/A', () => {
    expect(parseOverallAcc('77.47%')).toBe(77.47);
    expect(parseOverallAcc('70.6')).toBe(70.6);
    expect(parseOverallAcc('N/A')).toBeUndefined();
    expect(parseOverallAcc('')).toBeUndefined();
  });

  it('parses sample CSV: Overall Acc → score, skips unmapped, keeps max per model', () => {
    const fixture = parseBfclOverallCsv(SAMPLE_BFCL_CSV, {
      scrapeDate: '2026-07-10',
      sourceUrl: BENCHMARK_SOURCE_URLS.bfcl,
    });

    expect(fixture.benchmark).toBe('bfcl');
    expect(fixture.scrape_date).toBe('2026-07-10');
    expect(fixture.source_url).toBe(BENCHMARK_SOURCE_URLS.bfcl);

    const byId = Object.fromEntries(fixture.entries.map((e) => [e.model_id, e.score]));
    // FC 77.47 beats Prompt 33.47 for same catalog id
    expect(byId['claude-opus-4-5']).toBe(77.47);
    expect(byId['gemini-2.5-flash']).toBe(56.24);
    expect(byId['claude-3.5-haiku']).toBe(70.6);
    expect(byId['claude-sonnet-4-6']).toBe(84.5);
    // Unknown model skipped; N/A score skipped (no invented score)
    expect(byId['Totally-Unknown-Model']).toBeUndefined();
    expect(byId['gpt-5.3-codex']).toBeUndefined();
    expect(fixture.entries.every((e) => Number.isFinite(e.score))).toBe(true);
  });

  it('fetchAndNormalize parses CSV via injectable fetch (offline)', async () => {
    const fixture = await bfclAdapter.fetchAndNormalize({
      url: BFCL_LIVE_FETCH_URL,
      scrapeDate: '2026-07-10',
      timeoutMs: 5_000,
      fetchFn: async () => new Response(SAMPLE_BFCL_CSV, { status: 200 }),
    });

    expect(fixture.entries.length).toBeGreaterThanOrEqual(3);
    expect(fixture.entries.some((e) => e.model_id === 'claude-opus-4-5')).toBe(true);
  });

  it('rejects empty CSV and HTML bodies', () => {
    expect(() =>
      parseBfclOverallCsv('', { scrapeDate: '2026-07-10' }),
    ).toThrow(/empty/i);
    expect(() =>
      parseBfclOverallCsv('<!DOCTYPE html><html></html>', { scrapeDate: '2026-07-10' }),
    ).toThrow(/HTML/i);
    expect(() =>
      parseBfclOverallCsv(
        'Rank,Overall Acc,Model\n1,50%,Unknown-X (FC)\n',
        { scrapeDate: '2026-07-10' },
      ),
    ).toThrow(/zero mapped/i);
  });
});
