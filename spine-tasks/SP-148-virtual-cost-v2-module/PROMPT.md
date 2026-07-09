# Task: SP-148 — Virtual cost v2 formula module

**Created:** 2026-07-09
**Size:** M

## Review Level: 1

**Assessment:** #78 part 1 — quota decay λ and KV-cache savings credit in virtual cost formula.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#78
- Release: v0.5.0
- Bucket: feature

## Mission

Extend virtual cost beyond SP-096 flat `quota_cost_per_1m`. Implement `virtual_cost(turn)` with deterministic quota decay λ(remaining_window), exhaustion risk premium, and KV-cache savings credit (negative). Rolling window position for Cursor-style 5h limits. Pure function module in `src/domain/pricing/virtual-cost-v2.ts`. Deterministic multiplier only — not SeqRoute HBR+CQL or full MDP.

## Dependencies

- SP-096 (subscription virtual cost baseline)
- SP-106 (expected-cost consumer)

## Context to Read First

- `src/config/pi-model-mapper.ts` — Cursor defaults
- `src/domain/scoring/multi-objective.ts`
- `src/domain/routing/expected-cost.ts`
- `src/domain/pinning/cache-breakeven.ts`
- `docs/routing-roadmap.md` §2 P2 virtual cost v2
- GitHub #78 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pricing/virtual-cost-v2.ts` |
| May change | `src/domain/types/entities.ts`, `src/domain/types/schemas.ts`, `tests/unit/virtual-cost-v2.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pricing/virtual-cost-v2.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | λ decay and cache credit pure functions; unit tests for decay curves and credit; schema/types for window position if needed. |

## Steps

### Step 1: Virtual cost v2 pure functions

- [ ] Implement `computeVirtualCostV2()` with quota_arbitrage_premium and kv_cache_savings
- [ ] λ(remaining_window) decay for subscription quota position
- [ ] Operator config knobs with Zod defaults

### Step 2: Types and unit tests

- [ ] Extend pricing types if needed for window position
- [ ] Unit tests: λ decay at window start vs near exhaustion
- [ ] Unit tests: KV-cache savings credit reduces effective cost when pin active

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `virtual_cost(turn)` adds quota_arbitrage_premium and kv_cache_savings
- [ ] Rolling window position for Cursor-style limits
- [ ] Unit tests for λ decay and cache credit
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-148): description`

## Do NOT

- Full MDP / reinforcement learning quota policy
- Wire into pipeline (SP-149)
- Re-open or implement #1, #25, #26 (operator excluded)

---
