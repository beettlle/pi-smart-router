# SP-279 — 1.0 migration guide and SemVer stability README pass. — Status

**Current Step:** 2 (complete)
**Status:** Complete
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

**Status:** Complete

- [x] Create docs/migration-v1.md
- [x] Update README SemVer / release notes pointers

## Step 2: Testing & Verification

**Status:** Complete

- [x] Contract testCommand green

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-07 | 1 | plan | Skipped by engine (engine runs reviews after .DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-07 | All four deps Complete: SP-271 shipped behavioral calibration bundle (32 labeled dogfood rows, isotonic ECE 0.0695→0.0208; triage/hydra floors unmet → neutral defaults); SP-276 stage modules + ports + telemetry split landed (router-pipeline.ts 2103→810 lines, monolith test deleted/fragmented); SP-264 engines >=22.19.0 + 4 workflows pinned 22.19.0 (3 auxiliary workflows intentionally left at '22' per its STATUS — documented follow-up); SP-265 scripts/src removed + CI drift guard | Migration doc can document all four accurately |
| 2026-09-07 | README header still says "Current release: v0.16.2" (stale; package.json is 0.22.0) alongside the "may change until 1.0.0" caveat | README pass must fix both: drop the caveat and stop hardcoding a drifting version literal |
| 2026-09-07 | SP-263 peer bump landed (pi-ai ^0.84.4→^0.85.1, minPiVersion 0.80.8→0.85.1) — release context, not a direct dep of this packet | Document pi host floor as raised requirement in migration doc |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-07 | Step 2 complete | Verification evidence: `npm run typecheck` exit 0; `npm test` exit 0 — 137 test files / 2171 tests passed (11.2s). package.json untouched (git diff clean for it) |
| 2026-09-07 | Step 1 complete | Created docs/migration-v1.md (TL;DR checklist, raised requirements pi≥0.85.1/Node≥22.19.0/scripts-src removal, calibration artifacts + honest floors, pipeline architecture notes, shadow-dogfood↔calibration cross-link, SemVer stability surface, what-1.0-does-NOT-change). README: dropped "may change until 1.0.0" caveat + stale v0.16.2 literal → v1.0 SemVer-stable note (publish-safe, mirrors package.json); added migration-v1.md to Documentation table; cross-linked behavioral path loop |
| 2026-09-07 | Step 0 complete | Read manifest theme, README SemVer note, dep STATUS files; verified shipped behavior in worktree: config/routing-calibration.json + p-success-weights.json present, src/domain/pipeline/*-stage.ts + src/domain/ports/* present, workflow node pins, scripts/src absent from git (v0.22.0 still had the tree) |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
