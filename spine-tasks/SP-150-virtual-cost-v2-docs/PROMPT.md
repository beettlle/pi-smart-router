# Task: SP-150 — Virtual cost v2 operator docs and regression tests

**Created:** 2026-07-09
**Size:** S

## Review Level: 1

**Assessment:** #78 part 3 — operator documentation and regression coverage for virtual cost v2.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#78
- Release: v0.5.0
- Bucket: feature

## Mission

Document virtual cost v2 operator knobs (λ decay, window position, cache credit) in README. Add regression tests proving late-window routing prefers economical tiers and that cache credit prevents unnecessary pin breaks. Update explain endpoint examples if applicable.

## Dependencies

- SP-149

## Context to Read First

- `src/domain/pricing/virtual-cost-v2.ts`
- `README.md` operator section
- `docs/routing-roadmap.md` §2 P2
- GitHub #78 verification checklist

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` |
| May change | `tests/unit/virtual-cost-v2.test.ts`, `tests/unit/expected-cost.test.ts`, `tests/integration/routing-explain.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | README documents v2 knobs; regression tests for late-window and cache credit; verify:ci passes. |

## Steps

### Step 1: Operator documentation

- [ ] Document λ decay, window position config, and cache credit in README
- [ ] Note deterministic-only scope (no MDP)

### Step 2: Regression tests

- [ ] Late-window scenario: economical tier preferred over composer when quota low
- [ ] Cache credit scenario: pin preserved when savings exceed reprime

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] README operator section documents virtual cost v2
- [ ] Regression tests for late-window and cache credit scenarios
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-150): description`

## Do NOT

- Re-implement wiring (SP-149)
- Re-open or implement #1, #25, #26 (operator excluded)

---
