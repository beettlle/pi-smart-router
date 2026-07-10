/**
 * Unit tests for Terminal-Bench operator-mirror adapter — SP-185.
 */

import { describe, expect, it } from 'vitest';

import {
  mapTerminalBenchModelId,
  normalizeTerminalBenchEntries,
  parseTerminalBenchOperatorMirror,
  TERMINAL_BENCH_OPERATOR_MIRROR_SCHEMA_DOC,
  TERMINAL_BENCH_PROVENANCE_URL,
  terminalBenchAdapter,
} from '../../../scripts/lib/leaderboard-adapters/terminal-bench.js';
import { getLeaderboardAdapter } from '../../../scripts/lib/leaderboard-adapters/index.js';
import {
  BenchmarkIngestError,
  parseBenchmarkLeaderboardFixture,
} from '../../../scripts/ingest-benchmark-profiles.js';

const SAMPLE_MIRROR = {
  benchmark: 'terminal_bench',
  source_url: 'https://www.tbench.ai/leaderboard',
  scrape_date: '2026-07-01',
  entries: [
    { model_id: 'claude-opus-4-5', score: 72.5 },
    { model_id: 'claude-sonnet-4-5', score: 68.0 },
    { model_id: 'gpt-5-codex', score: 74.2 },
    { model_id: 'claude-3.5-haiku', score: 51.3 },
    { model_id: 'gemini-2.0-flash', score: 47.8 },
    { model_id: 'custom-agent-x', score: 10.0 },
  ],
};

describe('terminal-bench adapter (SP-185)', () => {
  it('registers without a paid/default liveFetchUrl', () => {
    const adapter = getLeaderboardAdapter('terminal_bench');
    expect(adapter).toBe(terminalBenchAdapter);
    expect(adapter.liveFetchUrl).toBeUndefined();
    expect(adapter.id).toBe('terminal_bench');
    expect(adapter.provenanceUrl).toBe(TERMINAL_BENCH_PROVENANCE_URL);
    expect(TERMINAL_BENCH_OPERATOR_MIRROR_SCHEMA_DOC).toContain('terminal_bench');
  });

  it('maps alias tokens to catalog model_ids', () => {
    expect(mapTerminalBenchModelId('claude-opus-4-5')).toBe('claude-opus-4-5');
    expect(mapTerminalBenchModelId('claude-sonnet-4-5')).toBe('claude-sonnet-4-6');
    expect(mapTerminalBenchModelId('gpt-5-codex')).toBe('gpt-5.3-codex');
    expect(mapTerminalBenchModelId('openai/gpt-5')).toBe('gpt-5.3-codex');
    expect(mapTerminalBenchModelId('gemini-2.0-flash')).toBe('gemini-2.5-flash');
    expect(mapTerminalBenchModelId('claude-3.5-haiku')).toBe('claude-3.5-haiku');
  });

  it('does not invent mappings for unrelated models', () => {
    expect(mapTerminalBenchModelId('custom-agent-x')).toBeUndefined();
    expect(mapTerminalBenchModelId('gemini-2.5-pro')).toBeUndefined();
  });

  it('normalizes entries: remap aliases, keep best score, preserve unmapped', () => {
    const entries = normalizeTerminalBenchEntries([
      { model_id: 'gemini-2.0-flash', score: 40 },
      { model_id: 'gemini-2.5-flash', score: 47.8 },
      { model_id: 'custom-agent-x', score: 10 },
    ]);
    expect(entries).toEqual([
      { model_id: 'custom-agent-x', score: 10 },
      { model_id: 'gemini-2.5-flash', score: 47.8 },
    ]);
  });

  it('parses operator-mirror JSON with model_id mapping', () => {
    const fixture = parseTerminalBenchOperatorMirror(
      JSON.stringify(SAMPLE_MIRROR),
      '2026-07-10',
      'https://mirror.example/tb.json',
    );
    expect(fixture.benchmark).toBe('terminal_bench');
    expect(fixture.scrape_date).toBe('2026-07-10');
    const byId = Object.fromEntries(fixture.entries.map((e) => [e.model_id, e.score]));
    expect(byId['claude-opus-4-5']).toBe(72.5);
    expect(byId['claude-sonnet-4-6']).toBe(68.0);
    expect(byId['gpt-5.3-codex']).toBe(74.2);
    expect(byId['claude-3.5-haiku']).toBe(51.3);
    expect(byId['gemini-2.5-flash']).toBe(47.8);
    expect(byId['custom-agent-x']).toBe(10.0);
    expect(() =>
      parseBenchmarkLeaderboardFixture(JSON.stringify(fixture), 'test'),
    ).not.toThrow();
  });

  it('throws on benchmark mismatch', () => {
    expect(() =>
      parseTerminalBenchOperatorMirror(
        JSON.stringify({ ...SAMPLE_MIRROR, benchmark: 'bfcl' }),
        '2026-07-10',
        'https://mirror.example/tb.json',
      ),
    ).toThrow(BenchmarkIngestError);
  });

  it('fetchAndNormalize accepts fixture-shaped mirrors via injectable fetch', async () => {
    const fixture = await terminalBenchAdapter.fetchAndNormalize({
      url: 'https://mirror.example/tb.json',
      scrapeDate: '2026-07-10',
      timeoutMs: 5_000,
      fetchFn: async () => new Response(JSON.stringify(SAMPLE_MIRROR), { status: 200 }),
    });
    expect(fixture.entries.length).toBeGreaterThanOrEqual(5);
    expect(fixture.scrape_date).toBe('2026-07-10');
  });

  it('fetchAndNormalize rejects HTML and documents Parse rejection', async () => {
    await expect(
      terminalBenchAdapter.fetchAndNormalize({
        url: 'https://www.tbench.ai/leaderboard',
        scrapeDate: '2026-07-10',
        timeoutMs: 5_000,
        fetchFn: async () => new Response('<!DOCTYPE html><html></html>', { status: 200 }),
      }),
    ).rejects.toThrow(/HTML|Parse/);
  });

  it('fetchAndNormalize rejects non-fixture JSON', async () => {
    await expect(
      terminalBenchAdapter.fetchAndNormalize({
        url: 'https://mirror.example/other.json',
        scrapeDate: '2026-07-10',
        timeoutMs: 5_000,
        fetchFn: async () =>
          new Response(JSON.stringify({ rankings: [] }), { status: 200 }),
      }),
    ).rejects.toThrow(/fixture-shaped|Parse/);
  });
});
