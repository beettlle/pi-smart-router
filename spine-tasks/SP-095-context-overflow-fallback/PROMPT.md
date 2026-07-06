# Task: SP-095 — Context-overflow fallback routing

**Created:** 2026-07-06
**Size:** M

## Review Level: 1

**Assessment:** Escalate to largest-fit model when economical/pinned models cannot fit context.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#51
- Bucket: feature

## Mission

When context-fit gate yields zero viable models in the current tier, fail gracefully upward:

1. Same-provider preference — largest-fit model from same provider as pinned model
2. Frontier escalation — cheapest frontier model that fits
3. Last resort — structured routing error suggesting compaction (never dispatch to undersized model)

Reason codes: `context_overflow_same_provider_fallback`, `context_overflow_frontier_fallback`, `context_overflow_no_fit`.

## Dependencies

- SP-093
- SP-094

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts`
- `src/domain/pipeline/safe-default.ts`
- `src/domain/routing/context-fit.ts`
- Epic: beettlle/pi-smart-router#46

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `src/domain/pipeline/safe-default.ts`, `src/domain/routing/context-fit.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Large context routes to largest-fit model; same-provider fallback tested; no_fit never delegates undersized; explain shows fallback reason. |

## Steps

### Step 1: Fallback policy implementation

- [ ] Implement same-provider then frontier escalation after context_fit + pin break
- [ ] Update safe-default to respect fit constraints
- [ ] Add reason codes to decision features

### Step 2: Tests

- [ ] 1M token estimate routes to largest-window frontier model
- [ ] Same-provider fallback when two Gemini models differ in window size
- [ ] context_overflow_no_fit never delegates undersized

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] 1M token estimate routes to largest-window frontier model, not flash-lite
- [ ] Same-provider fallback tested when two Gemini models differ in window size
- [ ] `context_overflow_no_fit` never delegates to a known undersized model
- [ ] Explain/telemetry shows fallback reason and rejected models
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-095): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
