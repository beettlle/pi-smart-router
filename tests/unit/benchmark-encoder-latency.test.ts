import { describe, expect, it } from 'vitest';

import {
  AGENT_TURN_SAMPLES_VERSION,
  buildEncoderTexts,
  DEFAULT_AGENT_TURN_FIXTURES_PATH,
  graniteWithinBudget,
  loadAgentTurnSamples,
  parseAgentTurnSamplesFixture,
  percentile,
  summarizeLatencies,
} from '../../scripts/benchmark-encoder-latency.js';

describe('benchmark-encoder-latency (SP-157)', () => {
  it('loads held-out agent turn samples from the default fixture path', () => {
    const fixture = loadAgentTurnSamples();

    expect(fixture.version).toBe(AGENT_TURN_SAMPLES_VERSION);
    expect(fixture.samples.length).toBeGreaterThanOrEqual(10);
    expect(fixture.samples.every((sample) => sample.id.length > 0)).toBe(true);
    expect(fixture.samples.every((sample) => sample.request.prompt_text.length > 0)).toBe(true);
  });

  it('parses fixture JSON with routing request metadata', () => {
    const fixture = loadAgentTurnSamples(DEFAULT_AGENT_TURN_FIXTURES_PATH);

    const toolResult = fixture.samples.find((sample) => sample.id === 'tool_result_pytest');
    expect(toolResult?.request.turn_type).toBe('tool_result');
    expect(toolResult?.request.messages?.length).toBeGreaterThan(0);

    const compaction = fixture.samples.find((sample) => sample.id === 'compaction_turn');
    expect(compaction?.request.compaction_flag).toBe(true);
    expect(compaction?.request.estimated_input_tokens).toBeGreaterThan(10_000);
  });

  it('rejects invalid fixture payloads', () => {
    expect(() => parseAgentTurnSamplesFixture({ version: 2, samples: [] })).toThrow(
      /Invalid agent turn samples fixture/,
    );
    expect(() => parseAgentTurnSamplesFixture({ version: 1, description: 'x', samples: [] })).toThrow(
      /Invalid agent turn samples fixture/,
    );
  });

  it('builds HyDRA encoder inputs with seven-flag metadata prefix', () => {
    const fixture = loadAgentTurnSamples();
    const texts = buildEncoderTexts(fixture.samples);

    expect(texts).toHaveLength(fixture.samples.length);
    for (const text of texts) {
      expect(text).toMatch(/^\[turns:\d+\|tools:[01]\|tokens:\d+\|type:[^\|]+\|compact:[01]\|loop:[01]\|attach:[01]\] /);
    }

    const toolResultIndex = fixture.samples.findIndex((sample) => sample.id === 'tool_result_pytest');
    expect(texts[toolResultIndex]).toMatch(/^\[turns:4\|tools:1\|/);
  });

  it('computes percentile and latency summaries', () => {
    const latencies = [10, 20, 30, 40, 100];
    expect(percentile(latencies, 50)).toBe(30);
    expect(percentile(latencies, 95)).toBe(100);

    const summary = summarizeLatencies('granite', latencies);
    expect(summary.encoder).toBe('granite');
    expect(summary.sampleCount).toBe(5);
    expect(summary.meanMs).toBe(40);
  });

  it('checks Granite latency budget ceiling on p50 and p95', () => {
    expect(graniteWithinBudget({ p50Ms: 95, p95Ms: 110 })).toBe(true);
    expect(graniteWithinBudget({ p50Ms: 79, p95Ms: 100 })).toBe(true);
    expect(graniteWithinBudget({ p50Ms: 100, p95Ms: 121 })).toBe(false);
  });
});
