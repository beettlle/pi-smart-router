# Task: SP-106 — Expected-cost tier selection

**Created:** 2026-07-06
**Size:** M

## Review Level: 2

**Assessment:** #68 — integrate P(success) with price matrix in low-intensity gate; select tier minimizing E[cost] under uncertainty.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#68
- Bucket: feature
- Epic: beettlle/pi-smart-router#54, roadmap #63

## Mission

Pure function `expected-cost.ts` computes per-tier expected cost:

```
E[cost_T] = P(success | T, features) × cost_per_1m(T) × est_tokens
          + (1 - P(success | T)) × E[cost_escalation]
```

Wire into low-intensity gate alongside cluster similarity. Select tier minimizing E[cost] subject to context-fit (#49), local readiness (#59), and pin economics (FR-008 cache reprime). Operator knob `frugality.alpha` maps to cost-quality tradeoff. Telemetry records E[cost] per tier considered.

## Dependencies

- SP-105
- SP-103

## Context to Read First

- `src/domain/routing/p-success-classifier.ts` (SP-105)
- `src/infrastructure/pricing/price-broker.ts`
- `src/domain/routing/context-fit.ts` (SP-093)
- `src/domain/pinning/session-pinner.ts` — cache reprime (FR-008)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/expected-cost.ts` |
| May change | `src/domain/pipeline/router-pipeline.ts`, `src/config/defaults.ts`, `tests/unit/expected-cost.test.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/routing/expected-cost.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Cheap tier when P high and price delta significant; frontier when P low; respects pin/cache economics; unit tests with mocked catalog; telemetry E[cost] per tier. |

## Steps

### Step 1: expected-cost pure function

- [ ] Implement computeExpectedCost(tier, pSuccess, priceCatalog, estTokens, escalationCost)
- [ ] Integrate subscription virtual cost for Cursor tiers (SP-096)
- [ ] Unit tests with mocked price catalog and P(success)

### Step 2: Wire into low_intensity gate

- [ ] Compare E[cost] across viable tiers; set tier_hint to argmin
- [ ] Respect context-fit viable models per tier
- [ ] Do not switch tiers if cache reprime > savings (FR-008)
- [ ] Explain output: P(success), E[cost] per tier, chosen rationale

### Step 3: Testing and verification

- [ ] Cheap selected when P high AND price delta significant
- [ ] Frontier selected when P low even if cheap is cheaper per token
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Cheap tier selected when P(success) high AND price delta significant
- [ ] Frontier selected when P(success) low even if cheap is cheaper per token
- [ ] Respects pin economics — no tier switch when cache reprime > savings
- [ ] Unit tests with mocked price catalog and P(success)
- [ ] Telemetry records E[cost] estimates per tier considered
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-106): description`

## Do NOT

- Re-open or implement #1, #25, #26

---
