# Task: SP-074 — Cache Economics Wiring

**Created:** 2026-07-05
**Size:** S

## Review Level: 1

**Assessment:** Wire `evaluateCacheEconomics()` into SessionPinner FR-008 break rule #4.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#32
- Bucket: feature

## Mission

`evaluateCacheEconomics()` exists in `src/domain/pinning/cache-economics.ts` with unit tests, but `SessionPinner.evaluateBreakRules()` leaves rule #4 as a stub. Wire the evaluator so cross-provider switch proposals respect cache-warmup economics (FR-008, SC-006 scenario 4).

When a provider switch is considered via optional `candidate_model_id` on `RoutingRequest`:
- Different provider + `shouldSwitch: true` → break pin (`cache_economics`)
- Different provider + `shouldSwitch: false` → keep pin (`use_pin`)
- Same provider → no cache gate (return null from rule #4)

## Dependencies

- SP-073

## Context to Read First

- `src/domain/pinning/session-pinner.ts` — stub at lines 193–195
- `src/domain/pinning/cache-economics.ts`
- `src/domain/types/entities.ts` and `schemas.ts` — RoutingRequest
- `tests/unit/session-pinner.test.ts` — evaluateCacheEconomics tests + break rules

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pinning/session-pinner.ts` |
| May change | `src/domain/types/entities.ts`, `src/domain/types/schemas.ts`, `tests/unit/session-pinner.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pinning/session-pinner.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Rule #4 calls evaluateCacheEconomics for cross-provider candidate_model_id; integration tests cover keep-pin and break-pin paths; existing cache-economics unit tests remain green. |

## Steps

### Step 1: Extend RoutingRequest

- [ ] Add optional `candidate_model_id?: string` to `RoutingRequest` and `RoutingRequestSchema`

### Step 2: Wire rule #4 in SessionPinner

- [ ] Import `evaluateCacheEconomics` and optional `CacheEconomicsConfig` on `SessionPinnerConfig`
- [ ] In `evaluateBreakRules`, when `candidate_model_id` targets a healthy fleet model on a different provider than the pin, call `evaluateCacheEconomics`
- [ ] `shouldSwitch: true` → `breakPin` + return `{ action: 'break', breakReason: 'cache_economics' }`
- [ ] `shouldSwitch: false` → return `{ action: 'use_pin', pinnedModel }` (block switch)
- [ ] Remove stub comment; update file header doc

### Step 3: Integration tests

- [ ] Add `lookupPin` tests: cross-provider candidate with uneconomical switch keeps pin
- [ ] Add `lookupPin` test: cross-provider candidate with justified savings breaks pin with `cache_economics`

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] FR-008 rule #4 enforced at runtime
- [ ] Integration tests for pin-break path
- [ ] No pipeline changes in this task

## Git Commit Convention

- `feat(SP-074): description`

## Do NOT

- Change pipeline stage order
- Modify loop escalation in this task

---

## Amendments (Added During Execution)
