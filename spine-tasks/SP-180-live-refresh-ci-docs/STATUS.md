# SP-180: Live Refresh CI + Operator Docs — Status

**Current Step:** 2
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Monthly / dispatch live-capable refresh

**Status:** ✅ Complete

- [x] Extend workflow scheduled + dispatch for live ingest with fixture fallback
- [x] When live succeeds, update recorded snapshots + profiles in bot PR
- [x] Keep PR-path smoke fixture-only
- [x] Preserve provenance in PR body / artifact

## Step 2: Operator docs + mapper smoke

**Status:** 🔄 In Progress

- [x] README: refresh command, live vs fixture, monthly cadence
- [x] Mapper smoke: fleet ID floors from ingested scores
- [x] Link cadence to workflow schedule

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Scoped vitest + typecheck
- [ ] `routing:verify-benchmark-profiles`
- [ ] Full `npm test`
- [ ] Coverage gate ≥77%
- [ ] Workflow still valid / verify:ci

---

## Completion Criteria

- [x] Live-capable monthly/dispatch refresh with fixture fallback
- [x] PR smoke offline
- [ ] README refresh docs
- [ ] Mapper smoke for ingested floors
- [ ] #100 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine owns reviews after .DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | SP-179 CLI: `--live` / `--recorded` / fixtures default | Workflow uses live+fallback; PR smoke stays fixture-only |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | Step 1 started | Plan review skipped; extending workflow |
| 2026-07-10 | Step 1 complete | Live+fallback refresh committed |
| 2026-07-10 | Step 2 started | README operator docs + mapper smoke |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

(none yet)
