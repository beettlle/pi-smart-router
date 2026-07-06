# Task: SP-093 — Context-fit gate pipeline stage

**Created:** 2026-07-06
**Size:** M

## Review Level: 1

**Assessment:** Filter fleet by estimated_input_tokens vs model max_input_tokens before pin/HyDRA.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#49
- Bucket: feature

## Mission

Add a **context-fit gate** stage to `RouterPipeline` that removes models whose `max_input_tokens` cannot accommodate `estimated_input_tokens` (configurable safety margin, default 0.90).

Insert after hardware probe, before session pin:

```
... → context_fit → session_pin → triage → local_zero → hydra_match → ...
```

Implement pure `filterFleetByContextFit()` in domain; integrate into pipeline; attach summary to `RoutingDecision.features`.

## Dependencies

- SP-091
- SP-092

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts`
- `src/domain/types/entities.ts`
- Epic: beettlle/pi-smart-router#46

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `src/domain/routing/context-fit.ts`, `tests/unit/context-fit.test.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | context_fit stage filters oversized models; 34K request excludes 32K window; happy path unchanged; rejected candidates in decision features. |

## Steps

### Step 1: Pure context-fit filter

- [ ] Create `src/domain/routing/context-fit.ts` with `filterFleetByContextFit`
- [ ] Unit tests in `tests/unit/context-fit.test.ts`

### Step 2: Pipeline integration

- [ ] Add `context_fit` stage to router-pipeline
- [ ] Record rejected candidates in decision features
- [ ] Support `CONTEXT_FIT_SAFETY_MARGIN` env or operator config

### Step 3: Testing and verification

- [ ] Pipeline tests: 34K-token request excludes undersized models
- [ ] Regression: short prompt + small history unchanged
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] New stage `context_fit` in pipeline with tests
- [ ] 34K-token request excludes models with e.g. 32K window
- [ ] Short prompt + small history unchanged (no regression)
- [ ] Rejected candidates recorded in decision features
- [ ] Configurable safety margin
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-093): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
