# Task: SP-149 — Virtual cost v2 expected-cost and breakeven wiring

**Created:** 2026-07-09
**Size:** M

## Review Level: 2

**Assessment:** #78 part 2 — integrate virtual cost v2 into expected-cost tier selection and cache breakeven gate.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#78
- Release: v0.5.0
- Bucket: feature

## Mission

Wire SP-148 virtual cost v2 into `expected-cost.ts` tier selection and SP-125 cache breakeven gate. Subscription-aware economics must influence E[cost] per tier and pin/break decisions. Late-window quota exhaustion risk should increase effective frontier cost; active KV-cache pin should credit savings. Telemetry records v2 cost components.

## Dependencies

- SP-148
- SP-125 (cache breakeven pipeline gate)

## Context to Read First

- `src/domain/pricing/virtual-cost-v2.ts`
- `src/domain/routing/expected-cost.ts`
- `src/domain/pinning/cache-breakeven.ts`
- `src/domain/pipeline/router-pipeline.ts` — low_intensity, session_pin stages
- `src/infrastructure/telemetry/routing-telemetry.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/expected-cost.ts` |
| May change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/pinning/session-pinner.ts`, `src/infrastructure/telemetry/routing-telemetry.ts`, `tests/unit/expected-cost.test.ts`, `tests/integration/session-pinning.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/routing/expected-cost.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Expected-cost uses v2 virtual cost; breakeven gate composes cache credit; integration tests pass; telemetry shows v2 components. |

## Steps

### Step 1: Expected-cost integration

- [ ] Replace flat quota cost with v2 virtual cost in E[cost] computation
- [ ] Late-window exhaustion risk increases effective tier cost
- [ ] Explain output documents v2 cost breakdown

### Step 2: Breakeven and telemetry

- [ ] Compose KV-cache savings credit with breakeven gate decisions
- [ ] Telemetry records quota premium and cache credit separately

### Step 3: Testing and verification

- [ ] Expected-cost integration tests with window position scenarios
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Expected-cost tier selection uses virtual cost v2
- [ ] Breakeven gate composes cache credit
- [ ] Expected-cost integration tests pass
- [ ] Telemetry records v2 components
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-149): description`

## Do NOT

- Re-implement v2 formula (SP-148)
- Re-open or implement #1, #25, #26 (operator excluded)

---
