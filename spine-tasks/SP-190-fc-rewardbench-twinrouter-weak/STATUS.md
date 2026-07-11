# SP-190: FC-RewardBench + TwinRouterBench Weak Labels — Status

**Current Step:** 3
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: FC-RewardBench converter + fixture

**Status:** ✅ Complete

- [x] PROVENANCE pin for FC-RewardBench
- [x] ingest-fc-rewardbench-labels.ts
- [x] Tiny CI fixture
- [x] Unit tests

## Step 2: Optional TwinRouterBench weak labels

**Status:** ✅ Complete

- [x] Weak-label converter/path
- [x] Document weakness vs verifier grade
- [x] Fixture or generate-from-corpus test
- [x] Unit test

## Step 3: Testing & Verification

**Status:** 🔄 In Progress

- [ ] Contract testCommand
- [ ] Full npm test
- [ ] Coverage ≥77%

---

## Completion Criteria

- [ ] FC-RewardBench ingest offline
- [ ] Weak-label path present/documented
- [ ] Provenance updated
- [ ] No prompt leakage
- [ ] Full datasets not vendored

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (SP-195 engine-owned) |
| 2026-07-11 | 2 | plan | skipped (SP-195 engine-owned) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | FC-RewardBench HF pin `269929c3329e603e87ed3203de42896cc03ddbf3`, license apache-2.0; preference pairs (chosen/rejected) | Map each pair → two pack rows (correct/incorrect) |
| 2026-07-11 | Extra feature keys with `tool_call` substring fail label-pack taint scan | Stick to P_SUCCESS_FEATURE_NAMES allowlist only |
| 2026-07-11 | twinrouterbench/PROVENANCE.md out of File Scope May change | Cross-link weak-label policy from label-packs/PROVENANCE.md instead |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | start | Step 1 in progress; plan review skipped by engine |
| 2026-07-11 | step1 outcomes | Converter + fixture + tests green (6/6) |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Review Level 1: engine runs plan/code/final reviews after `.DONE` (SP-195).

**Amendment 2026-07-11:** Contract `fileScopeMustChange` redirected to `scripts/ingest-fc-rewardbench-labels.ts` + `tests/unit/ingest-fc-rewardbench-labels.test.ts` (PROVENANCE already landed by SP-189).
