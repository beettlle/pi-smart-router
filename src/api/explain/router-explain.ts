/**
 * Explain endpoint handler — T041.
 *
 * Returns routing rationale (tier, stage, reason_code, candidates) without
 * dispatching upstream inference. Runs the same pipeline as the live path
 * to guarantee bit-for-bit decision equivalence.
 *
 * Contract: specs/001-build-smart-router/contracts/explain-endpoint.md v1.0.0
 *
 * Invariants:
 *   - MUST NOT call upstream LLM providers
 *   - MUST produce a decision identical to the live pipeline for the same input
 *   - MUST emit no RoutingTelemetry with upstream cost (routing_latency_ms only)
 */

import type { ModelProfile, RoutingDecision, RoutingRequest, Message } from '../../domain/types/index.js';
import { RoutingRequestSchema } from '../../domain/types/schemas.js';
import { RouterPipeline } from '../../domain/pipeline/router-pipeline.js';
import { safeCloudDefault } from '../../domain/pipeline/safe-default.js';
import type { ClusterMatcher } from '../../domain/matching/cluster-matcher.js';
import { enrichRoutingDecisionForExplain } from '../../infrastructure/telemetry/routing-telemetry.js';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ExplainValidationError {
  readonly error: 'validation_failed';
  readonly details: readonly string[];
}

export interface ExplainSuccess {
  readonly status: 200;
  readonly body: RoutingDecision;
}

export interface ExplainBadRequest {
  readonly status: 400;
  readonly body: ExplainValidationError;
}

export interface ExplainUnavailable {
  readonly status: 503;
  readonly body: RoutingDecision;
}

export type ExplainResult = ExplainSuccess | ExplainBadRequest | ExplainUnavailable;

// ─── Handler dependencies ─────────────────────────────────────────────────────

export interface ExplainHandlerDeps {
  readonly fleet: readonly ModelProfile[];
  readonly pipeline: RouterPipeline;
  readonly clusterMatcher?: ClusterMatcher;
}

// ─── Handler factory ──────────────────────────────────────────────────────────

/**
 * Create an explain handler bound to a shared pipeline instance.
 *
 * Reuses the same RouterPipeline as the live dispatch path so
 * session pin state and stage ordering are identical.
 */
export function createExplainHandler(deps: ExplainHandlerDeps) {
  const { fleet, pipeline, clusterMatcher } = deps;

  return async function explain(rawBody: unknown): Promise<ExplainResult> {
    const parsed = RoutingRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return {
        status: 400,
        body: {
          error: 'validation_failed',
          details: parsed.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.message}`,
          ),
        },
      };
    }

    const request = toRoutingRequest(parsed.data);
    const start = performance.now();

    try {
      const decision = await pipeline.route(request);
      return {
        status: 200,
        body: await enrichRoutingDecisionForExplain(request, decision, {
          fleet,
          ...(clusterMatcher !== undefined ? { clusterMatcher } : {}),
        }),
      };
    } catch {
      const fallbackModel = safeCloudDefault(fleet);
      const decision: RoutingDecision = {
        request_id: request.request_id,
        selected_model_id: fallbackModel?.id ?? 'unknown',
        tier: fallbackModel?.tier ?? 'economical-cloud',
        stage: 'fallback',
        reason_code: 'safe_default',
        routing_latency_ms: performance.now() - start,
        pin_reason: null,
      };
      return {
        status: 503,
        body: await enrichRoutingDecisionForExplain(request, decision, {
          fleet,
          ...(clusterMatcher !== undefined ? { clusterMatcher } : {}),
        }),
      };
    }
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type ParsedRequest = ReturnType<typeof RoutingRequestSchema.parse>;

/**
 * Map Zod-validated data to the domain RoutingRequest entity, bridging
 * schema field names (tool_call_id/tool_calls) to entity shape (tool_blocks)
 * and satisfying exactOptionalPropertyTypes constraints.
 */
function toRoutingRequest(data: ParsedRequest): RoutingRequest {
  // Build with known required fields, then add optional fields only when present
  // to satisfy exactOptionalPropertyTypes (no explicit undefined values).
  const result: { request_id: string; session_id: string; prompt_text: string; [k: string]: unknown } = {
    request_id: data.request_id,
    session_id: data.session_id,
    prompt_text: data.prompt_text,
  };

  if (data.messages !== undefined) {
    result['messages'] = data.messages.map((m): Message => ({
      role: m.role,
      content: m.content,
      ...(m.tool_calls !== undefined ? { tool_blocks: m.tool_calls } : {}),
    }));
  }
  if (data.turn_type !== undefined) result['turn_type'] = data.turn_type;
  if (data.compaction_flag !== undefined) result['compaction_flag'] = data.compaction_flag;
  if (data.force_model_id !== undefined) result['force_model_id'] = data.force_model_id;
  if (data.estimated_input_tokens !== undefined) result['estimated_input_tokens'] = data.estimated_input_tokens;

  return result as RoutingRequest;
}
