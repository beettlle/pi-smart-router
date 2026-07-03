/**
 * Cost baseline test — T062, SC-009.
 *
 * SC-009: Mixed-workload API cost measurably decreases versus an
 * always-frontier baseline in a representative agent workload.
 *
 * Validates that the router's tier assignments produce lower total
 * estimated cost than routing everything to frontier-cloud, using
 * the price broker to resolve per-model pricing.
 */

import { describe, expect, it } from 'vitest';

import { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { resolvePrice, resolveFleetPrices } from '../../src/infrastructure/pricing/price-broker.js';
import type {
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
  RoutingRequest,
} from '../../src/domain/types/index.js';

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
    request_id: 'cost-req-001',
    session_id: 'session-cost-001',
    prompt_text: 'Fix the failing test in auth module',
    ...overrides,
  };
}

const costFleet: ModelProfile[] = [
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

const baselineFrontier = costFleet
  .filter((m) => m.tier === 'frontier-cloud')
  .reduce((a, b) =>
    a.pricing.fallback_cost_per_1m >= b.pricing.fallback_cost_per_1m ? a : b,
  );

/**
 * Representative mixed workload simulating a real agent session.
 * Mix: ~50% trivial, ~30% ambiguous, ~20% complex.
 */
const mixedWorkload: Array<{ prompt: string; tokens: number }> = [
  { prompt: 'Format this JSON file', tokens: 200 },
  { prompt: 'Run the linter', tokens: 100 },
  { prompt: 'Add a comment to the function', tokens: 150 },
  { prompt: 'Fix this typo in the README', tokens: 80 },
  { prompt: 'Sort the imports', tokens: 120 },
  { prompt: 'Fix the failing test in auth module', tokens: 500 },
  { prompt: 'Update the database migration script', tokens: 800 },
  { prompt: 'Investigate the slow query on the dashboard', tokens: 600 },
  { prompt: 'Resolve the merge conflict in the API layer', tokens: 400 },
  { prompt: 'Configure the logging infrastructure', tokens: 350 },
  { prompt: 'Design a distributed caching architecture for our microservices', tokens: 2000 },
  { prompt: 'Debug the memory leak in the WebSocket handler', tokens: 1500 },
  { prompt: 'Architect a real-time event sourcing system with CQRS', tokens: 1800 },
  { prompt: 'Run prettier on the codebase', tokens: 100 },
  { prompt: 'Lint the code', tokens: 80 },
  { prompt: 'Handle the edge case in the payment flow', tokens: 700 },
  { prompt: 'Prepare the deployment rollback procedure', tokens: 450 },
  { prompt: 'Fix indentation', tokens: 60 },
  { prompt: 'Add a newline at end of file', tokens: 50 },
  { prompt: 'Optimize the search indexing process', tokens: 900 },
];

function estimateCost(
  model: ModelProfile,
  tokens: number,
  catalog: PriceCatalog | null,
): number {
  const resolved = resolvePrice(model, catalog);
  return (tokens / 1_000_000) * resolved.cost_per_1m_tokens;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Cost baseline (T062, SC-009)', () => {
  describe('SC-009: routed cost < always-frontier baseline', () => {
    it('mixed workload routed cost is measurably less than frontier-only', async () => {
      const gateway = new GatewayDispatch(costFleet);
      const priceMap = resolveFleetPrices(costFleet, null);

      let routedTotalCost = 0;
      let frontierTotalCost = 0;

      for (const [i, item] of mixedWorkload.entries()) {
        const request = makeRequest({
          request_id: `cost-${i}`,
          session_id: `sess-cost-${i}`,
          prompt_text: item.prompt,
          estimated_input_tokens: item.tokens,
        });

        const decision = await gateway.dispatch(request);
        const selectedModel = costFleet.find((m) => m.id === decision.selected_model_id);
        const modelForCost = selectedModel ?? baselineFrontier;

        routedTotalCost += estimateCost(modelForCost, item.tokens, null);
        frontierTotalCost += estimateCost(baselineFrontier, item.tokens, null);
      }

      expect(routedTotalCost).toBeLessThan(frontierTotalCost);
    });

    it('routed cost is at least 20% less than frontier-only for mixed workload', async () => {
      const gateway = new GatewayDispatch(costFleet);

      let routedTotalCost = 0;
      let frontierTotalCost = 0;

      for (const [i, item] of mixedWorkload.entries()) {
        const request = makeRequest({
          request_id: `savings-${i}`,
          session_id: `sess-savings-${i}`,
          prompt_text: item.prompt,
          estimated_input_tokens: item.tokens,
        });

        const decision = await gateway.dispatch(request);
        const selectedModel = costFleet.find((m) => m.id === decision.selected_model_id);
        const modelForCost = selectedModel ?? baselineFrontier;

        routedTotalCost += estimateCost(modelForCost, item.tokens, null);
        frontierTotalCost += estimateCost(baselineFrontier, item.tokens, null);
      }

      const savingsRatio = 1 - routedTotalCost / frontierTotalCost;
      expect(savingsRatio).toBeGreaterThan(0.2);
    });
  });

  describe('tier distribution in mixed workload', () => {
    it('trivial prompts route to economical tier (cost savings)', async () => {
      const gateway = new GatewayDispatch(costFleet);
      const trivialItems = mixedWorkload.filter((item) =>
        ['Format this JSON file', 'Run the linter', 'Add a comment to the function',
         'Fix this typo in the README', 'Sort the imports', 'Run prettier on the codebase',
         'Lint the code', 'Fix indentation', 'Add a newline at end of file'].includes(item.prompt),
      );

      for (const [i, item] of trivialItems.entries()) {
        const decision = await gateway.dispatch(
          makeRequest({
            request_id: `trivial-cost-${i}`,
            session_id: `sess-trivial-cost-${i}`,
            prompt_text: item.prompt,
          }),
        );

        expect(decision.tier).toBe('economical-cloud');
      }
    });

    it('complex prompts route to frontier tier', async () => {
      const gateway = new GatewayDispatch(costFleet);
      const complexItems = mixedWorkload.filter((item) =>
        ['Design a distributed caching architecture for our microservices',
         'Debug the memory leak in the WebSocket handler',
         'Architect a real-time event sourcing system with CQRS'].includes(item.prompt),
      );

      for (const [i, item] of complexItems.entries()) {
        const decision = await gateway.dispatch(
          makeRequest({
            request_id: `complex-cost-${i}`,
            session_id: `sess-complex-cost-${i}`,
            prompt_text: item.prompt,
          }),
        );

        expect(decision.tier).toBe('frontier-cloud');
      }
    });
  });

  describe('price broker integration', () => {
    it('fleet prices resolve correctly via yaml fallback', () => {
      const prices = resolveFleetPrices(costFleet, null);

      expect(prices.get('local-gemma')!.cost_per_1m_tokens).toBe(0);
      expect(prices.get('claude-haiku')!.cost_per_1m_tokens).toBe(0.8);
      expect(prices.get('gpt-4o-mini')!.cost_per_1m_tokens).toBe(0.6);
      expect(prices.get('claude-opus')!.cost_per_1m_tokens).toBe(15.0);
      expect(prices.get('gpt-4o')!.cost_per_1m_tokens).toBe(10.0);

      for (const [, price] of prices) {
        expect(price.source).toBe('yaml_fallback');
      }
    });

    it('operator overrides take priority over fallback pricing', () => {
      const catalog: PriceCatalog = {
        registry_snapshot: {},
        user_overrides: { 'claude-haiku': 0.5, 'gpt-4o': 8.0 },
        last_updated: new Date().toISOString(),
        source: 'override',
      };

      const prices = resolveFleetPrices(costFleet, catalog);

      expect(prices.get('claude-haiku')!.cost_per_1m_tokens).toBe(0.5);
      expect(prices.get('claude-haiku')!.source).toBe('override');
      expect(prices.get('gpt-4o')!.cost_per_1m_tokens).toBe(8.0);
      expect(prices.get('gpt-4o')!.source).toBe('override');
      expect(prices.get('gpt-4o-mini')!.source).toBe('yaml_fallback');
    });

    it('registry snapshot takes priority over fallback but not overrides', () => {
      const catalog: PriceCatalog = {
        registry_snapshot: { 'claude-haiku': 0.9, 'gpt-4o': 11.0 },
        user_overrides: { 'claude-haiku': 0.3 },
        last_updated: new Date().toISOString(),
        source: 'registry',
      };

      const prices = resolveFleetPrices(costFleet, catalog);

      expect(prices.get('claude-haiku')!.cost_per_1m_tokens).toBe(0.3);
      expect(prices.get('claude-haiku')!.source).toBe('override');
      expect(prices.get('gpt-4o')!.cost_per_1m_tokens).toBe(11.0);
      expect(prices.get('gpt-4o')!.source).toBe('registry');
    });
  });

  describe('cost with operator price overrides', () => {
    it('overridden prices reduce routed cost further vs frontier baseline', async () => {
      const gateway = new GatewayDispatch(costFleet);
      const catalog: PriceCatalog = {
        registry_snapshot: {},
        user_overrides: { 'claude-haiku': 0.3, 'gpt-4o-mini': 0.2 },
        last_updated: new Date().toISOString(),
        source: 'override',
      };

      let routedCostDefault = 0;
      let routedCostOverridden = 0;

      for (const [i, item] of mixedWorkload.entries()) {
        const decision = await gateway.dispatch(
          makeRequest({
            request_id: `override-${i}`,
            session_id: `sess-override-${i}`,
            prompt_text: item.prompt,
            estimated_input_tokens: item.tokens,
          }),
        );

        const model = costFleet.find((m) => m.id === decision.selected_model_id) ?? baselineFrontier;
        routedCostDefault += estimateCost(model, item.tokens, null);
        routedCostOverridden += estimateCost(model, item.tokens, catalog);
      }

      expect(routedCostOverridden).toBeLessThanOrEqual(routedCostDefault);
    });
  });

  describe('per-tier cost verification', () => {
    it('economical tier models cost strictly less than frontier per token', () => {
      const prices = resolveFleetPrices(costFleet, null);
      const econPrices = costFleet
        .filter((m) => m.tier === 'economical-cloud')
        .map((m) => prices.get(m.id)!.cost_per_1m_tokens);
      const frontierPrices = costFleet
        .filter((m) => m.tier === 'frontier-cloud')
        .map((m) => prices.get(m.id)!.cost_per_1m_tokens);

      const maxEcon = Math.max(...econPrices);
      const minFrontier = Math.min(...frontierPrices);

      expect(maxEcon).toBeLessThan(minFrontier);
    });

    it('zero-tier models cost nothing', () => {
      const prices = resolveFleetPrices(costFleet, null);
      const zeroPrices = costFleet
        .filter((m) => m.tier === 'zero-tier')
        .map((m) => prices.get(m.id)!.cost_per_1m_tokens);

      for (const price of zeroPrices) {
        expect(price).toBe(0);
      }
    });
  });
});
