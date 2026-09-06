# SP-270 — Train P(success) + isotonic calibration and verify scripts. — Status

**Current Step:** 1
**Status:** In Progress
**Last Updated:** 2026-09-06
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Confirm SP-269 sample floor
- [x] Locate train/verify scripts

## Step 1: Train + verify

**Status:** Not Started

- [ ] Run train-p-success + train-calibration
- [ ] Run verify-calibration; record metrics in STATUS

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
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Session start | Worker began at Step 0 (preflight) |
| 2026-09-06 | Step 0 | SP-269 floor confirmed: committed aggregate `data/calibration/dogfood-20260714-aggregate.jsonl` (79 rows; 31 labeled econ 26 good/5 bad ≥ 30 floor; 40 unlabeled preserved null). Scripts located: `scripts/train-p-success-weights.ts` (`--input/--output/--calibration-output`), `scripts/train-routing-calibration.ts` (`--input/--output`, default out `config/routing-calibration.json` — untracked, staged for SP-271; also refreshes `config/p-success-weights.json` when p_success floor met), `scripts/verify-routing-calibration.ts` (full mode via `npm run build`; `--skip-embed` vitest subset; `--dry-run-packs --ci-fixtures [--enforce-soft-ece]` soft ECE). Wave plan: SP-271 is wave 4 — artifacts must be committed on lane for handoff |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
