# SP-271 — Ship checked-in routing-calibration.json and supersede synthetic weights when floors met. — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-09-07
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Confirm SP-270 verify metrics
- [x] Decide ship vs operator-local with rationale

## Step 1: Ship artifacts + README

**Status:** Complete

- [x] Commit routing-calibration.json with provenance
- [x] Update README behavioral-first path
- [x] Supersede synthetic weights if floors met

### Step 1 detail

- **Bundle** `config/routing-calibration.json` (v2, 79 rows) carries a top-level `provenance` block (source `operator_export`, training input, floors-met report, SP-270/271 attribution). Zod loaders strip unknown keys by design (verified: `routing:verify-calibration` **15/15 PASS** with the block present); canonical provenance also lives in README + `spine-tasks/_authoring/release-v1.0.0/calibration-train-note.md`.
- **.git/info/exclude** carried a `config/routing-calibration.json` entry (kept SP-270's local artifact untracked). Removed that single line to allow the must-change commit; no tracked file affected.
- **README** behavioral-first updates: "Provenance today (behavioral-first, v1.0.0)" replaces the synthetic-interim paragraph; SP-206 status marked resolved-by-#110 (SP-268–SP-271); "Isotonic gap" → "Isotonic calibration (shipped since v1.0.0)"; stale synthetic-regen comment flagged as fixture-demo-only.
- **Supersede status:** synthetic SP-175 weights already superseded by SP-270's merged `config/p-success-weights.json` (32-sample dogfood, provenance intact — regenerated weights were byte-identical, date-only diff reverted). Bundle additionally ships trained isotonic. Triage/hydra floors NOT met → neutral defaults kept and documented.
- **Test hermeticity (documented scope note, Step 0):** pinned `routingCalibrationPath` in 9 affected tests across 3 files following the existing pattern in `router-pipeline-expected-cost.test.ts`. Full suite **2171/2171 green with the bundle present**; typecheck clean. GitNexus detect_changes: low risk, 0 affected processes; no src/ symbols changed.

## Step 2: Testing & Verification

**Status:** Complete (operator land-loop 2026-09-07 — foreground contract)

- [x] Contract testCommand green — `npm run routing:verify-calibration` 15/15 PASS; `npm run release:check` EXIT 0 (137 test files / release-gates PASS)

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-07 | 0 | plan | skipped in-worker (engine runs post-.DONE, SP-195) |
| 2026-09-07 | 1 | plan | skipped in-worker (engine runs post-.DONE, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-07 | SP-270's bundle was never committed to any branch; regenerated on this lane from `data/calibration/dogfood-20260714-aggregate.jsonl` — metrics byte-identical (15/15 verify, 32/32 samples, ECE 0.0208) | Bundle authored fresh here |
| 2026-09-07 | `train-calibration` strips the standalone weights' provenance block; re-ran `train-p-success` last per SP-270 handoff, then reverted the date-only diff to keep the merged SP-270 artifact | p-success-weights.json unchanged |
| 2026-09-07 | 9 tests fail with bundle present (test isolation gap; SP-270 handoff) — pin `routingCalibrationPath` in 3 test files to keep `release:check` green | Documented scope note in Step 0 |
| 2026-09-07 | `.git/info/exclude` had a `config/routing-calibration.json` entry blocking the must-change commit; removed that single line (git-local metadata, not a tracked file) | Bundle trackable |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-07 | Step 0 started | read SP-270 STATUS + train note, manifest, config examples |
| 2026-09-07 | train-calibration rerun | bundle v2 regenerated, verify 15/15 PASS |
| 2026-09-07 | full suite with bundle | 9 failed / 2162 passed — matches SP-270's documented failure set (now in SP-277/278 fragmented files) |
| 2026-09-07 | Step 0 plan review | skipped in-worker (SP-195); Step 0 complete |
| 2026-09-07 | Step 1 verification | verify-calibration 15/15; typecheck clean; full suite 2171/2171 with bundle present |
| 2026-09-07 | Operator Step 2 contract | Foreground `routing:verify-calibration && release:check` green; prior worker_done_missing was mid-verify:ci backgrounding |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
