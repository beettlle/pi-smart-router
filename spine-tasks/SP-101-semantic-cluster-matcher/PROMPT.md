# Task: SP-101 — Semantic cluster matcher

**Created:** 2026-07-06
**Size:** M

## Review Level: 2

**Assessment:** #56 — embed prompts and cosine-similarity match against cluster centroids for generic tier-bias routing.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#56
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Implement `src/domain/matching/cluster-matcher.ts`: load precomputed centroids from routing cluster config, embed `request.prompt_text` via shared embedder, cosine similarity against all centroids, return best match with confidence (high/low/none) based on min_similarity and min_margin thresholds.

Target: embed + compare < 5ms incremental over HyDRA budget.

## Dependencies

- SP-100

## Context to Read First

- `src/domain/matching/embedding-provider.ts` (SP-100)
- `src/config/routing-clusters-loader.ts` (SP-099)
- `src/domain/matching/hydra-matcher.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/cluster-matcher.ts` |
| May change | `tests/unit/cluster-matcher.test.ts`, `src/config/routing-clusters-loader.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/matching/cluster-matcher.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | low_stakes_general and architecture prompts match expected clusters in tests; low-confidence returns none; mocked embedding unit tests. |

## Steps

### Step 1: ClusterMatcher implementation

- [ ] Define `ClusterMatchResult` interface (clusterId, tierBias, similarity, margin, confidence, elapsedMs)
- [ ] Compute/load centroids from cluster config reference prompts
- [ ] Cosine similarity + confidence thresholds from config

### Step 2: Testing and verification

- [ ] Unit tests with mocked embeddings: "what is 2+2?" → low_stakes_general high confidence
- [ ] "architect a distributed cache layer" → architecture or deep_debug
- [ ] Low-confidence returns confidence: none
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `"what is 2+2 ?"` matches `low_stakes_general` above threshold
- [ ] Architecture prompts match appropriate frontier-bias cluster
- [ ] Low-confidence matches defer (confidence: none)
- [ ] Unit tests with mocked embeddings
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-101): description`

## Do NOT

- Wire into pipeline (SP-103)

---
