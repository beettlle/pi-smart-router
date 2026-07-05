import { describe, it, expect, vi } from 'vitest';
import {
  HydraMatcher,
  projectToRequirements,
  type EmbeddingProvider,
  type RequirementVector,
  type HydraMatcherConfig,
} from '../../src/domain/matching/hydra-matcher.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    request_id: 'req-001',
    session_id: 'sess-001',
    prompt_text: 'Implement a binary search tree with deletion',
    ...overrides,
  };
}

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

function makeMockProvider(
  requirements: RequirementVector,
  delayMs = 0,
): EmbeddingProvider {
  return {
    extractRequirements: vi.fn(async () => {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return requirements;
    }),
    dispose: vi.fn(async () => {}),
  };
}

const DEFAULT_CONFIG: HydraMatcherConfig = {
  artifactCachePath: '.pi-smart-router/models/',
  budgetMs: 100,
};

// ─── HydraMatcher ────────────────────────────────────────────────────────────

describe('HydraMatcher', () => {
  describe('constructor', () => {
    it('accepts budget within 80–120ms range', () => {
      const provider = makeMockProvider({ reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 });
      expect(() => new HydraMatcher(provider, { ...DEFAULT_CONFIG, budgetMs: 80 })).not.toThrow();
      expect(() => new HydraMatcher(provider, { ...DEFAULT_CONFIG, budgetMs: 120 })).not.toThrow();
    });

    it('rejects budget outside 80–120ms range', () => {
      const provider = makeMockProvider({ reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 });
      expect(() => new HydraMatcher(provider, { ...DEFAULT_CONFIG, budgetMs: 79 })).toThrow(
        /budget must be 80–120ms/,
      );
      expect(() => new HydraMatcher(provider, { ...DEFAULT_CONFIG, budgetMs: 121 })).toThrow(
        /budget must be 80–120ms/,
      );
    });

    it('defaults budget to 100ms when unspecified', () => {
      const provider = makeMockProvider({ reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 });
      expect(
        () => new HydraMatcher(provider, { artifactCachePath: '.models/' }),
      ).not.toThrow();
    });
  });

  describe('shortfall gate', () => {
    it('rejects candidate when reasoning capability is insufficient', async () => {
      const requirements: RequirementVector = { reasoning: 0.9, code_gen: 0.5, tool_use: 0.3 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'weak-reasoner', capabilities: { reasoning: 0.4, code_gen: 0.8, tool_use: 0.8 } }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected).toBeNull();
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]!.rejected_reason).toBe('shortfall_gate');
      expect(result.candidates[0]!.shortfall).toBeGreaterThan(0);
    });

    it('rejects candidate when code_gen capability is insufficient', async () => {
      const requirements: RequirementVector = { reasoning: 0.3, code_gen: 0.9, tool_use: 0.3 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'weak-coder', capabilities: { reasoning: 0.9, code_gen: 0.2, tool_use: 0.9 } }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected).toBeNull();
      expect(result.candidates[0]!.rejected_reason).toBe('shortfall_gate');
    });

    it('rejects candidate when tool_use capability is insufficient', async () => {
      const requirements: RequirementVector = { reasoning: 0.3, code_gen: 0.3, tool_use: 0.9 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'weak-tools', capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.1 } }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected).toBeNull();
      expect(result.candidates[0]!.rejected_reason).toBe('shortfall_gate');
    });

    it('accepts candidate when all capabilities meet requirements', async () => {
      const requirements: RequirementVector = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'capable', capabilities: { reasoning: 0.8, code_gen: 0.9, tool_use: 0.7 } }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected).not.toBeNull();
      expect(result.selected!.model_id).toBe('capable');
      expect(result.selected!.shortfall).toBe(0);
      expect(result.selected!.rejected_reason).toBeNull();
    });

    it('accepts candidate when capabilities exactly match requirements', async () => {
      const requirements: RequirementVector = { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'exact', capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 } }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected).not.toBeNull();
      expect(result.selected!.model_id).toBe('exact');
      expect(result.selected!.shortfall).toBe(0);
    });
  });

  describe('candidate scoring', () => {
    it('selects highest-scoring viable candidate', async () => {
      const requirements: RequirementVector = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'low-match', capabilities: { reasoning: 0.6, code_gen: 0.5, tool_use: 0.5 } }),
        makeModel({ id: 'high-match', capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 } }),
        makeModel({ id: 'mid-match', capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 } }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected).not.toBeNull();
      expect(result.selected!.model_id).toBe('high-match');
      expect(result.candidates).toHaveLength(3);
      expect(result.candidates.every((c) => c.rejected_reason === null)).toBe(true);
    });

    it('skips rejected candidates when selecting best', async () => {
      const requirements: RequirementVector = { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'too-weak', capabilities: { reasoning: 0.3, code_gen: 0.3, tool_use: 0.3 } }),
        makeModel({ id: 'good-enough', capabilities: { reasoning: 0.8, code_gen: 0.8, tool_use: 0.8 } }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected!.model_id).toBe('good-enough');
      const tooWeak = result.candidates.find((c) => c.model_id === 'too-weak');
      const goodEnough = result.candidates.find((c) => c.model_id === 'good-enough');
      expect(tooWeak!.rejected_reason).toBe('shortfall_gate');
      expect(goodEnough!.rejected_reason).toBeNull();
    });

    it('returns score=0 for rejected candidates', async () => {
      const requirements: RequirementVector = { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'weak', capabilities: { reasoning: 0.1, code_gen: 0.1, tool_use: 0.1 } }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.candidates[0]!.score).toBe(0);
    });
  });

  describe('fleet filtering', () => {
    it('excludes unhealthy models from scoring', async () => {
      const requirements: RequirementVector = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'unhealthy', healthy: false, capabilities: { reasoning: 1, code_gen: 1, tool_use: 1 } }),
        makeModel({ id: 'healthy', healthy: true, capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 } }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]!.model_id).toBe('healthy');
    });

    it('treats undefined healthy as healthy', async () => {
      const requirements: RequirementVector = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'no-health-field' }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.candidates).toHaveLength(1);
    });

    it('returns null selection for empty fleet', async () => {
      const requirements: RequirementVector = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const result = await matcher.match(makeRequest(), []);

      expect(result.selected).toBeNull();
      expect(result.candidates).toHaveLength(0);
    });

    it('returns null selection when all models are unhealthy', async () => {
      const requirements: RequirementVector = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'a', healthy: false }),
        makeModel({ id: 'b', healthy: false }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected).toBeNull();
      expect(result.candidates).toHaveLength(0);
    });

    it('returns null selection when all candidates are rejected', async () => {
      const requirements: RequirementVector = { reasoning: 0.99, code_gen: 0.99, tool_use: 0.99 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({ id: 'a', capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 } }),
        makeModel({ id: 'b', capabilities: { reasoning: 0.6, code_gen: 0.6, tool_use: 0.6 } }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected).toBeNull();
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.every((c) => c.rejected_reason === 'shortfall_gate')).toBe(true);
    });
  });

  describe('requirement extraction', () => {
    it('calls provider with prompt_text from request', async () => {
      const requirements: RequirementVector = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const request = makeRequest({ prompt_text: 'Explain quantum entanglement' });
      await matcher.match(request, [makeModel()]);

      expect(provider.extractRequirements).toHaveBeenCalledWith('Explain quantum entanglement');
    });

    it('rejects non-finite requirement values', async () => {
      const provider: EmbeddingProvider = {
        extractRequirements: vi.fn(async () => ({
          reasoning: NaN,
          code_gen: 0.5,
          tool_use: 0.5,
        })),
        dispose: vi.fn(async () => {}),
      };
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      await expect(matcher.match(makeRequest(), [makeModel()])).rejects.toThrow(
        /Invalid requirement dimension/,
      );
    });

    it('rejects Infinity requirement values', async () => {
      const provider: EmbeddingProvider = {
        extractRequirements: vi.fn(async () => ({
          reasoning: 0.5,
          code_gen: Infinity,
          tool_use: 0.5,
        })),
        dispose: vi.fn(async () => {}),
      };
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      await expect(matcher.match(makeRequest(), [makeModel()])).rejects.toThrow(
        /Invalid requirement dimension/,
      );
    });
  });

  describe('result metadata', () => {
    it('includes requirement vector in result', async () => {
      const requirements: RequirementVector = { reasoning: 0.6, code_gen: 0.7, tool_use: 0.8 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const result = await matcher.match(makeRequest(), [makeModel()]);

      expect(result.requirements).toEqual(requirements);
    });

    it('records elapsed time', async () => {
      const requirements: RequirementVector = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const result = await matcher.match(makeRequest(), [makeModel()]);

      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.elapsedMs).toBe('number');
    });

    it('reports budgetExceeded=false for fast matches', async () => {
      const requirements: RequirementVector = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const result = await matcher.match(makeRequest(), [makeModel()]);

      expect(result.budgetExceeded).toBe(false);
    });
  });

  describe('dispose', () => {
    it('delegates to provider dispose', async () => {
      const provider = makeMockProvider({ reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 });
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      await matcher.dispose();

      expect(provider.dispose).toHaveBeenCalledOnce();
    });
  });

  describe('multi-objective selection (FR-021)', () => {
    /** Models with nearly identical cosine scores — frugality weights decide the winner. */
    const parityRequirements: RequirementVector = {
      reasoning: 0.5,
      code_gen: 0.5,
      tool_use: 0.5,
    };

    it('prefers cheaper model at quality parity when lambda_cost is high', async () => {
      const provider = makeMockProvider(parityRequirements);
      const matcher = new HydraMatcher(provider, {
        ...DEFAULT_CONFIG,
        frugality: { lambda_cost: 0.9, lambda_latency: 0, lambda_verbosity: 0 },
      });

      const fleet: ModelProfile[] = [
        makeModel({
          id: 'premium',
          capabilities: { reasoning: 0.71, code_gen: 0.71, tool_use: 0.71 },
          pricing: { fallback_cost_per_1m: 60 },
        }),
        makeModel({
          id: 'economy',
          capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 },
          pricing: { fallback_cost_per_1m: 0.5 },
        }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected!.model_id).toBe('economy');
    });

    it('prefers lower-latency model at quality parity when lambda_latency is high', async () => {
      const provider = makeMockProvider(parityRequirements);
      const matcher = new HydraMatcher(provider, {
        ...DEFAULT_CONFIG,
        frugality: { lambda_cost: 0, lambda_latency: 0.9, lambda_verbosity: 0 },
      });

      const fleet: ModelProfile[] = [
        makeModel({
          id: 'slow',
          capabilities: { reasoning: 0.71, code_gen: 0.71, tool_use: 0.71 },
          pricing: { fallback_cost_per_1m: 1 },
          performance: { latency_p50_ms: 2000 },
        }),
        makeModel({
          id: 'fast',
          capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 },
          pricing: { fallback_cost_per_1m: 1 },
          performance: { latency_p50_ms: 100 },
        }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected!.model_id).toBe('fast');
    });

    it('prefers less verbose model at quality parity when lambda_verbosity is high', async () => {
      const provider = makeMockProvider(parityRequirements);
      const matcher = new HydraMatcher(provider, {
        ...DEFAULT_CONFIG,
        frugality: { lambda_cost: 0, lambda_latency: 0, lambda_verbosity: 0.9 },
      });

      const fleet: ModelProfile[] = [
        makeModel({
          id: 'verbose',
          capabilities: { reasoning: 0.71, code_gen: 0.71, tool_use: 0.71 },
          pricing: { fallback_cost_per_1m: 1 },
          performance: { verbosity_factor: 3.0 },
        }),
        makeModel({
          id: 'concise',
          capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 },
          pricing: { fallback_cost_per_1m: 1 },
          performance: { verbosity_factor: 0.5 },
        }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected!.model_id).toBe('concise');
    });

    it('preserves cosine-only ranking at default frugality weights with uniform fleet metrics', async () => {
      const provider = makeMockProvider(parityRequirements);
      const matcher = new HydraMatcher(provider, DEFAULT_CONFIG);

      const fleet: ModelProfile[] = [
        makeModel({
          id: 'low-match',
          capabilities: { reasoning: 0.6, code_gen: 0.5, tool_use: 0.5 },
        }),
        makeModel({
          id: 'high-match',
          capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
        }),
      ];

      const result = await matcher.match(makeRequest(), fleet);

      expect(result.selected!.model_id).toBe('high-match');
    });
  });
});

// ─── projectToRequirements ───────────────────────────────────────────────────

describe('projectToRequirements', () => {
  it('projects 384-dim embedding to 3 requirement dimensions', () => {
    const embedding = new Float32Array(384).fill(0);
    const req = projectToRequirements(embedding);

    expect(req).toHaveProperty('reasoning');
    expect(req).toHaveProperty('code_gen');
    expect(req).toHaveProperty('tool_use');
  });

  it('returns values in (0, 1) range via sigmoid', () => {
    const embedding = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      embedding[i] = (i % 10) * 0.1 - 0.5;
    }

    const req = projectToRequirements(embedding);

    expect(req.reasoning).toBeGreaterThan(0);
    expect(req.reasoning).toBeLessThan(1);
    expect(req.code_gen).toBeGreaterThan(0);
    expect(req.code_gen).toBeLessThan(1);
    expect(req.tool_use).toBeGreaterThan(0);
    expect(req.tool_use).toBeLessThan(1);
  });

  it('returns 0.5 for zero embedding (sigmoid(0) = 0.5)', () => {
    const embedding = new Float32Array(384).fill(0);
    const req = projectToRequirements(embedding);

    expect(req.reasoning).toBe(0.5);
    expect(req.code_gen).toBe(0.5);
    expect(req.tool_use).toBe(0.5);
  });

  it('rejects wrong-dimension embedding', () => {
    expect(() => projectToRequirements(new Float32Array(100))).toThrow(
      /Embedding shape mismatch/,
    );
    expect(() => projectToRequirements(new Float32Array(512))).toThrow(
      /Embedding shape mismatch/,
    );
  });

  it('is deterministic for same input', () => {
    const embedding = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      embedding[i] = Math.sin(i);
    }

    const a = projectToRequirements(embedding);
    const b = projectToRequirements(embedding);

    expect(a).toEqual(b);
  });
});
