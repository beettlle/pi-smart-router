# SP-248: Wire session_end + optional TTL fallback — Status

**Current Step:** 2
**Status:** In Progress
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ✅ Complete

- [x] Confirm SP-247 helper is importable
- [x] Locate pi session-end / dispose lifecycle API

## Step 1: Wire session_end + optional TTL

**Status:** ✅ Complete

- [x] Register session-end handler; call eviction helper
- [x] Optional orphan TTL with documented constant
- [x] Fail open if session id missing

## Step 2: Testing & Verification

**Status:** 🔵 In Progress

- [ ] Tests cover post-end eviction (and TTL if implemented)
- [ ] Contract `testCommand` green
- [ ] #145 closable with SP-247

## Completion Criteria

- [ ] Session teardown wired; #145 closable

## Discoveries

- SP-247 helper `evictInMemorySessionState` lives at `src/api/session-eviction.ts` (also re-exported from `src/index.ts`).
- pi session-end API = `session_shutdown` (ExtensionAPI, `SessionShutdownEvent` reason: quit|reload|new|resume|fork); already registered in `session-lifecycle.ts` — eviction wires into that handler.
