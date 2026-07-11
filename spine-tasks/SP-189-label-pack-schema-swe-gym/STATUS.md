# SP-189: Label Pack Schema + SWE-Gym Ingest — Status

**Current Step:** 2
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Privacy-safe label-pack schema

**Status:** ✅ Complete

- [x] label-pack-schema.ts with reject/taint rules
- [x] load/validate helpers
- [x] Unit tests: accept clean / reject prompt leakage

## Step 2: SWE-Gym pin + converter

**Status:** 🔄 In Progress

- [ ] PROVENANCE.md pin + license
- [ ] ingest-swe-gym-labels.ts with --limit
- [ ] Tiny CI fixture
- [ ] Unit test: synthetic row → valid pack

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract testCommand
- [ ] Full npm test
- [ ] Coverage ≥77%

---

## Completion Criteria

- [x] Schema rejects prompt leakage
- [ ] SWE-Gym converter offline
- [ ] Provenance documented
- [ ] Full corpus not vendored
- [ ] Gates untouched

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (engine-owned SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | Base HF `SWE-Gym/SWE-Gym` is task instances; verifier labels live in `OpenHands-Verifier-Trajectories` (`messages`+`resolved`). Converter accepts verifier-style JSONL and strips messages. | Document both pins in PROVENANCE |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | start | Step 1 in progress; plan review skipped by engine |
| 2026-07-11 | step1 | Schema + unit tests green; advancing to Step 2 |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Review Level 1: engine runs plan/code/final reviews after `.DONE` (SP-195).
