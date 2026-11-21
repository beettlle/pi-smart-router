# SP-321: Never record failed delegation as success; single recordOutcome — Status

**Current Step:** Complete
**Status:** Complete
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
**Status:** Complete

- [x] Tests c/d
- [x] Run Contract testCommand

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
| 2026-11-21 | Thrown-stream catch still records `{ code: 'STREAM_DELEGATION_ERROR' }`, which `isInfraError` does not count. | Documented handoff to SP-322's new model failure counter, as permitted by the task; no parser or counter scope expansion here. |
| 2026-11-21 | Stet returned three false positives about optional provider-error fields and removing the duplicate recording. | Dismissed as false positives: typecheck proves the shape valid, and `delegateWithOutcome` records before `selectFailover` receives the explicit failed-model exclusion. |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-11-21 | Preflight complete | Traced outcome recording and breaker half-open semantics; started Step 1. |
| 2026-11-21 | Step 1 implementation complete | Shared the failover error resolver with failed outcome recording, added a defined fallback, and removed duplicate infra recording. |
| 2026-11-21 | Regression tests added | Closed and half-open unparseable-failure guards plus single infra failure counting; extension 99/99 and typecheck green. |
| 2026-11-21 | Contract green | Exact Contract testCommand passed: typecheck, extension 99/99, and zero active stet findings. |
| 2026-11-21 | Coverage green | `npm run coverage:check`: 154 files / 2623 tests passed; 91.98% lines overall, 90.18% delegate-stream, 86.04% route-and-delegate. |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

