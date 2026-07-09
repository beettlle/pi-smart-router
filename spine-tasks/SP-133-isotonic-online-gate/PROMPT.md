# Task: SP-133 — Online isotonic P(success) lookup in low_intensity gate

**Created:** 2026-07-09
**Size:** S

## Review Level: 2

**Assessment:** #74 part 3 — serve-time isotonic lookup <5ms in low_intensity gate.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#74
- Release: v0.3.0 Calibration
- Bucket: feature

## Mission

Load `isotonic_calibrator` from routing-calibration bundle at runtime. Apply calibrated P(success) in `low_intensity` gate after logistic baseline. Expose calibrated score in telemetry/explain. Fallback to raw logistic when artifact missing. Benchmark lookup stays under 5ms (unit test with timing guard or documented O(log n) binary search on knots).

## Dependencies

- SP-132

## Context to Read First

- `src/domain/routing/p-success-classifier.ts`
- `src/domain/pipeline/router-pipeline.ts` — `lowIntensityGate`
- `src/infrastructure/telemetry/routing-telemetry.ts`
- `spine-tasks/SP-105-psuccess-online-inference/PROMPT.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/isotonic-calibrator.ts`, `src/domain/pipeline/router-pipeline.ts` |
| May change | `src/domain/routing/p-success-classifier.ts`, `src/infrastructure/telemetry/routing-telemetry.ts`, `src/api/explain/router-explain.ts`, `tests/unit/p-success-classifier.test.ts`, `tests/unit/isotonic-calibrator.test.ts`, `tests/integration/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/routing/isotonic-calibrator.ts`, `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Calibrated P(success) used in gate; telemetry shows raw + calibrated; fallback when missing; tests pass. |

## Steps

### Step 1: Runtime calibrator loader

- [ ] Parse isotonic knots from bundle in classifier module
- [ ] `applyIsotonicCalibrator(rawScore)` with monotonic lookup

### Step 2: Pipeline and observability

- [ ] Wire calibrated score in `lowIntensityGate`
- [ ] Telemetry/explain fields: `p_success_raw`, `p_success_calibrated`

### Step 3: Testing and verification

- [ ] Unit tests: monotonic mapping, missing artifact fallback
- [ ] Integration test: gate uses calibrated threshold
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Online lookup applied in low_intensity gate
- [ ] Observability shows calibration applied
- [ ] Graceful fallback without bundle artifact
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-133): description`

## Do NOT

- Change isotonic train script (SP-132)
- Modify benchmark profile ingest (SP-134+)

## Amendments (Added During Execution)

**2026-07-09 — Pre-land redirect after SP-131 wave 0:** `p-success-classifier.ts` already changed on `main` for richer labels. Extract runtime isotonic lookup into new `src/domain/routing/isotonic-calibrator.ts`; wire from classifier/pipeline via May change paths.

---
