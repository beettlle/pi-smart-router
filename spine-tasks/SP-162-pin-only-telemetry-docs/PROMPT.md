# Task: SP-162 — Pin-only eval trigger, telemetry, and README

**Created:** 2026-07-10
**Size:** S

## Review Level: 1

**Assessment:** #83 part 2 — automated trigger when shadow QR regresses >5%; telemetry when fallback active.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#83
- Release: v0.6.0
- Bucket: feature

## Mission

Wire eval harness metrics (SP-151+) to optionally auto-enable `pin_only_fallback` when shadow quality retention regresses >5% vs baseline. Add telemetry when fallback is active. Document operator manual trigger and automated threshold in README.

## Dependencies

- SP-161
- SP-152 (eval harness — landed)

## Context to Read First

- `scripts/eval-harness/`
- `src/infrastructure/telemetry/routing-telemetry.ts`
- `README.md` operator section
- GitHub #83 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/telemetry/routing-telemetry.ts` |
| May change | `scripts/eval-harness/quality-retention.ts`, `README.md`, `tests/unit/routing-telemetry.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/infrastructure/telemetry/routing-telemetry.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Eval harness QR regression trigger; telemetry when fallback active; README operator section. |

## Steps

### Step 1: Eval harness trigger

- [ ] Add quality retention check comparing shadow QR to baseline
- [ ] Auto-enable `pin_only_fallback` when regression >5% (configurable threshold)
- [ ] Support manual operator trigger override

### Step 2: Telemetry and README

- [ ] Emit telemetry event when pin-only fallback active
- [ ] Document emergency mode, automated trigger, and manual override in README

### Step 3: Testing and verification

- [ ] Unit tests for QR regression threshold logic
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Eval harness metrics trigger fallback when QR regresses >5%
- [ ] Telemetry when fallback active
- [ ] README operator section updated
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-162): description`

## Do NOT

- Change pin_only_fallback wiring (SP-161 scope)

---
