# SP-269 — Aggregate dogfood exports meeting sample floors for calibration. — Status

**Current Step:** 2
**Status:** In Progress
**Last Updated:** 2026-09-06
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Confirm exports available from SP-267
- [x] Confirm aggregate command

## Step 1: Aggregate

**Status:** Complete

- [x] Run calibration-aggregate
- [x] Write counts to release-v1.0.0 artifact note

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Contract testCommand green
- [ ] No invented labels

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
| 2026-09-06 | Session start | Worker resumed from Step 0 |
| 2026-09-06 | Step 0 | SP-267 exports confirmed: 5 telemetry-contrib snapshots in operator main checkout `.pi-smart-router/exports/` (gitignored); latest `telemetry-contrib-2026-07-14T23-04-27-988Z.json` = 79 rows, cumulative (union 80). Aggregate command confirmed: `npm run routing:calibration-aggregate -- --contrib-dir` (README + dogfood protocol). Raw `dataset-*.jsonl` rows contain reject/taunt keys (`prompt_fingerprint`, `prompt_length_chars`, `message_count`) — telemetry-contrib is the correct aggregate input |
| 2026-09-06 | Step 1 | Aggregate run on latest snapshot → `data/calibration/dogfood-20260714-aggregate.jsonl` (79 rows accepted, exit 0; request_id/pepper stripped, proxies derived). **Sample counts: total 79; zero-tier 39 / economical-cloud 32 / frontier-cloud 8; labeled_econ 31 (good 26 / bad 5) — floor ≥30 MET** (count-labeled-econ exit 0); unlabeled_econ 40 (not fabricated); frontier_labeled 1. Cross-check: matches SP-267 operator count (31) on same-window dataset export. Note written to `spine-tasks/_authoring/release-v1.0.0/calibration-aggregate-note.md` |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
