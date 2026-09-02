# SP-248: Wire session_end + optional TTL fallback — Status

**Current Step:** 0
**Status:** Not Started
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ⬜ Not Started

- [ ] Confirm SP-247 helper is importable
- [ ] Locate pi session-end / dispose lifecycle API

## Step 1: Wire session_end + optional TTL

**Status:** ⬜ Not Started

- [ ] Register session-end handler; call eviction helper
- [ ] Optional orphan TTL with documented constant
- [ ] Fail open if session id missing

## Step 2: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Tests cover post-end eviction (and TTL if implemented)
- [ ] Contract `testCommand` green
- [ ] #145 closable with SP-247

## Completion Criteria

- [ ] Session teardown wired; #145 closable

## Discoveries

- (none yet)
