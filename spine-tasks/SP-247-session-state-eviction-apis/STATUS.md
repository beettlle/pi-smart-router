# SP-247: Session-state eviction APIs + unit tests — Status

**Current Step:** 0
**Status:** Not Started
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ⬜ Not Started

- [ ] Read #145 + existing `LifecycleHookState` / `ExecutionLedger.clear`
- [ ] Confirm no existing `session_end` eviction path

## Step 1: Eviction APIs + helper

**Status:** ⬜ Not Started

- [ ] Implement `LifecycleHookState.evict(sessionId)`
- [ ] Add helper that clears ledger + lifecycle + optional `sessionRouting` map for one id
- [ ] Export helper if needed for extension import in SP-248

## Step 2: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Unit tests: after `evict`/`clear`/helper, session keys absent
- [ ] Contract `testCommand` green
- [ ] `npm run typecheck` clean

## Completion Criteria

- [ ] Eviction APIs + helper landed with unit coverage
- [ ] Partial #145 (wire remains SP-248)

## Discoveries

- (none yet)
