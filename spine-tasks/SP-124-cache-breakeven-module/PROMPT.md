# Task: SP-124 — Cache breakeven formula module

**Created:** 2026-07-08
**Size:** S

## Review Level: 1

**Assessment:** #73 foundation — pure cache breakeven math (`marginal_savings + future_cache_value > cache_reprime_cost`) with unit tests, no pipeline wiring.
**Score:** 2/8 — Blast radius: 0, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#73
- Release: v0.2.0 Continuity
- Bucket: feature

## Mission

Implement the cache breakeven formula as a pure, testable domain module. Given marginal savings from a proposed tier switch, estimated future cache value (prefix discount), and cache reprime cost, return whether the switch is economically justified. Cover edge cases from the issue: cold session vs warm 100k-token prefix. This module is consumed by SP-125 for turn_envelope and pin-break gating.

Note: `cache-economics.ts` implements legacy FR-008 warmup rule (#32) — do not conflate; breakeven is a separate SAAR economics gate.

## Dependencies

- **None** (pure math; pipeline integration waits for SP-123)

## Context to Read First

- `src/domain/pinning/cache-economics.ts` (read-only — distinguish from new breakeven module)
- `docs/routing-roadmap.md` §2 P0 breakeven, §8 anti-pattern "Per-turn switch with warm cache"
- GitHub #73 issue body

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pinning/cache-breakeven.ts` |
| May change | `tests/unit/cache-breakeven.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/pinning/session-pinner.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test -- tests/unit/cache-breakeven.test.ts` |
| fileScopeMustChange | `src/domain/pinning/cache-breakeven.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Breakeven function with typed inputs/outputs; unit tests for cold vs warm prefix edge cases pass. |

## Steps

### Step 1: Breakeven module

- [ ] Create `cache-breakeven.ts` with `evaluateCacheBreakeven` (or equivalent) accepting marginal_savings, future_cache_value, cache_reprime_cost
- [ ] Return decision boolean plus component breakdown for explain (SP-126)
- [ ] Use `prefix_cache_weight` from SAAR config when computing future_cache_value

### Step 2: Edge case coverage

- [ ] Handle cold session (no prefix): reprime cost dominates
- [ ] Handle warm 100k-token prefix: future_cache_value may block switch
- [ ] Guard against negative or zero denominators; fail-safe to deny switch on invalid inputs

### Step 3: Testing and verification

- [ ] Unit tests: switch blocked when savings < reprime cost on warm prefix
- [ ] Unit tests: switch allowed when marginal savings + cache value exceeds reprime
- [ ] Run `npm run typecheck && npm test -- tests/unit/cache-breakeven.test.ts`

## Completion Criteria

- [ ] Pure breakeven module with typed API
- [ ] Cold vs warm prefix edge cases covered by unit tests
- [ ] No pipeline or session-pinner wiring yet
- [ ] Targeted unit tests pass

## Git Commit Convention

- `feat(SP-124): description`

## Do NOT

- Wire into router-pipeline (SP-125)
- Modify legacy `cache-economics.ts` warmup rule
- Add subscription quota λ (deferred to #78 / v0.5.0)

---
