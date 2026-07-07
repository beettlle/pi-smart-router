# Task: SP-115 — HyDRA learned 384×3 projection head

**Created:** 2026-07-07
**Size:** M

## Review Level: 2

**Assessment:** #65 — replace placeholder `projectToRequirements()` with learned linear projection loaded from static artifact.
**Score:** 5/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#65
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Load `config/hydra-projection-weights.json` (384×3 weights + bias) at `HydraMatcher` init. Replace mean-pooled-thirds placeholder with `requirements = sigmoid(embedding @ W + b)`. Fallback to deterministic placeholder when artifact missing. Add `npm run routing:test-projection` benchmark script. Artifact includes version field for future upgrades.

## Dependencies

- SP-112

## Context to Read First

- `src/domain/matching/hydra-matcher.ts` — `projectToRequirements`
- `config/hydra-projection-weights.json.example` (create)
- `tests/unit/hydra-matcher.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/hydra-matcher.ts` |
| May change | `config/hydra-projection-weights.json.example`, `package.json`, `tests/unit/hydra-matcher.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/matching/hydra-matcher.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Learned projection when artifact present; placeholder fallback; no latency regression; unit tests for load/multiply/fallback; version field. |

## Steps

### Step 1: Artifact format and loader

- [ ] Define JSON artifact schema with version, weights, bias
- [ ] Create `config/hydra-projection-weights.json.example`
- [ ] Implement loader with graceful missing-artifact fallback

### Step 2: Projection head

- [ ] Replace `projectToRequirements` with matrix multiply + sigmoid
- [ ] Preserve backward-compatible placeholder when artifact absent
- [ ] Add `npm run routing:test-projection` benchmark script

### Step 3: Testing and verification

- [ ] Unit tests for load, multiply, fallback paths
- [ ] Confirm no latency regression beyond 80–120ms HyDRA budget
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Learned projection used when artifact present
- [ ] Placeholder fallback when artifact missing (backward compatible)
- [ ] No latency regression beyond current 80–120ms HyDRA budget
- [ ] Unit tests for load, multiply, fallback
- [ ] Artifact version field for future upgrades
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-115): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
