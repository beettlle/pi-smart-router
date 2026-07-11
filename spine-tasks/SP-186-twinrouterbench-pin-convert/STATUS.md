# SP-186: TwinRouterBench Pin + Convert Script — Status

**Current Step:** 1
**Status:** 🟡 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Pin upstream + provenance

**Status:** 🔄 In Progress (outcomes done; awaiting plan-review / commit)

- [x] Pin commit/tag + license in PROVENANCE.md
- [x] Document upstream fields + hashing policy
- [x] Document tier map + frozen catalog model IDs

## Step 2: Converter CLI

**Status:** ⬜ Not Started

- [ ] ingest-twinrouterbench-corpus.ts with --limit
- [ ] Skip unmappable rows; no invented labels
- [ ] Unit test: synthetic row → loadTwinRouterBenchStaticTrack

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract testCommand
- [ ] Full npm test
- [ ] Coverage ≥77%

---

## Completion Criteria

- [ ] Pin + license documented
- [ ] Converter produces valid static-track JSON
- [ ] Tier map explicit
- [ ] Full corpus not vendored
- [ ] Gate thresholds untouched

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Upstream pin `430acecac71141de77afd8e5e13690d236d58e93` (main @ 2026-07-10); Apache-2.0; 970 jsonl rows; tiers low/mid/mid_high/high; no `workload` field — use `benchmark`+`scenario`. | Document in PROVENANCE; map scenario as workload proxy. |
| 2026-07-10 | HF mirror `Amorph/TwinRouterBench` revision `c2907f006455d9d3b4bf69472a527536c7baa195` (2026-05-23) — older than git pin; prefer git commit for SP-186. | Cite both; pin git SHA as authoritative. |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | Start Step 1 | Plan review skipped by engine; begin PROVENANCE.md |
| 2026-07-10 | Step 1 outcomes | PROVENANCE.md written with pin, fields, hashing, tier map |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Review Level 1: in-worker plan review spawn blocked (SP-195); engine runs reviews after `.DONE`.
