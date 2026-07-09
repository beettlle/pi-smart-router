# Task: SP-131 — Richer P(success) training labels

**Created:** 2026-07-09
**Size:** S

## Review Level: 1

**Assessment:** #74 part 1 — extend calibration export/aggregate with verifier-grade failure proxies beyond thumbs.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#74
- Release: v0.3.0 Calibration
- Bucket: feature

## Mission

Extend privacy-safe P(success) training labels in the calibration aggregate path: tool-failure chains, invalid `stop_reason`, re-prompt rate, and edit-distance proxies. Wire new label dimensions into `scripts/calibration-aggregate.ts` and `p-success-classifier.ts` training feature export without storing raw prompt text.

## Dependencies

- SP-117 (calibration train pipeline landed)

## Context to Read First

- `scripts/calibration-aggregate.ts`
- `src/domain/routing/p-success-classifier.ts`
- `src/domain/types/entities.ts` — outcome signal types
- `spine-tasks/SP-104-psuccess-training-export/PROMPT.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/calibration-aggregate.ts`, `src/domain/routing/p-success-classifier.ts` |
| May change | `tests/unit/calibration-aggregate.test.ts`, `tests/unit/p-success-classifier.test.ts`, `specs/001-build-smart-router/contracts/routing-calibration.schema.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/calibration-aggregate.ts`, `src/domain/routing/p-success-classifier.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | New failure proxies exported in aggregate rows; classifier training consumes them; unit tests cover label mapping; no raw prompt in export. |

## Steps

### Step 1: Label schema and aggregate mapping

- [ ] Define label fields for tool-failure chains, stop_reason failures, re-prompt, edit-distance proxy
- [ ] Map telemetry/outcome records in `calibration-aggregate.ts`
- [ ] Extend calibration bundle schema if needed

### Step 2: Classifier training consumption

- [ ] Update `p-success-classifier.ts` training path to use richer labels
- [ ] Keep `MIN_TRAINING_SAMPLES` guard and neutral fallback

### Step 3: Testing and verification

- [ ] Unit tests with fixture rows for each new label type
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Aggregate export includes richer failure proxies
- [ ] Classifier training uses new labels when present
- [ ] Privacy constraint preserved (no raw prompt text)
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-131): description`

## Do NOT

- Add isotonic calibrator (SP-132)
- Change low_intensity gate runtime scoring (SP-133)

---
