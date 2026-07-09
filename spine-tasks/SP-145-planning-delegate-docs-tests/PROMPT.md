# Task: SP-145 — Planning delegate integration tests and operator docs

**Created:** 2026-07-09
**Size:** S

## Review Level: 1

**Assessment:** #71 part 4 — end-to-end verification and operator documentation for cache-preserving planning delegate.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#71
- Release: v0.4.0 Delegate
- Bucket: feature

## Mission

Add integration coverage and operator documentation for the planning delegate feature. Prove multi-turn planning sessions preserve primary pin/cache while frontier reasoning runs via delegate. Document config knobs, fallback behavior, and dogfood verification steps in README or operator guide section.

## Dependencies

- SP-143
- SP-144

## Context to Read First

- `tests/integration/session-pinning.test.ts`
- `tests/unit/smart-router-extension.test.ts`
- `README.md` or `docs/` operator sections
- `spine-tasks/SP-143-turn-envelope-delegate-path/PROMPT.md`
- `spine-tasks/SP-144-extension-delegate-wiring/PROMPT.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/integration/` (new or extended planning-delegate test) |
| May change | `README.md`, `docs/routing-roadmap.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `tests/integration/planning-delegate.test.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Integration test proves planning delegate preserves primary model; operator docs describe config, fallback, and dogfood steps; #71 acceptance criteria met. |

## Steps

### Step 1: Integration test

- [ ] Add `tests/integration/planning-delegate.test.ts` (or extend session-pinning)
- [ ] Assert planning turn does not switch primary inference model when delegate path active
- [ ] Assert explain output documents delegate vs direct route

### Step 2: Operator documentation

- [ ] Document planning_delegate config and fallback in README or docs
- [ ] Note coordination boundary with pi core sub-agent orchestration

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Integration test covers #71 verification checklist
- [ ] Operator docs updated
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-145): description`

## Do NOT

- Re-implement pipeline or extension logic (SP-143, SP-144)

---
