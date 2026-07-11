# SP-187: TwinRouterBench CI-Sized Corpus Subset — Status

**Current Step:** Not Started
**Status:** 🔵 Ready for Execution
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Generate and vendor subset

**Status:** ⬜ Not Started

- [ ] Vendor ≤50-record subset under tests/eval/corpus/twinrouterbench/
- [ ] Prefer code/tool workloads
- [ ] Checksums + regenerate command in PROVENANCE.md
- [ ] Documents validate via adapter

## Step 2: Offline unit coverage

**Status:** ⬜ Not Started

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
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

2026-07-10: Amendment 1 — contract redirected to `ci-subset.json` (PROVENANCE.md pre-landed by SP-186).
