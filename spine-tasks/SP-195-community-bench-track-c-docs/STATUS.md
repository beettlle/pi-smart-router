# SP-195: Community Bench Track B/C + Docs — Status

**Current Step:** 1
**Status:** 🟡 In Progress
**Last Updated:** 2026-07-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Track B skip + Track C flags

**Status:** 🔵 In Progress

- [x] Track B skip-with-reason
- [x] --llmrouterbench / --full offline
- [x] Unit tests for skip + Track C

## Step 2: README contribute + contact parity

**Status:** ⬜ Not Started

- [ ] Contribute section
- [ ] Maintainer contact matches CLI
- [ ] Cross-links corpus paths

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract testCommand
- [ ] CLI Track A + Track C smoke
- [ ] verify:ci
- [ ] Coverage ≥77%

---

## Completion Criteria

- [ ] Track B skip
- [ ] Track C optional
- [ ] README contribute
- [ ] No full corpus in PR CI
- [ ] Gates untouched
- [ ] #105 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (engine-owned after .DONE) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | `community-bench-report.ts` holds Track B/C Zod schema + default skip reasons; Track C "ran" metrics require a schema extension. Not listed in File Scope May change (authoring gap vs SP-194). Editing as companion to Must-change `community-bench.ts`. | Documented scope companion |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | Step 1 started | Plan review skipped; implementing Track B/C flags |

## Blockers

None.
