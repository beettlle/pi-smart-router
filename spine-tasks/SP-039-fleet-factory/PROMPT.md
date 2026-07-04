# Task: SP-039 — Fleet Factory

**Created:** 2026-07-03
**Size:** S

## Review Level: 1

**Assessment:** New factory overload accepting pre-built fleet.
**Score:** 2/8

## Mission

Add `createRouterFromFleet(fleet: ModelProfile[]): RouterHandle` to `src/index.ts`. Accepts a pre-built fleet array (no YAML loading). Keep existing `createRouter()` for backward compatibility. Re-export from package.

## Dependencies

- SP-038

## Context to Read First

- `src/index.ts` — existing `createRouter()` factory
- `src/config/pi-model-mapper.ts` — fleet builder from SP-038

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/index.ts`, `tests/unit/fleet-factory.test.ts` |
| Must NOT change | `src/domain/pipeline/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/index.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/**` |

## Steps

### Step 1: Fleet factory function

- [ ] Add `createRouterFromFleet(fleet: ModelProfile[]): RouterHandle` to `src/index.ts`
- [ ] Reuse `GatewayDispatch` and `createPiRouterMiddleware` from existing factory
- [ ] Export `createRouterFromFleet` in package exports

### Step 2: Unit tests

- [ ] Test `createRouterFromFleet` with a minimal 3-model fleet
- [ ] Test it returns a valid `RouterHandle` with middleware, dispatch, fleet, register

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`

---

## Amendments (Added During Execution)
