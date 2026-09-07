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

**Status:** In Progress (work done — awaiting plan review)

- [x] Run train-p-success + train-calibration
- [x] Run verify-calibration; record metrics in STATUS

### Metrics (real aggregate: `data/calibration/dogfood-20260714-aggregate.jsonl`, 79 rows)

| Metric | Value |
|--------|-------|
| train-p-success | 32 labeled samples (27 good / 5 bad) → `config/p-success-weights.json`, exit 0 |
| train-calibration | bundle v2 (79 rows) → `config/routing-calibration.json`; p_success 32 / triage 0 / hydra 0 / isotonic 32 |
| Isotonic holdout ECE | raw 0.0695 → calibrated **0.0208** (fit 26 / holdout 6 / 18 knots) |
| Floors | p_success ≥30 **MET** (32); isotonic ≥30 **MET**; triage ≥50 NOT met (defaults kept); hydra ≥100 NOT met (defaults kept) |
| verify-calibration (contract) | **15/15 PASS** (bundle v2, full mode incl. tsc build), exit 0 |
| dry-run packs | SAMPLE_STARVED report-only (13 rows / 10 ECE-eligible < 30), exit 0 |
| `--dry-run-packs --ci-fixtures --enforce-soft-ece` | exit 0 (starved packs never fail — no labels invented) |
| `--skip-embed` subset | 2 passed (release:functional-smoke path) |

Evidence: [`_authoring/release-v1.0.0/calibration-train-note.md`](../_authoring/release-v1.0.0/calibration-train-note.md)

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
| 2026-09-06 | SP-269 counter (`qa/count-labeled-econ.ts`) treats zero-tier as econ (`ECON_TIERS` = zero-tier + economical-cloud): its "31 labeled econ (26g/5b)" + 1 labeled frontier = 32 — exactly the trainer's row set. Metrics agree; no discrepancy. | None — reconciliation documented in evidence note |
| 2026-09-06 | `train-calibration`'s standalone refresh rewrites `config/p-success-weights.json` from the bundle **without** the provenance block; re-running `train-p-success` last restores it (weights identical — deterministic). SP-271 must order accordingly or attach provenance in the bundle refresh. | Handoff note for SP-271 |
| 2026-09-06 | Routing bundle carries no `provenance` key (Zod-validated schema strips it by design); standalone file's provenance is human-readable only. | SP-271 owns shipped README + provenance notes |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Session start | Worker began at Step 0 (preflight) |
| 2026-09-06 | Step 0 | SP-269 floor confirmed: committed aggregate `data/calibration/dogfood-20260714-aggregate.jsonl` (79 rows; 31 labeled econ 26 good/5 bad ≥ 30 floor; 40 unlabeled preserved null). Scripts located: `scripts/train-p-success-weights.ts` (`--input/--output/--calibration-output`), `scripts/train-routing-calibration.ts` (`--input/--output`, default out `config/routing-calibration.json` — untracked, staged for SP-271; also refreshes `config/p-success-weights.json` when p_success floor met), `scripts/verify-routing-calibration.ts` (full mode via `npm run build`; `--skip-embed` vitest subset; `--dry-run-packs --ci-fixtures [--enforce-soft-ece]` soft ECE). Wave plan: SP-271 is wave 4 — artifacts must be committed on lane for handoff |
| 2026-09-06 | Step 1 | Began: train + verify on real aggregate |
| 2026-09-06 | Step 1 | Train path fix: aggregate rows carry no `request_id` (privacy-stripped) — `parseTrainingExportLine` hard-required it, so real aggregates trained **0** samples. Added shared `scripts/lib/contrib-training-samples.ts` (deterministic `aggregate-row-<index>` fallback id; unlabeled rows skipped, never coerced) + unit tests. GitNexus impact pre-edit: LOW (0 upstream callers) |
| 2026-09-06 | Step 1 | Train + verify green: metrics recorded above; artifacts staged on lane for SP-271 (`config/routing-calibration.json` new, `config/p-success-weights.json` superseded synthetic → real dogfood with honest provenance). Provenance fix in `train-p-success-weights.ts` (was hardcoded `task: SP-175` even for dogfood runs; now records `training_input` + SP-175 only for synthetic fixture) |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
