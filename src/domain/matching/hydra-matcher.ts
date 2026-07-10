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

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { DEFAULT_OPERATOR_CONFIG } from '../../config/defaults.js';
import { buildHydraInput } from './hydra-input.js';
import {
  createTextEmbedder,
  EMBEDDING_DIM,
  type TextEmbedder,
} from './embedding-provider.js';
import {
  createModernBertHeadsPredictor,
  type K4CapabilityVector,
  type ModernBertHeadsPredictor,
} from './modernbert-heads.js';
import type { Encoder, HydraConfig, HydraHeads } from '../types/schemas.js';
import { DEFAULT_ENCODER, DEFAULT_HYDRA_HEADS } from '../types/schemas.js';
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
  readonly encoder?: Encoder;
  readonly hydraHeads?: HydraHeads;
  readonly budgetMs?: number;
  readonly frugality?: FrugalityWeights;
  readonly projectionWeightsPath?: string;
  readonly k4HeadWeightsPath?: string;
}

const DEFAULT_BUDGET_MS = 100;
const MIN_BUDGET_MS = 80;
const MAX_BUDGET_MS = 120;

export const DEFAULT_HYDRA_PROJECTION_WEIGHTS_PATH = resolve(
  'config',
  'hydra-projection-weights.json',
);

export const HYDRA_PROJECTION_OUTPUT_DIM = 3;

export const HydraProjectionWeightsSchema = z.object({
  version: z.literal(1),
  embedding_dim: z.literal(EMBEDDING_DIM),
  weights: z
    .array(z.array(z.number().finite()).length(EMBEDDING_DIM))
    .length(HYDRA_PROJECTION_OUTPUT_DIM),
  bias: z.array(z.number().finite()).length(HYDRA_PROJECTION_OUTPUT_DIM),
});

export interface HydraProjectionWeights {
  readonly version: 1;
  readonly embedding_dim: typeof EMBEDDING_DIM;
  readonly weights: readonly (readonly number[])[];
  readonly bias: readonly number[];
}

export interface LoadHydraProjectionWeightsOptions {
  readonly filePath?: string;
}

export class HydraProjectionWeightsLoaderError extends Error {
  override readonly name = 'HydraProjectionWeightsLoaderError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
}

export function parseHydraProjectionWeightsJson(raw: string): HydraProjectionWeights {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HydraProjectionWeightsLoaderError(`Failed to parse JSON: ${message}`, {
      cause: err,
    });
  }

  const result = HydraProjectionWeightsSchema.safeParse(parsed);
  if (!result.success) {
    throw new HydraProjectionWeightsLoaderError(
      `Invalid HyDRA projection weights artifact:\n${formatZodIssues(result.error)}`,
      { cause: result.error },
    );
  }

  return result.data;
}

/**
 * Load HyDRA projection weights from disk. Returns null when the artifact is
 * missing; throws only when the file exists but is invalid.
 */
export function loadHydraProjectionWeights(
  options?: LoadHydraProjectionWeightsOptions,
): HydraProjectionWeights | null {
  const filePath = options?.filePath ?? DEFAULT_HYDRA_PROJECTION_WEIGHTS_PATH;

  if (!existsSync(filePath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HydraProjectionWeightsLoaderError(`Failed to read weights file: ${message}`, {
      cause: err,
    });
  }

  return parseHydraProjectionWeightsJson(raw);
}

/** Resolve projection weights — missing artifacts fall back to placeholder projection. */
export function resolveHydraProjectionWeights(
  options?: LoadHydraProjectionWeightsOptions,
): HydraProjectionWeights | null {
  try {
    return loadHydraProjectionWeights(options);
  } catch (err: unknown) {
    console.warn('HyDRA projection weights artifact invalid; using placeholder projection', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

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

function projectToRequirementsPlaceholder(embedding: Float32Array): RequirementVector {
  const third = Math.floor(EMBEDDING_DIM / 3);

  return {
    reasoning: sigmoid(meanSlice(embedding, 0, third)),
    code_gen: sigmoid(meanSlice(embedding, third, 2 * third)),
    tool_use: sigmoid(meanSlice(embedding, 2 * third, EMBEDDING_DIM)),
  };
}

function linearProjection(
  embedding: Float32Array,
  weights: HydraProjectionWeights,
): readonly [number, number, number] {
  const logits: number[] = [];

  for (let dim = 0; dim < HYDRA_PROJECTION_OUTPUT_DIM; dim++) {
    const row = weights.weights[dim]!;
    let sum = weights.bias[dim] ?? 0;
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      sum += (embedding[i] ?? 0) * (row[i] ?? 0);
    }
    logits.push(sum);
  }

  return [logits[0]!, logits[1]!, logits[2]!];
}

function projectToRequirementsLearned(
  embedding: Float32Array,
  weights: HydraProjectionWeights,
): RequirementVector {
  const [reasoningLogit, codeGenLogit, toolUseLogit] = linearProjection(embedding, weights);

  return {
    reasoning: sigmoid(reasoningLogit),
    code_gen: sigmoid(codeGenLogit),
    tool_use: sigmoid(toolUseLogit),
  };
}

/**
 * Project a 384-dim embedding to 3 requirement dimensions.
 *
 * Uses learned linear projection (sigmoid(embedding @ W + b)) when weights are
 * provided; otherwise falls back to deterministic mean-pooled-thirds placeholder.
 */
export function projectToRequirements(
  embedding: Float32Array,
  weights?: HydraProjectionWeights | null,
): RequirementVector {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding shape mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`,
    );
  }

  if (weights) {
    return projectToRequirementsLearned(embedding, weights);
  }

  return projectToRequirementsPlaceholder(embedding);
}

// ─── K=4 → requirement vector (catalog shortfall uses 3 dims only) ───────────

/**
 * Map ModernBERT K=4 head output to the 3-dim requirement vector used by the
 * catalog-decoupled shortfall gate. The debugging dimension is predicted for
 * HyDRA fidelity but excluded from shortfall matching (SP-159, routing-roadmap §2 P3).
 */
export function k4CapabilityVectorToRequirements(
  vector: K4CapabilityVector,
): RequirementVector {
  return {
    reasoning: vector.reasoning,
    code_gen: vector.code_gen,
    tool_use: vector.tool_use,
  };
}

// ─── HyDRA embedding adapter ─────────────────────────────────────────────────

/**
 * Adapts a shared TextEmbedder for HyDRA requirement extraction.
 * dispose() delegates to the underlying embedder for shared lifecycle.
 */
export function wrapHydraEmbeddingProvider(
  embedder: TextEmbedder,
  projectionWeights?: HydraProjectionWeights | null,
): EmbeddingProvider {
  return {
    async extractRequirements(text: string): Promise<RequirementVector> {
      const embedding = await embedder.embed(text);
      return projectToRequirements(embedding, projectionWeights);
    },

    async dispose(): Promise<void> {
      await embedder.dispose();
    },
  };
}

/**
 * Adapts a ModernBERT K=4 heads predictor for HyDRA requirement extraction.
 * Debugging dimension is dropped before shortfall gate evaluation.
 */
export function wrapModernBertHeadsEmbeddingProvider(
  predictor: ModernBertHeadsPredictor,
): EmbeddingProvider {
  return {
    async extractRequirements(text: string): Promise<RequirementVector> {
      const k4 = await predictor.predictCapabilities(text);
      return k4CapabilityVectorToRequirements(k4);
    },

    async dispose(): Promise<void> {
      await predictor.dispose();
    },
  };
}

// ─── HydraMatcher ────────────────────────────────────────────────────────────

export class HydraMatcher {
  private readonly provider: EmbeddingProvider;
  private readonly budgetMs: number;
  private readonly frugality: FrugalityWeights;
  private readonly hydraHeads: HydraHeads;
  private readonly projectionWeights: HydraProjectionWeights | null;

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
    this.hydraHeads = config.hydraHeads ?? DEFAULT_HYDRA_HEADS;
    this.projectionWeights =
      this.hydraHeads === 'learned_projection'
        ? resolveHydraProjectionWeights(
            config.projectionWeightsPath ? { filePath: config.projectionWeightsPath } : undefined,
          )
        : null;
  }

  /** Active requirement head mode from operator hydra config. */
  hydraHeadsMode(): HydraHeads {
    return this.hydraHeads;
  }

  /** Whether ModernBERT K=4 heads mode is active. */
  usesModernBertK4(): boolean {
    return this.hydraHeads === 'modernbert_k4';
  }

  /** Whether learned SP-115 projection weights were loaded at init. */
  usesLearnedProjection(): boolean {
    return this.hydraHeads === 'learned_projection' && this.projectionWeights !== null;
  }

  async match(
    request: RoutingRequest,
    fleet: readonly ModelProfile[],
  ): Promise<MatchResult> {
    const start = performance.now();

    const requirements = await this.provider.extractRequirements(
      buildHydraInput(request),
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

export interface CreateOnnxEmbeddingProviderOptions {
  readonly encoder?: Encoder;
  readonly projectionWeightsPath?: string;
}

export interface CreateHydraEmbeddingProviderOptions extends CreateOnnxEmbeddingProviderOptions {
  readonly hydraHeads?: HydraHeads;
  readonly k4HeadWeightsPath?: string;
}

/**
 * Creates an EmbeddingProvider backed by the shared ONNX text embedder.
 * For multi-matcher setups, create one TextEmbedder via createTextEmbedder
 * and pass wrapHydraEmbeddingProvider(embedder) to HyDRA while sharing embed().
 */
export async function createOnnxEmbeddingProvider(
  artifactCachePath: string,
  options?: CreateOnnxEmbeddingProviderOptions,
): Promise<EmbeddingProvider> {
  const encoder = options?.encoder ?? DEFAULT_ENCODER;
  const embedder = await createTextEmbedder(encoder, artifactCachePath);
  const projectionWeights = resolveHydraProjectionWeights(
    options?.projectionWeightsPath ? { filePath: options.projectionWeightsPath } : undefined,
  );
  return wrapHydraEmbeddingProvider(embedder, projectionWeights);
}

/**
 * Creates an EmbeddingProvider for the configured hydra_heads mode:
 * - `learned_projection` — MiniLM/Granite embedder + SP-115 linear projection (or placeholder)
 * - `modernbert_k4` — ModernBERT-base [CLS] with K=4 sigmoid heads (debugging excluded from shortfall)
 */
export async function createHydraEmbeddingProvider(
  artifactCachePath: string,
  options?: CreateHydraEmbeddingProviderOptions,
): Promise<EmbeddingProvider> {
  const hydraHeads = options?.hydraHeads ?? DEFAULT_HYDRA_HEADS;

  if (hydraHeads === 'modernbert_k4') {
    const predictorOptions =
      options?.k4HeadWeightsPath === undefined
        ? undefined
        : { headWeightsPath: options.k4HeadWeightsPath };
    const predictor = await createModernBertHeadsPredictor(
      artifactCachePath,
      predictorOptions,
    );
    return wrapModernBertHeadsEmbeddingProvider(predictor);
  }

  return createOnnxEmbeddingProvider(artifactCachePath, options);
}

/**
 * Bootstrap HyDRA matcher from operator hydra config (encoder, heads, artifact path).
 */
export async function createHydraMatcherFromHydraConfig(
  hydraConfig: Pick<HydraConfig, 'artifact_cache_path'> &
    Partial<Pick<HydraConfig, 'encoder' | 'hydra_heads'>>,
  options?: Omit<HydraMatcherConfig, 'artifactCachePath' | 'encoder' | 'hydraHeads'>,
): Promise<HydraMatcher> {
  const encoder = hydraConfig.encoder ?? DEFAULT_ENCODER;
  const hydraHeads = hydraConfig.hydra_heads ?? DEFAULT_HYDRA_HEADS;
  const provider = await createHydraEmbeddingProvider(hydraConfig.artifact_cache_path, {
    encoder,
    hydraHeads,
    ...(options?.projectionWeightsPath === undefined
      ? {}
      : { projectionWeightsPath: options.projectionWeightsPath }),
    ...(options?.k4HeadWeightsPath === undefined
      ? {}
      : { k4HeadWeightsPath: options.k4HeadWeightsPath }),
  });
  return new HydraMatcher(provider, {
    artifactCachePath: hydraConfig.artifact_cache_path,
    encoder,
    hydraHeads,
    ...options,
  });
}
