# Task: SP-043 — Extension Integration Tests

**Created:** 2026-07-03
**Size:** S

## Review Level: 1

**Assessment:** Integration tests for pi provider extension flow.
**Score:** 2/8

## Mission

Write integration tests for the pi extension entry point. Mock `modelRegistry` with known models, verify `piModelMapper` classifies major model families, verify `createRouterFromFleet` produces a working pipeline, and verify stream delegation resolves the correct target model.

## Dependencies

- SP-042

## Context to Read First

- `.pi/extensions/smart-router/index.ts` — extension entry point from SP-040/041/042
- `src/config/pi-model-mapper.ts` — mapper from SP-038
- `src/index.ts` — `createRouterFromFleet()` from SP-039
- `tests/integration/pipeline-mvp.test.ts` — existing integration test pattern

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/integration/pi-extension.test.ts` |
| Must NOT change | `src/domain/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `tests/integration/pi-extension.test.ts` |
| fileScopeMustNotChange | `src/domain/**` |

## Steps

### Step 1: Integration test file

- [ ] Create `tests/integration/pi-extension.test.ts`
- [ ] Test `mapPiModelToProfile` with Claude, GPT, Gemini, local model inputs
- [ ] Test `mapFleetFromRegistry` builds correct fleet from mixed model set
- [ ] Test `createRouterFromFleet` returns valid `RouterHandle` with mapped fleet
- [ ] Test routing decision resolves to a fleet model for a sample request

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Confirm all existing 614+ tests still pass alongside new tests

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-043): description`

## Do NOT

- Modify domain layer (`src/domain/**`)
- Require a running pi instance; mock the extension API surface

---

## Amendments (Added During Execution)
