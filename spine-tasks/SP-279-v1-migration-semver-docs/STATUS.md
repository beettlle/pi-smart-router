# SP-279 — 1.0 migration guide and SemVer stability README pass. — Status

**Current Step:** 1
**Status:** In Progress
**Last Updated:** 2026-09-07
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 0: Preflight

**Status:** Complete

- [x] Confirm SP-271/276/264/265 landed behavior

## Step 1: Write migration + README

**Status:** In Progress

- [ ] Create docs/migration-v1.md
- [ ] Update README SemVer / release notes pointers

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Contract testCommand green

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-07 | All four deps Complete: SP-271 shipped behavioral calibration bundle (32 labeled dogfood rows, isotonic ECE 0.0695→0.0208; triage/hydra floors unmet → neutral defaults); SP-276 stage modules + ports + telemetry split landed (router-pipeline.ts 2103→810 lines, monolith test deleted/fragmented); SP-264 engines >=22.19.0 + 4 workflows pinned 22.19.0 (3 auxiliary workflows intentionally left at '22' per its STATUS — documented follow-up); SP-265 scripts/src removed + CI drift guard | Migration doc can document all four accurately |
| 2026-09-07 | README header still says "Current release: v0.16.2" (stale; package.json is 0.22.0) alongside the "may change until 1.0.0" caveat | README pass must fix both: drop the caveat and stop hardcoding a drifting version literal |
| 2026-09-07 | SP-263 peer bump landed (pi-ai ^0.84.4→^0.85.1, minPiVersion 0.80.8→0.85.1) — release context, not a direct dep of this packet | Document pi host floor as raised requirement in migration doc |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-07 | Step 0 complete | Read manifest theme, README SemVer note, dep STATUS files; verified shipped behavior in worktree: config/routing-calibration.json + p-success-weights.json present, src/domain/pipeline/*-stage.ts + src/domain/ports/* present, workflow node pins, scripts/src absent from git (v0.22.0 still had the tree) |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
