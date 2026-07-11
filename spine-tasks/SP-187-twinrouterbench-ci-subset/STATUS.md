# SP-187: TwinRouterBench CI-Sized Corpus Subset — Status

**Current Step:** 2
**Status:** 🟡 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Generate and vendor subset

**Status:** ✅ Complete

- [x] Vendor ≤50-record subset under tests/eval/corpus/twinrouterbench/
- [x] Prefer code/tool workloads
- [x] Checksums + regenerate command in PROVENANCE.md
- [x] Documents validate via adapter

## Step 2: Offline unit coverage

**Status:** 🟡 In Progress

- [ ] Corpus loads/scores offline
- [ ] Size-bound assertion
- [ ] Sample fixtures still green

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract testCommand
- [ ] Harness on corpus path
- [ ] Full npm test + coverage ≥77%

---

## Completion Criteria

- [ ] Bounded subset vendored
- [ ] Checksums documented
- [ ] Sample fixtures unchanged
- [ ] Fixtures tree not polluted
- [ ] Gate thresholds untouched

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine-owned after .DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Amendment 1: `ci-subset.json` is the must-change delivery artifact; PROVENANCE.md already exists from SP-186 | Update PROVENANCE with subset checksums/size; do not treat directory creation as the deliverable |
| 2026-07-10 | Pinchbench rows use multimodal `messages[].content` arrays | Converter flattens text parts for hashing; required for stratified CI subset |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | Step 1 started | Plan review skipped by engine; generating ≤50-record CI subset preferring code/tool workloads |
| 2026-07-10 | Step 1 complete | Vendored `ci-subset.json` (50 records, SHA-256 ec0b1e70…); PROVENANCE updated; adapter load OK |
| 2026-07-10 | Step 2 started | Adding offline corpus load + size-bound unit tests |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

2026-07-10: Amendment 1 — contract redirected to `ci-subset.json` (PROVENANCE.md pre-landed by SP-186).
