# SP-247: Session-state eviction APIs + unit tests — Status

**Current Step:** 2
**Status:** Complete
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ✅ Complete

- [x] Read #145 + existing `LifecycleHookState` / `ExecutionLedger.clear`
- [x] Confirm no existing `session_end` eviction path

## Step 1: Eviction APIs + helper

**Status:** ✅ Complete

- [x] Implement `LifecycleHookState.evict(sessionId)`
- [x] Add helper that clears ledger + lifecycle + optional `sessionRouting` map for one id
- [x] Export helper if needed for extension import in SP-248

## Step 2: Testing & Verification

**Status:** ✅ Complete

- [x] Unit tests: after `evict`/`clear`/helper, session keys absent
- [x] Contract `testCommand` green
- [x] `npm run typecheck` clean

## Completion Criteria

- [x] Eviction APIs + helper landed with unit coverage
- [x] Partial #145 (wire remains SP-248)

## Discoveries

- `LifecycleHookState` only consumes one-shot flags; no key-delete API. Adding `evict()` + `has()` (testability).
- `ExecutionLedger.clear(sessionId)` already present; test gap = unknown-id no-op + other sessions untouched.
- No `session_end`/TTL eviction path exists in `src/` or `.pi/extensions/smart-router/` — confirmed.
- Impact analysis (gitnexus): `LifecycleHookState` upstream = LOW risk, 2 direct dependents (`createPiRouterMiddleware`, `src/index.ts`).
- Helper placed at `src/api/session-eviction.ts` (api layer may depend on domain ledger + middleware state).
- Verification: `npm run typecheck` clean; contract vitest files 19/19 green; full suite 119 files / 2104 tests green.
- gitnexus detect_changes: low risk, no affected execution processes.
