/**
 * HyDRA embedding matcher — T048, FR-005.
 *
 * Embeds prompt text via ONNX (Xenova/all-MiniLM-L6-v2 384-dim),
 * projects to requirement dimensions [reasoning, code_gen, tool_use],
 * and scores fleet candidates with a shortfall gate.
 *
 * Shortfall gate (data-model §Validation): candidate excluded when
 * any capability dimension shortfall > 0 (quality parity).
 *
 * Budget: 80–120 ms (configurable, default 100 ms).
 */

import { DEFAULT_OPERATOR_CONFIG } from '../../config/defaults.js';
import {
  createOnnxTextEmbedder,
  EMBEDDING_DIM,
  type TextEmbedder,
} from './embedding-provider.js';
import {
  scoreMultiObjective,
  type FrugalityWeights,
} from '../scoring/multi-objective.js';
import type {
  CandidateScore,
  ModelCapabilities,
  ModelProfile,
  RoutingRequest,
} from '../types/index.js';

// ─── Requirement vector ──────────────────────────────────────────────────────

export interface RequirementVector {
  readonly reasoning: number;
  readonly code_gen: number;
  readonly tool_use: number;
}

// ─── Embedding provider port ─────────────────────────────────────────────────

export interface EmbeddingProvider {
  extractRequirements(text: string): Promise<RequirementVector>;
  dispose(): Promise<void>;
}

// ─── Match result ────────────────────────────────────────────────────────────

export interface MatchResult {
  readonly selected: CandidateScore | null;
  readonly candidates: readonly CandidateScore[];
  readonly requirements: RequirementVector;
  readonly elapsedMs: number;
  readonly budgetExceeded: boolean;
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface HydraMatcherConfig {
  readonly artifactCachePath: string;
  readonly budgetMs?: number;
  readonly frugality?: FrugalityWeights;
}

const DEFAULT_BUDGET_MS = 100;
const MIN_BUDGET_MS = 80;
const MAX_BUDGET_MS = 120;

// ─── Scoring helpers ─────────────────────────────────────────────────────────

function dimensionShortfall(requirement: number, capability: number): number {
  return Math.max(0, requirement - capability);
}

interface ShortfallResult {
  readonly perDimension: RequirementVector;
  readonly max: number;
  readonly total: number;
}

function computeShortfall(
  requirement: RequirementVector,
  capabilities: ModelCapabilities,
): ShortfallResult {
  const reasoning = dimensionShortfall(requirement.reasoning, capabilities.reasoning);
  const codeGen = dimensionShortfall(requirement.code_gen, capabilities.code_gen);
  const toolUse = dimensionShortfall(requirement.tool_use, capabilities.tool_use);

  return {
    perDimension: { reasoning, code_gen: codeGen, tool_use: toolUse },
    max: Math.max(reasoning, codeGen, toolUse),
    total: reasoning + codeGen + toolUse,
  };
}

function cosineSimilarity(a: RequirementVector, b: ModelCapabilities): number {
  const dot =
    a.reasoning * b.reasoning + a.code_gen * b.code_gen + a.tool_use * b.tool_use;
  const magA = Math.sqrt(
    a.reasoning ** 2 + a.code_gen ** 2 + a.tool_use ** 2,
  );
  const magB = Math.sqrt(
    b.reasoning ** 2 + b.code_gen ** 2 + b.tool_use ** 2,
  );
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

// ─── Projection helpers (384-dim → 3 requirement dimensions) ─────────────────

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function meanSlice(embedding: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += embedding[i] ?? 0;
  }
  return sum / (end - start);
}

/**
 * Fixed deterministic projection from 384-dim embedding to 3 requirement
 * dimensions via mean-pooled thirds + sigmoid normalization.
 *
 * Production refinement: replace with a learned linear projection loaded
 * from artifact cache (Phase 2).
 */
export function projectToRequirements(embedding: Float32Array): RequirementVector {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding shape mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`,
    );
  }

  const third = Math.floor(EMBEDDING_DIM / 3);

  return {
    reasoning: sigmoid(meanSlice(embedding, 0, third)),
    code_gen: sigmoid(meanSlice(embedding, third, 2 * third)),
    tool_use: sigmoid(meanSlice(embedding, 2 * third, EMBEDDING_DIM)),
  };
}

// ─── HyDRA embedding adapter ─────────────────────────────────────────────────

/**
 * Adapts a shared TextEmbedder for HyDRA requirement extraction.
 * dispose() delegates to the underlying embedder for shared lifecycle.
 */
export function wrapHydraEmbeddingProvider(embedder: TextEmbedder): EmbeddingProvider {
  return {
    async extractRequirements(text: string): Promise<RequirementVector> {
      const embedding = await embedder.embed(text);
      return projectToRequirements(embedding);
    },

    async dispose(): Promise<void> {
      await embedder.dispose();
    },
  };
}

// ─── HydraMatcher ────────────────────────────────────────────────────────────

export class HydraMatcher {
  private readonly provider: EmbeddingProvider;
  private readonly budgetMs: number;
  private readonly frugality: FrugalityWeights;

  constructor(provider: EmbeddingProvider, config: HydraMatcherConfig) {
    const budget = config.budgetMs ?? DEFAULT_BUDGET_MS;
    if (budget < MIN_BUDGET_MS || budget > MAX_BUDGET_MS) {
      throw new Error(
        `HyDRA budget must be ${MIN_BUDGET_MS}–${MAX_BUDGET_MS}ms, got ${budget}ms`,
      );
    }
    this.provider = provider;
    this.budgetMs = budget;
    this.frugality = config.frugality ?? DEFAULT_OPERATOR_CONFIG.frugality;
  }

  async match(
    request: RoutingRequest,
    fleet: readonly ModelProfile[],
  ): Promise<MatchResult> {
    const start = performance.now();

    const requirements = await this.provider.extractRequirements(
      request.prompt_text,
    );
    this.validateRequirements(requirements);

    const healthyFleet = fleet.filter((m) => m.healthy !== false);
    const candidates: CandidateScore[] = [];

    for (const model of healthyFleet) {
      const elapsed = performance.now() - start;
      if (elapsed > this.budgetMs) {
        break;
      }

      const shortfall = computeShortfall(requirements, model.capabilities);
      const hasShortfall = shortfall.max > 0;

      const score = hasShortfall
        ? 0
        : cosineSimilarity(requirements, model.capabilities);

      candidates.push({
        model_id: model.id,
        score,
        shortfall: shortfall.max,
        rejected_reason: hasShortfall ? 'shortfall_gate' : null,
      });
    }

    const shortfallByModel = new Map(
      candidates.map((c) => [c.model_id, c.shortfall]),
    );
    const multiObjective = scoreMultiObjective(
      candidates,
      healthyFleet,
      this.frugality,
    );

    const toCandidateScore = (
      scored: (typeof multiObjective.candidates)[number],
    ): CandidateScore => ({
      model_id: scored.model_id,
      score: scored.composite_score,
      shortfall: shortfallByModel.get(scored.model_id) ?? 0,
      rejected_reason: scored.rejected_reason,
    });

    const rankedCandidates = multiObjective.candidates.map(toCandidateScore);
    const selected = multiObjective.selected
      ? toCandidateScore(multiObjective.selected)
      : null;

    const elapsedMs = performance.now() - start;

    return {
      selected,
      candidates: rankedCandidates,
      requirements,
      elapsedMs,
      budgetExceeded: elapsedMs > this.budgetMs,
    };
  }

  async dispose(): Promise<void> {
    await this.provider.dispose();
  }

  private validateRequirements(req: RequirementVector): void {
    const dims: readonly (keyof RequirementVector)[] = [
      'reasoning',
      'code_gen',
      'tool_use',
    ];
    for (const key of dims) {
      const value = req[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(
          `Invalid requirement dimension '${key}': ${String(value)}`,
        );
      }
    }
  }
}

// ─── ONNX embedding provider factory ─────────────────────────────────────────

/**
 * Creates an EmbeddingProvider backed by the shared ONNX text embedder.
 * For multi-matcher setups, create one TextEmbedder via createOnnxTextEmbedder
 * and pass wrapHydraEmbeddingProvider(embedder) to HyDRA while sharing embed().
 */
export async function createOnnxEmbeddingProvider(
  artifactCachePath: string,
): Promise<EmbeddingProvider> {
  const embedder = await createOnnxTextEmbedder(artifactCachePath);
  return wrapHydraEmbeddingProvider(embedder);
}
