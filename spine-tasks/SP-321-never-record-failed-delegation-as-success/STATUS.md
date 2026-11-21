# SP-321: Never record failed delegation as success; single recordOutcome — Status

**Current Step:** Step 2: Testing & Verification
**Status:** In Progress
**Last Updated:** 2026-11-21
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Complete

- [x] Trace recordOutcome call sites
- [x] Note half-open semantics

### Step 1: Fix recording
**Status:** Complete

- [x] Always pass defined error on failure
- [x] Remove duplicate failover recordOutcome

### Step 2: Testing & Verification
**Status:** In Progress

- [ ] Tests c/d
- [ ] Run Contract testCommand

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-11-21 | `recordOutcome(modelId, undefined)` records success; infra failover currently records the same failure in both `recordDelegateOutcome` and `routeAndDelegate`. | Failed unparseable streams can reset failures/close half-open; one infra attempt can increment failures twice. |
| 2026-11-21 | GitNexus is 38 commits behind and does not index extension-local `recordDelegateOutcome` (UNKNOWN); text search confirmed its sole caller is `delegateWithOutcome`. Indexed `recordOutcome` candidates report at most LOW risk. | Used graph plus required text confirmation for the unindexed symbol. |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-11-21 | Preflight complete | Traced outcome recording and breaker half-open semantics; started Step 1. |
| 2026-11-21 | Step 1 implementation complete | Shared the failover error resolver with failed outcome recording, added a defined fallback, and removed duplicate infra recording. |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

