# SP-255 — Public package facade exports for extension needs — Status

**Current Step:** Step 1: Facade exports
**Status:** In Progress
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

**Status:** In Progress

- [ ] Re-export required symbols
- [ ] STATUS notes facade shape

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] index-exports tests green
- [ ] Extension tree unchanged

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-05 | Inventory: 78 deep `../../../src/` imports across 17 extension files; 37 src modules, 97 distinct symbols; 8 already exported from `src/index.ts` (ModelProfile, RoutingDecision, GatewayDispatchOptions, PiExtensionHooks, RouterHandle, createRouterFromFleet, LifecycleHookState, evictInMemorySessionState) | Facade must add ~89 re-exports |
| 2026-09-05 | Facade shape: additive grouped re-exports directly in `src/index.ts` (no separate `src/api/facade.ts`); no new factory — existing `createRouter*` exports unchanged | Single public surface; SP-256 migrates extension imports to `pi-smart-router` |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

