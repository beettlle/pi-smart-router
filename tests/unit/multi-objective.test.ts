import { describe, it, expect } from 'vitest';
import {
  scoreMultiObjective,
  type FrugalityWeights,
} from '../../src/domain/scoring/multi-objective.js';
import type { CandidateScore, ModelProfile } from '../../src/domain/types/index.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeModel(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: 'test-model',
    tier: 'economical-cloud',
    provider: 'test',
    capabilities: { reasoning: 0.8, code_gen: 0.9, tool_use: 0.7 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeCandidate(
  overrides: Partial<CandidateScore> = {},
): CandidateScore {
  return {
    model_id: 'test-model',
    score: 0.9,
    shortfall: 0,
    rejected_reason: null,
    ...overrides,
  };
}

const DEFAULT_WEIGHTS: FrugalityWeights = {
  lambda_cost: 0.5,
  lambda_latency: 0.1,
  lambda_verbosity: 0.15,
};

// ─── scoreMultiObjective ─────────────────────────────────────────────────────

describe('scoreMultiObjective', () => {
  describe('basic scoring', () => {
    it('returns selected candidate for a single viable candidate', () => {
      const fleet = [makeModel({ id: 'a' })];
      const hydra = [makeCandidate({ model_id: 'a', score: 0.85 })];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      expect(result.selected).not.toBeNull();
      expect(result.selected!.model_id).toBe('a');
      expect(result.candidates).toHaveLength(1);
    });

    it('preserves capability_score from hydra input', () => {
      const fleet = [makeModel({ id: 'a' })];
      const hydra = [makeCandidate({ model_id: 'a', score: 0.72 })];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      expect(result.selected!.capability_score).toBe(0.72);
    });

    it('computes composite_score as capability minus penalties', () => {
      const fleet = [
        makeModel({
          id: 'a',
          pricing: { fallback_cost_per_1m: 10 },
          performance: { latency_p50_ms: 500, verbosity_factor: 2.0 },
        }),
      ];
      const hydra = [makeCandidate({ model_id: 'a', score: 0.9 })];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      expect(result.selected!.composite_score).toBeLessThanOrEqual(
        result.selected!.capability_score,
      );
    });
  });

  describe('lambda_cost weighting', () => {
    it('prefers cheaper model when lambda_cost is high', () => {
      const fleet = [
        makeModel({ id: 'expensive', pricing: { fallback_cost_per_1m: 60 } }),
        makeModel({ id: 'cheap', pricing: { fallback_cost_per_1m: 0.5 } }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'expensive', score: 0.85 }),
        makeCandidate({ model_id: 'cheap', score: 0.80 }),
      ];
      const weights: FrugalityWeights = {
        lambda_cost: 0.9,
        lambda_latency: 0,
        lambda_verbosity: 0,
      };

      const result = scoreMultiObjective(hydra, fleet, weights);

      expect(result.selected!.model_id).toBe('cheap');
    });

    it('prefers higher capability when lambda_cost is zero', () => {
      const fleet = [
        makeModel({ id: 'expensive', pricing: { fallback_cost_per_1m: 60 } }),
        makeModel({ id: 'cheap', pricing: { fallback_cost_per_1m: 0.5 } }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'expensive', score: 0.85 }),
        makeCandidate({ model_id: 'cheap', score: 0.80 }),
      ];
      const weights: FrugalityWeights = {
        lambda_cost: 0,
        lambda_latency: 0,
        lambda_verbosity: 0,
      };

      const result = scoreMultiObjective(hydra, fleet, weights);

      expect(result.selected!.model_id).toBe('expensive');
    });
  });

  describe('lambda_latency weighting', () => {
    it('prefers lower-latency model when lambda_latency is high', () => {
      const fleet = [
        makeModel({
          id: 'slow',
          performance: { latency_p50_ms: 2000 },
          pricing: { fallback_cost_per_1m: 1 },
        }),
        makeModel({
          id: 'fast',
          performance: { latency_p50_ms: 100 },
          pricing: { fallback_cost_per_1m: 1 },
        }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'slow', score: 0.82 }),
        makeCandidate({ model_id: 'fast', score: 0.80 }),
      ];
      const weights: FrugalityWeights = {
        lambda_cost: 0,
        lambda_latency: 0.9,
        lambda_verbosity: 0,
      };

      const result = scoreMultiObjective(hydra, fleet, weights);

      expect(result.selected!.model_id).toBe('fast');
    });
  });

  describe('lambda_verbosity weighting', () => {
    it('prefers less verbose model when lambda_verbosity is high', () => {
      const fleet = [
        makeModel({
          id: 'verbose',
          performance: { verbosity_factor: 3.0 },
          pricing: { fallback_cost_per_1m: 1 },
        }),
        makeModel({
          id: 'concise',
          performance: { verbosity_factor: 0.5 },
          pricing: { fallback_cost_per_1m: 1 },
        }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'verbose', score: 0.82 }),
        makeCandidate({ model_id: 'concise', score: 0.80 }),
      ];
      const weights: FrugalityWeights = {
        lambda_cost: 0,
        lambda_latency: 0,
        lambda_verbosity: 0.9,
      };

      const result = scoreMultiObjective(hydra, fleet, weights);

      expect(result.selected!.model_id).toBe('concise');
    });
  });

  describe('rejected candidates', () => {
    it('returns null selection when all candidates are rejected', () => {
      const fleet = [
        makeModel({ id: 'a' }),
        makeModel({ id: 'b' }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'a', score: 0, rejected_reason: 'shortfall_gate' }),
        makeCandidate({ model_id: 'b', score: 0, rejected_reason: 'shortfall_gate' }),
      ];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      expect(result.selected).toBeNull();
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.every((c) => c.rejected_reason === 'shortfall_gate')).toBe(true);
    });

    it('assigns zero composite_score to rejected candidates', () => {
      const fleet = [makeModel({ id: 'a' })];
      const hydra = [
        makeCandidate({ model_id: 'a', score: 0, rejected_reason: 'shortfall_gate' }),
      ];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      expect(result.candidates[0]!.composite_score).toBe(0);
    });

    it('excludes rejected candidates from selection but includes in output', () => {
      const fleet = [
        makeModel({ id: 'rejected-model', pricing: { fallback_cost_per_1m: 0.1 } }),
        makeModel({ id: 'viable-model', pricing: { fallback_cost_per_1m: 10 } }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'rejected-model', score: 0, rejected_reason: 'shortfall_gate' }),
        makeCandidate({ model_id: 'viable-model', score: 0.7 }),
      ];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      expect(result.selected!.model_id).toBe('viable-model');
      expect(result.candidates).toHaveLength(2);
    });
  });

  describe('empty input', () => {
    it('returns null selection for empty hydra scores', () => {
      const result = scoreMultiObjective([], [], DEFAULT_WEIGHTS);

      expect(result.selected).toBeNull();
      expect(result.candidates).toHaveLength(0);
    });
  });

  describe('normalization', () => {
    it('normalizes to midpoint when all candidates have equal cost', () => {
      const fleet = [
        makeModel({ id: 'a', pricing: { fallback_cost_per_1m: 5 } }),
        makeModel({ id: 'b', pricing: { fallback_cost_per_1m: 5 } }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'a', score: 0.9 }),
        makeCandidate({ model_id: 'b', score: 0.8 }),
      ];
      const weights: FrugalityWeights = {
        lambda_cost: 1.0,
        lambda_latency: 0,
        lambda_verbosity: 0,
      };

      const result = scoreMultiObjective(hydra, fleet, weights);

      const a = result.candidates.find((c) => c.model_id === 'a')!;
      const b = result.candidates.find((c) => c.model_id === 'b')!;
      expect(a.cost_penalty).toBe(b.cost_penalty);
      expect(result.selected!.model_id).toBe('a');
    });

    it('handles missing performance fields gracefully', () => {
      const fleet = [
        makeModel({ id: 'a', pricing: { fallback_cost_per_1m: 1 } }),
        makeModel({ id: 'b', pricing: { fallback_cost_per_1m: 2 } }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'a', score: 0.85 }),
        makeCandidate({ model_id: 'b', score: 0.85 }),
      ];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      expect(result.selected).not.toBeNull();
      expect(result.candidates).toHaveLength(2);
    });
  });

  describe('multi-objective trade-offs', () => {
    it('balances all three objectives with default weights', () => {
      const fleet = [
        makeModel({
          id: 'frontier',
          pricing: { fallback_cost_per_1m: 30 },
          performance: { latency_p50_ms: 800, verbosity_factor: 2.0 },
        }),
        makeModel({
          id: 'balanced',
          pricing: { fallback_cost_per_1m: 5 },
          performance: { latency_p50_ms: 300, verbosity_factor: 1.0 },
        }),
        makeModel({
          id: 'cheap',
          pricing: { fallback_cost_per_1m: 0.5 },
          performance: { latency_p50_ms: 150, verbosity_factor: 0.8 },
        }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'frontier', score: 0.95 }),
        makeCandidate({ model_id: 'balanced', score: 0.88 }),
        makeCandidate({ model_id: 'cheap', score: 0.70 }),
      ];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      expect(result.selected).not.toBeNull();
      expect(result.candidates).toHaveLength(3);
      for (const c of result.candidates) {
        if (c.rejected_reason === null) {
          expect(c.composite_score).toBeLessThanOrEqual(c.capability_score);
        }
      }
    });

    it('fleet profile not found defaults to zero-cost metrics', () => {
      const fleet: ModelProfile[] = [];
      const hydra = [makeCandidate({ model_id: 'orphan', score: 0.8 })];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      expect(result.selected!.model_id).toBe('orphan');
    });
  });

  describe('penalty breakdown', () => {
    it('reports individual penalty components', () => {
      const fleet = [
        makeModel({
          id: 'a',
          pricing: { fallback_cost_per_1m: 10 },
          performance: { latency_p50_ms: 500, verbosity_factor: 1.5 },
        }),
        makeModel({
          id: 'b',
          pricing: { fallback_cost_per_1m: 1 },
          performance: { latency_p50_ms: 100, verbosity_factor: 0.8 },
        }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'a', score: 0.9 }),
        makeCandidate({ model_id: 'b', score: 0.9 }),
      ];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      const expensive = result.candidates.find((c) => c.model_id === 'a')!;
      const cheap = result.candidates.find((c) => c.model_id === 'b')!;

      expect(expensive.cost_penalty).toBeGreaterThan(cheap.cost_penalty);
      expect(expensive.latency_penalty).toBeGreaterThan(cheap.latency_penalty);
      expect(expensive.verbosity_penalty).toBeGreaterThan(cheap.verbosity_penalty);
    });
  });

  describe('Cursor subscription virtual cost (SP-096)', () => {
    it('prefers economical API model over composer-latest on low-requirement main_loop', () => {
      const fleet = [
        makeModel({
          id: 'composer-latest',
          tier: 'frontier-cloud',
          provider: 'cursor',
          capabilities: { reasoning: 0.85, code_gen: 0.95, tool_use: 0.9 },
          pricing: { fallback_cost_per_1m: 0.0, quota_cost_per_1m: 3.0 },
          performance: { latency_p50_ms: 400, verbosity_factor: 1.05 },
        }),
        makeModel({
          id: 'gemini-2.5-flash-lite',
          tier: 'economical-cloud',
          provider: 'google',
          capabilities: { reasoning: 0.7, code_gen: 0.75, tool_use: 0.7 },
          pricing: { fallback_cost_per_1m: 0.15 },
          performance: { latency_p50_ms: 280, verbosity_factor: 0.95 },
        }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'composer-latest', score: 0.88 }),
        makeCandidate({ model_id: 'gemini-2.5-flash-lite', score: 0.86 }),
      ];
      const weights: FrugalityWeights = {
        lambda_cost: 0.5,
        lambda_latency: 0.1,
        lambda_verbosity: 0.15,
      };

      const result = scoreMultiObjective(hydra, fleet, weights);

      expect(result.selected!.model_id).toBe('gemini-2.5-flash-lite');
    });

    it('selects frontier composer when economical candidate is shortfall-rejected', () => {
      const fleet = [
        makeModel({
          id: 'composer-latest',
          tier: 'frontier-cloud',
          provider: 'cursor',
          capabilities: { reasoning: 0.85, code_gen: 0.95, tool_use: 0.9 },
          pricing: { fallback_cost_per_1m: 0.0, quota_cost_per_1m: 3.0 },
        }),
        makeModel({
          id: 'gemini-2.5-flash-lite',
          tier: 'economical-cloud',
          provider: 'google',
          capabilities: { reasoning: 0.7, code_gen: 0.75, tool_use: 0.7 },
          pricing: { fallback_cost_per_1m: 0.15 },
        }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'composer-latest', score: 0.88 }),
        makeCandidate({
          model_id: 'gemini-2.5-flash-lite',
          score: 0,
          rejected_reason: 'shortfall_gate',
        }),
      ];

      const result = scoreMultiObjective(hydra, fleet, DEFAULT_WEIGHTS);

      expect(result.selected!.model_id).toBe('composer-latest');
    });

    it('does not treat zero fallback alone as cheapest when quota cost is set', () => {
      const fleet = [
        makeModel({
          id: 'composer-latest',
          pricing: { fallback_cost_per_1m: 0.0, quota_cost_per_1m: 3.0 },
        }),
        makeModel({
          id: 'cheap-api',
          pricing: { fallback_cost_per_1m: 0.8 },
        }),
      ];
      const hydra = [
        makeCandidate({ model_id: 'composer-latest', score: 0.85 }),
        makeCandidate({ model_id: 'cheap-api', score: 0.84 }),
      ];
      const weights: FrugalityWeights = {
        lambda_cost: 0.9,
        lambda_latency: 0,
        lambda_verbosity: 0,
      };

      const result = scoreMultiObjective(hydra, fleet, weights);

      expect(result.selected!.model_id).toBe('cheap-api');
    });
  });
});
