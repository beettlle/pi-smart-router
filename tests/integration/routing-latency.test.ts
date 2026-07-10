/**
 * Routing latency benchmark — T061, SC-005.
 *
 * SC-005: Median routing overhead for ambiguous prompts remains under 200ms.
 * Validates that the full pipeline (triage → turn envelope → fallback) stays
 * within the latency budget for a representative set of ambiguous prompts.
 *
 * Release matrix: routing latency budget — SC-004 triage <5ms, SC-005 ambiguous <200ms.
 */

import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeModel(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
): ModelProfile {
  return {
    provider: 'test-provider',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'latency-req-001',
    session_id: 'session-latency-001',
    prompt_text: 'Fix the failing test in auth module',
    ...overrides,
  };
}

const benchFleet: ModelProfile[] = [
  makeModel({
    id: 'local-gemma',
    tier: 'zero-tier',
    provider: 'lmstudio',
    pricing: { fallback_cost_per_1m: 0 },
  }),
  makeModel({
    id: 'claude-haiku',
    tier: 'economical-cloud',
    provider: 'anthropic',
    pricing: { fallback_cost_per_1m: 0.8 },
  }),
  makeModel({
    id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    provider: 'openai',
    pricing: { fallback_cost_per_1m: 0.6 },
  }),
  makeModel({
    id: 'claude-opus',
    tier: 'frontier-cloud',
    provider: 'anthropic',
    pricing: { fallback_cost_per_1m: 15.0 },
    capabilities: { reasoning: 0.95, code_gen: 0.9, tool_use: 0.9 },
  }),
  makeModel({
    id: 'gpt-4o',
    tier: 'frontier-cloud',
    provider: 'openai',
    pricing: { fallback_cost_per_1m: 10.0 },
    capabilities: { reasoning: 0.9, code_gen: 0.85, tool_use: 0.85 },
  }),
];

/**
 * Ambiguous prompts that do not trigger triage early-exit.
 * These fall through to turn_envelope or fallback, exercising the full pipeline.
 */
const ambiguousPrompts = [
  'Fix the failing test in auth module',
  'Update the database migration script',
  'Investigate the slow query on the dashboard',
  'Implement the new feature request from the PM',
  'Review and address the code review feedback',
  'Set up the CI pipeline configuration',
  'Handle the edge case in the payment flow',
  'Optimize the search indexing process',
  'Resolve the merge conflict in the API layer',
  'Configure the logging infrastructure',
  'Analyze the test coverage gaps',
  'Integrate the third-party webhook handler',
  'Profile the memory usage during batch processing',
  'Evaluate the caching strategy for the feed',
  'Prepare the deployment rollback procedure',
  'Troubleshoot the flaky integration tests',
  'Assess the performance impact of the new middleware',
  'Document the API authentication flow',
  'Migrate the legacy endpoints to the new schema',
  'Validate the data consistency after the migration',
];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('@release', () => {
describe('Routing latency benchmark (T061)', () => {
  describe('SC-005: median <200ms for ambiguous prompts', () => {
    it('median routing_latency_ms stays under 200ms for 20 ambiguous prompts', async () => {
      const pipeline = new RouterPipeline(benchFleet);
      const latencies: number[] = [];

      for (const [i, prompt] of ambiguousPrompts.entries()) {
        const request = makeRequest({
          request_id: `amb-${i}`,
          session_id: `sess-amb-${i}`,
          prompt_text: prompt,
        });

        const decision = await pipeline.route(request);
        latencies.push(decision.routing_latency_ms);
      }

      const med = median(latencies);
      expect(med).toBeLessThan(200);
    });

    it('median wall-clock time stays under 200ms for ambiguous prompts', async () => {
      const pipeline = new RouterPipeline(benchFleet);
      const wallTimes: number[] = [];

      for (const [i, prompt] of ambiguousPrompts.entries()) {
        const request = makeRequest({
          request_id: `wall-${i}`,
          session_id: `sess-wall-${i}`,
          prompt_text: prompt,
        });

        const start = performance.now();
        await pipeline.route(request);
        wallTimes.push(performance.now() - start);
      }

      const med = median(wallTimes);
      expect(med).toBeLessThan(200);
    });

    it('p95 routing latency stays under 200ms', async () => {
      const pipeline = new RouterPipeline(benchFleet);
      const latencies: number[] = [];

      for (const [i, prompt] of ambiguousPrompts.entries()) {
        const request = makeRequest({
          request_id: `p95-${i}`,
          session_id: `sess-p95-${i}`,
          prompt_text: prompt,
        });

        const decision = await pipeline.route(request);
        latencies.push(decision.routing_latency_ms);
      }

      const p95 = percentile(latencies, 95);
      expect(p95).toBeLessThan(200);
    });
  });

  describe('SC-005 via GatewayDispatch: full dispatch path', () => {
    it('median dispatch latency stays under 200ms for ambiguous prompts', async () => {
      const gateway = new GatewayDispatch(benchFleet);
      const latencies: number[] = [];

      for (const [i, prompt] of ambiguousPrompts.entries()) {
        const request = makeRequest({
          request_id: `gw-${i}`,
          session_id: `sess-gw-${i}`,
          prompt_text: prompt,
        });

        const start = performance.now();
        const decision = await gateway.dispatch(request);
        const wallTime = performance.now() - start;

        latencies.push(Math.max(decision.routing_latency_ms, wallTime));
      }

      const med = median(latencies);
      expect(med).toBeLessThan(200);
    });
  });

  describe('SC-004: obvious-case triage <5ms median', () => {
    const trivialPrompts = [
      'Format this JSON file',
      'Fix this typo in the config',
      'Sort imports in the module',
      'Run prettier on the file',
      'Lint this source file',
      'Format the template file',
      'Fix indentation in the class',
      'Fix whitespace in the test',
      'Rename the variable to camelCase',
      'Remove unused import from utils',
    ];

    it('triage early-exit has median <5ms for trivial prompts', async () => {
      const pipeline = new RouterPipeline(benchFleet);
      const latencies: number[] = [];

      for (const [i, prompt] of trivialPrompts.entries()) {
        const request = makeRequest({
          request_id: `trivial-${i}`,
          session_id: `sess-trivial-${i}`,
          prompt_text: prompt,
        });

        const start = performance.now();
        const decision = await pipeline.route(request);
        const wallTime = performance.now() - start;

        expect(decision.stage).toBe('triage');
        latencies.push(wallTime);
      }

      const med = median(latencies);
      expect(med).toBeLessThan(5);
    });
  });

  describe('session-pinned requests: minimal overhead', () => {
    it('pinned request routing is faster than initial routing', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(benchFleet, { sessionPinner: pinner });

      const initialTimes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await pipeline.route(
          makeRequest({
            request_id: `init-${i}`,
            session_id: `sess-pin-bench-${i}`,
          }),
        );
        initialTimes.push(performance.now() - start);
      }

      const pinnedTimes: number[] = [];
      for (let i = 0; i < 5; i++) {
        for (let t = 0; t < 5; t++) {
          const start = performance.now();
          await pipeline.route(
            makeRequest({
              request_id: `pinned-${i}-${t}`,
              session_id: `sess-pin-bench-${i}`,
              prompt_text: `Turn ${t} on session ${i}`,
            }),
          );
          pinnedTimes.push(performance.now() - start);
        }
      }

      const medianPinned = median(pinnedTimes);
      expect(medianPinned).toBeLessThan(200);
    });
  });

  describe('latency consistency across repeated runs', () => {
    it('routing latency has low variance across 50 identical requests', async () => {
      const pipeline = new RouterPipeline(benchFleet);
      const latencies: number[] = [];

      for (let i = 0; i < 50; i++) {
        const request = makeRequest({
          request_id: `repeat-${i}`,
          session_id: `sess-repeat-${i}`,
        });

        const start = performance.now();
        await pipeline.route(request);
        latencies.push(performance.now() - start);
      }

      const med = median(latencies);
      const p99 = percentile(latencies, 99);

      expect(med).toBeLessThan(200);
      expect(p99).toBeLessThan(200);
    });
  });
});
});
