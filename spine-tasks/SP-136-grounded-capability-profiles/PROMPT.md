# Task: SP-136 — Grounded capability profiles in mapper

**Created:** 2026-07-09
**Size:** M

## Review Level: 2

**Assessment:** #75 part 3 — replace static regex capability defaults with benchmark-grounded profiles in mapper.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#75
- Release: v0.3.0 Calibration
- Bucket: feature

## Mission

Wire SP-134/135 ingest output into `mapPiModelToProfile` and `models.yaml` so capability vectors derive from benchmark scores instead of hardcoded regex defaults (e.g. frontier ≈ 0.95). Shortfall gate uses updated profiles without encoder retrain. Fallback to regex defaults when benchmark data missing for a model id.

## Dependencies

- SP-135

## Context to Read First

- `src/config/pi-model-mapper.ts`
- `config/models.yaml` / `models.example.yaml`
- `src/domain/matching/hydra-matcher.ts` — shortfall consumer
- `scripts/ingest-benchmark-profiles.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts` |
| May change | `config/models.example.yaml`, `tests/unit/pi-model-mapper.test.ts`, `tests/integration/pi-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Mapper loads benchmark-grounded scores; integration test proves frontier floor from benchmarks; fallback documented; shortfall unchanged algorithmically. |

## Steps

### Step 1: Profile loader

- [ ] Load ingested benchmark artifact at mapper init
- [ ] Map model id → capability vector from benchmark dimensions

### Step 2: Mapper integration

- [ ] Replace static regex defaults when benchmark row exists
- [ ] Preserve fallback for unknown models

### Step 3: Testing and verification

- [ ] Unit tests: known model gets benchmark scores; unknown falls back
- [ ] Integration test: shortfall uses grounded profile
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Capability profiles grounded in benchmark data when available
- [ ] Regex fallback for missing models
- [ ] Tests prove behavior change vs hardcoded 0.95
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-136): description`

## Do NOT

- Add CI workflow (SP-137)
- Retrain encoder or projection (SP-139)

---
