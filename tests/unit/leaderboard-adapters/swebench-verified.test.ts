/**
 * Unit tests for SWE-bench Verified native adapter — SP-182.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  mapSwebenchModelToken,
  parseSwebenchVerifiedLeaderboards,
  resolveSwebenchResultModelId,
  SWEBENCH_VERIFIED_LIVE_FETCH_URL,
  swebenchVerifiedAdapter,
  verifiedResultsToEntries,
} from '../../../scripts/lib/leaderboard-adapters/swebench-verified.js';
import { getLeaderboardAdapter } from '../../../scripts/lib/leaderboard-adapters/index.js';
import {
  BenchmarkIngestError,
  parseBenchmarkLeaderboardFixture,
} from '../../../scripts/ingest-benchmark-profiles.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = join(HERE, 'swebench-leaderboards-sample.json');
const SAMPLE_JSON = readFileSync(SAMPLE_PATH, 'utf8');

describe('swebench-verified adapter (SP-182)', () => {
  it('registers as live default for swebench_verified', () => {
    const adapter = getLeaderboardAdapter('swebench_verified');
    expect(adapter).toBe(swebenchVerifiedAdapter);
    expect(adapter.liveFetchUrl).toBe(SWEBENCH_VERIFIED_LIVE_FETCH_URL);
    expect(adapter.id).toBe('swebench_verified');
  });

  it('maps Model tags and dated variants to catalog model_ids', () => {
    expect(mapSwebenchModelToken('claude-opus-4-5')).toBe('claude-opus-4-5');
    expect(mapSwebenchModelToken('claude-opus-4-5-20251101')).toBe('claude-opus-4-5');
    expect(mapSwebenchModelToken('claude-4-sonnet-20250514')).toBe('claude-sonnet-4-6');
    expect(mapSwebenchModelToken('gpt-5-2025-08-07')).toBe('gpt-5.3-codex');
    expect(mapSwebenchModelToken('openai/gpt-5-2025-08-07')).toBe('gpt-5.3-codex');
    expect(mapSwebenchModelToken('gemini-2.5-flash')).toBe('gemini-2.5-flash');
    expect(mapSwebenchModelToken('claude-3.5-haiku')).toBe('claude-3.5-haiku');
  });

  it('does not invent mappings for unrelated models', () => {
    expect(mapSwebenchModelToken('Doubao-Seed-Code')).toBeUndefined();
    expect(mapSwebenchModelToken('claude-haiku-4-5-20251001')).toBeUndefined();
    expect(mapSwebenchModelToken('gemini-2.5-pro')).toBeUndefined();
  });

  it('skips multi-model rows that map to distinct catalog ids', () => {
    expect(
      resolveSwebenchResultModelId({
        name: 'multi',
        tags: ['Model: claude-opus-4-5', 'Model: gpt-5'],
        resolved: 90,
      }),
    ).toBeUndefined();
  });

  it('extracts Verified board, maps resolved→score, skips unmapped', () => {
    const fixture = parseSwebenchVerifiedLeaderboards(
      SAMPLE_JSON,
      '2026-07-10',
      SWEBENCH_VERIFIED_LIVE_FETCH_URL,
    );

    expect(fixture.benchmark).toBe('swebench_verified');
    expect(fixture.source_url).toBe(SWEBENCH_VERIFIED_LIVE_FETCH_URL);
    expect(fixture.scrape_date).toBe('2026-07-10');

    const byId = Object.fromEntries(fixture.entries.map((e) => [e.model_id, e.score]));
    // Best opus score among single-model rows (79.2 > 74.4); multi-model 90 skipped
    expect(byId['claude-opus-4-5']).toBe(79.2);
    expect(byId['claude-sonnet-4-6']).toBe(72.4);
    expect(byId['gpt-5.3-codex']).toBe(65.0);
    expect(byId['gemini-2.5-flash']).toBe(28.73);
    expect(byId['claude-3.5-haiku']).toBe(40.6);
    expect(byId['Doubao-Seed-Code']).toBeUndefined();
    // Schema-valid
    expect(() =>
      parseBenchmarkLeaderboardFixture(JSON.stringify(fixture), 'test'),
    ).not.toThrow();
  });

  it('verifiedResultsToEntries keeps max score per model and skips null resolved', () => {
    const entries = verifiedResultsToEntries([
      { name: 'a', resolved: 10, tags: ['Model: gemini-2.5-flash'] },
      { name: 'b', resolved: 20, tags: ['Model: gemini-2.5-flash'] },
      { name: 'c', resolved: null, tags: ['Model: gemini-2.5-flash'] },
      { name: 'd', resolved: 99, tags: ['Model: unknown-x'] },
    ]);
    expect(entries).toEqual([{ model_id: 'gemini-2.5-flash', score: 20 }]);
  });

  it('throws when Verified board is missing', () => {
    expect(() =>
      parseSwebenchVerifiedLeaderboards(
        JSON.stringify({ leaderboards: [{ name: 'Lite', results: [] }] }),
        '2026-07-10',
        SWEBENCH_VERIFIED_LIVE_FETCH_URL,
      ),
    ).toThrow(BenchmarkIngestError);
  });

  it('throws when no rows map to catalog ids', () => {
    expect(() =>
      parseSwebenchVerifiedLeaderboards(
        JSON.stringify({
          leaderboards: [
            {
              name: 'Verified',
              results: [{ name: 'x', resolved: 1, tags: ['Model: unknown'] }],
            },
          ],
        }),
        '2026-07-10',
        SWEBENCH_VERIFIED_LIVE_FETCH_URL,
      ),
    ).toThrow(/no catalog-mapped entries/);
  });

  it('fetchAndNormalize parses leaderboards.json via injectable fetch', async () => {
    const fixture = await swebenchVerifiedAdapter.fetchAndNormalize({
      url: SWEBENCH_VERIFIED_LIVE_FETCH_URL,
      scrapeDate: '2026-07-10',
      timeoutMs: 5_000,
      fetchFn: async () => new Response(SAMPLE_JSON, { status: 200 }),
    });
    expect(fixture.entries.length).toBeGreaterThanOrEqual(4);
    expect(fixture.source_url).toBe(SWEBENCH_VERIFIED_LIVE_FETCH_URL);
  });

  it('fetchAndNormalize accepts fixture-shaped JSON mirrors', async () => {
    const mirror = {
      benchmark: 'swebench_verified',
      source_url: 'https://www.swebench.com/',
      scrape_date: '2026-01-01',
      entries: [{ model_id: 'claude-opus-4-5', score: 11 }],
    };
    const fixture = await swebenchVerifiedAdapter.fetchAndNormalize({
      url: 'https://mirror.example/swe.json',
      scrapeDate: '2026-07-10',
      timeoutMs: 5_000,
      fetchFn: async () => new Response(JSON.stringify(mirror), { status: 200 }),
    });
    expect(fixture.entries[0]?.score).toBe(11);
    expect(fixture.scrape_date).toBe('2026-07-10');
  });

  it('fetchAndNormalize rejects HTML bodies', async () => {
    await expect(
      swebenchVerifiedAdapter.fetchAndNormalize({
        url: 'https://example.com/page',
        scrapeDate: '2026-07-10',
        timeoutMs: 5_000,
        fetchFn: async () => new Response('<!DOCTYPE html><html></html>', { status: 200 }),
      }),
    ).rejects.toThrow(/HTML/);
  });
});
