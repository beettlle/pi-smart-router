# Task: SP-096 — Cursor subscription virtual cost for HyDRA scoring

**Created:** 2026-07-06
**Size:** M

## Review Level: 1

**Assessment:** P0 fix for #70 — assign non-zero virtual subscription cost to Cursor frontier models so multi-objective frugality no longer prefers composer-latest solely because cost is 0.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#70
- Bucket: bug

## Mission

Dogfooding hit Cursor Pro usage limits when HyDRA pinned `composer-latest` because SP-086 mapped `cursor/*` and `composer-*` to `fallback_cost_per_1m: 0.0`. Multi-objective scoring treats $0 models as cheapest, inverting cost optimization when subscription quota is the binding constraint.

Introduce subscription-aware economics: add a distinct `quota_cost_per_1m` (or equivalent virtual cost) on Cursor models used only for frugality scoring and telemetry, distinct from API `cost_per_1m`. Prefer economical API models for `main_loop` turns unless capability shortfall requires frontier.

## Dependencies

- SP-095

## Context to Read First

- `src/config/pi-model-mapper.ts` — `CURSOR_AUTO_DEFAULTS`, `COMPOSER_DEFAULTS`
- `src/domain/scoring/multi-objective.ts`
- `src/domain/types/entities.ts` — `ModelProfile` pricing fields
- `tests/unit/pi-model-mapper.test.ts`
- `tests/unit/multi-objective.test.ts` (or equivalent scoring tests)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts`, `src/domain/scoring/multi-objective.ts` |
| May change | `src/domain/types/entities.ts`, `src/infrastructure/telemetry/routing-telemetry.ts`, `tests/unit/pi-model-mapper.test.ts`, `tests/unit/multi-objective.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Cursor models have non-zero virtual subscription cost in scoring; economical API model wins over composer-latest on simple main_loop when both viable; unit tests cover inverted-selection regression. |

## Steps

### Step 1: Virtual subscription cost on Cursor models

- [ ] Add `quota_cost_per_1m` (or documented equivalent) to pricing on `ModelProfile` / mapper defaults
- [ ] Set non-zero virtual cost on `CURSOR_AUTO_DEFAULTS` and `COMPOSER_DEFAULTS` (configurable via operator defaults)
- [ ] Keep API `fallback_cost_per_1m` semantics documented in mapper comments

### Step 2: Multi-objective scoring integration

- [ ] Update `scoreMultiObjective()` to use virtual subscription cost for Cursor provider models in frugality dimension
- [ ] Ensure economical API models (e.g. gemini-flash-lite) outscore composer-latest when capabilities are sufficient
- [ ] Populate `estimated_cost_usd` in telemetry using virtual cost for Cursor models (not 0.0)

### Step 3: Testing and verification

- [ ] Unit test: composer-latest + gemini-flash-lite candidates — economical wins on low-requirement main_loop
- [ ] Unit test: frontier still selected when capability shortfall requires it
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Simple status/diagnostic `main_loop` prompts would route to economical tier, not composer-latest, when both are viable
- [ ] `composer-latest` is not preferred solely because `fallback_cost_per_1m === 0`
- [ ] Unit tests: multi-objective scoring with Cursor + API candidates
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-096): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)
- Change pipeline stage order (SP-103 handles tier gate)

---
