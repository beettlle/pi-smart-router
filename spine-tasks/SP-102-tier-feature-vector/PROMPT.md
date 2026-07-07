# Task: SP-102 — Tier feature vector and low-intensity score

**Created:** 2026-07-06
**Size:** M

## Review Level: 1

**Assessment:** #57 — pure domain feature vector from structural/envelope signals plus scoreLowIntensity for tier gate.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#57
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Build `src/domain/routing/tier-features.ts`: aggregate signals from RoutingRequest, triage, HyDRA requirements, and cluster match into `TierFeatureVector`. Implement `scoreLowIntensity(features)` as configurable weighted combination (0..1). Pure functions, no I/O. Export features for dataset recorder (#61 training).

## Dependencies

- SP-101

## Context to Read First

- `src/domain/routing/triage-engine.ts`
- `src/domain/matching/cluster-matcher.ts` (SP-101)
- `src/config/defaults.ts`
- SP-091 estimated_input_tokens plumbing

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/tier-features.ts` |
| May change | `src/config/defaults.ts`, `tests/unit/tier-features.test.ts`, `src/infrastructure/telemetry/dataset-recorder.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/routing/tier-features.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Pure functions unit tested; simple Q&A scores high low-intensity; planning+architecture scores low; weights configurable; features exportable to dataset. |

## Steps

### Step 1: TierFeatureVector and buildTierFeatures

- [ ] Define readonly feature fields (prompt_length, estimated_input_tokens, cyclomatic_score, turn_type, cluster_similarity, etc.)
- [ ] Implement `buildTierFeatures(request, triage, hydraRequirements?, clusterMatch?)`

### Step 2: scoreLowIntensity and config

- [ ] Weighted combination with configurable weights in DEFAULT_OPERATOR_CONFIG
- [ ] Unit tests: "what is 2+2?" high score; architecture planning turn low score
- [ ] Hook feature export for dataset recorder (scalar fields only, no plaintext)

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Pure function, fully unit tested, no I/O
- [ ] Simple prompts score high on low-intensity
- [ ] Planning with architecture keywords scores low
- [ ] Features exported to dataset recorder for P(success) training
- [ ] Weights configurable via operator config
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-102): description`

## Do NOT

- Add pipeline stage (SP-103)

---
