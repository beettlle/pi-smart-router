# Task: SP-105 — P(success) online inference in low-intensity gate

**Created:** 2026-07-06
**Size:** M

## Review Level: 2

**Assessment:** #61 Phase B — load coefficients at runtime; route cheap when P_success_cheap >= alpha in low-intensity gate.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#61
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Load P(success) coefficients from config artifact (`config/p-success-weights.json`). In low-intensity gate (SP-103), route to cheap tier when `P_success_cheap >= alpha`. Alpha tunable via operator config (cost-quality knob). Target < 5ms inference. Log feature importances for operator inspection. Fall back when artifact missing or insufficient training history.

## Dependencies

- SP-104
- SP-103

## Context to Read First

- `src/domain/routing/p-success-classifier.ts` (SP-104)
- `src/domain/pipeline/router-pipeline.ts` — low_intensity stage
- `src/config/defaults.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `src/domain/routing/p-success-classifier.ts`, `src/config/defaults.ts`, `tests/unit/p-success-classifier.test.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Online inference in low_intensity gate; alpha configurable; <5ms budget; graceful fallback; pipeline tests for P(success) routing. |

## Steps

### Step 1: Online inference loader

- [ ] Load weights artifact at router init (or lazy load with cache)
- [ ] predict(features) → P_success_cheap with timing guard

### Step 2: Wire into low_intensity gate

- [ ] When P_success_cheap >= alpha, bias tier_hint toward economical/local
- [ ] When below alpha, defer or bias frontier per existing structural score
- [ ] Telemetry: record P_success and alpha in decision features

### Step 3: Testing and verification

- [ ] Unit test: high P → economical hint; low P → frontier or defer
- [ ] Missing artifact → graceful fallback (no throw)
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Online inference adds < 5ms
- [ ] alpha tunable in operator config
- [ ] Falls back gracefully when insufficient training data or missing artifact
- [ ] Feature importances or P_success logged for explain
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-105): description`

## Do NOT

- Implement expected-cost formula (SP-106)

---
