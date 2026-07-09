# Task: SP-138 — HyDRA seven-flag metadata prefix extension

**Created:** 2026-07-09
**Size:** M

## Review Level: 1

**Assessment:** #76 part 1 — extend SP-112 four-flag prefix toward HyDRA seven-flag spec.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#76
- Release: v0.3.0 Calibration
- Bucket: feature

## Mission

Document delta vs HyDRA reference seven-flag spec. Extend `buildHydraInput` in `hydra-input.ts` with three additional metadata flags (e.g. compaction, loop-escalation state, attachment indicator) as calibration data supports. Keep privacy-safe metadata only. Update unit tests; prefix format documented in data-model.

## Dependencies

- SP-112 (landed)

## Context to Read First

- `src/domain/matching/hydra-input.ts`
- `src/domain/matching/hydra-matcher.ts`
- `tests/unit/hydra-matcher.test.ts`
- `specs/001-build-smart-router/data-model.md`
- `docs/routing-roadmap.md` — HyDRA 7-flag row

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/hydra-input.ts` |
| May change | `tests/unit/hydra-matcher.test.ts`, `tests/unit/hydra-input.test.ts`, `specs/001-build-smart-router/data-model.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/matching/hydra-input.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Seven-flag prefix format; delta doc in data-model; tests for new flags; encoder input excludes prior assistant responses per #76. |

## Steps

### Step 1: Spec delta documentation

- [ ] Document SP-112 4-flag vs HyDRA 7-flag mapping in data-model
- [ ] List chosen extension flags and rationale

### Step 2: Prefix builder extension

- [ ] Add three new flags to `buildHydraInput`
- [ ] Derive flag values from `RoutingRequest` fields only

### Step 3: Testing and verification

- [ ] Unit tests for extended prefix format
- [ ] Regression: same prompt different metadata → different embed input
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Extended prefix implemented and tested
- [ ] HyDRA delta documented
- [ ] No raw prompt leakage in metadata
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-138): description`

## Do NOT

- Retrain projection head (SP-139)

---
