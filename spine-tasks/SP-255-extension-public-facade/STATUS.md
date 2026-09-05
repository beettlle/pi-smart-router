# SP-255 — Public package facade exports for extension needs — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-09-05
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Inventory deep imports
- [x] Map to planned exports

## Step 1: Facade exports

**Status:** Complete

- [x] Re-export required symbols
- [x] STATUS notes facade shape

## Step 2: Testing & Verification

**Status:** Complete

- [x] index-exports tests green
- [x] Extension tree unchanged

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-05 | 1 | plan | Skipped by engine (SP-195 — engine runs reviews after worker success) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-05 | Inventory: 78 deep `../../../src/` imports across 17 extension files; 37 src modules, 97 distinct symbols; 8 already exported from `src/index.ts` (ModelProfile, RoutingDecision, GatewayDispatchOptions, PiExtensionHooks, RouterHandle, createRouterFromFleet, LifecycleHookState, evictInMemorySessionState) | Facade must add ~89 re-exports |
| 2026-09-05 | Facade shape: additive grouped re-exports directly in `src/index.ts` (no separate `src/api/facade.ts`); no new factory — existing `createRouter*` exports unchanged | Single public surface; SP-256 migrates extension imports to `pi-smart-router` |
| 2026-09-05 | All 97 inventoried symbols now resolve from `src/index.ts` (117 total exports); `npm run typecheck` + `npx vitest run tests/unit/index-exports.test.ts` green (3 tests); extension tree, README, package.json, .eslintrc.cjs untouched | Contract testCommand satisfied |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-05 | Step 0 complete | 78 deep imports / 17 files / 37 modules / 97 symbols inventoried |
| 2026-09-05 | Step 1 complete | Additive facade re-exports in `src/index.ts`; all 97 symbols covered; typecheck green |
| 2026-09-05 | Step 2 complete | `tests/unit/index-exports.test.ts` (3 tests) green; full `npm test` green (120 files, 2136 tests); extension tree unchanged |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

