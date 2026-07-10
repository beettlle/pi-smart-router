# Task: SP-163 — Rolling median throughput meter

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** #84 part 1 — rolling median tokens_per_second estimate from local inference samples.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#84
- Release: v0.6.0
- Bucket: feature

## Mission

Implement rolling median `tokens_per_second` meter over last N local inference samples. Pure module with injectable store for testability. Human-usable threshold default ~25 tok/s. No pipeline wiring yet (SP-164).

## Dependencies

- SP-059 (local_zero decouple — landed)

## Context to Read First

- `src/infrastructure/hardware/hardware-probe.ts`
- `src/infrastructure/local/local-zero-tier.ts`
- `docs/routing-roadmap.md` §3
- GitHub #84 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/hardware/throughput-meter.ts` |
| May change | `tests/unit/throughput-meter.test.ts`, `src/domain/types/schemas.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/infrastructure/hardware/throughput-meter.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Rolling median over N samples; configurable window and threshold; unit tests with mocked samples. |

## Steps

### Step 1: Throughput meter module

- [ ] Implement `throughput-meter.ts` with rolling median over last N samples
- [ ] API: `recordSample(tokens, durationMs)`, `getMedianTps()`, `isAboveThreshold(threshold)`
- [ ] Default threshold ~25 tok/s; configurable window size

### Step 2: Config and unit tests

- [ ] Add throughput config to operator/hardware config schema
- [ ] Unit tests with mocked throughput samples (above/below threshold)

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Rolling median tokens_per_second meter
- [ ] Configurable window and threshold
- [ ] Unit tests with mocked samples
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-163): description`

## Do NOT

- MLX native backend
- Re-open #1, #25, #26 (dogfood deferred)

---
