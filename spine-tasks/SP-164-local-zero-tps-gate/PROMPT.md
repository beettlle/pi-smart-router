# Task: SP-164 — Gate local_zero on tokens_per_second threshold

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** #84 part 2 — gate local_zero on rolling median tok/s instead of boolean hardware probe only.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#84
- Release: v0.6.0
- Bucket: feature

## Mission

Wire throughput meter into router pipeline `local_zero` stage. Gate local_zero when rolling median `tokens_per_second` is below threshold; fall through to economical cloud. Record skip reason in telemetry. Unit tests with mocked throughput meter.

## Dependencies

- SP-163
- SP-161 (serializes router-pipeline.ts — must land after SP-161)

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts`
- `src/infrastructure/hardware/throughput-meter.ts`
- `src/infrastructure/telemetry/routing-telemetry.ts`
- GitHub #84 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `tests/unit/router-pipeline.test.ts`, `src/infrastructure/telemetry/routing-telemetry.ts` |
| Must NOT change | `src/domain/matching/hydra-matcher.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `src/domain/matching/hydra-matcher.ts` |
| completionCriteria | local_zero gated on tok/s threshold; fall through to cloud when below; skip reason telemetry; mocked throughput unit tests. |

## Steps

### Step 1: Pipeline integration

- [ ] Inject throughput meter into router pipeline
- [ ] In `localZeroTierStage`, check median tok/s before dispatch
- [ ] Skip local_zero when below threshold; return economical cloud path

### Step 2: Telemetry and tests

- [ ] Add `throughput_below_threshold` to local_zero skip reasons
- [ ] Unit tests with mocked throughput meter (above/below threshold)

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] local_zero gated on rolling median tok/s
- [ ] Fall through to economical cloud when below threshold
- [ ] Unit tests with mocked throughput meter
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-164): description`

## Do NOT

- Dogfood on Linux/Windows (#25/#26) — mocked tests only

---
