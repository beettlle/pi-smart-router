# Task: SP-298 — pi registry Model.cost is per-1M, not per-token

**Created:** 2026-10-19
**Size:** S

## Review Level: 2

**Assessment:** Unit bug — registry-derived prices are inflated 1e6× and mix badly with per-1M prices from LiteLLM, overrides, and quota cost.
**Score:** 4/8 — Blast radius: 3, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#175
- Release: v1.2.1
- Bucket: bug
- Closes: #175

## Mission

`deriveFallbackCostPer1M` in `src/config/pi-model-mapper.ts` multiplies pi `Model.cost.input` / `.output` by `1_000_000`, assuming per-token USD (LiteLLM convention). pi's `ModelCostRates` is **USD per 1M tokens** (pi `packages/ai/src/types.ts`, and `calculateCost` divides by 1e6). Fix:

- Drop the `* 1_000_000`; the fallback is `(input + output) / 2` in per-1M units.
- Treat any negative rate (OpenRouter `auto` variable-price sentinel `-1000000`) as unknown → return `undefined` so pattern defaults apply.
- Correct the `PiRegistryCost` doc comment to per-1M USD.
- Replace per-token fixtures (`1.5e-7` / `6e-7`) with pi-shaped values (gpt-4o-mini `0.15` / `0.6` → `0.375`) in `tests/unit/pi-model-mapper.test.ts` and `tests/unit/smart-router-pricing.test.ts`.

## Dependencies

- None

## Context to Read First

- `src/config/pi-model-mapper.ts` (`PiRegistryCost`, `deriveFallbackCostPer1M`, its caller)
- `tests/unit/pi-model-mapper.test.ts` (~L470–500)
- `tests/unit/smart-router-pricing.test.ts` (~L390–431)
- Issue beettlle/pi-smart-router#175

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts`, `tests/unit/pi-model-mapper.test.ts`, `tests/unit/smart-router-pricing.test.ts` |
| Must NOT change | `package.json`, `src/infrastructure/pricing/price-broker.ts`, `.pi/extensions/smart-router/fleet-bootstrap.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/smart-router-pricing.test.ts` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts`, `tests/unit/pi-model-mapper.test.ts` |
| fileScopeMustNotChange | `package.json`, `src/infrastructure/pricing/price-broker.ts` |
| completionCriteria | Registry cost treated as per-1M; negative rates → unknown; pi-shaped fixtures; tests green |

## Steps

### Step 0: Preflight

- [ ] Grep for other consumers that assume per-token registry cost (`cost.input`, `cost.output` under `src/` and `.pi/extensions/`) and record findings

### Step 1: Implementation

- [ ] Fix `deriveFallbackCostPer1M` units and the `PiRegistryCost` comment
- [ ] Negative rate → `undefined`
- [ ] Update fixtures; add tests for gpt-4o-mini `0.15/0.6 → 0.375` and the negative sentinel

### Step 2: Testing & Verification

- [ ] Run Contract `testCommand`

## Do NOT

- Change LiteLLM `computeCostPer1MTokens` (per-token is correct there)
- Change limits resolution (SP-299)

## Completion Criteria

- [ ] #175 acceptance met (registry and LiteLLM prices on the same per-1M scale)
- [ ] Contract tests green
