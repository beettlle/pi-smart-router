import { describe, expect, it } from 'vitest';

import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import type { ClusterMatchResult } from '../../src/domain/matching/cluster-matcher.js';
import {
  buildTierFeatures,
  computeCodeBlockRatio,
  exportTierFeaturesForDataset,
  scoreLowIntensity,
} from '../../src/domain/routing/tier-features.js';
import { triage } from '../../src/domain/triage/triage-engine.js';
import type { RequirementVector, RoutingRequest } from '../../src/domain/types/index.js';
import { buildDatasetRecord } from '../../src/infrastructure/telemetry/dataset-recorder.js';

function makeRequest(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    request_id: '11111111-1111-4111-8111-111111111111',
    session_id: 'session-1',
    prompt_text: 'what is 2+2 ?',
    turn_type: 'main_loop',
    estimated_input_tokens: 8,
    ...overrides,
  };
}

function makeClusterMatch(
  overrides: Partial<ClusterMatchResult> = {},
): ClusterMatchResult {
  return {
    clusterId: 'low_stakes_general',
    tierBias: 'zero-tier',
    similarity: 0.92,
    margin: 0.12,
    confidence: 'high',
    elapsedMs: 3,
    ...overrides,
  };
}

describe('tier-features', () => {
  describe('buildTierFeatures', () => {
    it('aggregates request, triage, HyDRA, and cluster signals', () => {
      const request = makeRequest({
        prompt_text: '```ts\nif (a) { b(); }\n```\nfix lint',
        messages: [
          { role: 'user', content: 'fix lint' },
          { role: 'tool', content: 'done', tool_call_id: 't1' },
        ],
        turn_type: 'tool_result',
        estimated_input_tokens: 120,
      });
      const triageResult = triage(request.prompt_text);
      const requirements: RequirementVector = {
        reasoning: 0.2,
        code_gen: 0.8,
        tool_use: 0.4,
      };
      const cluster = makeClusterMatch();

      const features = buildTierFeatures(
        request,
        triageResult,
        requirements,
        cluster,
      );

      expect(features.prompt_length_chars).toBe(request.prompt_text.length);
      expect(features.estimated_input_tokens).toBe(120);
      expect(features.cyclomatic_score).toBe(triageResult.cyclomatic_score);
      expect(features.trivial_hits).toBe(triageResult.trivial_hits);
      expect(features.complex_hits).toBe(triageResult.complex_hits);
      expect(features.turn_type).toBe('tool_result');
      expect(features.has_tool_context).toBe(true);
      expect(features.message_count).toBe(2);
      expect(features.code_block_ratio).toBeGreaterThan(0);
      expect(features.requirement_magnitude).toBe(0.8);
      expect(features.cluster_similarity).toBe(0.92);
      expect(features.cluster_margin).toBe(0.12);
      expect(features.cluster_confidence).toBe('high');
      expect(features.cluster_id).toBe('low_stakes_general');
      expect(features.cluster_tier_bias).toBe('zero-tier');
    });

    it('falls back to char/4 token estimate when estimated_input_tokens is absent', () => {
      const request = makeRequest({
        prompt_text: 'abcd',
        estimated_input_tokens: undefined,
      });
      const features = buildTierFeatures(request, triage(request.prompt_text));

      expect(features.estimated_input_tokens).toBe(1);
    });
  });

  describe('computeCodeBlockRatio', () => {
    it('returns 0 for prose-only prompts', () => {
      expect(computeCodeBlockRatio('what is 2+2 ?')).toBe(0);
    });

    it('returns fenced block ratio for mixed prompts', () => {
      const prompt = 'help\n```js\nconst x = 1;\n```\n';
      expect(computeCodeBlockRatio(prompt)).toBeGreaterThan(0);
      expect(computeCodeBlockRatio(prompt)).toBeLessThanOrEqual(1);
    });
  });

  describe('scoreLowIntensity', () => {
    it('scores simple Q&A highly', () => {
      const request = makeRequest({ prompt_text: 'what is 2+2 ?' });
      const features = buildTierFeatures(request, triage(request.prompt_text));
      const score = scoreLowIntensity(
        features,
        DEFAULT_OPERATOR_CONFIG.low_intensity.weights,
      );

      expect(score).toBeGreaterThan(0.7);
    });

    it('scores planning architecture turns low', () => {
      const prompt =
        'Plan the architecture for a distributed payment service with migration strategy';
      const request = makeRequest({
        prompt_text: prompt,
        turn_type: 'planning',
        messages: [{ role: 'user', content: prompt }],
        estimated_input_tokens: 40,
      });
      const features = buildTierFeatures(
        request,
        triage(prompt),
        { reasoning: 0.85, code_gen: 0.55, tool_use: 0.2 },
      );
      const score = scoreLowIntensity(
        features,
        DEFAULT_OPERATOR_CONFIG.low_intensity.weights,
      );

      expect(score).toBeLessThan(0.35);
    });

    it('boosts low-stakes cluster matches with high confidence', () => {
      const request = makeRequest({ prompt_text: 'what is 2+2 ?' });
      const withoutCluster = scoreLowIntensity(
        buildTierFeatures(request, triage(request.prompt_text)),
      );
      const withCluster = scoreLowIntensity(
        buildTierFeatures(
          request,
          triage(request.prompt_text),
          undefined,
          makeClusterMatch(),
        ),
      );

      expect(withCluster).toBeGreaterThan(withoutCluster);
    });

    it('penalizes frontier-biased high-confidence clusters', () => {
      const request = makeRequest({
        prompt_text: 'architect a distributed cache layer',
        turn_type: 'planning',
      });
      const score = scoreLowIntensity(
        buildTierFeatures(
          request,
          triage(request.prompt_text),
          { reasoning: 0.9, code_gen: 0.7, tool_use: 0.2 },
          makeClusterMatch({
            clusterId: 'architecture',
            tierBias: 'frontier-cloud',
            similarity: 0.9,
            confidence: 'high',
          }),
        ),
      );

      expect(score).toBeLessThan(0.4);
    });
  });

  describe('exportTierFeaturesForDataset', () => {
    it('exports scalar fields without prompt text', () => {
      const request = makeRequest();
      const features = buildTierFeatures(request, triage(request.prompt_text));
      const score = scoreLowIntensity(features);
      const scalars = exportTierFeaturesForDataset(features, score);

      expect(scalars).toEqual({
        triage_trivial_hits: features.trivial_hits,
        triage_complex_hits: features.complex_hits,
        triage_sanitized_length_delta: features.sanitized_length_delta,
        code_block_ratio: features.code_block_ratio,
        requirement_magnitude: features.requirement_magnitude,
        cluster_similarity: features.cluster_similarity,
        cluster_margin: features.cluster_margin,
        low_intensity_score: score,
      });
      expect(JSON.stringify(scalars)).not.toMatch(/what is 2\+2/);
    });

    it('plumbs tier scalars into dataset recorder rows', () => {
      const request = makeRequest();
      const features = buildTierFeatures(request, triage(request.prompt_text));
      const score = scoreLowIntensity(features);
      const scalars = exportTierFeaturesForDataset(features, score);

      const record = buildDatasetRecord(
        request,
        {
          request_id: request.request_id,
          selected_model_id: 'gpt-5-mini',
          tier: 'economical-cloud',
          stage: 'hydra_match',
          reason_code: 'hydra_embedding_match',
          routing_latency_ms: 12,
          pin_reason: null,
        },
        '2026-07-06T00:00:00.000Z',
        null,
        scalars,
      );

      expect(record.triage_trivial_hits).toBe(features.trivial_hits);
      expect(record.triage_complex_hits).toBe(features.complex_hits);
      expect(record.triage_sanitized_length_delta).toBe(
        features.sanitized_length_delta,
      );
    });
  });
});
